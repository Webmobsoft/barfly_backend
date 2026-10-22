// The single source of truth for "can a guest order at this counter now?".
// Replaces the three copies of the Events live-check. Pure functions: they
// take the counter document and a clock, never touch the database.

const {
  MINUTE_MS,
  resolveTimezone,
  getLocalParts,
  zonedTimeToDate,
  addDays,
  parseHHmm,
} = require("./time");

const ORDER_MODES = {
  LIVE: "live",
  PREORDER: "preorder",
  BOTH: "both",
};

const PAUSE_KINDS = {
  MIN_15: "15m",
  MIN_30: "30m",
  MANUAL: "manual",
  TODAY: "today",
};

const COUNTER_STATES = {
  OPEN: "open",
  PREORDER: "preorder",
  PAUSED: "paused",
  UPCOMING: "upcoming",
  NO_HOURS: "no_hours",
  UNAVAILABLE: "unavailable",
};

const SLOT_LENGTH_MINUTES = 15;
const DEFAULT_PREP_TIME_MINUTES = 10;
const MAX_BLOCKS_PER_DAY = 2;
const LOOKAHEAD_DAYS = 7;

const getPrepTime = (counter) => {
  const prep = Number(counter?.prepTimeMinutes);
  return Number.isFinite(prep) && prep >= 0 ? prep : DEFAULT_PREP_TIME_MINUTES;
};

const getDayEntry = (counter, weekday) =>
  (counter?.openingHours || []).find((entry) => entry?.day === weekday);

const hasAnyHours = (counter) =>
  (counter?.openingHours || []).some(
    (entry) => entry?.enabled && (entry.blocks || []).length > 0,
  );

// Concrete instants for one block on one local date.
const buildBlockInstance = (block, localDate, timezone, prepMinutes) => {
  const fromMin = parseHHmm(block.pickupFrom);
  let toMin = parseHHmm(block.pickupTo);
  if (fromMin === null || toMin === null) return null;
  if (toMin <= fromMin) toMin += 24 * 60; // runs past midnight

  const pickupStart = zonedTimeToDate(localDate, fromMin, timezone);
  const pickupEnd = zonedTimeToDate(localDate, toMin, timezone);
  const dayStart = zonedTimeToDate(localDate, 0, timezone);

  const asapEnd = new Date(pickupEnd.getTime() - prepMinutes * MINUTE_MS);
  const asapWindow =
    block.mode === ORDER_MODES.LIVE || block.mode === ORDER_MODES.BOTH
      ? asapEnd > pickupStart
        ? { start: pickupStart, end: asapEnd }
        : null
      : null;

  const slotWindows = [];
  if (block.mode === ORDER_MODES.PREORDER || block.mode === ORDER_MODES.BOTH) {
    const cutoffMin = parseHHmm(block.orderCutoff);
    const cutoffAt =
      cutoffMin === null
        ? pickupStart
        : zonedTimeToDate(localDate, cutoffMin, timezone);
    if (cutoffAt > dayStart) {
      slotWindows.push({ start: dayStart, end: cutoffAt });
    }
    // "Both" keeps offering later slots while it serves on the spot.
    if (block.mode === ORDER_MODES.BOTH && asapWindow) {
      slotWindows.push(asapWindow);
    }
  }

  return {
    blockId: block._id ? String(block._id) : undefined,
    name: block.name || "",
    mode: block.mode,
    pickupStart,
    pickupEnd,
    asapWindow,
    slotWindows,
  };
};

const getBlockInstances = (counter, now, timezone, prepMinutes) => {
  const today = getLocalParts(now, timezone);
  const instances = [];
  // Start one day back so a block that started yesterday and runs past
  // midnight is still seen.
  for (let offset = -1; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const localDate = addDays(today, offset);
    const entry = getDayEntry(counter, localDate.weekday);
    if (!entry?.enabled) continue;
    (entry.blocks || []).forEach((block) => {
      const instance = buildBlockInstance(
        block,
        localDate,
        timezone,
        prepMinutes,
      );
      if (instance) instances.push(instance);
    });
  }
  return instances;
};

const contains = (window, at) =>
  Boolean(window) && at >= window.start && at < window.end;

const getActivePause = (pause, now) => {
  if (!pause?.kind) return null;
  if (pause.kind === PAUSE_KINDS.MANUAL && !pause.until) {
    return { kind: pause.kind, until: null };
  }
  if (pause.until && new Date(pause.until) > now) {
    return { kind: pause.kind, until: new Date(pause.until) };
  }
  return null;
};

const computePauseUntil = (kind, now, timezone) => {
  const tz = resolveTimezone(timezone);
  switch (kind) {
    case PAUSE_KINDS.MIN_15:
      return new Date(now.getTime() + 15 * MINUTE_MS);
    case PAUSE_KINDS.MIN_30:
      return new Date(now.getTime() + 30 * MINUTE_MS);
    case PAUSE_KINDS.TODAY:
      return zonedTimeToDate(addDays(getLocalParts(now, tz), 1), 0, tz);
    case PAUSE_KINDS.MANUAL:
      return null;
    default:
      return undefined;
  }
};

// Every 15-minute window a guest could book right now, ignoring capacity.
const getCandidateSlots = (instances, now, prepMinutes) => {
  const earliestStart = now.getTime() + prepMinutes * MINUTE_MS;
  const slots = new Map();
  instances
    .filter((instance) =>
      instance.slotWindows.some((window) => contains(window, now)),
    )
    .forEach((instance) => {
      const slotMs = SLOT_LENGTH_MINUTES * MINUTE_MS;
      for (
        let start = instance.pickupStart.getTime();
        start + slotMs <= instance.pickupEnd.getTime();
        start += slotMs
      ) {
        if (start < earliestStart) continue;
        if (!slots.has(start)) {
          slots.set(start, {
            start: new Date(start),
            end: new Date(start + slotMs),
          });
        }
      }
    });
  return [...slots.values()].sort((a, b) => a.start - b.start);
};

