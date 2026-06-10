const mongoose = require("mongoose");

const FcmTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  device_id: { type: String },
  active: { type: Boolean, default: true },
  updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model("FcmToken", FcmTokenSchema);