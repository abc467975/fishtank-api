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

    // 1. 存進 MongoDB
    const savedData = await data.save();

    // 2. 透過 WebSocket 即時推送給 ESP32
    broadcastSettings(savedData);

    // 3. 透過 MQTT 即時推送給 ESP32
    // settings 屬於狀態資料，retain: true 是合理的
    // ESP32 重連後可以拿到最後一次自動控制設定與餵食時間
    publishJson(topicSettings(), savedData, {
      qos: 1,
      retain: true
    });

    console.log("Settings sent by WebSocket + MQTT");
    console.log("MQTT topic:", topicSettings());

    res.json({
      status: "ok",
      message: "Settings saved and sent by WebSocket + MQTT",
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