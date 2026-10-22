const mongoose = require("mongoose");
const { STATUS } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

// A named set of extras ("Pizza Extras") the restaurant assigns to items.
// Items point at lists through ItemDetails.extrasListIds.
const extrasListSchema = new Schema(
  {
    entityId: { type: ObjectId, ref: "EntityDetails", required: true },
    name: { type: String, required: true },
    extras: {
      type: [
        {
          name: { type: String, required: true },
          price: { type: Number, default: 0 },
          available: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.ACTIVE,
    },
  },
  { timestamps: true }
);

extrasListSchema.index({ entityId: 1, status: 1 });

module.exports = mongoose.model("ExtrasList", extrasListSchema);
