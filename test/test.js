require("./db");



const express = require("express");
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);


const app = express();
app.use(express.json({ limit: "100kb" }));

/* =========================
   ✅ Schema：一筆 snapshot
   ========================= */
const SensorSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  time: { type: String, required: true },

  device_ms: Number,

  T1: Number,
  T2: Number,
  T3: Number,
  T4: Number,

  WL1: Number,
  WL2: Number,

  ph_raw: Number,
  DO_raw: Number,
  Turb_raw: Number,

  // 你之後若要存校正後值也可加：
  // ph: Number,
  // DO: Number,
  // Turb: Number,
}, { versionKey: false });

const Sensor = mongoose.model("Sensor", SensorSchema, "Sensor_Data");

/* =========================
   ✅ 小型驗證：避免爛資料灌爆
   ========================= */
function isNumOrNull(v) {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function basicValidate(body) {
  // 必要欄位（你可視需求調整）
  const keys = ["T1","T2","T3","T4","WL1","WL2","ph_raw","DO_raw","Turb_raw"];
  for (const k of keys) {
    if (!(k in body)) return `Missing field: ${k}`;
  }
  // 型別基本檢查（溫度可為 null）
  if (!isNumOrNull(body.T1) || !isNumOrNull(body.T2) || !isNumOrNull(body.T3) || !isNumOrNull(body.T4)) {
    return "Temperature must be number or null";
  }
  // 水位 0/1
  if (![0,1].includes(body.WL1) || ![0,1].includes(body.WL2)) {
    return "WL1/WL2 must be 0 or 1";
  }
  // raw 必須數字
  if (typeof body.ph_raw !== "number" || typeof body.DO_raw !== "number" || typeof body.Turb_raw !== "number") {
    return "raw fields must be number";
  }
  return null;
}

/* =========================
   ✅ 接收 ESP32 上傳
   ========================= */

   let mongoReady = false;

mongoose.connection.once("open", () => {
  console.log("✔ MongoDB connected");
  mongoReady = true;
});
app.post("/sensor", async (req, res) => {
  try {
    const body = req.body;

    const errMsg = basicValidate(body);
    if (errMsg) {
      return res.status(400).json({ ok: false, error: errMsg });
    }

    const now = Date.now();
    const doc = new Sensor({
      timestamp: now,
      time: new Date(now).toLocaleString("zh-TW", { hour12: false }),

      ...body
    });

    await doc.save();
    res.json({ ok: true, id: doc._id, timestamp: now });
  } catch (err) {
    console.error("❌ /sensor error:", err);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

/* =========================
   ✅ 快速驗證：抓最新一筆
   ========================= */
app.get("/latest", async (req, res) => {
  const doc = await Sensor.findOne().sort({ timestamp: -1 }).lean();
  res.json(doc || {});
});

app.listen(5000, () => {
  console.log("🚀 Server running on 5000");
});
