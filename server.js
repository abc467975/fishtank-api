require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const {
  addClient,
  broadcastSensorToApps
} = require("./utils/wsHub");

const app = express();

function verifyApiKey(req, res, next) {
  const clientKey = req.headers["x-api-key"];
  if (!clientKey || clientKey !== process.env.API_KEY) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
}

require("./db");

// ----------------------------
// Middleware
// ----------------------------
app.use(express.json());

// ----------------------------
// /api/fcm-token 必須單獨掛最前面
// ----------------------------
app.use("/api/fcm-token", require("./routes/fcmToken"));

// ----------------------------
// 其他 API 路由
// ----------------------------
app.use("/api/calibrationapi", require("./routes/calibrationapi"));
app.use("/api/query", require("./routes/query"));

app.use("/api/sensor", verifyApiKey, require("./routes/ingest"));
app.use("/api/settings", verifyApiKey, require("./routes/settings"));
app.use("/api/control", require("./routes/control"));
app.use("/api/alarms", require("./routes/alarms"));

// ----------------------------
// Health check
// ----------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ----------------------------
// HTTP + WebSocket Server
// ----------------------------
const server = http.createServer(app);

const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get("role") || "esp32";

  console.log(`${role} WebSocket connected`);
  addClient(ws, role);

  ws.send(JSON.stringify({
    type: "connected",
    role: role,
    message: "WebSocket connected to Node server"
  }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`收到 ${role} WebSocket 資料:`, data);
      if (role === "esp32") broadcastSensorToApps(data);
    } catch (err) {
      console.error("WebSocket JSON parse error:", err.message);
    }
  });
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on ${process.env.PORT || 5000}`);
  console.log("🔌 WebSocket path: /ws");
});