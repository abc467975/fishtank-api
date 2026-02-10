const mongoose = require("mongoose");

/**
 * 連線 MongoDB
 * 只做一件事：用 process.env.MONGO_URI 連線
 */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

module.exports = mongoose;
