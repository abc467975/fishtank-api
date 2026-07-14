// utils/notificationManager.js

const NotificationSettings =
  require("../models/notificationSettings");

const {
  sendAlarmPushToDevice
} = require("./fcmService");

const DEFAULT_DEVICE_ID = "fish_Tank_001";

/**
 * 用記憶體記錄每一種警報的狀態。
 *
 * key 範例：
 * fish_Tank_001:temperature:high:warning
 * fish_Tank_001:temperature:high:critical
 */
const alarmRuntimeMap = new Map();

const DEFAULT_SETTINGS = {
  device_id: DEFAULT_DEVICE_ID,

  // 全部通知總開關
  enabled: true,

  // 嚴重通知開關
  severe_notification_enabled: true,

  // 同類警報重複通知的冷卻秒數
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
 * 將警報裡可能出現的 sensor_type，
 * 統一轉成 NotificationSettings 裡的欄位名稱。
 */
function normalizeSensorKey(sensor_type) {
  const raw = String(
    sensor_type || ""
  ).trim();

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
 * 統一警報嚴重程度。
 */
function normalizeSeverity(alarm) {
  const severity = String(
    alarm?.severity || "warning"
  )
    .trim()
    .toLowerCase();

  if (severity === "critical") {
    return "critical";
  }

  if (severity === "normal") {
    return "normal";
  }

  return "warning";
}

/**
 * 組合記憶體使用的 key。
 *
 * severity 必須加入，避免一般警告的冷卻時間，
 * 擋住後續升級的嚴重通知。
 */
function getRuntimeKey(
  device_id,
  sensorKey,
  alarm_type,
  severity
) {
  return [
    device_id,
    sensorKey,
    alarm_type || "abnormal",
    severity || "warning"
  ].join(":");
}

/**
 * 秒數防呆。
 */
function toSafeSeconds(
  value,
  fallback = 0
) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return fallback;
  }

  if (num < 0) {
    return 0;
  }

  return Math.floor(num);
}

/**
 * 取得通知設定。
 *
 * 如果資料庫沒有該設備的設定，
 * 就建立一筆預設設定。
 */
async function getNotificationSettings(
  device_id
) {
  const safeDeviceId =
    device_id || DEFAULT_DEVICE_ID;

  let settings =
    await NotificationSettings
      .findOne({
        device_id: safeDeviceId
      })
      .lean();

  if (!settings) {
    const created =
      await NotificationSettings.create({
        ...DEFAULT_SETTINGS,

        device_id: safeDeviceId,

        updated_at: new Date()
      });

    settings = created.toObject();
  }

  return settings;
}

/**
 * 異常時呼叫。
 *
 * 會根據 NotificationSettings 判斷：
 * 1. 總通知開關
 * 2. 嚴重通知開關
 * 3. 感測器通知開關
 * 4. delay_seconds
 * 5. cooldown_seconds
 * 6. 是否發送 FCM
 */
