
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  text: {
    type: String,
    maxlength: 3000,
    trim: true,
    default: ""
  },
  mediaType: {
    type: String,
    enum: ["image", "audio", "video"],
    default: null
  },
  mediaUrl: {
    type: String,
    default: ""
  },
  mediaPublicId: {
    type: String,
    default: ""
  },
  readAt: Date
}, { timestamps: true });

module.exports = mongoose.model("Message", schema);
