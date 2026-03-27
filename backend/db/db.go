package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"antares-chat/backend/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func Init(dsn string) (*Store, error) {
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.New: %w", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("db ping: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

// ─── Users ───────────────────────────────────────────────────────────────────

func (s *Store) CreateUser(ctx context.Context, email, passwordHash, googleID, displayName, photoURL string) (*models.User, error) {
	var u models.User
	var dn, pu, gid *string
	if displayName != "" {
		dn = &displayName
	}
	if photoURL != "" {
		pu = &photoURL
	}
	if googleID != "" {
		gid = &googleID
	}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, google_id, display_name, photo_url)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (email) DO UPDATE SET
			password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
			google_id     = COALESCE(EXCLUDED.google_id,     users.google_id),
			photo_url     = COALESCE(EXCLUDED.photo_url,     users.photo_url)
		RETURNING id, email, display_name, photo_url, is_online, last_seen, created_at`,
		email, nullStr(passwordHash), gid, dn, pu,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.PhotoURL, &u.IsOnline, &u.LastSeen, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	return s.scanUser(s.pool.QueryRow(ctx, `
		SELECT id, email, display_name, photo_url, is_online, last_seen, created_at
		FROM users WHERE email = $1`, email))
}

func (s *Store) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	return s.scanUser(s.pool.QueryRow(ctx, `
		SELECT id, email, display_name, photo_url, is_online, last_seen, created_at
		FROM users WHERE id = $1`, id))
}

func (s *Store) GetPasswordHash(ctx context.Context, email string) (string, string, error) {
	var id, hash string
	err := s.pool.QueryRow(ctx,
		`SELECT id, COALESCE(password_hash,'') FROM users WHERE email = $1`, email,
	).Scan(&id, &hash)
	return id, hash, err
}

func (s *Store) GetGoogleUser(ctx context.Context, googleID string) (*models.User, error) {
	return s.scanUser(s.pool.QueryRow(ctx, `
		SELECT id, email, display_name, photo_url, is_online, last_seen, created_at
		FROM users WHERE google_id = $1`, googleID))
}

func (s *Store) UpdateUser(ctx context.Context, id, displayName, photoURL string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE users SET display_name = $1, photo_url = CASE WHEN $2 = '' THEN photo_url ELSE $2 END WHERE id = $3`,
		displayName, photoURL, id)
	return err
}

