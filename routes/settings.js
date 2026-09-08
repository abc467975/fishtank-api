const express = require("express");
const router = express.Router();

const Settings = require("../models/Settings");

const { broadcastSettings } = require("../utils/wsHub");
const { publishJson, topicSettings } = require("../utils/mqttClient");

// This is the exact shape consumed by Android SettingsData. Returning it when
// MongoDB has no row prevents Gson from silently interpreting an empty object
// as zero/false values and later writing those values back to the server.
const DEFAULT_SETTINGS = Object.freeze({
  temperature_min: 24,
  temperature_max: 26,
  ph_min: 6.8,
  ph_max: 7.5,
  do_min: 6,
  turb_max: 400,
  auto_servo_sec: 1,
  feed_time1: "",
  feed_time2: "",
  feed_time3: ""
});

function finiteNumber(value, field, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${field} must be a finite number from ${min} to ${max}`);
  }
  return number;
}

function validTime(value, field) {
  if (value === "") return "";
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${field} must be empty or HH:mm`);
  }
  return value;
}

function validateSettings(body) {
  const data = {
    temperature_min: finiteNumber(body.temperature_min, "temperature_min", 0, 50),
    temperature_max: finiteNumber(body.temperature_max, "temperature_max", 0, 50),
    ph_min: finiteNumber(body.ph_min, "ph_min", 0, 14),
    ph_max: finiteNumber(body.ph_max, "ph_max", 0, 14),
    do_min: finiteNumber(body.do_min, "do_min", 0, 30),
    turb_max: finiteNumber(body.turb_max, "turb_max", 0, 4095),
    auto_servo_sec: finiteNumber(body.auto_servo_sec, "auto_servo_sec", 1, 10),
    feed_time1: validTime(body.feed_time1, "feed_time1"),
    feed_time2: validTime(body.feed_time2, "feed_time2"),
    feed_time3: validTime(body.feed_time3, "feed_time3")
  };
  if (!Number.isInteger(data.auto_servo_sec)) throw new Error("auto_servo_sec must be an integer from 1 to 10");
  if (data.temperature_min >= data.temperature_max) throw new Error("temperature_min must be less than temperature_max");
  if (data.ph_min >= data.ph_max) throw new Error("ph_min must be less than ph_max");
  return data;
}


// ===============================
// POST /api/settings
// 新增自動控制設定
// ===============================
router.post("/settings", async (req, res) => {
  try {
    console.log("POST /settings received:", req.body);

    const data = new Settings(validateSettings(req.body || {}));
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

    const status = /must be|finite number/.test(err.message) ? 400 : 500;
    res.status(status).json({
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

    res.json(settings || DEFAULT_SETTINGS);

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
