const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOpeningHours,
  normalizePrepTime,
} = require("../../Utils/ordering");

const keys = (result) => result.errors.map((error) => error.key);

test("a valid grid passes and is normalised to 7 days", () => {
  const result = normalizeOpeningHours([
    {
      day: 0,
      enabled: true,
      blocks: [
        {
          name: " Lunch ",
          pickupFrom: "11:30",
          pickupTo: "13:30",
          mode: "preorder",
          orderCutoff: "11:00",
        },
        { pickupFrom: "17:00", pickupTo: "21:00", mode: "live" },
      ],
    },
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.length, 7);
  assert.equal(result.value[0].blocks[0].name, "Lunch");
  assert.equal(result.value[0].blocks[1].orderCutoff, null);
  assert.equal(result.value[6].enabled, false);
});

test("pre-order and both need a cut-off at or before pickup start", () => {
  assert.deepEqual(
    keys(
      normalizeOpeningHours([
        {
          day: 1,
          enabled: true,
          blocks: [{ pickupFrom: "11:30", pickupTo: "13:30", mode: "both" }],
        },
      ]),
    ),
    ["HOURS_CUTOFF_REQUIRED"],
  );
  assert.deepEqual(
    keys(
      normalizeOpeningHours([
        {
          day: 1,
          enabled: true,
          blocks: [
            {
              pickupFrom: "11:30",
              pickupTo: "13:30",
              mode: "preorder",
              orderCutoff: "12:00",
            },
          ],
        },
      ]),
    ),
    ["HOURS_CUTOFF_AFTER_PICKUP"],
  );
});

test("rejects overlapping blocks, a third block and bad values", () => {
  const overlap = normalizeOpeningHours([
    {
      day: 2,
      enabled: true,
      blocks: [
        { pickupFrom: "11:00", pickupTo: "14:00", mode: "live" },
        { pickupFrom: "13:00", pickupTo: "15:00", mode: "live" },
      ],
    },
  ]);
  assert.ok(keys(overlap).includes("HOURS_BLOCKS_OVERLAP"));

  const three = normalizeOpeningHours([
    {
      day: 2,
      enabled: true,
      blocks: [
        { pickupFrom: "08:00", pickupTo: "09:00", mode: "live" },
        { pickupFrom: "10:00", pickupTo: "11:00", mode: "live" },
        { pickupFrom: "12:00", pickupTo: "13:00", mode: "live" },
      ],
    },
  ]);
  assert.ok(keys(three).includes("HOURS_TOO_MANY_BLOCKS"));

  const bad = normalizeOpeningHours([
    {
      day: 3,
      enabled: true,
      blocks: [{ pickupFrom: "25:00", pickupTo: "13:00", mode: "later" }],
    },
  ]);
  assert.ok(keys(bad).includes("HOURS_INVALID_TIME"));
  assert.ok(keys(bad).includes("HOURS_INVALID_MODE"));

  assert.deepEqual(keys(normalizeOpeningHours("nope")), [
    "HOURS_INVALID_FORMAT",
  ]);
});

test("a day switched on without blocks is stored as off", () => {
  const result = normalizeOpeningHours([{ day: 4, enabled: true, blocks: [] }]);
  assert.equal(result.value[4].enabled, false);
});

test("prep time defaults to 10 and is bounded", () => {
  assert.equal(normalizePrepTime(undefined).value, 10);
  assert.equal(normalizePrepTime(15).value, 15);
  assert.deepEqual(keys(normalizePrepTime(-1)), ["HOURS_INVALID_PREP_TIME"]);
  assert.deepEqual(keys(normalizePrepTime(500)), ["HOURS_INVALID_PREP_TIME"]);
});
