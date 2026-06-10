// routes/ingest.js

console.log("🔥 ingest router loaded");

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");

const { evaluateSensor } = require("../utils/sensorGrading");
const { evaluateAndSaveAlarm } = require("../utils/alarmService");

// FCM 推播
const { sendAlarmPush } = require("../utils/fcmService");

// FCM Token Collection
const FcmToken = require("../models/fcmToken");

// ----------------------------
// 防呆：同一警報最少多久推播一次
// ----------------------------
const PUSH_INTERVAL = 5 * 60 * 1000; // 5 分鐘

/* MongoDB 連線確認 */
mongoose.connection.on("connected", () => {
  console.log("✔ MongoDB ready (ingest)");
});

function isValidNumber(value) {
  return value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value));
}

function calculateAverage(values) {
  const validValues = values.filter(isValidNumber).map(Number);
  if (validValues.length === 0) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function getPreferredValue(calibratedValue, rawValue) {
  if (isValidNumber(calibratedValue)) return Number(calibratedValue);
  if (isValidNumber(rawValue)) return Number(rawValue);
  return null;
}

/* ESP32 上傳感測器資料 */
router.post("/sensor", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "DB not ready" });
  }

  try {
    const now = Date.now();
    const baseData = {
      ...req.body,
      timestamp: now,
      time: new Date(now).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
    };

    // 取得最新設定
    const latestSettings = await Settings.findOne().sort({ time: -1 }).lean();

    const grading = evaluateSensor(baseData, latestSettings);

    const data = { ...baseData, grading };
    const savedData = await SensorData.create(data);

    // ----------------------------
    // 計算各項數值
    // ----------------------------
    const averageTemperature = calculateAverage([baseData.T1, baseData.T2, baseData.T3]);
    const phValue = getPreferredValue(baseData.pH_value, baseData.pH);
    const doValue = getPreferredValue(baseData.DO_value, baseData.DO);
    const turbidityValue = isValidNumber(baseData.Turb) ? Number(baseData.Turb) : null;

    const deviceId = baseData.device_id || "fish_Tank_001";

    // ----------------------------
    // 判斷警報
    // ----------------------------
    const alarmResults = await Promise.all([
      evaluateAndSaveAlarm({
        deviceId,
        sensorType: "temperature",
        sensorName: "魚缸溫度",
        value: averageTemperature,
        minValue: latestSettings?.temperature_min,
        maxValue: latestSettings?.temperature_max,
        unit: "°C"
      }),
      evaluateAndSaveAlarm({
        deviceId,
        sensorType: "ph",
        sensorName: "pH",
        value: phValue,
        minValue: latestSettings?.ph_min,
        maxValue: latestSettings?.ph_max,
        unit: ""
      }),
      evaluateAndSaveAlarm({
        deviceId,
        sensorType: "do",
        sensorName: "溶氧量",
        value: doValue,
        minValue: latestSettings?.do_min,
        unit: " mg/L"
      }),
      evaluateAndSaveAlarm({
        deviceId,
        sensorType: "turbidity",
        sensorName: "濁度",
        value: turbidityValue,
        minValue: latestSettings?.turb_max,
        unit: ""
      })
    ]);

    console.log("✅ Sensor data inserted");

    // ----------------------------
    // FCM 推播：每個警報獨立，防呆處理
    // ----------------------------
    let tokens = await FcmToken.find({ active: true }).lean();

    // 如果 MongoDB 沒有 Token，暫時用 .env 測試 Token
    if (tokens.length === 0 && process.env.TEST_FCM_TOKEN) {
      tokens = [{ token: process.env.TEST_FCM_TOKEN }];
    }

    alarmResults.forEach((result) => {
      if (!result.alarm) return; // 沒有警報就跳過
      const nowTime = Date.now();

      // 防呆：檢查 lastSentAt
      if (result.alarm.lastSentAt && (nowTime - result.alarm.lastSentAt.getTime()) < PUSH_INTERVAL) {
        console.log(`⏱ 忽略短時間重複推播: ${result.alarm.sensor_name}`);
        return;
      }

      // 更新 lastSentAt
      result.alarm.lastSentAt = new Date();

      tokens.forEach((t) => {
        sendAlarmPush(t.token, result.alarm)
          .then((messageId) => console.log(`✅ FCM 推播成功: ${messageId} -> ${t.token}`))
          .catch((err) => console.error(`❌ FCM 推播失敗 token=${t.token}`, err.message));
      });
    });

    console.log("🚨 Alarm check:", alarmResults.map((result) => ({
      action: result.action,
      sensorType: result.sensorType || result.alarm?.sensor_type,
      message: result.alarm?.message || result.reason || "",
      modifiedCount: result.modifiedCount ?? 0
    })));

    return res.json({ ok: true, id: savedData._id, grading, alarmResults });

  } catch (err) {
    console.error("❌ insert fail", err);
    return res.status(500).json({ error: "insert fail" });
  }
});

module.exports = router;