// const cron = require("node-cron");
// const emitOngoingEvents = require("./emitEvent");
// const eventQueue = require("../Utils/bullQueue");

// let ioInstance = null;

// const setupCron = (io) => {
//   ioInstance = io;

//   cron.schedule("0 0 * * *", async () => {
//     console.log("Running midnight cron to emit and cache events...");

//     emitOngoingEvents(ioInstance);

//     await eventQueue.add(
//       {},
//       {
//         removeOnComplete: true,
//         removeOnFail: true,
//       }
//     );
//   });
// };

// module.exports = setupCron;
