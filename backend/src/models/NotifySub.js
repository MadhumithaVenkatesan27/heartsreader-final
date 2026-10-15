const mongoose = require('mongoose');

/**
 * "Notify me" subscriptions. One document per browser/device (endpoint), or per signed-in user / email when the
 * browser has no push permission. Guests allowed.
 */
const schema = new mongoose.Schema(
  {
    endpoint: { type: String, unique: true, sparse: true },
    subscription: { type: Object }, // full PushSubscription JSON from the browser
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    general: { type: Boolean, default: false }, // opted in to Crossed Hearts news
    titles: [{ _id: false, titleId: String, titleName: String, volume: Number, releaseDate: String }],
  },
  { timestamps: true },
);
schema.index({ 'titles.titleId': 1, 'titles.volume': 1 });

module.exports = mongoose.model('NotifySub', schema);
