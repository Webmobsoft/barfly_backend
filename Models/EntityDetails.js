const mongoose = require("mongoose");
const { PRODUCT_TYPE, STATUS } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const entityDetailsSchema = new Schema(
  {
    userId: { type: ObjectId },
    city: { type: String },
    zipcode: { type: String },
    entityName: { type: String },
    entityType: { type: String, enum: PRODUCT_TYPE },
    owner: { type: mongoose.Types.ObjectId, ref: "User" },
    image: { type: String },
    entityContactNumber: { type: String },
    // plotNo: { type: String },
    floor: { type: String },
    country: { type: String },
    buildingName: { type: String },
    landMark: { type: String },
    state: { type: String },
    location: { type: String },
    status: { type: String, enum: Object.values(STATUS) },
    views: { type: Number, default: 0 },
    isOpen: { type: Boolean, default: true },
    stripeAccountId: { type: String },
    bankLinkUrl: { type: String },
    walleeSpaceId: { type: Number },
    walleeApplicationUserId: { type: Number },
    walleeOnboardingUrl: { type: String },
    blockUnblockDate: { type: Date },
    // IANA timezone the opening hours are written in.
    timezone: { type: String, default: "Europe/Zurich" },
  },
  { timestamps: true }
);

// Indexes for the guest app's hot queries (see docs/ordering-api-1.0.3.md).
entityDetailsSchema.index({ status: 1, isOpen: 1, _id: -1 });
entityDetailsSchema.index({ status: 1, isOpen: 1, views: -1, _id: -1 });

module.exports = mongoose.model("EntityDetails", entityDetailsSchema);
