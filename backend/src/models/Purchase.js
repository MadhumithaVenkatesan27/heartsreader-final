const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    bookTitle: { type: String, required: true },
    purchaseType: { type: String, enum: ['book', 'chapter'], required: true },
    chapterIds: [{ type: mongoose.Schema.Types.ObjectId }],
    chapterTitles: [{ type: String }],

    amount: { type: Number, required: true, min: 0 }, // major units (USD / INR)
    currency: { type: String, enum: ['USD', 'INR'], required: true },
    provider: { type: String, enum: ['stripe', 'razorpay'], required: true },
    // Stripe: PaymentIntent id (known at creation). Razorpay: payment id (known at confirmation)
    providerPaymentId: { type: String },
    // Razorpay order id (known at creation)
    providerOrderId: { type: String },

    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending', index: true },
    paidAt: Date,
    refundedAt: Date,
    invoiceNumber: String,
  },
  { timestamps: true },
);
// A provider payment can only ever be attached to one purchase (idempotency guard)
purchaseSchema.index({ provider: 1, providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } });
purchaseSchema.index({ provider: 1, providerOrderId: 1 }, { partialFilterExpression: { providerOrderId: { $type: 'string' } } });

module.exports = mongoose.model('Purchase', purchaseSchema);
