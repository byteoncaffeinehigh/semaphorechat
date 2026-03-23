package ws

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"antares-chat/backend/models"
	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 45 * time.Second
	maxMsgSize = 10 * 1024 * 1024 // 10 MB (images/audio as data URLs)
)

// Hub maintains all active WS clients, keyed by userID.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*Client]bool // userID -> set of connections
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]map[*Client]bool),
	}
}

// Run is a no-op kept for API compatibility; the hub is lock-based.
func (h *Hub) Run() {}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[c.UserID] == nil {
		h.clients[c.UserID] = make(map[*Client]bool)
	}
	h.clients[c.UserID][c] = true
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.clients[c.UserID]; ok {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, c.UserID)
		}
	}
}

// SendToUser sends a message to all connections of a specific user.
func (h *Hub) SendToUser(userID string, msg models.WSMessage) {
	raw, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	clients := h.clients[userID]
	h.mu.RUnlock()
	for c := range clients {
		select {
		case c.send <- raw:
		default:
			// slow client – drop
		}
	}
}

// SendToUsers sends a message to a list of userIDs, optionally skipping one.
func (h *Hub) SendToUsers(userIDs []string, skipID string, msg models.WSMessage) {
	raw, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	sent := make(map[string]bool)
	for _, uid := range userIDs {
		if uid == skipID || sent[uid] {
			continue
		}
		sent[uid] = true
		for c := range h.clients[uid] {
			select {
			case c.send <- raw:
			default:
			}
		}
	}
}

// IsOnline returns true if the user has at least one active WS connection.
func (h *Hub) IsOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[userID]) > 0
}

// ─── Client ──────────────────────────────────────────────────────────────────

type Client struct {
	UserID string
	conn   *websocket.Conn
	send   chan []byte
	hub    *Hub
	// IncomingMsg is called when we receive a client message (set by handler)
	IncomingMsg func(userID string, msg ClientMsg)
}

type ClientMsg struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

func NewClient(userID string, conn *websocket.Conn, hub *Hub, incoming func(string, ClientMsg)) *Client {
	return &Client{
		UserID:      userID,
		conn:        conn,
		send:        make(chan []byte, 256),
		hub:         hub,
		IncomingMsg: incoming,
	}
}

func (c *Client) Run() {
	go c.writePump()
	c.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMsgSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws read error user=%s: %v", c.UserID, err)
			}
			break
		}
		var msg ClientMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		if msg.Type == "ping" {
			c.send <- mustMarshal(models.WSMessage{Type: "pong"})
			continue
		}
		if c.IncomingMsg != nil {
			c.IncomingMsg(c.UserID, msg)
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func mustMarshal(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
