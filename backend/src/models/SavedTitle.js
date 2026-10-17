const mongoose = require('mongoose');

/** "Add to library" without buying: one row per reader + title. */
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    titleId: { type: String, required: true, lowercase: true, trim: true, maxlength: 80 },
  },
  { timestamps: { createdAt: 'addedAt', updatedAt: false } },
);
schema.index({ userId: 1, titleId: 1 }, { unique: true });

module.exports = mongoose.models.SavedTitle || mongoose.model('SavedTitle', schema);
