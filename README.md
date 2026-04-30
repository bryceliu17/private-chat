# Private Chat

Private Chat is a small private chat app for people you already know. It supports real-time text chat, image messages, voice messages, login sessions, text-message encryption at rest, and basic deployment checks.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Real-time: Socket.IO
- Database: SQLite
- Auth: server-configured accounts stored in SQLite
- Session: HttpOnly cookie

## Accounts

Account usernames, passwords, and emails are configured in `server/.env` and seeded into SQLite. Do not commit real account values.

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
Nginx local test: http://localhost:8080
```

## Security Notes

- Do not commit `server/.env`.
- Do not commit `server/data/`.
- Do not commit `server/uploads/`.
- Do not commit local TLS certs.
- Text message bodies are encrypted at rest with `MESSAGE_ENCRYPTION_KEY`.
- Keep `MESSAGE_ENCRYPTION_KEY` backed up. If it changes, old encrypted text messages cannot be decrypted.
- Uploaded images and audio files are not encrypted at rest yet.
- Use HTTPS in production.
- Do not expose the backend port directly to the public internet.

## Important Runtime Files

These files should be managed outside Git:

```text
server/.env
server/data/private-chat.db
server/uploads/
```

If you want to preserve existing chat history during deployment, copy both:

```text
server/data/private-chat.db
server/uploads/
```

The server `.env` must use the same `MESSAGE_ENCRYPTION_KEY` as the database was encrypted with.

## Tests

Run backend tests:

```powershell
npm.cmd --prefix server test
```

Build frontend:

```powershell
npm.cmd --prefix client run build
```

## Nginx Deployment

Use `deploy/nginx/private-chat.conf` as the production starting point.

Production routing:

- `/`: serve `client/dist`
- `/api/`: proxy to `http://127.0.0.1:5001`
- `/socket.io/`: proxy to `http://127.0.0.1:5001`
- `/uploads/`: proxy to `http://127.0.0.1:5001`

Recommended production `.env` values:

```text
PUBLIC_ORIGIN=https://your-domain.example
SESSION_COOKIE_SECURE=true
MESSAGE_ENCRYPTION_KEY=your-existing-key
```

## CI

GitHub Actions runs:

- backend syntax checks
- backend tests
- frontend build

CI does not deploy and does not upload `.env`, database files, or uploads.
