const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const Notification = require('../models/Notification');
const SupportMessage = require('../models/SupportMessage');
const config = require('../config');
const { validate, z, email } = require('../utils/validate');
const { ok } = require('../utils/respond');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

// ── Help / contact form (chatbot widget + About page) ────
const supportLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  message: { status: 'fail', message: 'Too many messages. Try again later.', code: 'RATE_LIMITED' },
});
router.post('/support/contact', supportLimit, optionalAuth, validate(z.object({
  name: z.string().trim().min(1).max(100),
  email,
  category: z.string().trim().max(60).default('General'),
  message: z.string().trim().min(5).max(4000),
})), async (req, res) => {
  const msg = await SupportMessage.create({ ...req.body, userId: req.user?._id });
  await sendMail({
    to: config.mail.supportTo,
    replyTo: msg.email,
    subject: `[Support/${msg.category}] from ${msg.name}`,
    text: `${msg.message}\n\nFrom: ${msg.name} <${msg.email}>`,
  });
  ok(res, { id: msg._id }, { message: 'Thanks! We have received your message.' }, 201);
});

// ── Notifications (live ones arrive over socket.io; these are the saved history) ──
router.get('/notifications', authenticate, async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
  ok(res, { notifications, unread: notifications.filter((n) => !n.read).length });
});
router.post('/notifications/read-all', authenticate, async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  ok(res, undefined, { message: 'Marked as read.' });
});

// ── Print orders: not part of this digital-only version. The account page still calls this, so answer with an empty list. ──
router.get('/physical-orders', authenticate, (_req, res) => ok(res, { orders: [] }));

module.exports = router;
