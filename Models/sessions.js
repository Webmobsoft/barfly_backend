const mongoose = require("mongoose");

const OtpSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    contactNumber: { type: String, required: true },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("OtpSession", OtpSessionSchema);
