const Alarm = require("../models/Alarm");

const {
  broadcastAlarm
} = require("./wsHub");

/* =====================================================
   確認資料是否為有效數字
   ===================================================== */

function isValidNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    !Number.isNaN(Number(value))
  );
}

/* =====================================================
   建立警報文字
   ===================================================== */

function buildAlarmMessage({
  sensorType,
  sensorName,
  alarmType,
  value,
  minValue,
  maxValue,
  unit
}) {
  const displayValue = Number(value).toFixed(2);

  /*
    濁度感測器為反向數值：
    數值越低，代表水越混濁。
  */
  if (
    sensorType === "turbidity" &&
    alarmType === "low"
  ) {
    return `水質過於混濁：目前感測值為 ${displayValue}${unit}，警報門檻為 ${minValue}${unit}`;
  }

  if (alarmType === "low") {
    return `${sensorName}過低：目前為 ${displayValue}${unit}，門檻為 ${minValue}${unit}`;
  }

  return `${sensorName}過高：目前為 ${displayValue}${unit}，門檻為 ${maxValue}${unit}`;
}

/* =====================================================
   建立或更新異常警報
   ===================================================== */

async function upsertActiveAlarm({
  deviceId,
  sensorType,
  sensorName,
  alarmType,
  severity = "warning",
  value,
  minValue = null,
  maxValue = null,
  unit = ""
}) {
  const alarmKey =
    `${deviceId}:${sensorType}:${alarmType}`;

  const message = buildAlarmMessage({
  sensorType,
  sensorName,
  alarmType,
  value,
  minValue,
  maxValue,
  unit
});

  /*
    已存在相同且尚未解除的警報：
    更新數值與時間，不新增重複資料。
  */
  const existingAlarm = await Alarm.findOne({
    alarm_key: alarmKey,
    status: {
      $in: ["active", "acknowledged"]
    }
  });

  if (existingAlarm) {
    existingAlarm.value = Number(value);
    existingAlarm.min_value =
      isValidNumber(minValue)
        ? Number(minValue)
        : null;

    existingAlarm.max_value =
      isValidNumber(maxValue)
        ? Number(maxValue)
        : null;

    existingAlarm.message = message;
    existingAlarm.last_detected_at = new Date();

    await existingAlarm.save();

    return {
      action: "updated",
      alarm: existingAlarm
    };
  }

  /*
    第一次偵測到異常：
    建立新的警報資料。
  */
  const newAlarm = await Alarm.create({
    device_id: deviceId,
    sensor_type: sensorType,
    sensor_name: sensorName,
    alarm_type: alarmType,
    severity,
    value: Number(value),

    min_value:
      isValidNumber(minValue)
        ? Number(minValue)
        : null,

    max_value:
      isValidNumber(maxValue)
        ? Number(maxValue)
        : null,

    unit,
    message,
    status: "active",

    first_detected_at: new Date(),
    last_detected_at: new Date(),

    alarm_key: alarmKey
  });

  /*
  僅在第一次建立警報時推送。
  持續異常時只更新資料庫，不重複通知 App。
*/
broadcastAlarm(
  "created",
  newAlarm.toObject()
);

  return {
    action: "created",
    alarm: newAlarm
  };
}

/* =====================================================
   數值恢復正常：解除指定感測器的警報
   ===================================================== */

async function resolveSensorAlarms({
  deviceId,
  sensorType
}) {
  const resolvedAt = new Date();

  const result = await Alarm.updateMany(
    {
      device_id: deviceId,
      sensor_type: sensorType,
      status: {
        $in: ["active", "acknowledged"]
      }
    },
    {
      $set: {
        status: "resolved",
        resolved_at: resolvedAt
      }
    }
  );

  /*
    只有真的解除至少一筆警報時才推送。

    避免感測器數值正常時，
    每次 ESP32 上傳資料都一直推播給 App。
  */
  if (result.modifiedCount > 0) {
    broadcastAlarm(
      "resolved",
      {
        device_id: deviceId,
        sensor_type: sensorType,
        resolved_at: resolvedAt
      }
    );
  }

  return {
    action: "resolved",
    sensorType,
    modifiedCount: result.modifiedCount
  };
}

/* =====================================================
   判斷單一感測器是否異常
   ===================================================== */

async function evaluateAndSaveAlarm({
  deviceId,
  sensorType,
  sensorName,
  value,
  minValue = null,
  maxValue = null,
  unit = ""
}) {
  /*
    感測器沒有有效數值：
    略過，不新增警報。
  */
  if (!isValidNumber(value)) {
    return {
      action: "skipped",
      sensorType,
      reason: "invalid_sensor_value"
    };
  }

  const hasMin = isValidNumber(minValue);
  const hasMax = isValidNumber(maxValue);

  /*
    沒有設定任何門檻：
    略過，不新增警報。
  */
  if (!hasMin && !hasMax) {
    return {
      action: "skipped",
      sensorType,
      reason: "threshold_not_configured"
    };
  }

  const numericValue = Number(value);

  /*
    低於下限
  */
  if (
    hasMin &&
    numericValue < Number(minValue)
  ) {
    return upsertActiveAlarm({
      deviceId,
      sensorType,
      sensorName,
      alarmType: "low",
      value: numericValue,
      minValue,
      maxValue,
      unit
    });
  }

  /*
    高於上限
  */
  if (
    hasMax &&
    numericValue > Number(maxValue)
  ) {
    return upsertActiveAlarm({
      deviceId,
      sensorType,
      sensorName,
      alarmType: "high",
      value: numericValue,
      minValue,
      maxValue,
      unit
    });
  }

  /*
    數值位於正常範圍：
    將舊警報改為 resolved。
  */
  return resolveSensorAlarms({
    deviceId,
    sensorType
  });
}

module.exports = {
  evaluateAndSaveAlarm,
  resolveSensorAlarms
};