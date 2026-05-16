const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { PORT, REQUEST_BODY_LIMIT, isAllowedClientOrigin } = require("./config");
const {
  getSocketSession,
  registerAuthRoutes,
  requireAdmin,
  requireChatUser,
  requireSession,
} = require("./auth");
const { registerRoomRoutes } = require("./messages");
const { createPresence } = require("./presence");
const { registerStorageRoutes } = require("./storage");
const { registerSocketHandlers } = require("./sockets");

const corsOptions = {
  origin(origin, callback) {
    if (!origin || isAllowedClientOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

const app = express();

app.use(cors(corsOptions));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
const presence = createPresence(io);
presence.setSocketSessionResolver(getSocketSession);

registerAuthRoutes(app);
registerStorageRoutes(app, {
  requireSession,
});
registerRoomRoutes(app, {
  getSocketSession,
  io,
  presence,
  requireAdmin,
  requireChatUser,
  requireSession,
});
registerSocketHandlers(io, {
  getSocketSession,
  presence,
});

app.get("/", (req, res) => {
  res.send("Private chat server is running");
});

server.listen(PORT, () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
