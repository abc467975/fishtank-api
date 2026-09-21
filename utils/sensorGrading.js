// utils/sensorGrading.js

/* =====================================================
   預設值
   MongoDB 尚未建立 Settings 時，仍可正常判斷
   ===================================================== */

const {
  DEVICE_ID: DEFAULT_DEVICE_ID
} = require("./deviceConfig");


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

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  return Number.isFinite(
    Number(value)
  );
}


/* =====================================================
   DS18B20 溫度是否有效
   ===================================================== */

function isValidTemperatureReading(value) {

  if (!isValidNumber(value)) {
    return false;
  }

  const temp =
    Number(value);


  // DS18B20 斷線常見值
  if (temp === -127) {
    return false;
  }


  // DS18B20 剛啟動或尚未完成轉換時
  // 常見預設值 85°C
  if (
    Math.abs(
      temp - 85
    ) < 0.01
  ) {
    return false;
  }


  // 依目前智慧魚缸應用，
  // 超出此範圍視為異常讀值
  if (
    temp < -20 ||
    temp > 60
  ) {
    return false;
  }


  return true;
}


function round(
  value,
  digits = 2
) {

  if (!isValidNumber(value)) {
    return null;
  }


  const factor =
    Math.pow(
      10,
      digits
    );


  return (
    Math.round(
      Number(value) *
      factor
    ) /
    factor
  );
}


/**
 * 畫面顏色分級，
 * 轉成通知嚴重程度。
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
 */
function createGradeResult({

  grade,

  label,

  alarm_type = "normal",

  state = null,

  legacyLevel = null

}) {

  const safeGrade =
    String(
      grade || "UNKNOWN"
    ).toUpperCase();


  const severity =
    GRADE_TO_SEVERITY[
      safeGrade
    ] || "unknown";


  return {

    /*
       保留舊 level 欄位
    */
    level:
      legacyLevel ||
      safeGrade,


    grade:
      safeGrade,


    severity,


    label,


    /*
       normal
       high
       low
       turbid
       invalid
       unknown
    */
    alarm_type,


    ...(state !== null && {
      state
    }),


    is_normal:
      severity ===
      "normal",


    is_abnormal:
      severity ===
        "warning" ||
      severity ===
        "critical",


    is_severe:
      severity ===
      "critical"
  };
}


/**
 * 從 MongoDB Settings 讀取數字。
 */
function getSettingNumber(
  settings,
  key,
  fallbackValue
) {

  if (!settings) {
    return fallbackValue;
  }


  const value =
    settings[key];


  if (!isValidNumber(value)) {
    return fallbackValue;
  }


  return Number(value);
}


/**
 * Settings -> 分級門檻
 */
function resolveLimits(settings) {

  return {

    temperature_min:
      getSettingNumber(
        settings,
        "temperature_min",
        DEFAULT_LIMITS.temperature_min
      ),


    temperature_max:
      getSettingNumber(
        settings,
        "temperature_max",
        DEFAULT_LIMITS.temperature_max
      ),


    ph_min:
      getSettingNumber(
        settings,
        "ph_min",
        DEFAULT_LIMITS.ph_min
      ),


    ph_max:
      getSettingNumber(
        settings,
        "ph_max",
        DEFAULT_LIMITS.ph_max
      ),


    do_min:
      getSettingNumber(
        settings,
        "do_min",
        DEFAULT_LIMITS.do_min
      ),


    turb_max:
      getSettingNumber(
        settings,
        "turb_max",
        DEFAULT_LIMITS.turb_max
      ),


    temperature_warning_margin:
      DEFAULT_LIMITS
        .temperature_warning_margin,


    ph_warning_margin:
      DEFAULT_LIMITS
        .ph_warning_margin,


    do_warning_margin:
      DEFAULT_LIMITS
        .do_warning_margin
  };
}


/* =====================================================
   區塊 B：濁度 raw 分級

   raw 越高 → 越清澈
   raw 越低 → 越混濁
   ===================================================== */

