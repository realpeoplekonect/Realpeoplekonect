const router = require("express").Router();
const User = require("../models/User");
const Activity = require("../models/Activity");
const ConnectionRequest = require("../models/ConnectionRequest");
const GalleryPhoto = require("../models/GalleryPhoto");
const multer = require("multer");
const cloudinary = require("../utils/cloudinary");
const { protect } = require("../middleware/auth");
const { active: isPremium, ProfileView } = require("./premium");



const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 10
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error(
        "Invalid image format. Please upload JPG, PNG or WEBP."
      ));
    }

    cb(null, true);
  }
});

// Handle Multer errors before they reach the upload routes.
function handleUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            message: "Image is too large. Maximum size is 8MB."
          });
        }

        if (err.code === "LIMIT_FILE_COUNT" ||
            err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            message: "Maximum of 10 gallery photos allowed per upload."
          });
        }
      }

      return res.status(400).json({
        message: err.message || "Image upload validation failed."
      });
    });
  };
}

// Upload image to Cloudinary.
function uploadImage(buffer, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [
          {
            width: 1800,
            height: 1800,
            crop: "limit"
          },
          {
            quality: "auto",
            fetch_format: "auto"
          }
        ]
      },
      (error, result) => {
        if (error) return reject(error);

        if (!result || !result.secure_url) {
          return reject(new Error(
            "Cloudinary did not return an image URL."
          ));
        }

        resolve(result);
      }
    ).end(buffer);
  });
}

// Check Cloudinary configuration.
function cloudinaryReady(res) {
  const configured =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (!configured) {
    res.status(503).json({
      message: "Image upload is unavailable. Cloudinary configuration is missing."
    });

    return false;
  }

  return true;
}




router.get("/discover", protect, async (req, res) => {
  const filter = { _id: { $ne: req.user._id }, role: "user", status: "active" };
  const q = String(req.query.q || "").trim().slice(0, 80);
  if ((q || req.query.gender) && !isPremium(req.user)) return res.status(403).json({ message: "Advanced search is a Premium feature." });
  if (q) filter.$or = [
    { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    { bio: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    { interests: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
  ];
  if (req.query.gender) filter.gender = String(req.query.gender).slice(0, 30);
  const users = await User.find(filter)
    .select("name age gender lookingFor bio interests photo isOnline lastSeen subscription")
    .sort({ "subscription.status": -1, isOnline: -1, createdAt: -1 }).limit(isPremium(req.user) ? 120 : 80);
  const connectedIds = new Set((req.user.connections || []).map(id => String(id)));
  res.json({ users: users.map(user => ({ ...user.toObject(), isPremium: isPremium(user), isConnected: connectedIds.has(String(user._id)) })) });
});


router.get("/connections", protect, async (req, res) => {
  await req.user.populate("connections", "name age bio photo isOnline lastSeen");
  res.json({ connections: req.user.connections || [] });
});

// ============================================
// CHECK CONNECTION STATUS BEFORE AUDIO/VIDEO CALL
// ============================================

router.get("/connection-status/:id", protect, async (req, res) => {
  try {
    const otherUserId = req.params.id;

    if (String(req.user._id) === String(otherUserId)) {
      return res.status(400).json({
        connected: false,
        status: "self",
        message: "You cannot call yourself."
      });
    }

    const otherUser = await User.findOne({
      _id: otherUserId,
      role: "user",
      status: "active"
    }).select("_id connections");

    if (!otherUser) {
      return res.status(404).json({
        connected: false,
        status: "unavailable",
        message: "Member not found."
      });
    }

    const myConnections = (req.user.connections || [])
      .map(id => String(id));

    const theirConnections = (otherUser.connections || [])
      .map(id => String(id));

    // Both users must have each other in their connections.
    const connected =
      myConnections.includes(String(otherUser._id)) &&
      theirConnections.includes(String(req.user._id));

    if (connected) {
      return res.json({
        connected: true,
        status: "connected"
      });
    }

    // Check existing connection requests.
    const requests = await ConnectionRequest.find({
      $or: [
        {
          from: req.user._id,
          to: otherUser._id
        },
        {
          from: otherUser._id,
          to: req.user._id
        }
      ]
    }).sort({ createdAt: -1 }).lean();

    const outgoingPending = requests.some(request =>
      String(request.from) === String(req.user._id) &&
      request.status === "pending"
    );

    const incomingPending = requests.some(request =>
      String(request.from) === String(otherUser._id) &&
      request.status === "pending"
    );

    const declined = requests.some(request =>
      request.status === "declined"
    );

    let status = "none";

    if (outgoingPending) {
      status = "outgoing_pending";
    } else if (incomingPending) {
      status = "incoming_pending";
    } else if (declined) {
      status = "declined";
    }

    return res.json({
      connected: false,
      status
    });

  } catch (error) {
    console.error("CALL CONNECTION CHECK ERROR:", error);

    return res.status(500).json({
      connected: false,
      status: "error",
      message: "Unable to verify connection."
    });
  }
});


router.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id).select("name age gender lookingFor bio interests photo isOnline lastSeen subscription");
  if (!user) return res.status(404).json({ message: "User not found." });
  // Record authenticated profile visits, excluding self-views; only the profile owner can read the list.
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (String(decoded.id) !== String(user._id)) {
        await ProfileView.create({ viewer: decoded.id, viewed: user._id });
      }
    } catch {}
  }
  const premium = user.subscription?.plan === "premium" && user.subscription?.status === "active" &&
    (!user.subscription.expiryDate || new Date(user.subscription.expiryDate) > new Date());
  res.json({ user: { ...user.toObject(), isPremium: premium } });
});
router.patch("/profile/me", protect, async (req, res) => {
  const allowed = ["name", "age", "gender", "lookingFor", "bio", "interests"];
  for (const key of allowed) if (req.body[key] !== undefined) req.user[key] = req.body[key];
  await req.user.save();
  res.json({ user: req.user });
});



