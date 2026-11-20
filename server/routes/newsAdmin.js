const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const NewsArticle = require("../models/NewsArticle");
const cloudinary = require("../utils/cloudinary");
const { protect, adminOnly } = require("../middleware/auth");
const categories = ["world", "africa", "business", "technology", "sport"];
const publicFields = "title body category mediaType mediaUrl thumbnailUrl publishedAt updatedAt";
const router = express.Router();

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const videoTypes = ["video/mp4", "video/webm", "video/quicktime"];
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 2, fields: 8, fieldSize: 100 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = imageTypes.includes(file.mimetype) || (file.fieldname === "media" && videoTypes.includes(file.mimetype));
    cb(allowed ? null : new Error("Select JPG, PNG, WEBP or MP4, WEBM, MOV media."), allowed);
  }
}).fields([{name:"media", maxCount:1}, {name:"thumbnail", maxCount:1}]);
function upload(req, res, next) {
  uploader(req, res, error => {
    if (error) return res.status(400).json({message: error.code === "LIMIT_FILE_SIZE" ? "Media must be under 100 MB." : error.message});
    next();
  });
}
function bad(message, status = 400) { return Object.assign(new Error(message), {status}); }
function fields(body = {}) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!title || title.length > 180) throw bad("Enter a headline of 1–180 characters.");
  if (!text || text.length > 20000) throw bad("Enter a story of 1–20,000 characters.");
  if (!categories.includes(body.category)) throw bad("Choose a news category.");
  return {title, body: text, category: body.category};
}
function assets(article) {
  return [
    article?.mediaPublicId && {id:article.mediaPublicId, type:article.mediaType === "video" ? "video" : "image"},
    article?.thumbnailPublicId && {id:article.thumbnailPublicId, type:"image"}
  ].filter(Boolean);
}
async function cleanup(items) {
  const results = await Promise.allSettled(items.map(async item => cloudinary.uploader.destroy(item.id, {resource_type:item.type, invalidate:true})));
  results.forEach(result => { if (result.status === "rejected") console.error("News media cleanup:", result.reason?.message); });
}
async function uploadFile(file, type, uploaded) {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)
    throw bad("Media uploads are not configured.", 503);
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      folder:"peokonect/news", resource_type:type,
      ...(type === "video" ? {format:"mp4", transformation:[{video_codec:"h264",audio_codec:"aac"}]} :
        {transformation:[{width:1600,height:1600,crop:"limit",quality:"auto"}]})
    }, (error, value) => error ? reject(error) : resolve(value)).end(file.buffer);
  });
  if (result?.public_id) uploaded.push({id:result.public_id,type});
  if (!result?.secure_url || !result?.public_id) throw Error("Media upload failed.");
  return result;
}
const emptyMedia = {mediaType:"none",mediaUrl:"",mediaPublicId:"",thumbnailUrl:"",thumbnailPublicId:""};
async function mediaFields(req, existing, uploaded) {
  let result = existing ? Object.fromEntries(Object.keys(emptyMedia).map(k => [k, existing[k] || emptyMedia[k]])) : {...emptyMedia};
  const file = req.files?.media?.[0];
  const thumbnail = req.files?.thumbnail?.[0];
  if (thumbnail && (thumbnail.size > 10 * 1024 * 1024)) throw bad("Thumbnail must be under 10 MB.");
  if (file) {
    const type = videoTypes.includes(file.mimetype) ? "video" : "image";
    const uploadedMedia = await uploadFile(file, type, uploaded);
    result = {...emptyMedia,mediaType:type,mediaUrl:uploadedMedia.secure_url,mediaPublicId:uploadedMedia.public_id};
    if (type === "video") result.thumbnailUrl = cloudinary.url(uploadedMedia.public_id, {
      secure:true,resource_type:"video",format:"jpg",transformation:[{width:900,height:600,crop:"limit",start_offset:"0"}]
    });
  } else if (req.body.removeMedia === "true") result = {...emptyMedia};
  if (thumbnail) {
    if (result.mediaType !== "video") throw bad("A custom thumbnail is only needed for a video.");
    const poster = await uploadFile(thumbnail, "image", uploaded);
    result.thumbnailUrl = poster.secure_url;
    result.thumbnailPublicId = poster.public_id;
  }
  return result;
}
function errorResponse(res, error) {
  if (error.status) return res.status(error.status).json({message:error.message});
  if (error.name === "VersionError") return res.status(409).json({message:"This story changed. Refresh and try again."});
  console.error("News management:", error.message);
  res.status(500).json({message:"Could not save or load news. Please try again."});
}

router.get("/published", async (req,res) => {
  try {
    const category = String(req.query.category || "world");
    if (!categories.includes(category)) throw bad("Unknown category.");
    const filter = category === "world" ? {} : {category};
    const articles = await NewsArticle.find(filter).select(publicFields).sort({publishedAt:-1,_id:-1}).limit(100).lean();
    res.set("Cache-Control","no-store").json({articles});
  } catch(error) { errorResponse(res,error); }
});
router.use("/admin", protect, adminOnly);
router.get("/admin", async (_req,res) => {
  try {
    const articles = await NewsArticle.find().select(publicFields).sort({publishedAt:-1,_id:-1}).lean();
    res.set("Cache-Control","no-store").json({articles});
  } catch(error) { errorResponse(res,error); }
});
router.post("/admin", upload, async (req,res) => {
  const uploaded = [];
  try {
    const data = fields(req.body);
    const media = await mediaFields(req,null,uploaded);
    const article = await NewsArticle.create({...data,...media,author:req.user._id});
    res.status(201).json({article});
  } catch(error) { await cleanup(uploaded); errorResponse(res,error); }
});
router.patch("/admin/:id", upload, async (req,res) => {
  const uploaded = [];
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad("Story not found.",404);
    const article = await NewsArticle.findById(req.params.id);
    if (!article) throw bad("Story not found.",404);
    const old = assets(article);
    const data = fields(req.body);
    const media = await mediaFields(req,article,uploaded);
    article.set({...data,...media});
    await article.save();
    const retained = new Set(assets(article).map(item=>item.id));
    await cleanup(old.filter(item=>!retained.has(item.id)));
    res.json({article});
  } catch(error) { await cleanup(uploaded); errorResponse(res,error); }
});
router.delete("/admin/:id", async (req,res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad("Story not found.",404);
    const article = await NewsArticle.findByIdAndDelete(req.params.id);
    if (!article) throw bad("Story not found.",404);
    await cleanup(assets(article));
    res.json({message:"Story deleted."});
  } catch(error) { errorResponse(res,error); }
});
module.exports = router;
