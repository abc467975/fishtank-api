// routes/ingest.js

console.log("🔥 ingest router loaded");

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");
const Alarm = require("../models/Alarm");

const { evaluateSensor } = require("../utils/sensorGrading");

const {
  handleAlarmNotification,
  clearAlarmNotification
} = require("../utils/notificationManager");

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

function getAlarmType(value, min, max) {
  if (isValidNumber(max) && value > Number(max)) return "high";
  if (isValidNumber(min) && value < Number(min)) return "low";
  return "normal";
}

function getSeverity(sensorType, alarmType) {
  if (alarmType === "normal") return "normal";

  // 這裡先給基本規則
  // 之後如果你要分 warning / critical，可以再加更細的判斷
  if (sensorType === "temperature") return "warning";
  if (sensorType === "ph") return "warning";
  if (sensorType === "do") return "warning";
  if (sensorType === "turbidity") return "warning";

  return "warning";
}

function buildAlarmMessage(sensorName, alarmType, value, unit) {
  if (alarmType === "high") {
    return `${sensorName}過高，目前數值 ${value}${unit || ""}`;
  }

  if (alarmType === "low") {
    return `${sensorName}過低，目前數值 ${value}${unit || ""}`;
  }

  return `${sensorName}恢復正常，目前數值 ${value}${unit || ""}`;
}

// ----------------------------
// ESP32 上傳感測器資料
// ----------------------------
router.post("/sensor", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "DB not ready"
    });
  }

  try {
    const now = Date.now();

    const deviceId = req.body.device_id || "fish_Tank_001";

    const baseData = {
      ...req.body,
      device_id: deviceId,
      timestamp: now,
      time: new Date(now).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei"
      })
    };

    const latestSettings = await Settings.findOne()
      .sort({ time: -1 })
      .lean();

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

      WL1: safeNumber(baseData.WL1),
      WL2: safeNumber(baseData.WL2),
      WL3: safeNumber(baseData.WL3),

      pH: safeNumber(baseData.pH),
      pH_value: safeNumber(baseData.pH_value),

      DO: safeNumber(baseData.DO),
      DO_value: safeNumber(baseData.DO_value),

      Turb: safeNumber(baseData.Turb)
    };

    const data = {
      ...safeData,
      grading
    };

    const savedData = await SensorData.create(data);

    // ----------------------------
    // 計算各項警報數值
    // ----------------------------
    const averageTemperature = calculateAverage([
      safeData.T1,
      safeData.T2,
      safeData.T3
    ]);

    const phValue = getPreferredValue(safeData.pH_value, safeData.pH);
    const doValue = getPreferredValue(safeData.DO_value, safeData.DO);
    const turbidityValue = safeNumber(safeData.Turb);

    const sensors = [
      {
        sensorType: "temperature",
        sensorName: "魚缸溫度",
        value: averageTemperature,
        min: latestSettings?.temperature_min,
        max: latestSettings?.temperature_max,
        unit: "°C"
      },
      {
        sensorType: "ph",
        sensorName: "pH",
        value: phValue,
        min: latestSettings?.ph_min,
        max: latestSettings?.ph_max,
        unit: ""
      },
      {
        sensorType: "do",
        sensorName: "溶氧量",
        value: doValue,
        min: latestSettings?.do_min,
        max: null,
        unit: "mg/L"
      },
      {
        sensorType: "turbidity",
        sensorName: "濁度感測值",
        value: turbidityValue,
        min: latestSettings?.turb_min ?? latestSettings?.turbidity_min ?? latestSettings?.turb_max,
       max: null,
       unit: ""
      }
    ];

    const alarmResults = [];

    for (const s of sensors) {
      if (s.value === null) continue;

      const alarmKey = `${deviceId}:${s.sensorType}`;

      const lastAlarm = await Alarm.findOne({
        alarm_key: alarmKey
      }).lean();

      const alarmType = getAlarmType(s.value, s.min, s.max);
      const triggered = alarmType !== "normal";

      const severity = getSeverity(s.sensorType, alarmType);

      const message = buildAlarmMessage(
        s.sensorName,
        alarmType,
        s.value,
        s.unit
      );

      const updateData = {
        alarm_key: alarmKey,
        device_id: deviceId,

        sensor_type: s.sensorType,
        sensor_name: s.sensorName,

        value: s.value,
        min_value: isValidNumber(s.min) ? Number(s.min) : null,
        max_value: isValidNumber(s.max) ? Number(s.max) : null,
        unit: s.unit,

        active: triggered,
        alarm_type: alarmType,
        severity,
        message,

        status: triggered ? "active" : "resolved",

        first_detected_at:
          triggered && !lastAlarm?.active
            ? new Date()
            : lastAlarm?.first_detected_at || new Date(),

        last_detected_at: new Date()
      };

      const alarm = await Alarm.findOneAndUpdate(
        {
          alarm_key: alarmKey
        },
        {
          $set: updateData
        },
        {
          upsert: true,
          new: true
        }
      );

      if (triggered) {
        // 新版：交給 NotificationSettings 判斷是否要推播
        const notifyResult = await handleAlarmNotification(alarm);

        // 如果真的有送出 FCM，再記錄 lastSentAt
        if (notifyResult?.sent) {
          alarm.lastSentAt = new Date();
          await alarm.save();
        }

        alarmResults.push({
          alarm,
          notification: notifyResult
        });
      } else {
        // 感測器恢復正常時，清除通知延遲計時
        clearAlarmNotification(deviceId, s.sensorType);

        alarmResults.push({
          alarm,
          notification: {
            sent: false,
            reason: "SENSOR_NORMAL_CLEAR_NOTIFICATION_STATE"
          }
        });
      }
    }

    console.log("✅ Sensor data inserted");

    return res.json({
      ok: true,
      id: savedData._id,
      grading,
      alarmResults
    });

  } catch (err) {
    console.error("❌ insert fail", err);

    return res.status(500).json({
      error: "insert fail",
      message: err.message
    });
  }
});

module.exports = router;