const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const LOCAL_CLIENT_ORIGINS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LAN_CLIENT_HOST_PATTERN =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;

const DATA_DIR = process.env.PRIVATE_CHAT_DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "private-chat.db");
const UPLOAD_DIR = process.env.PRIVATE_CHAT_UPLOAD_DIR || path.join(__dirname, "uploads");
const PHOTO_UPLOAD_DIR = path.join(UPLOAD_DIR, "photos");
const AUDIO_UPLOAD_DIR = path.join(UPLOAD_DIR, "audio");

function isAllowedClientOrigin(origin) {
  try {
    const url = new URL(origin);
    const isLocalOrLanHost =
      LOCAL_CLIENT_ORIGINS.has(url.hostname) ||
      LAN_CLIENT_HOST_PATTERN.test(url.hostname);

    if (
      url.protocol === "http:" &&
      ["", "80", "5173", "8080"].includes(url.port) &&
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

    if (
      process.env.PUBLIC_ORIGIN &&
      origin === process.env.PUBLIC_ORIGIN
    ) {
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
  DB_FILE,
  DATA_DIR,
  MAX_AUDIO_SIZE: 10 * 1024 * 1024,
  MAX_PHOTO_SIZE: 5 * 1024 * 1024,
  LOGIN_LOCKOUT_MS: 1000 * 60 * 30,
  LOGIN_MAX_FAILED_ATTEMPTS: 5,
  LOGIN_WINDOW_MS: 1000 * 60 * 10,
  MESSAGE_ENCRYPTION_KEY: process.env.MESSAGE_ENCRYPTION_KEY || "",
  MFA_CODE_MAX_AGE_MS: 1000 * 60 * 10,
  MFA_ENABLED: false,
  PHOTO_UPLOAD_DIR,
  PORT: 5001,
  SESSION_COOKIE: "private_chat_session",
  SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE === "true",
  SESSION_MAX_AGE_MS: 1000 * 60 * 60 * 24 * 30,
  UPLOAD_DIR,
  isAllowedClientOrigin,
};
