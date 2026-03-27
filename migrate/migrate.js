/**
 * Migration: Firebase (Firestore + Auth) → PostgreSQL
 *
 * Reads:
 *   - Firebase Auth  → users
 *   - Firestore `users/{uid}`  → displayName, photoURL
 *   - Firestore `chats/{id}`   → users[], unreadCounts, lastRead
 *   - Firestore `chats/{id}/messages` → all messages
 *
 * Writes to PostgreSQL (semaphorechat schema).
 *
 * Setup on server:
 *   npm install firebase-admin pg
 *   export DATABASE_URL="postgres://..."
 *   node migrate.js
 *
 * serviceAccount.json must be in the same directory.
 */

const admin = require("firebase-admin");
const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// ─── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set. Check migrate/.env");
  process.exit(1);
}

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, "serviceAccount.json");
const serviceAccount = require(serviceAccountPath);

// ─── Init ─────────────────────────────────────────────────────────────────────

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const firestore = admin.firestore();
const firebaseAuth = admin.auth();
const pool = new Pool({ connectionString: DATABASE_URL });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function q(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

function toDate(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  return new Date(val);
}

// ─── Step 1: Users ────────────────────────────────────────────────────────────

async function migrateUsers() {
  console.log("\n[1/2] Migrating users...");

  // Load all Firebase Auth users
  const authUsers = [];
  let pageToken;
  do {
    const page = await firebaseAuth.listUsers(1000, pageToken);
    authUsers.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`  Firebase Auth: ${authUsers.length} users`);

  // Load Firestore user docs (extra fields: displayName, photoURL)
  const fsUserMap = {};
  const fsSnap = await firestore.collection("users").get();
  fsSnap.forEach((doc) => { fsUserMap[doc.id] = doc.data(); });
  console.log(`  Firestore users collection: ${fsSnap.size} docs`);

  let ok = 0, skip = 0;

  for (const u of authUsers) {
    const fs = fsUserMap[u.uid] || {};
    const email = u.email || fs.email;

    if (!email) {
      console.warn(`  SKIP uid=${u.uid}: no email`);
      skip++;
      continue;
    }

    const displayName = u.displayName || fs.displayName || null;
    const photoURL    = u.photoURL    || fs.photoURL    || null;
    const googleId    = u.providerData?.find((p) => p.providerId === "google.com")?.uid || null;
    const createdAt   = u.metadata?.creationTime ? new Date(u.metadata.creationTime) : new Date();

    // password_hash is NULL — these users must reset password or use Google OAuth
    try {
      await q(
        `INSERT INTO users (email, display_name, photo_url, password_hash, google_id, is_online, created_at)
         VALUES ($1, $2, $3, NULL, $4, false, $5)
         ON CONFLICT (email) DO UPDATE SET
           display_name = COALESCE(EXCLUDED.display_name, users.display_name),
           photo_url    = COALESCE(EXCLUDED.photo_url,    users.photo_url),
           google_id    = COALESCE(EXCLUDED.google_id,    users.google_id)`,
        [email, displayName, photoURL, googleId, createdAt]
      );
      console.log(`  ✓ ${email}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${email}: ${err.message || err}`);
      skip++;
    }
  }

  console.log(`  Done: ${ok} inserted/updated, ${skip} skipped`);
}

// ─── Step 2: Chats & Messages ─────────────────────────────────────────────────

async function migrateChats() {
  console.log("\n[2/2] Migrating chats and messages...");

  // Build email → postgres UUID map
  const emailToId = {};
  const { rows } = await q("SELECT id, email FROM users");
  for (const row of rows) emailToId[row.email] = row.id;
  console.log(`  Postgres users loaded: ${rows.length}`);

  const chatsSnap = await firestore.collection("chats").get();
  console.log(`  Firestore chats: ${chatsSnap.size}`);

  let chatsOk = 0, chatsSkip = 0, msgsOk = 0, msgsFail = 0;

  for (const chatDoc of chatsSnap.docs) {
    const data = chatDoc.data();
    const emails = data.users || [];

    const userIds = emails.map((e) => emailToId[e]).filter(Boolean);
    if (userIds.length < 2) {
      console.warn(`  SKIP chat ${chatDoc.id}: users not in DB (${emails.join(", ")})`);
      chatsSkip++;
      continue;
    }

    const createdAt = toDate(data.createdAt) || new Date();

    // Insert chat
    const chatRes = await q(
      `INSERT INTO chats (created_at) VALUES ($1) RETURNING id`,
      [createdAt]
    );
    const newChatId = chatRes.rows[0].id;

    // Insert members
    for (const email of emails) {
      const userId = emailToId[email];
      if (!userId) continue;
      const unread  = data.unreadCounts?.[email] ?? 0;
      const lastRead = toDate(data.lastRead?.[email]);
      await q(
        `INSERT INTO chat_members (chat_id, user_id, unread_count, last_read_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [newChatId, userId, unread, lastRead]
      );
    }

    // Migrate messages
    const msgsSnap = await firestore
      .collection("chats").doc(chatDoc.id)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .get();

    for (const msgDoc of msgsSnap.docs) {
      const m = msgDoc.data();
      const senderId = emailToId[m.user];
      if (!senderId) { msgsFail++; continue; }

      try {
        await q(
          `INSERT INTO messages
             (chat_id, sender_id, sender_email, sender_photo,
              message, image_data, audio_data, audio_duration,
              is_command, is_encoded, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            newChatId,
            senderId,
            m.user,
            m.photoURL    || null,
            m.message     || null,
            m.imageURL    || null,
            m.audioURL    || null,
            m.audioDuration || null,
            m.isCommand   || false,
            m.isEncoded   || false,
            toDate(m.timestamp) || new Date(),
          ]
        );
        msgsOk++;
      } catch (err) {
        console.error(`  ✗ msg in chat ${chatDoc.id}: ${err.message}`);
        msgsFail++;
      }
    }

    console.log(`  ✓ chat ${newChatId} (${emails.join(" ↔ ")}) — ${msgsSnap.size} messages`);
    chatsOk++;
  }

  console.log(`  Done: ${chatsOk} chats, ${msgsOk} messages inserted`);
  if (chatsSkip)  console.log(`  Skipped chats: ${chatsSkip}`);
  if (msgsFail)   console.log(`  Failed messages: ${msgsFail}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Firebase → PostgreSQL migration ===");
  console.log(`DB: ${DATABASE_URL.replace(/:[^:@]*@/, ":***@")}`);

  try {
    await migrateUsers();
    await migrateChats();
    console.log("\n=== Migration complete ===");
  } catch (err) {
    console.error("\n=== Migration FAILED ===", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
