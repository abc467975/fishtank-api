// utils/notificationManager.js

const NotificationSettings = require("../models/notificationSettings");
const { sendAlarmPushToDevice } = require("./fcmService");

const DEFAULT_DEVICE_ID = "fish_Tank_001";

/**
 * 用記憶體記錄每一種警報的狀態
 * key 範例：
 * fish_Tank_001:temperature:high
 */
const alarmRuntimeMap = new Map();

const DEFAULT_SETTINGS = {
  device_id: DEFAULT_DEVICE_ID,
  enabled: true,
  cooldown_seconds: 300,

  temperature: {
    enabled: true,
    delay_seconds: 60
  },

  pH: {
    enabled: true,
    delay_seconds: 120
  },

  dissolvedOxygen: {
    enabled: true,
    delay_seconds: 60
  },

  waterLevel: {
    enabled: true,
    delay_seconds: 10
  },

  turbidity: {
    enabled: true,
    delay_seconds: 60
  }
};

/**
 * 將警報裡可能出現的 sensor_type
 * 統一轉成 NotificationSettings 裡的欄位名稱
 */
function normalizeSensorKey(sensor_type) {
  const raw = String(sensor_type || "").trim();

  const map = {
    temperature: "temperature",
    temp: "temperature",
    T: "temperature",
    t: "temperature",

    pH: "pH",
    ph: "pH",
    PH: "pH",

    DO: "dissolvedOxygen",
    do: "dissolvedOxygen",
    dissolvedOxygen: "dissolvedOxygen",
    dissolved_oxygen: "dissolvedOxygen",

    waterLevel: "waterLevel",
    water_level: "waterLevel",
    WL: "waterLevel",
    wl: "waterLevel",

    turbidity: "turbidity",
    Turb: "turbidity",
    turb: "turbidity"
  };

  return map[raw] || raw;
}

/**
 * 組合記憶體用的 key
 */
function getRuntimeKey(device_id, sensorKey, alarm_type) {
  return `${device_id}:${sensorKey}:${alarm_type || "abnormal"}`;
}

/**
 * 數字防呆
 */
function toSafeSeconds(value, fallback = 0) {
  const num = Number(value);

  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;

  return Math.floor(num);
}

/**
 * 取得通知設定
 * 如果資料庫沒有，就建立一筆預設設定
 */
async function getNotificationSettings(device_id) {
  const safeDeviceId = device_id || DEFAULT_DEVICE_ID;

  let settings = await NotificationSettings.findOne({
    device_id: safeDeviceId
  }).lean();

  if (!settings) {
    const created = await NotificationSettings.create({
      ...DEFAULT_SETTINGS,
      device_id: safeDeviceId,
      updated_at: new Date()
    });

    settings = created.toObject();
  }

  return settings;
}

/**
 * 異常時呼叫這個
 * 會根據 NotificationSettings 判斷是否需要發送 FCM
 */
