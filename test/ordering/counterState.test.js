const test = require("node:test");
const assert = require("node:assert/strict");

const {
  zonedTimeToDate,
  getCounterState,
  getAvailableSlots,
  getEntityState,
  compareForGuestList,
  computePauseUntil,
  COUNTER_STATES,
} = require("../../Utils/ordering");

const TZ = "Europe/Zurich";
// Wednesday 21 Oct 2026 (CEST, UTC+2).
const at = (hhmm, date = { year: 2026, month: 10, day: 21 }) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToDate(date, h * 60 + m, TZ);
};

const everyDay = (block) =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    enabled: true,
    blocks: [block],
  }));

const counterWith = (block, extra = {}) => ({
  status: "Active",
  prepTimeMinutes: 10,
  openingHours: everyDay(block),
  ...extra,
});

const LUNCH = { pickupFrom: "11:30", pickupTo: "13:30" };

test("time: wall clock converts to the right UTC instant across DST", () => {
  assert.equal(at("11:30").toISOString(), "2026-10-21T09:30:00.000Z");
  // Clocks go back on Sunday 25 Oct 2026 at 03:00.
  assert.equal(
    at("11:30", { year: 2026, month: 10, day: 25 }).toISOString(),
    "2026-10-25T10:30:00.000Z",
  );
  // Clocks go forward on Sunday 28 Mar 2027 at 02:00.
  assert.equal(
    at("11:30", { year: 2027, month: 3, day: 28 }).toISOString(),
    "2027-03-28T09:30:00.000Z",
  );
});

test("live: orders only during pickup, until prep time before it ends", () => {
  const counter = counterWith({ ...LUNCH, mode: "live" });

  const before = getCounterState({ counter, now: at("11:29"), timezone: TZ });
  assert.equal(before.state, COUNTER_STATES.UPCOMING);
  assert.equal(before.nextOpening.kind, "asap");
  assert.equal(before.nextOpening.at.getTime(), at("11:30").getTime());

  const open = getCounterState({ counter, now: at("11:30"), timezone: TZ });
  assert.equal(open.state, COUNTER_STATES.OPEN);
  assert.equal(open.acceptsAsap, true);
  assert.equal(open.acceptsSlots, false);
  assert.equal(open.openUntil.getTime(), at("13:20").getTime());

  const late = getCounterState({ counter, now: at("13:20"), timezone: TZ });
  assert.equal(late.state, COUNTER_STATES.UPCOMING);
  assert.equal(
    late.nextOpening.at.getTime(),
    at("11:30", { year: 2026, month: 10, day: 22 }).getTime(),
  );
});

test("pre-order only: slots from 00:00 until the cut-off, none after", () => {
  const counter = counterWith({
    ...LUNCH,
    mode: "preorder",
    orderCutoff: "11:00",
  });

  const morning = getCounterState({ counter, now: at("08:00"), timezone: TZ });
  assert.equal(morning.state, COUNTER_STATES.PREORDER);
  assert.equal(morning.acceptsAsap, false);
  assert.equal(morning.pickupFrom.getTime(), at("11:30").getTime());

  const slots = getAvailableSlots({ counter, now: at("08:00"), timezone: TZ });
  assert.equal(slots.length, 8);
  assert.equal(slots[0].start.getTime(), at("11:30").getTime());
  assert.equal(slots[7].end.getTime(), at("13:30").getTime());

  const afterCutoff = getCounterState({
    counter,
    now: at("11:00"),
    timezone: TZ,
  });
  assert.equal(afterCutoff.state, COUNTER_STATES.UPCOMING);
  assert.equal(
    getAvailableSlots({ counter, now: at("12:10"), timezone: TZ }).length,
    0,
  );
});

