const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSlotRowState,
  getPrepareFrom,
  getAgeMinutes,
  buildBoard,
  SLOT_ROW_STATES,
} = require("../../Utils/ordering");

const NOW = new Date("2026-10-21T09:38:00.000Z");
const iso = (hhmm) => new Date(`2026-10-21T${hhmm}:00.000Z`);
const MIN = 60 * 1000;

test("slot row: running with minutes left", () => {
  const row = getSlotRowState({ start: iso("09:30"), end: iso("09:45"), now: NOW });
  assert.deepEqual(row, { state: SLOT_ROW_STATES.RUNNING, minutesLeft: 7 });
});

test("slot row: running from its first minute, rounds partial minutes up", () => {
  const now = new Date(iso("09:30").getTime() + 30 * 1000);
  const row = getSlotRowState({ start: iso("09:30"), end: iso("09:45"), now });
  assert.equal(row.state, "running");
  assert.equal(row.minutesLeft, 15);
  assert.equal(getSlotRowState({ start: iso("09:30"), end: iso("09:45"), now: iso("09:30") }).state, "running");
});

test("slot row: overdue at and after its end", () => {
  assert.deepEqual(getSlotRowState({ start: iso("09:15"), end: iso("09:30"), now: NOW }), { state: "overdue" });
  assert.equal(getSlotRowState({ start: iso("09:15"), end: iso("09:38"), now: NOW }).state, "overdue");
});

test("slot row: upcoming with minutes until start", () => {
  const row = getSlotRowState({ start: iso("09:45"), end: iso("10:00"), now: NOW });
  assert.deepEqual(row, { state: "upcoming", startsInMinutes: 7 });
});

test("prepareFrom = slot start minus prep time (default 10)", () => {
  assert.equal(getPrepareFrom(iso("09:45"), 15).toISOString(), iso("09:30").toISOString());
  assert.equal(getPrepareFrom(iso("09:45"), 0).toISOString(), iso("09:45").toISOString());
  assert.equal(getPrepareFrom(iso("09:45"), undefined).toISOString(), iso("09:35").toISOString());
});

test("age in whole minutes, never negative", () => {
  assert.equal(getAgeMinutes(new Date(NOW - 12.5 * MIN), NOW), 12);
  assert.equal(getAgeMinutes(new Date(NOW.getTime() + MIN), NOW), 0);
});

test("board: ASAP oldest first, slot rows overdue → running → upcoming", () => {
  const order = (id, extra) => ({ _id: id, counterId: "c1", createdAt: new Date(NOW - 5 * MIN), ...extra });
  const orders = [
    order("a2", { pickupMode: "asap", createdAt: new Date(NOW - 2 * MIN) }),
    order("a1", { createdAt: new Date(NOW - 20 * MIN) }), // missing pickupMode = ASAP
    order("u1", { pickupMode: "slot", pickupSlotStart: iso("10:00") }),
    order("r2", { pickupMode: "slot", pickupSlotStart: iso("09:30"), createdAt: new Date(NOW - MIN) }),
    order("r1", { pickupMode: "slot", pickupSlotStart: iso("09:30"), createdAt: new Date(NOW - 9 * MIN) }),
    order("o1", { pickupMode: "slot", pickupSlotStart: iso("09:00") }),
    order("u0", { pickupMode: "slot", pickupSlotStart: iso("09:45") }),
  ];
  const counters = new Map([["c1", { prepTimeMinutes: 15, ordersPerSlot: 6 }]]);
  const booked = new Map([["c1", new Map([[iso("09:30").getTime(), 4], [iso("09:45").getTime(), 1]])]]);
  const { asap, slots } = buildBoard({ orders, counters, bookedCounts: booked, now: NOW });

  assert.deepEqual(asap.map((o) => o._id), ["a1", "a2"]);
  assert.deepEqual(asap.map((o) => o.ageMinutes), [20, 2]);
  assert.deepEqual(slots.map((s) => s.state), ["overdue", "running", "upcoming", "upcoming"]);
  assert.deepEqual(slots.map((s) => s.start.toISOString()), [iso("09:00"), iso("09:30"), iso("09:45"), iso("10:00")].map((d) => d.toISOString()));
  const running = slots[1];
  assert.deepEqual(running.orders.map((o) => o._id), ["r1", "r2"]);
  assert.equal(running.booked, 4);
  assert.equal(running.limit, 6);
  assert.equal(running.minutesLeft, 7);
  assert.equal(running.prepareFrom.toISOString(), iso("09:15").toISOString());
  assert.equal(running.end.toISOString(), iso("09:45").toISOString());
  assert.equal(slots[2].startsInMinutes, 7);
  // Booked never shows fewer than the orders on the row.
  assert.equal(slots[0].booked, 1);
});

test("board: several counters in one row add up limits, null when one is unlimited", () => {
  const orders = [
    { _id: "x", counterId: "c1", pickupMode: "slot", pickupSlotStart: iso("10:00"), createdAt: NOW },
    { _id: "y", counterId: "c2", pickupMode: "slot", pickupSlotStart: iso("10:00"), createdAt: NOW },
  ];
  const booked = new Map([["c1", new Map([[iso("10:00").getTime(), 2]])], ["c2", new Map([[iso("10:00").getTime(), 3]])]]);
  const limited = buildBoard({ orders, counters: new Map([["c1", { ordersPerSlot: 4, prepTimeMinutes: 5 }], ["c2", { ordersPerSlot: 6, prepTimeMinutes: 20 }]]), bookedCounts: booked, now: NOW });
  assert.equal(limited.slots[0].limit, 10);
  assert.equal(limited.slots[0].booked, 5);
  assert.equal(limited.slots[0].prepareFrom.toISOString(), iso("09:40").toISOString());
  const open = buildBoard({ orders, counters: new Map([["c1", { ordersPerSlot: 4 }], ["c2", { ordersPerSlot: null }]]), bookedCounts: booked, now: NOW });
  assert.equal(open.slots[0].limit, null);
});