async function handleAlarmNotification(alarm) {
  try {
    if (!alarm) {
      return {
        sent: false,
        reason: "NO_ALARM_DATA"
      };
    }

    const device_id = alarm.device_id || DEFAULT_DEVICE_ID;
    const sensorKey = normalizeSensorKey(alarm.sensor_type);
    const alarm_type = alarm.alarm_type || "abnormal";

    const settings = await getNotificationSettings(device_id);

    /**
     * 總通知開關
     */
    if (!settings.enabled) {
      return {
        sent: false,
        reason: "GLOBAL_NOTIFICATION_DISABLED"
      };
    }

    /**
     * 取得該感測器的通知設定
     * 如果資料庫缺欄位，就使用 DEFAULT_SETTINGS 裡的預設值
     */
    const sensorSetting = settings[sensorKey] || DEFAULT_SETTINGS[sensorKey];

    if (!sensorSetting) {
      return {
        sent: false,
        reason: `NO_SENSOR_SETTING_${sensorKey}`
      };
    }

    /**
     * 單一感測器通知開關
     */
    if (!sensorSetting.enabled) {
      return {
        sent: false,
        reason: `${sensorKey}_NOTIFICATION_DISABLED`
      };
    }

    const now = Date.now();

    const delaySeconds = toSafeSeconds(
      sensorSetting.delay_seconds,
      DEFAULT_SETTINGS[sensorKey]?.delay_seconds || 0
    );

    const cooldownSeconds = toSafeSeconds(
      settings.cooldown_seconds,
      DEFAULT_SETTINGS.cooldown_seconds
    );

    const delayMs = delaySeconds * 1000;
    const cooldownMs = cooldownSeconds * 1000;

    const runtimeKey = getRuntimeKey(device_id, sensorKey, alarm_type);

    let runtime = alarmRuntimeMap.get(runtimeKey);

    /**
     * 第一次偵測到這個警報
     */
    if (!runtime) {
      runtime = {
        first_abnormal_at: now,
        last_sent_at: 0
      };

      alarmRuntimeMap.set(runtimeKey, runtime);

      /**
       * delay_seconds > 0：
       * 第一次異常只開始計時，不馬上發送
       *
       * delay_seconds = 0：
       * 繼續往下走，直接發送通知
       */
      if (delayMs > 0) {
        console.log(`[通知等待] ${runtimeKey} 第一次異常，開始計時`);

        return {
          sent: false,
          reason: "WAITING_DELAY_START",
          required_delay_seconds: delaySeconds
        };
      }

      console.log(`[通知立即發送] ${runtimeKey} delay_seconds=0`);
    }

    /**
     * 判斷異常持續時間是否達到 delay_seconds
     */
    const abnormalDuration = now - runtime.first_abnormal_at;

    if (abnormalDuration < delayMs) {
      const abnormalSeconds = Math.floor(abnormalDuration / 1000);

      console.log(
        `[通知等待] ${runtimeKey} 異常持續 ${abnormalSeconds} 秒，尚未達 ${delaySeconds} 秒`
      );

      return {
        sent: false,
        reason: "WAITING_DELAY",
        abnormal_seconds: abnormalSeconds,
        required_delay_seconds: delaySeconds
      };
    }

    /**
     * 判斷是否還在冷卻時間內
     */
    const sinceLastSent = now - runtime.last_sent_at;

    if (runtime.last_sent_at > 0 && sinceLastSent < cooldownMs) {
      const sinceLastSentSeconds = Math.floor(sinceLastSent / 1000);

      console.log(
        `[通知冷卻] ${runtimeKey} 距離上次通知 ${sinceLastSentSeconds} 秒，尚未達冷卻 ${cooldownSeconds} 秒`
      );

      return {
        sent: false,
        reason: "COOLDOWN",
        since_last_sent_seconds: sinceLastSentSeconds,
        cooldown_seconds: cooldownSeconds
      };
    }

    /**
     * 通過所有條件，正式發送 FCM
     */
    const result = await sendAlarmPushToDevice(device_id, alarm);

    /**
     * 如果沒有 Token 或發送失敗，不更新 last_sent_at
     * 避免進入冷卻導致之後有 Token 時反而不推播
     */
    if (!result || result.success === false) {
      console.log(`[通知未送出] ${runtimeKey}`, result);

      return {
        sent: false,
        reason: result?.reason || "FCM_NOT_SENT",
        result
      };
    }

    runtime.last_sent_at = now;
    alarmRuntimeMap.set(runtimeKey, runtime);

    console.log(`[通知已發送] ${runtimeKey}`);

    return {
      sent: true,
      reason: "FCM_SENT",
      result
    };

  } catch (err) {
    console.error("[通知處理錯誤]", err);

    return {
      sent: false,
      reason: "ERROR",
      error: err.message
    };
  }
}

/**
 * 感測器恢復正常時呼叫這個
 * 清除記憶體中的異常計時狀態
 * 這樣下一次異常會重新計算 delay_seconds
 */
function clearAlarmNotification(device_id, sensor_type, alarm_type) {
  const safeDeviceId = device_id || DEFAULT_DEVICE_ID;
  const sensorKey = normalizeSensorKey(sensor_type);

  /**
   * 如果有指定 alarm_type，只清除該類型
   */
  if (alarm_type) {
    const runtimeKey = getRuntimeKey(safeDeviceId, sensorKey, alarm_type);

    if (alarmRuntimeMap.has(runtimeKey)) {
      alarmRuntimeMap.delete(runtimeKey);
      console.log(`[通知狀態清除] ${runtimeKey}`);
    }

    return;
  }

  /**
   * 沒有指定 alarm_type，就清除同一個感測器的所有警報類型
   */
  const prefix = `${safeDeviceId}:${sensorKey}:`;

  for (const key of alarmRuntimeMap.keys()) {
    if (key.startsWith(prefix)) {
      alarmRuntimeMap.delete(key);
      console.log(`[通知狀態清除] ${key}`);
    }
  }
}

module.exports = {
  handleAlarmNotification,
  clearAlarmNotification
};