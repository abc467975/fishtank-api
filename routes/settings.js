const express = require("express");
const router = express.Router();
const Settings = require("../models/Settings");

// 新增設定
router.post("/settings", async (req, res) => {
  try {
    const data = new Settings(req.body);

    await data.save();

    res.json({
      status: "ok",
      message: "Settings saved"
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