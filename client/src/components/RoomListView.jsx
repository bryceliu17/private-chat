import AdminUsersPanel from "./AdminUsersPanel";

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

function formatCallDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function RoomListView({
  acceptVoiceCall,
  adminMessage,
  adminUsers,
  callChoiceUser,
  enterRoom,
  hangupVoiceCall,
  isAdmin,
  loadAdminUsers,
  localVideoRef,
  logout,
  onlineUsers,
  openCallChoice,
  rejectVoiceCall,
  remoteAudioRef,
  remoteVideoRef,
  roomNotice,
  rooms,
  savingMfaUserId,
  savingPasswordUserId,
  savingUserId,
  setAdminUsers,
  setCallChoiceUser,
  startSupportPayment,
  startVoiceCall,
  updateAdminUserEmail,
  updateAdminUserMfa,
  updateAdminUserPassword,
  username,
  voiceCall,
  voiceCallElapsedSeconds,
  voiceCallError,
}) {
  const onlineUserRoomIds = new Map();

  rooms.forEach((room) => {
    (room.onlineUsers || []).forEach((onlineUser) => {
      if (!onlineUserRoomIds.has(onlineUser)) {
        onlineUserRoomIds.set(onlineUser, room.id);
      }
    });
  });

  const fallbackCallRoomId = rooms[0]?.id || "";
  const callableUsers = (onlineUsers || [])
    .filter((onlineUser) => onlineUser !== username)
    .map((onlineUser) => ({
      roomId: onlineUserRoomIds.get(onlineUser) || fallbackCallRoomId,
      username: onlineUser,
    }));

  return (
    <div className="page">
      <div className="room-panel">
        <div className="room-panel-header">
          <div>
            <h1>Rooms / 房间</h1>
            <p>{rooms.length} preset rooms / {rooms.length} 个预设聊天室</p>
          </div>

          <div className="header-actions">
            <div className="current-user">Current user / 当前用户: {username}</div>
            <button className="support-button" onClick={startSupportPayment}>
              Support / 打赏
            </button>
            <button className="leave-button" onClick={logout}>
              Logout / 登出
            </button>
          </div>
        </div>

        {roomNotice && <p className="room-notice">{roomNotice}</p>}
        {adminMessage && <p className="room-notice">{adminMessage}</p>}
        {voiceCallError && <p className="voice-call-error">{voiceCallError}</p>}

        {!isAdmin && callChoiceUser && (
          <div className="call-choice-backdrop" role="dialog" aria-modal="true">
            <div className="call-choice-modal">
              <strong>Call / 呼叫 {callChoiceUser}</strong>
              <span>Choose call type / 选择通话方式</span>
              <div className="call-choice-actions">
                <button type="button" onClick={() => startVoiceCall(callChoiceUser, "audio")}>
                  <IconPhone />
                  <span>Voice / 语音</span>
                </button>
                <button type="button" onClick={() => startVoiceCall(callChoiceUser, "video")}>
                  <IconVideo />
                  <span>Video / 视频</span>
                </button>
              </div>
              <button className="call-choice-cancel" type="button" onClick={() => setCallChoiceUser("")}>
                Cancel / 取消
              </button>
            </div>
          </div>
        )}

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
              <span>Type / 类型: {voiceCall.callType === "video" ? "Video / 视频" : "Voice / 语音"}</span>
              <span>Calls can continue outside a chat room. / 离开房间后也可以继续通话。</span>
              {voiceCall.startedAt ? (
                <span className="voice-call-timer">
                  Duration / 通话时长: {formatCallDuration(voiceCallElapsedSeconds)}
                </span>
              ) : null}
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
            {voiceCall.callType === "video" && (
              <div className="video-call-stage">
                <video className="remote-video" ref={remoteVideoRef} autoPlay playsInline />
                <video className="local-video" ref={localVideoRef} autoPlay muted playsInline />
              </div>
            )}
            <audio ref={remoteAudioRef} autoPlay playsInline />
          </div>
        )}

        {!isAdmin && (
          <div className="global-call-row">
            Online users / 在线用户: {callableUsers.length ? (
              callableUsers.map((onlineUser) => (
                <button
                  className="inline-call-button"
                  disabled={!onlineUser.roomId || voiceCall.status !== "idle"}
                  key={onlineUser.username}
                  title={`Call ${onlineUser.username}`}
                  aria-label={`Call ${onlineUser.username}`}
                  onClick={() => openCallChoice(onlineUser.username, onlineUser.roomId)}
                >
                  <IconPhone />
                  <span>{onlineUser.username}</span>
                </button>
              ))
            ) : (
              <span>No one else online / 暂无其他人在线</span>
            )}
          </div>
        )}

        <div className="room-list">
          {rooms.map((room) => {
            const otherUsers = (room.onlineUsers || []).filter(
              (onlineUser) => onlineUser !== username
            );

            return (
              <button
                className="room-item"
                key={room.id}
                onClick={() => enterRoom(room.id)}
              >
                <div className="room-main">
                  <span className="room-title">
                    <span>{room.name}</span>
                    {room.unreadCount > 0 && (
                      <span className="unread-badge" aria-label={`${room.unreadCount} unread messages`}>
                        {room.unreadCount > 99 ? "99+" : room.unreadCount}
                      </span>
                    )}
                  </span>
                  <small>{room.id}</small>
                </div>
                <div className="room-presence">
                  {otherUsers.length
                    ? `Online / 在线: ${otherUsers.join(", ")}`
                    : "No one else online / 暂无其他人在线"}
                </div>
              </button>
            );
          })}
        </div>

        {isAdmin && (
          <AdminUsersPanel
            adminUsers={adminUsers}
            loadAdminUsers={loadAdminUsers}
            savingMfaUserId={savingMfaUserId}
            savingPasswordUserId={savingPasswordUserId}
            savingUserId={savingUserId}
            setAdminUsers={setAdminUsers}
            updateAdminUserEmail={updateAdminUserEmail}
            updateAdminUserMfa={updateAdminUserMfa}
            updateAdminUserPassword={updateAdminUserPassword}
          />
        )}
      </div>
    </div>
  );
}

export default RoomListView;
