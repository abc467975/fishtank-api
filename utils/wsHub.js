// utils/wsHub.js

let esp32Clients = new Set();
let appClients = new Set();

/* =====================================================
   WebSocket Client 連線管理
   ===================================================== */

function addClient(ws, role = "esp32") {
  if (role === "app") {
    appClients.add(ws);

    console.log("✅ App WebSocket connected");
  } else {
    esp32Clients.add(ws);

    console.log("✅ ESP32 WebSocket connected");
  }

  console.log("📡 WebSocket clients:", {
    esp32: esp32Clients.size,
    app: appClients.size
  });

  ws.on("close", () => {
    esp32Clients.delete(ws);
    appClients.delete(ws);

    console.log(`🔌 ${role} WebSocket disconnected`);

    console.log("📡 WebSocket clients:", {
      esp32: esp32Clients.size,
      app: appClients.size
    });
  });

  ws.on("error", (error) => {
    esp32Clients.delete(ws);
    appClients.delete(ws);

    console.error(
      `❌ ${role} WebSocket error:`,
      error.message
    );
  });
}

/* =====================================================
   App / Node → ESP32：控制資料
   ===================================================== */

function broadcastControl(data) {
  sendToEsp32({
    type: "control",
    data: data
  });
}

/* =====================================================
   App / Node → ESP32：設定資料
   ===================================================== */

function broadcastSettings(data) {
  sendToEsp32({
    type: "settings",
    data: data
  });
}

/* =====================================================
   App / Node → ESP32：校正資料
   ===================================================== */

function broadcastCalibration(data) {
  sendToEsp32({
    type: "calibration",
    data: data
  });
}

/* =====================================================
   Node → ESP32：共用傳送函式
   ===================================================== */

function sendToEsp32(payload) {
  const message = JSON.stringify(payload);

  esp32Clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

/* =====================================================
   Node → App：共用傳送函式
   ===================================================== */

function sendToApps(payload) {
  const message = JSON.stringify(payload);

  appClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

/* =====================================================
   ESP32 → Node → App：感測器即時資料
   ===================================================== */

function broadcastSensorToApps(data) {
  sendToApps({
    type: "sensor_update",
    data: data
  });
}

/* =====================================================
   ESP32 → Node → App：裝置狀態即時資料
   ===================================================== */

function broadcastStatusToApps(data) {
  sendToApps({
    type: "status_update",
    data: data
  });
}

/* =====================================================
   Node → App：警報即時推送
   ===================================================== */

/*
  action 可使用：
  created       新警報建立
  resolved      警報解除
  acknowledged  使用者已確認警報
*/
function broadcastAlarm(action, data) {
  sendToApps({
    type: "alarm_update",
    action: action,
    data: data
  });

  console.log("📢 Alarm WebSocket broadcast:", {
    action: action,
    sensor_type:
      data?.sensor_type || "",
    appClients:
      appClients.size
  });
}

/* =====================================================
   取得目前 WebSocket 連線數量
   ===================================================== */

function getClientCount() {
  return {
    esp32: esp32Clients.size,
    app: appClients.size
  };
}

module.exports = {
  addClient,

  broadcastControl,
  broadcastSettings,
  broadcastCalibration,

  broadcastSensorToApps,
  broadcastStatusToApps,
  broadcastAlarm,

  sendToApps,
  sendToEsp32,

  getClientCount
};