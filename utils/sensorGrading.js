// utils/sensorGrading.js

/* =====================================================
   預設值
   MongoDB 尚未建立 Settings 時，仍可正常判斷
   ===================================================== */

const DEFAULT_LIMITS = {
  temperature_min: 24.0,
  temperature_max: 30.0,

  ph_min: 6.5,
  ph_max: 8.5,

  do_min: 5.0,

  // 黃色警告緩衝區
  temperature_warning_margin: 1.0,
  ph_warning_margin: 0.5,
  do_warning_margin: 2.0
};

/* =====================================================
   區塊 A：共用工具
   ===================================================== */

function isValidNumber(value) {
  if (value == null || value === "") return false;

  return Number.isFinite(Number(value));
}

function round(value, digits = 2) {
  if (!isValidNumber(value)) return null;

  const factor = Math.pow(10, digits);

  return Math.round(Number(value) * factor) / factor;
}

/**
 * 從 MongoDB Settings 讀取數字。
 * 若欄位不存在或格式錯誤，改用預設值。
 */
function getSettingNumber(settings, key, fallbackValue) {
  if (!settings) return fallbackValue;

  const value = settings[key];

  if (!isValidNumber(value)) return fallbackValue;

  return Number(value);
}

/**
 * 將 Settings 整理成分級模組需要的格式。
 */
function resolveLimits(settings) {
  return {
    temperature_min: getSettingNumber(
      settings,
      "temperature_min",
      DEFAULT_LIMITS.temperature_min
    ),

    temperature_max: getSettingNumber(
      settings,
      "temperature_max",
      DEFAULT_LIMITS.temperature_max
    ),

    ph_min: getSettingNumber(
      settings,
      "ph_min",
      DEFAULT_LIMITS.ph_min
    ),

    ph_max: getSettingNumber(
      settings,
      "ph_max",
      DEFAULT_LIMITS.ph_max
    ),

    do_min: getSettingNumber(
      settings,
      "do_min",
      DEFAULT_LIMITS.do_min
    ),

    turb_max: getSettingNumber(
      settings,
      "turb_max",
      DEFAULT_LIMITS.turb_max
    ),

    temperature_warning_margin:
      DEFAULT_LIMITS.temperature_warning_margin,

    ph_warning_margin:
      DEFAULT_LIMITS.ph_warning_margin,

    do_warning_margin:
      DEFAULT_LIMITS.do_warning_margin
  };
}

/* =====================================================
   區塊 B：濁度 raw 定級
   Arduino 傳入 raw ADC 值
   raw 越高 → 越清澈
   raw 越低 → 越混濁

   limits.turb_max 雖然名稱為 max，
   實際用途是「最低安全 raw 門檻」。
   ===================================================== */

function gradeTurbidityRaw(raw, limits) {
  if (!isValidNumber(raw)) {
    return {
      level: "UNKNOWN",
      label: "無資料"
    };
  }

  const value = Number(raw);

  // App 設定的最低安全 raw 門檻
  const safeMin = limits.turb_max;

  // 保留原本分級距離：
  // GREEN  比最低安全門檻高 70 以上
  // YELLOW 尚未低於安全門檻
  // ORANGE 低於安全門檻，但尚未嚴重混濁
  // RED    嚴重混濁
  const greenMin = safeMin + 70;
  const redMax = safeMin - 130;

  if (value >= greenMin) {
    return {
      level: "GREEN",
      label: "清澈"
    };
  }

  if (value >= safeMin) {
    return {
      level: "YELLOW",
      label: "微濁"
    };
  }

  if (value >= redMax) {
    return {
      level: "ORANGE",
      label: "中濁"
    };
  }

  return {
    level: "RED",
    label: "重濁"
  };
}

/* =====================================================
   區塊 C：pH 分級
   使用 Arduino 已換算完成的 pH_value
   上下限來自 Settings
   ===================================================== */

function gradePH(ph, limits) {
  if (!isValidNumber(ph)) {
    return {
      level: "UNKNOWN",
      label: "無資料"
    };
  }

  const value = Number(ph);

  const min = limits.ph_min;
  const max = limits.ph_max;
  const margin = limits.ph_warning_margin;

  if (value >= min && value <= max) {
    return {
      level: "GREEN",
      label: "正常"
    };
  }

  if (
    value >= min - margin &&
    value <= max + margin
  ) {
    return {
      level: "YELLOW",
      label: value < min ? "偏酸" : "偏鹼"
    };
  }

  return {
    level: "RED",
    label: value < min ? "過酸" : "過鹼"
  };
}

