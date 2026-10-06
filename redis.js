const redis = require("redis");
const redisCredentials = {
  url: "redis://localhost:6379",
};
if (process.env.REDIS_USERNAME)
  redisCredentials.username = process.env.REDIS_USERNAME;
if (process.env.REDIS_PASSWORD)
  redisCredentials.password = process.env.REDIS_PASSWORD;

const client = redis.createClient(redisCredentials);

client.on("error", (err) => {
  console.error("Redis error: ", err);
});

client
  .connect()
  .then(() => {
    console.info("-------------REDIS CONNECTED SUCCESSFULLY----------------");
  })
  .catch((error) => {
    console.error("--------------REDIS CONNECTION ERROR-------------");
  });

module.exports = client;
