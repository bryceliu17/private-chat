const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  AUDIO_UPLOAD_DIR,
  MAX_AUDIO_SIZE,
  MAX_PHOTO_SIZE,
  PHOTO_UPLOAD_DIR,
} = require("./config");
const { db } = require("./db");
const { decryptText, encryptText } = require("./encryption");

function getRoom(roomId) {
  return db.prepare("SELECT id, name FROM rooms WHERE id = ?").get(roomId) || null;
}

function rowToMessage(row) {
  const message = {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  };

  if (row.type === "image") {
    return {
      ...message,
      type: "image",
      filename: row.filename,
      imageUrl: row.image_url,
    };
  }

  if (row.type === "audio") {
    return {
      ...message,
      type: "audio",
      filename: row.filename,
      audioUrl: row.audio_url,
    };
  }

  return {
    ...message,
    type: "text",
    text: decryptText({
      ciphertext: row.text_ciphertext,
      iv: row.text_iv,
      tag: row.text_tag,
      fallbackText: row.text,
    }),
  };
}

function getRoomMessages(roomId) {
  return db
    .prepare(`
      SELECT messages.*, users.username
      FROM messages
      JOIN users ON users.id = messages.user_id
      WHERE messages.room_id = ?
      ORDER BY messages.created_at ASC
    `)
    .all(roomId)
    .map(rowToMessage);
}

function createTextMessage(roomId, session, text, {
  createdAt = Date.now(),
  id = `${createdAt}-${crypto.randomUUID()}`,
} = {}) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    return null;
  }

  const encrypted = encryptText(cleanText);
  const message = {
    id,
    username: session.username,
    type: "text",
    text: cleanText,
    createdAt,
  };

  db.prepare(`
    INSERT INTO messages (
      id,
      room_id,
      user_id,
      type,
      text_ciphertext,
      text_iv,
      text_tag,
      created_at
    )
    VALUES (?, ?, ?, 'text', ?, ?, ?, ?)
  `).run(
    message.id,
    roomId,
    session.userId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    message.createdAt,
  );

  return message;
}

function markRoomRead(userId, roomId, readAt = Date.now()) {
  db.prepare(`
    INSERT INTO room_reads (user_id, room_id, last_read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, room_id) DO UPDATE SET
      last_read_at = max(room_reads.last_read_at, excluded.last_read_at)
  `).run(userId, roomId, readAt);
}

function markActiveRoomUsersRead(io, getSocketSession, roomId, readAt = Date.now()) {
  const roomSocketIds = io.sockets.adapter.rooms.get(roomId);

  if (!roomSocketIds) {
    return;
  }

  for (const socketId of roomSocketIds) {
    const socket = io.sockets.sockets.get(socketId);
    const session = socket ? getSocketSession(socket) : null;

    if (!session || session.isAdmin) {
      continue;
    }

    markRoomRead(session.userId, roomId, readAt);
  }
}

function deleteUploadedFilesForMessages(messages) {
  messages.forEach((message) => {
    const uploads = [
      {
        baseDir: PHOTO_UPLOAD_DIR,
        url: message.image_url,
        prefix: "/uploads/photos/",
      },
      {
        baseDir: AUDIO_UPLOAD_DIR,
        url: message.audio_url,
        prefix: "/uploads/audio/",
      },
    ];

    uploads.forEach(({ baseDir, prefix, url }) => {
      if (!url || !url.startsWith(prefix)) {
        return;
      }

      const filename = path.basename(url);
      const uploadPath = path.join(baseDir, filename);

      if (!uploadPath.startsWith(baseDir)) {
        return;
      }

      try {
        fs.rmSync(uploadPath, {
          force: true,
        });
      } catch (error) {
        console.error(`Failed to delete upload ${uploadPath}:`, error);
      }
    });
  });
}

