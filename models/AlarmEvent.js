const mongoose = require("mongoose");

// Immutable audit trail. Alarm remains the current-state collection.
const AlarmEventSchema = new mongoose.Schema({
  alarm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Alarm", required: true, index: true },
  device_id: { type: String, required: true, index: true },
  event_type: { type: String, enum: ["created", "updated", "acknowledged", "resolved"], required: true },
  event_at: { type: Date, default: Date.now, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true }
}, { versionKey: false });

AlarmEventSchema.index({ device_id: 1, event_at: -1 });
module.exports = mongoose.model("AlarmEvent", AlarmEventSchema, "alarm_events");
