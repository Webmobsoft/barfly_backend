// Database side of the ordering rules: loads what Utils/ordering needs,
// counts booked slots, hands out order numbers and broadcasts state changes.

const mongoose = require("mongoose");
const Counter = require("../Models/Counter");
const EntityDetails = require("../Models/EntityDetails");
const Order = require("../Models/Order");
const Sequence = require("../Models/Sequence");
const { ORDER_STATUS, STATUS } = require("../Utils/globalConstants");
const { getIo } = require("../Utils/socket");
const {
  getCounterState,
  getAvailableSlots,
  getEntityState,
  resolveTimezone,
  SLOT_LENGTH_MINUTES,
} = require("../Utils/ordering");

// A Wallee payment that never resolves stops holding its slot after this.
const PAYMENT_PROCESSING_HOLD_MS = 30 * 60 * 1000;

const COUNTER_STATE_FIELDS =
  "counterName entityId status isSelfPickUp isTableService openingHours prepTimeMinutes ordersPerSlot pause";

const getEntityTimezone = async (entityId) => {
  const entity = await EntityDetails.findById(entityId, { timezone: 1 }).lean();
  return resolveTimezone(entity?.timezone);
};

// Orders holding a slot: everything except failed/cancelled payments, and
// Payment Processing only while it is recent.
const slotHoldingFilter = (now) => ({
  pickupMode: "slot",
  $or: [
    {
      status: {
        $nin: [
          ORDER_STATUS.PAYMENT_FAILED,
          ORDER_STATUS.CANCELLED,
          ORDER_STATUS.PAYMENT_PROCESSING,
        ],
      },
    },
    {
      status: ORDER_STATUS.PAYMENT_PROCESSING,
      createdAt: { $gte: new Date(now.getTime() - PAYMENT_PROCESSING_HOLD_MS) },
    },
  ],
});

const getBookedCounts = async ({ counterId, now = new Date(), session }) => {
  const query = Order.aggregate([
    {
      $match: {
        counterId: mongoose.Types.ObjectId(String(counterId)),
        pickupSlotStart: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        ...slotHoldingFilter(now),
      },
    },
    { $group: { _id: "$pickupSlotStart", count: { $sum: 1 } } },
  ]);
  if (session) query.session(session);
  const rows = await query;
  return new Map(rows.map((row) => [new Date(row._id).getTime(), row.count]));
};

const getCounterStateFor = async (counter, { now = new Date(), timezone } = {}) =>
  getCounterState({
    counter,
    now,
    timezone: timezone || (await getEntityTimezone(counter.entityId)),
  });

// `bookedCounts` may be passed in when the caller already started that query.
const getSlotsFor = async (
  counter,
  { now = new Date(), timezone, session, bookedCounts } = {},
) => {
  const booked = () =>
    bookedCounts || getBookedCounts({ counterId: counter._id, now, session });
  let tz = timezone;
  let counts;
  if (session) {
    // Inside a transaction the operations must run one after another.
    tz = tz || (await getEntityTimezone(counter.entityId));
    counts = await booked();
  } else {
    [tz, counts] = await Promise.all([
      tz || getEntityTimezone(counter.entityId),
      booked(),
    ]);
  }
  return getAvailableSlots({ counter, now, timezone: tz, bookedCounts: counts });
};

// State of every active counter of the given entities, keyed by entity id.
const getEntityStates = async (entityIds, { now = new Date() } = {}) => {
  const [counters, entities] = await Promise.all([
    Counter.find(
      { entityId: { $in: entityIds }, status: STATUS.ACTIVE },
      COUNTER_STATE_FIELDS,
    ).lean(),
    EntityDetails.find({ _id: { $in: entityIds } }, { timezone: 1 }).lean(),
  ]);
  const timezones = new Map(
    entities.map((entity) => [String(entity._id), resolveTimezone(entity.timezone)]),
  );
  const byEntity = new Map();
  counters.forEach((counter) => {
    const key = String(counter.entityId);
    const state = getCounterState({
      counter,
      now,
      timezone: timezones.get(key),
    });
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key).push(state);
  });
  const result = new Map();
  entityIds.forEach((entityId) => {
    const key = String(entityId);
    result.set(key, getEntityState(byEntity.get(key) || []));
  });
  return result;
};

// Next order number of an entity, atomic. The first call seeds the sequence
// from the highest existing token so numbering continues where it was.
const nextTokenNumber = async (entityId, session) => {
  const key = `order:${entityId}`;
  const options = { new: true, ...(session ? { session } : {}) };
  const bumped = await Sequence.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    options,
  );
  if (bumped) return bumped.value;

  // Seed inside the same session: a document written outside the
  // transaction is not visible to it.
  const lastQuery = Order.findOne({ entityId }, { tokenNumber: 1 })
    .sort({ tokenNumber: -1 })
    .lean();
  if (session) lastQuery.session(session);
  const last = await lastQuery;
  const seeded = await Sequence.findOneAndUpdate(
    { key },
    { $setOnInsert: { value: (last?.tokenNumber || 0) + 1 } },
    { ...options, upsert: true, rawResult: true },
  );
  if (!seeded.lastErrorObject?.updatedExisting) return seeded.value.value;
  // Seeded by a parallel request in the meantime: take the next number.
  const next = await Sequence.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    options,
  );
  return next.value;
};

