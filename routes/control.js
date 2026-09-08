const express = require("express");
const router = express.Router();

const ControlState = require("../models/controlstate");
const ControlHistory = require("../models/controlhistory");

const { broadcastControl, getClientCount } = require("../utils/wsHub");
const { publishJson, topicControl } = require("../utils/mqttClient");


/* =========================
   Node 記憶體快取
   ========================= */
let latestControlCache = null;

const DEFAULT_CONTROL_STATE = {
  mode: false,
  peristaltic1: false,
  peristaltic2: false,
  pump1: false,
  pump2: false,
  aerator: false,
  heating: false,
  heating2: false,
  filter: false,
  led: false,
  peristaltic1_pwm: 0,
  peristaltic2_pwm: 0,
  servo: false,
  manual_servo_sec: 0,
  pump_pwm1: 0,
  pump_pwm2: 0,
  aerator_pwm: 0
};

const BOOLEAN_FIELDS = ["mode", "peristaltic1", "peristaltic2", "pump1", "pump2", "aerator", "heating", "heating2", "filter", "led", "servo"];
const PWM_FIELDS = ["peristaltic1_pwm", "peristaltic2_pwm", "manual_servo_sec", "pump_pwm1", "pump_pwm2", "aerator_pwm"];

function validateControlPatch(data) {
  const allowed = new Set([...BOOLEAN_FIELDS, ...PWM_FIELDS]);
  const unknown = Object.keys(data).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported control field: ${unknown.join(", ")}`);

  for (const field of BOOLEAN_FIELDS) {
    if (field in data && typeof data[field] !== "boolean") throw new Error(`${field} must be boolean`);
  }
  for (const field of PWM_FIELDS) {
    if (field in data && (!Number.isInteger(data[field]) || data[field] < 0 || data[field] > 255)) {
      throw new Error(`${field} must be an integer from 0 to 255`);
    }
  }
}




/* =========================
   GET 目前控制狀態
   ========================= */
router.get("/control", async (req, res) => {
  try {

    // ⭐ 每次都從 MongoDB 取得真正最新狀態
    const state = await ControlState.findOne()
      .sort({ updatedAt: -1 })
      .lean();

    if (state) {
      // 同步快取
      latestControlCache = state;

      return res.json(state);
    }

    // 資料庫完全沒有資料時才使用預設值
    const defaultState = { ...DEFAULT_CONTROL_STATE, updatedAt: new Date() };

    latestControlCache = defaultState;

    return res.json(defaultState);

  } catch (err) {

    console.error(
      "GET /control error:",
      err
    );

    res.status(500).json({
      error: err.message
    });
  }
});


/* =========================
   POST 更新控制狀態
   APP 呼叫這支 API
   ========================= */
router.post("/control", async (req, res) => {
  try {
    const data = req.body || {};

    validateControlPatch(data);

    console.log("POST /control received:", data);

    // Atomic $set prevents concurrent partial updates from overwriting one
    // another. Defaults are used only on the first insert.
    const insertDefaults = Object.fromEntries(
      Object.entries(DEFAULT_CONTROL_STATE).filter(([field]) => !(field in data))
    );

    const state = await ControlState.findOneAndUpdate(
      {},
      {
        $set: { ...data, updatedAt: new Date() },
        $setOnInsert: insertDefaults
      },
      {
        new: true,
        upsert: true
      }
    ).lean();

    latestControlCache = state;

// MQTT 優先
const mqttOk = await publishJson(topicControl(), latestControlCache, {
  qos: 1,
  retain: false
});

// MQTT 失敗才用 WebSocket 備援
if (!mqttOk) {
  console.log("⚠️ MQTT control failed，改用 WebSocket 備援");
  broadcastControl(latestControlCache);
}

// ⭐ 儲存控制歷史，但不要沿用 ControlState 的 _id
const {
  _id,
  __v,
  ...historyData
} = latestControlCache;

await ControlHistory.create({
  ...historyData,
  timestamp: new Date()
});

res.json({
  status: "ok",
  message: mqttOk
    ? "Control updated by MQTT"
    : "Control updated by WebSocket fallback",
  mqttOk,
  websocketClients: getClientCount(),
  state: latestControlCache
});

  } catch (err) {
    console.error("POST /control error:", err);
    const status = /^Unsupported control field|must be boolean|must be an integer/.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});


module.exports = router;
