import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import LoginView from "./components/LoginView";
import RoomListView from "./components/RoomListView";
import "./App.css";

const API_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:5001`
  : window.location.origin;
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const TRAILING_URL_PUNCTUATION = /[.,!?;:]+$/;
const socket = io(API_URL, {
  withCredentials: true,
});

function formatMessageTime(createdAt) {
  if (!createdAt) {
    return "";
  }

  const timestamp =
    typeof createdAt === "string" && /^\d+$/.test(createdAt)
      ? Number(createdAt)
      : createdAt;
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function renderMessageText(text) {
  const safeText = String(text || "");
  const parts = [];
  let lastIndex = 0;

  for (const match of safeText.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const startIndex = match.index ?? 0;
    const displayUrl = rawUrl.replace(TRAILING_URL_PUNCTUATION, "");
    const trailingText = rawUrl.slice(displayUrl.length);
    const href = displayUrl.startsWith("www.")
      ? `https://${displayUrl}`
      : displayUrl;

    if (startIndex > lastIndex) {
      parts.push(safeText.slice(lastIndex, startIndex));
    }

    parts.push(
      <a
        className="message-link"
        href={href}
        key={`${startIndex}-${displayUrl}`}
        rel="noreferrer noopener"
        target="_blank"
      >
        {displayUrl}
      </a>
    );

    if (trailingText) {
      parts.push(trailingText);
    }

    lastIndex = startIndex + rawUrl.length;
  }

  if (lastIndex < safeText.length) {
    parts.push(safeText.slice(lastIndex));
  }

  return parts.length ? parts : safeText;
}

function IconPhoto() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z" />
      <path d="m8 16 2.4-3 2 2.3 1.6-1.8 2 2.5" />
      <path d="M15.5 8.5h.01" />
    </svg>
  );
}

function IconMic() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 8h8v8H8z" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 4l16 8-16 8 3-8-3-8Z" />
      <path d="M7 12h13" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L8 9.7a16 16 0 0 0 6.3 6.3l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9Z" />
    </svg>
  );
}

