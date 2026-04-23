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

    const settings = await Settings
      .findOne()
      .sort({ time: -1 })
      .lean();

    const evaluation = evaluateSensor(doc, settings);

    res.json({ doc, evaluation });
  } catch (err) {
    console.error("❌ sensor/latest error:", err);
    res.status(500).json({ error: "Server error" });
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
