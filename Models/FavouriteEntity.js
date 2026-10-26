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
// One row per guest and restaurant, so concurrent upserts cannot duplicate it.
// On an existing database scripts/build-indexes.js swaps the plain index for it.
favouriteSchema.index({ userId: 1, entityId: 1 }, { unique: true });

module.exports = mongoose.model("FavouriteEntity", favouriteSchema);
