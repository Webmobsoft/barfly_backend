const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const platformVersionsSchema = new Schema(
  {
    ios: { type: String, default: "0.0.0" },
    android: { type: String, default: "0.0.0" },
  },
  { _id: false }
);

// Single document (key "global") read by GET /api/app-config. Raising a
// minimum version makes older app builds show the "Please update" screen.
const appConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    minVersion: {
      customer: { type: platformVersionsSchema, default: () => ({}) },
      countrPlus: { type: platformVersionsSchema, default: () => ({}) },
    },
    storeUrls: {
      customer: {
        ios: { type: String, default: "https://apps.apple.com/app/id6748006724" },
        android: {
          type: String,
          default:
            "https://play.google.com/store/apps/details?id=com.countr.countrprod",
        },
      },
      countrPlus: {
        ios: { type: String, default: "https://apps.apple.com/app/id6748039501" },
        android: {
          type: String,
          default:
            "https://play.google.com/store/apps/details?id=com.countr.countr_plus",
        },
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppConfig", appConfigSchema);
