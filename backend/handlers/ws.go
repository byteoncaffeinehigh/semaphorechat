package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"antares-chat/backend/db"
	"antares-chat/backend/middleware"
	"antares-chat/backend/models"
	wsHub "antares-chat/backend/ws"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type WSHandler struct {
	store     *db.Store
	hub       *wsHub.Hub
	jwtSecret string
}

func NewWSHandler(store *db.Store, hub *wsHub.Hub, jwtSecret string) *WSHandler {
	return &WSHandler{store: store, hub: hub, jwtSecret: jwtSecret}
}

// GET /ws?token=<jwt>
func (h *WSHandler) Handle(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	claims := &middleware.Claims{}
	t, err := jwt.ParseWithClaims(token, claims, func(tok *jwt.Token) (any, error) {
		if _, ok := tok.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !t.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}

	userID := claims.UserID
	email := claims.Email

	client := wsHub.NewClient(userID, conn, h.hub, h.makeHandler(userID))
	h.hub.Register(client)

	go func() {
		ctx := context.Background()
		h.store.SetPresence(ctx, userID, true)
		h.broadcastPresence(ctx, userID, email, true)

		client.Run() // blocks until disconnected

		h.store.SetPresence(ctx, userID, false)
		h.broadcastPresence(ctx, userID, email, false)
	}()
}

func (h *WSHandler) makeHandler(userID string) func(string, wsHub.ClientMsg) {
	return func(_ string, msg wsHub.ClientMsg) {
		ctx := context.Background()
		switch msg.Type {
		case "typing":
			var data struct {
				ChatID string `json:"chatId"`
				WPM    int    `json:"wpm"`
				Active bool   `json:"active"`
			}
			if err := json.Unmarshal(msg.Data, &data); err != nil {
				return
			}
			user, err := h.store.GetUserByID(ctx, userID)
			if err != nil {
				return
			}
			memberIDs, _ := h.store.GetChatMemberIDs(ctx, data.ChatID)
			h.hub.SendToUsers(memberIDs, userID, models.WSMessage{
				Type: "typing",
				Data: models.WSTypingEvent{
					ChatID: data.ChatID,
					Email:  user.Email,
					WPM:    data.WPM,
					Active: data.Active,
					TS:     time.Now().UnixMilli(),
				},
			})

		case "mark_read":
			var data struct {
				ChatID string `json:"chatId"`
			}
			if err := json.Unmarshal(msg.Data, &data); err != nil {
				return
			}
			h.store.ResetUnread(ctx, data.ChatID, userID)
			if chat, err := h.store.GetChat(ctx, data.ChatID); err == nil {
				h.hub.SendToUser(userID, models.WSMessage{
					Type: "chat_update",
					Data: models.WSChatUpdateEvent{Chat: *chat},
				})
			}
		}
	}
}

func (h *WSHandler) broadcastPresence(ctx context.Context, userID, email string, online bool) {
	user, _ := h.store.GetUserByID(ctx, userID)
	chats, _ := h.store.GetUserChats(ctx, userID)
	notified := map[string]bool{}
	for _, chat := range chats {
		memberIDs, _ := h.store.GetChatMemberIDs(ctx, chat.ID)
		for _, mid := range memberIDs {
			if mid == userID || notified[mid] {
				continue
			}
			notified[mid] = true
			var lastSeen *time.Time
			if user != nil {
				lastSeen = user.LastSeen
			}
			h.hub.SendToUser(mid, models.WSMessage{
				Type: "presence",
				Data: models.WSPresenceEvent{
					Email:    email,
					IsOnline: online,
					LastSeen: lastSeen,
				},
			})
		}
	}
}
