require("dotenv").config();
const express = require("express");
const app = express();

require("./db");

app.use(express.json());
app.use("/api", require("./routes/ingest"));
app.use("/api", require("./routes/query"));

app.listen(5000, () => {
  console.log("🚀 Server running on 5000");
});
