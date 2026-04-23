const express = require("express");
const mongoose = require("mongoose");

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

    // 校正模式啟動
    calibration_mode: {
      type: Boolean,
      default: true
    },

    // pH 標準液 raw 值
    ph4_raw: {
      type: Number,
      required: true
    },
    ph7_raw: {
      type: Number,
      required: true
    },

    // DO 容氧 raw 值
    do_0_raw: {
      type: Number,
      required: true
    },
    do_100_raw: {
      type: Number,
      required: true
    },

    // 額外紀錄
    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);

const Calibration = mongoose.model("Calibration", calibrationSchema);

// ===============================
// 取得目前校正資料
// GET /api/calibration
// ===============================
router.get("/calibration", async (req, res) => {
  try {
    const deviceId = req.query.device_id || "default_device";

    let doc = await Calibration.findOne({ device_id: deviceId });

    // 如果資料不存在，自動建立一筆預設值
    if (!doc) {
      doc = await Calibration.create({
        device_id: deviceId
      });
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
// 更新校正資料（包含校正模式啟動和標準液 raw 值）
// POST /api/calibration
// Body:
// {
//   "device_id": "fish_tank_01",
//   "calibration_mode": true,
//   "ph4_raw": 476,
//   "ph7_raw": 369,
//   "do_0_raw": 200,
//   "do_100_raw": 1000,
//   "updated_at": "2026-04-07T07:00:00"
// }
// ===============================
router.post("/calibration", async (req, res) => {
  try {
    const {
      device_id = "default_device",
      calibration_mode,
      ph4_raw,
      ph7_raw,
      do_0_raw,
      do_100_raw,
      updated_at = new Date()
    } = req.body;

    const updateData = {
      calibration_mode,
      ph4_raw,
      ph7_raw,
      do_0_raw,
      do_100_raw,
      updated_at
    };

    const doc = await Calibration.findOneAndUpdate(
      { device_id },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "校正資料更新成功",
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