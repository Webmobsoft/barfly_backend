const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const commissionSchema = new Schema(
  {
    entityId: {
      type: ObjectId,
      ref: "EntityDetails",
      required: true,
    },
    orderId: {
      type: ObjectId,
      ref: "Order",
    },
    eventId: {
      type: ObjectId,
      ref: "Event",
    },
    walleeTransactionId: {
      type: Number, // Wallee transaction ID
      required: true,
    },
    userId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    // Payment details
    totalAmount: {
      type: Number,
      required: true,
    },
    platformCommission: {
      type: Number,
      required: true,
      set: (value) => Number(value.toFixed(2)),
    },
    merchantAmount: {
      type: Number,
      required: true,
      set: (value) => Number(value.toFixed(2)),
    },
    platformFeesPercent: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
    },
    // Commission status
    status: {
      type: String,
      enum: ["PENDING", "INVOICED", "PAID", "CANCELLED"],
      default: "PENDING",
    },
    // Payment tracking
    invoiceNumber: {
      type: String,
    },
    invoiceDate: {
      type: Date,
    },
    paymentDate: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: ["INVOICE", "AUTO_DEBIT", "MANUAL"],
    },
    // Metadata
    notes: {
      type: String,
    },
    metadata: {
      type: Object,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
commissionSchema.index({ entityId: 1, status: 1 });
commissionSchema.index({ walleeTransactionId: 1 });
commissionSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Commission", commissionSchema);
