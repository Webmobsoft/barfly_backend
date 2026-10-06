const mongoose = require("mongoose");

const { ObjectId } = mongoose.Types;

const salesReportSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User" },
    entityId: { type: ObjectId, ref: "EntityDetails" },
    fromDate: { type: Date },
    toDate: { type: Date },
    filename: { type: String },
    downloadedAt: { type: Date, default: Date.now },
    filePath: { type: String },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("SalesReport", salesReportSchema);
