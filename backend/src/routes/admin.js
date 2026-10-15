const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const SupportMessage = require('../models/SupportMessage');
const AppError = require('../utils/AppError');
const { randomToken } = require('../utils/crypto');
const { validate, z } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const pay = require('../services/payments');
const push = require('../services/push');

router.use(authenticate, requireRole('admin'));

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = z.coerce.number().min(0).optional();

const bookBody = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().optional(),
  aliases: z.array(z.string().trim().toLowerCase()).optional(),
  category: z.enum(['Manga', 'Manhwa', 'Novel', 'Light Novel', 'Comic']).optional(),
  genres: z.array(z.string().trim()).optional(),
  description: z.string().max(5000).optional(),
  coverImageUrl: z.string().trim().max(500).optional(),
  ageRating: z.string().trim().max(10).optional(),
  pricing: z.object({ chapterUSD: money, chapterINR: money, fullUSD: money, fullINR: money }).optional(),
  isPublished: z.boolean().optional(),
});

router.get('/stats', async (_req, res) => {
  const [users, books, paid] = await Promise.all([
    User.countDocuments(),
    Book.countDocuments(),
    Purchase.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: '$currency', revenue: { $sum: '$amount' }, orders: { $sum: 1 } } }]),
  ]);
  res.json({ users, books, revenue: paid.map((p) => ({ currency: p._id, total: p.revenue, orders: p.orders })) });
});

router.get('/books', async (_req, res) => res.json({ items: await Book.find().sort({ createdAt: -1 }) }));

router.post('/books', validate(bookBody), async (req, res) => {
  const book = await Book.create({ ...req.body, slug: req.body.slug || slugify(req.body.title) });
  res.status(201).json({ book });
});

router.patch('/books/:id', validate(bookBody.partial()), async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) throw new AppError('Title not found.', 404, 'NOT_FOUND');
  const { pricing, ...rest } = req.body;
  Object.assign(book, rest);
  if (pricing) Object.assign(book.pricing, pricing);
  await book.save();
  res.json({ book });
});

// ── Chapter upload (PDF) ─────────────────────────────────
fs.mkdirSync(config.uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, _file, cb) => cb(null, `${randomToken(16)}.pdf`),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (file.mimetype === 'application/pdf' ? cb(null, true) : cb(new AppError('Only PDF files are allowed.', 400, 'BAD_FILE'))),
});

const chapterBody = z.object({
  title: z.string().trim().min(1).max(200),
  order: z.coerce.number().int().min(1),
  free: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
  priceUSD: money,
  priceINR: money,
});

router.post('/books/:id/chapters', upload.single('pdf'), validate(chapterBody), async (req, res) => {
  const discard = () => req.file && fs.promises.unlink(req.file.path).catch(() => {});
  try {
    if (!req.file) throw new AppError('Attach the chapter as a PDF in the "pdf" field.', 400, 'NO_FILE');
    const head = Buffer.alloc(5);
    const fd = await fs.promises.open(req.file.path, 'r');
    await fd.read(head, 0, 5, 0);
    await fd.close();
    if (head.toString('latin1') !== '%PDF-') throw new AppError('That file is not a valid PDF.', 400, 'BAD_FILE');
    const book = await Book.findById(req.params.id);
    if (!book) throw new AppError('Title not found.', 404, 'NOT_FOUND');
    if (book.chapters.some((c) => c.order === req.body.order)) throw new AppError(`Chapter ${req.body.order} already exists.`, 409, 'DUPLICATE');
    book.chapters.push({ ...req.body, pdfFile: req.file.filename });
    await book.save();
    // tell everyone following this title (fire and forget; a push problem must not fail the upload)
    if (book.isPublished && req.query.notify !== 'false') {
      push.notifyChapterAdded([book.slug, ...book.aliases], { titleName: book.title, chapterTitle: req.body.title, chapterNumber: req.body.order, icon: book.coverImageUrl })
        .catch((e) => console.warn('chapter notify failed:', e.message));
    }
    res.status(201).json({ chapter: book.toPublic().chapters.find((c) => c.order === req.body.order) });
  } catch (err) {
    await discard();
    throw err;
  }
});

router.delete('/books/:id/chapters/:chapterId', async (req, res) => {
  const book = await Book.findById(req.params.id).select('+chapters.pdfFile');
  const ch = book?.chapters.id(req.params.chapterId);
  if (!ch) throw new AppError('Chapter not found.', 404, 'NOT_FOUND');
  if (ch.pdfFile) await fs.promises.unlink(path.join(config.uploadsDir, path.basename(ch.pdfFile))).catch(() => {});
  ch.deleteOne();
  await book.save();
  res.json({ message: 'Chapter deleted.' });
});

// ── Notify-me subscribers ────────────────────────────────
// A whole volume went live: tells everyone who pressed "Notify me" for it, then removes that volume from their list.
router.post('/notify/release', validate(z.object({
  titleId: z.string().trim().min(1), volume: z.coerce.number().int().min(0), titleName: z.string().optional(), url: z.string().optional(), icon: z.string().optional(),
})), async (req, res) => {
  const b = req.body;
  res.json(await push.notifyVolumeReleased([b.titleId], b.volume, b));
});
// Crossed Hearts news (new titles, sales, announcements) to everyone who opted in
router.post('/notify/general', validate(z.object({ title: z.string().min(1).max(100), body: z.string().min(1).max(300), url: z.string().optional(), icon: z.string().optional() })), async (req, res) => {
  res.json(await push.notifyGeneral(req.body));
});

// ── Purchases / refunds ──────────────────────────────────
router.get('/purchases', async (req, res) => {
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  res.json({ items: await Purchase.find(filter).sort({ createdAt: -1 }).limit(200).populate('userId', 'name email') });
});
router.post('/purchases/:id/refund', async (req, res) => {
  const p = await Purchase.findById(req.params.id);
  if (!p) throw new AppError('Purchase not found.', 404, 'NOT_FOUND');
  res.json({ purchase: await pay.refund(p) });
});

// ── Support inbox ────────────────────────────────────────
router.get('/support', async (_req, res) => res.json({ items: await SupportMessage.find().sort({ createdAt: -1 }).limit(200) }));
router.patch('/support/:id', validate(z.object({ status: z.enum(['open', 'closed']) })), async (req, res) => {
  const m = await SupportMessage.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!m) throw new AppError('Message not found.', 404, 'NOT_FOUND');
  res.json({ message: m });
});

// ── Users ────────────────────────────────────────────────
router.get('/users', async (_req, res) => res.json({ items: await User.find().sort({ createdAt: -1 }).limit(200) .then((u) => u.map((x) => ({ ...x.toPublic(), isActive: x.isActive, createdAt: x.createdAt }))) }));
router.patch('/users/:id', validate(z.object({ isActive: z.boolean().optional(), role: z.enum(['user', 'licensor', 'admin']).optional() })), async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new AppError('You cannot change your own account here.', 400, 'SELF_EDIT');
  const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!u) throw new AppError('User not found.', 404, 'NOT_FOUND');
  res.json({ user: u.toPublic() });
});

module.exports = router;
