const mongoose = require("mongoose");
const { ROLES, STATUS } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    role: { type: String, required: true, enum: ROLES },
    fullName: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    password: { type: String },
    language: { type: String },
    contactNumber: { type: String, default: "" },
    // dob: { type: String },
    emailOtpVerified: { type: Boolean, default: false },
    phoneOtpVerified: { type: Boolean, default: false },
    locationEnabled: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(STATUS) },
    fcmToken: { type: [String], default: [] },
    socketId: { type: String },
    // age: { type: String },
    countrTag: { type: String },
    blockUnblockDate: { type: Date },
  },
  { timestamps: true, minimize: false }
);
module.exports = mongoose.model("User", userSchema, "User");
