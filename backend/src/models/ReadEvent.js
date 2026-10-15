const mongoose = require('mongoose');

/** One row each time a watermarked PDF is served: who, what, when, from where (anti-piracy trail). */
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', index: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId },
    watermarkId: { type: String, index: true }, // short code printed on the pages, find a leaked copy -> user
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model('ReadEvent', schema);
