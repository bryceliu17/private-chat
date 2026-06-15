const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const LOCAL_CLIENT_ORIGINS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CAPACITOR_CLIENT_ORIGINS = new Set(["capacitor://localhost", "ionic://localhost"]);
const LAN_CLIENT_HOST_PATTERN =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;

const UPLOAD_DIR = process.env.PRIVATE_CHAT_UPLOAD_DIR || path.join(__dirname, "uploads");
const PHOTO_UPLOAD_DIR = path.join(UPLOAD_DIR, "photos");
const AUDIO_UPLOAD_DIR = path.join(UPLOAD_DIR, "audio");
const FILE_UPLOAD_DIR = path.join(UPLOAD_DIR, "files");
const VIDEO_UPLOAD_DIR = path.join(UPLOAD_DIR, "videos");
const SUPPORT_AMOUNT_CENTS = Number(process.env.SUPPORT_AMOUNT_CENTS || 500);
const SUPPORT_CURRENCY = process.env.SUPPORT_CURRENCY || "aud";
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "";

function isAllowedClientOrigin(origin) {
  if (CAPACITOR_CLIENT_ORIGINS.has(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    const isLocalOrLanHost =
      LOCAL_CLIENT_ORIGINS.has(url.hostname) ||
      LAN_CLIENT_HOST_PATTERN.test(url.hostname);

    if (
      url.protocol === "http:" &&
      ["", "80", "5173"].includes(url.port) &&
      isLocalOrLanHost
    ) {
      return true;
    }

    if (
      url.protocol === "https:" &&
      ["", "443", "8443"].includes(url.port) &&
      isLocalOrLanHost
    ) {
      return true;
    }

    const publicOrigins = (process.env.PUBLIC_ORIGINS || process.env.PUBLIC_ORIGIN || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (publicOrigins.includes(origin)) {
      return true;
    }


    return false;
  } catch {
    return false;
  }
}

module.exports = {
  ADMIN_USERNAME:
    process.env.PRIVILEGED_USERNAME || process.env.ACCOUNT0_USERNAME || "admin",
  AUDIO_UPLOAD_DIR,
  REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT || "200mb",
  LOGIN_LOCKOUT_MS: 1000 * 60 * 30,
  LOGIN_MAX_FAILED_ATTEMPTS: 5,
  LOGIN_WINDOW_MS: 1000 * 60 * 10,
  FILE_ENCRYPTION_KEY: process.env.FILE_ENCRYPTION_KEY || "",
  FILE_UPLOAD_DIR,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_SERVICE_ACCOUNT_PATH,
  MESSAGE_ENCRYPTION_KEY: process.env.MESSAGE_ENCRYPTION_KEY || "",
  MFA_CODE_MAX_AGE_MS: 1000 * 60 * 10,
  MFA_ENABLED: false,
  PHOTO_UPLOAD_DIR,
  PORT: 5001,
  ADMIN_SESSION_MAX_AGE_MS: 1000 * 60 * 10,
  SESSION_COOKIE: "private_chat_session",
  SESSION_COOKIE_SAME_SITE: process.env.SESSION_COOKIE_SAME_SITE || "lax",
  SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE === "true",
  SESSION_MAX_AGE_MS: 1000 * 60 * 60 * 24 * 30,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  SUPPORT_AMOUNT_CENTS: Number.isFinite(SUPPORT_AMOUNT_CENTS) && SUPPORT_AMOUNT_CENTS > 0
    ? Math.round(SUPPORT_AMOUNT_CENTS)
    : 500,
  SUPPORT_CURRENCY,
  UPLOAD_DIR,
  VIDEO_UPLOAD_DIR,
  isAllowedClientOrigin,
};
