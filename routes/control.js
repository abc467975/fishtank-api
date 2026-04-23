const express = require("express");
const router = express.Router();

const ControlState = require("../models/controlstate");
const ControlHistory = require("../models/controlhistory");


/* =========================
   GET 目前控制狀態
   ========================= */
router.get("/control", async (req, res) => {

  try {

    const state = await ControlState.findOne().sort({ updatedAt: -1 });

    res.json(state || {});

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});


/* =========================
   POST 更新控制狀態
   ========================= */
router.post("/control", async (req, res) => {

  try {

    const data = req.body;

    /* -------- 更新目前狀態 (覆蓋) -------- */

    const state = await ControlState.findOneAndUpdate(
      {},
      {
        ...data,
        updatedAt: new Date()
      },
      {
        new: true,
        upsert: true
      }
    );


    /* -------- 寫入歷史紀錄 -------- */

    await ControlHistory.create({
      ...data,
      timestamp: new Date()
    });


    res.json({
      message: "Control updated",
      state: state
    });

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});


module.exports = router;