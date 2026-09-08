// utils/firebaseAdmin.js

require("dotenv").config();

const {
  initializeApp,
  applicationDefault,
  getApps
} = require("firebase-admin/app");

const {
  getMessaging
} = require("firebase-admin/messaging");

if (getApps().length === 0) {

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS 尚未設定"
    );
  }

  initializeApp({
    credential: applicationDefault()
  });

  console.log("✅ Firebase Admin SDK initialized");
  console.log(
    "📂 Firebase credential:",
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

module.exports = {
  messaging: getMessaging()
};