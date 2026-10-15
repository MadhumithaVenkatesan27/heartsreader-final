const Purchase = require('../models/Purchase');
const Book = require('../models/Book');

const card = 'title slug aliases category genres coverImageUrl imprint format ratingAverage ratingCount';

/** Which chapters of each owned book are unlocked for this user. */
async function buildLibrary(userId) {
  const purchases = await Purchase.find({ userId, status: 'paid' }).sort({ paidAt: -1 });
  const byBook = new Map();
  for (const p of purchases) {
    const k = String(p.bookId);
    const e = byBook.get(k) || { fullBook: false, chapterIds: new Set(), lastPurchasedAt: p.paidAt };
    if (p.purchaseType === 'book') e.fullBook = true;
    p.chapterIds.forEach((id) => e.chapterIds.add(String(id)));
    byBook.set(k, e);
  }
  const books = await Book.find({ _id: { $in: [...byBook.keys()] } }).select(`${card} chapters._id chapters.order chapters.title chapters.free`);
  return books.map((b) => {
    const e = byBook.get(String(b._id));
    const chapters = [...b.chapters].sort((x, y) => x.order - y.order).map((c) => ({
      _id: c._id, id: c._id, key: `ch${c.order}`, order: c.order, title: c.title, free: c.free,
      unlocked: c.free || e.fullBook || e.chapterIds.has(String(c._id)),
    }));
    return {
      // flat fields (what a library page usually wants) ...
      _id: b._id, id: b._id, titleId: b.slug, slug: b.slug, aliases: b.aliases,
      title: b.title, category: b.category, imprint: b.imprint, format: b.format,
      coverImageUrl: b.coverImageUrl, coverUrl: b.coverImageUrl,
      // ... and the same book nested, for pages that read l.book.title
      book: { _id: b._id, id: b._id, title: b.title, slug: b.slug, aliases: b.aliases, category: b.category, imprint: b.imprint, format: b.format, coverImageUrl: b.coverImageUrl },
      ownsFullBook: e.fullBook,
      lastPurchasedAt: e.lastPurchasedAt,
      unlockedCount: chapters.filter((c) => c.unlocked).length,
      totalChapters: chapters.length,
      unlockedChapterIds: chapters.filter((c) => c.unlocked).map((c) => String(c._id)),
      chapters,
    };
  });
}

module.exports = { buildLibrary, card };
