const Queue = require("bull");

const emitEventQueue = new Queue("emit-event", {
  redis: { host: "127.0.0.1", port: 6379 },
});

const scheduleEmit = (event) => {
  const delay = new Date(event.from).getTime() - Date.now();

  if (delay > 0) {
    // console.log(`Scheduling emit for event "${event.eventName}" (ID: ${event._id}) in ${delay}ms at ${event.from}`); // Noisy log

    emitEventQueue.add(
      { event },
      {
        delay,
        removeOnComplete: true,
        removeOnFail: true,
      }
    );
  } else {
    console.warn(
      `⚠️ Skipping emit schedule. Event "${event.eventName}" (ID: ${event._id}) is in the past or starting now.`
    );
  }
};

module.exports = { emitEventQueue, scheduleEmit };
