/**
 * "Notify me" button (series-page.js). Mounted at /api/notifications (public: guests allowed).
 *   GET  /vapid-key      -> { key }
 *   POST /subscribe      { titleId, titleName, volume, releaseDate?, general?, email?, subscription? }
 *   POST /unsubscribe    { titleId, volume, endpoint? }
 * (The saved in-app notification list, GET /api/notifications, lives in misc.js.)
 */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const NotifySub = require('../models/NotifySub');
const AppError = require('../utils/AppError');
const { validate, z } = require('../utils/validate');
const { ok } = require('../utils/respond');
const { optionalAuth } = require('../middleware/auth');
const brevo = require('../services/brevo');

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
}));

router.get('/vapid-key', (_req, res) => {
  if (!config.push.publicKey) throw new AppError('Push notifications are not configured on this server.', 503, 'PUSH_DISABLED');
  res.json({ key: config.push.publicKey });
});

const subscription = z.object({
  endpoint: z.string().url().max(1000),
  expirationTime: z.any().optional(),
  keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(100) }),
}).nullable().optional();

const subscribeBody = z.object({
  titleId: z.string().trim().toLowerCase().min(1).max(80),
  titleName: z.string().trim().max(200).default(''),
  volume: z.coerce.number().int().min(0).max(999),
  releaseDate: z.string().trim().max(60).nullable().optional(),
  general: z.boolean().optional(),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  subscription,
});

router.post('/subscribe', optionalAuth, validate(subscribeBody), async (req, res) => {
  const b = req.body;
  // a signed-in reader's own email wins over whatever the browser sent
  const email = req.user?.email || b.email || undefined;
  const endpoint = b.subscription?.endpoint;
  const query = endpoint ? { endpoint } : req.user ? { userId: req.user._id, endpoint: { $exists: false } } : email ? { email, endpoint: { $exists: false } } : null;
  if (!query) return ok(res, { saved: false, push: false }, { message: 'Sign in or allow notifications so we can reach you.' });

  const doc = (await NotifySub.findOne(query)) || new NotifySub(endpoint ? { endpoint } : {});
  if (endpoint) doc.subscription = b.subscription;
  if (req.user) doc.userId = req.user._id;
  if (email) doc.email = email;
  if (b.general) doc.general = true;
  if (!doc.titles.some((t) => t.titleId === b.titleId && t.volume === b.volume)) {
    doc.titles.push({ titleId: b.titleId, titleName: b.titleName, volume: b.volume, releaseDate: b.releaseDate || undefined });
  }
  await doc.save();
  if (b.general && email) brevo.syncNewsOptIn(email, req.user?.name); // fire and forget
  ok(res, { saved: true, push: !!endpoint });
});

router.post('/unsubscribe', optionalAuth, validate(z.object({
  titleId: z.string().trim().toLowerCase().min(1).max(80),
  volume: z.coerce.number().int().min(0).max(999),
  endpoint: z.string().max(1000).nullable().optional(),
})), async (req, res) => {
  const { titleId, volume, endpoint } = req.body;
  const who = [];
  if (endpoint) who.push({ endpoint });
  if (req.user) who.push({ userId: req.user._id });
  if (who.length) await NotifySub.updateMany({ $or: who }, { $pull: { titles: { titleId, volume } } });
  ok(res, undefined, { message: 'Notifications turned off.' });
});

module.exports = router;
