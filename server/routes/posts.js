
const router = require("express").Router();
const multer = require("multer");

const Post = require("../models/Post");
const Activity = require("../models/Activity");
const { protect } = require("../middleware/auth");
const cloudinary = require("../utils/cloudinary");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      /^image\/(jpeg|png|webp)$/.test(file.mimetype) ||
      /^video\/(mp4|webm|quicktime)$/.test(file.mimetype);

    cb(
      allowed
        ? null
        : new Error("Choose a JPG, PNG, WEBP image or MP4, WEBM video."),
      allowed
    );
  }
});

// Upload image or video to Cloudinary.
function uploadPostMedia(buffer, isVideo) {
  return new Promise((resolve, reject) => {
    const options = {
      folder: "realpeoplekonect/community",
      resource_type: isVideo ? "video" : "image"
    };

    if (!isVideo) {
      options.transformation = [
        { width: 1600, height: 1600, crop: "limit" },
        { quality: "auto", fetch_format: "auto" }
      ];
    }

    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

// Optimized video delivery URL.
function optimizedVideoUrl(publicId) {
  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    format: "mp4",
    transformation: [
      {
        width: 1280,
        height: 720,
        crop: "limit"
      },
      {
        quality: "auto:good",
        video_codec: "auto"
      }
    ]
  });
}

// Generate video thumbnail.
function videoPosterUrl(publicId, offset = 0) {
  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    format: "jpg",
    transformation: [
      {
        width: 900,
        height: 600,
        crop: "limit",
        quality: "auto",
        start_offset: String(offset)
      }
    ]
  });
}

// GET COMMUNITY POSTS.
router.get("/", protect, async (req, res) => {
  try {
    const posts = await Post.find({
      status: "published"
    })
      .populate("author", "name photo isOnline")
      .populate("comments.user", "name photo")
      .sort({ createdAt: -1 })
      .limit(60);

    res.json({ posts });

  } catch (err) {
    console.error("LOAD POSTS ERROR:", err);

    res.status(500).json({
      message: "Could not load posts."
    });
  }
});

// CREATE A NEW POST.
// A published community post can be shared by an authenticated member.
router.post("/:id/share", protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Post not found." });
  try {
    const filter = { _id: req.params.id, status: "published" };
    await Post.updateOne({ ...filter, shareToken: { $exists: false } },
      { $set: { shareToken: crypto.randomBytes(24).toString("hex") } });
    const post = await Post.findOne(filter).select("+shareToken");
    if (!post?.shareToken) return res.status(404).json({ message: "Post not found." });
    res.json({ path: "/share/post/" + post.shareToken });
  } catch (err) {
    res.status(500).json({ message: "Could not create share link." });
  }
});

router.post(
  "/",
  protect,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const mediaFile = req.files?.image?.[0];
      const thumbnailFile = req.files?.thumbnail?.[0];

      if (!mediaFile) {
        return res.status(400).json({
          message: "Choose a photo or video to share."
        });
      }

      if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(503).json({
          message: "Media uploads are not configured. Add Cloudinary credentials."
        });
      }

      const mediaType = mediaFile.mimetype.startsWith("video/")
        ? "video"
        : "image";

      const media = await uploadPostMedia(
        mediaFile.buffer,
        mediaType === "video"
      );

      const mediaUrl = mediaType === "video"
        ? optimizedVideoUrl(media.public_id)
        : media.secure_url;

      let mediaPoster = "";
      let mediaPosterPublicId = "";

      if (mediaType === "video") {
        if (thumbnailFile) {
          // Use the custom thumbnail selected by the user.
          const poster = await uploadPostMedia(
            thumbnailFile.buffer,
            false
          );

          mediaPoster = poster.secure_url;
          mediaPosterPublicId = poster.public_id;

        } else {
          // Automatically select a random frame from the video.
          const duration = Number(media.duration) || 1;
          const randomOffset = Math.max(
            0,
            Math.random() * duration * 0.85
          );

          mediaPoster = videoPosterUrl(
            media.public_id,
            randomOffset
          );
        }
      }

      const post = await Post.create({
        author: req.user._id,
        image: mediaType === "image" ? media.secure_url : "",
        imagePublicId: mediaType === "image" ? media.public_id : "",
        mediaType,
        mediaUrl,
        mediaPoster,
        mediaPosterPublicId,
        mediaPublicId: media.public_id,
        caption: req.body.caption || ""
      });

      await Activity.create({
        user: req.user._id,
        type: "post",
        detail: `Published a community ${mediaType} post`
      });

      const populated = await post.populate("author", "name photo");

      req.app.get("io").to("admins").emit("admin:activity", {
        type: "post",
        detail: `${req.user.name} published a ${mediaType} post`,
        createdAt: new Date()
      });

      res.status(201).json({
        post: populated
      });

    } catch (err) {
      console.error("POST MEDIA UPLOAD ERROR:", err);

      res.status(500).json({
        message: "Could not publish post.",
        error: err.message
      });
    }
  }
);

// EDIT A POST.
router.patch(
  "/:id",
  protect,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.status !== "published") {
      return res.status(404).json({
        message: "Post not found."
      });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can only edit your own posts."
      });
    }

    if (typeof req.body.caption === "string") {
      post.caption = req.body.caption.trim();
    }

    const mediaFile = req.files?.image?.[0];
const thumbnailFile = req.files?.thumbnail?.[0];