router.post(
  "/profile/photo",
  protect,
  handleUpload(upload.single("photo")),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Please select a profile image."
        });
      }

      if (!cloudinaryReady(res)) return;

      const result = await uploadImage(
        req.file.buffer,
        "linkup/profile-photos"
      );

      const oldPhotoPublicId = req.user.photoPublicId;

      req.user.photo = result.secure_url;
      req.user.photoPublicId = result.public_id;

      await req.user.save();

      // Remove the previous Cloudinary image after saving the new one.
      if (oldPhotoPublicId) {
        await cloudinary.uploader.destroy(oldPhotoPublicId)
          .catch(error => {
            console.error("Old profile image cleanup error:", error.message);
          });
      }

      return res.status(200).json({
        success: true,
        message: "Profile photo uploaded successfully.",
        photo: req.user.photo,
        user: req.user
      });

    } catch (error) {
      console.error("PROFILE PHOTO UPLOAD ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Could not upload profile photo.",
        error: error.message
      });
    }
  }
);
router.post(
  "/profile/gallery",
  protect,
  handleUpload(upload.array("photos", 10)),
  async (req, res) => {
    const uploadedImages = [];

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          message: "Please select at least one photo."
        });
      }

      if (!cloudinaryReady(res)) return;

      // Upload all selected images.
      const results = await Promise.allSettled(
        req.files.map(file =>
          uploadImage(file.buffer, "linkup/profile-gallery")
        )
      );

      const failed = results.find(
        result => result.status === "rejected"
      );

      // Collect successful Cloudinary uploads.
      results.forEach(result => {
        if (result.status === "fulfilled") {
          uploadedImages.push(result.value);
        }
      });

      // If any upload failed, remove successful temporary uploads.
      if (failed) {
        await Promise.all(
          uploadedImages.map(image =>
            cloudinary.uploader.destroy(image.public_id)
              .catch(() => {})
          )
        );

        throw failed.reason;
      }

      const photos = uploadedImages.map(image => ({
        owner: req.user._id,
        image: image.secure_url,
        imagePublicId: image.public_id,
        caption: String(req.body.caption || "").slice(0, 500)
      }));

      const savedPhotos = await GalleryPhoto.insertMany(photos);

      return res.status(201).json({
        success: true,
        message: "Gallery photos uploaded successfully.",
        photos: savedPhotos
      });

    } catch (error) {
      console.error("GALLERY UPLOAD ERROR:", error);

      // Clean up uploaded Cloudinary images if database saving fails.
      await Promise.all(
        uploadedImages.map(image =>
          cloudinary.uploader.destroy(image.public_id)
            .catch(() => {})
        )
      );

      return res.status(500).json({
        success: false,
        message: "Could not upload gallery photos.",
        error: error.message
      });
    }
  }
);





