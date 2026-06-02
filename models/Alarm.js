const mongoose = require("mongoose");

const AlarmSchema = new mongoose.Schema(
  {
    // 裝置名稱，未來若有多個魚缸可區分來源
    device_id: {
      type: String,
      default: "fish_Tank_001",
      index: true
    },

    // 感測器種類，例如 temperature、water_level、ph、do、turbidity
    sensor_type: {
      type: String,
      required: true,
      index: true
    },

    // 顯示於 App 的中文名稱
    sensor_name: {
      type: String,
      required: true
    },

    // high：超過上限
    // low：低於下限
    alarm_type: {
      type: String,
      enum: ["high", "low"],
      required: true
    },

    // warning：警告
    // critical：嚴重異常
    severity: {
      type: String,
      enum: ["warning", "critical"],
      default: "warning"
    },

    // 警報發生時的數值
    value: {
      type: Number,
      required: true
    },

    // 設定的正常下限
    min_value: {
      type: Number,
      default: null
    },

    // 設定的正常上限
    max_value: {
      type: Number,
      default: null
    },

    // 感測器單位，例如 °C、pH、mg/L
    unit: {
      type: String,
      default: ""
    },

    // 顯示給 App 的警報訊息
    message: {
      type: String,
      required: true
    },

    // active：異常中
    // acknowledged：使用者已確認，但異常可能仍存在
    // resolved：數值已恢復正常
    status: {
      type: String,
      enum: ["active", "acknowledged", "resolved"],
      default: "active",
      index: true
    },

    // 第一次發生異常的時間
    first_detected_at: {
      type: Date,
      default: Date.now
    },

    // 最後一次仍偵測到異常的時間
    last_detected_at: {
      type: Date,
      default: Date.now
    },

    // 恢復正常的時間
    resolved_at: {
      type: Date,
      default: null
    },

    // 使用者確認警報的時間
    acknowledged_at: {
      type: Date,
      default: null
    },

    // 避免重複建立相同類型的警報
    // 範例：fish_Tank_001:ph:low
    alarm_key: {
      type: String,
      required: true,
      index: true
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