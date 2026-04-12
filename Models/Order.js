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
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Order", orderSchme);
