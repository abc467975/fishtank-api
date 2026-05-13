const mqtt = require("mqtt");

const MQTT_URL = process.env.MQTT_URL;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_DEVICE_ID = process.env.MQTT_DEVICE_ID || "default_device";

let client = null;

if (!MQTT_URL) {
  console.warn("⚠️ MQTT_URL 尚未設定，MQTT 不會啟動");
} else {
  client = mqtt.connect(MQTT_URL, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    protocolVersion: 4,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    clean: true
  });

  client.on("connect", () => {
    console.log("✅ MQTT connected");
    console.log("MQTT_DEVICE_ID:", MQTT_DEVICE_ID);
  });

  client.on("reconnect", () => {
    console.log("🔄 MQTT reconnecting...");
  });

  client.on("close", () => {
    console.log("⚠️ MQTT disconnected");
  });

  client.on("offline", () => {
    console.log("⚠️ MQTT offline");
  });

  client.on("error", (err) => {
    console.error("❌ MQTT error:", err.message);
  });
}

function publishJson(topic, data, options = {}) {
  if (!client) {
    console.warn("⚠️ MQTT client 尚未建立，無法 publish:", topic);
    return;
  }

  // 注意：connected 是屬性，不是函式
  if (!client.connected) {
    console.warn("⚠️ MQTT 尚未連線，無法 publish:", topic);
    return;
  }

  const payload = JSON.stringify(data);

  client.publish(
    topic,
    payload,
    {
      qos: options.qos ?? 1,
      retain: options.retain ?? false
    },
    (err) => {
      if (err) {
        console.error("❌ MQTT publish failed:", err.message);
      } else {
        console.log("📡 MQTT published:", topic);
        console.log(payload);
      }
    }
  );
}

function topicControl() {
  return `fish/control/${MQTT_DEVICE_ID}`;
}

function topicSettings() {
  return `fish/settings/${MQTT_DEVICE_ID}`;
}

function topicCalibration() {
  return `fish/calibration/${MQTT_DEVICE_ID}`;
}

module.exports = {
  publishJson,
  topicControl,
  topicSettings,
  topicCalibration
};