test("both: pre-order, a preparation break, then ASAP plus later slots", () => {
  const counter = counterWith({ ...LUNCH, mode: "both", orderCutoff: "11:00" });

  assert.equal(
    getCounterState({ counter, now: at("10:59"), timezone: TZ }).state,
    COUNTER_STATES.PREORDER,
  );

  const pause = getCounterState({ counter, now: at("11:10"), timezone: TZ });
  assert.equal(pause.state, COUNTER_STATES.UPCOMING);
  assert.equal(pause.nextOpening.kind, "asap");
  assert.equal(pause.nextOpening.at.getTime(), at("11:30").getTime());

  const lunch = getCounterState({ counter, now: at("12:00"), timezone: TZ });
  assert.equal(lunch.state, COUNTER_STATES.OPEN);
  assert.equal(lunch.acceptsSlots, true);

  // 12:00 + 10 min prep: the 12:00 slot is gone, 12:15 is the first.
  const slots = getAvailableSlots({ counter, now: at("12:00"), timezone: TZ });
  assert.equal(slots[0].start.getTime(), at("12:15").getTime());
});

test("prep time pushes back the first bookable slot", () => {
  const counter = counterWith({ ...LUNCH, mode: "both", orderCutoff: "11:30" });
  const slots = getAvailableSlots({ counter, now: at("11:25"), timezone: TZ });
  assert.equal(slots[0].start.getTime(), at("11:45").getTime());
});

test("a block past midnight belongs to the day it starts on", () => {
  const counter = {
    status: "Active",
    prepTimeMinutes: 10,
    openingHours: [
      {
        day: 2, // Wednesday
        enabled: true,
        blocks: [{ pickupFrom: "22:00", pickupTo: "02:00", mode: "live" }],
      },
    ],
  };
  const thursday = { year: 2026, month: 10, day: 22 };
  const state = getCounterState({
    counter,
    now: at("01:00", thursday),
    timezone: TZ,
  });
  assert.equal(state.state, COUNTER_STATES.OPEN);
  assert.equal(state.openUntil.getTime(), at("01:50", thursday).getTime());
});

test("pause: manual, timed and rest of today", () => {
  const block = { ...LUNCH, mode: "live" };
  const now = at("12:00");

  const manual = getCounterState({
    counter: counterWith(block, { pause: { kind: "manual", until: null } }),
    now,
    timezone: TZ,
  });
  assert.equal(manual.state, COUNTER_STATES.PAUSED);
  assert.equal(manual.pausedUntil, null);
  assert.equal(manual.acceptsAsap, false);

  const until = computePauseUntil("30m", now, TZ);
  const timed = counterWith(block, { pause: { kind: "30m", until } });
  assert.equal(
    getCounterState({ counter: timed, now, timezone: TZ }).state,
    COUNTER_STATES.PAUSED,
  );
  assert.equal(
    getCounterState({ counter: timed, now: at("12:30"), timezone: TZ }).state,
    COUNTER_STATES.OPEN,
  );

  assert.equal(
    computePauseUntil("today", now, TZ).toISOString(),
    at("00:00", { year: 2026, month: 10, day: 22 }).toISOString(),
  );
});

test("capacity: a full slot is not offered", () => {
  const counter = counterWith(
    { ...LUNCH, mode: "preorder", orderCutoff: "11:00" },
    { ordersPerSlot: 2 },
  );
  const bookedCounts = new Map([[at("11:30").getTime(), 2]]);
  const slots = getAvailableSlots({
    counter,
    now: at("08:00"),
    timezone: TZ,
    bookedCounts,
  });
  assert.equal(slots[0].start.getTime(), at("11:45").getTime());
  assert.equal(slots[0].remaining, 2);
});

test("no hours and inactive counters", () => {
  assert.equal(
    getCounterState({ counter: { status: "Active" }, timezone: TZ }).state,
    COUNTER_STATES.NO_HOURS,
  );
  assert.equal(
    getCounterState({
      counter: counterWith({ ...LUNCH, mode: "live" }, { status: "Inactive" }),
      timezone: TZ,
    }).state,
    COUNTER_STATES.UNAVAILABLE,
  );
});

