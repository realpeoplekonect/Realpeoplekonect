const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Please log in to continue." });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-passwordHash +sessionVersion");
    if (!user || user.status === "suspended") return res.status(401).json({ message: "Account unavailable." });
    if (user.role === "news_editor" && decoded.sessionVersion !== (user.sessionVersion || 0)) return res.status(401).json({message:"Your session has expired. Please log in again."});
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}

function protect(req, res, next) {
  return authenticate(req, res, () => {
    if (req.user.role === "news_editor") return res.status(403).json({message:"News editors can only manage news."});
    next();
  });
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Administrator access required." });
  next();
}
function newsOnly(req,res,next) {
  if (!["admin","news_editor"].includes(req.user?.role)) return res.status(403).json({message:"News editor access required."});
  next();
}
module.exports = { authenticate, protect, adminOnly, newsOnly };
