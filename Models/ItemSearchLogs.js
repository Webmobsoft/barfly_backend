const mongoose = require("mongoose");

const { ObjectId } = mongoose.Types;

const itemsSearchLogsSchema = new mongoose.Schema(
  {
    itemId: { type: ObjectId },
    entityId: { type: ObjectId },
    isRemoved: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model(
  "ItemSearchlogs",
  itemsSearchLogsSchema,
  "ItemSearchlogs"
);
