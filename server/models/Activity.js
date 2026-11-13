
const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: {
    type: String,
    enum: [
      "register",
      "login",
      "logout",
      "online",
      "offline",
      "post",
      "connection",
      "comment",
      "like",
      "admin",
      "email_verified"
    ],
    required: true
  },
  detail: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Activity", activitySchema);
