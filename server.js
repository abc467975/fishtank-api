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

// 確認連線 OK
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(express.json());
app.use("/api/fcm-token", require("./routes/fcmToken"));

app.use("/api", require("./routes/calibrationapi"));
app.use("/api", require("./routes/query"));

app.use("/api/sensor", verifyApiKey);
app.use("/api", require("./routes/ingest"));

app.use("/api/settings", verifyApiKey);
app.use("/api", require("./routes/settings"));

app.use("/api", require("./routes/notificationSettings"));

// 如果你之後要鎖 control，再打開這行
// app.use("/api/control", verifyApiKey);
app.use("/api", require("./routes/control"));
app.use("/api", require("./routes/alarms"));



/* =========================
   HTTP + WebSocket Server
   ========================= */

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

      if (role === "esp32") {
        broadcastSensorToApps(data);
      }

    } catch (err) {
      console.error("WebSocket JSON parse error:", err.message);
    }
  });
});
server.listen(5000, () => {
  console.log("🚀 Server running on 5000");
  console.log("🔌 WebSocket path: /ws");
});