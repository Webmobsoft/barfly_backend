const mongoose = require("mongoose");
const { STATUS, CARD_TYPE } = require("../Utils/globalConstants");

const { ObjectId } = mongoose.Types;

const cardsSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId },
    cardHolderName: { type: String },
    cardNo: { type: Number, required: true },
    cardExpireAt: { type: Number },
    securityCode: { type: Number },
    type: { type: String, enum: Object.values(CARD_TYPE) },
    status: { type: String, enum: Object.values(STATUS) },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Cards", cardsSchema, "Cards");