func (s *Store) SetPresence(ctx context.Context, id string, online bool) error {
	if online {
		_, err := s.pool.Exec(ctx,
			`UPDATE users SET is_online = true WHERE id = $1`, id)
		return err
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1`, id)
	return err
}

func (s *Store) scanUser(row pgx.Row) (*models.User, error) {
	var u models.User
	err := row.Scan(&u.ID, &u.Email, &u.DisplayName, &u.PhotoURL, &u.IsOnline, &u.LastSeen, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ─── Chats ───────────────────────────────────────────────────────────────────

func (s *Store) GetUserChats(ctx context.Context, userID string) ([]models.Chat, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.created_at,
		       array_agg(u.email ORDER BY u.email)         AS users,
		       json_object_agg(u2.email, cm2.unread_count) AS unread_counts,
		       json_object_agg(u3.email, cm3.last_read_at) AS last_read
		FROM chats c
		JOIN chat_members cm  ON cm.chat_id = c.id AND cm.user_id = $1
		JOIN chat_members cm2 ON cm2.chat_id = c.id
		JOIN users u          ON u.id = cm2.user_id
		JOIN chat_members cm3 ON cm3.chat_id = c.id
		JOIN users u2         ON u2.id = cm2.user_id
		JOIN users u3         ON u3.id = cm3.user_id
		GROUP BY c.id
		ORDER BY c.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return s.scanChats(rows)
}

func (s *Store) GetChat(ctx context.Context, chatID string) (*models.Chat, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.created_at,
		       array_agg(u.email ORDER BY u.email)         AS users,
		       json_object_agg(u2.email, cm2.unread_count) AS unread_counts,
		       json_object_agg(u3.email, cm3.last_read_at) AS last_read
		FROM chats c
		JOIN chat_members cm  ON cm.chat_id = c.id
		JOIN chat_members cm2 ON cm2.chat_id = c.id
		JOIN chat_members cm3 ON cm3.chat_id = c.id
		JOIN users u          ON u.id = cm2.user_id
		JOIN users u2         ON u2.id = cm2.user_id
		JOIN users u3         ON u3.id = cm3.user_id
		WHERE c.id = $1
		GROUP BY c.id`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	chats, err := s.scanChats(rows)
	if err != nil || len(chats) == 0 {
		return nil, err
	}
	return &chats[0], nil
}

func (s *Store) ChatExists(ctx context.Context, userID1, userID2 string) (string, error) {
	var chatID string
	err := s.pool.QueryRow(ctx, `
		SELECT cm1.chat_id FROM chat_members cm1
		JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id AND cm2.user_id = $2
		WHERE cm1.user_id = $1
		LIMIT 1`, userID1, userID2).Scan(&chatID)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return chatID, err
}

func (s *Store) CreateChat(ctx context.Context, userID1, userID2 string) (*models.Chat, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint

	var chatID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO chats DEFAULT VALUES RETURNING id`,
	).Scan(&chatID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)`,
		chatID, userID1, userID2,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetChat(ctx, chatID)
}

func (s *Store) GetChatMemberIDs(ctx context.Context, chatID string) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT user_id FROM chat_members WHERE chat_id = $1`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func (s *Store) GetChatMemberEmails(ctx context.Context, chatID string) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT u.email FROM users u
		JOIN chat_members cm ON cm.user_id = u.id
		WHERE cm.chat_id = $1`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var emails []string
	for rows.Next() {
		var e string
		if err := rows.Scan(&e); err != nil {
			return nil, err
		}
		emails = append(emails, e)
	}
	return emails, nil
}

func (s *Store) IsChatMember(ctx context.Context, chatID, userID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM chat_members WHERE chat_id=$1 AND user_id=$2)`,
		chatID, userID,
	).Scan(&ok)
	return ok, err
}

func (s *Store) IncrementUnread(ctx context.Context, chatID, recipientID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE chat_members SET unread_count = unread_count + 1
		 WHERE chat_id = $1 AND user_id = $2`, chatID, recipientID)
	return err
}

func (s *Store) ResetUnread(ctx context.Context, chatID, userID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE chat_members SET unread_count = 0, last_read_at = NOW()
		 WHERE chat_id = $1 AND user_id = $2`, chatID, userID)
	return err
}

func (s *Store) scanChats(rows pgx.Rows) ([]models.Chat, error) {
	var chats []models.Chat
	for rows.Next() {
		var c models.Chat
		var usersArr []string
		var unreadJSON, lastReadJSON []byte
		if err := rows.Scan(&c.ID, &c.CreatedAt, &usersArr, &unreadJSON, &lastReadJSON); err != nil {
			return nil, err
		}
		c.Users = usersArr
		c.UnreadCounts = make(map[string]int)
		json.Unmarshal(unreadJSON, &c.UnreadCounts)
		c.LastRead = make(map[string]*time.Time)
		json.Unmarshal(lastReadJSON, &c.LastRead)
		chats = append(chats, c)
	}
	return chats, rows.Err()
}

// ─── Messages ────────────────────────────────────────────────────────────────

func (s *Store) GetMessages(ctx context.Context, chatID string, limit, offset int) ([]models.Message, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, chat_id, sender_email, COALESCE(sender_photo,''),
		       message, image_data, audio_data, audio_duration,
		       is_command, is_encoded, created_at
		FROM messages
		WHERE chat_id = $1
		ORDER BY created_at ASC
		LIMIT $2 OFFSET $3`, chatID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return s.scanMessages(rows)
}

