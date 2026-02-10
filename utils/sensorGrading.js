// utils/sensorGrading.js

/* =====================================================
   共用工具
   ===================================================== */

function round(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/* =====================================================
   區塊 A：暫用換算（raw → 工程值）
   👉 未來校正「只改這裡」
   ===================================================== */

/**
 * pH raw → pH（暫用版）
 * 假設 raw = ADC (0~4095)
 * 先線性 mapping，能跑即可
 */
function convertPhRawToPH(raw) {
  if (raw == null || Number.isNaN(Number(raw))) return null;

  const ADC_MIN = 0;
  const ADC_MAX = 4095;

  // ⚠️【未來校正要改】
  const PH_MIN = 0;
  const PH_MAX = 14;

  return ((raw - ADC_MIN) / (ADC_MAX - ADC_MIN)) * (PH_MAX - PH_MIN) + PH_MIN;
}

/**
 * DO raw → mg/L（暫用版）
 * 先假設 raw 對應 0~10 mg/L
 */
function convertDoRawToMgL(raw) {
  if (raw == null || Number.isNaN(Number(raw))) return null;

  const ADC_MIN = 0;
  const ADC_MAX = 4095;

  // ⚠️【未來校正要改】
  const DO_MIN = 0;
  const DO_MAX = 10;

  return ((raw - ADC_MIN) / (ADC_MAX - ADC_MIN)) * (DO_MAX - DO_MIN) + DO_MIN;
}

/* =====================================================
   區塊 B：濁度（raw 定級，用你牛奶實測）
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
   區塊 C：pH 定級（用「換算後的 pH」）
   ===================================================== */

function gradePH(ph) {
  if (ph == null || Number.isNaN(Number(ph))) {
    return { level: "UNKNOWN", label: "無資料" };
  }

  if (ph >= 6.5 && ph <= 8.5)
    return { level: "GREEN", label: "正常" };

  if ((ph >= 6.0 && ph < 6.5) || (ph > 8.5 && ph <= 9.0))
    return { level: "YELLOW", label: "偏酸/偏鹼" };

  return { level: "RED", label: "異常" };
}

/* =====================================================
   區塊 D：DO 定級（用「換算後的 mg/L」）
   ===================================================== */

function gradeDO(doMgL) {
  if (doMgL == null || Number.isNaN(Number(doMgL))) {
    return { level: "UNKNOWN", label: "無資料" };
  }

  if (doMgL >= 5.0)
    return { level: "GREEN", label: "充足" };

  if (doMgL >= 3.0)
    return { level: "YELLOW", label: "偏低" };

  return { level: "RED", label: "危險" };
}

/* =====================================================
   區塊 E：平均溫度（目前使用 T1~T3）
   👉 未來新水桶溫度可獨立
   ===================================================== */

/**
 * 計算平均溫度
 * @param {Array<number>} temps - 溫度陣列（例如 [T1, T2, T3]）
 * @returns {number|null}
 */
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
   區塊 E-2：水位定級（兩顆水位感測器）
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
      label: "無資料"
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

  // 01 → 不合理狀態
  return {
    level: "INVALID",
    label: "水位異常",
    grade: "RED"
  };
}

/* =====================================================
   區塊 F：整筆感測資料評估（給 query.js 用）
   ===================================================== */

function evaluateSensor(doc) {
  if (!doc) return null;

  // pH
  const phRawValue = convertPhRawToPH(doc.pH);
  const phValue = round(phRawValue, 2);
  const phGrade = gradePH(phValue);

  // DO
  const doRawValue = convertDoRawToMgL(doc.DO);
  const doValue = round(doRawValue, 2);
  const doGrade = gradeDO(doValue);

  // 濁度（raw，不用小數）
  const turbGrade = gradeTurbidityRaw(doc.Turb);

  // 平均溫度（建議 1 位）
  const avgTempRaw = calcAverageTemperature([
    doc.T1,
    doc.T2,
    doc.T3
  ]);
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
  convertPhRawToPH,
  convertDoRawToMgL,
  gradeTurbidityRaw,
  gradePH,
  gradeDO,
  calcAverageTemperature,
  gradeWaterLevel, 
  evaluateSensor
};
