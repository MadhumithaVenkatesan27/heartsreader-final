/**
 * Uploads every PDF in a folder as chapters of one title.
 *
 *   node scripts/upload-folder.js <title-id> "<folder>" [free-chapters] [--dry]
 *
 * Chapter number: a number after "ch", "chapter", "chp" or "ep" in the file name wins
 * (ch1.pdf, Chapter 02.pdf, Borrowing 175160 ch3.pdf). Otherwise the LAST number in the name is used (afternoon_03.pdf).
 * By default only chapter 1 is free. Example: "2" makes chapters 1 and 2 free, "0" makes none free.
 * Add  --dry  at the end to only SHOW what would happen, without uploading anything.
 * Run it again any time: a chapter that already exists is replaced with the new file.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function chapterNumber(name) {
  const base = name.replace(/\.pdf$/i, "");
  const tagged = /(?:chapter|chp|ch|episode|ep)[\s._-]*0*(\d+)/i.exec(base);
  if (tagged) return Number(tagged[1]);
  const all = base.match(/\d+/g);
  return all ? Number(all[all.length - 1]) : NaN;
}

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const [id, folder, freeRaw] = args.filter((a) => a !== "--dry");
  if (!id || !folder) {
    console.log(
      'Usage: node scripts/upload-folder.js <title-id> "<folder>" [free-chapters] [--dry]',
    );
    process.exit(1);
  }
  const freeUpTo = freeRaw === undefined ? 1 : Number(freeRaw);
  const dir = path.resolve(folder);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
    throw new Error(`Folder not found: ${dir}`);

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.pdf$/i.test(f))
    .map((f) => ({ f, order: chapterNumber(f) }));
  if (!files.length) throw new Error("No PDF files in that folder.");
  const bad = files.filter((x) => !x.order);
  if (bad.length)
    throw new Error(
      `These files have no chapter number in the name: ${bad.map((x) => x.f).join(", ")}`,
    );
  const seen = new Set();
  for (const x of files) {
    if (seen.has(x.order)) throw new Error(`Two files for chapter ${x.order}.`);
    seen.add(x.order);
  }
  files.sort((a, b) => a.order - b.order);

  if (dry) {
    console.log(`DRY RUN for "${id}" - nothing is uploaded:`);
    files.forEach((x) =>
      console.log(
        `  ${x.f}  ->  chapter ${x.order}  ${x.order <= freeUpTo ? "[free]" : "[paid]"}`,
      ),
    );
    return;
  }

  const mongoose = require("mongoose");
  const config = require("../src/config");
  const Book = require("../src/models/Book");
  const storage = require("../src/services/storage");

  await mongoose.connect(config.mongoUri);
  const key = id.toLowerCase();
  const book = await Book.findOne({
    $or: [{ slug: key }, { aliases: key }],
  }).select("+chapters.pdfFile");
  if (!book)
    throw new Error(
      `No title "${id}". Run npm run seed-titles first, or check the id.`,
    );
  console.log(
    `Uploading ${files.length} chapter(s) to "${book.title}" using ${storage.driver} ...`,
  );

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  for (const { f, order } of files) {
    const src = path.join(dir, f);
    if (fs.readFileSync(src).subarray(0, 5).toString("latin1") !== "%PDF-")
      throw new Error(`${f} is not a valid PDF.`);
    const tmp = path.join(
      config.uploadsDir,
      `${crypto.randomBytes(12).toString("hex")}.pdf`,
    );
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
      book.chapters.push({
        order,
        title: `Chapter ${order}`,
        free,
        pdfFile: stored,
      });
    }
    await book.save();
    console.log(
      `  chapter ${order}: ${f}  ->  saved${free ? " [free]" : " [paid]"}`,
    );
  }
  console.log(
    `Done. In reader.html set  chapters: ${Math.max(...files.map((x) => x.order))}  for this title.`,
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
