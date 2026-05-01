function IconEye() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" />
      <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2" />
      <path d="M6.4 6.8C3.6 8.7 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4.1-.8" />
    </svg>
  );
}

function LoginView({
  isLoggingIn,
  login,
  loginError,
  loginName,
  mfaCode,
  mfaToken,
  password,
  setLoginName,
  setMfaCode,
  setPassword,
  setShowPassword,
  showPassword,
  verifyMfa,
}) {
  return (
    <div className="page">
      <div className="login-card">
        <h1>Private Chat / 私密聊天</h1>

        <input
          placeholder="Username / 用户名"
          value={loginName}
          disabled={Boolean(mfaToken)}
          onChange={(e) => setLoginName(e.target.value)}
        />

        {mfaToken ? (
          <input
            placeholder="Verification code / 验证码"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                verifyMfa();
              }
            }}
          />
        ) : (
          <div className="password-field">
            <input
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  login();
                }
              }}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="password-toggle"
              title={showPassword ? "Hide password" : "Show password"}
              type="button"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        )}

        {loginError && <p className="login-error">{loginError}</p>}
        {mfaToken && (
          <p className="login-help">
            Verification code sent to your email. / 验证码已发送到你的邮箱。
          </p>
        )}

        <button onClick={mfaToken ? verifyMfa : login} disabled={isLoggingIn}>
          {isLoggingIn
            ? "Logging in..."
            : mfaToken
              ? "Verify / 验证"
              : "Login / 登录"}
        </button>
      </div>
    </div>
  );
}

export default LoginView;
