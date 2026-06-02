// models/SensorData.js

const mongoose = require("mongoose");

const SensorDataSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Number,
      required: true
    },

    time: {
      type: String,
      required: true
    },

    // 溫度感測器
    T1: Number,
    T2: Number,
    T3: Number,
    T4: Number,

    // Arduino 已算好的平均溫度
    TempAvg: Number,

    // 水位感測器
    WL1: Number,
    WL2: Number,
    WL3: Number,

    // pH
    pH: Number,
    pH_value: Number,

    // 溶氧
    DO: Number,
    DO_value: Number,

    // 濁度 raw ADC
    Turb: Number,

    // Node 計算後的感測器分級結果
    grading: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    versionKey: false
  }
);

module.exports = mongoose.model(
  "SensorData",
  SensorDataSchema
);