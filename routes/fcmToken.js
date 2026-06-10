// routes/fcmToken.js

const express = require("express");
const router = express.Router();
const FcmToken = require("../models/fcmToken");

/**
 * POST /api/fcm-token
 * Body: { token: string, device_id?: string }
 */
router.post("/fcm-token", async (req, res) => {
  try {
    const { token, device_id } = req.body;

    if (!token) return res.status(400).json({ error: "缺少 token" });

    // 如果 token 已存在就更新，否則新增
    const update = await FcmToken.findOneAndUpdate(
      { token },
      {
        token,
        device_id: device_id || "unknown_device",
        active: true,
        updated_at: new Date()
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, data: update });

  } catch (err) {
    console.error("❌ 儲存 FCM Token 失敗", err);
    return res.status(500).json({ error: "server error" });
  }
});

module.exports = router;