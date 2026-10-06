const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const otpSchema = new Schema(
  {
    userId: { type: ObjectId },
    email: { type: String },
    contactNumber: { type: String },
    otp: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Otp", otpSchema);
