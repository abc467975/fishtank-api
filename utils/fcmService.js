// utils/fcmService.js

const path = require("path");

// 使用 __dirname 保證 Render 或 Linux 上路徑正確
const { messaging } = require(path.join(__dirname, "firebaseAdmin"));

/**
 * 發送單一裝置測試通知
 * @param {string} token - FCM Token
 */
async function sendTestPush(token) {
  if (!token) throw new Error("缺少 FCM Token");

  const message = {
    token,
    notification: {
      title: "🐟 魚缸系統測試",
      body: "FCM 後端推播已成功送出"
    },
    data: {
      type: "test",
      source: "node_backend"
    },
    android: {
      priority: "high"
    }
  };

  return await messaging.send(message);
}

/**
 * 發送警報通知給單一裝置
 * @param {string} token - FCM Token
 * @param {object} alarm - 警報資料物件
 */
async function sendAlarmPush(token, alarm) {
  if (!token) throw new Error("缺少 FCM Token");
  if (!alarm) throw new Error("缺少警報資料");

  const sensorName = alarm.sensor_name || alarm.sensor_type || "魚缸感測器";

  const title = alarm.severity === "critical"
    ? `🚨 ${sensorName}嚴重異常`
    : `⚠️ ${sensorName}警報`;

  const body = alarm.message || `${sensorName}目前數值為 ${alarm.value ?? "--"} ${alarm.unit ?? ""}`;

  const message = {
    token,
    notification: { title, body },
    data: {
      type: "alarm",
      alarm_id: String(alarm._id ?? ""),
      device_id: String(alarm.device_id ?? ""),
      sensor_type: String(alarm.sensor_type ?? ""),
      sensor_name: String(alarm.sensor_name ?? ""),
      alarm_type: String(alarm.alarm_type ?? ""),
      severity: String(alarm.severity ?? ""),
      value: String(alarm.value ?? ""),
      unit: String(alarm.unit ?? "")
    },
    android: { priority: "high" }
  };

  return await messaging.send(message);
}

module.exports = {
  sendTestPush,
  sendAlarmPush
};