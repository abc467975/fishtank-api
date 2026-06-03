    // models/Settings.js
    const mongoose = require("mongoose");

    const SettingsSchema = new mongoose.Schema({
      temperature_min: Number,
      temperature_max: Number,
      ph_min: Number,
      ph_max: Number,
      do_min: Number,
      turb_max: Number,
      auto_servo_sec: Number,
      feed_time1: String,
      feed_time2: String,
      feed_time3: String,
      time: { type: Date, default: Date.now }
    }, { versionKey: false });

    module.exports = mongoose.model("Settings", SettingsSchema, "control_settings");