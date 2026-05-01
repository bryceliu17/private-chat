function AdminUsersPanel({
  adminUsers,
  loadAdminUsers,
  savingMfaUserId,
  savingPasswordUserId,
  savingUserId,
  setAdminUsers,
  updateAdminUserEmail,
  updateAdminUserMfa,
  updateAdminUserPassword,
}) {
  return (
    <section className="admin-users-panel">
      <div className="admin-users-header">
        <h2>Users / 用户管理</h2>
        <button className="admin-refresh-button" onClick={loadAdminUsers}>
          Refresh / 刷新
        </button>
      </div>

      <div className="admin-users-list">
        {adminUsers.map((user) => (
          <div className="admin-user-row" key={user.id}>
            <div className="admin-user-name">
              <strong>{user.username}</strong>
              {user.isAdmin && <span>Admin / 管理员</span>}
            </div>
            <label className="admin-user-field">
              <span>Email / 邮箱</span>
              <input
                placeholder="Email / 邮箱"
                value={user.email}
                onChange={(event) => {
                  const email = event.target.value;

                  setAdminUsers((currentUsers) =>
                    currentUsers.map((currentUser) =>
                      currentUser.id === user.id
                        ? {
                            ...currentUser,
                            email,
                          }
                        : currentUser
                    )
                  );
                }}
              />
              <small>Current / 当前: {user.originalEmail || "(empty)"}</small>
            </label>
            <label className="admin-user-field">
              <span>New password / 新密码</span>
              <input
                placeholder="New password / 新密码"
                type="password"
                value={user.newPassword || ""}
                onChange={(event) => {
                  const newPassword = event.target.value;

                  setAdminUsers((currentUsers) =>
                    currentUsers.map((currentUser) =>
                      currentUser.id === user.id
                        ? {
                            ...currentUser,
                            newPassword,
                          }
                        : currentUser
                    )
                  );
                }}
              />
              <small>Old password is never shown. / 旧密码不会显示。</small>
            </label>
            <label className="admin-user-field admin-user-toggle">
              <span>Email verification / 邮箱验证</span>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(user.mfaEnabled)}
                  onChange={(event) => {
                    const mfaEnabled = event.target.checked;

                    setAdminUsers((currentUsers) =>
                      currentUsers.map((currentUser) =>
                        currentUser.id === user.id
                          ? {
                              ...currentUser,
                              mfaEnabled,
                            }
                          : currentUser
                      )
                    );
                  }}
                />
                <span>{user.mfaEnabled ? "Required / 需要" : "Off / 关闭"}</span>
              </label>
              <small>
                Current / 当前: {user.originalMfaEnabled ? "Required / 需要" : "Off / 关闭"}
              </small>
            </label>
            <div className="admin-user-actions">
              <button
                disabled={savingUserId === user.id}
                onClick={() => updateAdminUserEmail(user.id)}
              >
                {savingUserId === user.id ? "..." : "Save email / 保存邮箱"}
              </button>
              <button
                disabled={savingPasswordUserId === user.id}
                onClick={() => updateAdminUserPassword(user.id)}
              >
                {savingPasswordUserId === user.id ? "..." : "Set password / 改密码"}
              </button>
              <button
                disabled={savingMfaUserId === user.id}
                onClick={() => updateAdminUserMfa(user.id)}
              >
                {savingMfaUserId === user.id ? "..." : "Save verification / 保存验证"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default AdminUsersPanel;
