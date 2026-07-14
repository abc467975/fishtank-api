// utils/fcmService.js

const path = require("path");

const FcmToken =
  require("../models/fcmToken");

// 使用 __dirname，確保 Render 或 Linux 路徑正確
const {
  messaging
} = require(
  path.join(
    __dirname,
    "firebaseAdmin"
  )
);

/**
 * 將所有 FCM data 值轉成字串。
 *
 * FCM data payload 的 key 與 value
 * 都必須是字串。
 */
function toDataString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
}

/**
 * 判斷是不是嚴重通知。
 */
function isSevereAlarm(alarm) {
  const severity = String(
    alarm?.severity || ""
  )
    .trim()
    .toLowerCase();

  const severeFlag =
    alarm?.is_severe === true ||
    String(
      alarm?.is_severe || ""
    ).toLowerCase() === "true";

  return (
    severity === "critical" ||
    severeFlag
  );
}

/**
 * 建立警報推播共用內容。
 *
 * 單一裝置與多裝置都共用這裡，
 * 避免兩邊欄位不一致。
 */
function buildAlarmPushPayload(
  alarm,
  fallbackDeviceId = ""
) {
  if (!alarm) {
    throw new Error("缺少警報資料");
  }

  const isSevere =
    isSevereAlarm(alarm);

  const severity = isSevere
    ? "critical"
    : String(
        alarm.severity ||
        "warning"
      )
        .trim()
        .toLowerCase();

  const notificationType =
    alarm.notification_type ||
    (
      isSevere
        ? "severe_alarm"
        : "alarm"
    );

  const sensorName =
    alarm.sensor_name ||
    alarm.sensor_type ||
    "魚缸感測器";

  const title = isSevere
    ? `🚨 ${sensorName}嚴重異常`
    : `⚠️ ${sensorName}警報`;

  const body =
    alarm.message ||
    (
      `${sensorName}目前數值為 ` +
      `${alarm.value ?? "--"}` +
      `${alarm.unit || ""}`
    );

  return {
    isSevere,
    severity,
    notificationType,
    title,
    body,

    data: {
      /**
       * 保留 type = alarm，
       * 避免目前 App 原本只判斷 alarm 時失效。
       */
      type: "alarm",

      /**
       * 新增通知種類：
       * alarm
       * severe_alarm
       */
      notification_type:
        toDataString(
          notificationType
        ),

      /**
       * 嚴重通知判斷。
       */
      is_severe:
        toDataString(
          isSevere
        ),

      title:
        toDataString(title),

      body:
        toDataString(body),

      alarm_id:
        toDataString(
          alarm._id
        ),

      device_id:
        toDataString(
          alarm.device_id ||
          fallbackDeviceId
        ),

      sensor_type:
        toDataString(
          alarm.sensor_type
        ),

      sensor_name:
        toDataString(
          alarm.sensor_name
        ),

      alarm_type:
        toDataString(
          alarm.alarm_type
        ),

      severity:
        toDataString(
          severity
        ),

      grade:
        toDataString(
          alarm.grade
        ),

      label:
        toDataString(
          alarm.label
        ),

      value:
        toDataString(
          alarm.value
        ),

      min_value:
        toDataString(
          alarm.min_value
        ),

      max_value:
        toDataString(
          alarm.max_value
        ),

      unit:
        toDataString(
          alarm.unit
        ),

      /**
       * 水位專用欄位。
       */
      state:
        toDataString(
          alarm.state
        ),

      WL1:
        toDataString(
          alarm.WL1
        ),

      WL2:
        toDataString(
          alarm.WL2
        ),

      message:
        toDataString(body)
    }
  };
}

/**
 * 發送單一裝置測試通知。
 *
 * 測試通知保留 notification，
 * 讓 Firebase／Android 系統直接顯示。
 */
async function sendTestPush(token) {
  if (!token) {
    throw new Error(
      "缺少 FCM Token"
    );
  }

  const message = {
    token,

    notification: {
      title: "🐟 魚缸系統測試",
      body:
        "FCM 後端推播已成功送出"
    },

    data: {
      type: "test",
      source: "node_backend"
    },

    android: {
      priority: "high"
    }
  };

  return messaging.send(message);
}

/**
 * 發送警報通知給單一裝置。
 *
 * 使用 data-only：
 * 不加入 notification 欄位，
 * 讓 App 自己決定通知顯示方式。
 *
 * @param {string} token
 * @param {object} alarm
 */
