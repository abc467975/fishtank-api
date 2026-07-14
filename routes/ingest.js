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
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function safeNumber(value) {
  return isValidNumber(value)
    ? Number(value)
    : null;
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

    const notificationStates =
      grading.notification_states || [];

      const gradingForStorage = {
  ...grading
};

delete gradingForStorage.notification_states;
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
  grading: gradingForStorage
};
    const savedData = await SensorData.create(data);

        // ----------------------------
    // 使用 sensorGrading 的統一分級結果
    // ----------------------------

    const sensorMeta = {
      temperature: {
        sensorName: "魚缸溫度",
        unit: "°C",
        min: grading.limits.temperature_min,
        max: grading.limits.temperature_max
      },

      pH: {
        sensorName: "pH",
        unit: "",
        min: grading.limits.ph_min,
        max: grading.limits.ph_max
      },

      dissolvedOxygen: {
        sensorName: "溶氧量",
        unit: "mg/L",
        min: grading.limits.do_min,
        max: null
      },

      turbidity: {
        sensorName: "濁度",
        unit: "",
        min: null,
        max: null
      },

      waterLevel: {
        sensorName: "魚缸水位",
        unit: "",
        min: null,
        max: null
      }
    };

    const alarmResults = [];

     for (const state of notificationStates ) {
      const meta = sensorMeta[state.sensor_type];

      if (!meta) {
        alarmResults.push({
          sensor_type: state.sensor_type,
          notification: {
            sent: false,
            reason: "NO_SENSOR_META"
          }
        });

        continue;
      }

      /**
       * UNKNOWN 代表感測器無資料。
       *
       * 不發送通知，也不把舊警報改成恢復正常，
       * 避免感測器斷線時錯誤清除警報狀態。
       */
      if (state.severity === "unknown") {
        alarmResults.push({
          sensor_type: state.sensor_type,
          severity: state.severity,
          notification: {
            sent: false,
            reason: "UNKNOWN_SENSOR_DATA"
          }
        });

        continue;
      }

      const alarmKey =
        `${deviceId}:${state.sensor_type}`;

      const lastAlarm = await Alarm.findOne({
        alarm_key: alarmKey
      }).lean();

      const triggered =
  state.is_abnormal === true;

/**
 * 警報方向改變：
 * 例如 high → low
 */
const alarmTypeChanged =
  Boolean(
    lastAlarm?.active &&
    lastAlarm.alarm_type &&
    lastAlarm.alarm_type !== state.alarm_type
  );

/**
 * 嚴重程度改變：
 * 例如 warning → critical
 */
const severityChanged =
  Boolean(
    lastAlarm?.active &&
    lastAlarm.severity &&
    lastAlarm.severity !== state.severity
  );

/**
 * 警報方向或嚴重程度改變時，
 * 清除上一個通知的等待及冷卻狀態。
 */
if (alarmTypeChanged || severityChanged) {
  clearAlarmNotification(
    deviceId,
    state.sensor_type,
    lastAlarm.alarm_type
  );

  console.log(
    `[警報狀態改變] ${state.sensor_type}`,
    {
      previous_alarm_type:
        lastAlarm.alarm_type,

      current_alarm_type:
        state.alarm_type,

      previous_severity:
        lastAlarm.severity,

      current_severity:
        state.severity
    }
  );
}

let message;

/**
 * 水位使用 WL1、WL2 顯示，
 * 不使用一般感測器的 valueText。
 */
if (state.sensor_type === "waterLevel") {
  message = triggered
    ? `${meta.sensorName}異常：${state.label}，WL1=${state.WL1}，WL2=${state.WL2}`
    : `${meta.sensorName}恢復正常：${state.label}，WL1=${state.WL1}，WL2=${state.WL2}`;
} else {
  const valueText =
    state.value !== null &&
    state.value !== undefined
      ? `${state.value}${meta.unit}`
      : "無資料";

  message = triggered
    ? `${meta.sensorName}異常：${state.label}，目前數值 ${valueText}`
    : `${meta.sensorName}恢復正常，目前數值 ${valueText}`;
}

const nowDate = new Date();

/**
 * 只有警報方向和嚴重程度都沒改變，
 * 才保留第一次偵測時間。
 *
 * warning 升級 critical 時，要重新開始記錄。
 */
const shouldKeepFirstDetectedAt =
  triggered &&
  lastAlarm?.active &&
  lastAlarm.alarm_type === state.alarm_type &&
  lastAlarm.severity === state.severity;

      const updateData = {
  alarm_key: alarmKey,
  device_id: deviceId,

  sensor_type: state.sensor_type,
  sensor_name: meta.sensorName,

  value:
    state.sensor_type === "waterLevel"
      ? null
      : state.value,

  state:
    state.sensor_type === "waterLevel"
      ? state.state || null
      : null,

  WL1:
    state.sensor_type === "waterLevel" &&
    isValidNumber(state.WL1)
      ? Number(state.WL1)
      : null,

  WL2:
    state.sensor_type === "waterLevel" &&
    isValidNumber(state.WL2)
      ? Number(state.WL2)
      : null,

  min_value: isValidNumber(meta.min)
    ? Number(meta.min)
    : null,

  max_value: isValidNumber(meta.max)
    ? Number(meta.max)
    : null,

  unit: meta.unit,

  active: triggered,

  alarm_type: state.alarm_type,
  severity: state.severity,
  grade: state.grade,
  label: state.label,

  message,

  status: triggered
    ? "active"
    : "resolved",

  first_detected_at:
    shouldKeepFirstDetectedAt
      ? lastAlarm.first_detected_at || nowDate
      : triggered
        ? nowDate
        : lastAlarm?.first_detected_at || nowDate,

  last_detected_at: nowDate,

/**
 * 只有從異常恢復正常時，
 * 才記錄 resolved_at。
 */
resolved_at: triggered
  ? null
  : lastAlarm?.active
    ? nowDate
    : lastAlarm?.resolved_at ?? null
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
          new: true,
          runValidators: true
        }
      );

      if (triggered) {
        /**
         * YELLOW、ORANGE、RED 都交給通知管理器。
         *
         * notificationManager 再負責：
         * 1. 總通知開關
         * 2. 單一感測器通知開關
         * 3. delay_seconds
         * 4. cooldown_seconds
         * 5. 嚴重通知開關
         */
        const notifyResult =
          await handleAlarmNotification({
            ...alarm.toObject(),

            /**
             * 明確帶入統一分級結果。
             */
            grade: state.grade,
            severity: state.severity,
            is_severe: state.is_severe,
            is_abnormal: state.is_abnormal,
            label: state.label
          });

        /**
         * 真的成功送出 FCM 才更新發送時間。
         */
        if (notifyResult?.sent) {
          alarm.lastSentAt = new Date();
          await alarm.save();
        }

        alarmResults.push({
          alarm,
          notification: notifyResult
        });
      } else {
        /**
         * GREEN：感測器恢復正常。
         *
         * 清除這個感測器所有警報類型的
         * delay 與 cooldown 記憶體狀態。
         */
        clearAlarmNotification(
          deviceId,
          state.sensor_type
        );

        alarmResults.push({
          alarm,
          notification: {
            sent: false,
            reason:
              "SENSOR_NORMAL_CLEAR_NOTIFICATION_STATE"
          }
        });
      }
    }

    console.log("✅ Sensor data inserted");

    return res.json({
  ok: true,
  id: savedData._id,

  // 回傳相容舊 App 的格式
  grading: gradingForStorage,

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