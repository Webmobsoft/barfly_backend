const mongoose = require("mongoose");

const { ObjectId } = mongoose.Types;

const searchLogsSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId },
    entityId: { type: ObjectId },
    isRemoved: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Searchlogs", searchLogsSchema, "Searchlogs");
