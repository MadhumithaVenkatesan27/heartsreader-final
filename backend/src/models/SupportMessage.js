const mongoose = require('mongoose');

module.exports = mongoose.model(
  'SupportMessage',
  new mongoose.Schema(
    {
      category: { type: String, default: 'General', maxlength: 60 },
      name: { type: String, required: true, maxlength: 100 },
      email: { type: String, required: true, maxlength: 254 },
      message: { type: String, required: true, maxlength: 4000 },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['open', 'closed'], default: 'open' },
    },
    { timestamps: true },
  ),
);
