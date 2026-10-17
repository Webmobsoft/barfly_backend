const client = require("../redis");
const Event = require("../Models/Event");

// Caching upcoming events into Redis
const cacheUpcomingEvents = async () => {
  try {
    const now = new Date();
    const oneMinute = new Date(now.getTime() + 1 * 60000); // 5 minutes later

    const upcomingEvents = await Event.find({
      from: { $gte: now, $lte: oneMinute },
    });

    for (const event of upcomingEvents) {
      const eventKey = `upcoming_event:${event._id}`;

      // Cache the event with a 10-minute expiry
      await client.set(eventKey, JSON.stringify(event), "EX", 600);
      // console.log(`Cached upcoming event: ${event.eventName}`); // Noisy log
    }
  } catch (err) {
    console.error("Error caching upcoming events", err);
  }
};

module.exports = cacheUpcomingEvents;
