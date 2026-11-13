const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  viewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  viewed: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  viewedAt: { type: Date, default: Date.now }
}, { timestamps: true });
schema.index({ viewer: 1, viewed: 1, viewedAt: -1 });
module.exports = mongoose.model("ProfileView", schema);
