package handlers

import (
	"net/http"

	"antares-chat/backend/db"
	"antares-chat/backend/middleware"
	"antares-chat/backend/models"
	"antares-chat/backend/ws"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type ChatHandler struct {
	store *db.Store
	hub   *ws.Hub
}

func NewChatHandler(store *db.Store, hub *ws.Hub) *ChatHandler {
	return &ChatHandler{store: store, hub: hub}
}

// GET /api/chats
func (h *ChatHandler) List(c *gin.Context) {
	chats, err := h.store.GetUserChats(c, middleware.UserIDFrom(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	if chats == nil {
		chats = []models.Chat{}
	}
	c.JSON(http.StatusOK, chats)
}

// GET /api/chats/:id
func (h *ChatHandler) Get(c *gin.Context) {
	chatID := c.Param("id")
	ok, err := h.store.IsChatMember(c, chatID, middleware.UserIDFrom(c))
	if err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	chat, err := h.store.GetChat(c, chatID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, chat)
}

// POST /api/chats  body: { email: string }
func (h *ChatHandler) Create(c *gin.Context) {
	var body struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	myID := middleware.UserIDFrom(c)
	myEmail := middleware.EmailFrom(c)

	if body.Email == myEmail {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot chat with yourself"})
		return
	}

	recipient, err := h.store.GetUserByEmail(c, body.Email)
	if err == pgx.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not registered"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	// check if chat already exists
	existing, err := h.store.ChatExists(c, myID, recipient.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	if existing != "" {
		chat, _ := h.store.GetChat(c, existing)
		c.JSON(http.StatusOK, chat)
		return
	}

	chat, err := h.store.CreateChat(c, myID, recipient.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	// notify recipient via WS
	h.hub.SendToUser(recipient.ID, models.WSMessage{
		Type: "chat_update",
		Data: models.WSChatUpdateEvent{Chat: *chat},
	})

	c.JSON(http.StatusCreated, chat)
}
