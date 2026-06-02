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

let mongoReady = false;

/* =====================================================
   MongoDB 連線確認
   ===================================================== */

mongoose.connection.once("open", () => {
  mongoReady = true;

  console.log("✔ MongoDB ready (ingest)");
});

/* =====================================================
   ESP32 上傳感測器資料
   POST /api/sensor
   ===================================================== */

router.post("/sensor", async (req, res) => {
  if (!mongoReady) {
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
      latestSettings 可能為 null。

      sensorGrading.js 內已準備預設值，
      即使資料庫尚未建立 Settings，
      仍然可以正常執行分級。
    */

    /* -----------------------------------------
       3. 執行感測器分級
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
       5. 顯示測試 Log
       ----------------------------------------- */

    console.log("✅ Sensor data inserted");

    console.log("📊 grading:", {
      temperature: grading.temperature,
      pH: grading.pH,
      DO: grading.DO,
      turbidity: grading.turbidity,
      waterLevel: grading.waterLevel
    });

    /* -----------------------------------------
       6. 回傳給 ESP32
       ----------------------------------------- */

    return res.json({
      ok: true,
      id: savedData._id,
      grading
    });

  } catch (err) {
    console.error("❌ insert fail", err);

    return res.status(500).json({
      error: "insert fail"
    });
  }
});

module.exports = router;