const mongoose = require("mongoose");

/**
 * Where a user stopped in each chapter. Keyed by the SAME ids the frontend uses
 * (titleId like "matchmaker-v1", chapter like "ch2"), so it works even for titles that are not in the books collection yet.
 * One row per user + title + chapter. "Recently opened" = newest lastReadAt.
 */
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: { type: String, default: "", trim: true, maxlength: 100 },
    userEmail: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
      maxlength: 200,
    },
    titleId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
    },
    chapter: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 40,
    },
    page: { type: Number, default: 1, min: 1 },
    totalPages: { type: Number, default: 0, min: 0 },
    percent: { type: Number, default: 0, min: 0, max: 100 },
    completed: { type: Boolean, default: false },
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
schema.index({ userId: 1, titleId: 1, chapter: 1 }, { unique: true });

module.exports = mongoose.model("ReadingProgress", schema);
