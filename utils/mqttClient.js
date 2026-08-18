const mqtt = require("mqtt");

const ControlState =
  require("../models/controlstate");

const {
  broadcastStatusToApps
} = require("./wsHub");

const MQTT_URL = process.env.MQTT_URL;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_DEVICE_ID = process.env.MQTT_DEVICE_ID || "default_device";

let client = null;

if (!MQTT_URL) {
  console.warn("⚠️ MQTT_URL 尚未設定，MQTT 不會啟動");
} else {
  client = mqtt.connect(MQTT_URL, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    protocolVersion: 4,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    clean: true
  });

  client.on("connect", () => {
  console.log("✅ MQTT connected");
  console.log("MQTT_DEVICE_ID:", MQTT_DEVICE_ID);

  const statusTopic = topicStatus();

  client.subscribe(
    statusTopic,
    {
      qos: 1
    },
    (err) => {
      if (err) {
        console.error(
          "❌ MQTT status subscribe failed:",
          err.message
        );

        return;
      }

      console.log(
        "✅ MQTT subscribed:",
        statusTopic
      );
    }
  );
});

  client.on("reconnect", () => {
    console.log("🔄 MQTT reconnecting...");
  });

  client.on("close", () => {
    console.log("⚠️ MQTT disconnected");
  });

  client.on("offline", () => {
    console.log("⚠️ MQTT offline");
  });

  client.on("error", (err) => {
    console.error("❌ MQTT error:", err.message);
  });

  client.on("message", async (topic, message) => {
  try {

    const payloadText =
      message.toString();


    console.log(
      "📩 MQTT message received"
    );

    console.log(
      "Topic:",
      topic
    );

    console.log(
      "Payload:",
      payloadText
    );


    // =====================================================
    // 目前只處理 ESP32 status topic
    // =====================================================

    if (topic !== topicStatus()) {
      return;
    }


    let data;


    try {

      data =
        JSON.parse(payloadText);

    } catch (err) {

      // ESP32 上線時會送：
      //
      // esp32_online
      //
      // 這不是 JSON，直接忽略即可。

      console.log(
        "ℹ️ MQTT status 非 JSON:",
        payloadText
      );

      return;
    }


    // =====================================================
    // Arduino / ESP32 主動回報模式改變
    // =====================================================

    if (data.type !== "mode_changed") {
      return;
    }


    console.log(
      "================================"
    );

    console.log(
      "🔄 收到裝置模式改變"
    );

    console.log(
      "device_id:",
      data.device_id
    );

    console.log(
      "mode:",
      data.mode
    );

    console.log(
      "mode_name:",
      data.mode_name
    );

    console.log(
      "reason:",
      data.reason
    );


    // =====================================================
    // AUTO
    // =====================================================

    if (
      data.mode === 0 ||
      data.mode === false ||
      data.mode_name === "AUTO"
    ) {

      const now =
        new Date();


      // ===================================================
      // MongoDB 同步為 AUTO
      // ===================================================

      const control =
        await ControlState.findOneAndUpdate(

          {},

          {
            $set: {
              mode: false,
              updatedAt: now
            }
          },

          {
            new: true,
            upsert: true
          }
        );


      console.log(
        "✅ ControlState 已同步為 AUTO"
      );

      console.log(
        "mode:",
        control.mode
      );


      // ===================================================
      // 通知 APP
      // ===================================================

      broadcastStatusToApps({

        device_id:
          data.device_id ||
          MQTT_DEVICE_ID,

        mode: false,

        mode_name: "AUTO",

        reason:
          data.reason ||
          "DEVICE_MODE_CHANGED",

        updatedAt:
          now.toISOString()
      });


      console.log(
        "📱 已通知 APP 切換 AUTO"
      );
    }


    // =====================================================
    // MANUAL
    // =====================================================

    else if (
      data.mode === 1 ||
      data.mode === true ||
      data.mode_name === "MANUAL"
    ) {

      const now =
        new Date();


      const control =
        await ControlState.findOneAndUpdate(

          {},

          {
            $set: {
              mode: true,
              updatedAt: now
            }
          },

          {
            new: true,
            upsert: true
          }
        );


      console.log(
        "✅ ControlState 已同步為 MANUAL"
      );

      console.log(
        "mode:",
        control.mode
      );


      broadcastStatusToApps({

        device_id:
          data.device_id ||
          MQTT_DEVICE_ID,

        mode: true,

        mode_name: "MANUAL",

        reason:
          data.reason ||
          "DEVICE_MODE_CHANGED",

        updatedAt:
          now.toISOString()
      });


      console.log(
        "📱 已通知 APP 切換 MANUAL"
      );
    }


    else {

      console.log(
        "⚠️ 收到未知 mode_changed 狀態:",
        data
      );
    }


    console.log(
      "================================"
    );


  } catch (err) {

    console.error(
      "❌ MQTT message 處理失敗:",
      err
    );
  }
});
}


// 這個函式一定要回傳 Promise<boolean>
// true  = MQTT publish 成功
// false = MQTT publish 失敗，讓 route 啟用 WebSocket 備援
function publishJson(topic, data, options = {}) {
  return new Promise((resolve) => {
    if (!client) {
      console.warn("⚠️ MQTT client 尚未建立，無法 publish:", topic);
      return resolve(false);
    }

    // 注意：connected 是屬性，不是函式
    if (!client.connected) {
      console.warn("⚠️ MQTT 尚未連線，無法 publish:", topic);
      return resolve(false);
    }

    const payload = JSON.stringify(data);

    client.publish(
      topic,
      payload,
      {
        qos: options.qos ?? 1,
        retain: options.retain ?? false
      },
      (err) => {
        if (err) {
          console.error("❌ MQTT publish failed:", err.message);
          return resolve(false);
        }

        console.log("📡 MQTT published:", topic);
        console.log(payload);
        return resolve(true);
      }
    );
  });
}


function topicControl() {
  return `fish/control/${MQTT_DEVICE_ID}`;
}

function topicSettings() {
  return `fish/settings/${MQTT_DEVICE_ID}`;
}

function topicCalibration() {
  return `fish/calibration/${MQTT_DEVICE_ID}`;
}

function topicStatus() {
  return `fish/status/${MQTT_DEVICE_ID}`;
}

module.exports = {
  publishJson,
  topicControl,
  topicSettings,
  topicCalibration,
  topicStatus
};