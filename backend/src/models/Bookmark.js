/**
 * Bookmarks (login needed). Mounted at /api/bookmarks.
 *   GET    /api/bookmarks [?titleId=]                       -> { bookmarks: [...] }
 *   POST   /api/bookmarks {titleId, chapterId, page, totalPages?, note?}   -> { bookmark }   (same page twice = updates the note)
 *   PATCH  /api/bookmarks/:id {note?, page?}                -> { bookmark }
 *   DELETE /api/bookmarks/:id
 */
const router = require("express").Router();
const mongoose = require("mongoose");
const Bookmark = require("../models/Bookmark");
const AppError = require("../utils/AppError");
const { validate, z } = require("../utils/validate");
const { ok } = require("../utils/respond");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

const MAX = 500;
const out = (b) => ({
  _id: b._id,
  id: b._id,
  titleId: b.titleId,
  chapterId: b.chapter,
  page: b.page,
  totalPages: b.totalPages || 0,
  note: b.note || "",
  createdAt: b.createdAt,
});
const own = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError("Bookmark not found.", 404, "NOT_FOUND");
  const b = await Bookmark.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!b) throw new AppError("Bookmark not found.", 404, "NOT_FOUND");
  return b;
};

router.get("/", async (req, res) => {
  const q = { userId: req.user._id };
  if (req.query.titleId) q.titleId = String(req.query.titleId).toLowerCase();
  const rows = await Bookmark.find(q).sort({ createdAt: -1 }).limit(1000);
  ok(res, { bookmarks: rows.map(out) });
});

router.post(
  "/",
  validate(
    z.object({
      titleId: z.string().trim().toLowerCase().min(1).max(80),
      chapterId: z.string().trim().toLowerCase().min(1).max(40),
      page: z.coerce.number().int().min(1).max(5000),
      totalPages: z.coerce.number().int().min(0).max(5000).default(0),
      note: z.string().trim().max(300).default(""),
    }),
  ),
  async (req, res) => {
    const { titleId, chapterId, page, totalPages, note } = req.body;
    if ((await Bookmark.countDocuments({ userId: req.user._id })) >= MAX)
      throw new AppError(
        `Bookmark limit reached (${MAX}). Delete some first.`,
        400,
        "LIMIT",
      );
    const b = await Bookmark.findOneAndUpdate(
      { userId: req.user._id, titleId, chapter: chapterId, page },
      {
        $set: {
          note,
          totalPages,
          userName: req.user.name || "",
          userEmail: req.user.email || "",
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    ok(res, { bookmark: out(b) }, {}, 201);
  },
);

router.patch(
  "/:id",
  validate(
    z.object({
      note: z.string().trim().max(300).optional(),
      page: z.coerce.number().int().min(1).max(5000).optional(),
    }),
  ),
  async (req, res) => {
    const b = await own(req);
    if (req.body.note !== undefined) b.note = req.body.note;
    if (req.body.page !== undefined) b.page = req.body.page;
    try {
      await b.save();
    } catch (err) {
      if (err.code === 11000)
        throw new AppError(
          "You already have a bookmark on that page.",
          409,
          "DUPLICATE",
        );
      throw err;
    }
    ok(res, { bookmark: out(b) });
  },
);

router.delete("/:id", async (req, res) => {
  const b = await own(req);
  await b.deleteOne();
  ok(res, undefined, { message: "Bookmark removed." });
});

module.exports = router;
