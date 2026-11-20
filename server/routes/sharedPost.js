const router = require("express").Router();
const Post = require("../models/Post");
const GalleryPhoto = require("../models/GalleryPhoto");
const cloudinary = require("../utils/cloudinary");

const esc = value => String(value || "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function httpsUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
}

router.get("/:token", async (req, res) => {
  const gallery = req.baseUrl === "/share/gallery";
  if (!(gallery ? /^[a-f0-9]{24}$/ : /^[a-f0-9]{48}$/).test(req.params.token)) return res.status(404).send("Media not found.");
  try {
    let post;
    if (gallery) {
      const photo = await GalleryPhoto.findById(req.params.token)
        .select("owner caption image video thumbnail videoPublicId").populate("owner", "name status");
      if (photo?.owner?.status === "active") post = {
        author: photo.owner, caption: photo.caption, mediaType: photo.video ? "video" : "image",
        mediaUrl: photo.video || photo.image, mediaPoster: photo.thumbnail, mediaPublicId: photo.videoPublicId
      };
    } else {
      post = await Post.findOne({ shareToken: req.params.token, status: "published" })
        .select("author caption mediaType mediaUrl image mediaPoster mediaPublicId").populate("author", "name status");
      if (post?.author?.status !== "active") post = null;
    }
    if (!post) return res.status(404).send("This post is no longer available.");
    const media = httpsUrl(post.mediaUrl || post.image);
    const video = post.mediaType === "video";
    let preview = video ? httpsUrl(post.mediaPoster) : media;
    if (video && !preview && post.mediaPublicId && process.env.CLOUDINARY_CLOUD_NAME) {
      preview = httpsUrl(cloudinary.url(post.mediaPublicId, {
        resource_type: "video", secure: true, format: "jpg",
        transformation: [{ width: 1200, crop: "limit", start_offset: "0" }]
      }));
    }
    const title = esc((post.author?.name || "A member") + " on PEOKONECT");
    const description = esc((post.caption || "Discover this moment on PEOKONECT.").slice(0, 180));
    const canonical = esc((process.env.CLIENT_URL || (req.protocol + "://" + req.get("host"))).replace(/\/$/, "") + req.baseUrl + "/" + req.params.token);
    res.set("Cache-Control", "no-store");
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${title}</title><meta property="og:type" content="${video ? "video.other" : "website"}">
      <meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
      <meta property="og:url" content="${canonical}"><meta name="twitter:card" content="summary_large_image">
      ${preview ? `<meta property="og:image" content="${esc(preview)}"><meta name="twitter:image" content="${esc(preview)}">` : ""}
      ${video && media ? `<meta property="og:video" content="${esc(media)}"><meta property="og:video:type" content="video/mp4">` : ""}
      <link rel="stylesheet" href="/css/styles.css"></head><body><main class="shared-post-view">
      <a href="/index.html"><img width="140" src="/Images/realpeoplekonekt-logo.png" alt="PEOKONECT"></a>
      <article class="card"><h1>${title}</h1><p>${esc(post.caption)}</p>
      ${video ? `<video src="${esc(media)}" poster="${esc(preview)}" controls autoplay muted playsinline></video><p>Tap the speaker icon to enable sound.</p>` : `<img src="${esc(media)}" alt="Shared community photo">`}
      <a class="btn btn-primary" href="/community.html">Open PEOKONECT community ↗</a></article></main></body></html>`);
  } catch (error) {
    res.status(500).send("Could not open this post.");
  }
});

module.exports = router;
