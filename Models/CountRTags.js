const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const countRTagSchema = new Schema(
  {
    countRTag: { type: String },
    userId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Countrtag", countRTagSchema, "Countrtag");
