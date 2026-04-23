const mongoose = require("mongoose");

const ControlHistorySchema = new mongoose.Schema({
  mode: Boolean,

  peristaltic1: Boolean,
  peristaltic2: Boolean,

  pump1: Boolean,
  pump2: Boolean,

  aerator: Boolean,
  led: Boolean,
  heating: Boolean,

  peristaltic1_pwm: Number,
  peristaltic2_pwm: Number,

  servo: Boolean,
  manual_servo_sec: Number,

  pump_pwm1: Number,
  pump_pwm2: Number,

  aerator_pwm: Number,

  timestamp: { type: Date, default: Date.now }

},{ versionKey: false });

module.exports = mongoose.model("ControlHistory", ControlHistorySchema, "control_history");