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

  async function getUnreadCount(roomId, session) {
    if (!session || session.isAdmin) {
      return 0;
    }

    const row = await db.get(`
        SELECT COUNT(*) AS unread_count
        FROM messages
        LEFT JOIN room_reads
          ON room_reads.user_id = $1
          AND room_reads.room_id = messages.room_id
        WHERE messages.room_id = $2
          AND messages.user_id != $3
          AND messages.created_at > COALESCE(room_reads.last_read_at, 0)
      `, [session.userId, roomId, session.userId]);

    return Number(row?.unread_count || 0);
  }

  async function getRoomsWithPresence(session = null) {
    const rooms = await db.all("SELECT id, name FROM rooms ORDER BY id");

    return Promise.all(
      rooms.map(async (room) => ({
        ...room,
        onlineUsers: getRoomOnlineUsers(room.id),
        unreadCount: await getUnreadCount(room.id, session),
      })),
    );
  }

  async function getOnlineUsers() {
    if (!resolveSocketSession) {
      const users = [];

      for (const roomUsers of roomPresence.values()) {
        users.push(...roomUsers.values());
      }

      return Array.from(new Set(users)).sort((a, b) => a.localeCompare(b));
    }

    const users = [];

    for (const socket of io.sockets.sockets.values()) {
      const session = await resolveSocketSession(socket);

      if (session && !session.isAdmin) {
        users.push(session.username);
      }
    }

    return Array.from(new Set(users)).sort((a, b) => a.localeCompare(b));
  }

  async function emitRoomsPresence() {
    if (resolveSocketSession) {
      const onlineUsers = await getOnlineUsers();

      for (const socket of io.sockets.sockets.values()) {
        const session = await resolveSocketSession(socket);
        socket.emit("rooms_presence", {
          rooms: await getRoomsWithPresence(session),
          onlineUsers,
        });
      }

      return;
    }

    io.emit("rooms_presence", {
      rooms: await getRoomsWithPresence(),
      onlineUsers: await getOnlineUsers(),
    });
  }

  function setSocketSessionResolver(resolver) {
    resolveSocketSession = resolver;
  }

  async function removeUserFromOtherRooms(username, targetRoomId) {
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
      await emitRoomsPresence();
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

  async function removeSocketPresence(socket, { announce = false } = {}) {
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

    await emitRoomsPresence();
  }

  return {
    addSocketToRoom,
    emitRoomsPresence,
    getOnlineUsers,
    getRoomsWithPresence,
    removeSocketPresence,
    removeUserFromOtherRooms,
    setSocketSessionResolver,
  };
}

module.exports = {
  createPresence,
};