router.get("/:id/gallery", async (req, res) => { const owner = await User.findById(req.params.id).select("_id"); if (!owner) return res.status(404).json({ message: "Profile not found." }); const photos = await GalleryPhoto.find({ owner: owner._id }).populate("owner", "name photo").populate("comments.user", "name photo").sort({ createdAt: -1 }).limit(100); res.json({ photos }); });
router.post("/gallery/:photoId/like", protect, async (req, res) => { const photo = await GalleryPhoto.findById(req.params.photoId); if (!photo) return res.status(404).json({ message: "Photo not found." }); const uid = String(req.user._id); const liked = photo.likes.some(id => String(id) === uid); photo.likes = liked ? photo.likes.filter(id => String(id) !== uid) : [...photo.likes, req.user._id]; await photo.save(); res.json({ liked: !liked, likes: photo.likes.length }); });
router.post("/gallery/:photoId/comments", protect, async (req, res) => { const text = String(req.body.text || "").trim(); if (!text) return res.status(400).json({ message: "Write a comment first." }); const photo = await GalleryPhoto.findById(req.params.photoId); if (!photo) return res.status(404).json({ message: "Photo not found." }); photo.comments.push({ user: req.user._id, text: text.slice(0, 500) }); await photo.save(); await photo.populate("comments.user", "name photo"); res.json({ comments: photo.comments }); });
router.delete("/gallery/:photoId", protect, async (req, res) => { const photo = await GalleryPhoto.findOne({ _id: req.params.photoId, owner: req.user._id }); if (!photo) return res.status(404).json({ message: "Photo not found or you do not own it." }); if (photo.imagePublicId) await cloudinary.uploader.destroy(photo.imagePublicId).catch(() => {}); await photo.deleteOne(); res.json({ message: "Photo removed from your gallery." }); });

router.post("/:id/connect", protect, async (req, res) => {
  if (String(req.user._id) === req.params.id) return res.status(400).json({ message: "You cannot connect with yourself." });
  const premium = isPremium(req.user);
  if (!premium) {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const sentToday = await ConnectionRequest.countDocuments({ from: req.user._id, createdAt: { $gte: since } });
    if (sentToday >= 5) return res.status(403).json({ message: "Free members can send 5 connection requests per day. Upgrade to Premium for unlimited requests." });
  }
  try {
    const request = await ConnectionRequest.create({ from: req.user._id, to: req.params.id });
    await Activity.create({ user: req.user._id, type: "connection", detail: "Sent a connection request" });
    req.app.get("io").to(String(req.params.id)).emit("connection:new", { from: req.user._id, name: req.user.name });
    res.status(201).json({ request });
  } catch { res.status(409).json({ message: "A connection request already exists." }); }
});


router.get("/connections/requests", protect, async (req, res) => {
  const requests = await ConnectionRequest.find({ to: req.user._id, status: "pending" }).populate("from", "name photo age bio");
  res.json({ requests });
});


// Get pending connection request notification count
router.get("/connections/requests/count", protect, async (req, res) => {
  try {
    const count = await ConnectionRequest.countDocuments({
      to: req.user._id,
      status: "pending"
    });

    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error("Connection notification count error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch notification count"
    });
  }
});
router.post("/connections/:id/respond", protect, async (req, res) => {
  const request = await ConnectionRequest.findOne({ _id: req.params.id, to: req.user._id, status: "pending" });
  if (!request) return res.status(404).json({ message: "Request not found." });
  request.status = req.body.accept ? "accepted" : "declined";
  await request.save();
  if (req.body.accept) {
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { connections: request.from } });
    await User.findByIdAndUpdate(request.from, { $addToSet: { connections: req.user._id } });
    req.app.get("io").to(String(request.from)).emit("connection:accepted", { userId: String(req.user._id), name: req.user.name });
  }
  res.json({ message: req.body.accept ? "Connection accepted." : "Request declined." });
});
module.exports = router;
