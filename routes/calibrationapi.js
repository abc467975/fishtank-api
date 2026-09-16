const express =
  require("express");

const crypto =
  require("crypto");


const Calibration =
  require("../models/calibration");


const {
  broadcastCalibration,
  getClientCount
} = require("../utils/wsHub");


const {
  publishJson,
  topicCalibration
} = require("../utils/mqttClient");


const {
  DEVICE_ID,
  resolveDeviceId
} = require("../utils/deviceConfig");


const router =
  express.Router();


/* =========================================================
   GET /api/calibration
   ========================================================= */

router.get(
  "/calibration",
  async (req, res) => {

    try {

      const deviceId =
        resolveDeviceId(
          req.query.device_id
        );


      let doc =
        await Calibration
          .findOne({
            device_id:
              deviceId
          })
          .lean();


      // =====================================================
      // 第一次使用，自動建立
      // =====================================================

      if (!doc) {

        const createdDoc =
          await Calibration.create({

            device_id:
              deviceId,

            calibration_mode:
              false,

            calibration_mode1:
              false,

            ph4_raw:
              0,

            ph7_raw:
              0,

            do_0_raw:
              0,

            do_100_raw:
              0,

            do_cal_action:
              "",

            do_cal_request_id:
              "",

            do_cal_status:
              "IDLE",

            do_cal_success:
              null,

            do_cal_requested_at:
              null,

            do_cal_result_at:
              null,

            do_cal_last_request_id:
              "",

            do_cal_last_action:
              "",

            updated_at:
              new Date()
          });


        doc =
          createdDoc.toObject();
      }


      res.json({

        success:
          true,

        message:
          "取得校正資料成功",

        data:
          doc
      });


    } catch (error) {

      console.error(
        "GET /calibration error:",
        error
      );


      res
        .status(
          error.statusCode ||
          500
        )
        .json({

          success:
            false,

          message:
            "取得校正資料失敗",

          error:
            error.message
        });
    }
  }
);


/* =========================================================
   POST /api/calibration
   ========================================================= */

