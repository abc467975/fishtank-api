const mqtt =
  require("mqtt");


const ControlState =
  require("../models/controlstate");


const Calibration =
  require("../models/calibration");


const {
  broadcastStatusToApps,
  broadcastCalibration
} = require("./wsHub");


const {
  DEVICE_ID
} = require("./deviceConfig");


const MQTT_URL =
  process.env.MQTT_URL;

const MQTT_USERNAME =
  process.env.MQTT_USERNAME;

const MQTT_PASSWORD =
  process.env.MQTT_PASSWORD;


let client =
  null;


/* =========================================================
   MQTT Client
   ========================================================= */

if (!MQTT_URL) {

  console.warn(
    "⚠️ MQTT_URL 尚未設定，MQTT 不會啟動"
  );


} else {

  client =
    mqtt.connect(
      MQTT_URL,
      {

        username:
          MQTT_USERNAME,

        password:
          MQTT_PASSWORD,

        protocolVersion:
          4,

        reconnectPeriod:
          3000,

        connectTimeout:
          10000,

        clean:
          true
      }
    );


  /* =======================================================
     MQTT Connected
     ======================================================= */

  client.on(
    "connect",
    () => {

      console.log(
        "✅ MQTT connected"
      );


      console.log(
        "FISHTANK_DEVICE_ID:",
        DEVICE_ID
      );


      const statusTopic =
        topicStatus();


      client.subscribe(
        statusTopic,
        {
          qos:
            1
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
    }
  );


  client.on(
    "reconnect",
    () => {

      console.log(
        "🔄 MQTT reconnecting..."
      );
    }
  );


  client.on(
    "close",
    () => {

      console.log(
        "⚠️ MQTT disconnected"
      );
    }
  );


  client.on(
    "offline",
    () => {

      console.log(
        "⚠️ MQTT offline"
      );
    }
  );


  client.on(
    "error",
    (err) => {

      console.error(
        "❌ MQTT error:",
        err.message
      );
    }
  );


  /* =======================================================
     MQTT Message
     ======================================================= */

  client.on(
    "message",
    async (
      topic,
      message
    ) => {

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


        // ===================================================
        // 只處理 ESP32 status topic
        // ===================================================

        if (
          topic !==
          topicStatus()
        ) {

          return;
        }


        let data;


        try {

          data =
            JSON.parse(
              payloadText
            );


        } catch (err) {

          /*
             ESP32 上線時會送：

             esp32_online

             不是 JSON。
          */

          console.log(
            "ℹ️ MQTT status 非 JSON:",
            payloadText
          );


          return;
        }


        // ===================================================
        // 1. RS485 DO 校正結果
        // ===================================================

        if (
          data.type ===
          "do_calibration_result"
        ) {

          await handleDoCalibrationResult(
            data
          );


          return;
        }


        // ===================================================
        // 2. Arduino / ESP32 模式改變
        // ===================================================

        if (
          data.type ===
          "mode_changed"
        ) {

          await handleModeChanged(
            data
          );


          return;
        }


        console.log(
          "ℹ️ 未處理的 MQTT status type:",
          data.type
        );


      } catch (err) {

        console.error(
          "❌ MQTT message 處理失敗:",
          err
        );
      }
    }
  );
}


/* =========================================================
   DO 校正結果
   ========================================================= */

async function handleDoCalibrationResult(
  data
) {

  console.log(
    "================================"
  );


  console.log(
    "🧪 收到 DO 校正結果"
  );


  const deviceId =
    data.device_id ||
    DEVICE_ID;


  const requestId =
    String(
      data.request_id ||
      ""
    ).trim();


  const action =
    String(
      data.action ||
      ""
    ).trim();


  const status =
    String(
      data.status ||
      ""
    )
      .trim()
      .toUpperCase();


  // ========================================================
  // 基本格式檢查
  // ========================================================

  if (!requestId) {

    console.log(
      "❌ DO 校正結果缺少 request_id"
    );


    console.log(
      "================================"
    );


    return;
  }


  if (
    action !== "0" &&
    action !== "100"
  ) {

    console.log(
      "❌ DO 校正結果 action 錯誤:",
      action
    );


    console.log(
      "================================"
    );


    return;
  }


  let success;


  if (
    typeof data.success ===
    "boolean"
  ) {

    success =
      data.success;

  } else {

    success =
      status ===
      "OK";
  }


  console.log(
    "device_id:",
    deviceId
  );


  console.log(
    "request_id:",
    requestId
  );


  console.log(
    "action:",
    action
  );


  console.log(
    "success:",
    success
  );


  // ========================================================
  // 取得目前校正狀態
  // ========================================================

  const current =
    await Calibration
      .findOne({
        device_id:
          deviceId
      })
      .lean();


  if (!current) {

    console.log(
      "❌ 找不到 Calibration 資料"
    );


    console.log(
      "================================"
    );


    return;
  }


  // ========================================================
  // ESP32 有可能因 MQTT QoS / 重連
  // 重送同一筆結果。
  //
  // 已經處理過就直接忽略。
  // ========================================================

  if (
    current
      .do_cal_last_request_id ===
    requestId
  ) {

    console.log(
      "ℹ️ 此 DO 校正結果已處理過，忽略重複訊息"
    );


    console.log(
      "================================"
    );


    return;
  }


  // ========================================================
  // request_id 必須和目前 PENDING 相同
  // ========================================================

  if (
    current
      .do_cal_request_id !==
    requestId
  ) {

    console.log(
      "⚠️ DO 校正 request_id 不一致"
    );


    console.log(
      "DB pending:",
      current
        .do_cal_request_id
    );


    console.log(
      "Device result:",
      requestId
    );


    console.log(
      "================================"
    );


    return;
  }


  // ========================================================
  // action 也必須一致
  // ========================================================

  if (
    current.do_cal_action &&
    current.do_cal_action !==
      action
  ) {

    console.log(
      "⚠️ DO 校正 action 不一致"
    );


    console.log(
      "DB action:",
      current.do_cal_action
    );


    console.log(
      "Device action:",
      action
    );


    console.log(
      "================================"
    );


    return;
  }


  const now =
    new Date();


  // ========================================================
  // 更新 MongoDB
  //
  // current request 清空，
  // 最後完成資訊另外留下。
  // ========================================================

  const updated =
    await Calibration
      .findOneAndUpdate(

        {
          device_id:
            deviceId,

          do_cal_request_id:
            requestId
        },

        {
          $set: {

            do_cal_last_request_id:
              requestId,

            do_cal_last_action:
              action,

            do_cal_status:
              success
                ? "SUCCESS"
                : "FAILED",

            do_cal_success:
              success,

            do_cal_result_at:
              now,


            // ===============================================
            // 一次性 request 已完成
            // 清掉 action / request_id
            // ===============================================

            do_cal_action:
              "",

            do_cal_request_id:
              "",


            updated_at:
              now
          }
        },

        {
          new:
            true
        }
      )
      .lean();


  if (!updated) {

    console.log(
      "❌ DO 校正結果更新 DB 失敗"
    );


    console.log(
      "================================"
    );


    return;
  }


  console.log(
    success
      ? "✅ DO 校正成功"
      : "❌ DO 校正失敗"
  );


  console.log(
    "MongoDB 已更新"
  );


  // ========================================================
  // 通知 APP
  //
  // APP 後面可以收到 calibration WebSocket
  // 並看到 SUCCESS / FAILED。
  // ========================================================

  broadcastCalibration(
    updated
  );


  // ========================================================
  // 更新 retained calibration MQTT
  //
  // 非常重要：
  //
  // 原本 retained MQTT 裡是：
  //
  // do_cal_action = 100
  // request_id = xxx
  //
  // 完成後重新 publish：
  //
  // do_cal_action = ""
  // request_id = ""
  //
  // 避免 ESP32 日後重連還看到舊 request。
  // ========================================================

  const clearRequestMqttOk =
    await publishJson(

      topicCalibration(),

      updated,

      {
        qos:
          1,

        retain:
          true
      }
    );


  if (clearRequestMqttOk) {

    console.log(
      "✅ MQTT retained DO 校正 request 已清除"
    );

  } else {

    console.log(
      "⚠️ DO 校正結果已存 DB，但 retained MQTT 暫時無法更新"
    );
  }


  console.log(
    "================================"
  );
}


/* =========================================================
   Arduino / ESP32 模式改變
   ========================================================= */

async function handleModeChanged(
  data
) {

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


  // ========================================================
  // AUTO
  // ========================================================

  if (
    data.mode === 0 ||
    data.mode === false ||
    data.mode_name ===
      "AUTO"
  ) {

    const now =
      new Date();


    const control =
      await ControlState
        .findOneAndUpdate(

          {},

          {
            $set: {

              mode:
                false,

              updatedAt:
                now
            }
          },

          {
            new:
              true,

            upsert:
              true
          }
        );


    console.log(
      "✅ ControlState 已同步為 AUTO"
    );


    console.log(
      "mode:",
      control.mode
    );


    broadcastStatusToApps({

      device_id:
        data.device_id ||
        DEVICE_ID,

      mode:
        false,

      mode_name:
        "AUTO",

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


  // ========================================================
  // MANUAL
  // ========================================================

  else if (
    data.mode === 1 ||
    data.mode === true ||
    data.mode_name ===
      "MANUAL"
  ) {

    const now =
      new Date();


    const control =
      await ControlState
        .findOneAndUpdate(

          {},

          {
            $set: {

              mode:
                true,

              updatedAt:
                now
            }
          },

          {
            new:
              true,

            upsert:
              true
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
        DEVICE_ID,

      mode:
        true,

      mode_name:
        "MANUAL",

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
}


/* =========================================================
   Publish JSON
   ========================================================= */

function publishJson(
  topic,
  data,
  options = {}
) {

  return new Promise(
    (resolve) => {

      if (!client) {

        console.warn(
          "⚠️ MQTT client 尚未建立，無法 publish:",
          topic
        );


        return resolve(
          false
        );
      }


      if (!client.connected) {

        console.warn(
          "⚠️ MQTT 尚未連線，無法 publish:",
          topic
        );


        return resolve(
          false
        );
      }


      const payload =
        JSON.stringify(
          data
        );


      client.publish(

        topic,

        payload,

        {
          qos:
            options.qos ??
            1,

          retain:
            options.retain ??
            false
        },

        (err) => {

          if (err) {

            console.error(
              "❌ MQTT publish failed:",
              err.message
            );


            return resolve(
              false
            );
          }


          console.log(
            "📡 MQTT published:",
            topic
          );


          console.log(
            payload
          );


          return resolve(
            true
          );
        }
      );
    }
  );
}


/* =========================================================
   MQTT Topics
   ========================================================= */

function topicControl() {

  return (
    `fish/control/${DEVICE_ID}`
  );
}


function topicSettings() {

  return (
    `fish/settings/${DEVICE_ID}`
  );
}


function topicCalibration() {

  return (
    `fish/calibration/${DEVICE_ID}`
  );
}


function topicStatus() {

  return (
    `fish/status/${DEVICE_ID}`
  );
}


/* =========================================================
   Export
   ========================================================= */

module.exports = {

  publishJson,

  topicControl,

  topicSettings,

  topicCalibration,

  topicStatus
};