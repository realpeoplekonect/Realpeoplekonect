require("dotenv").config();
const cloudinary = require("./utils/cloudinary");
const express = require("express");
const http = require("http");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Activity = require("./models/Activity");
const Message = require("./models/Message");
const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const userRoutes = require("./routes/users");
const adminRoutes = require("./routes/admin");
const messageRoutes = require("./routes/messages");
const premiumRoutes = require("./routes/premium");
const { protect } = require("./middleware/auth");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || true } });

app.set("io", io);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/share/post", require("./routes/sharedPost"));
app.use("/share/gallery", require("./routes/sharedPost"));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
// Social preview page: gives WhatsApp/Facebook/etc. a profile title, description and image.
app.get("/share/profile/:id", async (req, res) => {
  try {
    const User = require("./models/User");
    const user = await User.findById(req.params.id).select("name bio photo");
    if (!user) return res.status(404).send("Profile not found");
    const esc = value => String(value || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
    const title = `${esc(user.name)} on PEOKONECT`;
    const description = esc((user.bio || "See this member's profile and photo gallery on PEOKONECT.").slice(0, 180));
    const image = esc(user.photo || "https://placehold.co/1200x630/191919/ff8129?text=PEOKONECT");
    const target = `/ ?profile=${encodeURIComponent(String(user._id))}`.replace("/ ?", "/?");
    res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><meta property="og:type" content="profile"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${image}"><meta property="og:url" content="${req.protocol}://${req.get("host")}${req.originalUrl}"><meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0;url=${target}"></head><body><p>Opening PEOKONECT profile...</p><script>location.replace(${JSON.stringify(target)});</script></body></html>`);
  } catch (err) { res.status(500).send("Could not load profile preview"); }
});
app.use(express.static(path.join(__dirname, "../public"), {
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) res.setHeader("Cache-Control", "no-cache, must-revalidate");
  }
}));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "PEOKONECT API" }));
app.get("/api/calls/ice-config", protect, (_req, res) => {
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ];
  if (process.env.TURN_SERVER_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_SERVER_URL.split(",").map(value => value.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }
  res.set("Cache-Control", "no-store");
  res.json({ iceServers });
});
app.use("/api/auth", authRoutes);
app.use("/api/premium", premiumRoutes.router);
app.use("/api/posts", postRoutes);
app.use("/api/news", require("./routes/news"));
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/messages", messageRoutes);

const onlineUsers = new Map();
const activeCalls = new Map();

// One server-owned finalization path prevents duplicate chat history entries.
async function finishCall(call, reason) {
  if (activeCalls.get(call.callId) !== call) return;
  activeCalls.delete(call.callId);
  const connected = call.status === "connected";
  const outcome = connected ? (reason === "disconnected" ? "disconnected" : "completed")
    : reason === "rejected" ? "declined" : reason === "cancelled" ? "cancelled" : "missed";
  const durationSeconds = connected ? Math.max(0, Math.floor((Date.now() - call.acceptedAt) / 1000)) : 0;
  io.to(call.callerId).to(call.recipientId).emit("call:ended", { callId: call.callId, reason });
  try {
    const message = await Message.create({
      sender: call.callerId, recipient: call.recipientId,
      text: `${call.mediaType === "video" ? "Video" : "Audio"} call · ${outcome}`,
      callLog: { kind: call.mediaType, outcome, durationSeconds }
    });
    io.to(call.callerId).to(call.recipientId).emit("message:new", message.toObject());
  } catch (error) {
    console.error("CALL HISTORY ERROR:", error.message);
  }
}


// ============================================
// VERIFY ACCEPTED CONNECTIONS FOR CALLING
// ============================================