router.post(
  "/calibration",
  async (req, res) => {

    try {

      console.log(
        "POST /calibration received:",
        req.body
      );


      const {

        device_id:
          requestedDeviceId,

        calibration_mode,

        calibration_mode1,

        ph4_raw,

        ph7_raw,

        do_0_raw,

        do_100_raw,

        // ===================================================
        // 新 RS485 DO 校正
        //
        // APP 只需要送：
        //
        // do_cal_action: "100"
        //
        // 或：
        //
        // do_cal_action: "0"
        //
        // request_id 由 Node 自己產生。
        // ===================================================

        do_cal_action

      } = req.body;


      const device_id =
        resolveDeviceId(
          requestedDeviceId
        );


      const now =
        new Date();


      const updateData = {

        updated_at:
          now
      };


      // =====================================================
      // pH 校正模式
      // =====================================================

      if (
        calibration_mode !==
        undefined
      ) {

        updateData.calibration_mode =
          Boolean(
            calibration_mode
          );
      }


      // =====================================================
      // DO 校正模式
      // =====================================================

      if (
        calibration_mode1 !==
        undefined
      ) {

        updateData.calibration_mode1 =
          Boolean(
            calibration_mode1
          );
      }


      // =====================================================
      // pH raw
      // =====================================================

      if (
        ph4_raw !==
        undefined
      ) {

        updateData.ph4_raw =
          Number(
            ph4_raw
          );
      }


      if (
        ph7_raw !==
        undefined
      ) {

        updateData.ph7_raw =
          Number(
            ph7_raw
          );
      }


      // =====================================================
      // 舊 Analog DO raw
      //
      // 暫時仍允許 APP 傳，
      // 但新的 RS485 DO 已不再使用。
      // =====================================================

      if (
        do_0_raw !==
        undefined
      ) {

        updateData.do_0_raw =
          Number(
            do_0_raw
          );
      }


      if (
        do_100_raw !==
        undefined
      ) {

        updateData.do_100_raw =
          Number(
            do_100_raw
          );
      }


      // =====================================================
      // 新 RS485 DO 校正要求
      // =====================================================

      let generatedRequestId =
        null;


      if (
        do_cal_action !==
        undefined
      ) {

        const action =
          String(
            do_cal_action
          ).trim();


        // 只允許 0 / 100
        if (
          action !== "0" &&
          action !== "100"
        ) {

          return res
            .status(400)
            .json({

              success:
                false,

              message:
                "do_cal_action 只允許 0 或 100"
            });
        }


        // ===================================================
        // 檢查是否已有校正正在執行
        // ===================================================

        const current =
          await Calibration
            .findOne({
              device_id
            })
            .lean();


        if (
          current &&
          current.do_cal_status ===
            "PENDING" &&
          current.do_cal_request_id
        ) {

          return res
            .status(409)
            .json({

              success:
                false,

              message:
                "目前已有 DO 校正正在執行中",

              request_id:
                current
                  .do_cal_request_id,

              action:
                current
                  .do_cal_action
            });
        }


        // ===================================================
        // Node 自己產生唯一 request_id
        // ===================================================

        generatedRequestId =
          crypto.randomUUID();


        // ===================================================
        // 發出校正時，自動確保 DO 校正模式為 ON
        //
        // 即使 APP 沒有先另外開 calibration_mode1，
        // ESP32 收到同一包後仍會：
        //
        // 1. 先進入 calibration_mode1
        // 2. 等 1 秒
        // 3. 才送 DO_CAL 給 Mega
        // ===================================================

        updateData.calibration_mode1 =
          true;


        updateData.do_cal_action =
          action;


        updateData.do_cal_request_id =
          generatedRequestId;


        updateData.do_cal_status =
          "PENDING";


        updateData.do_cal_success =
          null;


        updateData.do_cal_requested_at =
          now;


        updateData.do_cal_result_at =
          null;
      }


      // =====================================================
      // 新資料預設值
      // =====================================================

      const insertData = {

        device_id,

        calibration_mode:
          false,

        calibration_mode1:
          false,

        ph4_raw:
          0,

        ph7_raw:
          0,

        do_0_raw:
          0,

        do_100_raw:
          0,

        do_cal_action:
          "",

        do_cal_request_id:
          "",

        do_cal_status:
          "IDLE",

        do_cal_success:
          null,

        do_cal_requested_at:
          null,

        do_cal_result_at:
          null,

        do_cal_last_request_id:
          "",

        do_cal_last_action:
          ""
      };


      /*
         防止：

         $set
         $setOnInsert

         同時修改相同欄位。
      */

      Object
        .keys(
          updateData
        )
        .forEach(
          (key) => {

            delete insertData[
              key
            ];
          }
        );


      const doc =
        await Calibration
          .findOneAndUpdate(

            {
              device_id
            },

            {
              $set:
                updateData,

              $setOnInsert:
                insertData
            },

            {
              new:
                true,

              upsert:
                true
            }
          )
          .lean();


      console.log(
        "✅ Calibration DB updated:",
        doc
      );


      // =====================================================
      // MQTT 優先
      //
      // retain=true 非常重要。
      //
      // ESP32 如果剛好暫時斷線，
      // 重連後仍能收到最後狀態。
      // =====================================================

      const mqttOk =
        await publishJson(

          topicCalibration(),

          doc,

          {
            qos:
              1,

            retain:
              true
          }
        );


      // =====================================================
      // MQTT 失敗
      // -> WebSocket 備援
      // =====================================================

      if (!mqttOk) {

        console.log(
          "⚠️ MQTT calibration failed，改用 WebSocket 備援"
        );


        broadcastCalibration(
          doc
        );
      }


      // =====================================================
      // HTTP 回應
      // =====================================================

      res.json({

        success:
          true,

        message:
          generatedRequestId
            ? (
                mqttOk
                  ? "DO 校正要求已建立並透過 MQTT 發送"
                  : "DO 校正要求已建立並透過 WebSocket 備援發送"
              )
            : (
                mqttOk
                  ? "校正資料更新成功，已透過 MQTT 推送"
                  : "校正資料更新成功，已透過 WebSocket 備援推送"
              ),

        mqttOk,

        websocketClients:
          getClientCount(),

        do_cal_request_id:
          generatedRequestId,

        data:
          doc
      });


    } catch (error) {

      console.error(
        "POST /calibration error:",
        error
      );


      res
        .status(
          error.statusCode ||
          500
        )
        .json({

          success:
            false,

          message:
            "更新校正資料失敗",

          error:
            error.message
        });
    }
  }
);


module.exports =
  router;