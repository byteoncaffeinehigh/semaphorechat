package handlers

import (
	"net/http"

	"antares-chat/backend/db"
	"antares-chat/backend/middleware"
	"antares-chat/backend/ws"
	"antares-chat/backend/models"
	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	store *db.Store
	hub   *ws.Hub
}

func NewUserHandler(store *db.Store, hub *ws.Hub) *UserHandler {
	return &UserHandler{store: store, hub: hub}
}

// GET /api/me
func (h *UserHandler) GetMe(c *gin.Context) {
	user, err := h.store.GetUserByID(c, middleware.UserIDFrom(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// PUT /api/me
func (h *UserHandler) UpdateMe(c *gin.Context) {
	var body struct {
		DisplayName string `json:"displayName"`
		PhotoURL    string `json:"photoURL"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.store.UpdateUser(c, middleware.UserIDFrom(c), body.DisplayName, body.PhotoURL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}
	user, _ := h.store.GetUserByID(c, middleware.UserIDFrom(c))
	c.JSON(http.StatusOK, user)
}

// GET /api/users?email=xxx
func (h *UserHandler) FindByEmail(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email required"})
		return
	}
	user, err := h.store.GetUserByEmail(c, email)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// POST /api/users/presence  body: { isOnline: bool }
func (h *UserHandler) SetPresence(c *gin.Context) {
	var body struct {
		IsOnline bool `json:"isOnline"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := middleware.UserIDFrom(c)
	if err := h.store.SetPresence(c, userID, body.IsOnline); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	// broadcast presence change to chat partners
	user, _ := h.store.GetUserByID(c, userID)
	chats, _ := h.store.GetUserChats(c, userID)
	notified := map[string]bool{}
	for _, chat := range chats {
		memberIDs, _ := h.store.GetChatMemberIDs(c, chat.ID)
		for _, mid := range memberIDs {
			if mid == userID || notified[mid] {
				continue
			}
			notified[mid] = true
			event := models.WSMessage{
				Type: "presence",
				Data: models.WSPresenceEvent{
					Email:    middleware.EmailFrom(c),
					IsOnline: body.IsOnline,
					LastSeen: user.LastSeen,
				},
			}
			h.hub.SendToUser(mid, event)
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
