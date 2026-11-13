const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reference: { type: String, required: true, unique: true },
  transactionId: { type: String, unique: true, sparse: true },
  plan: { type: String, enum: ["monthly", "yearly"], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "NGN" },
  status: { type: String, enum: ["pending", "successful", "failed"], default: "pending" },
  raw: mongoose.Schema.Types.Mixed
}, { timestamps: true });
module.exports = mongoose.model("PremiumPayment", schema);
