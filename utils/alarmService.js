const Alarm = require("../models/Alarm");

/**
 * 產生 App 顯示用的警報文字
 */
function buildAlarmMessage({
  sensorName,
  alarmType,
  value,
  minValue,
  maxValue,
  unit
}) {
  const displayValue = Number(value).toFixed(2);

  if (alarmType === "low") {
    return `${sensorName}過低：目前為 ${displayValue}${unit}，正常下限為 ${minValue}${unit}`;
  }

  return `${sensorName}過高：目前為 ${displayValue}${unit}，正常上限為 ${maxValue}${unit}`;
}

/**
 * 建立或更新異常警報
 */
async function upsertActiveAlarm({
  deviceId,
  sensorType,
  sensorName,
  alarmType,
  severity = "warning",
  value,
  minValue,
  maxValue,
  unit = ""
}) {
  const alarmKey = `${deviceId}:${sensorType}:${alarmType}`;

  const message = buildAlarmMessage({
    sensorName,
    alarmType,
    value,
    minValue,
    maxValue,
    unit
  });

  // 找尋相同類型、尚未解除的警報
  const existingAlarm = await Alarm.findOne({
    alarm_key: alarmKey,
    status: {
      $in: ["active", "acknowledged"]
    }
  });

  // 已有警報時，只更新最新數值，不新增重複資料
  if (existingAlarm) {
    existingAlarm.value = value;
    existingAlarm.min_value = minValue;
    existingAlarm.max_value = maxValue;
    existingAlarm.message = message;
    existingAlarm.last_detected_at = new Date();

    await existingAlarm.save();

    return {
      action: "updated",
      alarm: existingAlarm
    };
  }

  // 第一次偵測到異常，建立警報
  const newAlarm = await Alarm.create({
    device_id: deviceId,
    sensor_type: sensorType,
    sensor_name: sensorName,
    alarm_type: alarmType,
    severity,
    value,
    min_value: minValue,
    max_value: maxValue,
    unit,
    message,
    status: "active",
    first_detected_at: new Date(),
    last_detected_at: new Date(),
    alarm_key: alarmKey
  });

  return {
    action: "created",
    alarm: newAlarm
  };
}

/**
 * 感測器恢復正常後，解除該感測器目前所有警報
 */
async function resolveSensorAlarms({
  deviceId,
  sensorType
}) {
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
        resolved_at: new Date()
      }
    }
  );

  return {
    action: "resolved",
    modifiedCount: result.modifiedCount
  };
}

/**
 * 判斷單一感測器狀態
 */
async function evaluateAndSaveAlarm({
  deviceId,
  sensorType,
  sensorName,
  value,
  minValue,
  maxValue,
  unit = ""
}) {
  // 避免 null、undefined 或 NaN 造成錯誤警報
  if (
    value === null ||
    value === undefined ||
    minValue === null ||
    minValue === undefined ||
    maxValue === null ||
    maxValue === undefined ||
    Number.isNaN(Number(value))
  ) {
    return {
      action: "skipped",
      reason: "invalid_value_or_setting"
    };
  }

  const numericValue = Number(value);

  if (numericValue < Number(minValue)) {
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

  if (numericValue > Number(maxValue)) {
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

  return resolveSensorAlarms({
    deviceId,
    sensorType
  });
}

module.exports = {
  evaluateAndSaveAlarm,
  resolveSensorAlarms
};