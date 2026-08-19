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
    const defaultState = {
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

      aerator_pwm: 0,

      updatedAt: new Date()
    };

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
    const data = req.body;

    console.log("POST /control received:", data);

    /*
      這裡做資料整理：
      1. App 有傳的值就用 App 傳來的
      2. App 沒傳的值就給預設值
      3. 確保 ESP32 每次收到的控制資料都是完整格式
    */
    const newState = {
      mode: data.mode ?? false,

      peristaltic1: data.peristaltic1 ?? false,
      peristaltic2: data.peristaltic2 ?? false,

      pump1: data.pump1 ?? false,
      pump2: data.pump2 ?? false,

      aerator: data.aerator ?? false,

      // ===== 新增：手動控制開關 =====
      heating: data.heating ?? false,        // 魚缸加熱棒
      heating2: data.heating2 ?? false,    // 新水桶加熱棒
      filter: data.filter ?? false,                // 過濾器
      led: data.led ?? false,                      // LED燈

      
      peristaltic1_pwm: data.peristaltic1_pwm ?? 0,
      peristaltic2_pwm: data.peristaltic2_pwm ?? 0,

      servo: data.servo ?? false,
      manual_servo_sec: data.manual_servo_sec ?? 0,

      pump_pwm1: data.pump_pwm1 ?? 0,
      pump_pwm2: data.pump_pwm2 ?? 0,

      aerator_pwm: data.aerator_pwm ?? 0,

      updatedAt: new Date()
    };

    const state = await ControlState.findOneAndUpdate(
      {},
      newState,
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

    await ControlHistory.create({
      ...newState,
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
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;