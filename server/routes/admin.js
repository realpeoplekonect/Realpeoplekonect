const router = require("express").Router();
const User = require("../models/User");
const Post = require("../models/Post");
const Activity = require("../models/Activity");
const PremiumPayment = require("../models/PremiumPayment");
const { protect, adminOnly } = require("../middleware/auth");
router.use(protect, adminOnly);

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
  const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select("name email status");
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
