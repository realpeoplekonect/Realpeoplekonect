const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Activity = require("../models/Activity");
const { protect } = require("../middleware/auth");

const tokenFor = user => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
const publicUser = user => ({
  _id: user._id, name: user.name, email: user.email, age: user.age,
  gender: user.gender, lookingFor: user.lookingFor, bio: user.bio,
  interests: user.interests, photo: user.photo, role: user.role,
  isOnline: user.isOnline, lastSeen: user.lastSeen, subscription: user.subscription,
  isVerified: user.isVerified
});


async function sendPasswordResetEmail(user, resetUrl) {
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (!smtpUser || !smtpPass) {
        throw new Error("Email configuration is missing.");
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "false") === "true",
        auth: {
            user: smtpUser,
            pass: smtpPass
        }
    });

    await transporter.sendMail({
        from: `PEOKONECT <${process.env.EMAIL_FROM || smtpUser}>`,
        to: user.email,
        subject: "Reset your PEOKONECT password",

        text: `
Hello ${user.name},

We received a request to reset your PEOKONECT password.

Click the link below to create a new password:

${resetUrl}

This link expires in 30 minutes.

If you did not request this, ignore this email.
        `,

        html: `
        <div style="font-family:Arial,sans-serif;
                    max-width:550px;
                    margin:auto;
                    padding:30px;
                    color:#222;">

            <h2>Reset your PEOKONECT password</h2>

            <p>Hello ${String(user.name || "there").replace(/[&<>"']/g, c => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[c]))},</p>

            <p>
                We received a request to reset your PEOKONECT password.
                Click the button below to create a new password.
            </p>

            <a href="${resetUrl}"
               style="display:inline-block;
                      background:#ff8129;
                      color:#17120e;
                      padding:14px 22px;
                      border-radius:8px;
                      text-decoration:none;
                      font-weight:bold;">
                Reset My Password
            </a>

            <p>This link expires in 30 minutes.</p>

            <p>
                If you did not request this password reset,
                you can safely ignore this email.
            </p>

            <p>PEOKONECT Team</p>
        </div>
        `
    });
}


function mailTransport() {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  if (!user || !pass) throw new Error("Email delivery is not configured. Add SMTP_USER and SMTP_PASS (or EMAIL_USER and EMAIL_PASS) to your .env file.");
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: { user, pass }
    });
  }
  return nodemailer.createTransport({ service: process.env.EMAIL_SERVICE || "gmail", auth: { user, pass } });
}



// ========================================
// FORGOT PASSWORD
// ========================================

router.post("/forgot-password", async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        if (!email) {
            return res.status(400).json({
                message: "Please enter your email address."
            });
        }

        const user = await User.findOne({ email });

        // Return the same message whether the account exists or not.
        if (!user) {
            return res.json({
                message: "If an account exists for that email, a password reset link has been sent."
            });
        }

        // Generate a secure random token.
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Store only the SHA-256 hash.
        user.passwordResetTokenHash = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        // Link expires after 30 minutes.
        user.passwordResetExpires = new Date(
            Date.now() + 30 * 60 * 1000
        );

        await user.save();

        const baseUrl = (
            process.env.APP_URL ||
            `${req.protocol}://${req.get("host")}`
        ).replace(/\/$/, "");

        const resetUrl =
            `${baseUrl}/?resetPassword=${resetToken}`;

        try {
            await sendPasswordResetEmail(user, resetUrl);
        } catch (emailError) {
            user.passwordResetTokenHash = undefined;
            user.passwordResetExpires = undefined;
            await user.save();

            console.error(
                "Password reset email error:",
                emailError.message
            );

            return res.status(503).json({
                message: "Unable to send password recovery email. Please try again later."
            });
        }

        return res.json({
            message: "If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder."
        });

    } catch (error) {
        console.error("Forgot password error:", error);

        res.status(500).json({
            message: "Could not process your password recovery request."
        });
    }
});


// ========================================
// RESET PASSWORD
// ========================================

router.post("/reset-password", async (req, res) => {
    try {
        const token = String(req.body.token || "");
        const password = String(req.body.password || "");

        if (!token || password.length < 8) {
            return res.status(400).json({
                message: "Please provide a valid token and a password of at least 8 characters."
            });
        }

        // Hash the token received from the user.
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        // Find the user with a valid, unexpired token.
        const user = await User.findOne({
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: {
                $gt: new Date()
            }
        }).select(
            "+passwordResetTokenHash +passwordResetExpires +passwordHash"
        );

        if (!user) {
            return res.status(400).json({
                message: "This password reset link is invalid or has expired. Please request another link."
            });
        }

        // Hash and save the new password.
        user.passwordHash = await bcrypt.hash(password, 12);

        // Invalidate the reset link after use.
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpires = undefined;

        await user.save();

        return res.json({
            message: "Your password has been reset successfully. You can now log in."
        });

    } catch (error) {
        console.error("Reset password error:", error);

        res.status(500).json({
            message: "Could not reset your password."
        });
    }
});


async function sendVerificationEmail(user, rawToken) {
  const baseUrl = (process.env.APP_URL || process.env.CLIENT_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, "");
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;
  await mailTransport().sendMail({
    from: from ? `PEOKONECT <${from}>` : undefined,
    to: user.email,
    subject: "Confirm your PEOKONECT email address",
    text: `Hello ${user.name},\n\nWelcome to PEOKONECT. Confirm your email address by opening this link:\n${verifyUrl}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#222"><div style="max-width:560px;margin:35px auto;background:#fff;padding:32px;border-radius:14px"><h1 style="margin:0 0 8px;color:#ff8129">Welcome to PEOKONECT</h1><p>Hello ${escapeHtml(user.name)},</p><p>Thanks for creating a PEOKONECT account. Please confirm that this email address belongs to you by clicking below.</p><p style="margin:28px 0"><a href="${verifyUrl}" style="background:#ff8129;color:#17120e;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:bold">Confirm my email</a></p><p style="color:#777;font-size:13px">This link expires in 24 hours. If the button does not work, copy this link into your browser:<br><a href="${verifyUrl}">${verifyUrl}</a></p><p style="color:#777;font-size:13px">If you did not create this account, you can ignore this email.</p></div></body></html>`
  });
}
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function makeVerificationToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: crypto.createHash("sha256").update(raw).digest("hex") };
}

