// routes/ingest.js

console.log("🔥 ingest router loaded");

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");
const Alarm = require("../models/alarm"); // 新增 Alarm schema

const { evaluateSensor } = require("../utils/sensorGrading");
const { evaluateAndSaveAlarm } = require("../utils/alarmService");
const { sendAlarmPush } = require("../utils/fcmService");
const FcmToken = require("../models/fcmToken");

// ----------------------------
// 防重複推播設定
// ----------------------------
const PUSH_INTERVAL = 5 * 60 * 1000; // 5 分鐘

// ----------------------------
// 工具函式
// ----------------------------
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

// ----------------------------
// ESP32 上傳感測器資料
// ----------------------------
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

    const latestSettings = await Settings.findOne().sort({ time: -1 }).lean();
    const grading = evaluateSensor(baseData, latestSettings);

    const data = { ...baseData, grading };
    const savedData = await SensorData.create(data);

    const averageTemperature = calculateAverage([baseData.T1, baseData.T2, baseData.T3]);
    const phValue = getPreferredValue(baseData.pH_value, baseData.pH);
    const doValue = getPreferredValue(baseData.DO_value, baseData.DO);
    const turbidityValue = isValidNumber(baseData.Turb) ? Number(baseData.Turb) : null;

    const deviceId = baseData.device_id || "fish_Tank_001";

    // ----------------------------
    // 判斷警報並防重複推播
    // ----------------------------
    const alarmInputs = [
      { sensorType: "temperature", sensorName: "魚缸溫度", value: averageTemperature, min: latestSettings?.temperature_min, max: latestSettings?.temperature_max, unit: "°C" },
      { sensorType: "ph", sensorName: "pH", value: phValue, min: latestSettings?.ph_min, max: latestSettings?.ph_max, unit: "" },
      { sensorType: "do", sensorName: "溶氧量", value: doValue, min: latestSettings?.do_min, max: null, unit: "mg/L" },
      { sensorType: "turbidity", sensorName: "濁度", value: turbidityValue, min: latestSettings?.turb_max, max: null, unit: "" }
    ];

    const alarmResults = [];

    for (const alarmInput of alarmInputs) {
      // 取得該感測器最後一次警報
      let lastAlarm = await Alarm.findOne({ device_id: deviceId, sensor_type: alarmInput.sensorType }).sort({ createdAt: -1 });

      // 判斷是否要觸發警報
      let triggered = false;
      if (alarmInput.value !== null) {
        if ((alarmInput.min !== undefined && alarmInput.value < alarmInput.min) ||
            (alarmInput.max !== undefined && alarmInput.value > alarmInput.max)) {
          triggered = true;
        }
      }

      // 如果警報狀態沒變且未到推播間隔，直接返回
      if (lastAlarm && lastAlarm.active === triggered && lastAlarm.lastSentAt) {
        const diff = Date.now() - lastAlarm.lastSentAt.getTime();
        if (diff < PUSH_INTERVAL) {
          alarmResults.push(lastAlarm);
          continue; // 不重複推播
        }
      }

      // 儲存或更新警報
      const alarm = await Alarm.findOneAndUpdate(
        { device_id: deviceId, sensor_type: alarmInput.sensorType },
        {
          value: alarmInput.value,
          sensor_name: alarmInput.sensorName,
          unit: alarmInput.unit,
          active: triggered,
          lastSentAt: triggered ? new Date() : lastAlarm?.lastSentAt || null
        },
        { upsert: true, new: true }
      );

      // 只有觸發警報才推播
      if (triggered) {
        const tokens = await FcmToken.find({ active: true });
        tokens.forEach(t => sendAlarmPush(t.token, alarm));
      }

      alarmResults.push(alarm);
    }

    console.log("✅ Sensor data inserted");
    console.log("🚨 Alarm check:", alarmResults.map(a => ({
      sensorType: a.sensor_type,
      active: a.active,
      lastSentAt: a.lastSentAt
    })));

    return res.json({ ok: true, id: savedData._id, grading, alarmResults });

  } catch (err) {
    console.error("❌ insert fail", err);
    return res.status(500).json({ error: "insert fail" });
  }
});

module.exports = router;