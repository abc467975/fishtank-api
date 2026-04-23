// utils/sensorGrading.js
const Settings = require("../models/Settings");
/* =====================================================
   共用工具
   ===================================================== */

function round(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const factor = Math.pow(10, digits);
  return Math.round(Number(value) * factor) / factor;
}

/* =====================================================
   區塊 A：濁度（raw 定級）
   ===================================================== */

function gradeTurbidityRaw(raw) {
  if (raw == null || Number.isNaN(Number(raw))) {
    return { level: "UNKNOWN", label: "無資料" };
  }

  const v = Number(raw);

  // 708(清) → 299(濁)
  if (v >= 650) return { level: "GREEN",  label: "清澈" };
  if (v >= 580) return { level: "YELLOW", label: "微濁" };
  if (v >= 450) return { level: "ORANGE", label: "中濁" };
  return           { level: "RED",    label: "重濁" };
}

/* =====================================================
   區塊 B：pH 定級（使用 Arduino 傳來的 pH_value）
   ===================================================== */

function gradePH(ph) {
  if (ph == null || Number.isNaN(Number(ph))) {
    return { level: "UNKNOWN", label: "無資料" };
  }

  const value = Number(ph);

  if (value >= 6.5 && value <= 8.5) {
    return { level: "GREEN", label: "正常" };
  }

  if ((value >= 6.0 && value < 6.5) || (value > 8.5 && value <= 9.0)) {
    return { level: "YELLOW", label: "偏酸/偏鹼" };
  }

  return { level: "RED", label: "異常" };
}

/* =====================================================
   區塊 C：DO 定級（使用 Arduino 傳來的 DO_value）
   ===================================================== */

function gradeDO(doMgL) {
  if (doMgL == null || Number.isNaN(Number(doMgL))) {
    return { level: "UNKNOWN", label: "無資料" };
  }

  const value = Number(doMgL);

  if (value >= 5.0) {
    return { level: "GREEN", label: "充足" };
  }

  if (value >= 3.0) {
    return { level: "YELLOW", label: "偏低" };
  }

  return { level: "RED", label: "危險" };
}

/* =====================================================
   區塊 D：平均溫度
   ===================================================== */

function calcAverageTemperature(temps) {
  if (!Array.isArray(temps)) return null;

  const validTemps = temps
    .map(Number)
    .filter(v => !Number.isNaN(v));

  if (validTemps.length === 0) return null;

  const sum = validTemps.reduce((a, b) => a + b, 0);
  return sum / validTemps.length;
}

/* =====================================================
   區塊 E：水位判斷
   ===================================================== */

function normalize01(v) {
  if (v === true) return 1;
  if (v === false) return 0;

  const n = Number(v);
  if (Number.isNaN(n)) return null;

  return n ? 1 : 0;
}

/**
 * 水位判斷（WL1 = 低位、WL2 = 高位）
 * 00 → 低水位
 * 10 → 中水位
 * 11 → 高水位
 * 01 → 異常
 */
function gradeWaterLevel(WL1, WL2) {
  const w1 = normalize01(WL1);
  const w2 = normalize01(WL2);

  if (w1 === null || w2 === null) {
    return {
      level: "UNKNOWN",
      label: "無資料",
      grade: "UNKNOWN"
    };
  }

  if (w1 === 0 && w2 === 0) {
    return {
      level: "LOW",
      label: "低水位",
      grade: "RED"
    };
  }

  if (w1 === 1 && w2 === 0) {
    return {
      level: "MID",
      label: "中水位",
      grade: "YELLOW"
    };
  }

  if (w1 === 1 && w2 === 1) {
    return {
      level: "HIGH",
      label: "高水位",
      grade: "GREEN"
    };
  }

  return {
    level: "INVALID",
    label: "水位異常",
    grade: "RED"
  };
}

/* =====================================================
   區塊 F：整筆感測資料評估
   ===================================================== */

function evaluateSensor(doc) {
  if (!doc) return null;

  // pH：優先使用 Arduino 上傳的 pH_value
  const phValue = round(doc.pH_value, 2);
  const phGrade = gradePH(phValue);

  // DO：優先使用 Arduino 上傳的 DO_value
  const doValue = round(doc.DO_value, 2);
  const doGrade = gradeDO(doValue);

  // 濁度：仍以 raw 判斷
  const turbGrade = gradeTurbidityRaw(doc.Turb);

  // 平均溫度：優先使用 Arduino 上傳的 TempAvg，否則再自行平均
  const avgTempRaw =
    doc.TempAvg != null
      ? Number(doc.TempAvg)
      : calcAverageTemperature([doc.T1, doc.T2, doc.T3, doc.T4]);

  const avgTemp = round(avgTempRaw, 1);

  // 水位
  const waterLevel = gradeWaterLevel(doc.WL1, doc.WL2);

  return {
    pH: {
      raw: doc.pH,
      value: phValue,
      grade: phGrade
    },
    DO: {
      raw: doc.DO,
      value: doValue,
      grade: doGrade
    },
    turbidity: {
      raw: doc.Turb,
      grade: turbGrade
    },
    temperature: {
      avg: avgTemp
    },
    waterLevel: {
      WL1: doc.WL1,
      WL2: doc.WL2,
      ...waterLevel
    }
  };
}

module.exports = {
  gradeTurbidityRaw,
  gradePH,
  gradeDO,
  calcAverageTemperature,
  gradeWaterLevel,
  evaluateSensor
};