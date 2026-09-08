require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { isValidApiKey, verifyApiKey } = require("./utils/apiAuth");

const {
  addClient,
  broadcastSensorToApps
} = require("./utils/wsHub");

const app = express();

require("./db");

// 確認連線 OK
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(express.json());
// Every /api route is authenticated. The ESP32 already sends x-api-key for
// ingest; Android supplies it from an injected build secret.
app.use("/api", verifyApiKey);
app.use("/api/fcm-token", require("./routes/fcmToken"));
app.use("/api", require("./routes/calibrationapi"));
app.use("/api", require("./routes/query"));
app.use("/api", require("./routes/ingest"));
app.use("/api", require("./routes/settings"));
app.use("/api", require("./routes/notificationSettings"));
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
  if (!isValidApiKey(req.headers["x-api-key"])) {
    ws.close(1008, "Unauthorized");
    return;
  }

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
