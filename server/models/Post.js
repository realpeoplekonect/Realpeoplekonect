const mongoose = require("mongoose");
const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  image: { type: String, default: "" },
  imagePublicId: String,
  mediaType: { type: String, enum: ["image", "video"], default: "image" },
  mediaUrl: { type: String, default: "" },
  mediaPoster: { type: String, default: "" },
  mediaPublicId: String,
  caption: { type: String, maxlength: 1000, default: "" },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ["published", "hidden"], default: "published" }
}, { timestamps: true });
module.exports = mongoose.model("Post", postSchema);
