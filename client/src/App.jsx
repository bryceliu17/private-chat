import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import ChatRoomView from "./components/ChatRoomView";
import LoginView from "./components/LoginView";
import RoomListView from "./components/RoomListView";
import "./App.css";

const API_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:5001`
  : (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, "");
const LAST_ROOM_ID_KEY = "private-chat:last-room-id";
const socket = io(API_URL, {
  withCredentials: true,
});

function readLastRoomId() {
  try {
    return window.localStorage.getItem(LAST_ROOM_ID_KEY) || "";
  } catch {
    return "";
  }
}

function saveLastRoomId(roomId) {
  try {
    window.localStorage.setItem(LAST_ROOM_ID_KEY, roomId);
  } catch {
    // Ignore storage failures; room restore is a convenience feature.
  }
}

function clearLastRoomId() {
  try {
    window.localStorage.removeItem(LAST_ROOM_ID_KEY);
  } catch {
    // Ignore storage failures; the in-memory room state is still cleared.
  }
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
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [voiceCall, setVoiceCall] = useState({
    callId: "",
    callType: "audio",
    peer: "",
    startedAt: 0,
    status: "idle",
  });
  const [callChoiceUser, setCallChoiceUser] = useState("");
  const [voiceCallElapsedSeconds, setVoiceCallElapsedSeconds] = useState(0);
  const [voiceCallError, setVoiceCallError] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);

  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomNotice, setRoomNotice] = useState("");

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [callChoiceRoomId, setCallChoiceRoomId] = useState("");
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messageInputRef = useRef(null);
  const messageListRef = useRef(null);
  const localVoiceStreamRef = useRef(null);
  const remoteVoiceStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
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
    setOnlineUsers(data.onlineUsers || []);
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
        setOnlineUsers(data.onlineUsers || []);
        setIsLoggedIn(true);

        if (data.isAdmin) {
          await loadAdminUsers();
        }

        const lastRoomId = readLastRoomId();
        const shouldRestoreRoom = (data.rooms || []).some((room) => room.id === lastRoomId);

        if (shouldRestoreRoom) {
          socket.emit("join_room", {
            roomId: lastRoomId,
          });
          setRoomId(lastRoomId);
          setJoined(true);
          setCallChoiceUser("");
          setRoomNotice("");
        } else {
          clearLastRoomId();
        }
      } catch {
        setUsername("");
        setIsAdmin(false);
        setRooms([]);
        setOnlineUsers([]);
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

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }

  function closePeerConnection() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    remoteVoiceStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  function resetVoiceCall() {
    closePeerConnection();
    stopLocalVoiceStream();
    setVoiceCall({
      callId: "",
      callType: "audio",
      peer: "",
      startedAt: 0,
      status: "idle",
    });
    setCallChoiceUser("");
    setCallChoiceRoomId("");
    setVoiceCallElapsedSeconds(0);
  }

  function attachVoiceMediaStreams(callType = voiceCallRef.current.callType) {
    if (localVideoRef.current && callType === "video") {
      localVideoRef.current.srcObject = localVoiceStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }

    if (remoteVideoRef.current && callType === "video") {
      remoteVideoRef.current.srcObject = remoteVoiceStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
      return;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteVoiceStreamRef.current;
      remoteAudioRef.current.play().catch(() => {});
    }
  }

  async function getLocalVoiceStream(callType = "audio") {
    if (localVoiceStreamRef.current) {
      attachVoiceMediaStreams(callType);
      return localVoiceStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      throw new Error("Voice call is not supported in this browser. / 当前浏览器不支持语音通话。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === "video",
    });

    localVoiceStreamRef.current = stream;
    attachVoiceMediaStreams(callType);

    return stream;
  }

  async function createPeerConnection(callId, { callType = "audio", shouldCreateOffer = false } = {}) {
    const stream = await getLocalVoiceStream(callType);
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
      remoteVoiceStreamRef.current = event.streams[0];
      attachVoiceMediaStreams(callType);
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
      const currentCall = voiceCallRef.current;

      if (!peerConnection) {
        peerConnection = await createPeerConnection(callId, {
          callType: currentCall.callType,
        });
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
            callType: current.callType || "audio",
            startedAt: current.startedAt || Date.now(),
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

    socket.on("rooms_presence", ({ rooms: updatedRooms, onlineUsers: updatedOnlineUsers }) => {
      if (Array.isArray(updatedOnlineUsers)) {
        setOnlineUsers(updatedOnlineUsers);
      }

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
      clearLastRoomId();
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

    socket.on("voice_call_incoming", ({ callId, callType = "audio", from }) => {
      setVoiceCallError("");
      setVoiceCall({
        callId,
        callType,
        peer: from,
        startedAt: 0,
        status: "incoming",
      });
    });

    socket.on("voice_call_ringing", ({ callId, callType = "audio", to }) => {
      setVoiceCallError("");
      setVoiceCall({
        callId,
        callType,
        peer: to,
        startedAt: 0,
        status: "ringing",
      });
    });

    socket.on("voice_call_accepted", async ({ callId, callType = "audio", startedAt }) => {
      const currentCall = voiceCallRef.current;

      if (currentCall.callId !== callId) {
        return;
      }

      try {
        setVoiceCall((current) => ({
          ...current,
          callType,
          startedAt: startedAt || current.startedAt || Date.now(),
          status: "connecting",
        }));

        if (!peerConnectionRef.current) {
          await createPeerConnection(callId, {
            callType,
            shouldCreateOffer: currentCall.status === "ringing",
          });
        }

        setVoiceCall((current) => ({
          ...current,
          callType,
          startedAt: startedAt || current.startedAt || Date.now(),
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
    if (!voiceCall.startedAt || !["connecting", "active"].includes(voiceCall.status)) {
      setVoiceCallElapsedSeconds(0);
      return undefined;
    }

    const updateElapsed = () => {
      setVoiceCallElapsedSeconds(Math.max(0, Math.floor((Date.now() - voiceCall.startedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(timer);
  }, [voiceCall.startedAt, voiceCall.status]);

  useEffect(() => {
    if (voiceCall.status === "idle") {
      return;
    }

    attachVoiceMediaStreams(voiceCall.callType);
  }, [joined, voiceCall.callType, voiceCall.status]);

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

    saveLastRoomId(targetRoomId);
    setRoomId(targetRoomId);
    setJoined(true);
    setCallChoiceUser("");
    setCallChoiceRoomId("");
  };

  const leaveRoom = () => {
    socket.emit("leave_room", {
      roomId,
    });

    clearLastRoomId();
    setJoined(false);
    setRoomId("");
    setMessage("");
    setMessages([]);
    setImageUploadError("");
    setCallChoiceUser("");
    setCallChoiceRoomId("");
  };

  const openCallChoice = (targetUsername, targetRoomId = roomId) => {
    if (voiceCallRef.current.status !== "idle") {
      setVoiceCallError("You are already in a voice call. / 你已经在通话中。");
      return;
    }

    setCallChoiceRoomId(targetRoomId);
    setCallChoiceUser(targetUsername);
  };

  const startVoiceCall = (targetUsername, callType = "audio") => {
    if (voiceCallRef.current.status !== "idle") {
      setVoiceCallError("You are already in a voice call.");
      return;
    }

    setVoiceCallError("");
    setCallChoiceUser("");
    setCallChoiceRoomId("");
    socket.emit("voice_call_request", {
      callType,
      roomId: callChoiceRoomId || roomId,
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
      await createPeerConnection(currentCall.callId, {
        callType: currentCall.callType,
      });
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
    if (voiceCallRef.current.callId) {
      socket.emit("voice_call_hangup", {
        callId: voiceCallRef.current.callId,
      });
      resetVoiceCall();
    }

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
    setOnlineUsers([]);
    setAdminUsers([]);
    setImageUploadError("");
    setRoomNotice("");
    setAdminMessage("");
  };

  const startSupportPayment = async () => {
    setImageUploadError("");
    setAdminMessage("");

    try {
      const response = await fetch(`${API_URL}/api/payments/create-checkout-session`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data.url) {
        const errorMessage = data.message || "Cannot start payment.";

        if (joined) {
          setImageUploadError(errorMessage);
        } else {
          setAdminMessage(errorMessage);
        }
        return;
      }

      window.location.assign(data.url);
    } catch {
      const errorMessage = "Cannot connect to payment service.";

      if (joined) {
        setImageUploadError(errorMessage);
      } else {
        setAdminMessage(errorMessage);
      }
    }
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

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Cannot read file"));
      reader.readAsDataURL(file);
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
      setIsUploadMenuOpen(false);
    } catch {
      setImageUploadError("Cannot upload the image.");
    } finally {
      setIsUploadingImage(false);

      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const uploadFileMessage = async (file) => {
    if (!file) {
      return;
    }

    setIsUploadingFile(true);
    setImageUploadError("");

    try {
      const fileData = await readFileAsDataUrl(file);
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/files`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          fileData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setImageUploadError(data.message || "File upload failed.");
        return;
      }

      setIsUploadMenuOpen(false);
    } catch {
      setImageUploadError("Cannot upload the file.");
    } finally {
      setIsUploadingFile(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const uploadVideoMessage = async (file) => {
    if (!file) {
      return;
    }

    setIsUploadingVideo(true);
    setImageUploadError("");

    try {
      const videoData = await readFileAsDataUrl(file);
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/videos`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          videoData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setImageUploadError(data.message || "Video upload failed.");
        return;
      }

      setIsUploadMenuOpen(false);
    } catch {
      setImageUploadError("Cannot upload the video.");
    } finally {
      setIsUploadingVideo(false);

      if (videoInputRef.current) {
        videoInputRef.current.value = "";
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
        acceptVoiceCall={acceptVoiceCall}
        adminMessage={adminMessage}
        adminUsers={adminUsers}
        callChoiceUser={callChoiceUser}
        enterRoom={enterRoom}
        hangupVoiceCall={hangupVoiceCall}
        isAdmin={isAdmin}
        loadAdminUsers={loadAdminUsers}
        localVideoRef={localVideoRef}
        logout={logout}
        onlineUsers={onlineUsers}
        openCallChoice={openCallChoice}
        rejectVoiceCall={rejectVoiceCall}
        remoteAudioRef={remoteAudioRef}
        remoteVideoRef={remoteVideoRef}
        roomNotice={roomNotice}
        rooms={rooms}
        savingMfaUserId={savingMfaUserId}
        savingPasswordUserId={savingPasswordUserId}
        savingUserId={savingUserId}
        setAdminUsers={setAdminUsers}
        setCallChoiceUser={setCallChoiceUser}
        startSupportPayment={startSupportPayment}
        startVoiceCall={startVoiceCall}
        updateAdminUserEmail={updateAdminUserEmail}
        updateAdminUserMfa={updateAdminUserMfa}
        updateAdminUserPassword={updateAdminUserPassword}
        username={username}
        voiceCall={voiceCall}
        voiceCallElapsedSeconds={voiceCallElapsedSeconds}
        voiceCallError={voiceCallError}
      />
    );
  }

  return (
    <ChatRoomView
      acceptVoiceCall={acceptVoiceCall}
      apiUrl={API_URL}
      callChoiceUser={callChoiceUser}
      deleteMessage={deleteMessage}
      fileInputRef={fileInputRef}
      hangupVoiceCall={hangupVoiceCall}
      imageInputRef={imageInputRef}
      imageUploadError={imageUploadError}
      isAdmin={isAdmin}
      isRecordingAudio={isRecordingAudio}
      isUploadMenuOpen={isUploadMenuOpen}
      isUploadingAudio={isUploadingAudio}
      isUploadingFile={isUploadingFile}
      isUploadingImage={isUploadingImage}
      isUploadingVideo={isUploadingVideo}
      leaveRoom={leaveRoom}
      localVideoRef={localVideoRef}
      message={message}
      messageInputRef={messageInputRef}
      messageListRef={messageListRef}
      messages={messages}
      openCallChoice={openCallChoice}
      rejectVoiceCall={rejectVoiceCall}
      remoteAudioRef={remoteAudioRef}
      remoteVideoRef={remoteVideoRef}
      roomId={roomId}
      rooms={rooms}
      sendMessage={sendMessage}
      setCallChoiceUser={setCallChoiceUser}
      setIsUploadMenuOpen={setIsUploadMenuOpen}
      setMessage={setMessage}
      startAudioRecording={startAudioRecording}
      startSupportPayment={startSupportPayment}
      startVoiceCall={startVoiceCall}
      stopAudioRecording={stopAudioRecording}
      uploadFileMessage={uploadFileMessage}
      uploadImageMessage={uploadImageMessage}
      uploadVideoMessage={uploadVideoMessage}
      username={username}
      videoInputRef={videoInputRef}
      voiceCall={voiceCall}
      voiceCallElapsedSeconds={voiceCallElapsedSeconds}
      voiceCallError={voiceCallError}
    />
  );
}

export default App;

