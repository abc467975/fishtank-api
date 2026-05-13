// utils/mqttClient.js

const mqtt = require("mqtt");

const MQTT_URL = process.env.MQTT_URL;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_DEVICE_ID = process.env.MQTT_DEVICE_ID || "default_device";

if (!MQTT_URL) {
  console.warn("⚠️ MQTT_URL 尚未設定，MQTT 不會啟動");
}

const client = MQTT_URL
  ? mqtt.connect(MQTT_URL, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      clean: true,
    })
  : null;

if (client) {
  client.on("connect", () => {
    console.log("✅ MQTT connected");
  });

  client.on("reconnect", () => {
    console.log("🔄 MQTT reconnecting...");
  });

  client.on("error", (err) => {
    console.error("❌ MQTT error:", err.message);
  });

  client.on("close", () => {
    console.log("⚠️ MQTT disconnected");
  });
}

function publishJson(topic, data, options = {}) {
  if (!client || !client.connected()) {
    console.warn("⚠️ MQTT 尚未連線，無法 publish:", topic);
    return;
  }

  const payload = JSON.stringify(data);

  client.publish(
    topic,
    payload,
    {
      qos: options.qos ?? 1,
      retain: options.retain ?? false,
    },
    (err) => {
      if (err) {
        console.error("❌ MQTT publish failed:", err.message);
      } else {
        console.log("📡 MQTT published:", topic, payload);
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
  topicCalibration,
};