func (s *Store) SendMessage(ctx context.Context,
	chatID, senderID, senderEmail, senderPhoto string,
	message, imageData, audioData *string,
	audioDuration *int,
	isCommand, isEncoded bool,
) (*models.Message, error) {
	var m models.Message
	var msgText, imgData, audData *string
	var audDur *int
	msgText = message
	imgData = imageData
	audData = audioData
	audDur = audioDuration

	err := s.pool.QueryRow(ctx, `
		INSERT INTO messages
		  (chat_id, sender_id, sender_email, sender_photo,
		   message, image_data, audio_data, audio_duration,
		   is_command, is_encoded)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id, chat_id, sender_email, COALESCE(sender_photo,''),
		          message, image_data, audio_data, audio_duration,
		          is_command, is_encoded, created_at`,
		chatID, senderID, senderEmail, nullStr(senderPhoto),
		msgText, imgData, audData, audDur,
		isCommand, isEncoded,
	).Scan(
		&m.ID, &m.ChatID, &m.User, &m.PhotoURL,
		&m.Message, &m.ImageURL, &m.AudioURL, &m.AudioDuration,
		&m.IsCommand, &m.IsEncoded, &m.Timestamp,
	)
	return &m, err
}

func (s *Store) scanMessages(rows pgx.Rows) ([]models.Message, error) {
	var msgs []models.Message
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(
			&m.ID, &m.ChatID, &m.User, &m.PhotoURL,
			&m.Message, &m.ImageURL, &m.AudioURL, &m.AudioDuration,
			&m.IsCommand, &m.IsEncoded, &m.Timestamp,
		); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// ─── Calls ───────────────────────────────────────────────────────────────────

func (s *Store) UpsertCall(ctx context.Context,
	chatID, callerID, calleeID, callerEmail, calleeEmail, status string,
	offer *models.RTCSDP,
) (*models.Call, error) {
	offerJSON, _ := json.Marshal(offer)
	if offer == nil {
		offerJSON = nil
	}

	var c models.Call
	var offerRaw, answerRaw []byte
	err := s.pool.QueryRow(ctx, `
		INSERT INTO calls (chat_id, caller_id, callee_id, caller_email, callee_email, status, offer)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (chat_id) DO UPDATE SET
			caller_id    = EXCLUDED.caller_id,
			callee_id    = EXCLUDED.callee_id,
			caller_email = EXCLUDED.caller_email,
			callee_email = EXCLUDED.callee_email,
			status       = EXCLUDED.status,
			offer        = COALESCE(EXCLUDED.offer, calls.offer),
			answer       = NULL,
			updated_at   = NOW()
		RETURNING id, chat_id, caller_email, callee_email, status, offer, answer, created_at, updated_at`,
		chatID, callerID, calleeID, callerEmail, calleeEmail, status, offerJSON,
	).Scan(&c.ID, &c.ChatID, &c.CallerEmail, &c.CalleeEmail, &c.Status,
		&offerRaw, &answerRaw, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	parseSDPFields(&c, offerRaw, answerRaw)
	return &c, nil
}

func (s *Store) UpdateCall(ctx context.Context, chatID, status string, answer *models.RTCSDP) (*models.Call, error) {
	answerJSON, _ := json.Marshal(answer)
	if answer == nil {
		answerJSON = nil
	}
	var c models.Call
	var offerRaw, answerRaw []byte
	err := s.pool.QueryRow(ctx, `
		UPDATE calls SET
			status     = COALESCE($2, status),
			answer     = COALESCE($3::jsonb, answer),
			updated_at = NOW()
		WHERE chat_id = $1
		RETURNING id, chat_id, caller_email, callee_email, status, offer, answer, created_at, updated_at`,
		chatID, nullStr(status), answerJSON,
	).Scan(&c.ID, &c.ChatID, &c.CallerEmail, &c.CalleeEmail, &c.Status,
		&offerRaw, &answerRaw, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	parseSDPFields(&c, offerRaw, answerRaw)
	return &c, nil
}

func (s *Store) GetCall(ctx context.Context, chatID string) (*models.Call, error) {
	var c models.Call
	var offerRaw, answerRaw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, chat_id, caller_email, callee_email, status, offer, answer, created_at, updated_at
		FROM calls WHERE chat_id = $1`, chatID,
	).Scan(&c.ID, &c.ChatID, &c.CallerEmail, &c.CalleeEmail, &c.Status,
		&offerRaw, &answerRaw, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	parseSDPFields(&c, offerRaw, answerRaw)
	return &c, nil
}

func (s *Store) AddCallCandidate(ctx context.Context, callID, userID, side string, candidate any) (*models.CallCandidate, error) {
	raw, _ := json.Marshal(candidate)
	var cc models.CallCandidate
	var candidateRaw []byte
	err := s.pool.QueryRow(ctx, `
		INSERT INTO call_candidates (call_id, user_id, side, candidate)
		VALUES ($1,$2,$3,$4)
		RETURNING id, call_id, side, candidate, created_at`,
		callID, userID, side, raw,
	).Scan(&cc.ID, &cc.CallID, &cc.Side, &candidateRaw, &cc.CreatedAt)
	if err != nil {
		return nil, err
	}
	json.Unmarshal(candidateRaw, &cc.Candidate)
	return &cc, nil
}

func (s *Store) GetCallCandidates(ctx context.Context, callID, side string) ([]models.CallCandidate, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, call_id, side, candidate, created_at
		FROM call_candidates WHERE call_id=$1 AND side=$2
		ORDER BY created_at ASC`, callID, side)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ccs []models.CallCandidate
	for rows.Next() {
		var cc models.CallCandidate
		var raw []byte
		if err := rows.Scan(&cc.ID, &cc.CallID, &cc.Side, &raw, &cc.CreatedAt); err != nil {
			return nil, err
		}
		json.Unmarshal(raw, &cc.Candidate)
		ccs = append(ccs, cc)
	}
	return ccs, rows.Err()
}

func (s *Store) DeleteCallCandidates(ctx context.Context, callID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM call_candidates WHERE call_id=$1`, callID)
	return err
}

// ─── Push subscriptions ──────────────────────────────────────────────────────

func (s *Store) SavePushSubscription(ctx context.Context, userID string, sub models.PushSubscription) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (user_id, endpoint) DO UPDATE SET
			p256dh = EXCLUDED.p256dh,
			auth   = EXCLUDED.auth`,
		userID, sub.Endpoint, sub.P256dh, sub.Auth)
	return err
}

func (s *Store) GetPushSubscriptions(ctx context.Context, userID string) ([]models.PushSubscription, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var subs []models.PushSubscription
	for rows.Next() {
		var sub models.PushSubscription
		if err := rows.Scan(&sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}
	return subs, rows.Err()
}

func (s *Store) GetPushSubscriptionsByEmail(ctx context.Context, email string) ([]models.PushSubscription, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT ps.endpoint, ps.p256dh, ps.auth
		FROM push_subscriptions ps
		JOIN users u ON u.id = ps.user_id
		WHERE u.email = $1`, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var subs []models.PushSubscription
	for rows.Next() {
		var sub models.PushSubscription
		if err := rows.Scan(&sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}
	return subs, rows.Err()
}

func (s *Store) DeletePushSubscription(ctx context.Context, userID, endpoint string) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`, userID, endpoint)
	return err
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func parseSDPFields(c *models.Call, offerRaw, answerRaw []byte) {
	if len(offerRaw) > 0 {
		var sdp models.RTCSDP
		if json.Unmarshal(offerRaw, &sdp) == nil {
			c.Offer = &sdp
		}
	}
	if len(answerRaw) > 0 {
		var sdp models.RTCSDP
		if json.Unmarshal(answerRaw, &sdp) == nil {
			c.Answer = &sdp
		}
	}
}

// Unused import guard
var _ = time.Now
