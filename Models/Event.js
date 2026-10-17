const mongoose = require("mongoose");
const { SERIAL_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const eventSchema = new Schema(
  {
    eventName: { type: String, required: true },
    serialType: { type: String, enum: SERIAL_TYPE },
    // startingDate: { type: Date },
    // endDate: { type: Date },
    isRepetitive: { type: Boolean, default: false },
    isAllDay: { type: Boolean, default: false },
    repetitiveDays: { type: [Number] },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    counterIds: [
      {
        type: ObjectId,
        ref: "Counter",
        required: true,
      },
    ],
    // ageLimit: { type: String, required: true },
    ownerId: { type: ObjectId, ref: "User" },
    entityId: {
      type: ObjectId,
      ref: "EntityDetails",
      required: true,
    },
    activeUsers: { type: Number, default: 0 },
    image: { type: String },
    location: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);
