// models/Alarm.js

const mongoose = require("mongoose");

const AlarmSchema = new mongoose.Schema(
  {
    device_id: {
      type: String,
      default: "fish_Tank_001",
      index: true,
      trim: true
    },

    sensor_type: {
      type: String,
      required: true,
      index: true,
      trim: true

      /**
       * 目前不設定 enum，
       * 可接受：
       * temperature
       * pH
       * dissolvedOxygen
       * turbidity
       * waterLevel
       */
    },

    sensor_name: {
      type: String,
      required: true
    },

    /**
     * 警報方向或種類
     */
    alarm_type: {
      type: String,
      enum: [
        "normal",
        "high",
        "low",
        "turbid",
        "mid",
        "invalid"
      ],
      required: true,
      default: "normal"
    },

    /**
     * 通知嚴重程度
     */
    severity: {
      type: String,
      enum: [
        "normal",
        "warning",
        "critical"
      ],
      default: "normal",
      required: true
    },

    /**
     * 畫面顏色分級
     */
    grade: {
      type: String,
      enum: [
        "GREEN",
        "YELLOW",
        "ORANGE",
        "RED",
        "UNKNOWN"
      ],
      default: "UNKNOWN"
    },

    /**
     * 分級顯示文字
     * 例如：
     * 溫度過高、偏鹼、危險、低水位
     */
    label: {
      type: String,
      default: ""
    },

    /**
     * 一般感測器數值。
     *
     * 水位沒有一般數值，所以允許 null。
     */
    value: {
      type: Number,
      default: null
    },

    /**
     * 水位狀態：
     * LOW / MID / HIGH / INVALID
     *
     * 非水位感測器為 null。
     */
    state: {
      type: String,
      default: null
    },

    /**
     * 水位感測器原始狀態。
     */
    WL1: {
      type: Number,
      default: null
    },

    WL2: {
      type: Number,
      default: null
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
      enum: [
        "active",
        "acknowledged",
        "resolved"
      ],
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
  unique: true
},

    /**
     * 當前是否仍處於異常。
     */
    active: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * 上一次成功推播時間。
     */
    lastSentAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

/**
 * 常用查詢：
 * 查詢某台設備目前的警報狀態。
 */
AlarmSchema.index({
  device_id: 1,
  status: 1,
  last_detected_at: -1
});

/**
 * 查詢單一感測器警報。
 */
AlarmSchema.index({
  device_id: 1,
  sensor_type: 1
});

module.exports =
  mongoose.model("Alarm", AlarmSchema);