const mongoose = require("mongoose");

const {
  DEVICE_ID
} = require("../utils/deviceConfig");


/* =========================================================
   Calibration Schema
   ========================================================= */

const calibrationSchema =
  new mongoose.Schema(
    {
      device_id: {
        type: String,
        default: DEVICE_ID
      },


      // =====================================================
      // 校正模式
      // =====================================================

      // pH 校正模式
      calibration_mode: {
        type: Boolean,
        default: false
      },


      // DO 校正模式
      calibration_mode1: {
        type: Boolean,
        default: false
      },


      // =====================================================
      // pH 舊校正資料
      // =====================================================

      ph4_raw: {
        type: Number,
        default: 0
      },

      ph7_raw: {
        type: Number,
        default: 0
      },


      // =====================================================
      // 舊 Analog DO 校正資料
      //
      // 為了目前 APP / ESP32 相容先保留。
      // 新 RS485 DO 已不再使用。
      // =====================================================

      do_0_raw: {
        type: Number,
        default: 0
      },

      do_100_raw: {
        type: Number,
        default: 0
      },


      // =====================================================
      // 新 RS485 DO 校正要求
      // =====================================================

      // ""
      // "0"
      // "100"
      do_cal_action: {
        type: String,
        enum: ["", "0", "100"],
        default: ""
      },


      // Node 每按一次校正產生新的 UUID
      do_cal_request_id: {
        type: String,
        default: ""
      },


      // IDLE
      // PENDING
      // SUCCESS
      // FAILED
      do_cal_status: {
        type: String,
        enum: [
          "IDLE",
          "PENDING",
          "SUCCESS",
          "FAILED"
        ],
        default: "IDLE"
      },


      // null = 尚未完成
      // true = 成功
      // false = 失敗
      do_cal_success: {
        type: Boolean,
        default: null
      },


      // 發出校正要求時間
      do_cal_requested_at: {
        type: Date,
        default: null
      },


      // 收到硬體校正結果時間
      do_cal_result_at: {
        type: Date,
        default: null
      },


      // =====================================================
      // 最後一筆完成的校正
      //
      // 即使目前 request_id 被清空，
      // APP 還是可以知道最後結果。
      // =====================================================

      do_cal_last_request_id: {
        type: String,
        default: ""
      },


      do_cal_last_action: {
        type: String,
        enum: ["", "0", "100"],
        default: ""
      },


      // =====================================================
      // 更新時間
      // =====================================================

      updated_at: {
        type: Date,
        default: Date.now
      }
    },
    {
      versionKey: false
    }
  );


/* =========================================================
   避免熱重載重複註冊 Model
   ========================================================= */

const Calibration =
  mongoose.models.Calibration ||
  mongoose.model(
    "Calibration",
    calibrationSchema
  );


module.exports =
  Calibration;