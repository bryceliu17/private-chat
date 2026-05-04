const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  AUDIO_UPLOAD_DIR,
  FILE_ENCRYPTION_KEY,
  PHOTO_UPLOAD_DIR,
  SUPABASE_AUDIO_BUCKET,
  SUPABASE_PHOTO_BUCKET,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} = require("./config");

const storageEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
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

function trimSupabaseUrl() {
  return SUPABASE_URL.replace(/\/+$/, "");
}

function getStorageHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extraHeaders,
  };
}

function encodeStoragePath(storagePath) {
  return storagePath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function makeStorageRef(bucket, storagePath) {
  return `supabase://${bucket}/${storagePath}`;
}

function parseStorageRef(value) {
  if (!value || !value.startsWith("supabase://")) {
    return null;
  }

  const withoutProtocol = value.slice("supabase://".length);
  const slashIndex = withoutProtocol.indexOf("/");

  if (slashIndex === -1) {
    return null;
  }

  const bucket = withoutProtocol.slice(0, slashIndex);
  const storagePath = withoutProtocol.slice(slashIndex + 1);

  if (!bucket || !storagePath) {
    return null;
  }

  return {
    bucket,
    storagePath,
  };
}

function getClientFileUrl(storageRef) {
  const parsed = parseStorageRef(storageRef);

  if (!parsed) {
    return storageRef;
  }

  return `/api/files/${encodeURIComponent(parsed.bucket)}/${encodeStoragePath(parsed.storagePath)}`;
}

function ensureStorageConfigured() {
  if (!storageEnabled) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
}

async function uploadObject({ bucket, storagePath, buffer, contentType }) {
  ensureStorageConfigured();

  const response = await fetch(
    `${trimSupabaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`,
    {
      method: "POST",
      headers: getStorageHeaders({
        "Content-Type": contentType,
        "Cache-Control": "3600",
        "x-upsert": "false",
      }),
      body: buffer,
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase upload failed: ${response.status} ${details}`);
  }

  return makeStorageRef(bucket, storagePath);
}

async function deleteObject(storageRef) {
  const parsed = parseStorageRef(storageRef);

  if (!parsed || !storageEnabled) {
    return false;
  }

  const response = await fetch(
    `${trimSupabaseUrl()}/storage/v1/object/${encodeURIComponent(parsed.bucket)}`,
    {
      method: "DELETE",
      headers: getStorageHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        prefixes: [parsed.storagePath],
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase delete failed: ${response.status} ${details}`);
  }

  return true;
}

async function downloadObject({ bucket, storagePath }) {
  ensureStorageConfigured();

  const response = await fetch(
    `${trimSupabaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`,
    {
      headers: getStorageHeaders(),
    },
  );

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    ok: true,
    buffer,
    contentType: response.headers.get("content-type") || "application/octet-stream",
    cacheControl: response.headers.get("cache-control") || "private, max-age=3600",
  };
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

  return {
    uploadDir: AUDIO_UPLOAD_DIR,
    uploadPath: path.join(AUDIO_UPLOAD_DIR, encryptedFilename),
    clientUrl: `/uploads/audio/${encryptedFilename}`,
  };
}

function getBucketForKind(kind) {
  return kind === "image" ? SUPABASE_PHOTO_BUCKET : SUPABASE_AUDIO_BUCKET;
}

function getStoragePathForUpload(kind, roomId, filename) {
  const folder = kind === "image" ? "photos" : "audio";
  const safeRoomId = String(roomId || "room").replace(/[^a-zA-Z0-9_-]/g, "-");

  return `${folder}/${safeRoomId}/${filename}`;
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
    contentType: local.kind === "image" ? "image/*" : "audio/*",
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
  app.get(/^\/uploads\/(photos|audio)\/(.+)$/, async (req, res) => {
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

  app.get(/^\/api\/files\/([^/]+)\/(.+)$/, async (req, res) => {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const bucket = decodeURIComponent(req.params[0]);
    const storagePath = decodeStoragePath(req.params[1]);

    if (![SUPABASE_PHOTO_BUCKET, SUPABASE_AUDIO_BUCKET].includes(bucket)) {
      return res.status(404).send("Not found");
    }

    const file = await downloadObject({
      bucket,
      storagePath,
    });

    if (!file.ok) {
      return res.status(file.status === 404 ? 404 : 502).send("File not found");
    }

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Cache-Control", file.cacheControl);
    return res.send(file.buffer);
  });
}

function decodeStoragePath(storagePath) {
  return String(storagePath || "")
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))
    .join("/");
}

module.exports = {
  deleteLocalUpload,
  deleteObject,
  getBucketForKind,
  getClientFileUrl,
  getLocalUploadInfo,
  getStoragePathForUpload,
  registerStorageRoutes,
  saveLocalEncryptedUpload,
  storageEnabled,
  uploadObject,
};
