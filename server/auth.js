const crypto = require("crypto");
const nodemailer = require("nodemailer");
const {
  ADMIN_SESSION_MAX_AGE_MS,
  ADMIN_USERNAME,
  LOGIN_LOCKOUT_MS,
  LOGIN_MAX_FAILED_ATTEMPTS,
  LOGIN_WINDOW_MS,
  MFA_CODE_MAX_AGE_MS,
  SESSION_COOKIE,
  SESSION_COOKIE_SAME_SITE,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_MS,
} = require("./config");
const { db } = require("./db");
const { hashPassword, verifyPassword } = require("./security");

const pendingMfa = new Map();
const LOCKOUT_MESSAGE =
  "Too many login attempts. Please try again later. / 登录尝试过多，请稍后再试。";

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const [rawName, ...rawValue] = cookie.trim().split("=");

    if (!rawName) {
      return cookies;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

async function createSession(res, user) {
  const sessionId = crypto.randomUUID();
  const maxAge = user.username === ADMIN_USERNAME
    ? ADMIN_SESSION_MAX_AGE_MS
    : SESSION_MAX_AGE_MS;
  const expiresAt = Date.now() + maxAge;

  await db.run("DELETE FROM sessions WHERE expires_at <= $1", [Date.now()]);

  await db.run("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [
    sessionId,
    user.id,
    expiresAt,
  ]);

  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: SESSION_COOKIE_SAME_SITE,
    secure: SESSION_COOKIE_SECURE,
    maxAge,
  });
}

async function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }

  const session = await db.get(`
      SELECT sessions.id, sessions.user_id, users.username
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = $1 AND sessions.expires_at > $2
    `, [sessionId, Date.now()]);

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    userId: session.user_id,
    username: session.username,
    isAdmin: session.username === ADMIN_USERNAME,
  };
}

async function getRequestSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return getSession(cookies[SESSION_COOKIE]);
}

async function getSocketSession(socket) {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  return getSession(cookies[SESSION_COOKIE]);
}

async function requireSession(req, res) {
  const session = await getRequestSession(req);

  if (!session) {
    res.status(401).json({
      message: "Please log in first",
    });
    return null;
  }

  return session;
}

async function requireChatUser(req, res) {
  const session = await requireSession(req, res);

  if (!session) {
    return null;
  }

  if (session.isAdmin) {
    res.status(403).json({
      message: "Admin account cannot chat",
    });
    return null;
  }

  return session;
}

async function requireAdmin(req, res) {
  const session = await requireSession(req, res);

  if (!session) {
    return null;
  }

  if (!session.isAdmin) {
    res.status(403).json({
      message: "Admin account required",
    });
    return null;
  }

  return session;
}

function serializeAdminUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || "",
    mfaEnabled: Boolean(user.mfa_enabled),
    isAdmin: user.username === ADMIN_USERNAME,
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getLoginLock(usernameKey, now = Date.now()) {
  const attempt = await db.get(
    "SELECT failed_count, first_failed_at, locked_until FROM login_attempts WHERE username_key = $1",
    [usernameKey],
  );

  if (!attempt) {
    return null;
  }

  if (attempt.locked_until > now) {
    return attempt;
  }

  if (attempt.locked_until || now - attempt.first_failed_at > LOGIN_WINDOW_MS) {
    await db.run("DELETE FROM login_attempts WHERE username_key = $1", [usernameKey]);
    return null;
  }

  return null;
}

