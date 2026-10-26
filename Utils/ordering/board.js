// Order board layout: ASAP tickets on top, then one row per pickup slot.
// Pure functions: they take orders that are already loaded and a clock.

const { MINUTE_MS, getLocalParts, zonedTimeToDate } = require("./time");
const { SLOT_LENGTH_MINUTES, DEFAULT_PREP_TIME_MINUTES } = require("./counterState");

const SLOT_ROW_STATES = {
  OVERDUE: "overdue", // pickup window is over, orders still open
  RUNNING: "running", // pickup window is now
  UPCOMING: "upcoming",
};

const ROW_STATE_ORDER = [
  SLOT_ROW_STATES.OVERDUE,
  SLOT_ROW_STATES.RUNNING,
  SLOT_ROW_STATES.UPCOMING,
];

const toMs = (value) => new Date(value).getTime();

const isSlotOrder = (order) =>
  order?.pickupMode === "slot" &&
  Boolean(order.pickupSlotStart) &&
  Number.isFinite(toMs(order.pickupSlotStart));

/**
 * Where a pickup slot stands at `now`.
 * running: start <= now < end (minutesLeft until the end),
 * overdue: now >= end, upcoming: now < start (startsInMinutes).
 */
const getSlotRowState = ({ start, end, now = new Date() }) => {
  const nowMs = toMs(now);
  const startMs = toMs(start);
  const endMs = toMs(end);
  if (nowMs >= endMs) return { state: SLOT_ROW_STATES.OVERDUE };
  if (nowMs >= startMs) {
    return {
      state: SLOT_ROW_STATES.RUNNING,
      minutesLeft: Math.ceil((endMs - nowMs) / MINUTE_MS),
    };
  }
  return {
    state: SLOT_ROW_STATES.UPCOMING,
    startsInMinutes: Math.ceil((startMs - nowMs) / MINUTE_MS),
  };
};

// When the kitchen should start on a slot: its start minus the prep time.
const getPrepareFrom = (start, prepTimeMinutes) => {
  const prep = Number(prepTimeMinutes);
  const minutes =
    Number.isFinite(prep) && prep >= 0 ? prep : DEFAULT_PREP_TIME_MINUTES;
  return new Date(toMs(start) - minutes * MINUTE_MS);
};

const getAgeMinutes = (createdAt, now = new Date()) =>
  Math.max(Math.floor((toMs(now) - toMs(createdAt)) / MINUTE_MS), 0);

// Open orders older than this stay off the board (see getBoardSince).
const BOARD_LATE_NIGHT_HOURS = 6;

/**
 * Oldest order time the board still shows: midnight today in the venue's
 * timezone, or `BOARD_LATE_NIGHT_HOURS` ago when that is earlier, so a bar's
 * orders from before midnight stay visible in the small hours. Open orders
 * from earlier days would otherwise sit on the board as overdue forever.
 * An order's time is its pickup slot start, or createdAt for ASAP orders.
 */
const getBoardSince = ({ now = new Date(), timezone } = {}) => {
  const midnight = zonedTimeToDate(getLocalParts(now, timezone), 0, timezone);
  const lateNight = toMs(now) - BOARD_LATE_NIGHT_HOURS * 60 * MINUTE_MS;
  return new Date(Math.min(midnight.getTime(), lateNight));
};

const byCreatedAt = (a, b) => toMs(a.createdAt) - toMs(b.createdAt);

/**
 * @param orders  board orders (already filtered by status / counter)
 * @param counters Map<counterId, { prepTimeMinutes, ordersPerSlot }>
 * @param bookedCounts Map<counterId, Map<slotStartMs, number>>
 * @returns {{ asap: object[], slots: object[] }}
 *
 * Several counters in one row (the "All" view): `booked` and `limit` are the
 * sums over the counters that have orders in the row (`limit` is null as soon
 * as one of them has no limit), `prepareFrom` uses the longest prep time.
 */
const buildBoard = ({
  orders = [],
  counters = new Map(),
  bookedCounts = new Map(),
  now = new Date(),
  slotLengthMinutes = SLOT_LENGTH_MINUTES,
}) => {
  const asap = orders
    .filter((order) => !isSlotOrder(order))
    .sort(byCreatedAt)
    .map((order) => ({ ...order, ageMinutes: getAgeMinutes(order.createdAt, now) }));

  const rows = new Map();
  orders.filter(isSlotOrder).forEach((order) => {
    const startMs = toMs(order.pickupSlotStart);
    if (!rows.has(startMs)) rows.set(startMs, { startMs, orders: [], counterIds: new Set() });
    const row = rows.get(startMs);
    row.orders.push(order);
    if (order.counterId) row.counterIds.add(String(order.counterId));
  });

  const slots = [...rows.values()].map((row) => {
    const lengthMs =
      (Number(row.orders[0].pickupSlotLength) || slotLengthMinutes) * MINUTE_MS;
    const start = new Date(row.startMs);
    const end = new Date(row.startMs + lengthMs);
    const counterIds = [...row.counterIds];

    let limit = 0;
    let booked = 0;
    let prep = null;
    counterIds.forEach((counterId) => {
      const counter = counters.get(counterId) || {};
      const perSlot = Number(counter.ordersPerSlot) || 0;
      limit = limit === null || perSlot <= 0 ? null : limit + perSlot;
      booked += bookedCounts.get(counterId)?.get(row.startMs) || 0;
      const counterPrep = Number.isFinite(Number(counter.prepTimeMinutes))
        ? Number(counter.prepTimeMinutes)
        : DEFAULT_PREP_TIME_MINUTES;
      prep = prep === null ? counterPrep : Math.max(prep, counterPrep);
    });
    if (!counterIds.length) limit = null;

    return {
      start,
      end,
      ...getSlotRowState({ start, end, now }),
      prepareFrom: getPrepareFrom(start, prep),
      booked: Math.max(booked, row.orders.length),
      limit,
      orders: row.orders.sort(byCreatedAt),
    };
  });

  slots.sort(
    (a, b) =>
      ROW_STATE_ORDER.indexOf(a.state) - ROW_STATE_ORDER.indexOf(b.state) ||
      a.start - b.start,
  );

  return { asap, slots };
};

module.exports = {
  SLOT_ROW_STATES,
  getSlotRowState,
  getPrepareFrom,
  getAgeMinutes,
  getBoardSince,
  buildBoard,
};
