const crypto = require("crypto");
const nodemailer = require("nodemailer");
const {
  ADMIN_USERNAME,
  LOGIN_LOCKOUT_MS,
  LOGIN_MAX_FAILED_ATTEMPTS,
  LOGIN_WINDOW_MS,
  MFA_CODE_MAX_AGE_MS,
  MFA_ENABLED,
  SESSION_COOKIE,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_MS,
} = require("./config");
const { db } = require("./db");
const { verifyPassword } = require("./security");

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

function createSession(res, user) {
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;

  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    sessionId,
    user.id,
    expiresAt,
  );

  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_SECURE,
    maxAge: SESSION_MAX_AGE_MS,
  });
}

function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }

  const session = db
    .prepare(`
      SELECT sessions.id, sessions.user_id, users.username
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ? AND sessions.expires_at > ?
    `)
    .get(sessionId, Date.now());

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

function getRequestSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return getSession(cookies[SESSION_COOKIE]);
}

function getSocketSession(socket) {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  return getSession(cookies[SESSION_COOKIE]);
}

function requireSession(req, res) {
  const session = getRequestSession(req);

  if (!session) {
    res.status(401).json({
      message: "Please log in first",
    });
    return null;
  }

  return session;
}

function requireChatUser(req, res) {
  const session = requireSession(req, res);

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

function requireAdmin(req, res) {
  const session = requireSession(req, res);

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
    isAdmin: user.username === ADMIN_USERNAME,
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getLoginLock(usernameKey, now = Date.now()) {
  const attempt = db
    .prepare("SELECT failed_count, first_failed_at, locked_until FROM login_attempts WHERE username_key = ?")
    .get(usernameKey);

  if (!attempt) {
    return null;
  }

  if (attempt.locked_until > now) {
    return attempt;
  }

  if (attempt.locked_until || now - attempt.first_failed_at > LOGIN_WINDOW_MS) {
    db.prepare("DELETE FROM login_attempts WHERE username_key = ?").run(usernameKey);
    return null;
  }

  return null;
}

function recordFailedLogin(usernameKey, now = Date.now()) {
  const attempt = db
    .prepare("SELECT failed_count, first_failed_at FROM login_attempts WHERE username_key = ?")
    .get(usernameKey);

  if (!attempt || now - attempt.first_failed_at > LOGIN_WINDOW_MS) {
    db.prepare(`
      INSERT INTO login_attempts (username_key, failed_count, first_failed_at, locked_until)
      VALUES (?, 1, ?, 0)
      ON CONFLICT(username_key) DO UPDATE SET
        failed_count = excluded.failed_count,
        first_failed_at = excluded.first_failed_at,
        locked_until = excluded.locked_until
    `).run(usernameKey, now);
    return;
  }

  const failedCount = attempt.failed_count + 1;
  const lockedUntil =
    failedCount >= LOGIN_MAX_FAILED_ATTEMPTS ? now + LOGIN_LOCKOUT_MS : 0;

  db.prepare(`
    UPDATE login_attempts
    SET failed_count = ?,
      locked_until = ?
    WHERE username_key = ?
  `).run(failedCount, lockedUntil, usernameKey);
}

function clearFailedLogins(usernameKey) {
  db.prepare("DELETE FROM login_attempts WHERE username_key = ?").run(usernameKey);
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
    const lock = getLoginLock(loginName);

    if (lock) {
      return res.status(429).json({
        message: LOCKOUT_MESSAGE,
        lockedUntil: lock.locked_until,
      });
    }

    const user = db
      .prepare("SELECT id, username, password, email FROM users WHERE username_key = ?")
      .get(loginName);

    if (!user || !verifyPassword(password, user.password)) {
      recordFailedLogin(loginName);
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    clearFailedLogins(loginName);

    if (!MFA_ENABLED) {
      createSession(res, user);

      return res.json({
        username: user.username,
        isAdmin: user.username === ADMIN_USERNAME,
      });
    }

    const email = String(user.email || "").trim();

    if (!email) {
      return res.status(403).json({
        message: "Email MFA is not configured for this account",
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

  app.post("/api/login/mfa", (req, res) => {
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

    const user = db
      .prepare("SELECT id, username FROM users WHERE id = ? AND username = ?")
      .get(challenge.userId, challenge.username);

    pendingMfa.delete(token);

    if (!user) {
      return res.status(401).json({
        message: "Invalid verification code",
      });
    }

    createSession(res, user);

    return res.json({
      username: user.username,
      isAdmin: true,
    });
  });

  app.post("/api/logout", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE];

    if (sessionId) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    }

    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: SESSION_COOKIE_SECURE,
    });

    return res.json({
      ok: true,
    });
  });

  app.get("/api/admin/users", (req, res) => {
    const session = requireAdmin(req, res);

    if (!session) {
      return;
    }

    const users = db
      .prepare("SELECT id, username, email FROM users ORDER BY id")
      .all()
      .map(serializeAdminUser);

    return res.json({
      users,
    });
  });

  app.patch("/api/admin/users/:userId/email", (req, res) => {
    const session = requireAdmin(req, res);

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

    const user = db
      .prepare("SELECT id, username FROM users WHERE id = ?")
      .get(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found / 用户不存在",
      });
    }

    db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, userId);
    console.log(`${session.username} updated email for ${user.username}`);

    const updatedUser = db
      .prepare("SELECT id, username, email FROM users WHERE id = ?")
      .get(userId);

    return res.json({
      user: serializeAdminUser(updatedUser),
    });
  });
}

module.exports = {
  getSocketSession,
  registerAuthRoutes,
  requireAdmin,
  requireChatUser,
  requireSession,
};
