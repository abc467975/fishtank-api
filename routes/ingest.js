// routes/ingest.js
console.log("🔥 ingest router loaded");

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");
const Alarm = require("../models/Alarm");
const { evaluateSensor } = require("../utils/sensorGrading");
const { sendAlarmPush } = require("../utils/fcmService");
const FcmToken = require("../models/fcmToken");

// ----------------------------
// 防重複推播設定
// ----------------------------
const PUSH_INTERVAL = 5 * 60 * 1000; // 5 分鐘
const THRESHOLD = 0.2; // 浮動容忍值

function isValidNumber(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}

function safeNumber(value) {
  return isValidNumber(value) ? Number(value) : null;
}

function calculateAverage(values) {
  const valid = values.filter(isValidNumber).map(Number);
  if (!valid.length) return null;
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
    const baseData = { ...req.body, timestamp: now, time: new Date(now).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) };

    const latestSettings = await Settings.findOne().sort({ time: -1 }).lean();
    const grading = evaluateSensor(baseData, latestSettings);

    // ----------------------------
    // 插入 SensorData
    // ----------------------------
    const safeData = {
      ...baseData,
      T1: safeNumber(baseData.T1),
      T2: safeNumber(baseData.T2),
      T3: safeNumber(baseData.T3),
      T4: safeNumber(baseData.T4),
      TempAvg: safeNumber(baseData.TempAvg),
      pH: safeNumber(baseData.pH),
      pH_value: safeNumber(baseData.pH_value),
      DO: safeNumber(baseData.DO),
      DO_value: safeNumber(baseData.DO_value),
      Turb: safeNumber(baseData.Turb)
    };

    const data = { ...safeData, grading };
    const savedData = await SensorData.create(data);

    // ----------------------------
    // 計算各項警報數值
    // ----------------------------
    const averageTemperature = calculateAverage([safeData.T1, safeData.T2, safeData.T3]);
    const phValue = getPreferredValue(safeData.pH_value, safeData.pH);
    const doValue = getPreferredValue(safeData.DO_value, safeData.DO);
    const turbidityValue = safeNumber(safeData.Turb);

    const deviceId = baseData.device_id || "fish_Tank_001";

    const sensors = [
      { sensorType: "temperature", sensorName: "魚缸溫度", value: averageTemperature, min: latestSettings?.temperature_min, max: latestSettings?.temperature_max, unit: "°C" },
      { sensorType: "ph", sensorName: "pH", value: phValue, min: latestSettings?.ph_min, max: latestSettings?.ph_max, unit: "" },
      { sensorType: "do", sensorName: "溶氧量", value: doValue, min: latestSettings?.do_min, max: null, unit: "mg/L" },
      { sensorType: "turbidity", sensorName: "濁度", value: turbidityValue, min: latestSettings?.turb_max, max: null, unit: "" }
    ];

    const alarmResults = [];

    for (const s of sensors) {
      if (s.value === null) continue;

      const alarmKey = `${deviceId}:${s.sensorType}`;

      let lastAlarm = await Alarm.findOne({ alarm_key: alarmKey });

      // 判斷是否觸發
      let triggered = (s.min !== null && s.value < s.min) || (s.max !== null && s.value > s.max);

      // 浮動值不算改變
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

      // 儲存或更新警報
      const alarm = await Alarm.findOneAndUpdate(
        { alarm_key: alarmKey },
        {
          value: s.value,
          sensor_name: s.sensorName,
          unit: s.unit,
          active: triggered,
          lastSentAt: triggered ? new Date() : lastAlarm?.lastSentAt || null,
          alarm_type: (s.max !== null && s.value > s.max) ? "high" : "low",
          severity: triggered && s.value > (s.max || Infinity) ? "critical" : "warning",
          message: `${s.sensorName} 異常，數值 ${s.value}${s.unit}`,
          status: triggered ? "active" : "resolved",
          first_detected_at: lastAlarm?.first_detected_at || new Date(),
          last_detected_at: new Date()
        },
        { upsert: true, new: true }
      );

      // FCM 只在觸發時推播
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