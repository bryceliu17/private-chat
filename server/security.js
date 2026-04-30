const crypto = require("crypto");

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto
    .scryptSync(password, salt, PASSWORD_KEY_LENGTH, PASSWORD_SCRYPT_OPTIONS)
    .toString("base64url");

  return `scrypt$${PASSWORD_SCRYPT_OPTIONS.N}$${PASSWORD_SCRYPT_OPTIONS.r}$${PASSWORD_SCRYPT_OPTIONS.p}$${salt}$${hash}`;
}

function verifyPassword(password, storedPassword) {
  const parts = String(storedPassword || "").split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, rawN, rawR, rawP, salt, storedHash] = parts;
  const storedHashBuffer = Buffer.from(storedHash, "base64url");
  const hash = crypto.scryptSync(password, salt, storedHashBuffer.length, {
    N: Number(rawN),
    r: Number(rawR),
    p: Number(rawP),
  });

  return (
    hash.length === storedHashBuffer.length &&
    crypto.timingSafeEqual(hash, storedHashBuffer)
  );
}

module.exports = {
  hashPassword,
  verifyPassword,
};
