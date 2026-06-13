const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  AUDIO_UPLOAD_DIR,
  FILE_ENCRYPTION_KEY,
  FILE_UPLOAD_DIR,
  PHOTO_UPLOAD_DIR,
  VIDEO_UPLOAD_DIR,
} = require("./config");

const FILE_ALGORITHM = "aes-256-gcm";
const FILE_IV_LENGTH = 12;
const LOCAL_UPLOAD_PREFIXES = [
  {
    baseDir: PHOTO_UPLOAD_DIR,
    kind: "image",
    prefix: "/uploads/photos/",
  },
  {
    baseDir: AUDIO_UPLOAD_DIR,
    kind: "audio",
    prefix: "/uploads/audio/",
  },
  {
    baseDir: FILE_UPLOAD_DIR,
    kind: "file",
    prefix: "/uploads/files/",
  },
  {
    baseDir: VIDEO_UPLOAD_DIR,
    kind: "video",
    prefix: "/uploads/videos/",
  },
];

function getFileEncryptionKey() {
  const rawKey = String(FILE_ENCRYPTION_KEY || "").trim();

  if (!rawKey) {
    throw new Error("Missing FILE_ENCRYPTION_KEY. Add a 32-byte base64 key to server/.env.");
  }

  const decodedKey = Buffer.from(rawKey, "base64");

  if (decodedKey.length === 32) {
    return decodedKey;
  }

  return crypto.createHash("sha256").update(rawKey).digest();
}

function encryptFileBuffer(buffer, contentType) {
  const iv = crypto.randomBytes(FILE_IV_LENGTH);
  const cipher = crypto.createCipheriv(FILE_ALGORITHM, getFileEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);

  return Buffer.from(JSON.stringify({
    v: 1,
    alg: FILE_ALGORITHM,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    contentType,
    data: ciphertext.toString("base64"),
  }));
}

function decryptFileBuffer(encryptedBuffer) {
  const envelope = JSON.parse(encryptedBuffer.toString("utf8"));

  if (envelope.v !== 1 || envelope.alg !== FILE_ALGORITHM) {
    throw new Error("Unsupported encrypted file format.");
  }

  const decipher = crypto.createDecipheriv(
    FILE_ALGORITHM,
    getFileEncryptionKey(),
    Buffer.from(envelope.iv, "base64"),
  );

  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

  return {
    buffer: Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]),
    contentType: envelope.contentType || "application/octet-stream",
  };
}

function getClientFileUrl(fileUrl) {
  return fileUrl;
}

function getLocalUploadInfo(kind, filename) {
  const encryptedFilename = `${filename}.enc`;

  if (kind === "image") {
    return {
      uploadDir: PHOTO_UPLOAD_DIR,
      uploadPath: path.join(PHOTO_UPLOAD_DIR, encryptedFilename),
      clientUrl: `/uploads/photos/${encryptedFilename}`,
    };
  }

  if (kind === "audio") {
    return {
      uploadDir: AUDIO_UPLOAD_DIR,
      uploadPath: path.join(AUDIO_UPLOAD_DIR, encryptedFilename),
      clientUrl: `/uploads/audio/${encryptedFilename}`,
    };
  }

  if (kind === "file") {
    return {
      uploadDir: FILE_UPLOAD_DIR,
      uploadPath: path.join(FILE_UPLOAD_DIR, encryptedFilename),
      clientUrl: `/uploads/files/${encryptedFilename}`,
    };
  }

  return {
    uploadDir: VIDEO_UPLOAD_DIR,
    uploadPath: path.join(VIDEO_UPLOAD_DIR, encryptedFilename),
    clientUrl: `/uploads/videos/${encryptedFilename}`,
  };
}

function deleteLocalUpload(url) {
  LOCAL_UPLOAD_PREFIXES.forEach(({ baseDir, prefix }) => {
    if (!url || !url.startsWith(prefix)) {
      return;
    }

    const filename = path.basename(url);
    const uploadPath = path.join(baseDir, filename);

    if (!uploadPath.startsWith(baseDir)) {
      return;
    }
    const encryptedPath = uploadPath.endsWith(".enc") ? uploadPath : `${uploadPath}.enc`;

    try {
      fs.rmSync(uploadPath, { force: true });
      fs.rmSync(encryptedPath, { force: true });
    } catch (error) {
      console.error(`Failed to delete upload ${uploadPath}:`, error);
    }
  });
}

function getLocalUploadPath(url) {
  const upload = LOCAL_UPLOAD_PREFIXES.find(({ prefix }) => url.startsWith(prefix));

  if (!upload) {
    return null;
  }

  const filename = path.basename(url);
  const uploadPath = path.join(upload.baseDir, filename);

  if (!uploadPath.startsWith(upload.baseDir)) {
    return null;
  }

  return {
    ...upload,
    uploadPath,
  };
}

async function readLocalUpload(url) {
  const local = getLocalUploadPath(url);

  if (!local || !fs.existsSync(local.uploadPath)) {
    return {
      ok: false,
      status: 404,
    };
  }

  const fileBuffer = fs.readFileSync(local.uploadPath);

  if (local.uploadPath.endsWith(".enc")) {
    const decrypted = decryptFileBuffer(fileBuffer);

    return {
      ok: true,
      buffer: decrypted.buffer,
      contentType: decrypted.contentType,
      cacheControl: "private, max-age=3600",
    };
  }

  return {
    ok: true,
    buffer: fileBuffer,
    contentType:
      local.kind === "image"
        ? "image/*"
        : local.kind === "audio"
          ? "audio/*"
          : local.kind === "video"
            ? "video/*"
            : "application/octet-stream",
    cacheControl: "private, max-age=3600",
  };
}

async function saveLocalEncryptedUpload({ kind, filename, buffer, contentType }) {
  const { clientUrl, uploadDir, uploadPath } = getLocalUploadInfo(kind, filename);

  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(uploadPath, encryptFileBuffer(buffer, contentType));

  return {
    dbUrl: clientUrl,
    clientUrl,
    cleanup: () => fs.rmSync(uploadPath, { force: true }),
  };
}

function registerStorageRoutes(app, { requireSession }) {
  app.get(/^\/uploads\/(photos|audio|files|videos)\/(.+)$/, async (req, res) => {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const folder = req.params[0];
    const filename = path.basename(decodeURIComponent(req.params[1]));
    const file = await readLocalUpload(`/uploads/${folder}/${filename}`);

    if (!file.ok) {
      return res.status(file.status === 404 ? 404 : 500).send("File not found");
    }

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Cache-Control", file.cacheControl);
    return res.send(file.buffer);
  });
}

module.exports = {
  deleteLocalUpload,
  getClientFileUrl,
  getLocalUploadInfo,
  registerStorageRoutes,
  saveLocalEncryptedUpload,
};
