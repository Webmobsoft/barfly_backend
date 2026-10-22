const mongoose = require("mongoose");

const Schema = mongoose.Schema;

// Atomic counters, e.g. key "order:<entityId>" for order token numbers.
const sequenceSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
});

module.exports = mongoose.model("Sequence", sequenceSchema);