async function sendAlarmPush(
  token,
  alarm
) {
  if (!token) {
    throw new Error(
      "缺少 FCM Token"
    );
  }

  if (!alarm) {
    throw new Error(
      "缺少警報資料"
    );
  }

  const payload =
    buildAlarmPushPayload(alarm);

  const message = {
    token,

    /**
     * 不放 notification，
     * 由 Android App 接收 data 後自行顯示。
     */
    data: payload.data,

    /**
     * 魚缸警報屬於需即時顯示的使用者可見訊息，
     * 使用 high priority。
     */
    android: {
      priority: "high"
    }
  };

  const messageId =
    await messaging.send(message);

  return {
    success: true,
    messageId,
    severity:
      payload.severity,
    is_severe:
      payload.isSevere,
    notification_type:
      payload.notificationType
  };
}

/**
 * 發送警報通知給同一台魚缸下
 * 所有有效裝置。
 *
 * 使用 data-only：
 * 不加入 notification 欄位。
 *
 * @param {string} device_id
 * @param {object} alarm
 */
async function sendAlarmPushToDevice(
  device_id,
  alarm
) {
  if (!device_id) {
    throw new Error(
      "缺少 device_id"
    );
  }

  if (!alarm) {
    throw new Error(
      "缺少警報資料"
    );
  }

  const tokenDocuments =
    await FcmToken.find({
      device_id,
      active: true,
      notification_enabled: {
        $ne: false
      }
    }).lean();

  if (!tokenDocuments.length) {
    console.log(
      `[FCM] device_id=${device_id} ` +
      "沒有可用的 FCM Token"
    );

    return {
      success: false,
      reason: "NO_ACTIVE_TOKEN",
      successCount: 0,
      failureCount: 0
    };
  }

  /**
   * 去除空 Token 與重複 Token。
   */
  const tokenList = [
    ...new Set(
      tokenDocuments
        .map((item) => item.token)
        .filter(Boolean)
    )
  ];

  if (!tokenList.length) {
    console.log(
      `[FCM] device_id=${device_id} ` +
      "Token 清單為空"
    );

    return {
      success: false,
      reason: "EMPTY_TOKEN_LIST",
      successCount: 0,
      failureCount: 0
    };
  }

  const payload =
    buildAlarmPushPayload(
      alarm,
      device_id
    );

  console.log(
    `[FCM] 準備發送通知`,
    {
      device_id,
      sensor_type:
        alarm.sensor_type,
      severity:
        payload.severity,
      is_severe:
        payload.isSevere,
      notification_type:
        payload.notificationType,
      token_count:
        tokenList.length
    }
  );

  const message = {
    tokens: tokenList,

    /**
     * 不放 notification，
     * Android App 自己顯示通知。
     */
    data: payload.data,

    /**
     * 警報需要及時送達。
     */
    android: {
      priority: "high"
    }
  };

  const response =
    await messaging
      .sendEachForMulticast(
        message
      );

  console.log(
    `[FCM] device_id=${device_id} ` +
    `發送完成 success=${response.successCount}, ` +
    `failure=${response.failureCount}`
  );

  const invalidTokens = [];

  response.responses.forEach(
    (result, index) => {
      if (result.success) {
        return;
      }

      const errorCode =
        result.error?.code || "";

      const failedToken =
        tokenList[index];

      console.log(
        "[FCM] 發送失敗：",
        {
          errorCode,
          token:
            failedToken
              ? `${failedToken.slice(0, 12)}...`
              : ""
        }
      );

      /**
       * Token 已失效時，
       * 將資料庫內的 Token 停用。
       */
      if (
        errorCode ===
          "messaging/registration-token-not-registered" ||
        errorCode ===
          "messaging/invalid-registration-token"
      ) {
        invalidTokens.push(
          failedToken
        );
      }
    }
  );

  if (invalidTokens.length > 0) {
    await FcmToken.updateMany(
      {
        token: {
          $in: invalidTokens
        }
      },
      {
        $set: {
          active: false,
          updated_at: new Date()
        }
      }
    );

    console.log(
      `[FCM] 已停用失效 Token 數量：` +
      `${invalidTokens.length}`
    );
  }

  /**
   * 至少一台手機成功收到，
   * 才視為整體發送成功。
   *
   * notificationManager 會根據 success，
   * 決定是否進入 cooldown。
   */
  const hasSuccess =
    response.successCount > 0;

  return {
    success: hasSuccess,

    reason: hasSuccess
      ? "FCM_SENT"
      : "FCM_ALL_FAILED",

    successCount:
      response.successCount,

    failureCount:
      response.failureCount,

    severity:
      payload.severity,

    is_severe:
      payload.isSevere,

    notification_type:
      payload.notificationType
  };
}

module.exports = {
  sendTestPush,
  sendAlarmPush,
  sendAlarmPushToDevice
};