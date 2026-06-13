# Private Chat

Private Chat is a small private chat app for people you already know. It supports real-time text chat, image messages, voice messages, login sessions, text-message encryption at rest, and basic deployment checks.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Real-time: Socket.IO
- Database: PostgreSQL
- Auth: server-configured accounts stored in PostgreSQL
- Session: HttpOnly cookie

## Accounts

Account usernames, passwords, and emails are configured in `server/.env` and seeded into PostgreSQL. Do not commit real account values.

Privileged maintenance access is configured only in `server/.env`. Do not document real privileged usernames in this repository.

Required account settings are documented in `server/.env.example`:

```text
PRIVILEGED_USERNAME=
ACCOUNT0_USERNAME=
ACCOUNT0_PASSWORD=
ACCOUNT0_EMAIL=
ACCOUNT1_USERNAME=
ACCOUNT1_PASSWORD=
ACCOUNT1_EMAIL=
ACCOUNT2_USERNAME=
ACCOUNT2_PASSWORD=
ACCOUNT2_EMAIL=
...
```

Keep `server/.env` out of Git.

## Rooms

The app currently has 5 preset rooms:

```text
room1
room2
room3
room4
room5
```

## Local Development

Install dependencies:

```powershell
npm.cmd install
npm.cmd --prefix client install
npm.cmd --prefix server install
```

Start both frontend and backend:

```powershell
npm.cmd run dev
```

Default local ports:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:5001
```

## Security Notes

- Do not commit `server/.env`.
- Do not commit `server/uploads/`.
- Text message bodies are encrypted at rest with `MESSAGE_ENCRYPTION_KEY`.
- Keep `MESSAGE_ENCRYPTION_KEY` backed up. If it changes, old encrypted text messages cannot be decrypted.
- Uploaded images and audio files are not encrypted at rest yet.
- Use HTTPS in production.
- Do not expose the backend port directly to the public internet.

## Important Runtime Files

These files should be managed outside Git:

```text
server/.env
server/uploads/
```

If you want to preserve existing uploaded files during deployment, copy:

```text
server/uploads/
```

The server `.env` must use the same `DATABASE_URL` and `MESSAGE_ENCRYPTION_KEY` as the existing deployment.

## Tests

Run backend tests:

```powershell
npm.cmd --prefix server test
```

Build frontend:

```powershell
npm.cmd --prefix client run build
```

Recommended production `.env` values:

```text
PUBLIC_ORIGIN=https://your-domain.example
SESSION_COOKIE_SECURE=true
REQUEST_BODY_LIMIT=200mb
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-stripe-webhook-secret
SUPPORT_AMOUNT_CENTS=500
SUPPORT_CURRENCY=aud
MESSAGE_ENCRYPTION_KEY=your-existing-key
```

## CI

GitHub Actions runs:

- backend syntax checks
- backend tests
- frontend build

CI does not deploy and does not upload `.env` or uploads.

---

# Private Chat 中文说明

Private Chat 是一个小型私人聊天应用，适合给熟人之间使用。它支持实时文字聊天、图片消息、语音消息、登录会话、文字消息落库加密，以及基础部署检查。

## 技术栈

- 前端：React + Vite
- 后端：Node.js + Express
- 实时通信：Socket.IO
- 数据库：PostgreSQL
- 认证：账号配置在服务端，并存储到 PostgreSQL
- 会话：HttpOnly Cookie

## 账号配置

账号用户名、密码和邮箱配置在 `server/.env`，不要把真实账号信息提交到 Git。

管理员维护账号也只配置在 `server/.env`。不要在仓库文档里写真实管理员用户名。

账号配置格式参考 `server/.env.example`：

```text
PRIVILEGED_USERNAME=
ACCOUNT0_USERNAME=
ACCOUNT0_PASSWORD=
ACCOUNT0_EMAIL=
ACCOUNT1_USERNAME=
ACCOUNT1_PASSWORD=
ACCOUNT1_EMAIL=
ACCOUNT2_USERNAME=
ACCOUNT2_PASSWORD=
ACCOUNT2_EMAIL=
...
```

## 房间

当前预设 5 个房间：

```text
room1
room2
room3
room4
room5
```

## 本地开发

安装依赖：

```powershell
npm.cmd install
npm.cmd --prefix client install
npm.cmd --prefix server install
```

同时启动前端和后端：

```powershell
npm.cmd run dev
```

默认本地端口：

```text
前端：http://localhost:5173
后端：http://localhost:5001
```

如果要启动 Docker 里的 PostgreSQL：

```powershell
docker compose up -d postgres
```

## 安全注意事项

- 不要提交 `server/.env`。
- 不要提交 `server/uploads/`。
- 文字消息使用 `MESSAGE_ENCRYPTION_KEY` 加密后存储。
- 必须备份好 `MESSAGE_ENCRYPTION_KEY`。如果换了 key，旧的加密文字消息将无法解密。
- 上传的图片和音频文件目前还没有本地落盘加密。
- 生产环境必须使用 HTTPS。
- 不要把后端端口直接暴露到公网。

## 重要运行文件

这些文件应该放在 Git 外管理：

```text
server/.env
server/uploads/
```

如果部署时要保留已有上传文件，复制：

```text
server/uploads/
```

服务端 `.env` 必须继续使用已有部署的 `DATABASE_URL` 和 `MESSAGE_ENCRYPTION_KEY`。

## 测试和构建

运行后端测试：

```powershell
npm.cmd --prefix server test
```

构建前端：

```powershell
npm.cmd --prefix client run build
```

推荐生产 `.env` 配置：

```text
PUBLIC_ORIGIN=https://your-domain.example
SESSION_COOKIE_SECURE=true
MESSAGE_ENCRYPTION_KEY=your-existing-key
```

## CI

GitHub Actions 会运行：

- 后端语法检查
- 后端测试
- 前端构建

CI 不负责部署，也不会上传 `.env` 或上传文件。
