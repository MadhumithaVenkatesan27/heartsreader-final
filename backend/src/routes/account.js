/**
 * Account settings page. All need login.
 *   GET   /api/account/profile         -> { profile: {name,email,emailVerified,phone,phoneVerified,createdAt} }
 *   PATCH /api/account/profile         {name}  (3-30 characters)
 *   POST  /api/account/email/change    {newEmail, password}  -> emails a 6-digit code to the NEW address
 *   POST  /api/account/email/confirm   {code}                -> { profile }   (/email/verify is the same thing)
 *   POST  /api/account/phone/change    {phone}               -> texts a 6-digit code to the NEW number (with country code)
 *   POST  /api/account/phone/confirm   {code}                -> { profile }
 *   POST  /api/account/password        {currentPassword, newPassword}
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { validate, z, email, password } = require('../utils/validate');
const { sha256, otp6, safeEqual } = require('../utils/crypto');
const { sendMail } = require('../utils/mailer');
const { sendSms } = require('../utils/sms');
const { ok } = require('../utils/respond');
const { authenticate } = require('../middleware/auth');
const { BCRYPT_COST, sendSession } = require('../services/session');
const brevo = require('../services/brevo');
const { emailChangeEmail } = require('../utils/emailTemplates');

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
}));
router.use(authenticate);

const profileOf = (u) => ({
  name: u.name, email: u.email, emailVerified: !!u.isEmailVerified,
  phone: u.phone || '', phoneVerified: !!u.phoneVerified, createdAt: u.createdAt,
});
// both `profile` (new pages) and `user` (older pages) are returned
const reply = (res, u, message) => ok(res, { profile: profileOf(u), user: u.toPublic() }, message ? { message } : {});

router.get('/profile', (req, res) => reply(res, req.user));

router.patch('/profile', validate(z.object({ name: z.string().trim().min(3, 'Name must be 3 to 30 characters.').max(30, 'Name must be 3 to 30 characters.') })), async (req, res) => {
  req.user.name = req.body.name;
  await req.user.save();
  reply(res, req.user, 'Name updated.');
});

// ── Email change ─────────────────────────────────────────
router.post('/email/change', validate(z.object({ newEmail: email, password: z.string().min(1).max(128) })), async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash +pendingEmailSentAt');
  if (!(await bcrypt.compare(req.body.password, user.passwordHash))) throw new AppError('Password is incorrect.', 400, 'WRONG_PASSWORD');
  if (req.body.newEmail === user.email) throw new AppError('That is already your email address.', 400, 'SAME_EMAIL');
  if (await User.exists({ email: req.body.newEmail })) throw new AppError('That email is already used by another account.', 409, 'EMAIL_TAKEN');
  if (user.pendingEmailSentAt && Date.now() - user.pendingEmailSentAt < 60 * 1000) {
    throw new AppError('Please wait a minute before requesting another code.', 429, 'OTP_THROTTLED');
  }
  const code = otp6();
  user.pendingEmail = req.body.newEmail;
  user.pendingEmailOtpHash = sha256(code);
  user.pendingEmailExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.pendingEmailAttempts = 0;
  user.pendingEmailSentAt = new Date();
  await user.save();
  await sendMail({
    to: req.body.newEmail,
    subject: 'Confirm your new Crossed Hearts email',
    ...emailChangeEmail(user.name, code),
  });
  ok(res, undefined, { message: `We sent a 6-digit code to ${req.body.newEmail}.` });
});

async function confirmEmail(req, res) {
  const user = await User.findById(req.user._id).select('+pendingEmail +pendingEmailOtpHash +pendingEmailExpires +pendingEmailAttempts');
  const bad = new AppError('Invalid or expired code.', 400, 'OTP_INVALID');
  if (!user.pendingEmail || !user.pendingEmailOtpHash || user.pendingEmailExpires < new Date()) throw bad;
  if (user.pendingEmailAttempts >= 5) throw new AppError('Too many wrong codes. Request a new one.', 429, 'OTP_LOCKED');
  if (!safeEqual(sha256(req.body.code), user.pendingEmailOtpHash)) {
    user.pendingEmailAttempts += 1;
    await user.save();
    throw bad;
  }
  user.email = user.pendingEmail;
  user.isEmailVerified = true;
  user.pendingEmail = undefined;
  user.pendingEmailOtpHash = undefined;
  user.pendingEmailExpires = undefined;
  user.pendingEmailAttempts = 0;
  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) throw new AppError('That email is already used by another account.', 409, 'EMAIL_TAKEN');
    throw err;
  }
  brevo.syncReader(user); // fire and forget
  reply(res, user, 'Email updated.');
}
const codeBody = validate(z.object({ code: z.string().trim().length(6) }));
router.post('/email/confirm', codeBody, confirmEmail);
router.post('/email/verify', codeBody, confirmEmail); // older name

// ── Phone change (SMS code) ──────────────────────────────
const phoneField = z.string().trim().regex(/^\+[1-9][0-9 ()-]{6,22}$/, 'Enter the number with the country code, e.g. +91 98765 43210.');

router.post('/phone/change', validate(z.object({ phone: phoneField })), async (req, res) => {
  const phone = req.body.phone.replace(/[ ()-]/g, '');
  const user = await User.findById(req.user._id).select('+pendingPhoneSentAt');
  if (phone === user.phone.replace(/[ ()-]/g, '') && user.phoneVerified) throw new AppError('That number is already verified on your account.', 400, 'SAME_PHONE');
  if (user.pendingPhoneSentAt && Date.now() - user.pendingPhoneSentAt < 60 * 1000) {
    throw new AppError('Please wait a minute before requesting another code.', 429, 'OTP_THROTTLED');
  }
  const code = otp6();
  user.pendingPhone = phone;
  user.pendingPhoneOtpHash = sha256(code);
  user.pendingPhoneExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.pendingPhoneAttempts = 0;
  user.pendingPhoneSentAt = new Date();
  await user.save();
  await sendSms(phone, `Crossed Hearts: your verification code is ${code}. It expires in 10 minutes.`);
  ok(res, undefined, { message: `We sent a 6-digit code to ${phone}.` });
});

router.post('/phone/confirm', codeBody, async (req, res) => {
  const user = await User.findById(req.user._id).select('+pendingPhone +pendingPhoneOtpHash +pendingPhoneExpires +pendingPhoneAttempts');
  const bad = new AppError('Invalid or expired code.', 400, 'OTP_INVALID');
  if (!user.pendingPhone || !user.pendingPhoneOtpHash || user.pendingPhoneExpires < new Date()) throw bad;
  if (user.pendingPhoneAttempts >= 5) throw new AppError('Too many wrong codes. Request a new one.', 429, 'OTP_LOCKED');
  if (!safeEqual(sha256(req.body.code), user.pendingPhoneOtpHash)) {
    user.pendingPhoneAttempts += 1;
    await user.save();
    throw bad;
  }
  user.phone = user.pendingPhone;
  user.phoneVerified = true;
  user.pendingPhone = undefined;
  user.pendingPhoneOtpHash = undefined;
  user.pendingPhoneExpires = undefined;
  user.pendingPhoneAttempts = 0;
  await user.save();
  reply(res, user, 'Phone number verified.');
});

// ── Password ─────────────────────────────────────────────
router.post('/password', validate(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password })), async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash +refreshTokens');
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) throw new AppError('Current password is incorrect.', 400, 'WRONG_PASSWORD');
  user.passwordHash = await bcrypt.hash(req.body.newPassword, BCRYPT_COST);
  user.refreshTokens = []; // every other device must sign in again
  await user.save();
  // this device stays signed in with a fresh session
  return sendSession(res, user, { message: 'Password changed. Other devices were signed out.' });
});

module.exports = router;
