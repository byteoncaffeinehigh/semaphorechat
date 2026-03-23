package models

import "time"

type User struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	DisplayName *string    `json:"displayName"`
	PhotoURL    *string    `json:"photoURL"`
	IsOnline    bool       `json:"isOnline"`
	LastSeen    *time.Time `json:"lastSeen"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type Chat struct {
	ID           string                 `json:"id"`
	Users        []string               `json:"users"` // emails
	UnreadCounts map[string]int         `json:"unreadCounts"`
	LastRead     map[string]*time.Time  `json:"lastRead"` // email -> last read timestamp
	CreatedAt    time.Time              `json:"createdAt"`
}

type Message struct {
	ID            string    `json:"id"`
	ChatID        string    `json:"chatId"`
	User          string    `json:"user"`     // sender email (frontend compat)
	PhotoURL      string    `json:"photoURL"` // sender photo
	Message       *string   `json:"message,omitempty"`
	ImageURL      *string   `json:"imageURL,omitempty"`
	AudioURL      *string   `json:"audioURL,omitempty"`
	AudioDuration *int      `json:"audioDuration,omitempty"`
	IsCommand     bool      `json:"isCommand,omitempty"`
	IsEncoded     bool      `json:"isEncoded,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
}

type RTCSDP struct {
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

type Call struct {
	ID          string    `json:"id"`
	ChatID      string    `json:"chatId"`
	CallerEmail string    `json:"caller"`
	CalleeEmail string    `json:"callee"`
	Status      string    `json:"status"`
	Offer       *RTCSDP   `json:"offer,omitempty"`
	Answer      *RTCSDP   `json:"answer,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type CallCandidate struct {
	ID        string    `json:"id"`
	CallID    string    `json:"callId"`
	Side      string    `json:"side"` // "offer" or "answer"
	Candidate any       `json:"candidate"`
	CreatedAt time.Time `json:"createdAt"`
}

type PushSubscription struct {
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

// WebSocket message envelope
type WSMessage struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// WS event payloads
type WSTypingEvent struct {
	ChatID string `json:"chatId"`
	Email  string `json:"userEmail"`
	WPM    int    `json:"wpm"`
	Active bool   `json:"active"`
	TS     int64  `json:"ts"`
}

type WSPresenceEvent struct {
	Email    string     `json:"userEmail"`
	IsOnline bool       `json:"isOnline"`
	LastSeen *time.Time `json:"lastSeen"`
}

type WSNewMessageEvent struct {
	ChatID  string  `json:"chatId"`
	Message Message `json:"message"`
}

type WSCallUpdateEvent struct {
	ChatID string `json:"chatId"`
	Call   Call   `json:"call"`
}

type WSCallCandidateEvent struct {
	ChatID    string `json:"chatId"`
	Side      string `json:"side"`
	Candidate any    `json:"candidate"`
}

type WSChatUpdateEvent struct {
	Chat Chat `json:"chat"`
}
