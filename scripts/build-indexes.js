#!/usr/bin/env node
// Builds the database indexes the backend's models declare, on an existing
// database, before a new backend version starts. Mongoose would otherwise
// build them by itself at first start, which loads a large orders collection
// while traffic is live and cannot turn an existing plain index into a
// unique one.
//
//   DB_URI=… DB_NAME=… node scripts/build-indexes.js            # report only
//   DB_URI=… DB_NAME=… node scripts/build-indexes.js --apply    # build
//
// The report lists, per collection, every declared index as ok / missing /
// different, and any duplicates that block a unique index.
//
// 1.0.3 makes two existing indexes unique: Order.walleeTransactionId and
// FavouriteEntity {userId, entityId}. With --apply the plain index is dropped
// and rebuilt as unique, but only when no duplicates exist; otherwise the
// script lists them and changes nothing. Other indexes that differ from the
// models are reported and left alone.

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const apply = process.argv.includes("--apply");

// Indexes that change from plain to unique; `match` limits the duplicate
// check to the documents the index covers (the walleeTransactionId index is
// sparse).
const UNIQUE_SWAPS = [
  {
    model: "Order",
    key: { walleeTransactionId: 1 },
    match: { walleeTransactionId: { $exists: true } },
  },
  { model: "FavouriteEntity", key: { userId: 1, entityId: 1 }, match: {} },
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const optionsOf = (o) =>
  JSON.stringify({
    unique: !!o.unique,
    sparse: !!o.sparse,
    partialFilterExpression: o.partialFilterExpression || null,
    expireAfterSeconds: o.expireAfterSeconds ?? null,
  });
const describe = (key) => JSON.stringify(key);

const duplicatesOf = async (Model, { key, match }) => {
  const group = {};
  Object.keys(key).forEach((field) => {
    group[field] = `$${field}`;
  });
  return Model.collection
    .aggregate(
      [
        { $match: match },
        { $group: { _id: group, count: { $sum: 1 }, ids: { $push: "$_id" } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 20 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
};

const existingIndexes = async (Model) => {
  try {
    return await Model.collection.indexes();
  } catch (error) {
    if (error.codeName === "NamespaceNotFound" || error.code === 26) return [];
    throw error;
  }
};

const main = async () => {
  await mongoose.connect(process.env.DB_URI, {
    authSource: "admin",
    dbName: process.env.DB_NAME,
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    autoIndex: false,
  });
  const modelsDir = path.join(__dirname, "..", "Models");
  fs.readdirSync(modelsDir)
    .filter((file) => file.endsWith(".js"))
    .forEach((file) => require(path.join(modelsDir, file)));
  console.log(`Database ${process.env.DB_NAME} · ${apply ? "APPLY" : "report only (add --apply to build)"}\n`);

  // 1. Duplicates that would block the unique indexes.
  let blocked = false;
  for (const swap of UNIQUE_SWAPS) {
    const dupes = await duplicatesOf(mongoose.model(swap.model), swap);
    if (dupes.length) {
      blocked = true;
      console.log(`DUPLICATES ${swap.model} ${describe(swap.key)}: ${dupes.length}${dupes.length === 20 ? "+" : ""} groups`);
      dupes.forEach((d) => console.log(`  ${JSON.stringify(d._id)} × ${d.count}: ${d.ids.join(", ")}`));
    } else {
      console.log(`no duplicates ${swap.model} ${describe(swap.key)}`);
    }
  }
  console.log("");

  // 2. Declared vs existing indexes.
  const work = [];
  for (const name of mongoose.modelNames().sort()) {
    const Model = mongoose.model(name);
    const existing = await existingIndexes(Model);
    for (const [key, options] of Model.schema.indexes()) {
      const found = existing.find((index) => sameKey(index.key, key));
      const swap = UNIQUE_SWAPS.find((s) => s.model === name && sameKey(s.key, key));
      let state = "ok";
      if (!found) state = "missing";
      else if (optionsOf(found) !== optionsOf(options)) state = swap ? "to unique" : "different";
      if (state !== "ok") work.push({ Model, key, options, found, state });
      console.log(`${state.padEnd(10)} ${Model.collection.collectionName} ${describe(key)}${options.unique ? " unique" : ""}${options.sparse ? " sparse" : ""}`);
    }
  }
  console.log("");

  if (!apply) {
    console.log(`${work.length} index change(s) pending.${blocked ? " Resolve the duplicates before --apply." : ""}`);
    return blocked ? 1 : 0;
  }
  if (blocked && work.some((w) => w.state === "to unique")) {
    console.log("Duplicates found: nothing changed. Resolve them and run again.");
    return 1;
  }

  // 3. Build. Unique swaps first (drop the plain index, build the unique one
  //    under the same name), then everything missing. Each build runs on its
  //    own so one failure does not stop the rest.
  let failed = 0;
  const ordered = [
    ...work.filter((w) => w.state === "to unique"),
    ...work.filter((w) => w.state === "missing"),
  ];
  for (const { Model, key, options, found, state } of ordered) {
    const label = `${Model.collection.collectionName} ${describe(key)}`;
    try {
      const started = Date.now();
      if (state === "to unique") await Model.collection.dropIndex(found.name);
      await Model.collection.createIndex(key, { ...options, background: true });
      console.log(`built      ${label} (${Date.now() - started} ms)`);
    } catch (error) {
      failed += 1;
      console.log(`FAILED     ${label}: ${error.message}`);
    }
  }
  work
    .filter((w) => w.state === "different")
    .forEach(({ Model, key }) => console.log(`left alone ${Model.collection.collectionName} ${describe(key)} (options differ; check by hand)`));
  console.log(`\n${ordered.length - failed} built, ${failed} failed.`);
  return failed ? 1 : 0;
};

main()
  .then(async (code) => {
    await mongoose.disconnect();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  });
