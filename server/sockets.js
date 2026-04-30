const {
  createTextMessage,
  getRoom,
  getRoomMessages,
  markActiveRoomUsersRead,
  markRoomRead,
} = require("./messages");

function registerSocketHandlers(io, { getSocketSession, presence }) {
  const roomCalls = new Map();

  function findRoomSocketByUsername(roomId, username) {
    const roomSocketIds = io.sockets.adapter.rooms.get(roomId);

    if (!roomSocketIds) {
      return null;
    }

    for (const socketId of roomSocketIds) {
      const roomSocket = io.sockets.sockets.get(socketId);

      if (roomSocket?.data.username === username) {
        return roomSocket;
      }
    }

    return null;
  }

  function getSocketCall(socket) {
    if (!socket.data.voiceCallId) {
      return null;
    }

    return roomCalls.get(socket.data.voiceCallId) || null;
  }

  function clearSocketCallData(call) {
    [call.callerSocketId, call.calleeSocketId].forEach((socketId) => {
      const participantSocket = io.sockets.sockets.get(socketId);

      if (participantSocket?.data.voiceCallId === call.id) {
        participantSocket.data.voiceCallId = null;
      }
    });
  }

  function endVoiceCall(call, reason = "ended", endedBy = null) {
    if (!call || roomCalls.get(call.id) !== call) {
      return;
    }

    roomCalls.delete(call.id);
    clearSocketCallData(call);

    [call.callerSocketId, call.calleeSocketId].forEach((socketId) => {
      if (socketId !== endedBy) {
        io.to(socketId).emit("voice_call_ended", {
          callId: call.id,
          reason,
        });
      }
    });
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    const initialSession = getSocketSession(socket);
    socket.emit("rooms_presence", {
      rooms: presence.getRoomsWithPresence(initialSession),
    });

    socket.on("join_room", ({ roomId }) => {
      const cleanRoomId = String(roomId || "").trim();
      const session = getSocketSession(socket);

      if (!cleanRoomId || !session || !getRoom(cleanRoomId)) {
        return;
      }

      if (session.isAdmin) {
        if (socket.data.roomId && socket.data.roomId !== cleanRoomId) {
          socket.leave(socket.data.roomId);
        }

        socket.join(cleanRoomId);
        socket.data.roomId = cleanRoomId;
        socket.data.username = null;
        socket.data.isAdmin = true;
        socket.emit("chat_history", getRoomMessages(cleanRoomId));
        return;
      }

      presence.removeUserFromOtherRooms(session.username, cleanRoomId);

      if (socket.data.roomId && socket.data.roomId !== cleanRoomId) {
        presence.removeSocketPresence(socket, { announce: true });
      }

      presence.addSocketToRoom(socket, cleanRoomId, session.username);
      markRoomRead(session.userId, cleanRoomId);

      console.log(`${session.username} joined room ${cleanRoomId}`);

      socket.emit("chat_history", getRoomMessages(cleanRoomId));
      presence.emitRoomsPresence();

      socket.to(cleanRoomId).emit("system_message", {
        text: `${session.username} joined the chat`,
        createdAt: Date.now(),
      });
    });

    socket.on("leave_room", ({ roomId }) => {
      const cleanRoomId = String(roomId || "").trim();
      const session = getSocketSession(socket);

      if (!cleanRoomId || !session) {
        return;
      }

      if (socket.data.roomId !== cleanRoomId) {
        return;
      }

      endVoiceCall(getSocketCall(socket), "left_room", socket.id);

      if (session.isAdmin) {
        socket.leave(cleanRoomId);
        socket.data.roomId = null;
        socket.data.isAdmin = false;
        return;
      }

      console.log(`${session.username} left room ${cleanRoomId}`);
      presence.removeSocketPresence(socket, { announce: true });
    });

    socket.on("voice_call_request", ({ roomId, to }) => {
      const cleanRoomId = String(roomId || "").trim();
      const targetUsername = String(to || "").trim();
      const session = getSocketSession(socket);

      if (
        !cleanRoomId ||
        !targetUsername ||
        !session ||
        session.isAdmin ||
        socket.data.roomId !== cleanRoomId ||
        !getRoom(cleanRoomId)
      ) {
        return;
      }

      if (targetUsername === session.username) {
        socket.emit("voice_call_error", {
          message: "Cannot call yourself. / 不能呼叫自己。",
        });
        return;
      }

      const existingCall = Array.from(roomCalls.values()).find(
        (call) => call.roomId === cleanRoomId,
      );

      if (existingCall) {
        socket.emit("voice_call_error", {
          message: "This room already has an active call. / 这个房间已有通话。",
        });
        return;
      }

      const targetSocket = findRoomSocketByUsername(cleanRoomId, targetUsername);

      if (!targetSocket) {
        socket.emit("voice_call_error", {
          message: "User is not available. / 对方当前不可用。",
        });
        return;
      }

      const call = {
        id: `${Date.now()}-${socket.id}`,
        roomId: cleanRoomId,
        caller: session.username,
        callerSocketId: socket.id,
        callee: targetUsername,
        calleeSocketId: targetSocket.id,
        status: "ringing",
      };

      roomCalls.set(call.id, call);
      socket.data.voiceCallId = call.id;
      targetSocket.data.voiceCallId = call.id;

      socket.emit("voice_call_ringing", {
        callId: call.id,
        to: targetUsername,
      });
      targetSocket.emit("voice_call_incoming", {
        callId: call.id,
        from: session.username,
      });
    });

    socket.on("voice_call_accept", ({ callId }) => {
      const call = roomCalls.get(String(callId || ""));
      const session = getSocketSession(socket);

      if (!call || !session || call.calleeSocketId !== socket.id) {
        return;
      }

      call.status = "active";

      io.to(call.callerSocketId).emit("voice_call_accepted", {
        callId: call.id,
        by: session.username,
      });
      socket.emit("voice_call_accepted", {
        callId: call.id,
        by: session.username,
      });
    });

    socket.on("voice_call_reject", ({ callId }) => {
      const call = roomCalls.get(String(callId || ""));
      const session = getSocketSession(socket);

      if (!call || !session || call.calleeSocketId !== socket.id) {
        return;
      }

      io.to(call.callerSocketId).emit("voice_call_rejected", {
        callId: call.id,
        by: session.username,
      });
      endVoiceCall(call, "rejected", socket.id);
    });

    socket.on("voice_call_signal", ({ callId, signal }) => {
      const call = roomCalls.get(String(callId || ""));

      if (!call || !signal) {
        return;
      }

      const targetSocketId =
        socket.id === call.callerSocketId
          ? call.calleeSocketId
          : socket.id === call.calleeSocketId
            ? call.callerSocketId
            : null;

      if (!targetSocketId) {
        return;
      }

      io.to(targetSocketId).emit("voice_call_signal", {
        callId: call.id,
        signal,
      });
    });

    socket.on("voice_call_hangup", ({ callId }) => {
      const call = roomCalls.get(String(callId || "")) || getSocketCall(socket);

      endVoiceCall(call, "hangup", socket.id);
    });

    socket.on("send_message", ({ roomId, text }) => {
      const cleanRoomId = String(roomId || "").trim();
      const cleanText = String(text || "").trim();
      const session = getSocketSession(socket);

      if (!cleanRoomId || !session || !cleanText || !getRoom(cleanRoomId)) {
        return;
      }

      if (session.isAdmin) {
        return;
      }

      const message = createTextMessage(cleanRoomId, session, cleanText, {
        id: `${Date.now()}-${socket.id}`,
      });

      io.to(cleanRoomId).emit("receive_message", message);
      markActiveRoomUsersRead(io, getSocketSession, cleanRoomId, message.createdAt);
      presence.emitRoomsPresence();
    });

    socket.on("disconnect", () => {
      endVoiceCall(getSocketCall(socket), "disconnected", socket.id);

      if (socket.data.isAdmin && socket.data.roomId) {
        socket.leave(socket.data.roomId);
        return;
      }

      presence.removeSocketPresence(socket, { announce: true });
      console.log("User disconnected:", socket.id);
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
