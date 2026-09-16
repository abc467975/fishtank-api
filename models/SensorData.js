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
      // =====================================================

      T1: Number,

      T2: Number,

      T3: Number,

      T4: Number,


      // Arduino 已算好的平均溫度
      TempAvg: Number,


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
      pH_value: Number,


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
      DO: Number,


      /*
         正式 DO 濃度
         單位：mg/L

         例如：
         7.82
      */
      DO_value: Number,


      /*
         DO 飽和度
         Arduino 已經乘以 100 再上傳。

         例如：
         98.3 = 98.3 %
      */
      DO_saturation: Number,


      /*
         LDO 感測器本身的內建溫度。

         例如：
         26.90 °C
      */
      DO_sensor_temp: Number,


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

      tankHeaterOn: Number,

      bucketHeaterOn: Number,

      waterChangeState: Number,

      manualMode: Number,

      manualTimeoutLatched: Number,


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