const mongoose = require("mongoose");
const { STATUS } = require("../Utils/globalConstants");

const adminSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    status: { type: String, enum: Object.values(STATUS) },
    blockUnblockDate: { type: Date },
    isAdmin: { type: Boolean, default: true },
    platformFees: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Admin", adminSchema, "Admin");
