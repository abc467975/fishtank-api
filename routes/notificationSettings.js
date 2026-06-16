// routes/notificationSettings.js

const express = require("express");
const router = express.Router();

const NotificationSettings = require("../models/notificationSettings");

const DEFAULT_DEVICE_ID = "fish_Tank_001";

const DEFAULT_SENSOR_SETTINGS = {
  temperature: {
    enabled: true,
    delay_seconds: 60
  },
  pH: {
    enabled: true,
    delay_seconds: 120
  },
  dissolvedOxygen: {
    enabled: true,
    delay_seconds: 60
  },
  waterLevel: {
    enabled: true,
    delay_seconds: 10
  },
  turbidity: {
    enabled: true,
    delay_seconds: 60
  }
};

const SENSOR_KEYS = [
  "temperature",
  "pH",
  "dissolvedOxygen",
  "waterLevel",
  "turbidity"
];

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function toSeconds(value, fallback, min = 0, max = 86400) {
  const num = Number(value);

  if (!Number.isFinite(num)) return fallback;

  const fixed = Math.floor(num);

  if (fixed < min) return min;
  if (fixed > max) return max;

  return fixed;
}

function normalizeSettings(body = {}, existing = {}) {
  const device_id = String(
    body.device_id ||
    existing.device_id ||
    DEFAULT_DEVICE_ID
  ).trim();

  const normalized = {
    device_id,
    enabled: toBoolean(
      body.enabled,
      existing.enabled ?? true
    ),
    cooldown_seconds: toSeconds(
      body.cooldown_seconds,
      existing.cooldown_seconds ?? 300
    ),
    updated_at: new Date()
  };

  for (const key of SENSOR_KEYS) {
    const inputSensor = body[key] || {};
    const oldSensor = existing[key] || {};
    const defaultSensor = DEFAULT_SENSOR_SETTINGS[key];

    normalized[key] = {
      enabled: toBoolean(
        inputSensor.enabled,
        oldSensor.enabled ?? defaultSensor.enabled
      ),
      delay_seconds: toSeconds(
        inputSensor.delay_seconds,
        oldSensor.delay_seconds ?? defaultSensor.delay_seconds
      )
    };
  }

  return normalized;
}

/**
 * GET /api/notification-settings
 * 取得預設魚缸通知設定
 */
router.get("/notification-settings", async (req, res) => {
  try {
    const device_id = DEFAULT_DEVICE_ID;

    let settings = await NotificationSettings.findOne({ device_id });

    if (!settings) {
      settings = await NotificationSettings.create(
        normalizeSettings({ device_id })
      );
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (err) {
    console.error("取得通知設定失敗:", err);
    res.status(500).json({
      success: false,
      message: "取得通知設定失敗",
      error: err.message
    });
  }
});

/**
 * GET /api/notification-settings/:device_id
 * 依照 device_id 取得通知設定
 */
router.get("/notification-settings/:device_id", async (req, res) => {
  try {
    const device_id = String(req.params.device_id || DEFAULT_DEVICE_ID).trim();

    let settings = await NotificationSettings.findOne({ device_id });

    if (!settings) {
      settings = await NotificationSettings.create(
        normalizeSettings({ device_id })
      );
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (err) {
    console.error("取得通知設定失敗:", err);
    res.status(500).json({
      success: false,
      message: "取得通知設定失敗",
      error: err.message
    });
  }
});

/**
 * POST /api/notification-settings
 * APP 修改通知設定
 */
router.post("/notification-settings", async (req, res) => {
  try {
    const device_id = String(
      req.body.device_id || DEFAULT_DEVICE_ID
    ).trim();

    const existing = await NotificationSettings
      .findOne({ device_id })
      .lean();

    const normalized = normalizeSettings(req.body, existing || { device_id });

    const settings = await NotificationSettings.findOneAndUpdate(
      { device_id },
      { $set: normalized },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    res.json({
      success: true,
      message: "通知設定已更新",
      data: settings
    });
  } catch (err) {
    console.error("更新通知設定失敗:", err);
    res.status(500).json({
      success: false,
      message: "更新通知設定失敗",
      error: err.message
    });
  }
});

/**
 * PUT /api/notification-settings/:device_id
 * 另一種修改方式，方便 APP 端用 PUT
 */
router.put("/notification-settings/:device_id", async (req, res) => {
  try {
    const device_id = String(
      req.params.device_id || DEFAULT_DEVICE_ID
    ).trim();

    const existing = await NotificationSettings
      .findOne({ device_id })
      .lean();

    const normalized = normalizeSettings(
      {
        ...req.body,
        device_id
      },
      existing || { device_id }
    );

    const settings = await NotificationSettings.findOneAndUpdate(
      { device_id },
      { $set: normalized },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    res.json({
      success: true,
      message: "通知設定已更新",
      data: settings
    });
  } catch (err) {
    console.error("更新通知設定失敗:", err);
    res.status(500).json({
      success: false,
      message: "更新通知設定失敗",
      error: err.message
    });
  }
});

module.exports = router;