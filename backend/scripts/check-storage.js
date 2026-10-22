/**
 * Checks one title: what chapters the database has, and whether each PDF can really be read from storage.
 *   node scripts/check-storage.js chigaya
 */
const mongoose = require('mongoose');
const config = require('../src/config');
const Book = require('../src/models/Book');
const storage = require('../src/services/storage');

(async () => {
  const id = (process.argv[2] || '').toLowerCase();
  if (!id) { console.log('Usage: node scripts/check-storage.js <title-id>'); process.exit(1); }
  console.log(`Storage driver in use: ${storage.driver}`);
  await mongoose.connect(config.mongoUri);
  const book = await Book.findOne({ $or: [{ slug: id }, { aliases: id }] }).select('+chapters.pdfFile');
  if (!book) { console.log(`No title "${id}" in the database. Run: npm run seed-titles`); process.exit(1); }
  console.log(`Title: ${book.title}  (slug: ${book.slug}, published: ${book.isPublished})`);
  if (!book.chapters.length) console.log('No chapters yet. Upload one with scripts/upload-chapter.js');
  for (const c of [...book.chapters].sort((a, b) => a.order - b.order)) {
    let status = 'NO FILE NAME in the database';
    if (c.pdfFile) {
      try {
        const buf = await storage.get(c.pdfFile);
        status = buf ? `OK (${Math.round(buf.length / 1024)} KB read from ${storage.driver})` : `MISSING: the database says "${c.pdfFile}" but ${storage.driver} does not have it`;
      } catch (e) {
        status = `ERROR reading from ${storage.driver}: ${e.message}`;
      }
    }
    console.log(`  Chapter ${c.order} "${c.title}" ${c.free ? '[free]' : '[paid]'} -> ${status}`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