async function recordFailedLogin(usernameKey, now = Date.now()) {
  const attempt = await db.get(
    "SELECT failed_count, first_failed_at FROM login_attempts WHERE username_key = $1",
    [usernameKey],
  );

  if (!attempt || now - attempt.first_failed_at > LOGIN_WINDOW_MS) {
    await db.run(`
      INSERT INTO login_attempts (username_key, failed_count, first_failed_at, locked_until)
      VALUES ($1, 1, $2, 0)
      ON CONFLICT(username_key) DO UPDATE SET
        failed_count = excluded.failed_count,
        first_failed_at = excluded.first_failed_at,
        locked_until = excluded.locked_until
    `, [usernameKey, now]);
    return;
  }

  const failedCount = attempt.failed_count + 1;
  const lockedUntil =
    failedCount >= LOGIN_MAX_FAILED_ATTEMPTS ? now + LOGIN_LOCKOUT_MS : 0;

  await db.run(`
    UPDATE login_attempts
    SET failed_count = $1,
      locked_until = $2
    WHERE username_key = $3
  `, [failedCount, lockedUntil, usernameKey]);
}

async function clearFailedLogins(usernameKey) {
  await db.run("DELETE FROM login_attempts WHERE username_key = $1", [usernameKey]);
}

async function clearUserSessions(userId) {
  await db.run("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

function serializeAdminUserPasswordUpdate(user) {
  return {
    id: user.id,
    username: user.username,
  };
}

function getSmtpTransporter() {
  const requiredConfig = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
  ];
  const missingConfig = requiredConfig.filter((key) => !process.env[key]);

  if (missingConfig.length) {
    throw new Error(`Missing email config: ${missingConfig.join(", ")}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMfaCode(code, email) {
  const transporter = getSmtpTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to: email,
    subject: "Private Chat login code",
    text: `Your Private Chat login code is ${code}. It expires in 10 minutes.\n\n你的 Private Chat 登录验证码是 ${code}，10 分钟内有效。`,
  });
}

function createMfaChallenge(user) {
  const token = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  pendingMfa.set(token, {
    userId: user.id,
    username: user.username,
    codeHash,
    expiresAt: Date.now() + MFA_CODE_MAX_AGE_MS,
  });

  return {
    token,
    code,
  };
}

function registerAuthRoutes(app) {
  app.post("/api/login", async (req, res) => {
    const loginName = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const lock = await getLoginLock(loginName);

    if (lock) {
      return res.status(429).json({
        message: LOCKOUT_MESSAGE,
        lockedUntil: lock.locked_until,
      });
    }

    const user = await db.get(
      "SELECT id, username, password, email, mfa_enabled FROM users WHERE username_key = $1",
      [loginName],
    );

    if (!user || !verifyPassword(password, user.password)) {
      await recordFailedLogin(loginName);
      return res.status(401).json({
        message: "Invalid username or password / 用户名或密码错误",
      });
    }

    await clearFailedLogins(loginName);

    if (!user.mfa_enabled) {
      await createSession(res, user);

      return res.json({
        username: user.username,
        isAdmin: user.username === ADMIN_USERNAME,
      });
    }

    const email = String(user.email || "").trim();

    if (!email) {
      return res.status(403).json({
        message: "Email MFA is not configured for this account / 该账户未配置邮箱验证",
      });
    }

    const challenge = createMfaChallenge(user);

    try {
      await sendMfaCode(challenge.code, email);
    } catch (error) {
      pendingMfa.delete(challenge.token);
      console.error("Failed to send MFA email:", error);

      return res.status(500).json({
        message: "Cannot send verification email",
      });
    }

    return res.json({
      requiresMfa: true,
      mfaToken: challenge.token,
      message: "Verification code sent",
    });
  });

  app.post("/api/login/mfa", async (req, res) => {
    const token = String(req.body.mfaToken || "");
    const code = String(req.body.code || "").trim();
    const challenge = pendingMfa.get(token);

    if (!challenge || challenge.expiresAt <= Date.now()) {
      pendingMfa.delete(token);
      return res.status(401).json({
        message: "Verification code expired",
      });
    }

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    if (codeHash !== challenge.codeHash) {
      return res.status(401).json({
        message: "Invalid verification code",
      });
    }

    const user = await db.get(
      "SELECT id, username FROM users WHERE id = $1 AND username = $2",
      [challenge.userId, challenge.username],
    );

    pendingMfa.delete(token);

    if (!user) {
      return res.status(401).json({
        message: "Invalid verification code",
      });
    }

    await createSession(res, user);

    return res.json({
      username: user.username,
      isAdmin: true,
    });
  });

  app.post("/api/logout", async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE];

    if (sessionId) {
      await db.run("DELETE FROM sessions WHERE id = $1", [sessionId]);
    }

    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: SESSION_COOKIE_SAME_SITE,
      secure: SESSION_COOKIE_SECURE,
    });

    return res.json({
      ok: true,
    });
  });

  app.get("/api/admin/users", async (req, res) => {
    const session = await requireAdmin(req, res);

    if (!session) {
      return;
    }

    const users = (await db.all("SELECT id, username, email, mfa_enabled FROM users ORDER BY id"))
      .map(serializeAdminUser);

    return res.json({
      users,
    });
  });

  app.patch("/api/admin/users/:userId/email", async (req, res) => {
    const session = await requireAdmin(req, res);

    if (!session) {
      return;
    }

    const userId = Number(req.params.userId);
    const email = String(req.body.email || "").trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        message: "Invalid email address / 邮箱格式无效",
      });
    }

    const user = await db.get("SELECT id, username FROM users WHERE id = $1", [userId]);

    if (!user) {
      return res.status(404).json({
        message: "User not found / 用户不存在",
      });
    }

    await db.run("UPDATE users SET email = $1 WHERE id = $2", [email, userId]);
    console.log(`${session.username} updated email for ${user.username}`);

    const updatedUser = await db.get(
      "SELECT id, username, email, mfa_enabled FROM users WHERE id = $1",
      [userId],
    );

    return res.json({
      user: serializeAdminUser(updatedUser),
    });
  });

  app.patch("/api/admin/users/:userId/password", async (req, res) => {
    const session = await requireAdmin(req, res);

    if (!session) {
      return;
    }

    const userId = Number(req.params.userId);
    const password = String(req.body.password || "");

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    if (password.length < 12) {
      return res.status(400).json({
        message: "Password must be at least 12 characters. / 密码至少需要 12 位。",
      });
    }

    const user = await db.get(
      "SELECT id, username, username_key FROM users WHERE id = $1",
      [userId],
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found / 用户不存在",
      });
    }

    await db.run("UPDATE users SET password = $1 WHERE id = $2", [
      hashPassword(password),
      userId,
    ]);
    await clearFailedLogins(user.username_key);
    await clearUserSessions(userId);
    console.log(`${session.username} updated password for ${user.username}`);

    return res.json({
      user: serializeAdminUserPasswordUpdate(user),
    });
  });

  app.patch("/api/admin/users/:userId/mfa", async (req, res) => {
    const session = await requireAdmin(req, res);

    if (!session) {
      return;
    }

    const userId = Number(req.params.userId);
    const mfaEnabled = Boolean(req.body.mfaEnabled);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    const user = await db.get(
      "SELECT id, username, email FROM users WHERE id = $1",
      [userId],
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found / 用户不存在",
      });
    }

    if (mfaEnabled && !String(user.email || "").trim()) {
      return res.status(400).json({
        message: "Set an email before enabling MFA. / 启用邮箱验证前请先设置邮箱。",
      });
    }

    await db.run("UPDATE users SET mfa_enabled = $1 WHERE id = $2", [
      mfaEnabled,
      userId,
    ]);
    console.log(`${session.username} ${mfaEnabled ? "enabled" : "disabled"} MFA for ${user.username}`);

    const updatedUser = await db.get(
      "SELECT id, username, email, mfa_enabled FROM users WHERE id = $1",
      [userId],
    );

    return res.json({
      user: serializeAdminUser(updatedUser),
    });
  });
}

module.exports = {
  getRequestSession,
  getSocketSession,
  registerAuthRoutes,
  requireAdmin,
  requireChatUser,
  requireSession,
};
