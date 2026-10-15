const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { validate, z, email, password } = require('../utils/validate');
const { sha256, randomToken, otp6, safeEqual } = require('../utils/crypto');
const { sendMail } = require('../utils/mailer');
const brevo = require('../services/brevo');
const { otpEmail, resetEmail } = require('../utils/emailTemplates');
const { ok } = require('../utils/respond');
const { authenticate } = require('../middleware/auth');
const { COOKIE, BCRYPT_COST, cookieOpts, sendSession, loginWithPassword } = require('../services/session');

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
}));

async function sendOtp(user) {
  const code = otp6();
  user.emailOtpHash = sha256(code);
  user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.emailOtpAttempts = 0;
  user.emailOtpSentAt = new Date();
  await user.save();
  await sendMail({
    to: user.email,
    subject: 'Your Crossed Hearts verification code',
    ...otpEmail(user.name, code),
  });
}
const throttled = (u) => u.emailOtpSentAt && Date.now() - u.emailOtpSentAt < 60 * 1000;

router.post('/register', validate(z.object({ name: z.string().trim().min(1).max(100), email, password })), async (req, res) => {
  const { name, email: mail, password: pw } = req.body;
  let user = await User.findOne({ email: mail }).select('+passwordHash +emailOtpSentAt');
  if (user && user.isEmailVerified) throw new AppError('An account with this email already exists.', 409, 'EMAIL_TAKEN');
  const passwordHash = await bcrypt.hash(pw, BCRYPT_COST);
  if (user) {
    if (throttled(user)) throw new AppError('Please wait a minute before requesting another code.', 429, 'OTP_THROTTLED');
    user.name = name;
    user.passwordHash = passwordHash;
  } else {
    user = new User({ name, email: mail, passwordHash });
  }
  if (!config.requireEmailVerification) {
    user.isEmailVerified = true;
    await user.save();
    return sendSession(res, user, { message: 'Account created.', httpStatus: 201 });
  }
  await sendOtp(user);
  // No accessToken here -> the frontend shows the "enter your OTP" step
  return ok(res, { email: mail, requiresVerification: true }, { message: 'Account created. Enter the OTP sent to your email.' }, 201);
});

router.post('/verify-email-otp', validate(z.object({ email, code: z.string().trim().length(6) })), async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+emailOtpHash +emailOtpExpires +emailOtpAttempts');
  const bad = new AppError('Invalid or expired OTP.', 400, 'OTP_INVALID');
  if (!user || !user.emailOtpHash || user.emailOtpExpires < new Date()) throw bad;
  if (user.emailOtpAttempts >= 5) throw new AppError('Too many wrong codes. Request a new one.', 429, 'OTP_LOCKED');
  if (!safeEqual(sha256(req.body.code), user.emailOtpHash)) {
    user.emailOtpAttempts += 1;
    await user.save();
    throw bad;
  }
  user.isEmailVerified = true;
  user.emailOtpHash = undefined;
  user.emailOtpExpires = undefined;
  await user.save();
  brevo.syncReader(user); // optional Brevo CRM sync, never blocks or fails sign-up
  return sendSession(res, user, { message: 'Email verified.' });
});

router.post('/resend-verification', validate(z.object({ email })), async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+emailOtpSentAt');
  if (user && !user.isEmailVerified) {
    if (throttled(user)) throw new AppError('Please wait a minute before requesting another code.', 429, 'OTP_THROTTLED');
    await sendOtp(user);
  }
  return ok(res, undefined, { message: 'If that account needs verification, a new code has been sent.' });
});

router.post('/login', validate(z.object({ email, password: z.string().min(1).max(128) })), async (req, res) => {
  const user = await loginWithPassword({ email: req.body.email }, req.body.password);
  return sendSession(res, user);
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new AppError('No session.', 401, 'NO_SESSION');
  const hash = sha256(token);
  const user = await User.findOne({ 'refreshTokens.hash': hash }).select('+refreshTokens');
  const entry = user?.refreshTokens.find((t) => t.hash === hash);
  if (!user || !user.isActive || !entry || entry.expires < new Date()) {
    res.clearCookie(COOKIE, cookieOpts());
    throw new AppError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED');
  }
  await User.updateOne({ _id: user._id }, { $pull: { refreshTokens: { hash } } }); // rotate
  return sendSession(res, user);
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await User.updateOne({ 'refreshTokens.hash': sha256(token) }, { $pull: { refreshTokens: { hash: sha256(token) } } });
  res.clearCookie(COOKIE, cookieOpts());
  return ok(res, undefined, { message: 'Logged out.' });
});

router.post('/forgot-password', validate(z.object({ email })), async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user && user.isActive) {
    const token = randomToken(32);
    user.passwordResetHash = sha256(token);
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const link = `${config.resetPasswordUrl}?token=${token}`;
    await sendMail({ to: user.email, subject: 'Reset your Crossed Hearts password', ...resetEmail(user.name, link) });
  }
  return ok(res, undefined, { message: 'If that email is registered, a reset link has been sent.' }); // same answer either way
});

// The frontend sends the token in the query string: POST /auth/reset-password?token=...  { password }
router.post('/reset-password', validate(z.object({ password, token: z.string().optional() })), async (req, res) => {
  const token = String(req.query.token || req.body.token || '');
  if (token.length < 10) throw new AppError('Reset link is invalid or has expired.', 400, 'RESET_INVALID');
  const user = await User.findOne({ passwordResetHash: sha256(token), passwordResetExpires: { $gt: new Date() } }).select('+passwordResetHash +refreshTokens');
  if (!user) throw new AppError('Reset link is invalid or has expired.', 400, 'RESET_INVALID');
  user.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);
  user.passwordResetHash = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // sign out everywhere
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();
  return ok(res, undefined, { message: 'Password updated. You can now sign in.' });
});

router.get('/me', authenticate, (req, res) => ok(res, { user: req.user.toPublic() }));

module.exports = router;
