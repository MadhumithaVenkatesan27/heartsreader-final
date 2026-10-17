const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // who owns it (handy when you browse the data in Atlas)
    userName: { type: String, default: '', trim: true, maxlength: 80 },
    userEmail: { type: String, default: '', trim: true, lowercase: true, maxlength: 120 },
    titleId: { type: String, required: true, lowercase: true, trim: true, maxlength: 80 },
    chapter: { type: String, required: true, lowercase: true, trim: true, maxlength: 40 },
    page: { type: Number, required: true, min: 1 },
    totalPages: { type: Number, default: 0, min: 0 },
    note: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ userId: 1, titleId: 1, chapter: 1, page: 1 }, { unique: true });

module.exports = mongoose.models.Bookmark || mongoose.model('Bookmark', schema);
