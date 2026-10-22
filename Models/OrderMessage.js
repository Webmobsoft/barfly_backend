const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

// One chat message about an order. The restaurant always writes first; the
// guest can only reply, and the thread locks when the order is finished.
const orderMessageSchema = new Schema(
  {
    orderId: { type: ObjectId, ref: "Order", required: true },
    entityId: { type: ObjectId, ref: "EntityDetails", required: true },
    userId: { type: ObjectId, ref: "User", required: true }, // the guest
    sender: { type: String, enum: ["restaurant", "guest"], required: true },
    text: { type: String, required: true },
    viaVoice: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

orderMessageSchema.index({ orderId: 1, createdAt: 1 });

module.exports = mongoose.model("OrderMessage", orderMessageSchema);