async function handleAlarmNotification(
  alarm
) {
  try {
    if (!alarm) {
      return {
        sent: false,
        reason: "NO_ALARM_DATA"
      };
    }

    const device_id =
      alarm.device_id ||
      DEFAULT_DEVICE_ID;

    const sensorKey =
      normalizeSensorKey(
        alarm.sensor_type
      );

    const alarm_type =
      alarm.alarm_type ||
      "abnormal";

    const severity =
      normalizeSeverity(alarm);

    const isSevere =
      severity === "critical" ||
      alarm.is_severe === true;

    /**
     * 必須先取得 settings，
     * 才能讀取 severe_notification_enabled。
     */
    const settings =
      await getNotificationSettings(
        device_id
      );

    /**
     * 全部通知總開關。
     */
    if (!settings.enabled) {
      return {
        sent: false,
        reason:
          "GLOBAL_NOTIFICATION_DISABLED",
        severity
      };
    }

    /**
     * 嚴重通知開關。
     *
     * 使用 ?? 是為了相容舊資料：
     * 舊文件沒有這個欄位時，使用預設值 true。
     */
   /**
 * App 的「只顯示嚴重通知」開關。
 *
 * true：
 * 只允許 critical，warning 不推播。
 *
 * false：
 * warning、critical 都依照原本規則推播。
 */
const severeOnlyEnabled =
  settings.severe_notification_enabled ??
  DEFAULT_SETTINGS.severe_notification_enabled;

/**
 * 開啟「只顯示嚴重通知」時，
 * 一般 warning 不進入延遲、冷卻與 FCM 流程。
 */
if (severeOnlyEnabled && !isSevere) {
  console.log(
    `[一般通知已過濾] ${device_id}:${sensorKey}:${alarm_type}:${severity}`
  );

  return {
    sent: false,
    reason: "NON_SEVERE_NOTIFICATION_FILTERED",
    severity,
    is_severe: false,
    severe_only_enabled: true
  };
}

    /**
     * 取得該感測器的通知設定。
     *
     * 如果資料庫缺少該欄位，
     * 使用 DEFAULT_SETTINGS 的預設值。
     */
    const sensorSetting =
      settings[sensorKey] ||
      DEFAULT_SETTINGS[sensorKey];

    if (!sensorSetting) {
      return {
        sent: false,
        reason:
          `NO_SENSOR_SETTING_${sensorKey}`,
        severity
      };
    }

    /**
     * 單一感測器通知開關。
     */
    if (!sensorSetting.enabled) {
      return {
        sent: false,
        reason:
          `${sensorKey}_NOTIFICATION_DISABLED`,
        severity
      };
    }

    const now = Date.now();

    /**
     * 一般通知使用各感測器的等待秒數。
     */
    const configuredDelaySeconds =
      toSafeSeconds(
        sensorSetting.delay_seconds,

        DEFAULT_SETTINGS[
          sensorKey
        ]?.delay_seconds || 0
      );

    /**
     * 嚴重通知立即進入發送判斷。
     *
     * warning：
     * 使用原本 delay_seconds。
     *
     * critical：
     * delay_seconds 強制為 0。
     */
    const delaySeconds =
      isSevere
        ? 0
        : configuredDelaySeconds;

    const cooldownSeconds =
      toSafeSeconds(
        settings.cooldown_seconds,
        DEFAULT_SETTINGS
          .cooldown_seconds
      );

    const delayMs =
      delaySeconds * 1000;

    const cooldownMs =
      cooldownSeconds * 1000;

    const runtimeKey =
      getRuntimeKey(
        device_id,
        sensorKey,
        alarm_type,
        severity
      );

    let runtime =
      alarmRuntimeMap.get(runtimeKey);

    /**
     * 第一次偵測到這個警報。
     */
    if (!runtime) {
      runtime = {
        first_abnormal_at: now,
        last_sent_at: 0
      };

      alarmRuntimeMap.set(
        runtimeKey,
        runtime
      );

      /**
       * 一般警告 delay_seconds > 0：
       * 第一次異常只開始計時，不立即發送。
       *
       * 嚴重通知 delay_seconds = 0：
       * 繼續往下執行，立即嘗試發送。
       */
      if (delayMs > 0) {
        console.log(
          `[通知等待] ${runtimeKey} 第一次異常，開始計時`
        );

        return {
          sent: false,
          reason:
            "WAITING_DELAY_START",
          severity,
          is_severe: isSevere,
          required_delay_seconds:
            delaySeconds
        };
      }

      console.log(
        `[通知立即發送] ${runtimeKey} delay_seconds=0`
      );
    }

    /**
     * 判斷異常持續時間，
     * 是否達到 delay_seconds。
     */
    const abnormalDuration =
      now -
      runtime.first_abnormal_at;

    if (
      abnormalDuration < delayMs
    ) {
      const abnormalSeconds =
        Math.floor(
          abnormalDuration / 1000
        );

      console.log(
        `[通知等待] ${runtimeKey} 異常持續 ${abnormalSeconds} 秒，尚未達 ${delaySeconds} 秒`
      );

      return {
        sent: false,
        reason: "WAITING_DELAY",
        severity,
        is_severe: isSevere,
        abnormal_seconds:
          abnormalSeconds,
        required_delay_seconds:
          delaySeconds
      };
    }

    /**
     * 判斷是否還在冷卻時間內。
     */
    const sinceLastSent =
      now -
      runtime.last_sent_at;

    if (
      runtime.last_sent_at > 0 &&
      sinceLastSent < cooldownMs
    ) {
      const sinceLastSentSeconds =
        Math.floor(
          sinceLastSent / 1000
        );

      console.log(
        `[通知冷卻] ${runtimeKey} 距離上次通知 ${sinceLastSentSeconds} 秒，尚未達冷卻 ${cooldownSeconds} 秒`
      );

      return {
        sent: false,
        reason: "COOLDOWN",
        severity,
        is_severe: isSevere,
        since_last_sent_seconds:
          sinceLastSentSeconds,
        cooldown_seconds:
          cooldownSeconds
      };
    }

    /**
     * 傳給 fcmService 的完整警報資料。
     */
    const alarmForPush = {
      ...alarm,

      severity,

      is_severe: isSevere,

      notification_type:
        isSevere
          ? "severe_alarm"
          : "alarm"
    };

    /**
     * 通過所有條件，
     * 正式發送 FCM。
     */
    const result =
      await sendAlarmPushToDevice(
        device_id,
        alarmForPush
      );

    /**
     * 如果沒有 Token 或發送失敗，
     * 不更新 last_sent_at。
     *
     * 避免之後 Token 恢復正常時，
     * 反而被錯誤冷卻擋住。
     */
    if (
      !result ||
      result.success === false
    ) {
      console.log(
        `[通知未送出] ${runtimeKey}`,
        result
      );

      return {
        sent: false,
        reason:
          result?.reason ||
          "FCM_NOT_SENT",
        severity,
        is_severe: isSevere,
        result
      };
    }

    /**
     * 發送成功，記錄冷卻起始時間。
     */
    runtime.last_sent_at = now;

    alarmRuntimeMap.set(
      runtimeKey,
      runtime
    );

    console.log(
      `[通知已發送] ${runtimeKey}`
    );

    return {
      sent: true,
      reason: "FCM_SENT",
      severity,
      is_severe: isSevere,
      result
    };
  } catch (err) {
    console.error(
      "[通知處理錯誤]",
      err
    );

    return {
      sent: false,
      reason: "ERROR",
      error: err.message
    };
  }
}

