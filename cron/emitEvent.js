// // const cron = require("node-cron");
// // const { client } = require("../redis");
// // const dayjs = require("dayjs");
// // const { io } = require("../app"); // <- import io

// // cron.schedule("* * * * *", async () => {
// //   const today = dayjs().format("YYYY-MM-DD");
// //   const eventsJson = await client.get(`events:${today}`);
// //   if (!eventsJson) return;

// //   const events = JSON.parse(eventsJson);
// //   const now = new Date();

// //   events.forEach((event) => {
// //     if (dayjs(event.from).isSame(now, "minute")) {
// //       console.log("Emitting event now:", event);

// //       if (event.entityId) {
// //         io.to(event.entityId.toString()).emit("event-started", event);
// //       } else {
// //         io.emit("event-started", event);
// //       }
// //     }
// //   });
// // });

// // const redis = require("./../redis");
// // const dayjs = require("dayjs");
// // const client = require("../redis");

// // // const { client } = require("../redis");

// // // const client = redis.createClient();

// // // client.connect();

// // const emitOngoingEvents = async (io) => {
// //   const now = dayjs();
// //   const key = `${now.format("HH:mm")}-${now.add(1, "minute").format("HH:mm")}`;

// //   const eventsJson = await client.get(key);
// //   if (!eventsJson) return;

// //   const events = JSON.parse(eventsJson);

// //   for (const event of events) {
// //     const { entityId, eventId } = event;
// //     io.to(entityId.toString()).emit("eventStarted", event);
// //     console.log(`Event ${eventId} started, emitted to room ${entityId}`);
// //   }
// // };

// // module.exports = emitOngoingEvents;

// const client = require("../redis");

// const emitOngoingEvents = async (io) => {
//   try {
//     const now = new Date();
//     const currentTime = new Date(
//       now.getTime() + now.getTimezoneOffset() * 60000
//     ); // Convert to UTC
//     console.log("🕐 Current UTC Time:", currentTime.toISOString());

//     // 1. Get all cached upcoming event keys
//     const keys = await client.keys("upcoming_event:*");
//     console.log(`🔍 Found ${keys.length} upcoming cached events`);

//     for (const key of keys) {
//       const eventData = await client.get(key);
//       if (!eventData) continue;

//       const event = JSON.parse(eventData);
//       const eventStart = new Date(event.from);

//       const sameMinute =
//         eventStart.getUTCHours() === currentTime.getUTCHours() &&
//         eventStart.getUTCMinutes() === currentTime.getUTCMinutes();

//       if (sameMinute) {
//         console.log(
//           `🚀 Emitting event '${
//             event.eventName
//           }' at ${eventStart.toISOString()}`
//         );
//         io.to(event.entityId.toString()).emit("ongoingEvent", event);
//       } else {
//         console.log(
//           `⏳ Not time yet for '${
//             event.eventName
//           }' -> Starts at ${eventStart.toISOString()}`
//         );
//       }
//     }
//   } catch (err) {
//     console.error("❌ Error emitting ongoing events:", err);
//   }
// };

// module.exports = emitOngoingEvents;
