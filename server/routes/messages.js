const router = require("express").Router();
const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const multer = require("multer");
const cloudinary = require("../utils/cloudinary");
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").split(";")[0].toLowerCase();
    const ok = /^(audio\/(webm|mp4|mpeg|ogg)|video\/(mp4|webm|quicktime))$/.test(mime);
    cb(ok ? null : new Error("Choose a supported audio or video file."), ok);
  }
});

async function connectedUser(currentUser, otherId) {
  if (!mongoose.isValidObjectId(otherId) || String(currentUser._id) === String(otherId)) return null;
  if (!(currentUser.connections || []).some(id => String(id) === String(otherId))) return null;
  return User.findOne({ _id: otherId, status: "active" }).select("name photo isOnline lastSeen");
}

// Return every accepted connection with its latest message and unread count.
router.get("/conversations", protect, async (req, res) => {
  await req.user.populate("connections", "name photo isOnline lastSeen");
  const connections = req.user.connections || [];
  const ids = connections.map(user => user._id);
  if (!ids.length) return res.json({ conversations: [] });

  const messages = await Message.find({
    $or: [
      { sender: req.user._id, recipient: { $in: ids } },
      { recipient: req.user._id, sender: { $in: ids } }
    ]
  }).sort({ createdAt: -1 }).limit(1500).lean();

  const conversations = connections.map(user => {
    const related = messages.filter(message =>
      (String(message.sender) === String(user._id) && String(message.recipient) === String(req.user._id)) ||
      (String(message.sender) === String(req.user._id) && String(message.recipient) === String(user._id))
    );
    return {
      user,
      lastMessage: related[0] || null,
      unreadCount: related.filter(message => String(message.recipient) === String(req.user._id) && !message.readAt).length
    };
  }).sort((a, b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));

  res.json({ conversations });
});

// Load a private conversation and mark messages from the other member as read.

router.get("/:userId", protect, async (req, res) => {
  try {
    const otherUser = await connectedUser(req.user, req.params.userId);
    if (!otherUser) {
      return res.status(403).json({
        message: "You can message members after they accept your connection request."
      });
    }
    // Find messages this user has received but not yet read.
    const unreadMessages = await Message.find({
      sender: otherUser._id,
      recipient: req.user._id,
      readAt: null
    }).select("_id").lean();

    if (unreadMessages.length) {
      const messageIds = unreadMessages.map(message => String(message._id));
      const readAt = new Date();

      // Mark those messages as read.
      await Message.updateMany(
        {
          _id: { $in: unreadMessages.map(message => message._id) },
          readAt: null
        },
        {
          $set: { readAt }
        }
      );

      // Notify the original sender immediately.
      req.app.get("io").to(String(otherUser._id)).emit("message:read", {
        messageIds,
        readerId: String(req.user._id),
        readAt
      });
    }

    // Load the conversation.
    const messages = await Message.find({
      $or: [
        {
          sender: req.user._id,
          recipient: otherUser._id
        },
        {
          sender: otherUser._id,
          recipient: req.user._id
        }
      ]
    }).sort({ createdAt: 1 }).limit(500).lean();

    res.json({ messages, user: otherUser });

  } catch (error) {
    console.error("LOAD MESSAGES ERROR:", error);
    res.status(500).json({
      message: "Could not load conversation."
    });
  }
});


router.post("/", protect, async (req, res) => {
  const recipientId = String(req.body.recipientId || "");
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Message cannot be empty." });
  if (text.length > 3000) return res.status(400).json({ message: "Messages must be 3,000 characters or fewer." });

  const recipient = await connectedUser(req.user, recipientId);
  if (!recipient) return res.status(403).json({ message: "You can message members after they accept your connection request." });

  const message = await Message.create({ sender: req.user._id, recipient: recipient._id, text });
  const payload = {
    _id: message._id,
    sender: String(message.sender),
    recipient: String(message.recipient),
    text: message.text,
    createdAt: message.createdAt,
    readAt: null
  };
  req.app.get("io").to(String(recipient._id)).emit("message:new", payload);
  res.status(201).json({ message: payload });
});



// Send an audio or video attachment to an accepted connection.
router.post("/media", protect, mediaUpload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose an audio or video file." });
    const recipient = await connectedUser(req.user, String(req.body.recipientId || ""));
    if (!recipient) return res.status(403).json({ message: "Media messages are available to accepted connections only." });
    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ message: "Media uploads are not configured." });
    const mediaType = req.file.mimetype.startsWith("audio/") ? "audio" : "video";
    const uploaded = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({
        folder: "realpeoplekonect/chat-media",
        resource_type: "video"
      }, (error, result) => error ? reject(error) : resolve(result)).end(req.file.buffer);
    });
    const message = await Message.create({
      sender: req.user._id, recipient: recipient._id, text: "",
      mediaType, mediaUrl: uploaded.secure_url, mediaPublicId: uploaded.public_id
    });
    const payload = {
      _id: message._id, sender: String(message.sender), recipient: String(message.recipient),
      text: "", mediaType, mediaUrl: message.mediaUrl, createdAt: message.createdAt, readAt: null
    };
    req.app.get("io").to(String(recipient._id)).emit("message:new", payload);
    res.status(201).json({ message: payload });
  } catch (error) {
    console.error("Chat media upload error:", error);
    res.status(500).json({ message: "Could not send media. Please try again." });
  }
});

module.exports = router;
