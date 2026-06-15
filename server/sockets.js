const {
  createTextMessage,
  getRoom,
  getRoomMessages,
  markActiveRoomUsersRead,
  markRoomRead,
} = require("./messages");
const { sendPushToRoom } = require("./pushNotifications");

function registerSocketHandlers(io, { getSocketSession, presence }) {
  const roomCalls = new Map();

  async function findOnlineSocketByUsername(username, excludedSocketId = "") {
    for (const candidateSocket of io.sockets.sockets.values()) {
      if (candidateSocket.id === excludedSocketId || candidateSocket.data.voiceCallId) {
        continue;
      }

      const session = await getSocketSession(candidateSocket);

      if (!session || session.isAdmin || session.username !== username) {
        continue;
      }

      return candidateSocket;
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

  function formatCallDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  async function recordCompletedVoiceCall(call) {
    if (!call.startedAt || call.recordedAt) {
      return;
    }

    call.recordedAt = Date.now();
    const callLabel = call.callType === "video" ? "Video call" : "Voice call";

    const message = await createTextMessage(call.roomId, {
      userId: call.callerUserId,
      username: call.caller,
    }, `${callLabel}: ${call.caller} and ${call.callee}, duration ${formatCallDuration(call.recordedAt - call.startedAt)}.`, {
      createdAt: call.recordedAt,
      id: `${call.recordedAt}-${call.id}-call`,
    });

    io.to(call.roomId).emit("receive_message", message);
    await markActiveRoomUsersRead(io, getSocketSession, call.roomId, message.createdAt);
    await presence.emitRoomsPresence();
  }

  async function endVoiceCall(call, reason = "ended", endedBy = null) {
    if (!call || roomCalls.get(call.id) !== call) {
      return;
    }

    roomCalls.delete(call.id);
    clearSocketCallData(call);
    await recordCompletedVoiceCall(call);

    [call.callerSocketId, call.calleeSocketId].forEach((socketId) => {
      if (socketId !== endedBy) {
        io.to(socketId).emit("voice_call_ended", {
          callId: call.id,
          reason,
        });
      }
    });
  }

  io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);
    const initialSession = await getSocketSession(socket);
    socket.emit("rooms_presence", {
      rooms: await presence.getRoomsWithPresence(initialSession),
      onlineUsers: await presence.getOnlineUsers(),
    });
    if (initialSession) {
      await presence.emitRoomsPresence();
    }

    socket.on("join_room", async ({ roomId }) => {
      const cleanRoomId = String(roomId || "").trim();
      const session = await getSocketSession(socket);

      if (!cleanRoomId || !session || !(await getRoom(cleanRoomId))) {
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
        socket.emit("chat_history", await getRoomMessages(cleanRoomId));
        return;
      }

      await presence.removeUserFromOtherRooms(session.username, cleanRoomId);

      if (socket.data.roomId && socket.data.roomId !== cleanRoomId) {
        await presence.removeSocketPresence(socket, { announce: true });
      }

      presence.addSocketToRoom(socket, cleanRoomId, session.username);
      await markRoomRead(session.userId, cleanRoomId);

      console.log(`${session.username} joined room ${cleanRoomId}`);

      socket.emit("chat_history", await getRoomMessages(cleanRoomId));
      await presence.emitRoomsPresence();

      socket.to(cleanRoomId).emit("system_message", {
        text: `${session.username} joined the chat`,
        createdAt: Date.now(),
      });
    });

    socket.on("leave_room", async ({ roomId }) => {
      const cleanRoomId = String(roomId || "").trim();
      const session = await getSocketSession(socket);

      if (!cleanRoomId || !session) {
        return;
      }

      if (socket.data.roomId !== cleanRoomId) {
        return;
      }

      if (session.isAdmin) {
        socket.leave(cleanRoomId);
        socket.data.roomId = null;
        socket.data.isAdmin = false;
        return;
      }

      console.log(`${session.username} left room ${cleanRoomId}`);
      await presence.removeSocketPresence(socket, { announce: true });
    });

    socket.on("voice_call_request", async ({ roomId, to, callType }) => {
      const cleanRoomId = String(roomId || "").trim();
      const targetUsername = String(to || "").trim();
      const cleanCallType = callType === "video" ? "video" : "audio";
      const session = await getSocketSession(socket);

      if (
        !cleanRoomId ||
        !targetUsername ||
        !session ||
        session.isAdmin ||
        !(await getRoom(cleanRoomId))
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

      if (socket.data.voiceCallId) {
        socket.emit("voice_call_error", {
          message: "You are already in a call. / ä½ å·²ç»åœ¨é€šè¯ä¸­ã€‚",
        });
        return;
      }

      const targetSocket = await findOnlineSocketByUsername(targetUsername, socket.id);

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
        callerUserId: session.userId,
        callerSocketId: socket.id,
        callee: targetUsername,
        calleeSocketId: targetSocket.id,
        callType: cleanCallType,
        status: "ringing",
      };

      roomCalls.set(call.id, call);
      socket.data.voiceCallId = call.id;
      targetSocket.data.voiceCallId = call.id;

      socket.emit("voice_call_ringing", {
        callId: call.id,
        callType: call.callType,
        to: targetUsername,
      });
      targetSocket.emit("voice_call_incoming", {
        callId: call.id,
        callType: call.callType,
        from: session.username,
      });
    });

    socket.on("voice_call_accept", async ({ callId }) => {
      const call = roomCalls.get(String(callId || ""));
      const session = await getSocketSession(socket);

      if (!call || !session || call.calleeSocketId !== socket.id) {
        return;
      }

      call.status = "active";
      call.startedAt = call.startedAt || Date.now();

      io.to(call.callerSocketId).emit("voice_call_accepted", {
        callId: call.id,
        by: session.username,
        callType: call.callType,
        startedAt: call.startedAt,
      });
      socket.emit("voice_call_accepted", {
        callId: call.id,
        by: session.username,
        callType: call.callType,
        startedAt: call.startedAt,
      });
    });

    socket.on("voice_call_reject", async ({ callId }) => {
      const call = roomCalls.get(String(callId || ""));
      const session = await getSocketSession(socket);

      if (!call || !session || call.calleeSocketId !== socket.id) {
        return;
      }

      io.to(call.callerSocketId).emit("voice_call_rejected", {
        callId: call.id,
        by: session.username,
      });
      await endVoiceCall(call, "rejected", socket.id);
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

    socket.on("voice_call_hangup", async ({ callId }) => {
      const call = roomCalls.get(String(callId || "")) || getSocketCall(socket);

      await endVoiceCall(call, "hangup", socket.id);
    });

    socket.on("send_message", async ({ roomId, text }) => {
      const cleanRoomId = String(roomId || "").trim();
      const cleanText = String(text || "").trim();
      const session = await getSocketSession(socket);

      if (!cleanRoomId || !session || !cleanText || !(await getRoom(cleanRoomId))) {
        return;
      }

      if (session.isAdmin) {
        return;
      }

      const message = await createTextMessage(cleanRoomId, session, cleanText, {
        id: `${Date.now()}-${socket.id}`,
      });

      io.to(cleanRoomId).emit("receive_message", message);
      sendPushToRoom(cleanRoomId, session, message).catch((error) => {
        console.error("Failed to send push notification:", error);
      });
      await markActiveRoomUsersRead(io, getSocketSession, cleanRoomId, message.createdAt);
      await presence.emitRoomsPresence();
    });

    socket.on("disconnect", async () => {
      await endVoiceCall(getSocketCall(socket), "disconnected", socket.id);

      if (socket.data.isAdmin && socket.data.roomId) {
        socket.leave(socket.data.roomId);
        return;
      }

      await presence.removeSocketPresence(socket, { announce: true });
      await presence.emitRoomsPresence();
      console.log("User disconnected:", socket.id);
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
