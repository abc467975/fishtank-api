const crypto = require("crypto");

function isValidApiKey(value) {
  const expected = process.env.API_KEY;

  if (!expected || typeof value !== "string") {
    return false;
  }

  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function verifyApiKey(req, res, next) {
  if (!process.env.API_KEY) {
    return res.status(503).json({ error: "Server authentication is not configured" });
  }

  if (!isValidApiKey(req.headers["x-api-key"])) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  next();
}

module.exports = { isValidApiKey, verifyApiKey };
