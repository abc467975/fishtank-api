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

    calibration_mode1: {
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
        calibration_mode1: false,
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
      calibration_mode,
      calibration_mode1,
      ph4_raw,
      ph7_raw,
      do_0_raw,
      do_100_raw
    } = req.body;

    const updateData = {
      updated_at: new Date()
    };

    // calibration_mode = pH 校正模式
    if (calibration_mode !== undefined) {
      updateData.calibration_mode = calibration_mode;
    }

    // calibration_mode1 = 溶氧 DO 校正模式
    if (calibration_mode1 !== undefined) {
      updateData.calibration_mode1 = calibration_mode1;
    }

    if (ph4_raw !== undefined) {
      updateData.ph4_raw = ph4_raw;
    }

    if (ph7_raw !== undefined) {
      updateData.ph7_raw = ph7_raw;
    }

    if (do_0_raw !== undefined) {
      updateData.do_0_raw = do_0_raw;
    }

    if (do_100_raw !== undefined) {
      updateData.do_100_raw = do_100_raw;
    }

    const doc = await Calibration.findOneAndUpdate(
      { device_id },
      {
        $set: updateData,
        $setOnInsert: {
          device_id,
          calibration_mode: false,
          calibration_mode1: false,
          ph4_raw: 0,
          ph7_raw: 0,
          do_0_raw: 0,
          do_100_raw: 0
        }
      },
      {
        new: true,
        upsert: true
      }
    ).lean();

    // MQTT 優先
    const mqttOk = await publishJson(topicCalibration(), doc, {
      qos: 1,
      retain: true
    });

    // MQTT 失敗才用 WebSocket 備援
    if (!mqttOk) {
      console.log("⚠️ MQTT calibration failed，改用 WebSocket 備援");
      broadcastCalibration(doc);
    }

    res.json({
      success: true,
      message: mqttOk
        ? "校正資料更新成功，已透過 MQTT 推送"
        : "校正資料更新成功，已透過 WebSocket 備援推送",
      mqttOk,
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