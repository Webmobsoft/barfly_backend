const mongoose = require("mongoose");
const { FOOD_TYPE, NUTRITION_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const counterMenuCategory = new Schema(
  {
    counterId: { type: ObjectId, ref: "Counter" },
    categoryName: {
      type: String,
      required: true,
    },
    entityId: {
      type: ObjectId,
      required: true,
      ref: "EntityDetails",
    },
    nutritionType: {
      type: String,
      enum: Object.values(NUTRITION_TYPE),
      default: "",
    },
    // Order the guest sees in the menu (ascending). Kept equal on every
    // counter copy of the same category name.
    sortIndex: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for the guest app's hot queries (see docs/ordering-api-1.0.3.md).
counterMenuCategory.index({ counterId: 1, sortIndex: 1, _id: 1 });

module.exports = mongoose.model("CounterMenuCategory", counterMenuCategory);
