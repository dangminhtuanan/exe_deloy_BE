const mongoose = require("mongoose"); 

const userSchema = new mongoose.Schema({
  avatar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Avatar",
    default: null,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    default: "",
  },
  address: {
    type: String,
    default: "",
  },
  role: {
    type: String,
    enum: ["user", "staff", "admin", "shipper"],
    default: "user",
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  aiCredits: {
    type: Number,
    default: 0,
    min: 0,
  },
  monthlyAiCredits: {
    type: Number,
    default: 0,
    min: 0,
  },
  paidAiCredits: {
    type: Number,
    default: 0,
    min: 0,
  },
  monthlyAiCreditPeriod: {
    type: String,
    default: null,
  },
  monthlyAiCreditGrantedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

module.exports = User;
