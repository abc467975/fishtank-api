const mongoose = require("mongoose");

const MONGO_URI =
  "mongodb+srv://abc467975:aA46797521@cluster0.7oj9nmn.mongodb.net/fish";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error", err));

module.exports = mongoose;
  