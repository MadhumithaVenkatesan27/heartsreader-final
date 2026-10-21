/**
 * Everything the frontend calls under /api/library:
 *   GET  /payment-config                      public keys + which gateways are on
 *   GET  /titles                              titles I own + which chapters are unlocked
 *   GET  /                                    my paid purchases (bookId populated: imprint, format, totalChapters, coverUrl)
 *   GET  /reading-state   PUT /progress   POST /bookmarks   DELETE /bookmarks/:id
 *   GET  /purchases/:id/invoice.pdf
 *   POST /:titleId/razorpay-order             {currency:'INR', chapterId?}   -> Razorpay order
 *   POST /:titleId/confirm-razorpay           Razorpay checkout response     -> purchase
 *   POST /:titleId/payment-intent             {currency:'USD', chapterId?}   -> Stripe client secret
 *   POST /:titleId/confirm-payment            {paymentIntentId}              -> purchase
 *   POST /:bookId/read-token/:chapterId       -> {readToken}
 *   GET  /:bookId/read/:chapterId?readToken=  -> PDF (needs login + ownership)
 *   GET  /:bookId/preview/:chapterId          -> PDF (free chapters only, no login)
 * :titleId / :bookId is whatever id the static frontend uses: Mongo id, slug, or alias like "matchmaker-v1".
 * chapterId is a chapter _id or the frontend key "ch<N>".
 */
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const config = require("../config");
const Book = require("../models/Book");
const Purchase = require("../models/Purchase");
const ReadEvent = require("../models/ReadEvent");
const ReadingProgress = require("../models/ReadingProgress");
const Bookmark = require("../models/Bookmark");
const mongoose = require("mongoose");
const storage = require("../services/storage");
const { watermarkPdf, makeWatermarkId } = require("../services/watermark");
const AppError = require("../utils/AppError");
const { validate, z } = require("../utils/validate");
const { ok } = require("../utils/respond");
const { authenticate, optionalAuth } = require("../middleware/auth");
const { entitlements, canRead } = require("../services/access");
const pay = require("../services/payments");
const { findBook, findChapter } = require("./books");
const { buildLibrary } = require("../services/libraryView");

// ── Public ───────────────────────────────────────────────
router.get("/payment-config", (_req, res) => {
  const { stripe, razorpay, mock } = config.payments;
  ok(res, {
    mock,
    stripe: {
      enabled: mock || !!stripe.secretKey,
      publishableKey: stripe.publishableKey || (mock ? "pk_test_mock" : ""),
    },
    razorpay: {
      enabled: mock || !!(razorpay.keyId && razorpay.keySecret),
      keyId: razorpay.keyId || (mock ? "rzp_test_mock" : ""),
    },
  });
});

/** Free chapters can be previewed by anyone. */
router.get("/:bookId/preview/:chapterId", optionalAuth, async (req, res) => {
  const book = await findBook(req.params.bookId);
  const chapter = findChapter(book, req.params.chapterId);
  if (!chapter.free)
    throw new AppError("This chapter is not free.", 403, "PURCHASE_REQUIRED");
  await sendChapterPdf(req, res, book, chapter);
});

// ── Everything below needs a login ───────────────────────
router.use(authenticate);

const CURRENCY = z.enum(["INR", "USD"]);
const orderBody = z.object({
  currency: CURRENCY,
  chapterId: z.string().trim().max(60).optional(),
});

/** Resolve the title (+ optional chapter) from the URL/body, create the pending purchase + provider order. */
async function startCheckout(req, currency) {
  const book = await findBook(req.params.titleId);
  const chapter =
    req.body.chapterId && req.body.chapterId !== "bundle"
      ? findChapter(book, req.body.chapterId)
      : undefined;
  return pay.createCheckout(req.user, { book, chapter, currency });
}

router.post(
  "/:titleId/razorpay-order",
  validate(orderBody.extend({ currency: z.literal("INR") })),
  async (req, res) => {
    const c = await startCheckout(req, "INR");
    // Razorpay Checkout wants `amount` in paise
    ok(
      res,
      {
        razorpayOrderId: c.razorpayOrderId,
        keyId: c.keyId,
        amount: c.amountMinor,
        currency: "INR",
        purchaseId: c.purchaseId,
      },
      {},
      201,
    );
  },
);

router.post(
  "/:titleId/confirm-razorpay",
  validate(
    z.object({
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().default(""),
    }),
  ),
  async (req, res) => {
    const purchase = await pay.confirmRazorpay(req.user, req.body);
    ok(res, { purchase }, { message: "Payment confirmed." });
  },
);

router.post(
  "/:titleId/payment-intent",
  validate(orderBody.extend({ currency: z.literal("USD") })),
  async (req, res) => {
    const c = await startCheckout(req, "USD");
    ok(
      res,
      {
        clientSecret: c.clientSecret,
        paymentIntentId: c.paymentIntentId,
        purchaseId: c.purchaseId,
      },
      {},
      201,
    );
  },
);

