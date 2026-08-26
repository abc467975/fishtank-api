// ===============================
// POST /api/calibration
// ===============================
router.post("/calibration", async (req, res) => {
  try {
    console.log("POST /calibration received:", req.body);

    const {
      device_id = "default_device",
      calibration_mode,
      calibration_mode1,
      ph4_raw,
      ph7_raw,
      do_0_raw,
      do_100_raw
    } = req.body;

    const updateData = {
      updated_at: new Date()
    };

    // pH 校正模式
    if (calibration_mode !== undefined) {
      updateData.calibration_mode = calibration_mode;
    }

    // DO 校正模式
    if (calibration_mode1 !== undefined) {
      updateData.calibration_mode1 = calibration_mode1;
    }

    if (ph4_raw !== undefined) {
      updateData.ph4_raw = ph4_raw;
    }

    if (ph7_raw !== undefined) {
      updateData.ph7_raw = ph7_raw;
    }

    if (do_0_raw !== undefined) {
      updateData.do_0_raw = do_0_raw;
    }

    if (do_100_raw !== undefined) {
      updateData.do_100_raw = do_100_raw;
    }

    // ===============================
    // 新資料預設值
    // ===============================
    const insertData = {
      device_id,
      calibration_mode: false,
      calibration_mode1: false,
      ph4_raw: 0,
      ph7_raw: 0,
      do_0_raw: 0,
      do_100_raw: 0
    };

    // ⭐ 防止 $set 和 $setOnInsert 欄位衝突
    Object.keys(updateData).forEach((key) => {
      delete insertData[key];
    });

    const doc = await Calibration.findOneAndUpdate(
      { device_id },
      {
        $set: updateData,
        $setOnInsert: insertData
      },
      {
        new: true,
        upsert: true
      }
    ).lean();

    console.log("✅ Calibration DB updated:", doc);

    // MQTT 優先
    const mqttOk = await publishJson(
      topicCalibration(),
      doc,
      {
        qos: 1,
        retain: true
      }
    );

    // MQTT 失敗才用 WebSocket 備援
    if (!mqttOk) {
      console.log("⚠️ MQTT calibration failed，改用 WebSocket 備援");
      broadcastCalibration(doc);
    }

    res.json({
      success: true,
      message: mqttOk
        ? "校正資料更新成功，已透過 MQTT 推送"
        : "校正資料更新成功，已透過 WebSocket 備援推送",
      mqttOk,
      websocketClients: getClientCount(),
      data: doc
    });

  } catch (error) {
    console.error("POST /calibration error:", error);

    res.status(500).json({
      success: false,
      message: "更新校正資料失敗",
      error: error.message
    });
  }
});