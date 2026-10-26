// Every minute: recompute every active counter's ordering state and announce
// the ones that changed by themselves (opening hours start or end, a timed
// pause runs out). Explicit changes (hours edit, pause, resume) are announced
// right away by emitCounterState, which also stores the snapshot compared here.
//
// One Bull repeatable job with a fixed id, so restarts and several processes
// never schedule it twice; Bull hands each run to a single worker.

const Queue = require("bull");
const Counter = require("../Models/Counter");
const EntityDetails = require("../Models/EntityDetails");
const redisClient = require("../redis");
const { STATUS } = require("./globalConstants");
const { getCounterState, resolveTimezone } = require("./ordering");
const {
  COUNTER_STATE_FIELDS,
  COUNTER_STATE_KEY_PREFIX,
  toStateSnapshot,
  emitCounterState,
} = require("../CustomerServices/orderingService");

const QUEUE_NAME = "counter-state-ticker";
const JOB_ID = "counter-state-tick";
const TICK_MS = 60 * 1000;

const redisOptions = () => ({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  ...(process.env.REDIS_USERNAME ? { username: process.env.REDIS_USERNAME } : {}),
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
});

const readSnapshots = async (counterIds) => {
  if (!counterIds.length || !redisClient.isOpen) return new Map();
  const values = await redisClient.mGet(
    counterIds.map((id) => `${COUNTER_STATE_KEY_PREFIX}${id}`),
  );
  return new Map(counterIds.map((id, index) => [id, values[index]]));
};

const storeSnapshot = async (counterId, snapshot) => {
  if (!redisClient.isOpen) return;
  await redisClient.set(`${COUNTER_STATE_KEY_PREFIX}${counterId}`, snapshot, {
    EX: 7 * 24 * 60 * 60,
  });
};

/**
 * One tick. A counter seen for the first time is only recorded (no emit),
 * so a deploy does not announce every counter.
 * @returns {Promise<string[]>} ids of the counters announced
 */
const runCounterStateTick = async ({ now = new Date() } = {}) => {
  const counters = await Counter.find(
    { status: STATUS.ACTIVE },
    COUNTER_STATE_FIELDS,
  ).lean();
  if (!counters.length) return [];

  const entityIds = [...new Set(counters.map((c) => String(c.entityId)))];
  const [entities, snapshots] = await Promise.all([
    EntityDetails.find({ _id: { $in: entityIds } }, { timezone: 1 }).lean(),
    readSnapshots(counters.map((c) => String(c._id))),
  ]);
  const timezones = new Map(
    entities.map((e) => [String(e._id), resolveTimezone(e.timezone)]),
  );

  const changed = [];
  for (const counter of counters) {
    const id = String(counter._id);
    const state = getCounterState({
      counter,
      now,
      timezone: timezones.get(String(counter.entityId)),
    });
    const snapshot = toStateSnapshot(state);
    const previous = snapshots.get(id);
    if (previous === snapshot) continue;
    if (previous == null) {
      // First sighting: remember it quietly.
      await storeSnapshot(id, snapshot);
      continue;
    }
    await emitCounterState(counter, { state });
    changed.push(id);
  }
  return changed;
};

let queue = null;

const startCounterStateTicker = async () => {
  if (queue) return queue;
  queue = new Queue(QUEUE_NAME, { redis: redisOptions() });
  queue.on("error", (error) =>
    console.error("Counter state ticker queue error:", error.message),
  );
  queue.process(async (job) => {
    const changed = await runCounterStateTick();
    return { changed: changed.length };
  });
  try {
    // Drop schedules left by an older interval, then (re)register ours.
    const repeatable = await queue.getRepeatableJobs();
    await Promise.all(
      repeatable
        .filter((job) => job.id === JOB_ID && Number(job.every) !== TICK_MS)
        .map((job) => queue.removeRepeatableByKey(job.key)),
    );
    await queue.add(
      {},
      {
        jobId: JOB_ID,
        repeat: { every: TICK_MS },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  } catch (error) {
    console.error("Could not schedule the counter state ticker:", error.message);
  }
  return queue;
};

module.exports = {
  QUEUE_NAME,
  startCounterStateTicker,
  runCounterStateTick,
};
