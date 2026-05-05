const express = require("express");
const router = express.Router();

const ControlState = require("../models/controlstate");
const ControlHistory = require("../models/controlhistory");

/* =========================
   Node 記憶體快取
   ESP32 讀控制狀態時，優先從這裡拿
   ========================= */
let latestControlCache = null;


/* =========================
   GET 目前控制狀態
   給 ESP32 / APP 讀取使用
   ========================= */
router.get("/control", async (req, res) => {

  try {

    // 1. 如果記憶體快取有資料，直接回傳
    // 這裡不查 MongoDB，速度最快
    if (latestControlCache) {
      return res.json(latestControlCache);
    }

    // 2. 如果 Node 剛重啟，記憶體是空的
    // 才從 MongoDB 抓最後一筆目前狀態
    const state = await ControlState.findOne().sort({ updatedAt: -1 }).lean();

    if (state) {
      latestControlCache = state;
      return res.json(state);
    }

    // 3. 如果完全沒有資料
    return res.json({});

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});


/* =========================
   POST 更新控制狀態
   APP 更新控制資料時使用
   ========================= */
router.post("/control", async (req, res) => {

  try {

    const data = req.body;

    const newState = {
      ...data,
      updatedAt: new Date()
    };

    // 1. 先更新 Node 記憶體快取
    // 這樣 ESP32 下一次 GET /control 時可以馬上拿到
    latestControlCache = newState;


    // 2. 再更新 MongoDB 目前狀態
    const state = await ControlState.findOneAndUpdate(
      {},
      newState,
      {
        new: true,
        upsert: true
      }
    ).lean();


    // 3. 用 MongoDB 回傳的完整資料同步快取
    latestControlCache = state;


    // 4. 寫入歷史紀錄
    await ControlHistory.create({
      ...data,
      timestamp: new Date()
    });


    res.json({
      message: "Control updated",
      state: latestControlCache
    });

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});


module.exports = router;