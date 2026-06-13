const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const TRAILING_URL_PUNCTUATION = /[.,!?;:]+$/;

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

function IconPlus() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
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

function IconVideo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 6h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
      <path d="m17 10 5-3v10l-5-3" />
    </svg>
  );
}

function IconFilm() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 5h16v14H4z" />
      <path d="M8 5v14" />
      <path d="M16 5v14" />
      <path d="M4 9h4" />
      <path d="M16 9h4" />
      <path d="M4 15h4" />
      <path d="M16 15h4" />
    </svg>
  );
}

function formatCallDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ChatRoomView({
  acceptVoiceCall,
  apiUrl,
  callChoiceUser,
  deleteMessage,
  fileInputRef,
  hangupVoiceCall,
  imageInputRef,
  imageUploadError,
  isAdmin,
  isRecordingAudio,
  isUploadMenuOpen,
  isUploadingAudio,
  isUploadingFile,
  isUploadingImage,
  isUploadingVideo,
  leaveRoom,
  localVideoRef,
  message,
  messageInputRef,
  messageListRef,
  messages,
  openCallChoice,
  rejectVoiceCall,
  remoteAudioRef,
  remoteVideoRef,
  roomId,
  rooms,
  sendMessage,
  setCallChoiceUser,
  setIsUploadMenuOpen,
  setMessage,
  startAudioRecording,
  startSupportPayment,
  startVoiceCall,
  stopAudioRecording,
  uploadFileMessage,
  uploadImageMessage,
  uploadVideoMessage,
  username,
  videoInputRef,
  voiceCall,
  voiceCallElapsedSeconds,
  voiceCallError,
}) {
  const currentRoom = rooms.find((room) => room.id === roomId);
  const currentRoomUsers = currentRoom?.onlineUsers || [];

  return (
    <div className="chat-page">
      <div className="chat-header">
        <div className="chat-title-row">
          <h2>Room / æˆ¿é—´: {roomId}</h2>
          <button className="support-button" onClick={startSupportPayment}>
            Support / æ‰“èµ
          </button>
          <button className="leave-button" onClick={leaveRoom}>
            Leave / ç¦»å¼€
          </button>
        </div>
        <div className="room-online-row">
          <span className="room-online-label">Online / åœ¨çº¿:</span>
          {currentRoomUsers.length
            ? currentRoomUsers.map((onlineUser) => (
                <span className="room-user-chip" key={onlineUser}>
                  <span>{onlineUser}</span>
                  {onlineUser === username ? (
                    <span className="self-chip">You / è‡ªå·±</span>
                  ) : !isAdmin ? (
                    <button
                      className="inline-call-button"
                      disabled={voiceCall.status !== "idle"}
                      title={`Call ${onlineUser}`}
                      aria-label={`Call ${onlineUser}`}
                      onClick={() => openCallChoice(onlineUser)}
                    >
                      <IconPhone />
                    </button>
                  ) : null}
                </span>
              ))
            : <span>No one online</span>}
        </div>
      </div>

      {!isAdmin && callChoiceUser && (
        <div className="call-choice-backdrop" role="dialog" aria-modal="true">
          <div className="call-choice-modal">
            <strong>Call {callChoiceUser}</strong>
            <span>Choose call type / é€‰æ‹©é€šè¯æ–¹å¼</span>
            <div className="call-choice-actions">
              <button type="button" onClick={() => startVoiceCall(callChoiceUser, "audio")}>
                <IconPhone />
                <span>Voice / è¯­éŸ³</span>
              </button>
              <button type="button" onClick={() => startVoiceCall(callChoiceUser, "video")}>
                <IconVideo />
                <span>Video / è§†é¢‘</span>
              </button>
            </div>
            <button className="call-choice-cancel" type="button" onClick={() => setCallChoiceUser("")}>
              Cancel / å–æ¶ˆ
            </button>
          </div>
        </div>
      )}

      {!isAdmin && voiceCall.status !== "idle" && (
        <div className="voice-call-panel">
          <div>
            <strong>
              {voiceCall.status === "incoming"
                ? `Incoming call / æ¥ç”µ: ${voiceCall.peer}`
                : voiceCall.status === "ringing"
                  ? `Calling / å‘¼å«ä¸­: ${voiceCall.peer}`
                  : voiceCall.status === "connecting"
                    ? `Connecting / æ­£åœ¨è¿žæŽ¥: ${voiceCall.peer}`
                    : `In call / é€šè¯ä¸­: ${voiceCall.peer}`}
            </strong>
            <span>Type / ç±»åž‹: {voiceCall.callType === "video" ? "Video / è§†é¢‘" : "Voice / è¯­éŸ³"}</span>
            <span>Only two people can be in a room call. / æ¯ä¸ªæˆ¿é—´åŒæ—¶åªèƒ½ä¸¤äººé€šè¯ã€‚</span>
            {voiceCall.startedAt ? (
              <span className="voice-call-timer">
                Duration / call time: {formatCallDuration(voiceCallElapsedSeconds)}
              </span>
            ) : null}
          </div>
          <div className="voice-call-actions">
            {voiceCall.status === "incoming" ? (
              <>
                <button className="voice-accept-button" onClick={acceptVoiceCall}>
                  Accept / æŽ¥å¬
                </button>
                <button className="voice-hangup-button" onClick={rejectVoiceCall}>
                  Decline / æ‹’ç»
                </button>
              </>
            ) : (
              <button className="voice-hangup-button" onClick={hangupVoiceCall}>
                Hang up / æŒ‚æ–­
              </button>
            )}
          </div>
          {voiceCall.callType === "video" && (
            <div className="video-call-stage">
              <video className="remote-video" ref={remoteVideoRef} autoPlay playsInline />
              <video className="local-video" ref={localVideoRef} autoPlay muted playsInline />
            </div>
          )}
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
                      href={`${apiUrl}${msg.imageUrl}`}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <img
                        alt={msg.filename || "Shared image"}
                        className="chat-image"
                        src={`${apiUrl}${msg.imageUrl}`}
                      />
                      <span>{msg.filename || "Shared image"}</span>
                    </a>
                  ) : msg.type === "audio" ? (
                    <div className="chat-audio-message">
                      <audio controls src={`${apiUrl}${msg.audioUrl}`} />
                      <span>{msg.filename || "Voice message"}</span>
                    </div>
                  ) : msg.type === "video" ? (
                    <div className="chat-video-message">
                      <video controls playsInline src={`${apiUrl}${msg.videoUrl}`} />
                      <span>{msg.filename || "Shared video"}</span>
                    </div>
                  ) : msg.type === "file" ? (
                    <a
                      className="chat-file-link"
                      download={msg.filename || true}
                      href={`${apiUrl}${msg.fileUrl}`}
                    >
                      <IconFile />
                      <span>{msg.filename || "Shared file"}</span>
                    </a>
                  ) : (
                    <div>{renderMessageText(msg.text)}</div>
                  )}
                </div>
                {isAdmin && !isSystem && (
                  <button
                    className="delete-message-button"
                    onClick={() => deleteMessage(msg.id)}
                  >
                    Delete
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
          <input
            className="image-file-input"
            ref={fileInputRef}
            type="file"
            onChange={(e) => uploadFileMessage(e.target.files?.[0])}
          />
          <input
            accept="video/*"
            className="image-file-input"
            ref={videoInputRef}
            type="file"
            onChange={(e) => uploadVideoMessage(e.target.files?.[0])}
          />
          <button
            className="upload-menu-button"
            disabled={isUploadingImage || isUploadingFile || isUploadingVideo}
            title="Add / æ·»åŠ "
            aria-label="Add / æ·»åŠ "
            aria-expanded={isUploadMenuOpen}
            onClick={() => setIsUploadMenuOpen((open) => !open)}
          >
            {isUploadingImage || isUploadingFile || isUploadingVideo ? "..." : <IconPlus />}
          </button>
          {isUploadMenuOpen && (
            <div className="upload-menu">
              <button type="button" onClick={() => imageInputRef.current?.click()}>
                <IconPhoto />
                <span>Photo / å›¾ç‰‡</span>
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                <IconFile />
                <span>File / æ–‡ä»¶</span>
              </button>
              <button type="button" onClick={() => videoInputRef.current?.click()}>
                <IconFilm />
                <span>Video / è§†é¢‘</span>
              </button>
            </div>
          )}
          <button
            className={`audio-record-button ${isRecordingAudio ? "is-recording" : ""}`}
            disabled={isUploadingAudio}
            title={isRecordingAudio ? "Stop recording / åœæ­¢å½•éŸ³" : "Voice / è¯­éŸ³"}
            aria-label={isRecordingAudio ? "Stop recording / åœæ­¢å½•éŸ³" : "Voice / è¯­éŸ³"}
            onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
          >
            {isRecordingAudio ? <IconStop /> : isUploadingAudio ? "..." : <IconMic />}
          </button>
          <textarea
            placeholder="Type a message / è¾“å…¥æ¶ˆæ¯..."
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
            title="Send / å‘é€"
            aria-label="Send / å‘é€"
            onClick={sendMessage}
          >
            <IconSend />
          </button>
        </div>
      )}
    </div>
  );
}

export default ChatRoomView;
