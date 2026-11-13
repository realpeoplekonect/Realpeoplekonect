
const router = require("express").Router();
const multer = require("multer");

const Post = require("../models/Post");
const Activity = require("../models/Activity");
const { protect } = require("../middleware/auth");
const cloudinary = require("../utils/cloudinary");

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
function videoPosterUrl(publicId) {
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
        start_offset: "0"
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
router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Choose a photo or video to share."
      });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(503).json({
        message: "Media uploads are not configured. Add Cloudinary credentials."
      });
    }

    const mediaType = req.file.mimetype.startsWith("video/")
      ? "video"
      : "image";

    const media = await uploadPostMedia(
      req.file.buffer,
      mediaType === "video"
    );

    const mediaUrl = mediaType === "video"
      ? optimizedVideoUrl(media.public_id)
      : media.secure_url;

    const mediaPoster = mediaType === "video"
      ? videoPosterUrl(media.public_id)
      : "";

    // Create post ONCE.
    const post = await Post.create({
      author: req.user._id,
      image: mediaType === "image" ? media.secure_url : "",
      imagePublicId: mediaType === "image" ? media.public_id : "",
      mediaType,
      mediaUrl,
      mediaPoster,
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
});

// EDIT A POST.
router.patch("/:id", protect, upload.single("image"), async (req, res) => {
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

    if (req.file) {
      if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(503).json({
          message: "Media uploads are not configured."
        });
      }

      const mediaType = req.file.mimetype.startsWith("video/")
        ? "video"
        : "image";

      const media = await uploadPostMedia(
        req.file.buffer,
        mediaType === "video"
      );

      const oldPublicId = post.mediaPublicId || post.imagePublicId;

      const oldResourceType = post.mediaType === "video"
        ? "video"
        : "image";

      post.mediaType = mediaType;

      post.mediaUrl = mediaType === "video"
        ? optimizedVideoUrl(media.public_id)
        : media.secure_url;

      post.mediaPoster = mediaType === "video"
        ? videoPosterUrl(media.public_id)
        : "";

      post.mediaPublicId = media.public_id;

      post.image = mediaType === "image"
        ? media.secure_url
        : "";

      post.imagePublicId = mediaType === "image"
        ? media.public_id
        : "";

      // Remove old media from Cloudinary.
      if (oldPublicId) {
        try {
          await cloudinary.uploader.destroy(oldPublicId, {
            resource_type: oldResourceType
          });
        } catch (cleanupError) {
          console.error(
            "OLD POST MEDIA CLEANUP ERROR:",
            cleanupError.message
          );
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
