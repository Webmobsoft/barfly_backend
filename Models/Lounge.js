const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const loungeSchema = new Schema({
  seatingCapacity: { type: Number, required: true },
  ambiance: { type: String, required: true },
  amenities: [{ type: String }],
  image: { type: String },
},{ timestamps: true });

module.exports = mongoose.model("Lounge", loungeSchema);
