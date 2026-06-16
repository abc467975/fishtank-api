// models/notificationSettings.js

const mongoose = require("mongoose");

const SensorNotifySchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true
  },
  delay_seconds: {
    type: Number,
    default: 60,
    min: 0,
    max: 86400
  }
}, { _id: false });

const NotificationSettingsSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    default: "fish_Tank_001"
  },

  // 總開關：false 時全部不推播
  enabled: {
    type: Boolean,
    default: true
  },

  // 同一類警報發送後，多久內不要重複通知
  cooldown_seconds: {
    type: Number,
    default: 300,
    min: 0,
    max: 86400
  },

  // 各感測器通知設定
  temperature: {
    type: SensorNotifySchema,
    default: () => ({
      enabled: true,
      delay_seconds: 60
    })
  },

  pH: {
    type: SensorNotifySchema,
    default: () => ({
      enabled: true,
      delay_seconds: 120
    })
  },

  dissolvedOxygen: {
    type: SensorNotifySchema,
    default: () => ({
      enabled: true,
      delay_seconds: 60
    })
  },

  waterLevel: {
    type: SensorNotifySchema,
    default: () => ({
      enabled: true,
      delay_seconds: 10
    })
  },

  turbidity: {
    type: SensorNotifySchema,
    default: () => ({
      enabled: true,
      delay_seconds: 60
    })
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
}, { versionKey: false });

module.exports = mongoose.model("NotificationSettings", NotificationSettingsSchema);