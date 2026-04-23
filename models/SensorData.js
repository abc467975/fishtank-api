    const mongoose = require("mongoose");

const SensorDataSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  time: { type: String, required: true },

  T1: Number,
  T2: Number,
  T3: Number,
  T4: Number,

  WL1: Number,
  WL2: Number,
  WL3: Number,

  pH: Number,
  pH_value: Number,
  DO: Number,
  DO_value: Number,
  Turb: Number
}, { versionKey: false });

module.exports = mongoose.model("SensorData", SensorDataSchema);
