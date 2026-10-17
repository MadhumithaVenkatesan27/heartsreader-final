const Purchase = require('../models/Purchase');
const Book = require('../models/Book');
const SavedTitle = require('../models/SavedTitle');

const card = 'title slug aliases category genres coverImageUrl imprint format ratingAverage ratingCount';

/** One library card for a book. `e` = what the reader owns (or null for a title they only saved). */
function shape(b, e, extra = {}) {
  const own = e || { fullBook: false, chapterIds: new Set(), lastPurchasedAt: null };
  const chapters = [...(b.chapters || [])].sort((x, y) => x.order - y.order).map((c) => ({
    _id: c._id, id: c._id, key: `ch${c.order}`, order: c.order, title: c.title, free: c.free,
    unlocked: c.free || own.fullBook || own.chapterIds.has(String(c._id)),
  }));
  return {
    // flat fields (what a library page usually wants) ...
    _id: b._id, id: b._id, titleId: b.slug, slug: b.slug, aliases: b.aliases,
    title: b.title, category: b.category, imprint: b.imprint, format: b.format,
    coverImageUrl: b.coverImageUrl, coverUrl: b.coverImageUrl,
    // ... and the same book nested, for pages that read l.book.title
    book: { _id: b._id, id: b._id, title: b.title, slug: b.slug, aliases: b.aliases, category: b.category, imprint: b.imprint, format: b.format, coverImageUrl: b.coverImageUrl },
    owned: !!e, saved: false,
    ownsFullBook: own.fullBook,
    lastPurchasedAt: own.lastPurchasedAt,
    unlockedCount: chapters.filter((c) => c.unlocked).length,
    totalChapters: chapters.length,
    unlockedChapterIds: chapters.filter((c) => c.unlocked).map((c) => String(c._id)),
    chapters,
    ...extra,
  };
}

/** Everything in the reader's library: bought titles (with unlocked chapters) + titles they added with "Add to library". */
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
  const sel = `${card} chapters._id chapters.order chapters.title chapters.free`;
  const books = await Book.find({ _id: { $in: [...byBook.keys()] } }).select(sel);
  const out = books.map((b) => shape(b, byBook.get(String(b._id))));

  // titles added with "Add to library" (not bought yet)
  const saved = await SavedTitle.find({ userId }).sort({ addedAt: -1 }).limit(500);
  const have = new Set(out.flatMap((t) => [t.slug, ...(t.aliases || [])]));
  const todo = saved.filter((s) => !have.has(s.titleId));
  if (todo.length) {
    const ids = todo.map((s) => s.titleId);
    const found = await Book.find({ $or: [{ slug: { $in: ids } }, { aliases: { $in: ids } }] }).select(sel);
    for (const s of todo) {
      const b = found.find((x) => x.slug === s.titleId || (x.aliases || []).includes(s.titleId));
      if (b) {
        if (have.has(b.slug)) continue; // two saved ids for one book
        have.add(b.slug);
        out.push(shape(b, null, { saved: true, savedAt: s.addedAt }));
      } else {
        // not in the database yet (title not seeded): still show it by its frontend id
        out.push({
          _id: null, id: s.titleId, titleId: s.titleId, slug: s.titleId, aliases: [s.titleId], title: s.titleId,
          book: { title: s.titleId, slug: s.titleId }, owned: false, saved: true, savedAt: s.addedAt,
          ownsFullBook: false, unlockedCount: 0, totalChapters: 0, unlockedChapterIds: [], chapters: [],
        });
      }
    }
  }
  return out;
}

module.exports = { buildLibrary, card };
