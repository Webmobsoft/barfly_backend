const mongoose = require("mongoose");
const { ORDER_STATUS } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const offlineOrderLogsSchema = new Schema(
  {
    items: {
      type: [
        {
          itemId: { type: ObjectId, ref: "ItemDetails" },
          quantity: { type: Number },
        },
      ],
    },
    counterId: {
      type: ObjectId,
      ref: "Order",
      required: true,
    },
    entityId: {
      type: ObjectId,
      ref: "EntityDetails",
      required: true,
    },
    countrTag: { type: String, required: true, ref: "User" },
    userId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    internalNumber: { type: String, default: "" },
    status: { type: String, enum: Object.values(ORDER_STATUS) },
    totalAmount: { type: Number, default: 0 },
    // IANA timezone sent by the client at order time (e.g. "Europe/Zurich"),
    // used to render the receipt PDF in the right local time. Optional —
    // falls back to RECEIPT_TIMEZONE when absent/invalid.
    timezone: { type: String },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("OfflineOrders", offlineOrderLogsSchema);
