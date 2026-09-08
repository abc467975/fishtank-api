console.log("🔥 query router loaded");
const express = require("express");
const router = express.Router();
const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");
const { evaluateSensor } = require("../utils/sensorGrading");
const { resolveDeviceId } = require("../utils/deviceConfig");


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

// Server-side downsampling keeps 10-day charts bounded and makes MongoDB the
// authoritative history source. Legacy rows without device_id are included for
// the original single-device installation until they are backfilled.
router.get("/sensor/history", async (req, res) => {
  try {
    const range = req.query.range || "10m";
    const config = {
      "10m": { duration: 10 * 60_000, bucket: 60_000 },
      "1d": { duration: 24 * 60 * 60_000, bucket: 60 * 60_000 },
      "3d": { duration: 3 * 24 * 60 * 60_000, bucket: 3 * 60 * 60_000 },
      "10d": { duration: 10 * 24 * 60 * 60_000, bucket: 12 * 60 * 60_000 }
    }[range];
    if (!config) return res.status(400).json({ error: "Unsupported range" });
    const now = Date.now();
    const deviceId = resolveDeviceId(req.query.device_id);
    const match = {
      timestamp: { $gte: now - config.duration, $lte: now },
      $or: [{ device_id: deviceId }, { device_id: { $exists: false } }]
    };
    const rows = await SensorData.aggregate([
      { $match: match },
      { $group: {
        _id: { $floor: { $divide: ["$timestamp", config.bucket] } },
        timestamp: { $max: "$timestamp" },
        temperature: { $avg: "$TempAvg" },
        oxygen: { $avg: "$DO_value" },
        ph: { $avg: "$pH_value" },
        turbidity: { $avg: "$Turb" }
      } },
      { $sort: { timestamp: 1 } }
    ]);
    return res.json({ success: true, range, data: rows });
  } catch (err) {
    console.error("sensor/history error:", err);
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
});

module.exports = router;
