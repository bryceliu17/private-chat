const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { after, before, describe, it } = require("node:test");

if (!process.env.TEST_DATABASE_URL) {
  describe("private chat backend", { skip: "Set TEST_DATABASE_URL to run PostgreSQL integration tests." }, () => {
    it("requires a dedicated test database", () => {});
  });
} else {
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "private-chat-test-"));

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.PRIVATE_CHAT_DATA_DIR = path.join(testRoot, "data");
process.env.PRIVATE_CHAT_UPLOAD_DIR = path.join(testRoot, "uploads");
process.env.MESSAGE_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.PRIVILEGED_USERNAME = "admin-test";
process.env.ACCOUNT0_USERNAME = "admin-test";
process.env.ACCOUNT0_PASSWORD = "admin-test-password";
process.env.ACCOUNT1_USERNAME = "chat-alpha";
process.env.ACCOUNT1_PASSWORD = "alpha-test-password";
process.env.ACCOUNT2_USERNAME = "chat-beta";
process.env.ACCOUNT2_PASSWORD = "beta-test-password";
process.env.ACCOUNT3_USERNAME = "chat-gamma";
process.env.ACCOUNT3_PASSWORD = "gamma-test-password";
process.env.ACCOUNT4_USERNAME = "chat-delta";
process.env.ACCOUNT4_PASSWORD = "delta-test-password";
process.env.ACCOUNT5_USERNAME = "chat-epsilon";
process.env.ACCOUNT5_PASSWORD = "epsilon-test-password";
process.env.ACCOUNT1_EMAIL = "alpha@example.com";
process.env.ACCOUNT2_EMAIL = "beta@example.com";
process.env.ACCOUNT3_EMAIL = "gamma@example.com";

const express = require("express");
const { db } = require("../db");
const { decryptText, encryptText } = require("../encryption");
const {
  createTextMessage,
  getRoomMessages,
  registerRoomRoutes,
} = require("../messages");
const { createPresence } = require("../presence");
const {
  getSocketSession,
  registerAuthRoutes,
  requireAdmin,
  requireChatUser,
  requireSession,
} = require("../auth");
const { verifyPassword } = require("../security");

