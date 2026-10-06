const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const notificationSettings = new Schema(
  {
    userId: { type: ObjectId, ref: "User" },
    isEmailOn: { type: Boolean, default: true },
    isPushOn: { type: Boolean, default: true },
    isPromotionalOn: { type: Boolean, default: true },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("NotificationSettings", notificationSettings);
