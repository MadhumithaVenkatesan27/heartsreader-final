/**
 * "Add to library" (login needed). Mounted at /api/saved.
 *   GET    /api/saved                 -> { saved: [{ titleId, addedAt }] }
 *   PUT    /api/saved  {titleIds:[]}  -> merge a list (used to push a guest's local list after login)
 *   POST   /api/saved/:titleId        -> add one   (safe to repeat)
 *   DELETE /api/saved/:titleId        -> remove one
 */
const router = require('express').Router();
const SavedTitle = require('../models/SavedTitle');
const AppError = require('../utils/AppError');
const { validate, z } = require('../utils/validate');
const { ok } = require('../utils/respond');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const MAX = 500;
const clean = (s) => String(s || '').trim().toLowerCase().slice(0, 80);
const list = async (userId) => (await SavedTitle.find({ userId }).sort({ addedAt: -1 }).limit(MAX)).map((s) => ({ titleId: s.titleId, addedAt: s.addedAt }));

router.get('/', async (req, res) => ok(res, { saved: await list(req.user._id) }));

router.put('/', validate(z.object({ titleIds: z.array(z.string().trim().min(1).max(80)).max(MAX) })), async (req, res) => {
  const ids = [...new Set(req.body.titleIds.map(clean).filter(Boolean))];
  if (ids.length) {
    await SavedTitle.bulkWrite(ids.map((titleId) => ({
      updateOne: { filter: { userId: req.user._id, titleId }, update: { $setOnInsert: { userId: req.user._id, titleId, addedAt: new Date() } }, upsert: true },
    })));
  }
  ok(res, { saved: await list(req.user._id) });
});

router.post('/:titleId', async (req, res) => {
  const titleId = clean(req.params.titleId);
  if (!titleId) throw new AppError('Title missing.', 400, 'BAD_REQUEST');
  if ((await SavedTitle.countDocuments({ userId: req.user._id })) >= MAX) throw new AppError(`Library limit reached (${MAX}).`, 400, 'LIMIT');
  await SavedTitle.updateOne({ userId: req.user._id, titleId }, { $setOnInsert: { userId: req.user._id, titleId, addedAt: new Date() } }, { upsert: true });
  ok(res, { saved: await list(req.user._id) }, {}, 201);
});

router.delete('/:titleId', async (req, res) => {
  await SavedTitle.deleteOne({ userId: req.user._id, titleId: clean(req.params.titleId) });
  ok(res, { saved: await list(req.user._id) });
});

module.exports = router;
