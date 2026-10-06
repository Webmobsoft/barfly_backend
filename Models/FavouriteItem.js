const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const favouriteItems = new Schema(
  {
    userId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    favouriteItemId: { type: mongoose.Types.ObjectId, ref: "MenuItem" },
    counterId: { type: mongoose.Types.ObjectId, ref: "Counter" },
    isFavourite:{type: Boolean},
  },
  { timestamps: true }
);

module.exports = mongoose.model("FavoriteItem", favouriteItems);
