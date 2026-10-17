const mongoose = require("mongoose");
const { STATUS } = require("../Utils/globalConstants");
const { ObjectId } = mongoose.Types;

const tableSchema = new mongoose.Schema(
  {
    tableCount: [{ type: String }],
    userId: { type: ObjectId },
    entityId: { type: ObjectId },
    counterIds: [
      {
        type: ObjectId,
        ref: "Counter",
        required: true,
      },
    ],
    tableSetionNo: { type: Number, default: 0 },
    tableSectionName: { type: String },
    status: { type: String, enum: Object.values(STATUS) },
  },
  { timestamps: true, minimize: false }
);
module.exports = mongoose.model("Table", tableSchema);
