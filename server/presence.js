const { db } = require("./db");

function createPresence(io) {
  const roomPresence = new Map();
  let resolveSocketSession = null;

  function getRoomOnlineUsers(roomId) {
    const users = roomPresence.get(roomId);

    if (!users) {
      return [];
    }

    return Array.from(new Set(users.values())).sort((a, b) => a.localeCompare(b));
  }

  function getUnreadCount(roomId, session) {
    if (!session || session.isAdmin) {
      return 0;
    }

    const row = db
      .prepare(`
        SELECT COUNT(*) AS unread_count
        FROM messages
        LEFT JOIN room_reads
          ON room_reads.user_id = ?
          AND room_reads.room_id = messages.room_id
        WHERE messages.room_id = ?
          AND messages.user_id != ?
          AND messages.created_at > COALESCE(room_reads.last_read_at, 0)
      `)
      .get(session.userId, roomId, session.userId);

    return row?.unread_count || 0;
  }

  function getRoomsWithPresence(session = null) {
    return db
      .prepare("SELECT id, name FROM rooms ORDER BY id")
      .all()
      .map((room) => ({
        ...room,
        onlineUsers: getRoomOnlineUsers(room.id),
        unreadCount: getUnreadCount(room.id, session),
      }));
  }

  function emitRoomsPresence() {
    if (resolveSocketSession) {
      for (const socket of io.sockets.sockets.values()) {
        socket.emit("rooms_presence", {
          rooms: getRoomsWithPresence(resolveSocketSession(socket)),
        });
      }

      return;
    }

    io.emit("rooms_presence", {
      rooms: getRoomsWithPresence(),
    });
  }

  function setSocketSessionResolver(resolver) {
    resolveSocketSession = resolver;
  }

  function removeUserFromOtherRooms(username, targetRoomId) {
    const removedRooms = new Set();

    for (const [roomId, users] of roomPresence.entries()) {
      if (roomId === targetRoomId) {
        continue;
      }

      for (const [socketId, onlineUsername] of users.entries()) {
        if (onlineUsername !== username) {
          continue;
        }

        users.delete(socketId);
        removedRooms.add(roomId);

        const oldSocket = io.sockets.sockets.get(socketId);

        if (oldSocket) {
          oldSocket.leave(roomId);
          oldSocket.data.roomId = null;
          oldSocket.data.username = null;
          oldSocket.emit("force_leave_room", {
            roomId,
            message:
              "This account joined another room in a different window. / 此账号已在其他窗口加入另一个房间。",
          });
        }
      }

      if (!users.size) {
        roomPresence.delete(roomId);
      }
    }

    for (const roomId of removedRooms) {
      io.to(roomId).emit("system_message", {
        text: `${username} left the chat`,
        createdAt: Date.now(),
      });
    }

    if (removedRooms.size) {
      emitRoomsPresence();
    }
  }

  function addSocketToRoom(socket, roomId, username) {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    if (!roomPresence.has(roomId)) {
      roomPresence.set(roomId, new Map());
    }

    roomPresence.get(roomId).set(socket.id, username);
  }

  function removeSocketPresence(socket, { announce = false } = {}) {
    const roomId = socket.data.roomId;
    const username = socket.data.username;

    if (!roomId || !username) {
      return;
    }

    const users = roomPresence.get(roomId);

    if (users) {
      users.delete(socket.id);

      if (!users.size) {
        roomPresence.delete(roomId);
      }
    }

    socket.leave(roomId);
    socket.data.roomId = null;
    socket.data.username = null;

    if (announce) {
      socket.to(roomId).emit("system_message", {
        text: `${username} left the chat`,
        createdAt: Date.now(),
      });
    }

    emitRoomsPresence();
  }

  return {
    addSocketToRoom,
    emitRoomsPresence,
    getRoomsWithPresence,
    removeSocketPresence,
    removeUserFromOtherRooms,
    setSocketSessionResolver,
  };
}

module.exports = {
  createPresence,
};
