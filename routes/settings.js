const express = require("express");
const router = express.Router();

const Settings = require("../models/Settings");

const { broadcastSettings } = require("../utils/wsHub");
const { publishJson, topicSettings } = require("../utils/mqttClient");


// ===============================
// POST /api/settings
// 新增自動控制設定
// ===============================
router.post("/settings", async (req, res) => {
  try {
    console.log("POST /settings received:", req.body);

    const data = new Settings(req.body);
    const savedData = await data.save();

    // MQTT 優先
    const mqttOk = await publishJson(topicSettings(), savedData, {
      qos: 1,
      retain: true
    });

    // MQTT 失敗才用 WebSocket 備援
    if (!mqttOk) {
      console.log("⚠️ MQTT settings failed，改用 WebSocket 備援");
      broadcastSettings(savedData);
    }

    res.json({
      status: "ok",
      message: mqttOk
        ? "Settings saved and sent by MQTT"
        : "Settings saved and sent by WebSocket fallback",
      mqttOk,
      data: savedData
    });

  } catch (err) {
    console.error("POST /settings error:", err);

    res.status(500).json({
      status: "error",
      error: "save failed",
      message: err.message
    });
  }
});

// ===============================
// GET /api/settings
// 取得最新自動控制設定
// ===============================
router.get("/settings", async (req, res) => {
  try {
    const settings = await Settings.findOne()
      .sort({ time: -1 })
      .lean();

    res.json(settings || {});

  } catch (err) {
    console.error("GET /settings error:", err);

    res.status(500).json({
      status: "error",
      error: "read failed",
      message: err.message
    });
  }
});


module.exports = router;