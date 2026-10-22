const mongoose = require("mongoose");
const {
  FOOD_TYPE,
  NUTRITION_TYPE,
  UNIT_TYPE,
} = require("../Utils/globalConstants");

const { ObjectId } = mongoose.Types;

const Schema = mongoose.Schema;

const itemSchema = new Schema(
  {
    availableQuantity: { type: Number },
    menuCategoryId: {
      type: ObjectId,
      ref: "CounterMenuCategory",
    },
    entityId: {
      type: ObjectId,
      ref: "EntityDetails",
    },
    unit: { type: String, enum: Object.values(UNIT_TYPE) },
    nutritionType: { type: String, enum: Object.values(NUTRITION_TYPE) },
    isVegan: { type: Boolean, default: false },
    isAlcohol18: { type: Boolean, default: false },
    isAlcohol16: { type: Boolean, default: false },
    itemName: { type: String, required: true },
    description: { type: String },
    image: { type: String },
    price: { type: Number },
    currency: { type: String },
    // counterId: {
    //   type: ObjectId,
    //   ref: "Counter",
    // },
    counterIds: [
      {
        type: ObjectId,
        ref: "Counter",
        required: true,
      },
    ],
    counterId: { type: ObjectId },
    inStock: { type: Boolean, default: true },
    quantity: { type: Number },
    // Order inside its category (ascending) and the merchant's "recommended"
    // star. Kept equal on every counter copy of the same item.
    sortIndex: { type: Number, default: 0 },
    isRecommended: { type: Boolean, default: false },
    extrasListIds: [{ type: ObjectId, ref: "ExtrasList" }],
  },
  { timestamps: true, minimize: false }
);

// Indexes for the guest app's hot queries (see docs/ordering-api-1.0.3.md).
itemSchema.index({ counterId: 1, inStock: 1, sortIndex: 1, _id: 1 });
itemSchema.index({ counterIds: 1, isRecommended: 1, inStock: 1, sortIndex: 1, _id: 1 });

module.exports = mongoose.model("ItemDetails", itemSchema);