router.post(
  "/:titleId/confirm-payment",
  validate(z.object({ paymentIntentId: z.string().min(1) })),
  async (req, res) => {
    const purchase = await pay.confirmStripe(
      req.user,
      req.body.paymentIntentId,
    );
    ok(res, { purchase }, { message: "Payment confirmed." });
  },
);

// ── Reading state: progress per chapter + bookmarks (ids are the frontend's own: titleId + "ch<N>") ──
const titleIdSchema = z.string().trim().toLowerCase().min(1).max(80);
const chapterSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^ch\d{1,4}$/, "chapter must look like ch1");

/** Titles the reader owns and exactly which chapters are unlocked (for the My Library page). */
router.get("/titles", async (req, res) =>
  ok(res, { titles: await buildLibrary(req.user._id) }),
);

router.get("/reading-state", async (req, res) => {
  const [progress, bookmarks] = await Promise.all([
    ReadingProgress.find({ userId: req.user._id })
      .sort({ lastReadAt: -1 })
      .limit(1000)
      .select(
        "titleId chapter page totalPages percent completed lastReadAt -_id",
      ),
    Bookmark.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(1000)
      .select("titleId chapter page note createdAt"),
  ]);
  ok(res, { progress, bookmarks });
});

router.put(
  "/progress",
  validate(
    z.object({
      titleId: titleIdSchema,
      chapter: chapterSchema,
      page: z.coerce.number().int().min(1).max(5000),
      totalPages: z.coerce.number().int().min(0).max(5000).default(0),
      completed: z.boolean().optional(),
    }),
  ),
  async (req, res) => {
    const { titleId, chapter, page, totalPages, completed } = req.body;
    const percent = completed
      ? 100
      : totalPages
        ? Math.min(
            100,
            Math.round((Math.min(page, totalPages) / totalPages) * 100),
          )
        : 0;
    const set = {
      page,
      totalPages,
      percent,
      lastReadAt: new Date(),
      userName: req.user.name || "",
      userEmail: req.user.email || "",
    };
    const update = { $set: set };
    if (completed)
      set.completed = true; // finishing is permanent ("Read again" does not undo it)
    else update.$setOnInsert = { completed: false };
    const row = await ReadingProgress.findOneAndUpdate(
      { userId: req.user._id, titleId, chapter },
      update,
      { upsert: true, returnDocument: "after" },
    );
    ok(res, {
      progress: {
        titleId: row.titleId,
        chapter: row.chapter,
        page: row.page,
        totalPages: row.totalPages,
        percent: row.percent,
        completed: row.completed,
        lastReadAt: row.lastReadAt,
      },
    });
  },
);

router.post(
  "/bookmarks",
  validate(
    z.object({
      titleId: titleIdSchema,
      chapter: chapterSchema,
      page: z.coerce.number().int().min(1).max(5000),
      note: z.string().trim().max(300).default(""),
    }),
  ),
  async (req, res) => {
    const { titleId, chapter, page, note } = req.body;
    if ((await Bookmark.countDocuments({ userId: req.user._id })) >= 500)
      throw new AppError(
        "Bookmark limit reached (500). Delete some first.",
        400,
        "LIMIT",
      );
    const bookmark = await Bookmark.findOneAndUpdate(
      { userId: req.user._id, titleId, chapter, page },
      {
        $set: {
          note,
          userName: req.user.name || "",
          userEmail: req.user.email || "",
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    ok(res, { bookmark }, {}, 201);
  },
);

router.delete("/bookmarks/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError("Bookmark not found.", 404, "NOT_FOUND");
  const r = await Bookmark.deleteOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!r.deletedCount)
    throw new AppError("Bookmark not found.", 404, "NOT_FOUND");
  ok(res, undefined, { message: "Bookmark removed." });
});

// ── My purchases / invoices ──────────────────────────────
router.get("/", async (req, res) => {
  const rows = await Purchase.find({ userId: req.user._id, status: "paid" })
    .sort({ paidAt: -1 })
    .populate(
      "bookId",
      "title slug aliases coverImageUrl imprint format chapters._id chapters.order chapters.title chapters.free",
    );
  const purchases = rows.map((p) => {
    const o = p.toObject();
    if (o.bookId && o.bookId._id) {
      o.bookId.totalChapters = (o.bookId.chapters || []).length;
      o.bookId.coverUrl = o.bookId.coverImageUrl || "";
    }
    return o;
  });
  ok(res, { purchases });
});

router.get("/purchases/:id/invoice.pdf", async (req, res) => {
  const p = await Purchase.findOne({
    _id: req.params.id,
    userId: req.user._id,
    status: "paid",
  });
  if (!p) throw new AppError("Invoice not found.", 404, "NOT_FOUND");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${p.invoiceNumber || p._id}.pdf"`,
  });
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  const sym = p.currency === "INR" ? "Rs. " : "$";
  doc.fontSize(20).text("Crossed Hearts — Invoice");
  doc
    .moveDown()
    .fontSize(11)
    .text(`Invoice: ${p.invoiceNumber || "-"}`)
    .text(`Date: ${(p.paidAt || p.createdAt).toISOString().slice(0, 10)}`)
    .text(`Customer: ${req.user.name} <${req.user.email}>`)
    .moveDown()
    .text(
      `${p.bookTitle} — ${p.purchaseType === "book" ? "Full volume" : `Chapters: ${p.chapterTitles.join(", ")}`}`,
    )
    .moveDown()
    .fontSize(14)
    .text(
      `Total paid: ${sym}${p.amount.toFixed(2)} (${p.currency}) via ${p.provider}`,
    );
  doc.end();
});