/* =====================================================
   區塊 D：DO 分級
   使用 Arduino 已換算完成的 DO_value
   最低標準來自 Settings
   ===================================================== */

function gradeDO(doMgL, limits) {
  if (!isValidNumber(doMgL)) {
    return {
      level: "UNKNOWN",
      label: "無資料"
    };
  }

  const value = Number(doMgL);

  const normalMin = limits.do_min;
  const warningMin =
    normalMin - limits.do_warning_margin;

  if (value >= normalMin) {
    return {
      level: "GREEN",
      label: "充足"
    };
  }

  if (value >= warningMin) {
    return {
      level: "YELLOW",
      label: "偏低"
    };
  }

  return {
    level: "RED",
    label: "危險"
  };
}

/* =====================================================
   區塊 E：平均溫度計算
   ===================================================== */

function calcAverageTemperature(temps) {
  if (!Array.isArray(temps)) return null;

  const validTemps = temps
    .filter(isValidNumber)
    .map(Number);

  if (validTemps.length === 0) return null;

  const sum = validTemps.reduce((total, current) => {
    return total + current;
  }, 0);

  return sum / validTemps.length;
}

/* =====================================================
   區塊 F：平均溫度分級
   上下限來自 Settings
   ===================================================== */

function gradeTemperature(temp, limits) {
  if (!isValidNumber(temp)) {
    return {
      level: "UNKNOWN",
      label: "無資料"
    };
  }

  const value = Number(temp);

  const min = limits.temperature_min;
  const max = limits.temperature_max;
  const margin =
    limits.temperature_warning_margin;

  if (value >= min && value <= max) {
    return {
      level: "GREEN",
      label: "正常"
    };
  }

  if (
    value >= min - margin &&
    value <= max + margin
  ) {
    return {
      level: "YELLOW",
      label: value < min
        ? "溫度偏低"
        : "溫度偏高"
    };
  }

  return {
    level: "RED",
    label: value < min
      ? "溫度過低"
      : "溫度過高"
  };
}

/* =====================================================
   區塊 G：水位判斷
   WL1、WL2 為數位狀態，不使用 Settings
   ===================================================== */

function normalize01(value) {
  if (value === true) return 1;
  if (value === false) return 0;

  if (!isValidNumber(value)) return null;

  return Number(value) ? 1 : 0;
}

/**
 * WL1 = 低位感測器
 * WL2 = 高位感測器
 *
 * 00 → 低水位
 * 10 → 中水位
 * 11 → 高水位
 * 01 → 感測器狀態異常
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
   區塊 H：整筆感測資料評估
   doc      = ESP32 上傳的感測器資料
   settings = MongoDB 最新 Settings
   ===================================================== */

function evaluateSensor(doc, settings = null) {
  if (!doc) return null;

  const limits = resolveLimits(settings);

  // pH：Arduino 已換算完成
  const phValue = round(doc.pH_value, 2);
  const phGrade = gradePH(
    phValue,
    limits
  );

  // DO：Arduino 已換算完成
  const doValue = round(doc.DO_value, 2);
  const doGrade = gradeDO(
    doValue,
    limits
  );

  // 濁度：暫時使用 raw 固定分級
  const turbGrade = gradeTurbidityRaw(
  doc.Turb,
  limits
);

  // 平均溫度：
  // 優先使用 Arduino 上傳的 TempAvg
  // 沒有時再由 Node 計算 T1～T4 平均
  const avgTempRaw = isValidNumber(doc.TempAvg)
    ? Number(doc.TempAvg)
    : calcAverageTemperature([
        doc.T1,
        doc.T2,
        doc.T3,
        doc.T4
      ]);

  const avgTemp = round(avgTempRaw, 1);

  const temperatureGrade = gradeTemperature(
    avgTemp,
    limits
  );

  // 水位
  const waterLevel = gradeWaterLevel(
    doc.WL1,
    doc.WL2
  );

  return {
    limits,

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
      avg: avgTemp,
      grade: temperatureGrade
    },

    waterLevel: {
      WL1: doc.WL1,
      WL2: doc.WL2,
      ...waterLevel
    }
  };
}

module.exports = {
  isValidNumber,
  round,
  resolveLimits,
  gradeTurbidityRaw,
  gradePH,
  gradeDO,
  calcAverageTemperature,
  gradeTemperature,
  gradeWaterLevel,
  evaluateSensor
};