/**
 * 感測器恢復正常時呼叫。
 *
 * 清除記憶體中的異常計時狀態，
 * 讓下一次異常重新計算 delay_seconds。
 */
function clearAlarmNotification(
  device_id,
  sensor_type,
  alarm_type
) {
  const safeDeviceId =
    device_id ||
    DEFAULT_DEVICE_ID;

  const sensorKey =
    normalizeSensorKey(
      sensor_type
    );

  /**
   * 如果有指定 alarm_type，
   * 同時清除該類型的 warning 與 critical。
   *
   * 例如：
   * fish_Tank_001:temperature:high:warning
   * fish_Tank_001:temperature:high:critical
   */
  if (alarm_type) {
    const prefix =
      `${safeDeviceId}:${sensorKey}:${alarm_type}:`;

    for (
      const key of
      alarmRuntimeMap.keys()
    ) {
      if (key.startsWith(prefix)) {
        alarmRuntimeMap.delete(key);

        console.log(
          `[通知狀態清除] ${key}`
        );
      }
    }

    return;
  }

  /**
   * 沒有指定 alarm_type，
   * 清除同一感測器的所有警報狀態。
   */
  const prefix =
    `${safeDeviceId}:${sensorKey}:`;

  for (
    const key of
    alarmRuntimeMap.keys()
  ) {
    if (key.startsWith(prefix)) {
      alarmRuntimeMap.delete(key);

      console.log(
        `[通知狀態清除] ${key}`
      );
    }
  }
}

module.exports = {
  handleAlarmNotification,
  clearAlarmNotification
};