async function areAcceptedConnections(firstId, secondId) {
  if (
    !firstId ||
    !secondId ||
    String(firstId) === String(secondId)
  ) {
    return false;
  }

  const users = await User.find({
    _id: { $in: [firstId, secondId] },
    role: "user",
    status: "active"
  }).select("_id connections");

  if (users.length !== 2) {
    return false;
  }

  const first = users.find(
    user => String(user._id) === String(firstId)
  );

  const second = users.find(
    user => String(user._id) === String(secondId)
  );

  if (!first || !second) {
    return false;
  }

  const firstConnected = (first.connections || []).some(
    id => String(id) === String(secondId)
  );

  const secondConnected = (second.connections || []).some(
    id => String(id) === String(firstId)
  );

  return firstConnected && secondConnected;
}


io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error("Missing token");
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select("_id name role status");
    if (!user || user.status !== "active") throw new Error("Account unavailable");
    socket.user = user;
    next();
  } catch {
    next(new Error("Authentication required"));
  }
});

io.on("connection", async socket => {
  if (!socket.user) return;
  const id = String(socket.user._id);
  onlineUsers.set(id, socket.id);
  socket.join(id);
  require("./utils/chatTyping")(socket, io, async (senderId, recipientId) => {
    // Match the private-message route's permissions, independently of calling rules.
    const sender = await User.findOne({_id:senderId,status:"active",connections:recipientId}).select("_id");
    return !!sender && !!(await User.exists({_id:recipientId,status:"active"}));
  });
  io.emit("presence:update", { userId: id, isOnline: true });
  if (socket.user.role === "admin") socket.join("admins");
  // Presence bookkeeping must never delay or prevent registration of call listeners.
  void (async () => {
    try {
      await User.findByIdAndUpdate(id, { isOnline: true, lastSeen: new Date() });
      await Activity.create({ user: id, type: "online", detail: "User came online" });
    } catch (error) {
      console.error("PRESENCE UPDATE ERROR:", error.message);
    }
  })();

  socket.on("message:send", async payload => {
    // Message persistence and authorization are handled by the REST endpoint.
    // This event only relays a message already accepted by that endpoint.
    if (!payload?.recipientId || !payload?.messageId) return;
    io.to(String(payload.recipientId)).emit("message:new", payload);
  });

  
// ============================================
// START AUDIO / VIDEO CALL
// ONLY ACCEPTED CONNECTIONS CAN CALL
// ============================================

socket.on("call:initiate", async ({
  recipientId,
  callId,
  mediaType
} = {}) => {

  try {

    if (
      !recipientId ||
      !callId ||
      !["audio", "video"].includes(mediaType)
    ) {
      socket.emit("call:error", { callId, message: "Invalid call request. Please try again." });
      return;
    }

    if (
      String(recipientId) === id ||
      activeCalls.has(String(callId))
    ) {
      socket.emit("call:error", { callId, message: "This call cannot be started. Please try again." });
      return;
    }

    // Verify the recipient.
    const recipient = await User.findOne({
      _id: recipientId,
      role: "user",
      status: "active"
    }).select("_id name");

    if (!recipient) {
      socket.emit("call:error", {
        message: "This member is unavailable."
      });
      return;
    }

    // CRITICAL CONNECTION CHECK.
    const allowed = await areAcceptedConnections(
      id,
      recipientId
    );

    if (!allowed) {
      socket.emit("call:error", {
        message:
          "Connect with this member first. Your connection request must be accepted before making a call."
      });
      return;
    }

    // Check caller.
    const caller = await User.findById(id)
      .select("_id name role status");

    if (!caller || caller.role !== "user" ||
        caller.status !== "active") {
      socket.emit("call:error", { callId, message: "Your account is not available for calls." });
      return;
    }

    // Create call session.
    if (!socket.connected) return;
    if (activeCalls.has(String(callId))) return;
    const session = {
      callId: String(callId),
      callerId: id,
      recipientId: String(recipientId),
      mediaType,
      status: "ringing",
      createdAt: Date.now()
    };

    activeCalls.set(String(callId), session);

    if (!onlineUsers.has(String(recipientId))) {
      await finishCall(session, "no-answer");
      return;
    }

    setTimeout(() => {
      if (activeCalls.get(session.callId) !== session || session.status !== "ringing") return;
      void finishCall(session, "no-answer");
    }, 35000).unref();

    // Notify recipient.
    io.to(String(recipientId)).emit("call:incoming", {
      callId: session.callId,
      callerId: id,
      callerName: caller.name,
      mediaType
    });

    socket.emit("call:ringing", {
      callId: session.callId,
      recipientName: recipient.name
    });

  } catch (error) {

    console.error("CALL INITIATION ERROR:", error);

    socket.emit("call:error", {
      message: "Could not start the call."
    });
  }
});

socket.on("call:accept", async ({ callId } = {}) => {
  const call = activeCalls.get(String(callId));
  if (
    !call ||
    call.recipientId !== id ||
    call.status !== "ringing"
  ) {
    return;
  }
  const allowed = await areAcceptedConnections(
    call.callerId,
    call.recipientId
  );
  if (activeCalls.get(call.callId) !== call || call.status !== "ringing") return;
  if (!allowed) {
    io.to(call.callerId).emit("call:error", {
      message: "Connection is no longer valid."
    });

    socket.emit("call:error", {
      message: "You must be accepted connections before calling."
    });
    await finishCall(call, "cancelled");
    return;
  }
  call.status = "connected";
  call.acceptedAt = Date.now();
  io.to(call.callerId).emit("call:accepted", {
    callId: call.callId
  });
});


  socket.on("call:reject", ({ callId } = {}) => {
    const call = activeCalls.get(String(callId));
    if (!call || call.recipientId !== id || call.status !== "ringing") return;
    void finishCall(call, "rejected");
  });

 
socket.on("call:signal", async ({ callId, signal } = {}) => {
  const call = activeCalls.get(String(callId));
  if (
    !call ||
    call.status !== "connected" ||
    !signal
  ) {
    return;
  }
  const otherId =
    call.callerId === id
      ? call.recipientId
      : call.recipientId === id
        ? call.callerId
        : null;
  if (!otherId) return;

  // Verify connection again before relaying WebRTC signals.
  const allowed = await areAcceptedConnections(
    call.callerId,
    call.recipientId
  );
  if (activeCalls.get(call.callId) !== call) return;
  if (!allowed) {
    io.to(call.callerId).emit("call:error", {
      message: "Connection ended. Call stopped."
    });
    io.to(call.recipientId).emit("call:error", {
      message: "Connection ended. Call stopped."
    });
    await finishCall(call, "disconnected");
    return;
  }
  io.to(otherId).emit("call:signal", {
    callId: call.callId,
    signal
  });
});

  socket.on("call:end", ({ callId } = {}) => {
    const call = activeCalls.get(String(callId));
    if (!call || ![call.callerId, call.recipientId].includes(id)) return;
    void finishCall(call, call.status === "ringing" ? "cancelled" : "ended");
  });

  socket.on("disconnect", async () => {
    if (onlineUsers.get(id) !== socket.id) return;
    for (const call of activeCalls.values()) {
      if (call.callerId === id || call.recipientId === id) {
        void finishCall(call, "disconnected");
      }
    }
    if (onlineUsers.get(id) === socket.id) {
      onlineUsers.delete(id);
      await User.findByIdAndUpdate(id, { isOnline: false, lastSeen: new Date() });
      await Activity.create({ user: id, type: "offline", detail: "User went offline" });
      io.emit("presence:update", { userId: id, isOnline: false });
    }
  });
});

app.locals.onlineUsers = onlineUsers;

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (!exists) {
    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({
      name: process.env.ADMIN_NAME || "PEOKONECT Administrator",
      email: email.toLowerCase(), passwordHash, role: "admin",
      isVerified: true, bio: "Platform administrator"
    });
    console.log("PEOKONECT admin account created from environment settings.");
  }
}

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("MongoDB connected");
    await seedAdmin();
    server.listen(PORT, () => console.log(`PEOKONECT running on port ${PORT}`));
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });



  //clouinary testing code
  app.get("/test-cloudinary", async (req, res) => {
  try {
    const result = await cloudinary.api.ping();

    res.json({
      success: true,
      message: "Cloudinary connection successful",
      result
    });
  } catch (error) {
    console.error("CLOUDINARY TEST ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
