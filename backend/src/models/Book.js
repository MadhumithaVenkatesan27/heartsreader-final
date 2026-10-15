const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema({
  order: { type: Number, required: true, min: 1 },
  title: { type: String, required: true, trim: true },
  free: { type: Boolean, default: false },
  // Optional per-chapter price overrides (fall back to book.pricing)
  priceUSD: { type: Number, min: 0 },
  priceINR: { type: Number, min: 0 },
  // File name inside UPLOADS_DIR - never exposed through the API
  pdfFile: { type: String, select: false },
  pageCount: { type: Number },
});

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Other ids the static frontend uses for this title (e.g. "grenimal-v1")
    aliases: { type: [String], default: [], index: true },
    category: { type: String, enum: ['Manga', 'Manhwa', 'Novel', 'Light Novel', 'Comic'], default: 'Manga' },
    genres: { type: [String], default: [] },
    description: { type: String, default: '' },
    coverImageUrl: { type: String, default: '' },
    ageRating: { type: String, default: '13+' },
    imprint: { type: String, default: 'Crossed Hearts', trim: true },
    format: { type: String, enum: ['digital', 'print', 'both'], default: 'digital' },
    chapters: { type: [chapterSchema], default: [] },
    pricing: {
      chapterUSD: { type: Number, default: 0.75, min: 0 },
      chapterINR: { type: Number, min: 0 },
      fullUSD: { type: Number, default: 6, min: 0 },
      fullINR: { type: Number, min: 0 },
    },
    licensors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    analytics: { purchases: { type: Number, default: 0 }, reads: { type: Number, default: 0 } },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Fields safe to return to the public. pdfFile is select:false so it never leaks. */
bookSchema.methods.toPublic = function toPublic() {
  const o = this.toObject({ virtuals: false });
  delete o.licensors;
  delete o.__v;
  o.chapters = (o.chapters || [])
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ _id: c._id, order: c.order, title: c.title, free: c.free, priceUSD: c.priceUSD, priceINR: c.priceINR }));
  o.totalChapters = o.chapters.length;
  o.coverUrl = o.coverImageUrl;
  if (o.analytics) o.analytics = { purchases: o.analytics.purchases };
  return o;
};

module.exports = mongoose.model('Book', bookSchema);
