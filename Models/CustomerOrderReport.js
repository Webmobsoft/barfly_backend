const mongoose = require("mongoose");

const { ObjectId } = mongoose.Types;

const customerOrderReport = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User" },
    entityId: { type: ObjectId, ref: "EntityDetails" },
    date: { type: Date },
    filename: { type: String },
    generatedAt: { type: Date, default: Date.now },
    filePath: { type: String },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("CustomerOrderReport", customerOrderReport);