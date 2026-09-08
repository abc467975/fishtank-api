const express = require("express");
const router = express.Router();

const Alarm = require("../models/Alarm");
const AlarmEvent = require("../models/AlarmEvent");

const {
  broadcastAlarm
} = require("../utils/wsHub");
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
    const filter = {
      status: {
        $in: ["active", "acknowledged"]
      }
    };
    if (req.query.device_id) filter.device_id = req.query.device_id;
    const alarms = await Alarm.find(filter)
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

// Immutable event history for the App. /alarms remains current-state compatible.
router.get("/alarm-events", async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit || 100);
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
    const filter = req.query.device_id ? { device_id: req.query.device_id } : {};
    const events = await AlarmEvent.find(filter).sort({ event_at: -1 }).limit(limit).lean();
    return res.json({
      success: true,
      count: events.length,
      data: events.map((event) => ({ ...event.payload, event_type: event.event_type, event_at: event.event_at }))
    });
  } catch (error) {
    console.error("GET /alarm-events error:", error);
    return res.status(500).json({ success: false, message: "讀取警報事件失敗" });
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

    await AlarmEvent.create({
      alarm_id: alarm._id,
      device_id: alarm.device_id,
      event_type: "acknowledged",
      event_at: alarm.acknowledged_at,
      payload: alarm.toObject()
    });

/*
  通知其他 App 畫面：
  此警報已被使用者確認。
*/
broadcastAlarm(
  "acknowledged",
  alarm.toObject()
);

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
