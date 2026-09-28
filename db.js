const mongoose = require("mongoose");

mongoose
  .connect(process.env.DB_URI, {
    authSource: "admin",
    dbName: process.env.DB_NAME,
    keepAlive: true,
    poolSize: 10,
    // replicaSet: process.env.DB_RS || "Cluster0-shard-0",
    useCreateIndex: true,
    useFindAndModify: false,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    w: "majority",
  })
  .then(() => console.log("Db Connected Successfully to:", process.env.DB_NAME))
  .catch((e) => {
    console.error(e);
    throw new Error("Error Occurred!");
  });
