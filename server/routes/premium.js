const router = require("express").Router();
const crypto = require("crypto");
const User = require("../models/User");
const PremiumPayment = require("../models/PremiumPayment");
const ProfileView = require("../models/ProfileView");
const { protect } = require("../middleware/auth");

const PRICES = { monthly: 1860, yearly: 17856 };
const PLAN_ENV = { monthly: "FLW_PREMIUM_MONTHLY_PLAN_ID", yearly: "FLW_PREMIUM_YEARLY_PLAN_ID" };
function addBillingPeriod(date, plan) {
  const next = new Date(date);
  if (plan === "yearly") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}
const active = user => user.subscription?.plan === "premium" && user.subscription?.status === "active" &&
  (!user.subscription.expiryDate || new Date(user.subscription.expiryDate) > new Date());
const apiCall = async (url, options = {}) => {
  if (!process.env.FLW_SECRET_KEY) throw new Error("Flutterwave is not configured.");
  const response = await fetch(url, { ...options, headers: {
    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  }});
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === "error") throw new Error(data.message || "Flutterwave request failed.");
  return data;
};

async function applyVerifiedPayment(payment, tx) {
  if (!payment || tx.status !== "successful" || tx.currency !== "NGN" ||
      tx.tx_ref !== payment.reference || Number(tx.amount) < payment.amount) return false;
  if (payment.status === "successful") return true;
  const duplicate = await PremiumPayment.findOne({ transactionId: String(tx.id), _id: { $ne: payment._id } });
  if (duplicate) return false;
  payment.status = "successful";
  payment.transactionId = String(tx.id);
  payment.raw = { id: tx.id, status: tx.status, amount: tx.amount, currency: tx.currency };
  await payment.save();
  const user = await User.findById(payment.user);
  if (!user) return false;
  const now = new Date();
  const currentExpiry = user.subscription?.status === "active" && user.subscription.expiryDate > now
    ? new Date(user.subscription.expiryDate) : now;
  const expiry = addBillingPeriod(currentExpiry, payment.plan);
  user.subscription = {
    ...user.subscription?.toObject?.(),
    plan: "premium", interval: payment.plan, status: "active",
    startDate: user.subscription?.startDate || now, expiryDate: expiry,
    paymentPlanId: process.env[PLAN_ENV[payment.plan]],
    cancelAtPeriodEnd: false
  };
  await user.save();
  return true;
}

router.get("/plans", (_req, res) => res.json({
  plans: [
    { id: "free", name: "Free", amount: 0, interval: "none" },
    { id: "monthly", name: "Premium Monthly", amount: PRICES.monthly, interval: "monthly" },
    { id: "yearly", name: "Premium Yearly", amount: PRICES.yearly, interval: "yearly", discountPercent: 20 }
  ]
}));

router.get("/me", protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.subscription?.plan === "premium" && user.subscription.expiryDate && user.subscription.expiryDate <= new Date()) {
    user.subscription.status = "inactive"; user.subscription.plan = "free"; await user.save();
  }
  res.json({ subscription: user.subscription, isPremium: active(user), prices: PRICES });
});

router.post("/checkout", protect, async (req, res) => {
  try {
    const plan = req.body.plan;
    if (!["monthly", "yearly"].includes(plan)) return res.status(400).json({ message: "Choose a valid subscription plan." });
    if (active(req.user)) return res.status(409).json({ message: "You already have an active Premium membership." });
    const planId = process.env[PLAN_ENV[plan]];
    if (!planId) return res.status(503).json({ message: `Flutterwave ${plan} payment plan is not configured. Add ${PLAN_ENV[plan]}.` });
    const reference = `LINKUP-PREMIUM-${plan.toUpperCase()}-${req.user._id}-${crypto.randomUUID()}`;
    const payment = await PremiumPayment.create({ user: req.user._id, reference, plan, amount: PRICES[plan] });
    const origin = process.env.CLIENT_URL || `${req.protocol}://${req.get("host")}`;
    const checkout = await apiCall("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: reference, amount: PRICES[plan], currency: "NGN",
        redirect_url: `${origin}/premium.html?payment=return`,
        payment_plan: Number(planId),
        payment_options: "card",
        customer: { email: req.user.email, name: req.user.name },
        customizations: { title: "LINKUP Premium", description: `${plan} Premium membership`, logo: `${origin}/favicon.ico` },
        meta: { userId: String(req.user._id), plan, purpose: "linkup_premium" }
      })
    });
    res.json({ checkoutUrl: checkout.data.link, reference });
  } catch (err) { res.status(502).json({ message: err.message || "Could not start checkout." }); }
});

