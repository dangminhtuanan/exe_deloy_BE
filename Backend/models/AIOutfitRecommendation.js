const mongoose = require("mongoose");

const aiOutfitRecommendationSchema = new mongoose.Schema(
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
    provider: {
      type: String,
      default: "fitroom",
      trim: true,
    },
    taskId: {
      type: String,
      default: "",
      trim: true,
    },
    modelImageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    clothingImageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    resultImageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    clothType: {
      type: String,
      enum: ["upper", "lower", "full_set", "combo"],
      default: "upper",
    },
    hdMode: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["CREATED", "PROCESSING", "COMPLETED", "FAILED"],
      default: "CREATED",
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    error: {
      type: String,
      default: "",
      trim: true,
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    collection: "aioutfitrecommendations",
    timestamps: true,
  }
);

aiOutfitRecommendationSchema.index({ user: 1, createdAt: -1 });
aiOutfitRecommendationSchema.index({ product: 1, createdAt: -1 });
aiOutfitRecommendationSchema.index({ taskId: 1 }, { sparse: true });

module.exports = mongoose.model("AIOutfitRecommendation", aiOutfitRecommendationSchema);
