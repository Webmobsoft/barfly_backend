const mongoose = require("mongoose");
const { DRINKS_SIZE, FOOD_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const barSchema = new Schema(
  {
    name: { type: String, required: true },
    icon: { type: String, required: true },
    insiderId: {
      type: mongoose.Types.ObjectId,
      ref: "Insider",
      required: true,
    },
    items: [
      {
        itemName: { type: String },
        price: { type: Number },
        quantity: { type: Number },
        description: { type: String },
        type: { type: String, enum: FOOD_TYPE },
        image: { type: String },
      },
    ],
    visitor: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bar", barSchema);
