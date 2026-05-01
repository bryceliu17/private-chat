import AdminUsersPanel from "./AdminUsersPanel";

function RoomListView({
  adminMessage,
  adminUsers,
  enterRoom,
  isAdmin,
  loadAdminUsers,
  logout,
  roomNotice,
  rooms,
  savingMfaUserId,
  savingPasswordUserId,
  savingUserId,
  setAdminUsers,
  updateAdminUserEmail,
  updateAdminUserMfa,
  updateAdminUserPassword,
  username,
}) {
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
            <button className="leave-button" onClick={logout}>
              Logout / 登出
            </button>
          </div>
        </div>

        {roomNotice && <p className="room-notice">{roomNotice}</p>}
        {adminMessage && <p className="room-notice">{adminMessage}</p>}

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
