console.log("🔥 ingest router loaded");
const express = require("express");
const router = express.Router();
const SensorData = require("../models/SensorData");
const mongoose = require("mongoose");

let mongoReady = false;
mongoose.connection.once("open", () => {
  mongoReady = true;
  console.log("✔ MongoDB ready (ingest)");
});

router.post("/sensor", async (req, res) => {
  if (!mongoReady) {
    return res.status(503).json({ error: "DB not ready" });
  }

  try {
    const now = Date.now();

    const data = {
      ...req.body,
      timestamp: now,
      time: new Date(now).toLocaleString("zh-TW")
    };

    await SensorData.create(data);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ insert fail", err);
    res.status(500).json({ error: "insert fail" });
  }
});


module.exports = router;
