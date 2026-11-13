const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 70 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },

  passwordHash: { type: String, required: true, select: false },
  // Password recovery fields
passwordResetTokenHash: {
    type: String,
    select: false
},

passwordResetExpires: {
    type: Date,
    select: false
},

  age: { type: Number, min: 18, max: 100 },
  gender: String,
  lookingFor: String,
  bio: { type: String, maxlength: 500, default: "" },
  interests: [String],
  photo: { type: String, default: "" },
  photoPublicId: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  isVerified: { type: Boolean, default: false },
  emailVerificationRequired: { type: Boolean, default: false },
  emailVerificationTokenHash: { type: String, select: false },
  emailVerificationExpires: { type: Date, select: false },
  isOnline: { type: Boolean, default: false },
  lastSeen: Date,
  lastLoginAt: Date,
  connections: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  subscription: {
    plan: { type: String, enum: ["free", "premium"], default: "free" },
    interval: { type: String, enum: ["monthly", "yearly"], default: null },
    status: { type: String, enum: ["inactive", "active", "cancelled", "past_due"], default: "inactive" },
    startDate: Date,
    expiryDate: Date,
    flutterwaveSubscriptionId: String,
    paymentPlanId: String,
    cancelAtPeriodEnd: { type: Boolean, default: false }
  },
  likedProfiles: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });
module.exports = mongoose.model("User", userSchema);
