// utils/sensorGrading.js

/* =====================================================
   預設值
   MongoDB 尚未建立 Settings 時，仍可正常判斷
   ===================================================== */

const DEFAULT_DEVICE_ID = "fish_Tank_001";

const DEFAULT_LIMITS = {
  temperature_min: 24.0,
  temperature_max: 30.0,

  ph_min: 6.5,
  ph_max: 8.5,

  do_min: 5.0,

  // 濁度 raw 的最低安全門檻
  // raw 越低代表越混濁
  turb_max: 580,

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
 * 畫面顏色分級，轉成通知嚴重程度。
 */
const GRADE_TO_SEVERITY = {
  GREEN: "normal",
  YELLOW: "warning",

  // 橘色目前視為一般警告
  ORANGE: "warning",

  RED: "critical",
  UNKNOWN: "unknown"
};

/**
 * 建立所有感測器共用的分級結果格式。
 *
 * grade：
 * GREEN / YELLOW / ORANGE / RED / UNKNOWN
 *
 * severity：
 * normal / warning / critical / unknown
 */
function createGradeResult({
  grade,
  label,
  alarm_type = "normal",
  state = null,
  legacyLevel = null
}) {
  const safeGrade = String(
    grade || "UNKNOWN"
  ).toUpperCase();

  const severity =
    GRADE_TO_SEVERITY[safeGrade] || "unknown";

  return {
    /**
     * 保留原本 level 欄位，
     * 避免舊的 App 或 API 立刻壞掉。
     *
     * 一般感測器：
     * level = GREEN / YELLOW / RED
     *
     * 水位：
     * level = LOW / MID / HIGH / INVALID
     */
    level: legacyLevel || safeGrade,

    /**
     * 統一的畫面顏色分級。
     */
    grade: safeGrade,

    /**
     * 給通知系統判斷。
     */
    severity,

    /**
     * 畫面或通知要顯示的文字。
     */
    label,

    /**
     * 異常種類：
     * normal / high / low / turbid / invalid / unknown
     */
    alarm_type,

    /**
     * 水位等感測器可額外提供實際狀態。
     */
    ...(state !== null && {
      state
    }),

    /**
     * 方便後續通知系統直接判斷。
     */
    is_normal:
      severity === "normal",

    is_abnormal:
      severity === "warning" ||
      severity === "critical",

    is_severe:
      severity === "critical"
  };
}

/**
 * 從 MongoDB Settings 讀取數字。
 * 若欄位不存在或格式錯誤，改用預設值。
 */
function getSettingNumber(
  settings,
  key,
  fallbackValue
) {
  if (!settings) return fallbackValue;

  const value = settings[key];

  if (!isValidNumber(value)) {
    return fallbackValue;
  }

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
   區塊 B：濁度 raw 分級

   Arduino 傳入 raw ADC 值。

   raw 越高 → 越清澈
   raw 越低 → 越混濁

   注意：
   這裡只負責畫面顯示與通知分級。
   不使用 Settings.turb_max。
   Settings.turb_max 留給自動換水判斷。
   ===================================================== */

function gradeTurbidityRaw(raw) {
  if (!isValidNumber(raw)) {
    return createGradeResult({
      grade: "UNKNOWN",
      label: "無資料",
      alarm_type: "unknown"
    });
  }

  const value = Number(raw);

  if (value >= 650) {
    return createGradeResult({
      grade: "GREEN",
      label: "清澈",
      alarm_type: "normal"
    });
  }

  if (value >= 580) {
    return createGradeResult({
      grade: "YELLOW",
      label: "微濁",
      alarm_type: "turbid"
    });
  }

  if (value >= 450) {
    return createGradeResult({
      grade: "ORANGE",
      label: "中濁",
      alarm_type: "turbid"
    });
  }

  return createGradeResult({
    grade: "RED",
    label: "重濁",
    alarm_type: "turbid"
  });
}

/* =====================================================
   區塊 C：pH 分級

   使用 Arduino 已換算完成的 pH_value。
   上下限來自 Settings。
   ===================================================== */

function gradePH(ph, limits) {
  if (!isValidNumber(ph)) {
    return createGradeResult({
      grade: "UNKNOWN",
      label: "無資料",
      alarm_type: "unknown"
    });
  }

  const value = Number(ph);

  const min = limits.ph_min;
  const max = limits.ph_max;
  const margin = limits.ph_warning_margin;

  /**
   * 正常範圍。
   */
  if (
    value >= min &&
    value <= max
  ) {
    return createGradeResult({
      grade: "GREEN",
      label: "正常",
      alarm_type: "normal"
    });
  }

  /**
   * 黃色警告緩衝區。
   */
  if (
    value >= min - margin &&
    value <= max + margin
  ) {
    return createGradeResult({
      grade: "YELLOW",
      label:
        value < min
          ? "偏酸"
          : "偏鹼",
      alarm_type:
        value < min
          ? "low"
          : "high"
    });
  }

  /**
   * 超出黃色緩衝範圍，視為嚴重異常。
   */
  return createGradeResult({
    grade: "RED",
    label:
      value < min
        ? "過酸"
        : "過鹼",
    alarm_type:
      value < min
        ? "low"
        : "high"
  });
}

/* =====================================================
   區塊 D：DO 分級

   使用 Arduino 已換算完成的 DO_value。
   最低標準來自 Settings。
   ===================================================== */

function gradeDO(doMgL, limits) {
  if (!isValidNumber(doMgL)) {
    return createGradeResult({
      grade: "UNKNOWN",
      label: "無資料",
      alarm_type: "unknown"
    });
  }

  const value = Number(doMgL);

  const normalMin = limits.do_min;

  const warningMin =
    normalMin -
    limits.do_warning_margin;

  /**
   * 正常。
   */
  if (value >= normalMin) {
    return createGradeResult({
      grade: "GREEN",
      label: "充足",
      alarm_type: "normal"
    });
  }

  /**
   * 偏低，但還在黃色緩衝範圍。
   */
  if (value >= warningMin) {
    return createGradeResult({
      grade: "YELLOW",
      label: "偏低",
      alarm_type: "low"
    });
  }

  /**
   * 低於黃色緩衝範圍，視為嚴重異常。
   */
  return createGradeResult({
    grade: "RED",
    label: "危險",
    alarm_type: "low"
  });
}

/* =====================================================
   區塊 E：平均溫度計算
   ===================================================== */

function calcAverageTemperature(temps) {
  if (!Array.isArray(temps)) {
    return null;
  }

  const validTemps = temps
    .filter(isValidNumber)
    .map(Number)

    /**
     * DS18B20 斷線時常回傳 -127°C，
     * 不可納入平均。
     */
    .filter((value) => value !== -127);

  if (validTemps.length === 0) {
    return null;
  }

  const sum = validTemps.reduce(
    (total, current) => {
      return total + current;
    },
    0
  );

  return sum / validTemps.length;
}

/* =====================================================
   區塊 F：平均溫度分級

   上下限來自 Settings。
   ===================================================== */

function gradeTemperature(temp, limits) {
  /**
   * -127 通常代表 DS18B20 感測器斷線。
   */
  if (
    !isValidNumber(temp) ||
    Number(temp) === -127
  ) {
    return createGradeResult({
      grade: "UNKNOWN",
      label: "無資料",
      alarm_type: "unknown"
    });
  }

  const value = Number(temp);

  const min = limits.temperature_min;
  const max = limits.temperature_max;

  const margin =
    limits.temperature_warning_margin;

  /**
   * 正常範圍。
   */
  if (
    value >= min &&
    value <= max
  ) {
    return createGradeResult({
      grade: "GREEN",
      label: "正常",
      alarm_type: "normal"
    });
  }

  /**
   * 黃色警告緩衝區。
   */
  if (
    value >= min - margin &&
    value <= max + margin
  ) {
    return createGradeResult({
      grade: "YELLOW",

      label:
        value < min
          ? "溫度偏低"
          : "溫度偏高",

      alarm_type:
        value < min
          ? "low"
          : "high"
    });
  }

  /**
   * 超出黃色警告緩衝區，視為嚴重異常。
   */
  return createGradeResult({
    grade: "RED",

    label:
      value < min
        ? "溫度過低"
        : "溫度過高",

    alarm_type:
      value < min
        ? "low"
        : "high"
  });
}

/* =====================================================
   區塊 G：水位判斷

   WL1、WL2 為數位狀態，不使用 Settings。
   ===================================================== */

/**
 * 將 true、false、0、1 統一轉換成 0 或 1。
 */
function normalize01(value) {
  if (value === true) return 1;
  if (value === false) return 0;

  if (!isValidNumber(value)) {
    return null;
  }

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

  /**
   * 缺少資料。
   */
  if (
    w1 === null ||
    w2 === null
  ) {
    return createGradeResult({
      grade: "UNKNOWN",
      label: "無資料",
      alarm_type: "unknown",
      state: "UNKNOWN",

      /**
       * 保留舊 level 格式。
       */
      legacyLevel: "UNKNOWN"
    });
  }

  /**
   * WL1 = 0、WL2 = 0
   * 低水位，視為嚴重異常。
   */
  if (
    w1 === 0 &&
    w2 === 0
  ) {
    return createGradeResult({
      grade: "RED",
      label: "低水位",
      alarm_type: "low",
      state: "LOW",
      legacyLevel: "LOW"
    });
  }

  /**
   * WL1 = 1、WL2 = 0
   * 中水位，視為一般警告。
   */
  if (
    w1 === 1 &&
    w2 === 0
  ) {
    return createGradeResult({
      grade: "YELLOW",
      label: "中水位",
      alarm_type: "mid",
      state: "MID",
      legacyLevel: "MID"
    });
  }

  /**
   * WL1 = 1、WL2 = 1
   * 高水位，目前視為正常。
   */
  if (
    w1 === 1 &&
    w2 === 1
  ) {
    return createGradeResult({
      grade: "GREEN",
      label: "高水位",
      alarm_type: "normal",
      state: "HIGH",
      legacyLevel: "HIGH"
    });
  }

  /**
   * WL1 = 0、WL2 = 1
   * 物理狀態不合理，可能是感測器異常。
   */
  return createGradeResult({
    grade: "RED",
    label: "水位感測器狀態異常",
    alarm_type: "invalid",
    state: "INVALID",
    legacyLevel: "INVALID"
  });
}

/* =====================================================
   區塊 H：通知資料轉換

   將各感測器分級結果，轉成
   notificationManager 可共用的格式。
   ===================================================== */

function buildNotificationStates(
  evaluation,
  device_id = DEFAULT_DEVICE_ID
) {
  if (!evaluation) {
    return [];
  }

  return [
    /**
     * 溫度通知資料。
     */
  {
  device_id,

  sensor_type: "waterLevel",

  ...(
    evaluation.waterLevel?.status ||
    {}
  ),

  /**
   * 最後覆蓋，保證 value 不會是 "LOW"。
   */
  value: null,

  state:
    evaluation.waterLevel?.state ??
    null,

  WL1:
    evaluation.waterLevel?.WL1 ??
    null,

  WL2:
    evaluation.waterLevel?.WL2 ??
    null
},

    /**
     * pH 通知資料。
     */
    {
      device_id,

      sensor_type: "pH",

      value:
        evaluation.pH?.value ??
        null,

      ...(
        evaluation.pH?.status ||
        {}
      )
    },

    /**
     * 溶氧通知資料。
     */
    {
      device_id,

      sensor_type:
        "dissolvedOxygen",

      value:
        evaluation.DO?.value ??
        null,

      ...(
        evaluation.DO?.status ||
        {}
      )
    },

    /**
     * 濁度通知資料。
     */
    {
      device_id,

      sensor_type: "turbidity",

      value:
        evaluation.turbidity?.raw ??
        null,

      ...(
        evaluation.turbidity?.status ||
        {}
      )
    },

    /**
     * 水位通知資料。
     */
    {
      device_id,

      sensor_type: "waterLevel",

      value:
        evaluation.waterLevel?.state ??
        null,

      WL1:
        evaluation.waterLevel?.WL1 ??
        null,

      WL2:
        evaluation.waterLevel?.WL2 ??
        null,

      ...(
        evaluation.waterLevel?.status ||
        {}
      )
    }
  ];
}

/* =====================================================
   區塊 I：整筆感測資料評估

   doc      = ESP32 上傳的感測器資料
   settings = MongoDB 最新 Settings
   ===================================================== */

function evaluateSensor(
  doc,
  settings = null
) {
  if (!doc) {
    return null;
  }

  const limits =
    resolveLimits(settings);

  /* -----------------------------
     pH
     Arduino 已換算完成
     ----------------------------- */

  const phValue = round(
    doc.pH_value,
    2
  );

  const phGrade = gradePH(
    phValue,
    limits
  );

  /* -----------------------------
     DO
     Arduino 已換算完成
     ----------------------------- */

  const doValue = round(
    doc.DO_value,
    2
  );

  const doGrade = gradeDO(
    doValue,
    limits
  );

  /* -----------------------------
     濁度
     使用 Arduino raw 固定分級

     Settings.turb_max 留給
     自動換水判斷使用
     ----------------------------- */

  const turbGrade =
    gradeTurbidityRaw(
      doc.Turb
    );

  /* -----------------------------
     平均溫度

     優先使用 Arduino 上傳的 TempAvg。

     若沒有 TempAvg，
     或 TempAvg = -127，
     再由 Node.js 計算 T1～T4 平均。
     ----------------------------- */

  const hasValidTempAvg =
    isValidNumber(doc.TempAvg) &&
    Number(doc.TempAvg) !== -127;

  const avgTempRaw =
    hasValidTempAvg
      ? Number(doc.TempAvg)
      : calcAverageTemperature([
          doc.T1,
          doc.T2,
          doc.T3,
          doc.T4
        ]);

  const avgTemp = round(
    avgTempRaw,
    1
  );

  const temperatureGrade =
    gradeTemperature(
      avgTemp,
      limits
    );

  /* -----------------------------
     水位
     ----------------------------- */

  const waterLevel =
    gradeWaterLevel(
      doc.WL1,
      doc.WL2
    );

  /* -----------------------------
     整理完整評估結果
     ----------------------------- */

  const evaluation = {
    limits,

    pH: {
      /**
       * 保留 Arduino 原始 ADC。
       */
      raw: doc.pH,

      /**
       * Arduino 換算後的 pH。
       */
      value: phValue,

      /**
       * 保留原本 grade 格式，
       * 避免目前 App 或 API 壞掉。
       */
      grade: phGrade,

      /**
       * 統一提供給通知系統使用。
       */
      status: phGrade
    },

    DO: {
      /**
       * 保留 Arduino 原始 ADC。
       */
      raw: doc.DO,

      /**
       * Arduino 換算後的 mg/L。
       */
      value: doValue,

      grade: doGrade,
      status: doGrade
    },

    turbidity: {
      raw: doc.Turb,

      grade: turbGrade,
      status: turbGrade
    },

    temperature: {
      avg: avgTemp,

      grade: temperatureGrade,
      status: temperatureGrade
    },

    waterLevel: {
      WL1: doc.WL1,
      WL2: doc.WL2,

      /**
       * 保留舊有直接展開的欄位：
       * level、grade、label、state 等。
       */
      ...waterLevel,

      /**
       * 統一提供給通知系統使用。
       */
      status: waterLevel
    }
  };

  /**
   * 產生 notificationManager 可以直接使用的陣列。
   */
  evaluation.notification_states =
    buildNotificationStates(
      evaluation,
      doc.device_id ||
        DEFAULT_DEVICE_ID
    );

  return evaluation;
}

/* =====================================================
   匯出
   ===================================================== */

module.exports = {
  DEFAULT_DEVICE_ID,
  DEFAULT_LIMITS,
  GRADE_TO_SEVERITY,

  isValidNumber,
  round,
  createGradeResult,
  resolveLimits,

  gradeTurbidityRaw,
  gradePH,
  gradeDO,

  calcAverageTemperature,
  gradeTemperature,

  normalize01,
  gradeWaterLevel,

  buildNotificationStates,
  evaluateSensor
};