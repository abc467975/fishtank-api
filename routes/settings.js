const express = require("express");
const router = express.Router();
const Settings = require("../models/Settings");

// 引入 WebSocket 廣播功能
const { broadcastSettings } = require("../utils/wsHub");


// 新增設定
router.post("/settings", async (req, res) => {
  try {
    const data = new Settings(req.body);

    // 存進 MongoDB
    const savedData = await data.save();

    // 存完後，立刻透過 WebSocket 傳給 ESP32
    broadcastSettings(savedData);

    res.json({
      status: "ok",
      message: "Settings saved and sent to ESP32",
      data: savedData
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "save failed" });
  }
});


// 取得最新設定
router.get("/settings", async (req, res) => {
  try {
    const settings = await Settings.findOne().sort({ time: -1 });
    res.json(settings);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "read failed" });
  }
});


module.exports = router;