const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
    title: { type: String, required: true },
    coverImageUrl: String,
    quantity: { type: Number, required: true, min: 1, max: 20 },
    price: { type: Number, required: true, min: 0 }, // unit price
  },
  { _id: false },
);

const physicalOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderNumber: { type: String, required: true, unique: true },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    totalAmount: { type: Number, required: true },
    currency: { type: String, enum: ['USD', 'INR'], required: true },
    status: { type: String, enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'], default: 'Pending' },
    shipping: {
      name: String,
      email: String,
      phone: String,
      line1: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    trackingNumber: String,
    paidAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model('PhysicalOrder', physicalOrderSchema);
