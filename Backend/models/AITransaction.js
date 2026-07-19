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
    isTrial: {
      type: Boolean,
      default: false,
      description: "Snapshot of whether the purchased package was a trial",
    },
    provider: {
      type: String,
      enum: ["cod", "momo", "vnpay", "bank_transfer", "stripe", "paypal", "PAYOS"],
      default: "PAYOS",
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
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
      enum: ["PENDING", "PAID", "CANCELLED", "FAILED"],
      default: "PENDING",
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
    creditsGrantedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      description: "When the subscription expires (for recurring packages)",
    },
    trialPurchaseKey: {
      type: String,
      trim: true,
      default: undefined,
      select: false,
      description: "Unique account key reserved by a trial purchase",
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
// A trial reservation remains after payment, so an account can never buy any
// trial package twice. Failed/cancelled reservations remove this field.
aiTransactionSchema.index({ trialPurchaseKey: 1 }, { unique: true, sparse: true });

aiTransactionSchema.set("toJSON", {
  transform(document, returnedObject) {
    if (returnedObject.status) returnedObject.status = String(returnedObject.status).toUpperCase();
    return returnedObject;
  },
});

aiTransactionSchema.pre("validate", function normalizeStatus(next) {
  if (this.status) {
    this.status = String(this.status).toUpperCase();
  }
  next();
});

module.exports = mongoose.model("AITransaction", aiTransactionSchema);
