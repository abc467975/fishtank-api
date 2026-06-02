// routes/ingest.js

console.log("🔥 ingest router loaded");

const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");

const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");

const {
  evaluateSensor
} = require("../utils/sensorGrading");

const {
  evaluateAndSaveAlarm
} = require("../utils/alarmService");

/* =====================================================
   MongoDB 連線確認
   ===================================================== */

mongoose.connection.on("connected", () => {
  console.log("✔ MongoDB ready (ingest)");
});

/* =====================================================
   工具函式：確認資料是否為有效數字
   ===================================================== */

function isValidNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    !Number.isNaN(Number(value))
  );
}

/* =====================================================
   工具函式：計算平均值
   ===================================================== */

function calculateAverage(values) {
  const validValues = values
    .filter(isValidNumber)
    .map(Number);

  if (validValues.length === 0) {
    return null;
  }

  const total = validValues.reduce(
    (sum, value) => sum + value,
    0
  );

  return total / validValues.length;
}

/* =====================================================
   工具函式：優先使用校正後數值
   ===================================================== */

function getPreferredValue(
  calibratedValue,
  rawValue
) {
  if (isValidNumber(calibratedValue)) {
    return Number(calibratedValue);
  }

  if (isValidNumber(rawValue)) {
    return Number(rawValue);
  }

  return null;
}

/* =====================================================
   ESP32 上傳感測器資料
   POST /api/sensor
   ===================================================== */

router.post("/sensor", async (req, res) => {
  /* -----------------------------------------
     0. 確認 MongoDB 是否已連線
     readyState === 1 代表 connected
     ----------------------------------------- */

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "DB not ready"
    });
  }

  try {
    const now = Date.now();

    /* -----------------------------------------
       1. 整理 ESP32 上傳資料
       ----------------------------------------- */

    const baseData = {
      ...req.body,

      timestamp: now,

      time: new Date(now).toLocaleString(
        "zh-TW",
        {
          timeZone: "Asia/Taipei"
        }
      )
    };

    /* -----------------------------------------
       2. 取得最新 Settings
       ----------------------------------------- */

    const latestSettings = await Settings
      .findOne()
      .sort({
        time: -1
      })
      .lean();

    /*
      latestSettings 若為 null：
      sensorGrading.js 會依照你原本的邏輯處理。

      警報功能則會略過沒有門檻的項目，
      避免產生錯誤警報。
    */

    /* -----------------------------------------
       3. 執行原本的感測器分級
       ----------------------------------------- */

    const grading = evaluateSensor(
      baseData,
      latestSettings
    );

    /* -----------------------------------------
       4. 儲存感測器資料與分級結果
       ----------------------------------------- */

    const data = {
      ...baseData,
      grading
    };

    const savedData = await SensorData.create(
      data
    );

    /* -----------------------------------------
       5. 整理警報判斷數值
       ----------------------------------------- */

    /*
      T1、T2、T3：魚缸內的三支溫度感測器。
      T4：新水桶溫度，不納入魚缸平均溫度警報。
    */
    const averageTemperature =
      calculateAverage([
        baseData.T1,
        baseData.T2,
        baseData.T3
      ]);

    /*
      pH 與 DO 優先使用校正後數值。
      若尚未收到校正後欄位，再退回原始欄位。
    */
    const phValue = getPreferredValue(
      baseData.pH_value,
      baseData.pH
    );

    const doValue = getPreferredValue(
      baseData.DO_value,
      baseData.DO
    );

    const turbidityValue =
      isValidNumber(baseData.Turb)
        ? Number(baseData.Turb)
        : null;

    /* -----------------------------------------
       6. 依照設定值執行警報判斷
       ----------------------------------------- */

    const deviceId =
      baseData.device_id ||
      "fish_Tank_001";

    const alarmResults = await Promise.all([
      /*
        溫度：
        低於 temperature_min 或
        高於 temperature_max 都要警報。
      */
      evaluateAndSaveAlarm({
        deviceId,
        sensorType: "temperature",
        sensorName: "魚缸溫度",
        value: averageTemperature,
        minValue:
          latestSettings?.temperature_min,
        maxValue:
          latestSettings?.temperature_max,
        unit: "°C"
      }),

      /*
        pH：
        低於 ph_min 或
        高於 ph_max 都要警報。
      */
      evaluateAndSaveAlarm({
        deviceId,
        sensorType: "ph",
        sensorName: "pH",
        value: phValue,
        minValue:
          latestSettings?.ph_min,
        maxValue:
          latestSettings?.ph_max,
        unit: ""
      }),

      /*
        溶氧：
        只判斷是否低於 do_min。
      */
      evaluateAndSaveAlarm({
        deviceId,
        sensorType: "do",
        sensorName: "溶氧量",
        value: doValue,
        minValue:
          latestSettings?.do_min,
        unit: " mg/L"
      }),

      /*
        濁度：
        只判斷是否高於 turb_max。
      */
      evaluateAndSaveAlarm({
        deviceId,
        sensorType: "turbidity",
        sensorName: "濁度",
        value: turbidityValue,
        maxValue:
          latestSettings?.turb_max,
        unit: ""
      })
    ]);

    /* -----------------------------------------
       7. 顯示測試 Log
       ----------------------------------------- */

    console.log("✅ Sensor data inserted");

    console.log(
      "⚙ Latest settings:",
      latestSettings
    );

    console.log("📊 Grading:", {
      temperature:
        grading.temperature,

      pH:
        grading.pH,

      DO:
        grading.DO,

      turbidity:
        grading.turbidity,

      waterLevel:
        grading.waterLevel
    });

    console.log(
      "🚨 Alarm check:",
      alarmResults.map(
        (result) => ({
          action:
            result.action,

          sensorType:
            result.sensorType ||
            result.alarm?.sensor_type,

          message:
            result.alarm?.message ||
            result.reason ||
            "",

          modifiedCount:
            result.modifiedCount ?? 0
        })
      )
    );

    /* -----------------------------------------
       8. 回傳給 ESP32
       ----------------------------------------- */

    return res.json({
      ok: true,
      id: savedData._id,
      grading,
      alarmResults
    });

  } catch (err) {
    console.error(
      "❌ insert fail",
      err
    );

    return res.status(500).json({
      error: "insert fail"
    });
  }
});

module.exports = router;