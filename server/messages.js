const crypto = require("crypto");
const { db } = require("./db");
const { decryptText, encryptText } = require("./encryption");
const {
  deleteLocalUpload,
  deleteObject,
  getClientFileUrl,
  saveLocalEncryptedUpload,
} = require("./storage");

async function getRoom(roomId) {
  return db.get("SELECT id, name FROM rooms WHERE id = $1", [roomId]);
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
      imageUrl: getClientFileUrl(row.image_url),
    };
  }

  if (row.type === "audio") {
    return {
      ...message,
      type: "audio",
      filename: row.filename,
      audioUrl: getClientFileUrl(row.audio_url),
    };
  }

  if (row.type === "file") {
    return {
      ...message,
      type: "file",
      filename: row.filename,
      fileUrl: getClientFileUrl(row.file_url),
    };
  }

  if (row.type === "video") {
    return {
      ...message,
      type: "video",
      filename: row.filename,
      videoUrl: getClientFileUrl(row.video_url),
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

async function getRoomMessages(roomId) {
  return (await db.all(`
      SELECT messages.*, users.username
      FROM messages
      JOIN users ON users.id = messages.user_id
      WHERE messages.room_id = $1
      ORDER BY messages.created_at ASC
    `, [roomId])).map(rowToMessage);
}

async function createTextMessage(roomId, session, text, {
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

  await db.run(`
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
    VALUES ($1, $2, $3, 'text', $4, $5, $6, $7)
  `, [
    message.id,
    roomId,
    session.userId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    message.createdAt,
  ]);

  return message;
}

async function markRoomRead(userId, roomId, readAt = Date.now()) {
  await db.run(`
    INSERT INTO room_reads (user_id, room_id, last_read_at)
    VALUES ($1, $2, $3)
    ON CONFLICT(user_id, room_id) DO UPDATE SET
      last_read_at = GREATEST(room_reads.last_read_at, excluded.last_read_at)
  `, [userId, roomId, readAt]);
}

async function markActiveRoomUsersRead(io, getSocketSession, roomId, readAt = Date.now()) {
  const roomSocketIds = io.sockets.adapter.rooms.get(roomId);

  if (!roomSocketIds) {
    return;
  }

  for (const socketId of roomSocketIds) {
    const socket = io.sockets.sockets.get(socketId);
    const session = socket ? await getSocketSession(socket) : null;

    if (!session || session.isAdmin) {
      continue;
    }

    await markRoomRead(session.userId, roomId, readAt);
  }
}

async function deleteUploadedFilesForMessages(messages) {
  for (const message of messages) {
    for (const url of [message.image_url, message.audio_url, message.file_url, message.video_url]) {
      if (!url) {
        continue;
      }

      if (url.startsWith("supabase://")) {
        try {
          await deleteObject(url);
        } catch (error) {
          console.error(`Failed to delete Supabase upload ${url}:`, error);
        }
        continue;
      }

      deleteLocalUpload(url);
    }
  }
}

async function saveUpload({ kind, roomId, filename, buffer, contentType }) {
  return saveLocalEncryptedUpload({
    kind,
    filename,
    buffer,
    contentType,
  });
}

let uploadMessageSchemaPromise = null;

function ensureUploadMessageSchema() {
  if (!uploadMessageSchemaPromise) {
    uploadMessageSchemaPromise = (async () => {
      await db.run("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url text");
      await db.run("ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_url text");
      await db.run("ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check");
      await db.run(`
        ALTER TABLE messages
        ADD CONSTRAINT messages_type_check
        CHECK (type in ('text', 'image', 'audio', 'file', 'video'))
      `);
    })();
  }

  return uploadMessageSchemaPromise;
}

function getSafeExtension(filename, fallback = "bin") {
  const extension = String(filename || "").split(".").pop();

  if (!extension || extension === filename) {
    return fallback;
  }

  return extension.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || fallback;
}

function parseFileDataUrl(fileData) {
  const match = String(fileData || "").match(
    /^data:([^;,]+)((?:;[^,]*)*);base64,([\s\S]+)$/i,
  );

  if (!match) {
    return null;
  }

  return {
    buffer: Buffer.from(match[3].replace(/\s/g, ""), "base64"),
    contentType: match[1].toLowerCase(),
  };
}

function parseAudioDataUrl(audioData) {
  const match = String(audioData || "").match(
    /^data:([^;,]+)((?:;[^,]*)*);base64,([\s\S]+)$/i,
  );

  if (!match) {
    return null;
  }

  const contentType = match[1].toLowerCase();
  const subtype = contentType.split("/")[1] || "";
  const isSupportedAudio =
    contentType.startsWith("audio/") ||
    contentType === "video/mp4" ||
    contentType === "application/octet-stream";

  if (!isSupportedAudio || !subtype) {
    return null;
  }

  const extensionBySubtype = {
    aac: "aac",
    "x-aac": "aac",
    m4a: "m4a",
    "x-m4a": "m4a",
    mp4: "mp4",
    mpeg: "mp3",
    mp3: "mp3",
    ogg: "ogg",
    wav: "wav",
    webm: "webm",
    "octet-stream": "audio",
  };

  return {
    buffer: Buffer.from(match[3].replace(/\s/g, ""), "base64"),
    contentType,
    extension: extensionBySubtype[subtype] || subtype.replace(/[^a-z0-9]+/g, "-") || "audio",
  };
}

function registerRoomRoutes(app, {
  getSocketSession,
  io,
  presence,
  requireAdmin,
  requireChatUser,
  requireSession,
}) {
  app.get("/api/rooms", async (req, res) => {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const rooms = await presence.getRoomsWithPresence(session);

    res.json({
      username: session.username,
      isAdmin: session.isAdmin,
      rooms,
    });
  });

  app.post("/api/rooms/:roomId/photos", async (req, res) => {
    const session = await requireChatUser(req, res);

    if (!session) {
      return;
    }

    const roomId = String(req.params.roomId || "").trim();

    if (!(await getRoom(roomId))) {
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

    if (!buffer.length) {
      return res.status(400).json({
        message: "Photo data is empty.",
      });
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${extension}`;
    const createdAt = Date.now();
    const upload = await saveUpload({
      kind: "image",
      roomId,
      filename,
      buffer,
      contentType: `image/${extension === "jpg" ? "jpeg" : extension}`,
    });

    const message = {
      id: `${Date.now()}-${id}`,
      type: "image",
      filename: originalName,
      username: session.username,
      imageUrl: upload.clientUrl,
      createdAt,
    };

    try {
      await db.run(`
        INSERT INTO messages (id, room_id, user_id, type, image_url, filename, created_at)
        VALUES ($1, $2, $3, 'image', $4, $5, $6)
      `, [message.id, roomId, session.userId, upload.dbUrl, originalName, createdAt]);
    } catch (error) {
      await upload.cleanup();
      throw error;
    }

    io.to(roomId).emit("receive_message", message);
    await markActiveRoomUsersRead(io, getSocketSession, roomId, createdAt);
    await presence.emitRoomsPresence();

    return res.status(201).json({
      message,
    });
  });

  app.post("/api/rooms/:roomId/audio", async (req, res) => {
    const session = await requireChatUser(req, res);

    if (!session) {
      return;
    }

    const roomId = String(req.params.roomId || "").trim();

    if (!(await getRoom(roomId))) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const audioData = String(req.body.audioData || "");
    const originalName = String(req.body.filename || "voice-message").trim() || "voice-message";
    const parsedAudio = parseAudioDataUrl(audioData);

    if (!parsedAudio) {
      return res.status(400).json({
        message: "Please record or upload a supported audio message.",
      });
    }

    const { buffer, contentType, extension } = parsedAudio;

    if (!buffer.length) {
      return res.status(400).json({
        message: "Audio message data is empty.",
      });
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${extension}`;
    const createdAt = Date.now();
    const upload = await saveUpload({
      kind: "audio",
      roomId,
      filename,
      buffer,
      contentType,
    });

    const message = {
      id: `${Date.now()}-${id}`,
      type: "audio",
      filename: originalName,
      username: session.username,
      audioUrl: upload.clientUrl,
      createdAt,
    };

    try {
      await db.run(`
        INSERT INTO messages (id, room_id, user_id, type, audio_url, filename, created_at)
        VALUES ($1, $2, $3, 'audio', $4, $5, $6)
      `, [message.id, roomId, session.userId, upload.dbUrl, originalName, createdAt]);
    } catch (error) {
      await upload.cleanup();
      throw error;
    }

    io.to(roomId).emit("receive_message", message);
    await markActiveRoomUsersRead(io, getSocketSession, roomId, createdAt);
    await presence.emitRoomsPresence();

    return res.status(201).json({
      message,
    });
  });

  app.post("/api/rooms/:roomId/files", async (req, res) => {
    const session = await requireChatUser(req, res);

    if (!session) {
      return;
    }

    const roomId = String(req.params.roomId || "").trim();

    if (!(await getRoom(roomId))) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const originalName = String(req.body.filename || "file").trim() || "file";
    const parsedFile = parseFileDataUrl(req.body.fileData);

    if (!parsedFile) {
      return res.status(400).json({
        message: "Please upload a valid file.",
      });
    }

    const { buffer, contentType } = parsedFile;

    if (!buffer.length) {
      return res.status(400).json({
        message: "File data is empty.",
      });
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${getSafeExtension(originalName)}`;
    const createdAt = Date.now();
    await ensureUploadMessageSchema();
    const upload = await saveUpload({
      kind: "file",
      roomId,
      filename,
      buffer,
      contentType,
    });

    const message = {
      id: `${Date.now()}-${id}`,
      type: "file",
      filename: originalName,
      username: session.username,
      fileUrl: upload.clientUrl,
      createdAt,
    };

    try {
      await db.run(`
        INSERT INTO messages (id, room_id, user_id, type, file_url, filename, created_at)
        VALUES ($1, $2, $3, 'file', $4, $5, $6)
      `, [message.id, roomId, session.userId, upload.dbUrl, originalName, createdAt]);
    } catch (error) {
      await upload.cleanup();
      throw error;
    }

    io.to(roomId).emit("receive_message", message);
    await markActiveRoomUsersRead(io, getSocketSession, roomId, createdAt);
    await presence.emitRoomsPresence();

    return res.status(201).json({
      message,
    });
  });

  app.post("/api/rooms/:roomId/videos", async (req, res) => {
    const session = await requireChatUser(req, res);

    if (!session) {
      return;
    }

    const roomId = String(req.params.roomId || "").trim();

    if (!(await getRoom(roomId))) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const originalName = String(req.body.filename || "video").trim() || "video";
    const parsedVideo = parseFileDataUrl(req.body.videoData);

    if (!parsedVideo || !parsedVideo.contentType.startsWith("video/")) {
      return res.status(400).json({
        message: "Please upload a valid video.",
      });
    }

    const { buffer, contentType } = parsedVideo;

    if (!buffer.length) {
      return res.status(400).json({
        message: "Video data is empty.",
      });
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${getSafeExtension(originalName, "mp4")}`;
    const createdAt = Date.now();
    await ensureUploadMessageSchema();
    const upload = await saveUpload({
      kind: "video",
      roomId,
      filename,
      buffer,
      contentType,
    });

    const message = {
      id: `${Date.now()}-${id}`,
      type: "video",
      filename: originalName,
      username: session.username,
      videoUrl: upload.clientUrl,
      createdAt,
    };

    try {
      await db.run(`
        INSERT INTO messages (id, room_id, user_id, type, video_url, filename, created_at)
        VALUES ($1, $2, $3, 'video', $4, $5, $6)
      `, [message.id, roomId, session.userId, upload.dbUrl, originalName, createdAt]);
    } catch (error) {
      await upload.cleanup();
      throw error;
    }

    io.to(roomId).emit("receive_message", message);
    await markActiveRoomUsersRead(io, getSocketSession, roomId, createdAt);
    await presence.emitRoomsPresence();

    return res.status(201).json({
      message,
    });
  });

  app.delete("/api/rooms/:roomId/messages", async (req, res) => {
    const session = await requireAdmin(req, res);

    if (!session) {
      return;
    }

    const roomId = String(req.params.roomId || "").trim();

    if (!(await getRoom(roomId))) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    await ensureUploadMessageSchema();
    const messages = await db.all(
      "SELECT id, image_url, audio_url, file_url, video_url FROM messages WHERE room_id = $1",
      [roomId],
    );

    await deleteUploadedFilesForMessages(messages);
    await db.run("DELETE FROM messages WHERE room_id = $1", [roomId]);

    io.to(roomId).emit("chat_history", []);
    io.to(roomId).emit("system_message", {
      text: "Chat history was deleted by admin. / 聊天记录已被管理员删除。",
      createdAt: Date.now(),
    });
    await presence.emitRoomsPresence();

    return res.json({
      ok: true,
      deletedMessages: messages.length,
    });
  });

  app.delete("/api/messages/:messageId", async (req, res) => {
    const session = await requireAdmin(req, res);

    if (!session) {
      return;
    }

    const messageId = String(req.params.messageId || "").trim();
    await ensureUploadMessageSchema();
    const message = await db.get(
      "SELECT id, room_id, image_url, audio_url, file_url, video_url FROM messages WHERE id = $1",
      [messageId],
    );

    if (!message) {
      return res.status(404).json({
        message: "Message not found",
      });
    }

    await deleteUploadedFilesForMessages([message]);
    await db.run("DELETE FROM messages WHERE id = $1", [message.id]);

    io.to(message.room_id).emit("message_deleted", {
      id: message.id,
    });
    await presence.emitRoomsPresence();

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