function registerRoomRoutes(app, {
  getSocketSession,
  io,
  presence,
  requireAdmin,
  requireChatUser,
  requireSession,
}) {
  app.get("/api/rooms", (req, res) => {
    const session = requireSession(req, res);

    if (!session) {
      return;
    }

    res.json({
      username: session.username,
      isAdmin: session.isAdmin,
      rooms: presence.getRoomsWithPresence(session),
    });
  });

  app.post("/api/rooms/:roomId/photos", (req, res) => {
    const session = requireChatUser(req, res);

    if (!session) {
      return;
    }

    const roomId = String(req.params.roomId || "").trim();

    if (!getRoom(roomId)) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const imageData = String(req.body.imageData || "");
    const originalName = String(req.body.filename || "photo").trim() || "photo";
    const match = imageData.match(
      /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i,
    );

    if (!match) {
      return res.status(400).json({
        message: "Please upload a PNG, JPG, GIF, or WebP image.",
      });
    }

    const extension =
      match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], "base64");

    if (!buffer.length || buffer.length > MAX_PHOTO_SIZE) {
      return res.status(400).json({
        message: "Photo must be smaller than 5 MB.",
      });
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${extension}`;
    const uploadPath = path.join(PHOTO_UPLOAD_DIR, filename);
    const createdAt = Date.now();

    const message = {
      id: `${Date.now()}-${id}`,
      type: "image",
      filename: originalName,
      username: session.username,
      imageUrl: `/uploads/photos/${filename}`,
      createdAt,
    };

    try {
      fs.writeFileSync(uploadPath, buffer);
      db.prepare(`
        INSERT INTO messages (id, room_id, user_id, type, image_url, filename, created_at)
        VALUES (?, ?, ?, 'image', ?, ?, ?)
      `).run(message.id, roomId, session.userId, message.imageUrl, originalName, createdAt);
    } catch (error) {
      fs.rmSync(uploadPath, { force: true });
      throw error;
    }

    io.to(roomId).emit("receive_message", message);
    markActiveRoomUsersRead(io, getSocketSession, roomId, createdAt);
    presence.emitRoomsPresence();

    return res.status(201).json({
      message,
    });
  });

  app.post("/api/rooms/:roomId/audio", (req, res) => {
    const session = requireChatUser(req, res);

    if (!session) {
      return;
    }

    const roomId = String(req.params.roomId || "").trim();

    if (!getRoom(roomId)) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const audioData = String(req.body.audioData || "");
    const originalName = String(req.body.filename || "voice-message").trim() || "voice-message";
    const match = audioData.match(
      /^data:audio\/(webm|mp4|mpeg|mp3|wav|ogg)(?:;codecs=[^;]+)?;base64,([A-Za-z0-9+/=]+)$/i,
    );

    if (!match) {
      return res.status(400).json({
        message: "Please record or upload a supported audio message.",
      });
    }

    const extension = match[1].toLowerCase() === "mpeg" ? "mp3" : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], "base64");

    if (!buffer.length || buffer.length > MAX_AUDIO_SIZE) {
      return res.status(400).json({
        message: "Audio message must be smaller than 10 MB.",
      });
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${extension}`;
    const uploadPath = path.join(AUDIO_UPLOAD_DIR, filename);
    const createdAt = Date.now();

    const message = {
      id: `${Date.now()}-${id}`,
      type: "audio",
      filename: originalName,
      username: session.username,
      audioUrl: `/uploads/audio/${filename}`,
      createdAt,
    };

    try {
      fs.writeFileSync(uploadPath, buffer);
      db.prepare(`
        INSERT INTO messages (id, room_id, user_id, type, audio_url, filename, created_at)
        VALUES (?, ?, ?, 'audio', ?, ?, ?)
      `).run(message.id, roomId, session.userId, message.audioUrl, originalName, createdAt);
    } catch (error) {
      fs.rmSync(uploadPath, { force: true });
      throw error;
    }

    io.to(roomId).emit("receive_message", message);
    markActiveRoomUsersRead(io, getSocketSession, roomId, createdAt);
    presence.emitRoomsPresence();

    return res.status(201).json({
      message,
    });
  });

  app.delete("/api/rooms/:roomId/messages", (req, res) => {
    const session = requireAdmin(req, res);

    if (!session) {
      return;
    }

    const roomId = String(req.params.roomId || "").trim();

    if (!getRoom(roomId)) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const messages = db
      .prepare("SELECT id, image_url, audio_url FROM messages WHERE room_id = ?")
      .all(roomId);

    deleteUploadedFilesForMessages(messages);
    db.prepare("DELETE FROM messages WHERE room_id = ?").run(roomId);

    io.to(roomId).emit("chat_history", []);
    io.to(roomId).emit("system_message", {
      text: "Chat history was deleted by admin. / 聊天记录已被管理员删除。",
      createdAt: Date.now(),
    });
    presence.emitRoomsPresence();

    return res.json({
      ok: true,
      deletedMessages: messages.length,
    });
  });

  app.delete("/api/messages/:messageId", (req, res) => {
    const session = requireAdmin(req, res);

    if (!session) {
      return;
    }

    const messageId = String(req.params.messageId || "").trim();
    const message = db
      .prepare("SELECT id, room_id, image_url, audio_url FROM messages WHERE id = ?")
      .get(messageId);

    if (!message) {
      return res.status(404).json({
        message: "Message not found",
      });
    }

    deleteUploadedFilesForMessages([message]);
    db.prepare("DELETE FROM messages WHERE id = ?").run(message.id);

    io.to(message.room_id).emit("message_deleted", {
      id: message.id,
    });
    presence.emitRoomsPresence();

    return res.json({
      ok: true,
      deletedMessageId: message.id,
    });
  });
}

module.exports = {
  createTextMessage,
  getRoom,
  getRoomMessages,
  markActiveRoomUsersRead,
  markRoomRead,
  registerRoomRoutes,
};