if (mediaFile) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(503).json({
      message: "Media uploads are not configured."
    });
  }

  const mediaType = mediaFile.mimetype.startsWith("video/")
    ? "video"
    : "image";

  const media = await uploadPostMedia(
    mediaFile.buffer,
    mediaType === "video"
  );

  const oldPublicId = post.mediaPublicId || post.imagePublicId;
  const oldResourceType = post.mediaType === "video" ? "video" : "image";
  const oldPosterPublicId = post.mediaPosterPublicId;

  post.mediaType = mediaType;
  post.mediaUrl = mediaType === "video"
    ? optimizedVideoUrl(media.public_id)
    : media.secure_url;

  post.mediaPublicId = media.public_id;
  post.image = mediaType === "image" ? media.secure_url : "";
  post.imagePublicId = mediaType === "image" ? media.public_id : "";

  if (mediaType === "video") {
    if (thumbnailFile) {
      const poster = await uploadPostMedia(thumbnailFile.buffer, false);
      post.mediaPoster = poster.secure_url;
      post.mediaPosterPublicId = poster.public_id;
    } else {
      const duration = Number(media.duration) || 1;
      const randomOffset = Math.max(0, Math.random() * duration * 0.85);

      post.mediaPoster = videoPosterUrl(media.public_id, randomOffset);
      post.mediaPosterPublicId = "";
    }
  } else {
    post.mediaPoster = "";
    post.mediaPosterPublicId = "";
  }

  if (oldPublicId) {
    try {
      await cloudinary.uploader.destroy(oldPublicId, {
        resource_type: oldResourceType
      });
    } catch (cleanupError) {
      console.error("OLD POST MEDIA CLEANUP ERROR:", cleanupError.message);
    }
  }

  if (oldPosterPublicId) {
    try {
      await cloudinary.uploader.destroy(oldPosterPublicId, {
        resource_type: "image"
      });
    } catch (cleanupError) {
      console.error("OLD POST THUMBNAIL CLEANUP ERROR:", cleanupError.message);
    }
  }
} else if (thumbnailFile && post.mediaType === "video") {
  // Change only the thumbnail without replacing the video.
  const poster = await uploadPostMedia(thumbnailFile.buffer, false);
  const oldPosterPublicId = post.mediaPosterPublicId;

  post.mediaPoster = poster.secure_url;
  post.mediaPosterPublicId = poster.public_id;

  if (oldPosterPublicId) {
    try {
      await cloudinary.uploader.destroy(oldPosterPublicId, {
        resource_type: "image"
      });
    } catch (cleanupError) {
      console.error("OLD POST THUMBNAIL CLEANUP ERROR:", cleanupError.message);
    }
  }
}

    await post.save();

    await Activity.create({
      user: req.user._id,
      type: "post",
      detail: "Edited a community post"
    });

    await post.populate("author", "name photo isOnline");
    await post.populate("comments.user", "name photo");

    res.json({ post });

  } catch (err) {
    console.error("EDIT POST ERROR:", err);

    res.status(500).json({
      message: "Could not update post.",
      error: err.message
    });
  }
});

// DELETE A POST.
router.delete("/:id", protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.status !== "published") {
      return res.status(404).json({
        message: "Post not found."
      });
    }

    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can only delete your own posts."
      });
    }

    const publicId = post.mediaPublicId || post.imagePublicId;
    const posterPublicId = post.mediaPosterPublicId;

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: post.mediaType === "video" ? "video" : "image"
        });
      } catch (cleanupError) {
        console.error(
          "POST MEDIA CLEANUP ERROR:",
          cleanupError.message
        );
      }
    }
    if (posterPublicId) {
  try {
    await cloudinary.uploader.destroy(posterPublicId, {
      resource_type: "image"
    });
  } catch (cleanupError) {
    console.error(
      "POST THUMBNAIL CLEANUP ERROR:",
      cleanupError.message
    );
  }
}

    await post.deleteOne();

    await Activity.create({
      user: req.user._id,
      type: "post",
      detail: "Deleted a community post"
    });

    res.json({
      message: "Post deleted successfully."
    });

  } catch (err) {
    console.error("DELETE POST ERROR:", err);

    res.status(500).json({
      message: "Could not delete post.",
      error: err.message
    });
  }
});

// LIKE OR UNLIKE A POST.
router.post("/:id/like", protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        message: "Post not found."
      });
    }

    const uid = String(req.user._id);

    post.likes = post.likes.some(id => String(id) === uid)
      ? post.likes.filter(id => String(id) !== uid)
      : [...post.likes, req.user._id];

    await post.save();

    await Activity.create({
      user: req.user._id,
      type: "like",
      detail: "Interacted with a post"
    });

    res.json({
      likes: post.likes.length,
      liked: post.likes.some(id => String(id) === uid)
    });

  } catch (err) {
    console.error("LIKE POST ERROR:", err);

    res.status(500).json({
      message: "Could not update like."
    });
  }
});

// COMMENT ON A POST.
router.post("/:id/comments", protect, async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();

    if (!text) {
      return res.status(400).json({
        message: "Write a comment first."
      });
    }

    const post = await Post.findById(req.params.id);

    if (!post || post.status !== "published") {
      return res.status(404).json({
        message: "Post not found."
      });
    }

    post.comments.push({
      user: req.user._id,
      text
    });

    await post.save();

    await Activity.create({
      user: req.user._id,
      type: "comment",
      detail: "Commented on a post"
    });

    await post.populate("comments.user", "name photo");

    res.json({
      comments: post.comments
    });

  } catch (err) {
    console.error("COMMENT POST ERROR:", err);

    res.status(500).json({
      message: "Could not add comment."
    });
  }
});

module.exports = router;