function gradeTurbidityRaw(raw) {

  if (!isValidNumber(raw)) {

    return createGradeResult({

      grade: "UNKNOWN",

      label: "無資料",

      alarm_type:
        "unknown"
    });
  }


  const value =
    Number(raw);


  if (value >= 650) {

    return createGradeResult({

      grade: "GREEN",

      label: "清澈",

      alarm_type:
        "normal"
    });
  }


  if (value >= 580) {

    return createGradeResult({

      grade: "YELLOW",

      label: "微濁",

      alarm_type:
        "turbid"
    });
  }


  if (value >= 450) {

    return createGradeResult({

      grade: "ORANGE",

      label: "中濁",

      alarm_type:
        "turbid"
    });
  }


  return createGradeResult({

    grade: "RED",

    label: "重濁",

    alarm_type:
      "turbid"
  });
}


/* =====================================================
   區塊 C：pH 分級
   ===================================================== */

function gradePH(
  ph,
  limits
) {

  if (!isValidNumber(ph)) {

    return createGradeResult({

      grade: "UNKNOWN",

      label: "無資料",

      alarm_type:
        "unknown"
    });
  }


  const value =
    Number(ph);


  const min =
    limits.ph_min;


  const max =
    limits.ph_max;


  const margin =
    limits.ph_warning_margin;


  if (
    value >= min &&
    value <= max
  ) {

    return createGradeResult({

      grade: "GREEN",

      label: "正常",

      alarm_type:
        "normal"
    });
  }


  if (
    value >=
      min - margin &&
    value <=
      max + margin
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
   ===================================================== */

function gradeDO(
  doMgL,
  limits
) {

  if (!isValidNumber(doMgL)) {

    return createGradeResult({

      grade: "UNKNOWN",

      label: "無資料",

      alarm_type:
        "unknown"
    });
  }


  const value =
    Number(doMgL);


  const normalMin =
    limits.do_min;


  const warningMin =
    normalMin -
    limits.do_warning_margin;


  if (
    value >= normalMin
  ) {

    return createGradeResult({

      grade: "GREEN",

      label: "充足",

      alarm_type:
        "normal"
    });
  }


  if (
    value >= warningMin
  ) {

    return createGradeResult({

      grade: "YELLOW",

      label: "偏低",

      alarm_type:
        "low"
    });
  }


  return createGradeResult({

    grade: "RED",

    label: "危險",

    alarm_type:
      "low"
  });
}


/* =====================================================
   區塊 E：魚缸平均溫度計算

   ★ 只允許 T1、T2、T3
   ★ T4 是新水桶，禁止加入魚缸平均
   ===================================================== */

function calcAverageTemperature(temps) {

  if (!Array.isArray(temps)) {
    return null;
  }


  const validTemps =
    temps

      .filter(
        isValidTemperatureReading
      )

      .map(
        Number
      );


  if (
    validTemps.length === 0
  ) {

    return null;
  }


  const sum =
    validTemps.reduce(

      (
        total,
        current
      ) => {

        return (
          total +
          current
        );
      },

      0
    );


  return (
    sum /
    validTemps.length
  );
}


/* =====================================================
   區塊 F：平均溫度分級
   ===================================================== */

function gradeTemperature(
  temp,
  limits
) {

  /*
     null / -127 / 85 /
     明顯不合理溫度
     全部視為無資料。
  */

  if (
    !isValidTemperatureReading(
      temp
    )
  ) {

    return createGradeResult({

      grade:
        "UNKNOWN",

      label:
        "無資料",

      alarm_type:
        "unknown"
    });
  }


  const value =
    Number(temp);


  const min =
    limits.temperature_min;


  const max =
    limits.temperature_max;


  const margin =
    limits
      .temperature_warning_margin;


  if (
    value >= min &&
    value <= max
  ) {

    return createGradeResult({

      grade:
        "GREEN",

      label:
        "正常",

      alarm_type:
        "normal"
    });
  }


  if (
    value >=
      min - margin &&
    value <=
      max + margin
  ) {

    return createGradeResult({

      grade:
        "YELLOW",

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


  return createGradeResult({

    grade:
      "RED",

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
   ===================================================== */

function normalize01(value) {

  if (value === true) {
    return 1;
  }


  if (value === false) {
    return 0;
  }


  if (!isValidNumber(value)) {
    return null;
  }


  return Number(value)
    ? 1
    : 0;
}


/**
 * WL1 = 低位感測器
 * WL2 = 高位感測器
 *
 * 00 → LOW
 * 10 → MID
 * 11 → HIGH
 * 01 → INVALID
 */
function gradeWaterLevel(
  WL1,
  WL2
) {

  const w1 =
    normalize01(WL1);


  const w2 =
    normalize01(WL2);


  if (
    w1 === null ||
    w2 === null
  ) {

    return createGradeResult({

      grade:
        "UNKNOWN",

      label:
        "無資料",

      alarm_type:
        "unknown",

      state:
        "UNKNOWN",

      legacyLevel:
        "UNKNOWN"
    });
  }


  if (
    w1 === 0 &&
    w2 === 0
  ) {

    return createGradeResult({

      grade:
        "RED",

      label:
        "低水位",

      alarm_type:
        "low",

      state:
        "LOW",

      legacyLevel:
        "LOW"
    });
  }


  if (
    w1 === 1 &&
    w2 === 0
  ) {

    return createGradeResult({

      grade:
        "YELLOW",

      label:
        "中水位",

      alarm_type:
        "mid",

      state:
        "MID",

      legacyLevel:
        "MID"
    });
  }


  if (
    w1 === 1 &&
    w2 === 1
  ) {

    return createGradeResult({

      grade:
        "GREEN",

      label:
        "高水位",

      alarm_type:
        "normal",

      state:
        "HIGH",

      legacyLevel:
        "HIGH"
    });
  }


  return createGradeResult({

    grade:
      "RED",

    label:
      "水位感測器狀態異常",

    alarm_type:
      "invalid",

    state:
      "INVALID",

    legacyLevel:
      "INVALID"
  });
}


/* =====================================================
   區塊 H：通知資料轉換
   ===================================================== */

function buildNotificationStates(
  evaluation,
  device_id = DEFAULT_DEVICE_ID
) {

  if (!evaluation) {
    return [];
  }


  return [

    {
      device_id,

      sensor_type:
        "temperature",

      value:
        evaluation.temperature
          ?.avg ??
        null,

      ...(
        evaluation.temperature
          ?.grade ||
        {}
      )
    },


    {
      device_id,

      sensor_type:
        "pH",

      value:
        evaluation.pH
          ?.value ??
        null,

      ...(
        evaluation.pH
          ?.grade ||
        {}
      )
    },


    {
      device_id,

      sensor_type:
        "dissolvedOxygen",

      value:
        evaluation.DO
          ?.value ??
        null,

      ...(
        evaluation.DO
          ?.grade ||
        {}
      )
    },


    {
      device_id,

      sensor_type:
        "turbidity",

      value:
        evaluation.turbidity
          ?.raw ??
        null,

      ...(
        evaluation.turbidity
          ?.grade ||
        {}
      )
    },


    {
      device_id,

      sensor_type:
        "waterLevel",

      ...(
        evaluation.waterLevel ||
        {}
      ),

      value:
        null,

      state:
        evaluation.waterLevel
          ?.state ??
        evaluation.waterLevel
          ?.level ??
        null,

      WL1:
        evaluation.waterLevel
          ?.WL1 ??
        null,

      WL2:
        evaluation.waterLevel
          ?.WL2 ??
        null
    }
  ];
}


/* =====================================================
   區塊 I：整筆感測資料評估
   ===================================================== */

function evaluateSensor(
  doc,
  settings = null
) {

  if (!doc) {
    return null;
  }


  const limits =
    resolveLimits(
      settings
    );


  /* ===================================================
     pH
     =================================================== */

  const phValue =
    round(
      doc.pH_value,
      2
    );


  const phGrade =
    gradePH(
      phValue,
      limits
    );


  /* ===================================================
     DO
     =================================================== */

  const doValue =
    round(
      doc.DO_value,
      2
    );


  const doGrade =
    gradeDO(
      doValue,
      limits
    );


  /* ===================================================
     濁度
     =================================================== */

  const turbGrade =
    gradeTurbidityRaw(
      doc.Turb
    );


  /* ===================================================
     魚缸溫度 T1 ~ T3

     注意：
     T4 是新水桶，
     永遠不能加入魚缸平均。
     =================================================== */

  const validTankTemps = [

    doc.T1,
    doc.T2,
    doc.T3

  ].filter(
    isValidTemperatureReading
  );


  const tankTemperatureValidCount =
    validTankTemps.length;


  let tankTemperatureStatus;


  if (
    tankTemperatureValidCount ===
    3
  ) {

    tankTemperatureStatus =
      "normal";

  }
  else if (
    tankTemperatureValidCount >
    0
  ) {

    tankTemperatureStatus =
      "partial_error";

  }
  else {

    tankTemperatureStatus =
      "sensor_error";
  }


  /*
     優先使用 Arduino 算好的
     TempAvg。

     如果 TempAvg 無效，
     Node 才自己使用
     T1、T2、T3 重算。
  */

  const hasValidTempAvg =
    isValidTemperatureReading(
      doc.TempAvg
    );


  const avgTempRaw =
    hasValidTempAvg

      ? Number(
          doc.TempAvg
        )

      : calcAverageTemperature([
          doc.T1,
          doc.T2,
          doc.T3
        ]);


  const avgTemp =
    round(
      avgTempRaw,
      1
    );


  const temperatureGrade =
    gradeTemperature(
      avgTemp,
      limits
    );


  /* ===================================================
     T4 新水桶溫度狀態
     =================================================== */

  const bucketTemperatureStatus =
    isValidTemperatureReading(
      doc.T4
    )

      ? "normal"

      : "sensor_error";


  const bucketTemperature =
    isValidTemperatureReading(
      doc.T4
    )

      ? round(
          doc.T4,
          1
        )

      : null;


  /* ===================================================
     水位
     =================================================== */

  const waterLevel =
    gradeWaterLevel(
      doc.WL1,
      doc.WL2
    );


  /* ===================================================
     完整評估結果
     =================================================== */

  const evaluation = {

    limits,


    pH: {

      raw:
        doc.pH,

      value:
        phValue,

      grade:
        phGrade
    },


    DO: {

      raw:
        doc.DO,

      value:
        doValue,

      grade:
        doGrade
    },


    turbidity: {

      raw:
        doc.Turb,

      grade:
        turbGrade
    },


    /* =================================================
       魚缸溫度

       APP 可以直接使用：

       temperature.avg
       temperature.valid_count
       temperature.sensor_status
       temperature.grade
       ================================================= */

    temperature: {

      avg:
        avgTemp,

      valid_count:
        tankTemperatureValidCount,

      sensor_status:
        tankTemperatureStatus,

      T1:
        isValidTemperatureReading(
          doc.T1
        )
          ? Number(doc.T1)
          : null,

      T2:
        isValidTemperatureReading(
          doc.T2
        )
          ? Number(doc.T2)
          : null,

      T3:
        isValidTemperatureReading(
          doc.T3
        )
          ? Number(doc.T3)
          : null,

      grade:
        temperatureGrade
    },


    /* =================================================
       新水桶溫度
       ================================================= */

    bucketTemperature: {

      value:
        bucketTemperature,

      sensor_status:
        bucketTemperatureStatus
    },


    waterLevel: {

      WL1:
        doc.WL1,

      WL2:
        doc.WL2,

      ...waterLevel
    }
  };


  /* ===================================================
     通知系統資料
     =================================================== */

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

  isValidTemperatureReading,

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