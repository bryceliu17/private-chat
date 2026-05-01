const path = require("path");
const {
  AUDIO_UPLOAD_DIR,
  PHOTO_UPLOAD_DIR,
  SUPABASE_AUDIO_BUCKET,
  SUPABASE_PHOTO_BUCKET,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} = require("./config");

const storageEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

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
  if (kind === "image") {
    return {
      uploadDir: PHOTO_UPLOAD_DIR,
      clientUrl: `/uploads/photos/${filename}`,
    };
  }

  return {
    uploadDir: AUDIO_UPLOAD_DIR,
    clientUrl: `/uploads/audio/${filename}`,
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
  const uploads = [
    {
      baseDir: PHOTO_UPLOAD_DIR,
      prefix: "/uploads/photos/",
    },
    {
      baseDir: AUDIO_UPLOAD_DIR,
      prefix: "/uploads/audio/",
    },
  ];

  uploads.forEach(({ baseDir, prefix }) => {
    if (!url || !url.startsWith(prefix)) {
      return;
    }

    const filename = path.basename(url);
    const uploadPath = path.join(baseDir, filename);

    if (!uploadPath.startsWith(baseDir)) {
      return;
    }

    try {
      require("fs").rmSync(uploadPath, {
        force: true,
      });
    } catch (error) {
      console.error(`Failed to delete upload ${uploadPath}:`, error);
    }
  });
}

function registerStorageRoutes(app, { requireSession }) {
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
  storageEnabled,
  uploadObject,
};
