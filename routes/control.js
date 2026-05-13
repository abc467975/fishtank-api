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
    // 1. 如果 Node 記憶體內已經有最新控制資料，直接回傳
    if (latestControlCache) {
      return res.json(latestControlCache);
    }

    // 2. 如果記憶體沒有，就從 MongoDB 抓最新狀態
    const state = await ControlState.findOne()
      .sort({ updatedAt: -1 })
      .lean();

    if (state) {
      latestControlCache = state;
      return res.json(state);
    }

    // 3. 如果資料庫也沒有資料，就回傳空物件
    return res.json({});

  } catch (err) {
    console.error("GET /control error:", err);
    res.status(500).json({ error: err.message });
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

    const newState = {
      ...data,
      updatedAt: new Date()
    };

    // 1. 先更新 MongoDB 目前控制狀態
    const state = await ControlState.findOneAndUpdate(
      {},
      newState,
      {
        new: true,
        upsert: true
      }
    ).lean();

    // 2. 更新 Node 記憶體快取
    latestControlCache = state;

    // 3. 立刻用 WebSocket 推送給 ESP32
    broadcastControl(latestControlCache);

    // 4. 用 MQTT 推送給 ESP32
    // 注意：
    // control 裡面可能包含 servo: true 這種瞬間動作，
    // 所以這裡 retain 建議 false，避免 ESP32 斷線重連後重複餵食。
    publishJson(topicControl(), latestControlCache, {
      qos: 1,
      retain: false
    });

    console.log("Control sent by WebSocket + MQTT");
    console.log("MQTT topic:", topicControl());

    // 5. 寫入歷史紀錄
    await ControlHistory.create({
      ...data,
      timestamp: new Date()
    });

    res.json({
      status: "ok",
      message: "Control updated by WebSocket + MQTT",
      websocketClients: getClientCount(),
      state: latestControlCache
    });

  } catch (err) {
    console.error("POST /control error:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;