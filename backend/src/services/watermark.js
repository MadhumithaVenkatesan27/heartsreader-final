const crypto = require("crypto");
const fs = require("fs");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

/**
 * Stamps the reader's identity on every page of a chapter PDF (done in memory on each request;
 * the stored original is never changed). Three layers:
 *   1. ONE diagonal stamp in the middle of each page: "CROSSEDHEART LICENSED" over the reader's name
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

/** First line of the stamp on every page. Change it to change the wording. */
const LICENCE = "CROSSEDHEART LICENSED";

async function watermarkPdf(
  source,
  { name, email, bookTitle, chapterTitle, watermarkId, unlockedChapters = [] },
) {
  const doc = await PDFDocument.load(
    Buffer.isBuffer(source) ? source : fs.readFileSync(source),
    { ignoreEncryption: true },
  );
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const small = await doc.embedFont(StandardFonts.Helvetica);
  const who = clean(name);
  const footer = clean(
    `Licensed to ${name} <${email}> | ${bookTitle} - ${chapterTitle} | ${new Date().toISOString().slice(0, 10)} | ID ${watermarkId}`,
  );
  const lines = [LICENCE, who]; // line 1: CROSSEDHEART LICENSED   line 2: the reader's name
  const angle = 45;
  const rad = (angle * Math.PI) / 180;
  const ux = Math.cos(rad),
    uy = Math.sin(rad); // direction the text runs
  const nx = -uy,
    ny = ux; // direction across the lines

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    // ONE stamp in the middle of the page, sized so the longest line stays well inside the page
    const longest = Math.max(
      ...lines.map((l) => font.widthOfTextAtSize(l, 100)),
    );
    const target = Math.min((width * 0.78) / ux, (height * 0.6) / uy);
    const size = Math.max(10, Math.min(46, (target / longest) * 100));
    const lh = size * 1.45;
    lines.forEach((text, i) => {
      const w = font.widthOfTextAtSize(text, size);
      const off = ((lines.length - 1) / 2 - i) * lh; // first line sits above the middle, second below
      const cx = width / 2 + nx * off;
      const cy = height / 2 + ny * off;
      page.drawText(text, {
        x: cx - (w / 2) * ux,
        y: cy - (w / 2) * uy,
        size,
        font,
        color: rgb(0.42, 0.42, 0.42),
        opacity: 0.24,
        rotate: degrees(angle),
      });
    });
    // tiny trace line along the bottom edge (who/when/id) so a leaked copy can be traced
    const fs2 = Math.min(7, (width - 24) / Math.max(footer.length * 0.5, 1));
    page.drawText(footer, {
      x: 12,
      y: 8,
      size: Math.max(4, fs2),
      font: small,
      color: rgb(0.4, 0.4, 0.4),
      opacity: 0.55,
    });
  }
  doc.setAuthor(`Licensed to ${who}`);
  doc.setSubject(clean(`${bookTitle} - ${chapterTitle}`));
  doc.setKeywords([`wm:${watermarkId}`, ...unlockedChapters.map(clean)]);
  doc.setProducer("Crossed Hearts");
  return Buffer.from(await doc.save());
}

module.exports = { watermarkPdf, makeWatermarkId };
