const mongoose = require('mongoose');

module.exports = mongoose.model(
  'Notification',
  new mongoose.Schema(
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      type: { type: String, default: 'info' },
      title: { type: String, required: true },
      message: { type: String, default: '' },
      read: { type: Boolean, default: false },
    },
    { timestamps: true },
  ),
);