function App() {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [savingUserId, setSavingUserId] = useState(null);
  const [savingPasswordUserId, setSavingPasswordUserId] = useState(null);
  const [savingMfaUserId, setSavingMfaUserId] = useState(null);
  const [deletingRoomId, setDeletingRoomId] = useState("");
  const [imageUploadError, setImageUploadError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [voiceCall, setVoiceCall] = useState({
    callId: "",
    peer: "",
    status: "idle",
  });
  const [voiceCallError, setVoiceCallError] = useState("");

  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomNotice, setRoomNotice] = useState("");

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const imageInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messageInputRef = useRef(null);
  const messageListRef = useRef(null);
  const localVoiceStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const voiceCallRef = useRef(voiceCall);
  const ringtoneAudioContextRef = useRef(null);
  const ringtoneGainRef = useRef(null);
  const ringtoneIntervalRef = useRef(null);
  const ringtoneUnlockedRef = useRef(false);

  const loadRooms = async () => {
    const response = await fetch(`${API_URL}/api/rooms`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Cannot load rooms");
    }

    const data = await response.json();
    setUsername(data.username);
    setIsAdmin(Boolean(data.isAdmin));
    setRooms(data.rooms);
    setIsLoggedIn(true);
  };

  const loadAdminUsers = async () => {
    const response = await fetch(`${API_URL}/api/admin/users`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Cannot load users");
    }

    const data = await response.json();
    setAdminUsers(
      (data.users || []).map((user) => ({
        ...user,
        originalEmail: user.email || "",
        originalMfaEnabled: Boolean(user.mfaEnabled),
        mfaEnabled: Boolean(user.mfaEnabled),
        newPassword: "",
      }))
    );
  };

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const response = await fetch(`${API_URL}/api/rooms`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("No active session");
        }

        const data = await response.json();
        setUsername(data.username);
        setIsAdmin(Boolean(data.isAdmin));
        setRooms(data.rooms);
        setIsLoggedIn(true);

        if (data.isAdmin) {
          await loadAdminUsers();
        }
      } catch {
        setUsername("");
        setIsAdmin(false);
        setRooms([]);
        setAdminUsers([]);
        setIsLoggedIn(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    voiceCallRef.current = voiceCall;
  }, [voiceCall]);

  function ensureRingtoneContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      return null;
    }

    if (!ringtoneAudioContextRef.current) {
      const audioContext = new AudioContext();
      const gain = audioContext.createGain();

      gain.gain.value = 0;
      gain.connect(audioContext.destination);
      ringtoneAudioContextRef.current = audioContext;
      ringtoneGainRef.current = gain;
    }

    return ringtoneAudioContextRef.current;
  }

  function playRingtonePulse() {
    const audioContext = ensureRingtoneContext();
    const masterGain = ringtoneGainRef.current;

    if (!audioContext || !masterGain) {
      return;
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const now = audioContext.currentTime;
    const toneGain = audioContext.createGain();
    const oscillator = audioContext.createOscillator();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(660, now + 0.28);
    toneGain.gain.setValueAtTime(0.001, now);
    toneGain.gain.linearRampToValueAtTime(0.75, now + 0.02);
    toneGain.gain.linearRampToValueAtTime(0.75, now + 0.62);
    toneGain.gain.linearRampToValueAtTime(0.001, now + 0.72);

    oscillator.connect(toneGain);
    toneGain.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.74);
  }

  function unlockRingtoneAudio() {
    if (ringtoneUnlockedRef.current) {
      return;
    }

    const audioContext = ensureRingtoneContext();
    const masterGain = ringtoneGainRef.current;

    if (!audioContext || !masterGain) {
      return;
    }

    audioContext.resume().catch(() => {});

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const silentGain = audioContext.createGain();

    silentGain.gain.setValueAtTime(0.0001, now);
    oscillator.frequency.setValueAtTime(440, now);
    oscillator.connect(silentGain);
    silentGain.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.03);
    ringtoneUnlockedRef.current = true;
  }

  function startRingtone() {
    if (ringtoneIntervalRef.current) {
      return;
    }

    const audioContext = ensureRingtoneContext();
    const masterGain = ringtoneGainRef.current;

    if (!audioContext || !masterGain) {
      return;
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    masterGain.gain.setTargetAtTime(0.16, audioContext.currentTime, 0.01);
    playRingtonePulse();
    ringtoneIntervalRef.current = window.setInterval(playRingtonePulse, 1400);
  }

  function stopRingtone() {
    if (ringtoneIntervalRef.current) {
      window.clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }

    const audioContext = ringtoneAudioContextRef.current;
    const masterGain = ringtoneGainRef.current;

    if (audioContext && masterGain) {
      masterGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.02);
    }
  }

  useEffect(() => {
    if (voiceCall.status === "incoming" || voiceCall.status === "ringing") {
      startRingtone();
      return;
    }

    stopRingtone();
  }, [voiceCall.status]);

  useEffect(() => () => stopRingtone(), []);

  useEffect(() => {
    const unlock = () => unlockRingtoneAudio();

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  function stopLocalVoiceStream() {
    localVoiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    localVoiceStreamRef.current = null;
  }

  function closePeerConnection() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }

  function resetVoiceCall() {
    closePeerConnection();
    stopLocalVoiceStream();
    setVoiceCall({
      callId: "",
      peer: "",
      status: "idle",
    });
  }

  async function getLocalVoiceStream() {
    if (localVoiceStreamRef.current) {
      return localVoiceStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      throw new Error("Voice call is not supported in this browser. / 当前浏览器不支持语音通话。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    localVoiceStreamRef.current = stream;
    return stream;
  }

  async function createPeerConnection(callId, { shouldCreateOffer = false } = {}) {
    const stream = await getLocalVoiceStream();
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    });

    peerConnectionRef.current = peerConnection;

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    peerConnection.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("voice_call_signal", {
          callId,
          signal: {
            candidate: event.candidate,
          },
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(peerConnection.connectionState)) {
        resetVoiceCall();
      }
    };

    if (shouldCreateOffer) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("voice_call_signal", {
        callId,
        signal: {
          description: peerConnection.localDescription,
        },
      });
    }

    return peerConnection;
  }

  async function handleVoiceSignal({ callId, signal }) {
    try {
      let peerConnection = peerConnectionRef.current;

      if (!peerConnection) {
        peerConnection = await createPeerConnection(callId);
      }

      if (signal.description) {
        await peerConnection.setRemoteDescription(signal.description);

        if (signal.description.type === "offer") {
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit("voice_call_signal", {
            callId,
            signal: {
              description: peerConnection.localDescription,
            },
          });
          setVoiceCall((current) => ({
            ...current,
            status: "active",
          }));
        }
      }

      if (signal.candidate) {
        await peerConnection.addIceCandidate(signal.candidate);
      }
    } catch (error) {
      setVoiceCallError(error.message || "Voice call failed. / 语音通话失败。");
      socket.emit("voice_call_hangup", { callId });
      resetVoiceCall();
    }
  }

  useEffect(() => {
    socket.on("chat_history", (history) => {
      setMessages(history);
    });

    socket.on("receive_message", (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
    });

    socket.on("message_deleted", ({ id }) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== id));
    });

    socket.on("system_message", (systemMessage) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          username: "System",
          text: systemMessage.text,
          createdAt: systemMessage.createdAt,
          type: "system",
        },
      ]);
    });

    socket.on("rooms_presence", ({ rooms: updatedRooms }) => {
      setRooms((prevRooms) => {
        if (!Array.isArray(updatedRooms)) {
          return prevRooms;
        }

        if (!prevRooms.length) {
          return updatedRooms;
        }

        const roomsById = new Map(updatedRooms.map((room) => [room.id, room]));

        return prevRooms.map((room) => ({
          ...room,
          ...(roomsById.get(room.id) || {}),
          onlineUsers: roomsById.get(room.id)?.onlineUsers || [],
        }));
      });
    });

    socket.on("force_leave_room", ({ message }) => {
      if (voiceCallRef.current.callId) {
        socket.emit("voice_call_hangup", {
          callId: voiceCallRef.current.callId,
        });
      }

      resetVoiceCall();
      setJoined(false);
      setRoomId("");
      setMessage("");
      setMessages([]);
      setImageUploadError("");
      setRoomNotice(
        message ||
          "This account joined another room in a different window. / 此账号已在其他窗口加入另一个房间。"
      );
    });

    socket.on("voice_call_incoming", ({ callId, from }) => {
      setVoiceCallError("");
      setVoiceCall({
        callId,
        peer: from,
        status: "incoming",
      });
    });

    socket.on("voice_call_ringing", ({ callId, to }) => {
      setVoiceCallError("");
      setVoiceCall({
        callId,
        peer: to,
        status: "ringing",
      });
    });

    socket.on("voice_call_accepted", async ({ callId }) => {
      const currentCall = voiceCallRef.current;

      if (currentCall.callId !== callId) {
        return;
      }

      try {
        setVoiceCall((current) => ({
          ...current,
          status: "connecting",
        }));

        if (!peerConnectionRef.current) {
          await createPeerConnection(callId, {
            shouldCreateOffer: currentCall.status === "ringing",
          });
        }

        setVoiceCall((current) => ({
          ...current,
          status: "active",
        }));
      } catch (error) {
        setVoiceCallError(error.message || "Cannot start voice call. / 无法开始语音通话。");
        socket.emit("voice_call_hangup", { callId });
        resetVoiceCall();
      }
    });

    socket.on("voice_call_rejected", () => {
      setVoiceCallError("Voice call was declined. / 对方已拒绝通话。");
      resetVoiceCall();
    });

    socket.on("voice_call_ended", ({ reason }) => {
      setVoiceCallError(
        reason === "rejected"
          ? "Voice call was declined. / 对方已拒绝通话。"
          : "Voice call ended. / 语音通话已结束。"
      );
      resetVoiceCall();
    });

    socket.on("voice_call_error", ({ message }) => {
      setVoiceCallError(message || "Voice call failed. / 语音通话失败。");
      resetVoiceCall();
    });

    socket.on("voice_call_signal", handleVoiceSignal);

    return () => {
      socket.off("chat_history");
      socket.off("receive_message");
      socket.off("message_deleted");
      socket.off("system_message");
      socket.off("rooms_presence");
      socket.off("force_leave_room");
      socket.off("voice_call_incoming");
      socket.off("voice_call_ringing");
      socket.off("voice_call_accepted");
      socket.off("voice_call_rejected");
      socket.off("voice_call_ended");
      socket.off("voice_call_error");
      socket.off("voice_call_signal");
    };
  }, []);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    const input = messageInputRef.current;

    if (!input) {
      return;
    }

    input.style.height = "0px";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [message]);

  const reconnectSocket = () => {
    socket.disconnect();
    socket.connect();
  };

  const login = async () => {
    const cleanLoginName = loginName.trim();

    if (!cleanLoginName || !password) {
      setLoginError("Please enter username and password.");
      return;
    }

    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: cleanLoginName,
          password,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        setLoginError(
          error?.message ||
            "Invalid username or password. / 用户名或密码无效。"
        );
        return;
      }

      const user = await response.json();

      if (user.requiresMfa) {
        setMfaToken(user.mfaToken);
        setMfaCode("");
        setPassword("");
        return;
      }

      reconnectSocket();
      setUsername(user.username);
      setIsAdmin(Boolean(user.isAdmin));
      setPassword("");
      await loadRooms();

      if (user.isAdmin) {
        await loadAdminUsers();
      }
    } catch {
      setLoginError("Cannot connect to the server.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const verifyMfa = async () => {
    if (!mfaCode.trim()) {
      setLoginError("Please enter the verification code. / 请输入验证码。");
      return;
    }

    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch(`${API_URL}/api/login/mfa`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mfaToken,
          code: mfaCode.trim(),
        }),
      });

      if (!response.ok) {
        setLoginError("Invalid or expired verification code. / 验证码无效或已过期。");
        return;
      }

      const user = await response.json();

      reconnectSocket();
      setUsername(user.username);
      setIsAdmin(Boolean(user.isAdmin));
      setMfaToken("");
      setMfaCode("");
      await loadRooms();

      if (user.isAdmin) {
        await loadAdminUsers();
      }
    } catch {
      setLoginError("Cannot connect to the server.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const enterRoom = (targetRoomId) => {
    setRoomNotice("");
    setRooms((prevRooms) =>
      prevRooms.map((room) =>
        room.id === targetRoomId
          ? {
              ...room,
              unreadCount: 0,
            }
          : room
      )
    );

    socket.emit("join_room", {
      roomId: targetRoomId,
    });

    setRoomId(targetRoomId);
    setJoined(true);
  };

  const leaveRoom = () => {
    if (voiceCallRef.current.callId) {
      socket.emit("voice_call_hangup", {
        callId: voiceCallRef.current.callId,
      });
      resetVoiceCall();
    }

    socket.emit("leave_room", {
      roomId,
    });

    setJoined(false);
    setRoomId("");
    setMessage("");
    setMessages([]);
    setImageUploadError("");
  };

  const startVoiceCall = (targetUsername) => {
    if (voiceCallRef.current.status !== "idle") {
      setVoiceCallError("You are already in a voice call. / 你已经在通话中。");
      return;
    }

    setVoiceCallError("");
    socket.emit("voice_call_request", {
      roomId,
      to: targetUsername,
    });
  };

  const acceptVoiceCall = async () => {
    const currentCall = voiceCallRef.current;

    if (!currentCall.callId) {
      return;
    }

    try {
      setVoiceCallError("");
      await createPeerConnection(currentCall.callId);
      setVoiceCall((current) => ({
        ...current,
        status: "connecting",
      }));
      socket.emit("voice_call_accept", {
        callId: currentCall.callId,
      });
    } catch (error) {
      setVoiceCallError(error.message || "Cannot start voice call. / 无法开始语音通话。");
      socket.emit("voice_call_hangup", {
        callId: currentCall.callId,
      });
      resetVoiceCall();
    }
  };

  const rejectVoiceCall = () => {
    const currentCall = voiceCallRef.current;

    if (currentCall.callId) {
      socket.emit("voice_call_reject", {
        callId: currentCall.callId,
      });
    }

    resetVoiceCall();
  };

  const hangupVoiceCall = () => {
    const currentCall = voiceCallRef.current;

    if (currentCall.callId) {
      socket.emit("voice_call_hangup", {
        callId: currentCall.callId,
      });
    }

    resetVoiceCall();
  };

  const logout = async () => {
    if (joined) {
      leaveRoom();
    }

    await fetch(`${API_URL}/api/logout`, {
      method: "POST",
      credentials: "include",
    });

    reconnectSocket();
    setLoginName("");
    setUsername("");
    setIsAdmin(false);
    setMfaToken("");
    setMfaCode("");
    setIsLoggedIn(false);
    setRooms([]);
    setAdminUsers([]);
    setImageUploadError("");
    setRoomNotice("");
    setAdminMessage("");
  };

  const updateAdminUserEmail = async (targetUserId) => {
    const targetUser = adminUsers.find((user) => user.id === targetUserId);

    if (!targetUser) {
      return;
    }

    const previousEmail = targetUser.originalEmail || "";
    const nextEmail = String(targetUser.email || "").trim();

    if (previousEmail === nextEmail) {
      setAdminMessage("Email has not changed. / 邮箱没有变化。");
      return;
    }

    const confirmed = window.confirm(
      `Change email for ${targetUser.username}?\n\nCurrent / 当前: ${previousEmail || "(empty)"}\nNew / 新: ${nextEmail || "(empty)"}\n\n确定要修改这个邮箱吗？`
    );

    if (!confirmed) {
      return;
    }

    setSavingUserId(targetUserId);
    setAdminMessage("");

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${targetUserId}/email`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: nextEmail,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setAdminMessage(data.message || "Email update failed / 邮箱更新失败");
        return;
      }

      setAdminUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === data.user.id
            ? {
                ...data.user,
                originalEmail: data.user.email || "",
                originalMfaEnabled: Boolean(data.user.mfaEnabled),
                mfaEnabled: Boolean(data.user.mfaEnabled),
                newPassword: user.newPassword || "",
              }
            : user
        )
      );
      setAdminMessage(
        `Updated email for ${data.user.username}. / 已更新 ${data.user.username} 的邮箱。`
      );
    } catch {
      setAdminMessage("Cannot connect to the server. / 无法连接服务器。");
    } finally {
      setSavingUserId(null);
    }
  };

  const updateAdminUserPassword = async (targetUserId) => {
    const targetUser = adminUsers.find((user) => user.id === targetUserId);
    const newPassword = String(targetUser?.newPassword || "");

    if (!targetUser || !newPassword) {
      setAdminMessage("Enter a new password first. / 请先输入新密码。");
      return;
    }

    const confirmed = window.confirm(
      `Set a new password for ${targetUser.username}?\n\nThe old password cannot be viewed.\n确定要直接为这个账号设置新密码吗？旧密码不会显示。`
    );

    if (!confirmed) {
      return;
    }

    setSavingPasswordUserId(targetUserId);
    setAdminMessage("");

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${targetUserId}/password`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: newPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setAdminMessage(data.message || "Password update failed / 密码更新失败");
        return;
      }

      setAdminUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === data.user.id
            ? {
                ...user,
                newPassword: "",
              }
            : user
        )
      );
      setAdminMessage(
        `Updated password for ${data.user.username}. / 已更新 ${data.user.username} 的密码。`
      );
    } catch {
      setAdminMessage("Cannot connect to the server. / 无法连接服务器。");
    } finally {
      setSavingPasswordUserId(null);
    }
  };

  const updateAdminUserMfa = async (targetUserId) => {
    const targetUser = adminUsers.find((user) => user.id === targetUserId);

    if (!targetUser) {
      return;
    }

    const nextMfaEnabled = Boolean(targetUser.mfaEnabled);

    if (Boolean(targetUser.originalMfaEnabled) === nextMfaEnabled) {
      setAdminMessage("MFA has not changed. / 邮箱验证没有变化。");
      return;
    }

    if (nextMfaEnabled && !String(targetUser.email || "").trim()) {
      setAdminMessage("Set an email before enabling MFA. / 启用邮箱验证前请先设置邮箱。");
      return;
    }

    const confirmed = window.confirm(
      `${nextMfaEnabled ? "Enable" : "Disable"} email verification for ${targetUser.username}?\n\n确定要${nextMfaEnabled ? "开启" : "关闭"}这个账号的邮箱验证吗？`
    );

    if (!confirmed) {
      return;
    }

    setSavingMfaUserId(targetUserId);
    setAdminMessage("");

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${targetUserId}/mfa`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mfaEnabled: nextMfaEnabled,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setAdminMessage(data.message || "MFA update failed / 邮箱验证更新失败");
        return;
      }

      setAdminUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === data.user.id
            ? {
                ...data.user,
                originalEmail: data.user.email || "",
                originalMfaEnabled: Boolean(data.user.mfaEnabled),
                mfaEnabled: Boolean(data.user.mfaEnabled),
                newPassword: user.newPassword || "",
              }
            : user
        )
      );
      setAdminMessage(
        `Updated email verification for ${data.user.username}. / 已更新 ${data.user.username} 的邮箱验证。`
      );
    } catch {
      setAdminMessage("Cannot connect to the server. / 无法连接服务器。");
    } finally {
      setSavingMfaUserId(null);
    }
  };

  const deleteRoomMessages = async (targetRoomId) => {
    const confirmed = window.confirm(
      `Delete all chat history in ${targetRoomId}? This also deletes uploaded images and voice messages.\n确定删除 ${targetRoomId} 的所有聊天记录吗？上传的图片和语音文件也会被删除。`
    );

    if (!confirmed) {
      return;
    }

    setDeletingRoomId(targetRoomId);
    setAdminMessage("");

    try {
      const response = await fetch(`${API_URL}/api/rooms/${targetRoomId}/messages`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setAdminMessage(data.message || "Delete failed / 删除失败");
        return;
      }

      setAdminMessage(
        `Deleted ${data.deletedMessages} messages from ${targetRoomId}. / 已删除 ${targetRoomId} 的 ${data.deletedMessages} 条聊天记录。`
      );
    } catch {
      setAdminMessage("Cannot connect to the server. / 无法连接服务器。");
    } finally {
      setDeletingRoomId("");
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      const response = await fetch(`${API_URL}/api/messages/${messageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setImageUploadError(data.message || "Delete failed / 删除失败");
        return;
      }

      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    } catch {
      setImageUploadError("Cannot connect to the server. / 无法连接服务器。");
    }
  };

  const readPhotoAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Cannot read photo"));
      reader.readAsDataURL(file);
    });

  const readBlobAsDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Cannot read audio"));
      reader.readAsDataURL(blob);
    });

  const uploadImageMessage = async (file) => {
    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    setImageUploadError("");

    try {
      const imageData = await readPhotoAsDataUrl(file);
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/photos`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          imageData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setImageUploadError(data.message || "Image upload failed.");
        return;
      }
    } catch {
      setImageUploadError("Cannot upload the image.");
    } finally {
      setIsUploadingImage(false);

      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const uploadAudioMessage = async (blob) => {
    if (!blob || !blob.size) {
      return;
    }

    setIsUploadingAudio(true);
    setImageUploadError("");

    try {
      const audioData = await readBlobAsDataUrl(blob);
      const extension = blob.type.includes("mp4")
        ? "mp4"
        : blob.type.includes("ogg")
          ? "ogg"
          : "webm";
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/audio`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: `voice-message.${extension}`,
          audioData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setImageUploadError(data.message || "Voice message upload failed.");
      }
    } catch {
      setImageUploadError("Cannot upload the voice message.");
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const startAudioRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setImageUploadError(
        "Audio recording is not supported in this browser. / 当前浏览器不支持录音。"
      );
      return;
    }

    setImageUploadError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = preferredTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        uploadAudioMessage(audioBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingAudio(true);
    } catch {
      setImageUploadError(
        "Cannot start recording. Please allow microphone access. / 无法开始录音，请允许麦克风权限。"
      );
    }
  };

  const stopAudioRecording = () => {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    mediaRecorderRef.current = null;
    setIsRecordingAudio(false);
  };

  const sendMessage = () => {
    const cleanMessage = message.trim();

    if (!cleanMessage) return;

    socket.emit("send_message", {
      roomId,
      text: cleanMessage,
    });

    setMessage("");
  };

  const currentRoom = rooms.find((room) => room.id === roomId);
  const currentRoomUsers = currentRoom?.onlineUsers || [];
  const currentRoomOtherUsers = currentRoomUsers.filter(
    (onlineUser) => onlineUser !== username
  );

  if (!isLoggedIn) {
    return (
      <LoginView
        isLoggingIn={isLoggingIn}
        login={login}
        loginError={loginError}
        loginName={loginName}
        mfaCode={mfaCode}
        mfaToken={mfaToken}
        password={password}
        setLoginName={setLoginName}
        setMfaCode={setMfaCode}
        setPassword={setPassword}
        setShowPassword={setShowPassword}
        showPassword={showPassword}
        verifyMfa={verifyMfa}
      />
    );
  }

  if (!joined) {
    return (
      <RoomListView
        adminMessage={adminMessage}
        adminUsers={adminUsers}
        enterRoom={enterRoom}
        isAdmin={isAdmin}
        loadAdminUsers={loadAdminUsers}
        logout={logout}
        roomNotice={roomNotice}
        rooms={rooms}
        savingMfaUserId={savingMfaUserId}
        savingPasswordUserId={savingPasswordUserId}
        savingUserId={savingUserId}
        setAdminUsers={setAdminUsers}
        updateAdminUserEmail={updateAdminUserEmail}
        updateAdminUserMfa={updateAdminUserMfa}
        updateAdminUserPassword={updateAdminUserPassword}
        username={username}
      />
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <div className="chat-title-row">
          <h2>Room / 房间: {roomId}</h2>
          <button className="leave-button" onClick={leaveRoom}>
            Leave / 离开
          </button>
        </div>
        <div className="room-online-row">
          <span className="room-online-label">Online / 在线:</span>
          {currentRoomUsers.length
            ? currentRoomUsers.map((onlineUser) => (
                <span className="room-user-chip" key={onlineUser}>
                  <span>{onlineUser}</span>
                  {onlineUser === username ? (
                    <span className="self-chip">You / 自己</span>
                  ) : !isAdmin ? (
                    <button
                      className="inline-call-button"
                      disabled={voiceCall.status !== "idle"}
                      title={`Call ${onlineUser} / 呼叫 ${onlineUser}`}
                      aria-label={`Call ${onlineUser} / 呼叫 ${onlineUser}`}
                      onClick={() => startVoiceCall(onlineUser)}
                    >
                      <IconPhone />
                    </button>
                  ) : null}
                </span>
              ))
            : <span>No one online / 暂无人在线</span>}
        </div>
      </div>

      {!isAdmin && voiceCall.status !== "idle" && (
        <div className="voice-call-panel">
          <div>
            <strong>
              {voiceCall.status === "incoming"
                ? `Incoming call / 来电: ${voiceCall.peer}`
                : voiceCall.status === "ringing"
                  ? `Calling / 呼叫中: ${voiceCall.peer}`
                  : voiceCall.status === "connecting"
                    ? `Connecting / 正在连接: ${voiceCall.peer}`
                    : `In call / 通话中: ${voiceCall.peer}`}
            </strong>
            <span>Only two people can be in a room call. / 每个房间同时只能两人通话。</span>
          </div>
          <div className="voice-call-actions">
            {voiceCall.status === "incoming" ? (
              <>
                <button className="voice-accept-button" onClick={acceptVoiceCall}>
                  Accept / 接听
                </button>
                <button className="voice-hangup-button" onClick={rejectVoiceCall}>
                  Decline / 拒绝
                </button>
              </>
            ) : (
              <button className="voice-hangup-button" onClick={hangupVoiceCall}>
                Hang up / 挂断
              </button>
            )}
          </div>
          <audio ref={remoteAudioRef} autoPlay playsInline />
        </div>
      )}

      {voiceCallError && (
        <p className="voice-call-error">{voiceCallError}</p>
      )}

      <div className="message-list" ref={messageListRef}>
        {messages.map((msg) => {
          const isMe = msg.username === username;
          const isSystem = msg.type === "system";

          return (
            <div
              key={msg.id}
              className={`message-row ${
                isSystem ? "system-row" : isMe ? "my-row" : "other-row"
              }`}
            >
              <div className={`message-stack ${isMe ? "my-stack" : "other-stack"}`}>
                {!isSystem && (
                  <div className="message-meta">
                    <span className="message-author">{msg.username}</span>
                    <span className="message-time">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  className={`message-bubble ${
                    isSystem ? "system-bubble" : isMe ? "my-bubble" : "other-bubble"
                  }`}
                >
                  {msg.type === "image" ? (
                    <a
                      className="chat-image-link"
                      href={`${API_URL}${msg.imageUrl}`}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <img
                        alt={msg.filename || "Shared image"}
                        className="chat-image"
                        src={`${API_URL}${msg.imageUrl}`}
                      />
                      <span>{msg.filename || "Shared image"}</span>
                    </a>
                  ) : msg.type === "audio" ? (
                    <div className="chat-audio-message">
                      <audio controls src={`${API_URL}${msg.audioUrl}`} />
                      <span>{msg.filename || "Voice message"}</span>
                    </div>
                  ) : (
                    <div>{renderMessageText(msg.text)}</div>
                  )}
                </div>
                {isAdmin && !isSystem && (
                  <button
                    className="delete-message-button"
                    onClick={() => deleteMessage(msg.id)}
                  >
                    Delete / 删除
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {imageUploadError && (
        <p className="image-upload-error">{imageUploadError}</p>
      )}

      {!isAdmin && (
      <div className="input-bar">
        <input
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="image-file-input"
          ref={imageInputRef}
          type="file"
          onChange={(e) => uploadImageMessage(e.target.files?.[0])}
        />
        <button
          className="image-upload-button"
          disabled={isUploadingImage}
          title="Photo / 图片"
          aria-label="Photo / 图片"
          onClick={() => imageInputRef.current?.click()}
        >
          {isUploadingImage ? "..." : <IconPhoto />}
        </button>
        <button
          className={`audio-record-button ${isRecordingAudio ? "is-recording" : ""}`}
          disabled={isUploadingAudio}
          title={isRecordingAudio ? "Stop recording / 停止录音" : "Voice / 语音"}
          aria-label={isRecordingAudio ? "Stop recording / 停止录音" : "Voice / 语音"}
          onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
        >
          {isRecordingAudio ? <IconStop /> : isUploadingAudio ? "..." : <IconMic />}
        </button>
        <textarea
          placeholder="Type a message / 输入消息..."
          ref={messageInputRef}
          rows={1}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <button
          className="send-button"
          title="Send / 发送"
          aria-label="Send / 发送"
          onClick={sendMessage}
        >
          <IconSend />
        </button>
      </div>
      )}
    </div>
  );
}

export default App;
