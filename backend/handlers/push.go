package handlers

import (
	"encoding/json"
	"net/http"

	"antares-chat/backend/config"
	"antares-chat/backend/db"
	"antares-chat/backend/middleware"
	"antares-chat/backend/models"
	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/gin-gonic/gin"
)

type PushHandler struct {
	store *db.Store
	cfg   *config.Config
}

func NewPushHandler(store *db.Store, cfg *config.Config) *PushHandler {
	return &PushHandler{store: store, cfg: cfg}
}

// POST /api/push/subscribe
// Body mirrors the browser PushSubscription.toJSON() shape:
// { endpoint, keys: { p256dh, auth } }
func (h *PushHandler) Subscribe(c *gin.Context) {
	var body struct {
		Endpoint string `json:"endpoint" binding:"required"`
		Keys     struct {
			P256dh string `json:"p256dh" binding:"required"`
			Auth   string `json:"auth"   binding:"required"`
		} `json:"keys" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sub := models.PushSubscription{
		Endpoint: body.Endpoint,
		P256dh:   body.Keys.P256dh,
		Auth:     body.Keys.Auth,
	}
	if err := h.store.SavePushSubscription(c, middleware.UserIDFrom(c), sub); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// POST /api/notify
// Body: { recipientEmail, senderName, message, link?, isCall? }
func (h *PushHandler) Notify(c *gin.Context) {
	var body struct {
		RecipientEmail string `json:"recipientEmail" binding:"required"`
		SenderName     string `json:"senderName"`
		Message        string `json:"message"`
		Link           string `json:"link"`
		IsCall         bool   `json:"isCall"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.cfg.VAPIDPublicKey == "" || h.cfg.VAPIDPrivateKey == "" {
		c.JSON(http.StatusOK, gin.H{"ok": false, "reason": "vapid not configured"})
		return
	}

	subs, err := h.store.GetPushSubscriptionsByEmail(c, body.RecipientEmail)
	if err != nil || len(subs) == 0 {
		c.JSON(http.StatusOK, gin.H{"ok": false, "reason": "no subscription"})
		return
	}

	payload, _ := json.Marshal(map[string]any{
		"title":  body.SenderName,
		"body":   truncate(body.Message, 120),
		"link":   ifEmpty(body.Link, "/"),
		"isCall": body.IsCall,
	})

	urgency := webpush.UrgencyNormal
	if body.IsCall {
		urgency = webpush.UrgencyHigh
	}

	for _, sub := range subs {
		wpSub := &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys: webpush.Keys{
				P256dh: sub.P256dh,
				Auth:   sub.Auth,
			},
		}
		//nolint:errcheck
		webpush.SendNotification(payload, wpSub, &webpush.Options{
			VAPIDPublicKey:  h.cfg.VAPIDPublicKey,
			VAPIDPrivateKey: h.cfg.VAPIDPrivateKey,
			Subscriber:      h.cfg.VAPIDEmail,
			Urgency:         urgency,
			TTL:             30,
		})
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) > n {
		return string(runes[:n]) + "…"
	}
	return s
}

func ifEmpty(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}