test("entity state: open when any counter is open", () => {
  const now = at("12:00");
  const open = getCounterState({
    counter: counterWith({ ...LUNCH, mode: "live" }),
    now,
    timezone: TZ,
  });
  const upcoming = getCounterState({
    counter: counterWith({ pickupFrom: "17:00", pickupTo: "21:00", mode: "live" }),
    now,
    timezone: TZ,
  });
  const entity = getEntityState([upcoming, open]);
  assert.equal(entity.state, COUNTER_STATES.OPEN);
  assert.equal(entity.acceptsAsap, true);
});

test("block name: the open or pre-order block's name, and the next opening's", () => {
  const counter = {
    status: "Active",
    prepTimeMinutes: 10,
    openingHours: Array.from({ length: 7 }, (_, day) => ({
      day,
      enabled: true,
      blocks: [
        { ...LUNCH, mode: "preorder", orderCutoff: "11:00", name: "Lunch" },
        { pickupFrom: "17:00", pickupTo: "21:00", mode: "live", name: "" },
      ],
    })),
  };
  const morning = getCounterState({ counter, now: at("08:00"), timezone: TZ });
  assert.equal(morning.state, COUNTER_STATES.PREORDER);
  assert.equal(morning.blockName, "Lunch");
  const evening = getCounterState({ counter, now: at("18:00"), timezone: TZ });
  assert.equal(evening.state, COUNTER_STATES.OPEN);
  assert.equal(evening.blockName, null);
  const between = getCounterState({ counter, now: at("14:00"), timezone: TZ });
  assert.equal(between.blockName, null);
  assert.equal(between.nextOpening.blockName, null);
  const night = getCounterState({ counter, now: at("21:30"), timezone: TZ });
  assert.equal(night.nextOpening.blockName, "Lunch");
});

const THU_22 = { year: 2026, month: 10, day: 22 };
// Monday = 0, so Thursday = 3.
const onlyOn = (day, blocks) => ({
  status: "Active",
  prepTimeMinutes: 10,
  openingHours: [{ day, enabled: true, blocks }],
});

test("next opening: a pre-order block shows its pickup start, not 00:00", () => {
  const counter = onlyOn(3, [
    { pickupFrom: "09:55", pickupTo: "14:00", mode: "preorder", orderCutoff: "09:30" },
  ]);
  const state = getCounterState({ counter, now: at("20:00"), timezone: TZ });
  assert.equal(state.state, COUNTER_STATES.UPCOMING);
  // Ordering starts at midnight (the board refreshes then) ...
  assert.equal(state.nextOpening.kind, "preorder");
  assert.equal(state.nextOpening.at.getTime(), at("00:00", THU_22).getTime());
  // ... but guests are told the venue opens at 09:55.
  assert.equal(state.nextOpening.pickupFrom.getTime(), at("09:55", THU_22).getTime());
});

test("next opening: the earliest pickup wins over an earlier pre-order start", () => {
  const counter = {
    status: "Active",
    prepTimeMinutes: 10,
    openingHours: Array.from({ length: 7 }, (_, day) => ({
      day,
      enabled: true,
      blocks: [
        { pickupFrom: "11:00", pickupTo: "14:00", mode: "live", name: "Lunch" },
        { pickupFrom: "18:00", pickupTo: "21:00", mode: "preorder", orderCutoff: "17:00", name: "Dinner" },
      ],
    })),
  };
  const night = getCounterState({ counter, now: at("21:30"), timezone: TZ });
  assert.equal(night.nextOpening.at.getTime(), at("00:00", THU_22).getTime());
  assert.equal(night.nextOpening.pickupFrom.getTime(), at("11:00", THU_22).getTime());
  assert.equal(night.nextOpening.blockName, "Lunch");
});

