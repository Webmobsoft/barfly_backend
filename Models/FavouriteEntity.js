const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const favouriteSchema = new Schema(
  {
    userId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    entityId: { type: mongoose.Types.ObjectId, ref: "EntityDetails" },
    isFavourite: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for the guest app's hot queries (see docs/ordering-api-1.0.3.md).
favouriteSchema.index({ userId: 1, entityId: 1 });

module.exports = mongoose.model("FavouriteEntity", favouriteSchema);
