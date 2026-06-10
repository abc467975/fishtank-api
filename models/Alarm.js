const mongoose = require("mongoose");

const AlarmSchema = new mongoose.Schema(
  {
    device_id: {
      type: String,
      default: "fish_Tank_001",
      index: true
    },
    sensor_type: {
      type: String,
      required: true,
      index: true
    },
    sensor_name: {
      type: String,
      required: true
    },
    alarm_type: {
      type: String,
      enum: ["high", "low"],
      required: true
    },
    severity: {
      type: String,
      enum: ["warning", "critical"],
      default: "warning"
    },
    value: {
      type: Number,
      required: true
    },
    min_value: {
      type: Number,
      default: null
    },
    max_value: {
      type: Number,
      default: null
    },
    unit: {
      type: String,
      default: ""
    },
    message: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["active", "acknowledged", "resolved"],
      default: "active",
      index: true
    },
    first_detected_at: {
      type: Date,
      default: Date.now
    },
    last_detected_at: {
      type: Date,
      default: Date.now
    },
    resolved_at: {
      type: Date,
      default: null
    },
    acknowledged_at: {
      type: Date,
      default: null
    },
    alarm_key: {
      type: String,
      required: true,
      index: true
    },
    // 新增防重複推播欄位
    active: {
      type: Boolean,
      default: false, // 當前警報是否觸發
      index: true
    },
    lastSentAt: {
      type: Date,
      default: null // 上次推播時間
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// 常用查詢：找目前尚未解除的警報
AlarmSchema.index({
  device_id: 1,
  status: 1,
  last_detected_at: -1
});

module.exports = mongoose.model("Alarm", AlarmSchema);