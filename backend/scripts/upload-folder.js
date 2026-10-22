/**
 * Uploads every PDF in a folder as chapters of one title.
 *
 *   node scripts/upload-folder.js <title-id> "<folder>" [free-chapters]
 *
 * The chapter number is the first number in each file name:  ch1.pdf, Chapter 2.pdf, afternoon-03.pdf ...
 * By default only chapter 1 is free. Example: "2" makes chapters 1 and 2 free, "0" makes none free.
 * Run it again any time: a chapter that already exists is replaced with the new file.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const config = require('../src/config');
const Book = require('../src/models/Book');
const storage = require('../src/services/storage');

(async () => {
  const [id, folder, freeRaw] = process.argv.slice(2);
  if (!id || !folder) {
    console.log('Usage: node scripts/upload-folder.js <title-id> "<folder>" [free-chapters]');
    process.exit(1);
  }
  const freeUpTo = freeRaw === undefined ? 1 : Number(freeRaw);
  const dir = path.resolve(folder);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Folder not found: ${dir}`);

  const files = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).map((f) => {
    const m = /(\d+)/.exec(f);
    return m ? { f, order: Number(m[1]) } : { f, order: NaN };
  });
  const bad = files.filter((x) => !x.order);
  if (bad.length) throw new Error(`These files have no chapter number in the name: ${bad.map((x) => x.f).join(', ')}`);
  if (!files.length) throw new Error('No PDF files in that folder.');
  const seen = new Set();
  for (const x of files) { if (seen.has(x.order)) throw new Error(`Two files for chapter ${x.order}.`); seen.add(x.order); }
  files.sort((a, b) => a.order - b.order);

  await mongoose.connect(config.mongoUri);
  const key = id.toLowerCase();
  const book = await Book.findOne({ $or: [{ slug: key }, { aliases: key }] }).select('+chapters.pdfFile');
  if (!book) throw new Error(`No title "${id}". Run npm run seed-titles first, or check the id.`);
  console.log(`Uploading ${files.length} chapter(s) to "${book.title}" using ${storage.driver} ...`);

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  for (const { f, order } of files) {
    const src = path.join(dir, f);
    if (fs.readFileSync(src).subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error(`${f} is not a valid PDF.`);
    const tmp = path.join(config.uploadsDir, `${crypto.randomBytes(12).toString('hex')}.pdf`);
    fs.copyFileSync(src, tmp);
    const stored = await storage.put(path.basename(tmp), tmp);
    const free = order <= freeUpTo;
    const existing = book.chapters.find((c) => c.order === order);
    if (existing) {
      if (existing.pdfFile) await storage.remove(existing.pdfFile);
      existing.pdfFile = stored;
      existing.free = free;
      if (!existing.title) existing.title = `Chapter ${order}`;
    } else {
      book.chapters.push({ order, title: `Chapter ${order}`, free, pdfFile: stored });
    }
    await book.save();
    console.log(`  chapter ${order}: ${f}  ->  saved${free ? ' [free]' : ' [paid]'}`);
  }
  console.log('Done.');
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
