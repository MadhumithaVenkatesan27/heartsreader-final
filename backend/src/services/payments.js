const Stripe = require('stripe');
const Razorpay = require('razorpay');
const config = require('../config');
const AppError = require('../utils/AppError');
const Book = require('../models/Book');
const Purchase = require('../models/Purchase');
const { notify } = require('./notify');
const { sendMail } = require('../utils/mailer');
const User = require('../models/User');
const { nextSeq } = require('../models/Counter');
const { entitlements } = require('./access');
const { hmacHex, safeEqual, randomToken } = require('../utils/crypto');

let _stripe;
let _razorpay;
function stripe() {
  if (!config.payments.stripe.secretKey) throw new AppError('Stripe is not configured.', 503, 'PROVIDER_NOT_CONFIGURED');
  return (_stripe ||= new Stripe(config.payments.stripe.secretKey));
}
function razorpay() {
  const { keyId, keySecret } = config.payments.razorpay;
  if (!keyId || !keySecret) throw new AppError('Razorpay is not configured.', 503, 'PROVIDER_NOT_CONFIGURED');
  return (_razorpay ||= new Razorpay({ key_id: keyId, key_secret: keySecret }));
}

const round2 = (n) => Math.round(n * 100) / 100;
const minor = (amount) => Math.round(amount * 100);

function unitPrice(book, chapter, currency) {
  if (currency === 'USD') return chapter?.priceUSD ?? book.pricing.chapterUSD;
  return chapter?.priceINR ?? book.pricing.chapterINR ?? round2(((chapter?.priceUSD ?? book.pricing.chapterUSD) || 0) * config.payments.usdToInr);
}
function fullPrice(book, currency) {
  return currency === 'USD' ? book.pricing.fullUSD : book.pricing.fullINR ?? round2(book.pricing.fullUSD * config.payments.usdToInr);
}

const providerFor = (currency) => (currency === 'INR' ? 'razorpay' : 'stripe');

/**
 * Create a pending Purchase + the provider-side order/intent. Prices are always computed server-side.
 * `chapter` omitted = the whole title ("bundle"). `currency` INR -> Razorpay, USD -> Stripe.
 */
async function createCheckout(user, { book, chapter, currency }) {
  const provider = providerFor(currency);
  const ent = await entitlements(user._id, book._id);
  if (ent.fullBook) throw new AppError('You already own this title.', 409, 'ALREADY_OWNED');

  let amount;
  if (!chapter) {
    amount = fullPrice(book, currency);
  } else {
    if (chapter.free) throw new AppError('Free chapters do not need to be purchased.', 400, 'FREE_CHAPTER');
    if (ent.chapterIds.has(String(chapter._id))) throw new AppError('You already own this chapter.', 409, 'ALREADY_OWNED');
    amount = round2(unitPrice(book, chapter, currency));
  }
  if (!(amount > 0)) throw new AppError('This item cannot be purchased right now.', 400, 'NOT_PURCHASABLE');

  const purchase = await Purchase.create({
    userId: user._id,
    bookId: book._id,
    bookTitle: book.title,
    purchaseType: chapter ? 'chapter' : 'book',
    chapterIds: chapter ? [chapter._id] : [],
    chapterTitles: chapter ? [chapter.title] : [],
    amount,
    currency,
    provider,
  });
  const base = { purchaseId: purchase._id, provider, amount, currency };

  try {
    if (config.payments.mock) {
      purchase.providerOrderId = `mock_order_${randomToken(8)}`;
      if (provider === 'stripe') purchase.providerPaymentId = `pi_mock_${randomToken(8)}`;
      await purchase.save();
      return { ...base, mock: true, razorpayOrderId: purchase.providerOrderId, amountMinor: minor(amount), keyId: 'rzp_test_mock', paymentIntentId: purchase.providerPaymentId, clientSecret: `${purchase.providerPaymentId}_secret_mock` };
    }
    if (provider === 'razorpay') {
      const order = await razorpay().orders.create({
        amount: minor(amount),
        currency: 'INR',
        receipt: String(purchase._id),
        notes: { purchaseId: String(purchase._id) },
      });
      purchase.providerOrderId = order.id;
      await purchase.save();
      return { ...base, razorpayOrderId: order.id, keyId: config.payments.razorpay.keyId, amountMinor: order.amount };
    }
    const intent = await stripe().paymentIntents.create({
      amount: minor(amount),
      currency: 'usd',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { purchaseId: String(purchase._id) },
    });
    purchase.providerPaymentId = intent.id;
    await purchase.save();
    return { ...base, clientSecret: intent.client_secret, paymentIntentId: intent.id };
  } catch (err) {
    purchase.status = 'failed';
    await purchase.save();
    throw err;
  }
}

