const express = require("express");
const router = express.Router();

const ControlState = require("../models/controlstate");
const ControlHistory = require("../models/controlhistory");

const { broadcastControl, getClientCount } = require("../utils/wsHub");

/* =========================
   Node 記憶體快取
   ========================= */
let latestControlCache = null;


/* =========================
   GET 目前控制狀態
   ========================= */
router.get("/control", async (req, res) => {

  try {

    if (latestControlCache) {
      return res.json(latestControlCache);
    }

    const state = await ControlState.findOne().sort({ updatedAt: -1 }).lean();

    if (state) {
      latestControlCache = state;
      return res.json(state);
    }

    return res.json({});

  } catch (err) {

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

    const newState = {
      ...data,
      updatedAt: new Date()
    };

    // 1. 先更新 Node 記憶體
    latestControlCache = newState;

    // 2. 立刻用 WebSocket 推送給 ESP32
    broadcastControl(latestControlCache);

    // 3. 再更新 MongoDB 目前狀態
    const state = await ControlState.findOneAndUpdate(
      {},
      newState,
      {
        new: true,
        upsert: true
      }
    ).lean();

    latestControlCache = state;

    // 4. 寫入歷史紀錄
    await ControlHistory.create({
      ...data,
      timestamp: new Date()
    });

    res.json({
      message: "Control updated",
      websocketClients: getClientCount(),
      state: latestControlCache
    });

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});


module.exports = router;