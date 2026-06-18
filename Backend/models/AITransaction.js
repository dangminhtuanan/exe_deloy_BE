const mongoose = require("mongoose");

const aiTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    package: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIPackage",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    credits: {
      type: Number,
      required: true,
      min: 1,
    },
    provider: {
      type: String,
      enum: ["cod", "momo", "vnpay", "bank_transfer", "stripe", "paypal", "PAYOS"],
      default: "PAYOS",
    },
    orderCode: {
      type: Number,
      unique: true,
      sparse: true,
    },
    paymentLinkId: {
      type: String,
      default: "",
      trim: true,
    },
    checkoutUrl: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled", "PENDING", "PAID", "CANCELLED", "FAILED"],
      default: "pending",
    },
    transactionNo: {
      type: String,
      default: "",
      trim: true,
    },
    transactionReference: {
      type: String,
      default: "",
      trim: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      description: "When the subscription expires (for recurring packages)",
    },
    rawWebhookPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
aiTransactionSchema.index({ user: 1, createdAt: -1 });
aiTransactionSchema.index({ status: 1 });

module.exports = mongoose.model("AITransaction", aiTransactionSchema);
