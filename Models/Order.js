const mongoose = require("mongoose");
const { ORDER_STATUS } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const orderSchme = new Schema(
  {
    status: { type: String, required: true, enum: Object.values(ORDER_STATUS) },
    items: {
      type: [
        {
          itemId: { type: ObjectId, ref: "ItemDetails" },
          quantity: { type: Number },
          note: { type: String, default: "" },
          itemName: { type: String },  // snapshot at order time
          itemPrice: { type: Number }, // snapshot at order time
          // Snapshots so tickets keep their grouping and prices after the
          // menu changes.
          categoryId: { type: ObjectId, ref: "CounterMenuCategory" },
          categoryName: { type: String },
          categorySortIndex: { type: Number },
          extras: {
            type: [
              {
                extraId: { type: ObjectId },
                name: { type: String },
                price: { type: Number },
              },
            ],
            default: [],
          },
          unitPrice: { type: Number }, // item price + extras, per piece
          lineTotal: { type: Number },
        },
      ],
    },
    // menuCategoryId: { type: ObjectId, required: true, ref: "CounterMenuCategory", required: true },
    counterId: {
      type: ObjectId,
      ref: "Counter",
    },
    entityId: {
      type: ObjectId,
      ref: "EntityDetails",
    },
    tokenNumber: { type: Number, required: true },
    userId: {
      type: ObjectId,
      required: true,
      ref: "User",
    },
    totalAmount: { type: Number, required: true },
    eventId: {
      type: ObjectId,
      ref: "Event",
    },
    tableNo: { type: Number, default: 0 },
    isSelfPickup: { type: Boolean },
    note: { type: String, default: "" },
    discountAmount: { type: Number, default: 0 },
    finalAmount: {
      type: Number,
      required: true,
      set: (value) => Number(value.toFixed(2)),
    },
    couponCode: { type: String },
    tax: { type: Number },
    platformFees: { type: Number },
    paymentMethod: { type: String },
    walleeTransactionId: { type: Number },
    // IANA timezone sent by the client at order time (e.g. "Europe/Zurich"),
    // used to render the receipt PDF in the right local time. Optional —
    // falls back to RECEIPT_TIMEZONE when absent/invalid.
    timezone: { type: String },
    // "asap" = as soon as possible, "slot" = a chosen 15-minute window.
    pickupMode: { type: String, enum: ["asap", "slot"], default: "asap" },
    pickupSlotStart: { type: Date },
    pickupSlotLength: { type: Number },
    // Guest's countag at order time, shown on the restaurant's ticket.
    countrTag: { type: String },
  },
  { timestamps: true, minimize: false }
);

orderSchme.index({ counterId: 1, pickupSlotStart: 1, status: 1 });
orderSchme.index({ entityId: 1, tokenNumber: -1 });
// Guest order lists (live orders, yearly counts) and the create-order
// idempotency lookup by Wallee transaction.
orderSchme.index({ userId: 1, status: 1, updatedAt: -1 });
orderSchme.index({ userId: 1, createdAt: -1, entityId: 1 });
// One order per Wallee transaction. On an existing database the plain index
// is swapped for this one by scripts/build-indexes.js (after a duplicate check).
orderSchme.index({ walleeTransactionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Order", orderSchme);
