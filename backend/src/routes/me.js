/**
 * Read-only per-user summaries (login required). Editing lives in /api/account, /api/wishlist and /api/library.
 *   GET /api/me/overview          account, stats, owned titles with unlocked chapters, purchases, wishlist, continue-reading
 *   GET /api/me/purchases         purchase history (paid + refunded) with invoice links
 *   GET /api/me/library           owned titles, with exactly which chapters are unlocked
 *   GET /api/me/reading-history   chapters opened recently (with watermark ids)
 */
const router = require('express').Router();
const User = require('../models/User');
const Book = require('../models/Book');
const Purchase = require('../models/Purchase');
const ReadingProgress = require('../models/ReadingProgress');
const Bookmark = require('../models/Bookmark');
const ReadEvent = require('../models/ReadEvent');
const Notification = require('../models/Notification');
const { ok } = require('../utils/respond');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const { buildLibrary, card } = require('../services/libraryView');

/** Latest-read chapters; titles are matched to books by slug/alias when they exist. */
async function continueReading(userId, limit = 6) {
  const rows = await ReadingProgress.find({ userId }).sort({ lastReadAt: -1 }).limit(limit);
  const ids = [...new Set(rows.map((r) => r.titleId))];
  const books = await Book.find({ $or: [{ slug: { $in: ids } }, { aliases: { $in: ids } }] }).select('title slug aliases coverImageUrl');
  const find = (id) => books.find((b) => b.slug === id || b.aliases.includes(id));
  return rows.map((r) => {
    const b = find(r.titleId);
    return {
      titleId: r.titleId, title: b?.title || null, coverUrl: b?.coverImageUrl || '',
      chapter: r.chapter, page: r.page, totalPages: r.totalPages, percent: r.percent, completed: r.completed, lastReadAt: r.lastReadAt,
    };
  });
}

router.get('/overview', async (req, res) => {
  const uid = req.user._id;
  const [library, purchases, user, progress, unread, opened, completed, bookmarks] = await Promise.all([
    buildLibrary(uid),
    Purchase.find({ userId: uid, status: { $in: ['paid', 'refunded'] } }).sort({ createdAt: -1 }).limit(20),
    User.findById(uid).select('wishlist'),
    continueReading(uid),
    Notification.countDocuments({ userId: uid, read: false }),
    ReadEvent.countDocuments({ userId: uid }),
    ReadingProgress.countDocuments({ userId: uid, completed: true }),
    Bookmark.countDocuments({ userId: uid }),
  ]);
  const spent = {};
  for (const p of purchases.filter((x) => x.status === 'paid')) spent[p.currency] = Math.round(((spent[p.currency] || 0) + p.amount) * 100) / 100;
  ok(res, {
    user: { ...req.user.toPublic(), joinedAt: req.user.createdAt },
    stats: {
      titlesOwned: library.length,
      chaptersUnlocked: library.reduce((n, l) => n + l.unlockedCount, 0),
      chaptersCompleted: completed,
      bookmarks,
      purchases: purchases.filter((p) => p.status === 'paid').length,
      spent,
      wishlist: user.wishlist.length,
      timesOpened: opened,
      unreadNotifications: unread,
    },
    library,
    purchases,
    wishlist: user.wishlist,
    continueReading: progress,
  });
});

router.get('/purchases', async (req, res) => {
  const purchases = await Purchase.find({ userId: req.user._id, status: { $in: ['paid', 'refunded'] } })
    .sort({ createdAt: -1 }).populate('bookId', card);
  ok(res, { purchases: purchases.map((p) => ({ ...p.toObject(), invoiceUrl: p.status === 'paid' ? `/api/library/purchases/${p._id}/invoice.pdf` : null })) });
});

router.get('/library', async (req, res) => ok(res, { library: await buildLibrary(req.user._id) }));

router.get('/reading-history', async (req, res) => {
  const events = await ReadEvent.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50)
    .populate('bookId', 'title slug coverImageUrl chapters._id chapters.order chapters.title');
  ok(res, {
    history: events.filter((e) => e.bookId).map((e) => {
      const ch = e.bookId.chapters.id(e.chapterId);
      return { book: { _id: e.bookId._id, title: e.bookId.title, slug: e.bookId.slug }, chapter: ch ? { _id: ch._id, order: ch.order, title: ch.title } : null, openedAt: e.createdAt, watermarkId: e.watermarkId };
    }),
  });
});

module.exports = router;
