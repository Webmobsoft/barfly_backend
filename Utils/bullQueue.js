// const Queue = require("bull");
// const client = require("../redis");
// const Event = require("../Models/Event");

// const eventQueue = new Queue("event-checker", {
//   redis: {
//     host: "127.0.0.1",
//     port: 6379,
//   },
// });

// eventQueue.process(async (job, done) => {
//   try {
//     const tomorrow = new Date();
//     tomorrow.setDate(tomorrow.getDate() + 1);
//     tomorrow.setHours(0, 0, 0, 0);

//     const dayAfter = new Date(tomorrow);
//     dayAfter.setDate(dayAfter.getDate() + 1);

//     const upcomingEvents = await Event.find({
//       from: { $gte: tomorrow, $lt: dayAfter },
//     });

//     if (upcomingEvents.length === 0) {
//       console.log("🌙 No events scheduled for tomorrow");
//       return done();
//     }

//     for (const event of upcomingEvents) {
//       const eventKey = `upcoming_event:${event._id}`;
//       await client.set(eventKey, JSON.stringify(event), "EX", 60 * 60 * 24); // 24h TTL
//       console.log(`✅ Cached tomorrow's event: ${event.eventName}`);
//     }

//     done();
//   } catch (err) {
//     console.error("❌ Error caching tomorrow's events:", err);
//     done(err);
//   }
// });

// module.exports = eventQueue;