/**
 * Idempotently mark a purchase paid. Safe to call from the verify endpoint AND from webhooks, any number of times.
 * `paid` ({amountMinor, currency}) is checked against what we charged when provided.
 */
async function fulfill(filter, { providerPaymentId, paid } = {}) {
  const purchase = await Purchase.findOne(filter);
  if (!purchase) return null;
  if (purchase.status === 'paid') return purchase;
  if (purchase.status !== 'pending') return purchase;
  if (paid && (paid.amountMinor !== minor(purchase.amount) || String(paid.currency).toUpperCase() !== purchase.currency)) {
    console.error(`Payment mismatch for purchase ${purchase._id}: expected ${minor(purchase.amount)} ${purchase.currency}, got ${paid.amountMinor} ${paid.currency}`);
    return purchase;
  }
  const update = { status: 'paid', paidAt: new Date() };
  if (providerPaymentId) update.providerPaymentId = providerPaymentId;
  const won = await Purchase.findOneAndUpdate({ _id: purchase._id, status: 'pending' }, update, { new: true });
  if (!won) return Purchase.findById(purchase._id); // another request got there first
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(await nextSeq('invoice')).padStart(6, '0')}`;
  await Purchase.updateOne({ _id: won._id }, { invoiceNumber });
  won.invoiceNumber = invoiceNumber;
  await Book.updateOne({ _id: won.bookId }, { $inc: { 'analytics.purchases': 1 } });
  await notify(won.userId, {
    type: 'purchase',
    title: 'Payment successful',
    message: `You now have access to ${won.purchaseType === 'book' ? 'all of' : 'selected chapters of'} “${won.bookTitle}”.`,
  });
  // purchase confirmation email (sent through Brevo SMTP when configured); never blocks or fails the payment
  User.findById(won.userId).select('name email').then((u) => u && sendMail({
    to: u.email,
    subject: `Your Crossed Hearts purchase (${invoiceNumber})`,
    text: `Hi ${u.name},\n\nThank you! You now have access to ${won.purchaseType === 'book' ? 'the full volume of' : 'selected chapters of'} "${won.bookTitle}".\nAmount: ${won.currency} ${won.amount.toFixed(2)} (${won.provider})\nInvoice: ${invoiceNumber} - download it from My Account > Orders.\n\nHappy reading!\nCrossed Hearts`,
  })).catch((e) => console.warn('purchase email failed:', e.message));
  return won;
}

async function markFailed(filter) {
  await Purchase.updateOne({ ...filter, status: 'pending' }, { status: 'failed' });
}

function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const expected = hmacHex(config.payments.razorpay.keySecret, `${orderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

/** Stripe: the browser confirmed the card client-side; we re-check the PaymentIntent with Stripe before granting access. */
async function confirmStripe(user, paymentIntentId) {
  const purchase = await Purchase.findOne({ provider: 'stripe', providerPaymentId: paymentIntentId, userId: user._id });
  if (!purchase) throw new AppError('Payment not found.', 404, 'NOT_FOUND');
  if (config.payments.mock) return fulfill({ _id: purchase._id }, { providerPaymentId: paymentIntentId });
  const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== 'succeeded') throw new AppError('Payment is not complete yet.', 402, 'PAYMENT_INCOMPLETE');
  return fulfill({ _id: purchase._id }, {
    providerPaymentId: pi.id,
    paid: { amountMinor: pi.amount_received ?? pi.amount, currency: pi.currency },
  });
}

/** Razorpay: verify the HMAC signature Razorpay Checkout returned, then grant access. */
async function confirmRazorpay(user, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }) {
  const purchase = await Purchase.findOne({ provider: 'razorpay', providerOrderId: orderId, userId: user._id });
  if (!purchase) throw new AppError('Order not found.', 404, 'NOT_FOUND');
  if (!config.payments.mock && !verifyRazorpaySignature({ orderId, paymentId, signature })) {
    throw new AppError('Payment verification failed.', 400, 'BAD_SIGNATURE');
  }
  return fulfill({ _id: purchase._id }, { providerPaymentId: paymentId });
}

async function refund(purchase) {
  if (purchase.status !== 'paid') throw new AppError('Only paid purchases can be refunded.', 400, 'NOT_REFUNDABLE');
  if (!config.payments.mock) {
    if (purchase.provider === 'stripe') await stripe().refunds.create({ payment_intent: purchase.providerPaymentId });
    else await razorpay().payments.refund(purchase.providerPaymentId, { amount: minor(purchase.amount) });
  }
  purchase.status = 'refunded';
  purchase.refundedAt = new Date();
  await purchase.save();
  return purchase;
}

module.exports = {
  stripe, razorpay, createCheckout, fulfill, markFailed, confirmStripe, confirmRazorpay, verifyRazorpaySignature, refund, minor,
};