router.post("/verify", protect, async (req, res) => {
  try {
    const reference = String(req.body.reference || "");
    const payment = await PremiumPayment.findOne({ reference, user: req.user._id });
    if (!payment) return res.status(404).json({ message: "Payment reference not found." });
    if (payment.status !== "successful") {
      const txId = String(req.body.transactionId || "");
      if (!/^\d+$/.test(txId)) return res.status(400).json({ message: "Missing Flutterwave transaction ID." });
      const result = await apiCall(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(txId)}/verify`);
      if (!await applyVerifiedPayment(payment, result.data)) return res.status(400).json({ message: "Payment could not be verified." });
    }
    const user = await User.findById(req.user._id);
    res.json({ message: "Premium membership activated.", subscription: user.subscription });
  } catch (err) { res.status(502).json({ message: err.message || "Payment verification failed." }); }
});

router.post("/cancel", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!active(user)) return res.status(400).json({ message: "No active Premium subscription to cancel." });
    const email = encodeURIComponent(user.email);
    const plans = [process.env.FLW_PREMIUM_MONTHLY_PLAN_ID, process.env.FLW_PREMIUM_YEARLY_PLAN_ID].filter(Boolean);
    const query = await apiCall(`https://api.flutterwave.com/v3/subscriptions?email=${email}&status=active`);
    const match = (query.data || []).find(s => plans.includes(String(s.plan)));
    if (!match) return res.status(404).json({ message: "No active Flutterwave subscription was found. You can also cancel from your Flutterwave subscription reminder email." });
    await apiCall(`https://api.flutterwave.com/v3/subscriptions/${match.id}/cancel`, { method: "PUT" });
    user.subscription.cancelAtPeriodEnd = true;
    await user.save();
    res.json({ message: "Automatic renewal cancelled. Premium remains available until the paid period ends.", subscription: user.subscription });
  } catch (err) { res.status(502).json({ message: err.message || "Could not cancel renewal." }); }
});

router.post("/webhook", async (req, res) => {
  try {
    const secret = process.env.FLW_WEBHOOK_SECRET;
    const signature = req.headers["verif-hash"];
    if (!secret || !signature || signature !== secret) return res.status(401).send("Invalid webhook signature");
    const event = req.body?.event;
    const data = req.body?.data || {};
    if (event === "charge.completed" && data.id) {
      const verified = await apiCall(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(data.id))}/verify`);
      const tx = verified.data;
      const payment = await PremiumPayment.findOne({ reference: tx.tx_ref });
      if (payment) await applyVerifiedPayment(payment, tx);
      else if (tx.status === "successful" && tx.currency === "NGN") {
        const user = await User.findOne({ email: String(tx.customer?.email || "").toLowerCase() });
        let plan = String(tx.payment_plan || tx.meta?.payment_plan || "");
        if (!plan && user) {
          const subs = await apiCall(`https://api.flutterwave.com/v3/subscriptions?email=${encodeURIComponent(user.email)}&status=active`);
          plan = String((subs.data || []).find(item =>
            [String(process.env.FLW_PREMIUM_MONTHLY_PLAN_ID), String(process.env.FLW_PREMIUM_YEARLY_PLAN_ID)].includes(String(item.plan))
          )?.plan || "");
        }
        const interval = plan === String(process.env.FLW_PREMIUM_YEARLY_PLAN_ID) ? "yearly" :
          plan === String(process.env.FLW_PREMIUM_MONTHLY_PLAN_ID) ? "monthly" : null;
        if (user && interval) {
          const duplicate = await PremiumPayment.findOne({ transactionId: String(tx.id) });
          if (!duplicate) {
            const now = new Date();
            const expiry = user.subscription?.status === "active" && user.subscription.expiryDate > now ? new Date(user.subscription.expiryDate) : now;
            const nextExpiry = addBillingPeriod(expiry, interval);
            await PremiumPayment.create({ user: user._id, reference: tx.tx_ref || `renewal-${tx.id}`, transactionId: String(tx.id), plan: interval, amount: PRICES[interval], status: "successful" });
            user.subscription.plan = "premium"; user.subscription.interval = interval; user.subscription.status = "active"; user.subscription.expiryDate = nextExpiry;
            await user.save();
          }
        }
      }
    } else if (event === "subscription.cancelled") {
      const email = String(data.customer?.email || "").toLowerCase();
      const user = await User.findOne({ email });
      if (user?.subscription?.expiryDate && user.subscription.expiryDate <= new Date()) {
        user.subscription.status = "cancelled"; user.subscription.plan = "free"; await user.save();
      } else if (user?.subscription) { user.subscription.cancelAtPeriodEnd = true; await user.save(); }
    }
    return res.sendStatus(200);
  } catch (err) {
    console.error("Premium webhook error:", err.message);
    return res.sendStatus(200); // acknowledge; transaction verification can be retried from dashboard/webhook replay
  }
});

router.get("/profile-viewers", protect, async (req, res) => {
  if (!active(req.user)) return res.status(403).json({ message: "Premium membership required." });
  const views = await ProfileView.find({ viewed: req.user._id }).populate("viewer", "name photo").sort({ viewedAt: -1 }).limit(100);
  res.json({ viewers: views });
});
router.get("/profile-likes", protect, async (req, res) => {
  if (!active(req.user)) return res.status(403).json({ message: "Premium membership required." });
  const users = await User.find({ likedProfiles: req.user._id }).select("name photo age bio");
  res.json({ users });
});
router.post("/profile-like/:id", protect, async (req, res) => {
  if (String(req.user._id) === req.params.id) return res.status(400).json({ message: "You cannot like your own profile." });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: "Profile not found." });
  const already = target.likedProfiles.some(id => String(id) === String(req.user._id));
  await User.updateOne({ _id: target._id }, already ? { $pull: { likedProfiles: req.user._id } } : { $addToSet: { likedProfiles: req.user._id } });
  res.json({ liked: !already });
});
module.exports = { router, active, ProfileView };
