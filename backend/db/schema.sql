CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        UNIQUE NOT NULL,
  display_name TEXT,
  photo_url    TEXT,
  password_hash TEXT,
  google_id    TEXT        UNIQUE,
  is_online    BOOLEAN     NOT NULL DEFAULT false,
  last_seen    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id      UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unread_count INT  NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id        UUID        NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id      UUID        NOT NULL REFERENCES users(id),
  sender_email   TEXT        NOT NULL,
  sender_photo   TEXT,
  message        TEXT,
  image_data     TEXT,
  audio_data     TEXT,
  audio_duration INT,
  is_command     BOOLEAN     NOT NULL DEFAULT false,
  is_encoded     BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);

CREATE TABLE IF NOT EXISTS calls (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id      UUID        NOT NULL UNIQUE REFERENCES chats(id) ON DELETE CASCADE,
  caller_id    UUID        NOT NULL REFERENCES users(id),
  callee_id    UUID        NOT NULL REFERENCES users(id),
  caller_email TEXT        NOT NULL,
  callee_email TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'calling',
  offer        JSONB,
  answer       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_candidates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    UUID        NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id),
  side       TEXT        NOT NULL,
  candidate  JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_call ON call_candidates(call_id, side);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);
