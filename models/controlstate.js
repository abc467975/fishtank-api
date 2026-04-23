const mongoose = require("mongoose");

const ControlStateSchema = new mongoose.Schema({

  mode: { type: Boolean, default: false },  //ture:手動

  peristaltic1: { type: Boolean, default: false },  //蠕動泵
  peristaltic2: { type: Boolean, default: false },

  pump1: { type: Boolean, default: false },         //水泵
  pump2: { type: Boolean, default: false },

  aerator: { type: Boolean, default: false },       //氣泵
  led: { type: Boolean, default: false },           //燈
  heating: { type: Boolean, default: false },       //加熱棒

  peristaltic1_pwm: { type: Number, default: 0 },
  peristaltic2_pwm: { type: Number, default: 0 },

  servo: { type: Boolean, default: false },     // 開關（是否動作）
  manual_servo_sec: { type: Number, default: 0 },    // 角度（0~180）

  pump_pwm1: { type: Number, default: 0 },
  pump_pwm2: { type: Number, default: 0 },

  aerator_pwm: { type: Number, default: 0 },

  updatedAt: { type: Date, default: Date.now }
},{ versionKey: false });

module.exports = mongoose.model("ControlState", ControlStateSchema, "control_state");