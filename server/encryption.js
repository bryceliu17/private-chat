const crypto = require("crypto");
const { MESSAGE_ENCRYPTION_KEY } = require("./config");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const rawKey = String(MESSAGE_ENCRYPTION_KEY || "").trim();

  if (!rawKey) {
    throw new Error("Missing MESSAGE_ENCRYPTION_KEY. Add a 32-byte base64 key to server/.env.");
  }

  const decodedKey = Buffer.from(rawKey, "base64");

  if (decodedKey.length === 32) {
    return decodedKey;
  }

  return crypto.createHash("sha256").update(rawKey).digest();
}

function encryptText(plainText) {
  const text = String(plainText || "");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptText({ ciphertext, iv, tag, fallbackText = "" }) {
  if (!ciphertext || !iv || !tag) {
    return fallbackText || "";
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(iv, "base64"),
  );

  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

module.exports = {
  decryptText,
  encryptText,
};
