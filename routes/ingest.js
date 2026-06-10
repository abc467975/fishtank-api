// routes/ingest.js
console.log("🔥 ingest router loaded");

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");
const Alarm = require("../models/Alarm"); // 警報 Schema
const { evaluateSensor } = require("../utils/sensorGrading");
const { sendAlarmPush } = require("../utils/fcmService");
const FcmToken = require("../models/fcmToken");

// ----------------------------
// 防重複推播設定
// ----------------------------
const PUSH_INTERVAL = 5 * 60 * 1000; // 5 分鐘
const THRESHOLD = 0.2; // 浮動容忍值，例如溫度 ±0.2 不算變化

function isValidNumber(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}

function calculateAverage(values) {
  const valid = values.filter(isValidNumber).map(Number);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function getPreferredValue(calibrated, raw) {
  if (isValidNumber(calibrated)) return Number(calibrated);
  if (isValidNumber(raw)) return Number(raw);
  return null;
}

// ----------------------------
// ESP32 上傳感測器資料
// ----------------------------
router.post("/sensor", async (req, res) => {
  if (mongoose.connection.readyState !== 1)
    return res.status(503).json({ error: "DB not ready" });

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

    // 計算平均數值
    const averageTemperature = calculateAverage([baseData.T1, baseData.T2, baseData.T3]);
    const phValue = getPreferredValue(baseData.pH_value, baseData.pH);
    const doValue = getPreferredValue(baseData.DO_value, baseData.DO);
    const turbidityValue = isValidNumber(baseData.Turb) ? Number(baseData.Turb) : null;

    const deviceId = baseData.device_id || "fish_Tank_001";

    const sensors = [
      { sensorType: "temperature", sensorName: "魚缸溫度", value: averageTemperature, min: latestSettings?.temperature_min, max: latestSettings?.temperature_max, unit: "°C", alarm_type: averageTemperature > latestSettings?.temperature_max ? "high" : "low" },
      { sensorType: "ph", sensorName: "pH", value: phValue, min: latestSettings?.ph_min, max: latestSettings?.ph_max, unit: "", alarm_type: phValue > latestSettings?.ph_max ? "high" : "low" },
      { sensorType: "do", sensorName: "溶氧量", value: doValue, min: latestSettings?.do_min, max: null, unit: "mg/L", alarm_type: doValue < latestSettings?.do_min ? "low" : "high" },
      { sensorType: "turbidity", sensorName: "濁度", value: turbidityValue, min: latestSettings?.turb_max, max: null, unit: "", alarm_type: turbidityValue < latestSettings?.turb_max ? "low" : "high" }
    ];

    const alarmResults = [];

    for (const s of sensors) {
      if (s.value === null) continue;

      // 取最新警報
      let lastAlarm = await Alarm.findOne({ device_id, sensor_type: s.sensorType }).sort({ createdAt: -1 });

      // 判斷是否觸發
      let triggered = false;
      if (s.min !== null && s.value < s.min) triggered = true;
      if (s.max !== null && s.value > s.max) triggered = true;

      // 浮動值不算變化
      if (lastAlarm && Math.abs(s.value - lastAlarm.value) < THRESHOLD) {
        triggered = lastAlarm.active;
      }

      // 防重複推播
      if (lastAlarm && lastAlarm.active === triggered && lastAlarm.lastSentAt) {
        const diff = Date.now() - lastAlarm.lastSentAt.getTime();
        if (diff < PUSH_INTERVAL) {
          alarmResults.push(lastAlarm);
          continue;
        }
      }

      // 更新或新增警報
      const alarm = await Alarm.findOneAndUpdate(
        { device_id, sensor_type: s.sensorType },
        {
          value: s.value,
          sensor_name: s.sensorName,
          unit: s.unit,
          active: triggered,
          lastSentAt: triggered ? new Date() : lastAlarm?.lastSentAt || null,
          alarm_type: s.alarm_type,
          severity: triggered && s.alarm_type === "high" ? "critical" : "warning",
          message: `${s.sensorName} 異常，數值 ${s.value}${s.unit}`
        },
        { upsert: true, new: true }
      );

      // 只有觸發才推 FCM
      if (triggered) {
        const tokens = await FcmToken.find({ active: true });
        tokens.forEach(t => sendAlarmPush(t.token, alarm));
      }

      alarmResults.push(alarm);
    }

    console.log("✅ Sensor data inserted");
    return res.json({ ok: true, id: savedData._id, grading, alarmResults });

  } catch (err) {
    console.error("❌ insert fail", err);
    return res.status(500).json({ error: "insert fail" });
  }
});

module.exports = router;