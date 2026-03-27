package handlers

import (
	"net/http"

	"antares-chat/backend/db"
	"antares-chat/backend/middleware"
	"antares-chat/backend/models"
	"antares-chat/backend/ws"
	"github.com/gin-gonic/gin"
)

type MessageHandler struct {
	store *db.Store
	hub   *ws.Hub
}

func NewMessageHandler(store *db.Store, hub *ws.Hub) *MessageHandler {
	return &MessageHandler{store: store, hub: hub}
}

// GET /api/chats/:id/messages?limit=100&offset=0
func (h *MessageHandler) List(c *gin.Context) {
	chatID := c.Param("id")
	ok, err := h.store.IsChatMember(c, chatID, middleware.UserIDFrom(c))
	if err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	limit := 200
	offset := 0
	msgs, err := h.store.GetMessages(c, chatID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	if msgs == nil {
		msgs = []models.Message{}
	}
	c.JSON(http.StatusOK, msgs)
}

// POST /api/chats/:id/messages
func (h *MessageHandler) Send(c *gin.Context) {
	chatID := c.Param("id")
	userID := middleware.UserIDFrom(c)

	ok, err := h.store.IsChatMember(c, chatID, userID)
	if err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body struct {
		Message       *string `json:"message"`
		ImageURL      *string `json:"imageURL"`
		AudioURL      *string `json:"audioURL"`
		AudioDuration *int    `json:"audioDuration"`
		FileData      *string `json:"fileData"`
		FileName      *string `json:"fileName"`
		FileType      *string `json:"fileType"`
		FileSize      *int    `json:"fileSize"`
		IsCommand     bool    `json:"isCommand"`
		IsEncoded     bool    `json:"isEncoded"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.store.GetUserByID(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	photoURL := ""
	if user.PhotoURL != nil {
		photoURL = *user.PhotoURL
	}

	msg, err := h.store.SendMessage(c,
		chatID, userID, user.Email, photoURL,
		body.Message, body.ImageURL, body.AudioURL, body.AudioDuration,
		body.FileData, body.FileName, body.FileType, body.FileSize,
		body.IsCommand, body.IsEncoded,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	// broadcast to all chat members via WS
	memberIDs, _ := h.store.GetChatMemberIDs(c, chatID)
	event := models.WSMessage{
		Type: "new_message",
		Data: models.WSNewMessageEvent{ChatID: chatID, Message: *msg},
	}
	h.hub.SendToUsers(memberIDs, "", event)

	// increment unread for other members
	if !body.IsCommand {
		for _, mid := range memberIDs {
			if mid != userID {
				h.store.IncrementUnread(c, chatID, mid)
				// send updated chat to recipient
				if chat, err := h.store.GetChat(c, chatID); err == nil {
					h.hub.SendToUser(mid, models.WSMessage{
						Type: "chat_update",
						Data: models.WSChatUpdateEvent{Chat: *chat},
					})
				}
			}
		}
	}

	c.JSON(http.StatusCreated, msg)
}

// PUT /api/chats/:id/read
func (h *MessageHandler) MarkRead(c *gin.Context) {
	chatID := c.Param("id")
	userID := middleware.UserIDFrom(c)
	if err := h.store.ResetUnread(c, chatID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	// send updated chat to self so sidebar unread count clears
	if chat, err := h.store.GetChat(c, chatID); err == nil {
		h.hub.SendToUser(userID, models.WSMessage{
			Type: "chat_update",
			Data: models.WSChatUpdateEvent{Chat: *chat},
		})
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
