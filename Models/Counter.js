const mongoose = require("mongoose");
const { STATUS } = require("../Utils/globalConstants");
const {
  ORDER_MODES,
  PAUSE_KINDS,
  DEFAULT_PREP_TIME_MINUTES,
} = require("../Utils/ordering/counterState");
const Schema = mongoose.Schema;

// One pickup block of a weekday, in the venue's wall-clock time ("HH:mm").
const openingBlockSchema = new Schema({
  name: { type: String, default: "" },
  pickupFrom: { type: String, required: true },
  pickupTo: { type: String, required: true },
  mode: { type: String, enum: Object.values(ORDER_MODES), required: true },
  orderCutoff: { type: String, default: null },
});

// Weekday 0 = Monday … 6 = Sunday.
const openingDaySchema = new Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true },
    enabled: { type: Boolean, default: false },
    blocks: { type: [openingBlockSchema], default: [] },
  },
  { _id: false }
);

const counterSchema = new Schema(
  {
    counterName: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    entityId: { type: mongoose.Schema.Types.ObjectId, ref: "EntityDetails" },
    isTableService: { type: Boolean, default: false },
    isSelfPickUp: { type: Boolean, default: true },
    totalTables: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(STATUS) },
    tableCount: [{ type: String }],
    tableSectionName: { type: String },
    openingHours: { type: [openingDaySchema], default: [] },
    prepTimeMinutes: { type: Number, default: DEFAULT_PREP_TIME_MINUTES },
    // Empty = no limit per 15-minute pickup slot.
    ordersPerSlot: { type: Number, default: null },
    pause: {
      kind: { type: String, enum: [...Object.values(PAUSE_KINDS), null] },
      until: { type: Date },
      startedAt: { type: Date },
    },
    // Bumped inside the create-order transaction so two orders for the same
    // counter cannot both take the last place in a slot (write conflict).
    orderLockVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for the guest app's hot queries (see docs/ordering-api-1.0.3.md).
counterSchema.index({ entityId: 1, status: 1, _id: -1 });

module.exports = mongoose.model("Counter", counterSchema);
