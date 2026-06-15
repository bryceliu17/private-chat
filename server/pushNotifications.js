const fs = require("fs");
const admin = require("firebase-admin");
const {
  ADMIN_USERNAME,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_SERVICE_ACCOUNT_PATH,
} = require("./config");
const { db } = require("./db");

let schemaPromise = null;
let firebaseApp = null;
let firebaseInitAttempted = false;

function ensurePushSchema() {
  if (!schemaPromise) {
    schemaPromise = db.run(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        token text PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform text NOT NULL DEFAULT 'android',
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `);
  }

  return schemaPromise;
}

function readServiceAccount() {
  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (FIREBASE_SERVICE_ACCOUNT_PATH) {
    return JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"));
  }

  return null;
}

function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  if (firebaseInitAttempted) {
    return null;
  }

  firebaseInitAttempted = true;

  const serviceAccount = readServiceAccount();

  if (!serviceAccount) {
    console.warn("Firebase push notifications are disabled: no service account configured.");
    return null;
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return firebaseApp;
}

function registerPushRoutes(app, { requireChatUser, requireSession }) {
  app.post("/api/push-tokens", async (req, res) => {
    const session = await requireChatUser(req, res);

    if (!session) {
      return;
    }

    const token = String(req.body.token || "").trim();
    const platform = String(req.body.platform || "android").trim().slice(0, 32) || "android";

    if (!token) {
      return res.status(400).json({
        message: "Missing push token",
      });
    }

    const now = Date.now();

    await ensurePushSchema();
    await db.run(`
      INSERT INTO push_tokens (token, user_id, platform, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT(token) DO UPDATE SET
        user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = excluded.updated_at
    `, [token, session.userId, platform, now]);

    return res.json({
      ok: true,
    });
  });

  app.delete("/api/push-tokens", async (req, res) => {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const token = String(req.body.token || "").trim();

    if (token) {
      await ensurePushSchema();
      await db.run("DELETE FROM push_tokens WHERE token = $1 AND user_id = $2", [
        token,
        session.userId,
      ]);
    } else {
      await ensurePushSchema();
      await db.run("DELETE FROM push_tokens WHERE user_id = $1", [session.userId]);
    }

    return res.json({
      ok: true,
    });
  });
}

async function removeInvalidTokens(tokens) {
  if (!tokens.length) {
    return;
  }

  await db.run("DELETE FROM push_tokens WHERE token = ANY($1::text[])", [tokens]);
}

async function sendPushToRoom(roomId, senderSession, message) {
  const app = getFirebaseApp();

  if (!app || !message || !senderSession || senderSession.isAdmin) {
    return;
  }

  await ensurePushSchema();

  const rows = await db.all(`
    SELECT DISTINCT push_tokens.token
    FROM push_tokens
    JOIN users ON users.id = push_tokens.user_id
    WHERE push_tokens.user_id != $1
      AND users.username != $2
  `, [senderSession.userId, ADMIN_USERNAME]);

  const tokens = rows.map((row) => row.token).filter(Boolean);

  if (!tokens.length) {
    return;
  }

  const bodyByType = {
    audio: "Sent a voice message / 发来一条语音消息",
    file: "Sent a file / 发来一个文件",
    image: "Sent a photo / 发来一张图片",
    video: "Sent a video / 发来一个视频",
  };
  const body = message.type === "text"
    ? String(message.text || "").slice(0, 120)
    : bodyByType[message.type] || "Sent a message / 发来一条消息";

  const response = await admin.messaging(app).sendEachForMulticast({
    tokens,
    notification: {
      title: `New message from ${senderSession.username}`,
      body,
    },
    data: {
      kind: "message",
      roomId: String(roomId),
      messageId: String(message.id || ""),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "messages",
        sound: "default",
      },
    },
  });

  const invalidTokens = [];

  response.responses.forEach((item, index) => {
    const code = item.error?.code || "";

    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    ) {
      invalidTokens.push(tokens[index]);
    }
  });

  await removeInvalidTokens(invalidTokens);
}

module.exports = {
  registerPushRoutes,
  sendPushToRoom,
};
