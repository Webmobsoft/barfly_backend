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

module.exports = mongoose.model("FavouriteEntity", favouriteSchema);