test("entity next opening: earliest change and earliest pickup across counters", () => {
  const now = at("20:00");
  const preorder = getCounterState({
    counter: onlyOn(3, [
      { pickupFrom: "09:55", pickupTo: "14:00", mode: "preorder", orderCutoff: "09:30" },
    ]),
    now,
    timezone: TZ,
  });
  const live = getCounterState({
    counter: onlyOn(3, [{ pickupFrom: "08:00", pickupTo: "10:00", mode: "live", name: "Breakfast" }]),
    now,
    timezone: TZ,
  });
  const entity = getEntityState([preorder, live]);
  assert.equal(entity.state, COUNTER_STATES.UPCOMING);
  assert.equal(entity.nextOpening.at.getTime(), at("00:00", THU_22).getTime());
  assert.equal(entity.nextOpening.pickupFrom.getTime(), at("08:00", THU_22).getTime());
  assert.equal(entity.nextOpening.blockName, "Breakfast");
});

test("guest list: open, pre-order, paused, soonest opening, then no hours", () => {
  const upcoming = (hhmm) => ({
    state: COUNTER_STATES.UPCOMING,
    nextOpening: { at: at("00:00", THU_22), pickupFrom: at(hhmm, THU_22) },
  });
  const list = [
    { name: "none", state: { state: COUNTER_STATES.NO_HOURS } },
    { name: "late", state: upcoming("18:00") },
    { name: "paused", state: { state: COUNTER_STATES.PAUSED } },
    { name: "soon", state: upcoming("09:55") },
    { name: "preorder", state: { state: COUNTER_STATES.PREORDER } },
    { name: "open-a", state: { state: COUNTER_STATES.OPEN } },
    { name: "open-b", state: { state: COUNTER_STATES.OPEN } },
  ];
  const sorted = [...list].sort((a, b) => compareForGuestList(a.state, b.state));
  assert.deepEqual(
    sorted.map((entry) => entry.name),
    ["open-a", "open-b", "preorder", "paused", "soon", "late", "none"],
  );
});

// Sunday 25 Oct 2026: 03:00 CEST -> 02:00 CET. Sunday 28 Mar 2027: 02:00 CET -> 03:00 CEST.
const OCT_25 = { year: 2026, month: 10, day: 25 };
const MAR_28 = { year: 2027, month: 3, day: 28 };

test("DST days: lunch hours and slots stay on the local clock", () => {
  [OCT_25, MAR_28].forEach((date) => {
    const counter = counterWith({ ...LUNCH, mode: "both", orderCutoff: "11:00" });
    const slots = getAvailableSlots({ counter, now: at("08:00", date), timezone: TZ });
    assert.equal(slots.length, 8);
    assert.equal(slots[0].start.getTime(), at("11:30", date).getTime());
    assert.equal(slots[7].end.getTime(), at("13:30", date).getTime());
    const open = getCounterState({ counter, now: at("11:30", date), timezone: TZ });
    assert.equal(open.state, COUNTER_STATES.OPEN);
    assert.equal(open.openUntil.getTime(), at("13:20", date).getTime());
  });
});

test("DST days: a block over the changed hour runs by real time", () => {
  const counter = counterWith({ pickupFrom: "01:00", pickupTo: "04:00", mode: "both", orderCutoff: "00:30" });
  // Autumn: 01:00-04:00 local lasts 4 real hours (02:00-03:00 happens twice).
  const autumn = getAvailableSlots({ counter, now: at("00:10", OCT_25), timezone: TZ });
  assert.equal(autumn.length, 16);
  assert.equal(autumn[15].end.getTime(), at("04:00", OCT_25).getTime());
  // Spring: 02:00-03:00 does not exist, so it lasts 2 real hours.
  const spring = getAvailableSlots({ counter, now: at("00:10", MAR_28), timezone: TZ });
  assert.equal(spring.length, 8);
  assert.equal(spring[7].end.getTime(), at("04:00", MAR_28).getTime());
  const late = getCounterState({ counter, now: at("03:30", MAR_28), timezone: TZ });
  assert.equal(late.state, COUNTER_STATES.OPEN);
});
