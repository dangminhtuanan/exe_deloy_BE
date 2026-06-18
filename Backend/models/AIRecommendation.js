const mongoose = require("mongoose");

const recommendedProductSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const aiRecommendationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    algorithm: {
      type: String,
      default: "popular_category_rating",
      trim: true,
    },
    input: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    products: {
      type: [recommendedProductSchema],
      default: [],
    },
  },
  { timestamps: true }
);

aiRecommendationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("AIRecommendation", aiRecommendationSchema);
