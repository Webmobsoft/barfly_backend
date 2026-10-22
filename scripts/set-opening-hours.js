#!/usr/bin/env node
// Sets the weekly opening hours of a restaurant's counters from a JSON file.
// Needed once per pilot restaurant before 1.0.3 goes live: without hours a
// counter never opens.
//
//   DB_URI=… DB_NAME=… node scripts/set-opening-hours.js \
//     --entity <entityId> --file hours.json [--counter <counterId>] \
//     [--prep 10] [--dry-run]
//
// hours.json is the same array the owner endpoint takes, e.g.
//   [{ "day": 0, "enabled": true, "blocks": [{ "name": "Lunch",
//      "pickupFrom": "11:30", "pickupTo": "13:30",
//      "mode": "preorder", "orderCutoff": "11:00" }] }, …]
// Days: 0 = Monday … 6 = Sunday. Days left out are stored as closed.

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Counter = require("../Models/Counter");
const {
  normalizeOpeningHours,
  normalizePrepTime,
} = require("../Utils/ordering");

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const dryRun = args.includes("--dry-run");

const main = async () => {
  const entityId = option("entity");
  const file = option("file");
  const counterId = option("counter");
  if (!entityId || !file) {
    console.error("Usage: --entity <entityId> --file <hours.json> [--counter <id>] [--prep <min>] [--dry-run]");
    process.exit(1);
  }

  const hours = normalizeOpeningHours(
    JSON.parse(fs.readFileSync(path.resolve(file), "utf8")),
  );
  const prep = normalizePrepTime(option("prep"));
  const errors = [...hours.errors, ...prep.errors];
  if (errors.length) {
    console.error("Invalid opening hours:", JSON.stringify(errors, null, 2));
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URI, {
    authSource: "admin",
    dbName: process.env.DB_NAME,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  });

  const filter = {
    entityId,
    status: "Active",
    ...(counterId ? { _id: counterId } : {}),
  };
  const counters = await Counter.find(filter, { counterName: 1 }).lean();
  console.log(
    `${dryRun ? "[dry run] " : ""}${counters.length} counter(s):`,
    counters.map((counter) => counter.counterName).join(", ") || "none",
  );

  if (!dryRun && counters.length) {
    const result = await Counter.updateMany(filter, {
      $set: { openingHours: hours.value, prepTimeMinutes: prep.value },
    });
    console.log(`Updated ${result.nModified ?? result.modifiedCount} counter(s).`);
  }

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