function createTestServer() {
  const app = express();
  const fakeIo = {
    sockets: {
      adapter: {
        rooms: new Map(),
      },
      sockets: new Map(),
    },
    to() {
      return {
        emit() {},
      };
    },
  };
  const presence = createPresence(fakeIo);

  presence.setSocketSessionResolver(getSocketSession);
  app.use(express.json({ limit: "15mb" }));
  registerAuthRoutes(app);
  registerRoomRoutes(app, {
    getSocketSession,
    io: fakeIo,
    presence,
    requireAdmin,
    requireChatUser,
    requireSession,
  });

  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();

      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function getCookie(response) {
  const cookie = response.headers.get("set-cookie");

  return cookie ? cookie.split(";")[0] : "";
}

function getCookieMaxAge(response) {
  const cookie = response.headers.get("set-cookie") || "";
  const match = cookie.match(/Max-Age=(\d+)/i);

  return match ? Number(match[1]) : null;
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  return {
    response,
    cookie: getCookie(response),
    maxAge: getCookieMaxAge(response),
    body: await response.json().catch(() => null),
  };
}

describe("private chat backend", () => {
  let server;

  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await server.close();
    await db.close();
    fs.rmSync(testRoot, {
      force: true,
      recursive: true,
    });
  });

  it("seeds fixed users with password hashes", async () => {
    const users = await db.all("SELECT username, password FROM users ORDER BY username");

    assert.deepEqual(
      users.map((user) => user.username),
      ["admin-test", "chat-alpha", "chat-beta", "chat-delta", "chat-epsilon", "chat-gamma"],
    );
    assert.equal(verifyPassword("alpha-test-password", users[1].password), true);
    assert.equal(verifyPassword("wrong-password", users[1].password), false);
  });

  it("encrypts and decrypts text values", () => {
    const encrypted = encryptText("hello encrypted world");

    assert.notEqual(encrypted.ciphertext, "hello encrypted world");
    assert.equal(
      decryptText({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
      }),
      "hello encrypted world",
    );
    assert.throws(() =>
      decryptText({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: Buffer.from("wrong-tag").toString("base64"),
      }),
    );
  });

  it("stores text messages encrypted and returns decrypted history", async () => {
    const user = await db.get(
      "SELECT id, username FROM users WHERE username = $1",
      ["chat-alpha"],
    );
    const message = await createTextMessage(
      "room1",
      {
        userId: user.id,
        username: user.username,
      },
      "secret test message",
      {
        id: "test-message-1",
        createdAt: 12345,
      },
    );

    assert.equal(message.text, "secret test message");

    const row = await db.get(
      "SELECT text, text_ciphertext, text_iv, text_tag FROM messages WHERE id = $1",
      ["test-message-1"],
    );

    assert.equal(row.text, null);
    assert.ok(row.text_ciphertext);
    assert.ok(row.text_iv);
    assert.ok(row.text_tag);
    assert.notEqual(row.text_ciphertext, "secret test message");

    const historyMessage = (await getRoomMessages("room1")).find(
      (item) => item.id === "test-message-1",
    );

    assert.equal(historyMessage.text, "secret test message");
  });

  it("logs in valid users and rejects invalid passwords", async () => {
    const validLogin = await login(
      server.baseUrl,
      "chat-alpha",
      "alpha-test-password",
    );

    assert.equal(validLogin.response.status, 200);
    assert.equal(validLogin.body.username, "chat-alpha");
    assert.ok(validLogin.cookie);
    assert.equal(validLogin.maxAge, 60 * 60 * 24 * 30);

    const invalidLogin = await login(server.baseUrl, "chat-alpha", "bad-password");

    assert.equal(invalidLogin.response.status, 401);
  });

  it("uses a short session for the admin account", async () => {
    const adminLogin = await login(
      server.baseUrl,
      "admin-test",
      "admin-test-password",
    );
    const userLogin = await login(
      server.baseUrl,
      "chat-alpha",
      "alpha-test-password",
    );

    assert.equal(adminLogin.response.status, 200);
    assert.equal(adminLogin.maxAge, 60 * 10);
    assert.equal(userLogin.response.status, 200);
    assert.equal(userLogin.maxAge, 60 * 60 * 24 * 30);
  });

  it("locks an account after 5 failed logins in 10 minutes", async () => {
    await db.run("DELETE FROM login_attempts WHERE username_key = $1", ["chat-beta"]);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedLogin = await login(server.baseUrl, "chat-beta", "bad-password");

      assert.equal(failedLogin.response.status, 401);
    }

    const lockedLogin = await login(
      server.baseUrl,
      "chat-beta",
      "beta-test-password",
    );

    assert.equal(lockedLogin.response.status, 429);
    assert.match(lockedLogin.body.message, /Too many login attempts/);

    const lock = await db.get(
      "SELECT failed_count, locked_until FROM login_attempts WHERE username_key = $1",
      ["chat-beta"],
    );

    assert.equal(lock.failed_count, 5);
    assert.ok(lock.locked_until > Date.now());
  });

  it("protects admin routes and lets the admin update emails", async () => {
    const userLogin = await login(server.baseUrl, "chat-alpha", "alpha-test-password");
    const userAdminResponse = await fetch(`${server.baseUrl}/api/admin/users`, {
      headers: {
        Cookie: userLogin.cookie,
      },
    });

    assert.equal(userAdminResponse.status, 403);

    const adminLogin = await login(
      server.baseUrl,
      "admin-test",
      "admin-test-password",
    );
    const usersResponse = await fetch(`${server.baseUrl}/api/admin/users`, {
      headers: {
        Cookie: adminLogin.cookie,
      },
    });
    const usersBody = await usersResponse.json();
    const targetUser = usersBody.users.find((user) => user.username === "chat-delta");

    assert.equal(usersResponse.status, 200);
    assert.ok(targetUser);

    const updateResponse = await fetch(
      `${server.baseUrl}/api/admin/users/${targetUser.id}/email`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminLogin.cookie,
        },
        body: JSON.stringify({
          email: "delta@example.com",
        }),
      },
    );
    const updateBody = await updateResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.equal(updateBody.user.email, "delta@example.com");

    const passwordResponse = await fetch(
      `${server.baseUrl}/api/admin/users/${targetUser.id}/password`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminLogin.cookie,
        },
        body: JSON.stringify({
          password: "new-delta-test-password",
        }),
      },
    );
    const passwordBody = await passwordResponse.json();

    assert.equal(passwordResponse.status, 200);
    assert.equal(passwordBody.user.username, "chat-delta");

    const oldPasswordLogin = await login(
      server.baseUrl,
      "chat-delta",
      "delta-test-password",
    );
    const newPasswordLogin = await login(
      server.baseUrl,
      "chat-delta",
      "new-delta-test-password",
    );

    assert.equal(oldPasswordLogin.response.status, 401);
    assert.equal(newPasswordLogin.response.status, 200);
  });

  it("rejects admin from chat upload routes", async () => {
    const adminLogin = await login(
      server.baseUrl,
      "admin-test",
      "admin-test-password",
    );
    const response = await fetch(`${server.baseUrl}/api/rooms/room1/audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminLogin.cookie,
      },
      body: JSON.stringify({
        filename: "voice-message.webm",
        audioData: "data:audio/webm;base64,AAAA",
      }),
    });

    assert.equal(response.status, 403);
  });
});
}
