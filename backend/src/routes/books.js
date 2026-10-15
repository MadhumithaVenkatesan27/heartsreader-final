const router = require('express').Router();
const mongoose = require('mongoose');
const Book = require('../models/Book');
const Review = require('../models/Review');
const AppError = require('../utils/AppError');
const { validate, z } = require('../utils/validate');
const { ok } = require('../utils/respond');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { entitlements, canRead } = require('../services/access');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A title can be referenced by Mongo id, slug, or any alias the static frontend uses (e.g. "matchmaker-v1"). */
async function findBook(idOrSlug, { published = true } = {}) {
  const s = String(idOrSlug).toLowerCase();
  const or = [{ slug: s }, { aliases: s }];
  if (mongoose.isValidObjectId(idOrSlug)) or.push({ _id: idOrSlug });
  const book = await Book.findOne({ $or: or, ...(published ? { isPublished: true } : {}) });
  if (!book) throw new AppError('Title not found.', 404, 'NOT_FOUND');
  return book;
}

/** A chapter can be referenced by its _id or by the frontend's "ch<N>" key (N = chapter order). */
function findChapter(book, ref) {
  const r = String(ref);
  if (mongoose.isValidObjectId(r)) {
    const byId = book.chapters.id(r);
    if (byId) return byId;
  }
  const m = /^ch(\d+)$/i.exec(r) || /^(\d+)$/.exec(r);
  const chapter = m && book.chapters.find((c) => c.order === Number(m[1]));
  if (!chapter) throw new AppError('Chapter not found.', 404, 'NOT_FOUND');
  return chapter;
}

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  sort: z.enum(['newest', 'popular', 'rating', 'title']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
const sorts = { newest: { createdAt: -1 }, popular: { 'analytics.purchases': -1 }, rating: { ratingAverage: -1, ratingCount: -1 }, title: { title: 1 } };

router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { q, category, genre, sort, page, limit } = req.validatedQuery;
  const filter = { isPublished: true };
  if (q) filter.title = new RegExp(escapeRe(q), 'i');
  if (category) filter.category = category;
  if (genre) filter.genres = new RegExp(`^${escapeRe(genre)}$`, 'i');
  const [items, total] = await Promise.all([
    Book.find(filter).sort(sorts[sort]).skip((page - 1) * limit).limit(limit),
    Book.countDocuments(filter),
  ]);
  ok(res, { books: items.map((b) => b.toPublic()), page, limit, total, pages: Math.ceil(total / limit) });
});

router.get('/:idOrSlug', optionalAuth, async (req, res) => {
  const book = await findBook(req.params.idOrSlug);
  const out = book.toPublic();
  if (req.user) {
    const ent = await entitlements(req.user._id, book._id);
    out.owned = ent.fullBook;
    out.chapters = out.chapters.map((c) => ({ ...c, unlocked: canRead(ent, c) }));
  }
  ok(res, { book: out });
});

router.get('/:idOrSlug/reviews', async (req, res) => {
  const book = await findBook(req.params.idOrSlug);
  const reviews = await Review.find({ bookId: book._id }).sort({ createdAt: -1 }).limit(100).populate('userId', 'name');
  ok(res, { ratingAverage: book.ratingAverage, ratingCount: book.ratingCount, reviews });
});

// One review per user per title; posting again updates it
router.post('/:idOrSlug/reviews', authenticate, validate(z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(600).default('') })), async (req, res) => {
  const book = await findBook(req.params.idOrSlug);
  const review = await Review.findOneAndUpdate(
    { bookId: book._id, userId: req.user._id },
    { rating: req.body.rating, comment: req.body.comment },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const [agg] = await Review.aggregate([{ $match: { bookId: book._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  book.ratingAverage = Math.round((agg?.avg || 0) * 10) / 10;
  book.ratingCount = agg?.n || 0;
  await book.save();
  ok(res, { review, ratingAverage: book.ratingAverage, ratingCount: book.ratingCount }, { message: 'Review submitted.' }, 201);
});

module.exports = router;
module.exports.findBook = findBook;
module.exports.findChapter = findChapter;
