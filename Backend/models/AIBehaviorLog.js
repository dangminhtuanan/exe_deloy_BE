const mongoose = require("mongoose");

const aiBehaviorLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    action: {
      type: String,
      enum: ["view", "search", "add_to_cart", "purchase", "review", "wishlist", "chat", "other"],
      default: "other",
    },
    keyword: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

aiBehaviorLogSchema.index({ user: 1, createdAt: -1 });
aiBehaviorLogSchema.index({ product: 1, action: 1 });

module.exports = mongoose.model("AIBehaviorLog", aiBehaviorLogSchema);
