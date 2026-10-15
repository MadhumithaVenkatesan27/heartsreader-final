/**
 * Newsletter / "Collector's Circle" sign-up (footer form). Public, no login.
 *   POST /api/newsletter/subscribe  {email, name?}
 * The address is saved in MongoDB (notifysubs, general:true) and, when BREVO_API_KEY is set, added to your Brevo news list.
 */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const NotifySub = require('../models/NotifySub');
const { validate, z, email } = require('../utils/validate');
const { ok } = require('../utils/respond');
const brevo = require('../services/brevo');

router.use(rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many sign-ups. Please try again later.', code: 'RATE_LIMITED' },
}));

router.post('/subscribe', validate(z.object({ email, name: z.string().trim().max(100).optional() })), async (req, res) => {
  const doc = (await NotifySub.findOne({ email: req.body.email, endpoint: { $exists: false } })) || new NotifySub({ email: req.body.email });
  doc.general = true;
  await doc.save();
  brevo.syncNewsOptIn(req.body.email, req.body.name); // fire and forget
  ok(res, undefined, { message: "You're in! Watch your inbox for news from Crossed Hearts." });
});

module.exports = router;
