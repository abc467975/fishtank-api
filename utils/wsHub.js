let esp32Clients = new Set();
let appClients = new Set();

function addClient(ws, role = "esp32") {
  if (role === "app") {
    appClients.add(ws);
    console.log("App WebSocket connected");
  } else {
    esp32Clients.add(ws);
    console.log("ESP32 WebSocket connected");
  }

  ws.on("close", () => {
    esp32Clients.delete(ws);
    appClients.delete(ws);
    console.log(`${role} WebSocket disconnected`);
  });

  ws.on("error", () => {
    esp32Clients.delete(ws);
    appClients.delete(ws);
  });
}

// App/Node → ESP32：控制
function broadcastControl(data) {
  sendToEsp32({
    type: "control",
    data: data
  });
}

// App/Node → ESP32：設定
function broadcastSettings(data) {
  sendToEsp32({
    type: "settings",
    data: data
  });
}

// App/Node → ESP32：校正
function broadcastCalibration(data) {
  sendToEsp32({
    type: "calibration",
    data: data
  });
}

// Node → ESP32
function sendToEsp32(payload) {
  const message = JSON.stringify(payload);

  esp32Clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Node → App
function sendToApps(payload) {
  const message = JSON.stringify(payload);

  appClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// ESP32 → Node → App：感測器即時資料
function broadcastSensorToApps(data) {
  sendToApps({
    type: "sensor_update",
    data: data
  });
}

// ESP32 → Node → App：狀態即時資料
function broadcastStatusToApps(data) {
  sendToApps({
    type: "status_update",
    data: data
  });
}

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
  sendToApps,
  sendToEsp32,
  getClientCount
};