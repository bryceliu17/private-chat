const fs = require("fs");
const { Pool } = require("pg");
const {
  AUDIO_UPLOAD_DIR,
  PHOTO_UPLOAD_DIR,
  UPLOAD_DIR,
} = require("./config");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PHOTO_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true });

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL. Add your PostgreSQL connection string to server/.env.");
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDatabase
    ? false
    : {
        rejectUnauthorized: false,
      },
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function all(sql, params = []) {
  const result = await query(sql, params);

  return result.rows;
}

async function get(sql, params = []) {
  const result = await query(sql, params);

  return result.rows[0] || null;
}

async function run(sql, params = []) {
  const result = await query(sql, params);

  return {
    rowCount: result.rowCount,
    rows: result.rows,
  };
}

async function close() {
  await pool.end();
}

module.exports = {
  db: {
    all,
    close,
    get,
    query,
    run,
  },
};
