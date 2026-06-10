// utils/firebaseAdmin.js
1
require("dotenv").config();

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

if (getApps().length === 0) {
  // 從 Render Secret 讀取 JSON 字串並解析
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  initializeApp({
    credential: cert(serviceAccount)
  });

  console.log("✅ Firebase Admin SDK initialized");
}

module.exports = { messaging: getMessaging() };