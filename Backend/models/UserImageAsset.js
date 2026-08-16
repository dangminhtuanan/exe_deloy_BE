const mongoose = require("mongoose");

const userImageAssetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  kind: { type: String, enum: ["model", "clothing"], required: true },
  url: { type: String, required: true, trim: true },
  publicId: { type: String, default: "", trim: true },
  name: { type: String, default: "", trim: true },
  clothType: { type: String, enum: ["upper", "lower", "full_set", ""], default: "" },
  color: { type: String, default: "", trim: true },
  gender: { type: String, default: "", trim: true },
  ageGroup: { type: String, default: "", trim: true },
  ethnicity: { type: String, default: "", trim: true },
  skinTone: { type: String, default: "", trim: true },
  hairColor: { type: String, default: "", trim: true },
  tags: { type: [String], default: [] },
}, { timestamps: true, collection: "userimageassets" });

userImageAssetSchema.index({ user: 1, url: 1 }, { unique: true });
userImageAssetSchema.index({ user: 1, kind: 1, createdAt: -1 });

module.exports = mongoose.model("UserImageAsset", userImageAssetSchema);
