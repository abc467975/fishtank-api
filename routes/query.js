console.log("🔥 query router loaded");
const express = require("express");
const router = express.Router();
const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");
const { evaluateSensor } = require("../utils/sensorGrading");


// 最新一筆
router.get("/sensor/latest", async (req, res) => {
  try {
    const doc = await SensorData
      .findOne()
      .sort({ timestamp: -1 })
      .lean();

    if (!doc) {
      return res.status(404).json({
        error: "目前沒有感測資料"
      });
    }

    /**
     * 不重新 evaluateSensor，
     * 直接使用儲存好的 grading。
     *
     * 同時保留 doc、evaluation，
     * 避免 App 原本使用其中一個欄位時壞掉。
     */
    return res.json({
      doc,
      evaluation: doc.grading || null
    });
  } catch (err) {
    console.error(
      "❌ sensor/latest error:",
      err
    );

    return res.status(500).json({
      error: "Server error"
    });
  }
});

// 最近 N 筆
router.get("/sensor/recent", async (req, res) => {
  const limit = Number(req.query.limit || 60);

  const docs = await SensorData
    .find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  res.json(docs.reverse());
});

module.exports = router;