const getNextOpening = (instances, now) => {
  let next = null;
  instances.forEach((instance) => {
    const candidates = [];
    if (instance.asapWindow) {
      candidates.push({ at: instance.asapWindow.start, kind: "asap" });
    }
    instance.slotWindows.forEach((window) =>
      candidates.push({ at: window.start, kind: "preorder" }),
    );
    candidates.forEach((candidate) => {
      if (candidate.at > now && (!next || candidate.at < next.at)) {
        next = { ...candidate, pickupFrom: instance.pickupStart };
      }
    });
  });
  return next;
};

/**
 * Ordering state of one counter at `now`.
 * @returns {{ state, acceptsAsap, acceptsSlots, openUntil, pickupFrom,
 *   nextOpening, pausedUntil, pauseKind, prepTimeMinutes, timezone }}
 */
const getCounterState = ({ counter, now = new Date(), timezone }) => {
  const tz = resolveTimezone(timezone);
  const prepTimeMinutes = getPrepTime(counter);
  const base = {
    acceptsAsap: false,
    acceptsSlots: false,
    openUntil: null,
    pickupFrom: null,
    nextOpening: null,
    pausedUntil: null,
    pauseKind: null,
    prepTimeMinutes,
    timezone: tz,
  };

  if (counter?.status && counter.status !== "Active") {
    return { ...base, state: COUNTER_STATES.UNAVAILABLE };
  }
  if (!hasAnyHours(counter)) {
    return { ...base, state: COUNTER_STATES.NO_HOURS };
  }

  const instances = getBlockInstances(counter, now, tz, prepTimeMinutes);
  const nextOpening = getNextOpening(instances, now);
  const pause = getActivePause(counter.pause, now);
  if (pause) {
    return {
      ...base,
      state: COUNTER_STATES.PAUSED,
      nextOpening,
      pausedUntil: pause.until,
      pauseKind: pause.kind,
    };
  }

  const asapInstance = instances.find((instance) =>
    contains(instance.asapWindow, now),
  );
  const candidateSlots = getCandidateSlots(instances, now, prepTimeMinutes);
  const acceptsAsap = Boolean(asapInstance);
  const acceptsSlots = candidateSlots.length > 0;

  if (acceptsAsap) {
    return {
      ...base,
      state: COUNTER_STATES.OPEN,
      acceptsAsap,
      acceptsSlots,
      openUntil: asapInstance.asapWindow.end,
      pickupFrom: asapInstance.pickupStart,
      nextOpening,
    };
  }
  if (acceptsSlots) {
    return {
      ...base,
      state: COUNTER_STATES.PREORDER,
      acceptsSlots,
      pickupFrom: candidateSlots[0].start,
      nextOpening,
    };
  }
  return { ...base, state: COUNTER_STATES.UPCOMING, nextOpening };
};

/**
 * Free 15-minute pickup windows a guest can book now.
 * @param bookedCounts Map<slotStartMs, number> of orders already holding a slot.
 */
const getAvailableSlots = ({
  counter,
  now = new Date(),
  timezone,
  bookedCounts = new Map(),
}) => {
  const state = getCounterState({ counter, now, timezone });
  if (state.state === COUNTER_STATES.PAUSED || !state.acceptsSlots) return [];
  const instances = getBlockInstances(
    counter,
    now,
    state.timezone,
    state.prepTimeMinutes,
  );
  const limit = Number(counter?.ordersPerSlot) || 0;
  return getCandidateSlots(instances, now, state.prepTimeMinutes)
    .map((slot) => {
      const booked = bookedCounts.get(slot.start.getTime()) || 0;
      return {
        ...slot,
        booked,
        remaining: limit > 0 ? Math.max(limit - booked, 0) : null,
      };
    })
    .filter((slot) => slot.remaining === null || slot.remaining > 0);
};

// Entity-level state for the guest's restaurant card: open if any counter is.
const STATE_PRIORITY = [
  COUNTER_STATES.OPEN,
  COUNTER_STATES.PREORDER,
  COUNTER_STATES.PAUSED,
  COUNTER_STATES.UPCOMING,
  COUNTER_STATES.NO_HOURS,
  COUNTER_STATES.UNAVAILABLE,
];

const getEntityState = (counterStates) => {
  if (!counterStates.length) {
    return { state: COUNTER_STATES.NO_HOURS, nextOpening: null };
  }
  const best = [...counterStates].sort(
    (a, b) => STATE_PRIORITY.indexOf(a.state) - STATE_PRIORITY.indexOf(b.state),
  )[0];
  const nextOpening = counterStates
    .map((state) => state.nextOpening)
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)[0];
  return {
    state: best.state,
    acceptsAsap: counterStates.some((state) => state.acceptsAsap),
    acceptsSlots: counterStates.some((state) => state.acceptsSlots),
    openUntil: best.openUntil || null,
    pickupFrom: best.pickupFrom || null,
    pausedUntil: best.pausedUntil || null,
    pauseKind: best.pauseKind || null,
    nextOpening: nextOpening || null,
  };
};

module.exports = {
  ORDER_MODES,
  PAUSE_KINDS,
  COUNTER_STATES,
  SLOT_LENGTH_MINUTES,
  DEFAULT_PREP_TIME_MINUTES,
  MAX_BLOCKS_PER_DAY,
  hasAnyHours,
  getCounterState,
  getAvailableSlots,
  getEntityState,
  getActivePause,
  computePauseUntil,
};
