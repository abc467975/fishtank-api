require("dotenv").config();
const express = require("express");
const app = express();

function verifyApiKey(req, res, next) {
  const clientKey = req.headers["x-api-key"];

  if (!clientKey || clientKey !== process.env.API_KEY) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  next();
}

require("./db");
//確任連線OK
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use(express.json());
app.use("/api", verifyApiKey, require("./routes/ingest"));
app.use("/api", verifyApiKey, require("./routes/query"));

app.listen(5000, () => {
  console.log("🚀 Server running on 5000");
});
