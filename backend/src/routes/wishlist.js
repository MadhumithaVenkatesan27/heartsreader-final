/**
 * Server-side wishlist, keyed by the frontend's title ids (e.g. "matchmaker-v1"). Needs login.
 *   GET    /api/wishlist               -> { wishlist: [{titleId, addedAt}] }
 *   PUT    /api/wishlist               {titleIds:[...]}  merge (union) - used to push a guest's local list on login
 *   POST   /api/wishlist/:titleId      add one
 *   DELETE /api/wishlist/:titleId      remove one
 */
const router = require('express').Router();
const User = require('../models/User');
const { validate, z } = require('../utils/validate');
const { ok } = require('../utils/respond');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const id = z.string().trim().toLowerCase().min(1).max(80);
const MAX = 500;

const list = async (userId) => (await User.findById(userId).select('wishlist')).wishlist.map((w) => ({ titleId: w.titleId, addedAt: w.addedAt }));

router.get('/', async (req, res) => ok(res, { wishlist: await list(req.user._id) }));

router.put('/', validate(z.object({ titleIds: z.array(id).max(MAX) })), async (req, res) => {
  const have = new Set(req.user.wishlist.map((w) => w.titleId));
  const add = [...new Set(req.body.titleIds)].filter((t) => !have.has(t)).slice(0, Math.max(0, MAX - have.size));
  if (add.length) await User.updateOne({ _id: req.user._id }, { $push: { wishlist: { $each: add.map((titleId) => ({ titleId, addedAt: new Date() })) } } });
  ok(res, { wishlist: await list(req.user._id) });
});

router.post('/:titleId', async (req, res) => {
  const titleId = String(req.params.titleId).toLowerCase().slice(0, 80);
  await User.updateOne({ _id: req.user._id, 'wishlist.titleId': { $ne: titleId } }, { $push: { wishlist: { titleId, addedAt: new Date() } } });
  ok(res, { wishlist: await list(req.user._id) }, {}, 201);
});

router.delete('/:titleId', async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { wishlist: { titleId: String(req.params.titleId).toLowerCase() } } });
  ok(res, { wishlist: await list(req.user._id) });
});

module.exports = router;