// Serialises create-order per counter: concurrent transactions writing the
// same document conflict, and withTransaction retries the loser.
const lockCounterForOrder = (counterId, session) =>
  Counter.updateOne(
    { _id: counterId },
    { $inc: { orderLockVersion: 1 } },
    { session },
  );

const serializeState = (state) => ({
  ...state,
  openUntil: state.openUntil || null,
  pickupFrom: state.pickupFrom || null,
  pausedUntil: state.pausedUntil || null,
  nextOpening: state.nextOpening
    ? {
        at: state.nextOpening.at,
        kind: state.nextOpening.kind,
        pickupFrom: state.nextOpening.pickupFrom,
        blockName: state.nextOpening.blockName || null,
      }
    : null,
});

// What the minute ticker compares to decide whether a counter changed.
const COUNTER_STATE_KEY_PREFIX = "counterState:";
const COUNTER_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;

const toStateSnapshot = (state) =>
  JSON.stringify({
    state: state.state,
    acceptsAsap: Boolean(state.acceptsAsap),
    acceptsSlots: Boolean(state.acceptsSlots),
    pausedUntil: state.pausedUntil
      ? new Date(state.pausedUntil).toISOString()
      : null,
  });

const saveStateSnapshot = async (counterId, snapshot) => {
  try {
    // Required lazily: the rules tests load this file without Redis.
    const redisClient = require("../redis");
    if (!redisClient.isOpen) return;
    await redisClient.set(`${COUNTER_STATE_KEY_PREFIX}${counterId}`, snapshot, {
      EX: COUNTER_STATE_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Could not store counter state snapshot", error.message);
  }
};

// Silent push so apps that are closed or in the background learn it too.
const notifyCounterState = (counter, state) => {
  // Required lazily: the rules tests load this file without Firebase.
  const { sendFirebaseNotification } = require("../Utils/commonFunction");
  const data = {
    action: "counter_state_update",
    entityId: String(counter.entityId),
    counterId: String(counter._id),
    state: state.state,
  };
  [
    "customer_entity",
    `owner_entity_${counter.entityId}`,
  ].forEach((topic) =>
    sendFirebaseNotification({
      topic,
      showNotification: false,
      data: { ...data, topic },
    }),
  );
};

// Tell the restaurant's boards and every guest app that a counter changed:
// socket to the entity and public rooms, plus a silent push. Used by the
// ticker and right after pause, resume, hours and slot-limit edits.
// `state` may be passed when the caller already computed it (the ticker).
const emitCounterState = async (counter, { state: knownState } = {}) => {
  const io = getIo();
  if (!counter) return;
  const state = knownState || (await getCounterStateFor(counter));
  // Remember what was announced so the ticker does not repeat it.
  await saveStateSnapshot(String(counter._id), toStateSnapshot(state));
  try {
    notifyCounterState(counter, state);
  } catch (error) {
    console.error("Could not push counter state", error.message);
  }
  if (!io) return;
  const payload = {
    entityId: String(counter.entityId),
    counterId: String(counter._id),
    ...serializeState(state),
  };
  io.to(String(counter.entityId)).emit("counterStateChanged", payload);
  io.to("public").emit("counterStateChanged", payload);
};

// Lets boards and the guest's app patch one order instead of reloading.
// Sent on paid (webhook), every status change and both cancel paths.
const emitOrderUpdated = (order, status = order?.status) => {
  const io = getIo();
  if (!io || !order) return;
  const entityId = String(order.entityId?._id || order.entityId);
  const userId = order.userId?._id || order.userId;
  const payload = {
    entityId,
    orderId: String(order._id),
    status,
    counterId: order.counterId ? String(order.counterId?._id || order.counterId) : null,
  };
  io.to(entityId).emit("orderUpdated", payload);
  if (userId) io.to(`user_${userId}`).emit("orderUpdated", payload);
};

module.exports = {
  SLOT_LENGTH_MINUTES,
  COUNTER_STATE_FIELDS,
  getEntityTimezone,
  getBookedCounts,
  getCounterStateFor,
  getSlotsFor,
  getEntityStates,
  nextTokenNumber,
  lockCounterForOrder,
  serializeState,
  emitCounterState,
  emitOrderUpdated,
  toStateSnapshot,
  COUNTER_STATE_KEY_PREFIX,
};