// ── Reading ──────────────────────────────────────────────
/**
 * Serves the chapter. Logged-in readers always get a copy stamped with their name/email/id (see services/watermark.js);
 * anonymous free previews are served as-is.
 */
async function sendChapterPdf(req, res, book, chapter) {
  const full = await Book.findById(book._id).select("+chapters.pdfFile");
  const file = full?.chapters.id(chapter._id)?.pdfFile;
  const original = file ? await storage.get(file) : null;
  if (!original)
    throw new AppError("This chapter has no file yet.", 404, "NO_FILE");
  await Book.updateOne({ _id: book._id }, { $inc: { "analytics.reads": 1 } });
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (!req.user) return res.sendFile(abs);

  const ent = await entitlements(req.user._id, book._id);
  const unlocked = book.chapters
    .filter((c) => canRead(ent, c))
    .sort((a, b) => a.order - b.order)
    .map((c) => `Ch${c.order}`);
  const watermarkId = makeWatermarkId(req.user._id, chapter._id);
  const buf = await watermarkPdf(original, {
    name: req.user.name,
    email: req.user.email,
    bookTitle: book.title,
    chapterTitle: chapter.title,
    watermarkId,
    unlockedChapters: unlocked,
  });
  await Promise.all([
    ReadEvent.create({
      userId: req.user._id,
      bookId: book._id,
      chapterId: chapter._id,
      watermarkId,
      ip: req.ip,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    }),
    touchProgress(req, book, chapter),
  ]);
  res.set("Content-Length", String(buf.length));
  res.end(buf);
}

/** Opening a chapter counts as "recently opened" (title key = the id the frontend used, if it is one of the book's ids). */
function touchProgress(req, book, chapter) {
  const param = String(req.params.bookId).toLowerCase();
  const titleId = [book.slug, ...book.aliases].includes(param)
    ? param
    : book.slug;
  return ReadingProgress.updateOne(
    { userId: req.user._id, titleId, chapter: `ch${chapter.order}` },
    {
      $set: { lastReadAt: new Date() },
      $setOnInsert: { page: 1, totalPages: 0, percent: 0, completed: false },
    },
    { upsert: true },
  );
}

async function requireAccess(req) {
  const book = await findBook(req.params.bookId);
  const chapter = findChapter(book, req.params.chapterId);
  const ent = await entitlements(req.user._id, book._id);
  if (!canRead(ent, chapter))
    throw new AppError(
      "Purchase this chapter to read it.",
      403,
      "PURCHASE_REQUIRED",
    );
  return { book, chapter };
}

router.post("/:bookId/read-token/:chapterId", async (req, res) => {
  const { book, chapter } = await requireAccess(req);
  const readToken = jwt.sign(
    { u: String(req.user._id), b: String(book._id), c: String(chapter._id) },
    config.jwt.readSecret,
    { expiresIn: config.jwt.readTtl },
  );
  ok(res, { readToken, expiresIn: config.jwt.readTtl });
});

router.get("/:bookId/read/:chapterId", async (req, res) => {
  const { book, chapter } = await requireAccess(req);
  if (!chapter.free) {
    // Paid chapters must present the short-lived token that was issued to this very user for this very chapter
    let p;
    try {
      p = jwt.verify(String(req.query.readToken || ""), config.jwt.readSecret);
    } catch {
      throw new AppError(
        "Reading link expired. Please reopen the chapter.",
        401,
        "READ_TOKEN_INVALID",
      );
    }
    if (
      p.u !== String(req.user._id) ||
      p.b !== String(book._id) ||
      p.c !== String(chapter._id)
    ) {
      throw new AppError(
        "Reading link is not valid for this chapter.",
        403,
        "READ_TOKEN_INVALID",
      );
    }
  }
  await sendChapterPdf(req, res, book, chapter);
});

module.exports = router;
