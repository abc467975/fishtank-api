const express = require("express");
const mongoose = require("mongoose");

const { broadcastCalibration, getClientCount } = require("../utils/wsHub");
const { publishJson, topicCalibration } = require("../utils/mqttClient");

const router = express.Router();


// ===============================
// MongoDB Schema
// ===============================
const calibrationSchema = new mongoose.Schema(
  {
    device_id: {
      type: String,
      default: "default_device"
    },

    calibration_mode: {
      type: Boolean,
      default: true
    },

    ph4_raw: {
      type: Number,
      required: true
    },

    ph7_raw: {
      type: Number,
      required: true
    },

    do_0_raw: {
      type: Number,
      required: true
    },

    do_100_raw: {
      type: Number,
      required: true
    },

    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);


// 避免 Render / nodemon 熱重載時重複註冊 model 報錯
const Calibration =
  mongoose.models.Calibration ||
  mongoose.model("Calibration", calibrationSchema);


// ===============================
// GET /api/calibration
// ===============================
router.get("/calibration", async (req, res) => {
  try {
    const deviceId = req.query.device_id || "default_device";

    let doc = await Calibration.findOne({ device_id: deviceId }).lean();

    if (!doc) {
      const createdDoc = await Calibration.create({
        device_id: deviceId,
        calibration_mode: false,
        ph4_raw: 0,
        ph7_raw: 0,
        do_0_raw: 0,
        do_100_raw: 0,
        updated_at: new Date()
      });

      doc = createdDoc.toObject();
    }

    res.json({
      success: true,
      message: "取得校正資料成功",
      data: doc
    });

  } catch (error) {
    console.error("GET /calibration error:", error);

    res.status(500).json({
      success: false,
      message: "取得校正資料失敗",
      error: error.message
    });
  }
});


// ===============================
// POST /api/calibration
// ===============================
router.post("/calibration", async (req, res) => {
  try {
    console.log("POST /calibration received:", req.body);

    const {
      device_id = "default_device",
      calibration_mode = false,
      ph4_raw = 0,
      ph7_raw = 0,
      do_0_raw = 0,
      do_100_raw = 0
    } = req.body;

    const updateData = {
      device_id,
      calibration_mode,
      ph4_raw,
      ph7_raw,
      do_0_raw,
      do_100_raw,
      updated_at: new Date()
    };

    const doc = await Calibration.findOneAndUpdate(
      { device_id },
      { $set: updateData },
      {
        new: true,
        upsert: true
      }
    ).lean();

    // ===============================
    // WebSocket 推送給 ESP32
    // ===============================
    broadcastCalibration(doc);

    // ===============================
    // MQTT 推送給 ESP32
    // 校正資料屬於狀態資料，retain: true 是合理的
    // ESP32 重連後可以拿到最新校正值
    // ===============================
    publishJson(topicCalibration(), doc, {
      qos: 1,
      retain: true
    });

    console.log("Calibration sent by WebSocket + MQTT");
    console.log("MQTT topic:", topicCalibration());

    res.json({
      success: true,
      message: "校正資料更新成功，已透過 WebSocket + MQTT 推送",
      websocketClients: getClientCount(),
      data: doc
    });

  } catch (error) {
    console.error("POST /calibration error:", error);

    res.status(500).json({
      success: false,
      message: "更新校正資料失敗",
      error: error.message
    });
  }
});


module.exports = router;