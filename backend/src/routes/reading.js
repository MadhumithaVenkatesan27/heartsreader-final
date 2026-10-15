/**
 * Reading progress per chapter (login needed). Mounted at /api/reading.
 *   PUT /api/reading/progress   {titleId, chapterId, page, totalPages, percent, completed}   upsert per user + chapter
 *   GET /api/reading/progress   [?titleId=]   -> { progress: [{titleId, chapterId, page, totalPages, percent, completed, lastReadAt}] }
 * A chapter counts as finished at 97% (and stays finished). ids are the frontend's own ("matchmaker-v1", "ch2" or a chapter _id).
 */
const router = require("express").Router();
const ReadingProgress = require("../models/ReadingProgress");
const { validate, z } = require("../utils/validate");
const { ok } = require("../utils/respond");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

const FINISHED_AT = 97;
const out = (r) => ({
  titleId: r.titleId,
  chapterId: r.chapter,
  page: r.page,
  totalPages: r.totalPages,
  percent: r.percent,
  completed: r.completed,
  lastReadAt: r.lastReadAt,
});

router.put(
  "/progress",
  validate(
    z.object({
      titleId: z.string().trim().toLowerCase().min(1).max(80),
      chapterId: z.string().trim().toLowerCase().min(1).max(40),
      page: z.coerce.number().int().min(0).max(5000).default(1),
      totalPages: z.coerce.number().int().min(0).max(5000).default(0),
      percent: z.coerce.number().min(0).max(100).optional(),
      completed: z.boolean().optional(),
    }),
  ),
  async (req, res) => {
    const { titleId, chapterId, totalPages, completed } = req.body;
    const page = Math.max(1, req.body.page);
    let percent = req.body.percent;
    if (percent === undefined)
      percent = totalPages
        ? Math.min(100, (Math.min(page, totalPages) / totalPages) * 100)
        : 0;
    percent = Math.round(percent);
    const finished = completed === true || percent >= FINISHED_AT;
    if (finished) percent = 100;
    const set = {
      page,
      totalPages,
      percent,
      lastReadAt: new Date(),
      userName: req.user.name || "",
      userEmail: req.user.email || "",
    };
    const update = { $set: set };
    if (finished)
      set.completed = true; // finishing is permanent ("read again" does not undo it)
    else update.$setOnInsert = { completed: false };
    const row = await ReadingProgress.findOneAndUpdate(
      { userId: req.user._id, titleId, chapter: chapterId },
      update,
      { upsert: true, returnDocument: "after" },
    );
    ok(res, { progress: out(row) });
  },
);

router.get("/progress", async (req, res) => {
  const q = { userId: req.user._id };
  if (req.query.titleId) q.titleId = String(req.query.titleId).toLowerCase();
  const rows = await ReadingProgress.find(q)
    .sort({ lastReadAt: -1 })
    .limit(2000);
  ok(res, { progress: rows.map(out) });
});

module.exports = router;
