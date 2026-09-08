const DEFAULT_DEVICE_ID = "fish_Tank_001";

// One resolved identifier is shared by API persistence and MQTT topics. The
// legacy MQTT_DEVICE_ID is only used as a compatibility fallback; it cannot
// diverge from the ID used by the rest of the backend.
const DEVICE_ID = String(
  process.env.FISHTANK_DEVICE_ID ||
  process.env.MQTT_DEVICE_ID ||
  DEFAULT_DEVICE_ID
).trim();

if (!DEVICE_ID) {
  throw new Error("FISHTANK_DEVICE_ID must not be empty");
}

function resolveDeviceId(requestedDeviceId) {
  const requested = requestedDeviceId == null
    ? ""
    : String(requestedDeviceId).trim();

  if (requested && requested !== DEVICE_ID) {
    const error = new Error(
      `device_id must match the configured device (${DEVICE_ID})`
    );
    error.statusCode = 409;
    throw error;
  }

  return DEVICE_ID;
}

module.exports = {
  DEVICE_ID,
  resolveDeviceId
};
