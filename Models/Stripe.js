const mongoose = require("mongoose");
const { STRIPE_PAYMENT_STATUS } = require("../Utils/globalConstants");

const { ObjectId } = mongoose.Types;

const StripePaymentSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User" },
    stripePaymentIntentId: { type: String },
    paymentMethodId: { type: String },
    amount: { type: Number },
    currency: { type: String },
    paymentStatus: {
      type: String,
      enum: Object.values(STRIPE_PAYMENT_STATUS),
      default: STRIPE_PAYMENT_STATUS.PENDING,
    },
    lastPaymentDate: { type: Date },
    metadata: { type: Object },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

module.exports = mongoose.model("StripePayment", StripePaymentSchema);
