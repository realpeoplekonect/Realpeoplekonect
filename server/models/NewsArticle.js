const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  body: { type: String, required: true, trim: true, maxlength: 20000 },
  category: { type: String, enum: ["world", "africa", "business", "technology", "sport"], required: true },
  mediaType: { type: String, enum: ["none", "image", "video"], default: "none" },
  mediaUrl: { type: String, default: "" },
  mediaPublicId: { type: String, default: "" },
  thumbnailUrl: { type: String, default: "" },
  thumbnailPublicId: { type: String, default: "" },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  publishedAt: { type: Date, default: Date.now }
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ category: 1, publishedAt: -1 });
module.exports = mongoose.model("NewsArticle", schema);
