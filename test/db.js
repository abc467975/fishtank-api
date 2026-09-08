const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("MONGODB_URI (or MONGO_URI) must be set for database tests");
}

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error", err));

module.exports = mongoose;
  
