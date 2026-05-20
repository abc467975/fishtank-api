const mongoose = require("mongoose");

const ControlHistorySchema = new mongoose.Schema({
  mode: Boolean,

  peristaltic1: Boolean,
  peristaltic2: Boolean,

  pump1: Boolean,
  pump2: Boolean,

  aerator: Boolean,

  // ===== 新增：手動控制開關 =====
  heaterTank: Boolean,      // 魚缸加熱棒
  heaterBucket: Boolean,    // 新水桶加熱棒
  filter: Boolean,          // 過濾器
  led: Boolean,             // LED 燈

  // ===== 舊欄位：暫時保留，避免舊資料相容問題 =====
  heating: Boolean,

  peristaltic1_pwm: Number,
  peristaltic2_pwm: Number,

  servo: Boolean,
  manual_servo_sec: Number,

  pump_pwm1: Number,
  pump_pwm2: Number,

  aerator_pwm: Number,

  timestamp: { type: Date, default: Date.now }

}, { versionKey: false });

module.exports = mongoose.model("ControlHistory", ControlHistorySchema, "control_history");