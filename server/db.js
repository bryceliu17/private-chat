const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const {
  AUDIO_UPLOAD_DIR,
  DATA_DIR,
  DB_FILE,
  PHOTO_UPLOAD_DIR,
  UPLOAD_DIR,
} = require("./config");
const { encryptText } = require("./encryption");
const { hashPassword } = require("./security");

const demoUsers = Array.from({ length: 6 }, (_, index) => ({
  emailEnv: `ACCOUNT${index}_EMAIL`,
  passwordEnv: `ACCOUNT${index}_PASSWORD`,
  usernameEnv: `ACCOUNT${index}_USERNAME`,
}));

const presetRooms = [
  { id: "room1", name: "Room 1 / 房间 1" },
  { id: "room2", name: "Room 2 / 房间 2" },
  { id: "room3", name: "Room 3 / 房间 3" },
  { id: "room4", name: "Room 4 / 房间 4" },
  { id: "room5", name: "Room 5 / 房间 5" },
];

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PHOTO_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);

db.exec("PRAGMA foreign_keys = ON");
db.exec("DROP TABLE IF EXISTS messages_new");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    username_key TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    username_key TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL,
    first_failed_at INTEGER NOT NULL,
    locked_until INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'image', 'audio')),
    text TEXT,
    text_ciphertext TEXT,
    text_iv TEXT,
    text_tag TEXT,
    image_url TEXT,
    audio_url TEXT,
    filename TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS room_reads (
    user_id INTEGER NOT NULL,
    room_id TEXT NOT NULL,
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, room_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all();

if (!userColumns.some((column) => column.name === "email")) {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''");
}

let messageColumns = db.prepare("PRAGMA table_info(messages)").all();
const messageTable = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
  .get();

if (messageTable?.sql && !messageTable.sql.includes("'audio'")) {
  const audioColumnExpression = messageColumns.some(
    (column) => column.name === "audio_url",
  )
    ? "audio_url"
    : "NULL";

  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS messages_new;

    CREATE TABLE messages_new (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('text', 'image', 'audio')),
      text TEXT,
      text_ciphertext TEXT,
      text_iv TEXT,
      text_tag TEXT,
      image_url TEXT,
      audio_url TEXT,
      filename TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    INSERT INTO messages_new (
      id,
      room_id,
      user_id,
      type,
      text,
      text_ciphertext,
      text_iv,
      text_tag,
      image_url,
      audio_url,
      filename,
      created_at
    )
    SELECT
      id,
      room_id,
      user_id,
      type,
      text,
      NULL,
      NULL,
      NULL,
      image_url,
      ${audioColumnExpression},
      filename,
      created_at
    FROM messages;

    DROP TABLE messages;
    ALTER TABLE messages_new RENAME TO messages;

    PRAGMA foreign_keys = ON;
  `);

  messageColumns = db.prepare("PRAGMA table_info(messages)").all();
}

if (!messageColumns.some((column) => column.name === "audio_url")) {
  db.exec("ALTER TABLE messages ADD COLUMN audio_url TEXT");
  messageColumns = db.prepare("PRAGMA table_info(messages)").all();
}

[
  "text_ciphertext",
  "text_iv",
  "text_tag",
].forEach((columnName) => {
  if (!messageColumns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE messages ADD COLUMN ${columnName} TEXT`);
    messageColumns = db.prepare("PRAGMA table_info(messages)").all();
  }
});

function encryptExistingTextMessages() {
  const legacyMessages = db
    .prepare(`
      SELECT id, text
      FROM messages
      WHERE type = 'text'
        AND text IS NOT NULL
        AND text != ''
        AND text_ciphertext IS NULL
    `)
    .all();

  if (!legacyMessages.length) {
    return;
  }

  const updateMessage = db.prepare(`
    UPDATE messages
    SET text = NULL,
      text_ciphertext = ?,
      text_iv = ?,
      text_tag = ?
    WHERE id = ?
  `);
  db.exec("BEGIN");

  try {
    legacyMessages.forEach((message) => {
      const encrypted = encryptText(message.text);

      updateMessage.run(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        message.id,
      );
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

encryptExistingTextMessages();

function seedDatabase() {
  const insertUser = db.prepare(`
    INSERT INTO users (username, username_key, password, email)
    VALUES (?, ?, ?, ?)
  `);
  const updateUserWithPasswordAndEmail = db.prepare(`
    UPDATE users
    SET username = ?, password = ?, email = ?
    WHERE username_key = ?
  `);
  const updateUserWithPassword = db.prepare(`
    UPDATE users
    SET username = ?, password = ?
    WHERE username_key = ?
  `);
  const updateUserWithEmail = db.prepare(`
    UPDATE users
    SET username = ?, email = ?
    WHERE username_key = ?
  `);
  const updateUser = db.prepare(`
    UPDATE users
    SET username = ?
    WHERE username_key = ?
  `);
  const findUser = db.prepare("SELECT id FROM users WHERE username_key = ?");
  const insertRoom = db.prepare(`
    INSERT INTO rooms (id, name)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name
  `);

  const demoUserKeys = demoUsers.map((user) => {
    const username = String(process.env[user.usernameEnv] || "").trim();

    if (!username) {
      throw new Error(`Missing ${user.usernameEnv}. Add it to server/.env.`);
    }

    return username.toLowerCase();
  });
  const demoUserPlaceholders = demoUserKeys.map(() => "?").join(", ");

  db.prepare(`DELETE FROM users WHERE username_key NOT IN (${demoUserPlaceholders})`).run(
    ...demoUserKeys,
  );

  demoUsers.forEach((user) => {
    const username = String(process.env[user.usernameEnv] || "").trim();
    const password = process.env[user.passwordEnv];
    const hasEmailEnv = Object.prototype.hasOwnProperty.call(process.env, user.emailEnv);
    const email = hasEmailEnv ? String(process.env[user.emailEnv] || "").trim() : "";

    if (!username) {
      throw new Error(`Missing ${user.usernameEnv}. Add it to server/.env.`);
    }

    const usernameKey = username.toLowerCase();
    const existingUser = findUser.get(usernameKey);

    if (password) {
      const passwordHash = hashPassword(password);

      if (existingUser) {
        if (hasEmailEnv) {
          updateUserWithPasswordAndEmail.run(username, passwordHash, email, usernameKey);
        } else {
          updateUserWithPassword.run(username, passwordHash, usernameKey);
        }
      } else {
        insertUser.run(username, usernameKey, passwordHash, email);
      }

      return;
    }

    if (existingUser) {
      if (hasEmailEnv) {
        updateUserWithEmail.run(username, email, usernameKey);
      } else {
        updateUser.run(username, usernameKey);
      }
      return;
    }

    throw new Error(
      `Missing ${user.passwordEnv}. Add it to server/.env before starting with a new database.`,
    );
  });

  presetRooms.forEach((room) => {
    insertRoom.run(room.id, room.name);
  });

  const presetRoomIds = presetRooms.map((room) => room.id);
  const presetRoomPlaceholders = presetRoomIds.map(() => "?").join(", ");

  db.prepare(`DELETE FROM rooms WHERE id NOT IN (${presetRoomPlaceholders})`).run(
    ...presetRoomIds,
  );
}

seedDatabase();

module.exports = {
  db,
};
