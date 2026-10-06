const mongoose = require("mongoose");

const { ObjectId } = mongoose.Types;

const LocationSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User" },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Location", LocationSchema, "Location");
