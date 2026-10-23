const crypto = require("crypto");
const fs = require("fs");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

/**
 * Stamps the reader's identity on every page of a chapter PDF (done in memory on each request;
 * the stored original is never changed). Three layers:
 *   1. big faint diagonal "name" across the page
 *   2. footer line: licensed-to name + email + chapter + date + short watermark id
 *   3. PDF metadata (author/keywords) carrying the same id
 * The watermark id is also saved in `readevents`, so a leaked copy can be traced back to a user.
 */
const clean = (s) => String(s || "").replace(/[^\x20-\x7E]/g, "?"); // standard PDF fonts are Latin-only

function makeWatermarkId(userId, chapterId) {
  return crypto
    .createHash("sha256")
    .update(
      `${userId}:${chapterId}:${Date.now()}:${crypto.randomBytes(4).toString("hex")}`,
    )
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}

async function watermarkPdf(
  filePath,
  { name, email, bookTitle, chapterTitle, watermarkId, unlockedChapters = [] },
) {
  const bytes = Buffer.isBuffer(filePath)
    ? filePath
    : fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const small = await doc.embedFont(StandardFonts.Helvetica);
  const who = clean(name);
  const footer = clean(
    `Licensed to ${name} <${email}> | ${bookTitle} - ${chapterTitle} | ${new Date().toISOString().slice(0, 10)} | ID ${watermarkId}`,
  );

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(
      18,
      Math.min(60, ((width * 0.9) / Math.max(who.length, 8)) * 1.4),
    );
    const textW = font.widthOfTextAtSize(who, size);
    // centred, rotated 35deg
    const rad = (35 * Math.PI) / 180;
    page.drawText(who, {
      x: width / 2 - (textW / 2) * Math.cos(rad),
      y: height / 2 - (textW / 2) * Math.sin(rad),
      size,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.16,
      rotate: degrees(35),
    });
    // second, smaller repeat near the top so cropping the middle does not remove it
    page.drawText(who, {
      x: 12,
      y: height - 22,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.35,
    });
    const fs2 = Math.min(7, (width - 24) / Math.max(footer.length * 0.5, 1));
    page.drawText(footer, {
      x: 12,
      y: 8,
      size: Math.max(4, fs2),
      font: small,
      color: rgb(0.4, 0.4, 0.4),
      opacity: 0.6,
    });
  }
  doc.setAuthor(`Licensed to ${who}`);
  doc.setSubject(clean(`${bookTitle} - ${chapterTitle}`));
  doc.setKeywords([`wm:${watermarkId}`, ...unlockedChapters.map(clean)]);
  doc.setProducer("Crossed Hearts");
  return Buffer.from(await doc.save());
}

module.exports = { watermarkPdf, makeWatermarkId };
