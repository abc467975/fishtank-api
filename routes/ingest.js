// routes/ingest.js

console.log("🔥 ingest router loaded");

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SensorData = require("../models/SensorData");
const Settings = require("../models/Settings");
const Alarm = require("../models/Alarm");
const AlarmEvent = require("../models/AlarmEvent");
const { broadcastAlarm } = require("../utils/wsHub");

const { evaluateSensor } = require("../utils/sensorGrading");
const { resolveDeviceId } = require("../utils/deviceConfig");

const {
  handleAlarmNotification,
  clearAlarmNotification
} = require("../utils/notificationManager");


/* =========================================================
   數值安全轉換
   ========================================================= */

function isValidNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}


function safeNumber(value) {
  return isValidNumber(value)
    ? Number(value)
    : null;
}


/* =========================================================
   ESP32 上傳感測器資料
   POST /api/sensor
   ========================================================= */

router.post("/sensor", async (req, res) => {

  if (mongoose.connection.readyState !== 1) {

    return res.status(503).json({
      error: "DB not ready"
    });
  }


  try {

    const now =
      Date.now();


    const deviceId =
      resolveDeviceId(
        req.body.device_id
      );


    /* =====================================================
       原始資料
       ===================================================== */

    const baseData = {

      ...req.body,

      device_id:
        deviceId,

      timestamp:
        now,

      time:
        new Date(now).toLocaleString(
          "zh-TW",
          {
            timeZone:
              "Asia/Taipei"
          }
        )
    };


    /* =====================================================
       最新設定
       ===================================================== */

    const latestSettings =
      await Settings
        .findOne()
        .sort({
          time: -1
        })
        .lean();


    /* =====================================================
       清理 ESP32 / Arduino 資料

       重要：
       null 必須維持 null
       不可以 Number(null) -> 0
       ===================================================== */

    const safeData = {

      ...baseData,


      // ===================================================
      // 溫度
      // ===================================================

      T1:
        safeNumber(
          baseData.T1
        ),

      T2:
        safeNumber(
          baseData.T2
        ),

      T3:
        safeNumber(
          baseData.T3
        ),

      T4:
        safeNumber(
          baseData.T4
        ),


      TempAvg:
        safeNumber(
          baseData.TempAvg
        ),


      // ===================================================
      // 水位
      // ===================================================

      WL1:
        safeNumber(
          baseData.WL1
        ),

      WL2:
        safeNumber(
          baseData.WL2
        ),

      WL3:
        safeNumber(
          baseData.WL3
        ),


      // ===================================================
      // pH
      // ===================================================

      pH:
        safeNumber(
          baseData.pH
        ),

      pH_value:
        safeNumber(
          baseData.pH_value
        ),


      // ===================================================
      // RS485 DO
      // ===================================================

      // 現在 DO 與 DO_value 都是 mg/L
      DO:
        safeNumber(
          baseData.DO
        ),

      DO_value:
        safeNumber(
          baseData.DO_value
        ),


      // 飽和度，例如 98.3
      DO_saturation:
        safeNumber(
          baseData.DO_saturation
        ),


      // LDO 感測器內建溫度
      DO_sensor_temp:
        safeNumber(
          baseData.DO_sensor_temp
        ),


      // 1 = 在線
      // 0 = 失聯
      DO_online:
        safeNumber(
          baseData.DO_online
        ),


      // ===================================================
      // 濁度
      // ===================================================

      Turb:
        safeNumber(
          baseData.Turb
        ),


      // ===================================================
      // Arduino 系統狀態
      // ===================================================

      tankHeaterOn:
        safeNumber(
          baseData.tankHeaterOn
        ),

      bucketHeaterOn:
        safeNumber(
          baseData.bucketHeaterOn
        ),

      waterChangeState:
        safeNumber(
          baseData.waterChangeState
        ),

      manualMode:
        safeNumber(
          baseData.manualMode
        ),

      manualTimeoutLatched:
        safeNumber(
          baseData.manualTimeoutLatched
        )
    };


    /* =====================================================
       Node 再驗證一次魚缸溫度感測器
       T1 / T2 / T3
       ===================================================== */

    const validTankTemps = [

      safeData.T1,
      safeData.T2,
      safeData.T3

    ].filter(

      value =>
        typeof value === "number" &&
        Number.isFinite(value)
    );


    /*
       3 = 全部正常
       1~2 = 部分異常
       0 = 全部失聯
    */

    safeData.tank_temperature_valid_count =
      validTankTemps.length;


    if (
      validTankTemps.length === 3
    ) {

      safeData.tank_temperature_status =
        "normal";

    }
    else if (
      validTankTemps.length > 0
    ) {

      safeData.tank_temperature_status =
        "partial_error";

    }
    else {

      safeData.tank_temperature_status =
        "sensor_error";
    }


    /* =====================================================
       Node 再驗證一次 T4 新水桶溫度
       ===================================================== */

    if (
      typeof safeData.T4 === "number" &&
      Number.isFinite(
        safeData.T4
      )
    ) {

      safeData.bucket_temperature_status =
        "normal";

    } else {

      safeData.bucket_temperature_status =
        "sensor_error";
    }


    /* =====================================================
       使用整理完成後的 safeData 做統一分級

       注意：
       一定要在 safeData 完成後才 evaluateSensor
       ===================================================== */

    const grading =
      evaluateSensor(
        safeData,
        latestSettings
      );


    /* =====================================================
       通知系統需要的狀態
       ===================================================== */

    const notificationStates =
      grading.notification_states || [];


    /* =====================================================
       MongoDB 儲存版本

       notification_states 不需要重複存進 grading
       ===================================================== */

    const gradingForStorage = {
      ...grading
    };


    delete gradingForStorage.notification_states;


    /* =====================================================
       儲存 SensorData
       ===================================================== */

    const data = {

      ...safeData,

      grading:
        gradingForStorage
    };


    const savedData =
      await SensorData.create(
        data
      );


    /* =====================================================
       sensorGrading 統一分級資訊
       ===================================================== */

    const sensorMeta = {

      temperature: {

        sensorName:
          "魚缸溫度",

        unit:
          "°C",

        min:
          grading.limits.temperature_min,

        max:
          grading.limits.temperature_max
      },


      pH: {

        sensorName:
          "pH",

        unit:
          "",

        min:
          grading.limits.ph_min,

        max:
          grading.limits.ph_max
      },


      dissolvedOxygen: {

        sensorName:
          "溶氧量",

        unit:
          "mg/L",

        min:
          grading.limits.do_min,

        max:
          null
      },


      turbidity: {

        sensorName:
          "濁度",

        unit:
          "",

        min:
          null,

        max:
          null
      },


      waterLevel: {

        sensorName:
          "魚缸水位",

        unit:
          "",

        min:
          null,

        max:
          null
      }
    };


    const alarmResults = [];


    /* =====================================================
       警報處理
       ===================================================== */

    for (
      const state of notificationStates
    ) {

      const meta =
        sensorMeta[
          state.sensor_type
        ];


      if (!meta) {

        alarmResults.push({

          sensor_type:
            state.sensor_type,

          notification: {

            sent:
              false,

            reason:
              "NO_SENSOR_META"
          }
        });


        continue;
      }


      /*
         UNKNOWN 代表感測器無資料。

         不發送通知，
         也不把原本警報錯誤清除。
      */

      if (
        state.severity ===
        "unknown"
      ) {

        alarmResults.push({

          sensor_type:
            state.sensor_type,

          severity:
            state.severity,

          notification: {

            sent:
              false,

            reason:
              "UNKNOWN_SENSOR_DATA"
          }
        });


        continue;
      }


      const alarmKey =
        `${deviceId}:${state.sensor_type}`;


      const lastAlarm =
        await Alarm
          .findOne({
            alarm_key:
              alarmKey
          })
          .lean();


      const triggered =
        state.is_abnormal ===
        true;


      /* ===================================================
         警報方向改變
         例如 high -> low
         =================================================== */

      const alarmTypeChanged =
        Boolean(

          lastAlarm?.active &&

          lastAlarm.alarm_type &&

          lastAlarm.alarm_type !==
            state.alarm_type
        );


      /* ===================================================
         嚴重程度改變
         例如 warning -> critical
         =================================================== */

      const severityChanged =
        Boolean(

          lastAlarm?.active &&

          lastAlarm.severity &&

          lastAlarm.severity !==
            state.severity
        );


      /*
         警報方向或嚴重程度改變，
         清除上一個通知的等待 /
         cooldown 狀態。
      */

      if (
        alarmTypeChanged ||
        severityChanged
      ) {

        clearAlarmNotification(

          deviceId,

          state.sensor_type,

          lastAlarm.alarm_type
        );


        console.log(

          `[警報狀態改變] ${state.sensor_type}`,

          {

            previous_alarm_type:
              lastAlarm.alarm_type,

            current_alarm_type:
              state.alarm_type,

            previous_severity:
              lastAlarm.severity,

            current_severity:
              state.severity
          }
        );
      }


      /* ===================================================
         警報文字
         =================================================== */

      let message;


      /*
         水位使用 WL1、WL2 顯示。
      */

      if (
        state.sensor_type ===
        "waterLevel"
      ) {

        message =
          triggered

            ? `${meta.sensorName}異常：${state.label}，WL1=${state.WL1}，WL2=${state.WL2}`

            : `${meta.sensorName}恢復正常：${state.label}，WL1=${state.WL1}，WL2=${state.WL2}`;

      } else {

        const valueText =

          state.value !== null &&
          state.value !== undefined

            ? `${state.value}${meta.unit}`

            : "無資料";


        message =
          triggered

            ? `${meta.sensorName}異常：${state.label}，目前數值 ${valueText}`

            : `${meta.sensorName}恢復正常，目前數值 ${valueText}`;
      }


      const nowDate =
        new Date();


      /* ===================================================
         是否保留第一次異常時間
         =================================================== */

      const shouldKeepFirstDetectedAt =

        triggered &&

        lastAlarm?.active &&

        lastAlarm.alarm_type ===
          state.alarm_type &&

        lastAlarm.severity ===
          state.severity;


      /* ===================================================
         Alarm 更新資料
         =================================================== */

      const updateData = {

        alarm_key:
          alarmKey,

        device_id:
          deviceId,


        sensor_type:
          state.sensor_type,

        sensor_name:
          meta.sensorName,


        value:

          state.sensor_type ===
          "waterLevel"

            ? null

            : state.value,


        state:

          state.sensor_type ===
          "waterLevel"

            ? state.state || null

            : null,


        WL1:

          state.sensor_type ===
            "waterLevel" &&

          isValidNumber(
            state.WL1
          )

            ? Number(
                state.WL1
              )

            : null,


        WL2:

          state.sensor_type ===
            "waterLevel" &&

          isValidNumber(
            state.WL2
          )

            ? Number(
                state.WL2
              )

            : null,


        min_value:

          isValidNumber(
            meta.min
          )

            ? Number(
                meta.min
              )

            : null,


        max_value:

          isValidNumber(
            meta.max
          )

            ? Number(
                meta.max
              )

            : null,


        unit:
          meta.unit,


        active:
          triggered,


        alarm_type:
          state.alarm_type,

        severity:
          state.severity,

        grade:
          state.grade,

        label:
          state.label,


        message,


        status:

          triggered

            ? "active"

            : "resolved",


        first_detected_at:

          shouldKeepFirstDetectedAt

            ? lastAlarm.first_detected_at ||
              nowDate

            : triggered

              ? nowDate

              : lastAlarm?.first_detected_at ||
                nowDate,


        last_detected_at:
          nowDate,


        /*
           只有從異常恢復正常，
           才記錄 resolved_at。
        */

        resolved_at:

          triggered

            ? null

            : lastAlarm?.active

              ? nowDate

              : lastAlarm?.resolved_at ??
                null
      };


      /* ===================================================
         更新 / 新增目前 Alarm
         =================================================== */

      const alarm =
        await Alarm.findOneAndUpdate(

          {
            alarm_key:
              alarmKey
          },

          {
            $set:
              updateData
          },

          {
            upsert:
              true,

            new:
              true,

            runValidators:
              true
          }
        );


      /* ===================================================
         AlarmEvent
         =================================================== */

      const eventType =

        triggered

          ? (
              !lastAlarm?.active

                ? "created"

                : (
                    alarmTypeChanged ||
                    severityChanged

                      ? "updated"

                      : null
                  )
            )

          : (
              lastAlarm?.active

                ? "resolved"

                : null
            );


      if (eventType) {

        const payload =
          alarm.toObject();


        await AlarmEvent.create({

          alarm_id:
            alarm._id,

          device_id:
            deviceId,

          event_type:
            eventType,

          event_at:
            nowDate,

          payload
        });


        broadcastAlarm(
          eventType,
          payload
        );
      }


      /* ===================================================
         異常通知
         =================================================== */

      if (triggered) {

        const notifyResult =
          await handleAlarmNotification({

            ...alarm.toObject(),

            grade:
              state.grade,

            severity:
              state.severity,

            is_severe:
              state.is_severe,

            is_abnormal:
              state.is_abnormal,

            label:
              state.label
          });


        /*
           真的成功發送 FCM
           才更新發送時間
        */

        if (
          notifyResult?.sent
        ) {

          alarm.lastSentAt =
            new Date();

          await alarm.save();
        }


        alarmResults.push({

          alarm,

          notification:
            notifyResult
        });

      } else {

        /*
           GREEN：
           感測器恢復正常。

           清除 delay / cooldown。
        */

        clearAlarmNotification(

          deviceId,

          state.sensor_type
        );


        alarmResults.push({

          alarm,

          notification: {

            sent:
              false,

            reason:
              "SENSOR_NORMAL_CLEAR_NOTIFICATION_STATE"
          }
        });
      }
    }


    /* =====================================================
       完成
       ===================================================== */

    console.log(
      "✅ Sensor data inserted"
    );


    return res.json({

      ok:
        true,

      id:
        savedData._id,


      // 相容目前 App
      grading:
        gradingForStorage,


      alarmResults
    });


  } catch (err) {

    console.error(
      "❌ insert fail",
      err
    );


    return res.status(
      err.statusCode || 500
    ).json({

      error:
        "insert fail",

      message:
        err.message
    });
  }
});


module.exports =
  router;