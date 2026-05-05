require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const { addClient } = require("./utils/wsHub");

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

app.use("/api", require("./routes/calibrationapi"));
app.use("/api", require("./routes/query"));

app.use("/api/sensor", verifyApiKey);
app.use("/api", require("./routes/ingest"));

app.use("/api/settings", verifyApiKey);
app.use("/api", require("./routes/settings"));

// 如果你之後要鎖 control，再打開這行
// app.use("/api/control", verifyApiKey);
app.use("/api", require("./routes/control"));


/* =========================
   HTTP + WebSocket Server
   ========================= */

const server = http.createServer(app);

const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

wss.on("connection", (ws, req) => {
  console.log("ESP32 WebSocket connected");

  addClient(ws);

  ws.send(JSON.stringify({
    type: "connected",
    message: "WebSocket connected to Node server"
  }));
});

server.listen(5000, () => {
  console.log("🚀 Server running on 5000");
  console.log("🔌 WebSocket path: /ws");
});