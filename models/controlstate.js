const mongoose = require("mongoose");

const ControlStateSchema = new mongoose.Schema({

  mode: { type: Boolean, default: false },  // true: 手動，false: 自動

  peristaltic1: { type: Boolean, default: false },  // 蠕動泵
  peristaltic2: { type: Boolean, default: false },

  pump1: { type: Boolean, default: false },         // 水泵
  pump2: { type: Boolean, default: false },

  aerator: { type: Boolean, default: false },       // 氣泵

  // ===== 新增：手動控制開關 =====
  heaterTank: { type: Boolean, default: false },    // 魚缸加熱棒
  heaterBucket: { type: Boolean, default: false },  // 新水桶加熱棒
  filter: { type: Boolean, default: false },        // 過濾器
  led: { type: Boolean, default: false },           // LED燈

  // ===== 舊欄位：暫時保留，避免舊程式還在用 heating 時出錯 =====
  heating: { type: Boolean, default: false },       // 舊加熱棒欄位

  peristaltic1_pwm: { type: Number, default: 0 },
  peristaltic2_pwm: { type: Number, default: 0 },

  servo: { type: Boolean, default: false },         // 開關（是否動作）
  manual_servo_sec: { type: Number, default: 0 },   // 手動伺服動作秒數

  pump_pwm1: { type: Number, default: 0 },
  pump_pwm2: { type: Number, default: 0 },

  aerator_pwm: { type: Number, default: 0 },

  updatedAt: { type: Date, default: Date.now }

}, { versionKey: false });

module.exports = mongoose.model("ControlState", ControlStateSchema, "control_state");