router.post("/register", async (req, res) => {
  try {
    const { name, password, age } = req.body;
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email and password are required." });
    if (Number(age) < 18) return res.status(400).json({ message: "PEOKONECT is for adults aged 18 and above." });
    if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters." });
    if (await User.findOne({ email })) return res.status(409).json({ message: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, 12);
    const verification = makeVerificationToken();
    const user = await User.create({
      name, email, age, passwordHash, isVerified: false, emailVerificationRequired: true,
      emailVerificationTokenHash: verification.hash,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    try {
      await sendVerificationEmail(user, verification.raw);
    } catch (mailError) {
      await User.deleteOne({ _id: user._id });
      console.error("PEOKONECT verification email failed:", mailError.message);
      return res.status(503).json({ message: "Your account could not be completed because the confirmation email could not be sent. Please check the email configuration and try again." });
    }
    await Activity.create({ user: user._id, type: "register", detail: "Created a PEOKONECT account; email confirmation sent" });
    req.app.get("io").to("admins").emit("admin:activity", { type: "register", detail: `${user.name} registered`, createdAt: new Date() });
    res.status(201).json({ message: "Account created. Check your email and click the confirmation link before logging in.", email: user.email, requiresEmailVerification: true });
  } catch (err) { res.status(500).json({ message: "Could not create account.", error: err.message }); }
});

router.get("/verify-email", async (req, res) => {
  const page = (heading, message, ok=false) => res.status(ok ? 200 : 400).type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} | PEOKONECT</title></head><body style="margin:0;background:#f7f7f7;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:20px;box-sizing:border-box"><main style="background:white;max-width:480px;padding:35px;border-radius:16px;text-align:center;box-shadow:0 10px 40px #0001"><h1 style="color:${ok?'#21845a':'#d85d0a'}">${heading}</h1><p style="line-height:1.6;color:#555">${message}</p><a href="/" style="display:inline-block;margin-top:15px;padding:13px 22px;background:#ff8129;color:#17120e;text-decoration:none;border-radius:8px;font-weight:bold">Open PEOKONECT</a></main></body></html>`);
  try {
    const raw = String(req.query.token || "");
    if (!/^[a-f0-9]{64}$/i.test(raw)) return page("Invalid confirmation link", "This email confirmation link is invalid. Request a new confirmation email from PEOKONECT.");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const user = await User.findOne({ emailVerificationTokenHash: hash, emailVerificationExpires: { $gt: new Date() } }).select("+emailVerificationTokenHash +emailVerificationExpires");
    if (!user) return page("Link expired or already used", "This confirmation link is no longer valid. Please request a new confirmation email.");
user.isVerified = true;
user.emailVerificationRequired = true;
user.emailVerificationTokenHash = undefined;
user.emailVerificationExpires = undefined;

await user.save();

// Record the verification activity.
// If activity logging fails, email verification remains successful.
try {
  await Activity.create({
    user: user._id,
    type: "email_verified",
    detail: "Confirmed email address"
  });
} catch (activityError) {
  console.error(
    "Could not record email verification activity:",
    activityError.message
  );
} return page("Email confirmed!", "Your PEOKONECT email address has been verified. You can now log in to your account.", true);
  } catch (err) {
    console.error("Email verification error:", err.message);
    return page("Could not confirm email", "Something went wrong. Please try again or request a new confirmation email.");
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await User.findOne({ email }).select("+emailVerificationTokenHash +emailVerificationExpires");
    const generic = "If this account needs email confirmation, a new link will be sent shortly.";
    if (!user || user.isVerified || !user.emailVerificationRequired) return res.json({ message: generic });
    const verification = makeVerificationToken();
    user.emailVerificationTokenHash = verification.hash;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    await sendVerificationEmail(user, verification.raw);
    res.json({ message: generic });
  } catch (err) {
    console.error("Resend verification failed:", err.message);
    res.status(503).json({ message: "Could not resend the confirmation email. Please try again later." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || "").trim().toLowerCase() }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(req.body.password || "", user.passwordHash))) return res.status(401).json({ message: "Invalid email or password." });
    if (user.status === "suspended") return res.status(403).json({ message: "This account has been suspended. Contact support." });
    if (user.emailVerificationRequired && !user.isVerified) return res.status(403).json({ message: "Please confirm your email address using the link we sent you before logging in." });
    user.lastLoginAt = new Date();
    await user.save();
    await Activity.create({ user: user._id, type: "login", detail: "Successful login" });
    req.app.get("io").to("admins").emit("admin:activity", { type: "login", detail: `${user.name} logged in`, createdAt: new Date() });
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (err) { res.status(500).json({ message: "Login failed.", error: err.message }); }
});

router.get("/me", protect, (req, res) => res.json({ user: req.user }));
router.post("/logout", protect, async (req, res) => {
  await Activity.create({ user: req.user._id, type: "logout", detail: "User logged out" });
  req.app.get("io").to("admins").emit("admin:activity", { type: "logout", detail: `${req.user.name} logged out`, createdAt: new Date() });
  res.json({ message: "Logged out." });
});
module.exports = router;
