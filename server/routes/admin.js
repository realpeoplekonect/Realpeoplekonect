const router = require("express").Router();
const User = require("../models/User");
const Post = require("../models/Post");
const Activity = require("../models/Activity");
const PremiumPayment = require("../models/PremiumPayment");
const { protect, adminOnly } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
router.use(protect, adminOnly);

// Only full administrators can create or suspend editorial staff.
const editorFields = "name email role status createdAt lastLoginAt";
router.get("/news-editors", async (_req,res) => {
  try {
    const editors = await User.find({role:"news_editor"}).select(editorFields).sort({createdAt:-1});
    res.json({editors});
  } catch { res.status(500).json({message:"Could not load news editors."}); }
});
router.post("/news-editors", async (req,res) => {
  const {name,email,password} = req.body || {};
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedName || normalizedName.length > 70 || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return res.status(400).json({message:"Enter a valid name and email address."});
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password,"utf8") > 72)
    return res.status(400).json({message:"Use a password of at least 12 characters and at most 72 bytes."});
  try {
    const passwordHash = await bcrypt.hash(password,12);
    const editor = await User.create({name:normalizedName,email:normalizedEmail,passwordHash,role:"news_editor",status:"active",isVerified:true,emailVerificationRequired:false});
    await Activity.create({user:req.user._id,type:"admin",detail:`Created news editor ${editor.email}`}).catch(()=>{});
    res.status(201).json({editor:{_id:editor._id,name:editor.name,email:editor.email,role:editor.role,status:editor.status,createdAt:editor.createdAt}});
  } catch(error) {
    if (error.code === 11000) return res.status(409).json({message:"An account with that email already exists."});
    res.status(500).json({message:"Could not create news editor."});
  }
});
router.patch("/news-editors/:id/status", async (req,res) => {
  const status = req.body?.status;
  if (!["active","suspended"].includes(status) || !mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({message:"Invalid editor or status."});
  try {
    const editor = await User.findOneAndUpdate({_id:req.params.id,role:"news_editor"},{$set:{status,isOnline:false},$inc:{sessionVersion:1}},{new:true}).select(editorFields);
    if (!editor) return res.status(404).json({message:"News editor not found."});
    await Activity.create({user:req.user._id,type:"admin",detail:`${status} news editor ${editor.email}`}).catch(()=>{});
    res.json({editor});
  } catch { res.status(500).json({message:"Could not update news editor."}); }
});

router.get("/overview", async (_req, res) => {
  const [totalUsers, onlineUsers, newToday, totalPosts, recentActivity] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", isOnline: true }),
    User.countDocuments({ role: "user", createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
    Post.countDocuments(),
    Activity.find().populate("user", "name email").sort({ createdAt: -1 }).limit(40)
  ]);
  res.json({ totalUsers, onlineUsers, offlineUsers: totalUsers - onlineUsers, newToday, totalPosts, recentActivity });
});
router.get("/users", async (_req, res) => {
  const users = await User.find({ role: "user" }).select("name email age status isOnline lastSeen createdAt lastLoginAt").sort({ createdAt: -1 }).limit(300);
  res.json({ users });
});
router.patch("/users/:id/status", async (req, res) => {
  const status = req.body.status;
  if (!["active", "suspended"].includes(status)) return res.status(400).json({ message: "Invalid status." });
  const user = await User.findOneAndUpdate({_id:req.params.id,role:"user"}, { status }, { new: true }).select("name email status");
  if (!user) return res.status(404).json({ message: "User not found." });
  await Activity.create({ user: req.user._id, type: "admin", detail: `${status} account ${user.email}` });
  res.json({ user });
});
router.get("/posts", async (_req, res) => {
  const posts = await Post.find().populate("author", "name email").sort({ createdAt: -1 }).limit(100);
  res.json({ posts });
});
router.patch("/posts/:id/hide", async (req, res) => {
  const post = await Post.findByIdAndUpdate(req.params.id, { status: "hidden" }, { new: true });
  if (!post) return res.status(404).json({ message: "Post not found." });
  res.json({ message: "Post hidden." });
});
module.exports = router;

router.get("/premium", async (_req, res) => {
  const [activeMembers, expiredMembers, payments, revenue, members] = await Promise.all([
    User.countDocuments({ "subscription.plan": "premium", "subscription.status": "active", $or: [{ "subscription.expiryDate": null }, { "subscription.expiryDate": { $gt: new Date() } }] }),
    User.countDocuments({ "subscription.plan": "premium", "subscription.expiryDate": { $lte: new Date() } }),
    PremiumPayment.countDocuments({ status: "successful" }),
    PremiumPayment.aggregate([{ $match: { status: "successful" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    User.find({ "subscription.plan": "premium" }).select("name email subscription").sort({ "subscription.expiryDate": -1 }).limit(200)
  ]);
  res.json({ activeMembers, expiredMembers, payments, revenue: revenue[0]?.total || 0, members });
});
