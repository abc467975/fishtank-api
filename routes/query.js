console.log("🔥 query router loaded");
const express = require("express");
const router = express.Router();
const SensorData = require("../models/SensorData");
const { evaluateSensor } = require("../utils/sensorGrading");

// 最新一筆
router.get("/sensor/latest", async (req, res) => {
  const doc = await SensorData
    .findOne()
    .sort({ timestamp: -1 })
    .lean();

    const evaluation = evaluateSensor(doc);
  res.json({doc,evaluation});
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
