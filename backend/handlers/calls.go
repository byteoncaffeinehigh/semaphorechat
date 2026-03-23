package handlers

import (
	"net/http"

	"antares-chat/backend/db"
	"antares-chat/backend/middleware"
	"antares-chat/backend/models"
	"antares-chat/backend/ws"
	"github.com/gin-gonic/gin"
)

type CallHandler struct {
	store *db.Store
	hub   *ws.Hub
}

func NewCallHandler(store *db.Store, hub *ws.Hub) *CallHandler {
	return &CallHandler{store: store, hub: hub}
}

// POST /api/calls/:chatId  — initiate a call (caller)
// body: { calleeEmail, offer: {type, sdp} }
func (h *CallHandler) Initiate(c *gin.Context) {
	chatID := c.Param("chatId")
	userID := middleware.UserIDFrom(c)

	ok, err := h.store.IsChatMember(c, chatID, userID)
	if err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body struct {
		CalleeEmail string       `json:"calleeEmail" binding:"required"`
		Offer       *models.RTCSDP `json:"offer"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	callee, err := h.store.GetUserByEmail(c, body.CalleeEmail)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "callee not found"})
		return
	}

	call, err := h.store.UpsertCall(c,
		chatID, userID, callee.ID,
		middleware.EmailFrom(c), callee.Email,
		"calling", body.Offer,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	// notify callee
	h.hub.SendToUser(callee.ID, models.WSMessage{
		Type: "call_update",
		Data: models.WSCallUpdateEvent{ChatID: chatID, Call: *call},
	})

	c.JSON(http.StatusCreated, call)
}

// PUT /api/calls/:chatId  — update call (answer, status change)
// body: { status?, answer?: {type, sdp} }
func (h *CallHandler) Update(c *gin.Context) {
	chatID := c.Param("chatId")
	userID := middleware.UserIDFrom(c)

	ok, err := h.store.IsChatMember(c, chatID, userID)
	if err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body struct {
		Status string         `json:"status"`
		Answer *models.RTCSDP `json:"answer"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	call, err := h.store.UpdateCall(c, chatID, body.Status, body.Answer)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	// broadcast to both members
	memberIDs, _ := h.store.GetChatMemberIDs(c, chatID)
	h.hub.SendToUsers(memberIDs, "", models.WSMessage{
		Type: "call_update",
		Data: models.WSCallUpdateEvent{ChatID: chatID, Call: *call},
	})

	// clean up candidates when call ends
	if body.Status == "ended" || body.Status == "declined" {
		h.store.DeleteCallCandidates(c, call.ID)
	}

	c.JSON(http.StatusOK, call)
}

// GET /api/calls/:chatId
func (h *CallHandler) Get(c *gin.Context) {
	chatID := c.Param("chatId")
	ok, err := h.store.IsChatMember(c, chatID, middleware.UserIDFrom(c))
	if err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	call, err := h.store.GetCall(c, chatID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active call"})
		return
	}
	c.JSON(http.StatusOK, call)
}

// POST /api/calls/:chatId/candidates  — add ICE candidate
// body: { side: "offer"|"answer", candidate: {...} }
func (h *CallHandler) AddCandidate(c *gin.Context) {
	chatID := c.Param("chatId")
	userID := middleware.UserIDFrom(c)

	ok, err := h.store.IsChatMember(c, chatID, userID)
	if err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body struct {
		Side      string `json:"side" binding:"required"`
		Candidate any    `json:"candidate" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	call, err := h.store.GetCall(c, chatID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active call"})
		return
	}

	cc, err := h.store.AddCallCandidate(c, call.ID, userID, body.Side, body.Candidate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	// send to the other party
	memberIDs, _ := h.store.GetChatMemberIDs(c, chatID)
	h.hub.SendToUsers(memberIDs, userID, models.WSMessage{
		Type: "call_candidate",
		Data: models.WSCallCandidateEvent{
			ChatID:    chatID,
			Side:      cc.Side,
			Candidate: cc.Candidate,
		},
	})

	c.JSON(http.StatusCreated, cc)
}
