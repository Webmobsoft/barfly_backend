const mongoose = require("mongoose");
const { STATUS } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const counterSchema = new Schema(
  {
    counterName: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    entityId: { type: mongoose.Schema.Types.ObjectId, ref: "EntityDetails" },
    isTableService: { type: Boolean, default: false },
    isSelfPickUp: { type: Boolean, default: true },
    totalTables: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(STATUS) },
    tableCount: [{ type: String }],
    tableSectionName: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Counter", counterSchema);
