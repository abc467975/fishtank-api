// utils/fcmService.js

const path = require("path");
const FcmToken = require("../models/fcmToken");

// 使用 __dirname 保證 Render 或 Linux 上路徑正確
const { messaging } = require(path.join(__dirname, "firebaseAdmin"));

/**
 * 發送單一裝置測試通知
 * 這個是測試用，可以保留 notification
 * 如果你希望測試通知也完全交給 APP 控制，再改成 data-only
 * @param {string} token - FCM Token
 */
async function sendTestPush(token) {
  if (!token) throw new Error("缺少 FCM Token");

  const message = {
    token,
    notification: {
      title: "🐟 魚缸系統測試",
      body: "FCM 後端推播已成功送出"
    },
    data: {
      type: "test",
      source: "node_backend"
    },
    android: {
      priority: "high"
    }
  };

  return await messaging.send(message);
}

/**
 * 發送警報通知給單一裝置
 * data-only，不放 notification
 * @param {string} token - FCM Token
 * @param {object} alarm - 警報資料物件
 */
async function sendAlarmPush(token, alarm) {
  if (!token) throw new Error("缺少 FCM Token");
  if (!alarm) throw new Error("缺少警報資料");

  const sensorName = alarm.sensor_name || alarm.sensor_type || "魚缸感測器";

  const title = alarm.severity === "critical"
    ? `🚨 ${sensorName}嚴重異常`
    : `⚠️ ${sensorName}警報`;

  const body =
    alarm.message ||
    `${sensorName}目前數值為 ${alarm.value ?? "--"} ${alarm.unit ?? ""}`;

  const message = {
    token,

    // 重點：警報推播不放 notification
    // 讓 APP 收到 data 後自己決定要不要顯示通知、震動、靜音
    data: {
      type: "alarm",
      title: String(title),
      body: String(body),

      alarm_id: String(alarm._id ?? ""),
      device_id: String(alarm.device_id ?? ""),
      sensor_type: String(alarm.sensor_type ?? ""),
      sensor_name: String(alarm.sensor_name ?? ""),
      alarm_type: String(alarm.alarm_type ?? ""),
      severity: String(alarm.severity ?? ""),
      value: String(alarm.value ?? ""),
      min_value: String(alarm.min_value ?? ""),
      max_value: String(alarm.max_value ?? ""),
      unit: String(alarm.unit ?? ""),
      message: String(body)
    },

    android: {
      priority: "high"
    }
  };

  return await messaging.send(message);
}

/**
 * 發送警報通知給同一台魚缸底下所有有效裝置
 * data-only，不放 notification
 * @param {string} device_id - 魚缸裝置 ID
 * @param {object} alarm - 警報資料物件
 */
async function sendAlarmPushToDevice(device_id, alarm) {
  if (!device_id) throw new Error("缺少 device_id");
  if (!alarm) throw new Error("缺少警報資料");

  const tokens = await FcmToken.find({
    device_id,
    active: true,
    notification_enabled: { $ne: false }
  }).lean();

  if (!tokens.length) {
    console.log(`[FCM] device_id=${device_id} 沒有可用的 FCM Token`);

    return {
      success: false,
      reason: "NO_ACTIVE_TOKEN",
      successCount: 0,
      failureCount: 0
    };
  }

  const tokenList = tokens
    .map(item => item.token)
    .filter(Boolean);

  if (!tokenList.length) {
    console.log(`[FCM] device_id=${device_id} Token 為空`);

    return {
      success: false,
      reason: "EMPTY_TOKEN_LIST",
      successCount: 0,
      failureCount: 0
    };
  }

  const sensorName = alarm.sensor_name || alarm.sensor_type || "魚缸感測器";

  const title = alarm.severity === "critical"
    ? `🚨 ${sensorName}嚴重異常`
    : `⚠️ ${sensorName}警報`;

  const body =
    alarm.message ||
    `${sensorName}目前數值為 ${alarm.value ?? "--"} ${alarm.unit ?? ""}`;

  const message = {
    tokens: tokenList,

    // 重點：這裡不要放 notification
    // Android 背景時才不會由系統直接跳通知
    data: {
      type: "alarm",
      title: String(title),
      body: String(body),

      alarm_id: String(alarm._id ?? ""),
      device_id: String(alarm.device_id ?? device_id),
      sensor_type: String(alarm.sensor_type ?? ""),
      sensor_name: String(alarm.sensor_name ?? ""),
      alarm_type: String(alarm.alarm_type ?? ""),
      severity: String(alarm.severity ?? ""),
      value: String(alarm.value ?? ""),
      min_value: String(alarm.min_value ?? ""),
      max_value: String(alarm.max_value ?? ""),
      unit: String(alarm.unit ?? ""),
      message: String(body)
    },

    android: {
      priority: "high"
    }
  };

  const response = await messaging.sendEachForMulticast(message);

  console.log(
    `[FCM] device_id=${device_id} 發送完成 success=${response.successCount}, failure=${response.failureCount}`
  );

  const invalidTokens = [];

  response.responses.forEach((result, index) => {
    if (!result.success) {
      const errorCode = result.error?.code || "";
      const failedToken = tokenList[index];

      console.log("[FCM] 發送失敗:", failedToken, errorCode);

      if (
        errorCode === "messaging/registration-token-not-registered" ||
        errorCode === "messaging/invalid-registration-token"
      ) {
        invalidTokens.push(failedToken);
      }
    }
  });

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

    console.log(`[FCM] 已停用失效 Token 數量：${invalidTokens.length}`);
  }

  return {
    success: true,
    successCount: response.successCount,
    failureCount: response.failureCount
  };
}

module.exports = {
  sendTestPush,
  sendAlarmPush,
  sendAlarmPushToDevice
};