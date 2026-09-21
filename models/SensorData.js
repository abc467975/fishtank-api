// models/SensorData.js

const mongoose = require("mongoose");

const {
  DEVICE_ID
} = require("../utils/deviceConfig");


const SensorDataSchema =
  new mongoose.Schema(
    {
      // =====================================================
      // 裝置
      // =====================================================

      device_id: {
        type: String,
        default: DEVICE_ID,
        index: true
      },


      // =====================================================
      // 時間
      // =====================================================

      timestamp: {
        type: Number,
        required: true
      },


      time: {
        type: String,
        required: true
      },


      // =====================================================
      // 溫度感測器
      //
      // DS18B20 讀取失敗時：
      // Arduino 會上傳 null
      //
      // T1 ~ T3 = 魚缸
      // T4      = 新水桶
      // =====================================================

      T1: {
        type: Number,
        default: null
      },

      T2: {
        type: Number,
        default: null
      },

      T3: {
        type: Number,
        default: null
      },

      T4: {
        type: Number,
        default: null
      },


      // Arduino 已算好的魚缸平均溫度
      //
      // T1~T3 至少一顆有效：
      // 會計算有效感測器平均
      //
      // T1~T3 全部失敗：
      // TempAvg = null
      TempAvg: {
        type: Number,
        default: null
      },


      // =====================================================
      // 溫度感測器狀態
      // =====================================================

      /*
         T1 ~ T3 有效顆數

         3 = 三顆正常
         1~2 = 部分異常
         0 = 全部失聯
      */
      tank_temperature_valid_count: {
        type: Number,
        default: 0
      },


      /*
         魚缸溫度感測器狀態

         normal
         partial_error
         sensor_error
         unknown
      */
      tank_temperature_status: {
        type: String,
        enum: [
          "normal",
          "partial_error",
          "sensor_error",
          "unknown"
        ],
        default: "unknown"
      },


      /*
         新水桶 T4 狀態

         normal
         sensor_error
         unknown
      */
      bucket_temperature_status: {
        type: String,
        enum: [
          "normal",
          "sensor_error",
          "unknown"
        ],
        default: "unknown"
      },


      // =====================================================
      // 水位
      // =====================================================

      WL1: Number,

      WL2: Number,

      WL3: Number,


      // =====================================================
      // pH
      // =====================================================

      // pH 原始 ADC
      pH: Number,


      // Arduino 換算完成的 pH
      pH_value: {
        type: Number,
        default: null
      },


      // =====================================================
      // RS485 LDO 溶氧感測器
      // =====================================================

      /*
         舊系統：
         DO 原本是 Analog raw。

         新系統：
         Arduino 為了相容舊欄位，
         現在 DO 直接傳 mg/L。

         例如：
         DO = 7.82
      */
      DO: {
        type: Number,
        default: null
      },


      /*
         正式 DO 濃度
         單位：mg/L

         例如：
         7.82

         尚未成功讀取時：
         null
      */
      DO_value: {
        type: Number,
        default: null
      },


      /*
         DO 飽和度
         Arduino 已經乘以 100 再上傳。

         例如：
         98.3 = 98.3 %

         尚未成功讀取時：
         null
      */
      DO_saturation: {
        type: Number,
        default: null
      },


      /*
         LDO 感測器本身的內建溫度。

         例如：
         26.90 °C

         尚未成功讀取時：
         null
      */
      DO_sensor_temp: {
        type: Number,
        default: null
      },


      /*
         RS485 DO 感測器連線狀態

         1 = 在線
         0 = 失聯
      */
      DO_online: {
        type: Number,
        default: 0
      },


      // =====================================================
      // 濁度
      // =====================================================

      // 濁度 raw ADC
      Turb: Number,


      // =====================================================
      // 實際輸出 / 系統狀態
      // =====================================================

      /*
         0 = 魚缸加熱器 OFF
         1 = 魚缸加熱器 ON
      */
      tankHeaterOn: {
        type: Number,
        default: 0
      },


      /*
         0 = 新水桶加熱器 OFF
         1 = 新水桶加熱器 ON
      */
      bucketHeaterOn: {
        type: Number,
        default: 0
      },


      /*
         0 = WC_IDLE
         1 = WC_DRAIN_TO_LOW
         2 = WC_REFILL_TO_HIGH

         1 / 2 時 Arduino 會強制鎖住兩支加熱棒
      */
      waterChangeState: {
        type: Number,
        default: 0
      },


      manualMode: {
        type: Number,
        default: 0
      },


      manualTimeoutLatched: {
        type: Number,
        default: 0
      },


      // =====================================================
      // Node 計算後的感測器分級結果
      // =====================================================

      grading: {
        type: mongoose.Schema.Types.Mixed,
        default: null
      }
    },
    {
      versionKey: false
    }
  );


/* =========================================================
   查詢最新資料用 Index
   ========================================================= */

SensorDataSchema.index({
  device_id: 1,
  timestamp: -1
});


module.exports =
  mongoose.model(
    "SensorData",
    SensorDataSchema
  );