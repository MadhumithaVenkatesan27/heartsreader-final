const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const Book = require('../models/Book');
const Purchase = require('../models/Purchase');
const { validate, z } = require('../utils/validate');
const { ok } = require('../utils/respond');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendSession, loginWithPassword } = require('../services/session');

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10000 : 20,
  message: { status: 'fail', message: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
});

// Licensor portal login: { licensorId, password }
router.post('/login-id', loginLimit, validate(z.object({
  licensorId: z.string().trim().toLowerCase().min(1).max(100),
  password: z.string().min(1).max(128),
})), async (req, res) => {
  const user = await loginWithPassword({ licensorId: req.body.licensorId, role: 'licensor' }, req.body.password);
  return sendSession(res, user);
});

router.use(authenticate, requireRole('licensor', 'admin'));

router.get('/me', (req, res) => ok(res, { licensor: req.user.toPublic() }));

// The titles assigned to this licensor, with sales numbers (USD-equivalent revenue)
router.get('/my-books', async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { licensors: req.user._id };
  const books = await Book.find(filter);
  const sums = await Purchase.aggregate([
    { $match: { status: 'paid', bookId: { $in: books.map((b) => b._id) } } },
    { $group: { _id: { b: '$bookId', c: '$currency' }, n: { $sum: 1 }, total: { $sum: '$amount' } } },
  ]);
  const stats = new Map();
  for (const s of sums) {
    const e = stats.get(String(s._id.b)) || { sales: 0, revenue: 0 };
    e.sales += s.n;
    e.revenue += s._id.c === 'INR' ? s.total / config.payments.usdToInr : s.total;
    stats.set(String(s._id.b), e);
  }
  ok(res, {
    books: books.map((b) => {
      const st = stats.get(String(b._id)) || { sales: 0, revenue: 0 };
      return { ...b.toPublic(), sales: st.sales, revenue: Math.round(st.revenue * 100) / 100 };
    }),
  });
});

module.exports = router;
