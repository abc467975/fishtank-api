const express = require("express");
const router = express.Router();

const Alarm = require("../models/Alarm");

/**
 * GET /api/alarms
 *
 * 查詢警報紀錄
 *
 * 可選參數：
 * ?status=active
 * ?device_id=fish_Tank_001
 * ?limit=50
 */
router.get("/alarms", async (req, res) => {
  try {
    const {
      status,
      device_id,
      limit = 50
    } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (device_id) {
      filter.device_id = device_id;
    }

    const alarms = await Alarm.find(filter)
      .sort({ last_detected_at: -1 })
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      count: alarms.length,
      data: alarms
    });
  } catch (error) {
    console.error("❌ GET /api/alarms error:", error);

    return res.status(500).json({
      success: false,
      message: "讀取警報資料失敗"
    });
  }
});

/**
 * GET /api/alarms/active
 *
 * 只取得目前尚未解除的警報
 */
router.get("/alarms/active", async (req, res) => {
  try {
    const alarms = await Alarm.find({
      status: {
        $in: ["active", "acknowledged"]
      }
    })
      .sort({ last_detected_at: -1 })
      .lean();

    return res.json({
      success: true,
      count: alarms.length,
      data: alarms
    });
  } catch (error) {
    console.error("❌ GET /api/alarms/active error:", error);

    return res.status(500).json({
      success: false,
      message: "讀取目前警報失敗"
    });
  }
});

/**
 * PATCH /api/alarms/:id/acknowledge
 *
 * 使用者在 App 中按下「確認」後呼叫
 */
router.patch("/alarms/:id/acknowledge", async (req, res) => {
  try {
    const alarm = await Alarm.findById(req.params.id);

    if (!alarm) {
      return res.status(404).json({
        success: false,
        message: "找不到指定的警報"
      });
    }

    // 已恢復正常的警報不需要再確認
    if (alarm.status === "resolved") {
      return res.status(400).json({
        success: false,
        message: "此警報已解除"
      });
    }

    alarm.status = "acknowledged";
    alarm.acknowledged_at = new Date();

    await alarm.save();

    return res.json({
      success: true,
      message: "警報已確認",
      data: alarm
    });
  } catch (error) {
    console.error("❌ PATCH acknowledge alarm error:", error);

    return res.status(500).json({
      success: false,
      message: "確認警報失敗"
    });
  }
});

module.exports = router;