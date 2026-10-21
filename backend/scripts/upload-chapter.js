/**
 * Adds (or replaces) one chapter PDF without needing the admin API.
 *
 *   node scripts/upload-chapter.js <title-id> <chapter-number> "<chapter title>" <path-to-pdf> [free]
 *
 * Example (free preview chapter 1):
 *   node scripts/upload-chapter.js chigaya 1 "Chapter 1" "C:\pdfs\chigaya-ch1.pdf" free
 *
 * It saves the PDF with whatever STORAGE_DRIVER is set in your .env (local, r2 or gdrive)
 * and writes the chapter into the database. Run it again for the same chapter number to replace the file.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const config = require('../src/config');
const Book = require('../src/models/Book');
const storage = require('../src/services/storage');

(async () => {
  const [id, orderRaw, title, file, flag] = process.argv.slice(2);
  const order = Number(orderRaw);
  if (!id || !order || !title || !file) {
    console.log('Usage: node scripts/upload-chapter.js <title-id> <chapter-number> "<chapter title>" <path-to-pdf> [free]');
    process.exit(1);
  }
  const src = path.resolve(file);
  if (!fs.existsSync(src)) throw new Error(`File not found: ${src}`);
  if (fs.readFileSync(src).subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('That file is not a valid PDF.');

  await mongoose.connect(config.mongoUri);
  const key = id.toLowerCase();
  const book = await Book.findOne({ $or: [{ slug: key }, { aliases: key }] }).select('+chapters.pdfFile');
  if (!book) throw new Error(`No title "${id}". Run npm run seed-titles first, or check the id.`);

  // work on a temporary copy, because storage.put() moves the file it is given
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  const tmp = path.join(config.uploadsDir, `${crypto.randomBytes(12).toString('hex')}.pdf`);
  fs.copyFileSync(src, tmp);
  const stored = await storage.put(path.basename(tmp), tmp);

  const existing = book.chapters.find((c) => c.order === order);
  if (existing) {
    if (existing.pdfFile) await storage.remove(existing.pdfFile);
    existing.pdfFile = stored;
    existing.title = title;
    existing.free = flag === 'free';
  } else {
    book.chapters.push({ order, title, free: flag === 'free', pdfFile: stored });
  }
  await book.save();
  console.log(`Done. "${book.title}" chapter ${order} saved (${storage.driver}) as ${stored}${flag === 'free' ? ' [free preview]' : ''}.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
