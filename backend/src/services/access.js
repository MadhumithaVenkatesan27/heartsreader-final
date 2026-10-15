const Purchase = require('../models/Purchase');

/** Everything a user has paid for on a book: { fullBook: boolean, chapterIds: Set<string> } */
async function entitlements(userId, bookId) {
  const purchases = await Purchase.find({ userId, bookId, status: 'paid' }).select('purchaseType chapterIds');
  const ent = { fullBook: false, chapterIds: new Set() };
  for (const p of purchases) {
    if (p.purchaseType === 'book') ent.fullBook = true;
    for (const id of p.chapterIds) ent.chapterIds.add(String(id));
  }
  return ent;
}

const canRead = (ent, chapter) => chapter.free || !!(ent && (ent.fullBook || ent.chapterIds.has(String(chapter._id))));

module.exports = { entitlements, canRead };
