/**
 * Provider webhooks. The ONLY source of truth for "money arrived" besides Razorpay's signed verify call.
 * Mounted BEFORE express.json() because signature checks need the exact raw request body.
 */
const router = require('express').Router();
const express = require('express');
const config = require('../config');
const AppError = require('../utils/AppError');
const { hmacHex, safeEqual } = require('../utils/crypto');
const pay = require('../services/payments');

router.use(express.raw({ type: '*/*', limit: '1mb' }));

router.post('/stripe', async (req, res) => {
  if (!config.payments.stripe.webhookSecret) throw new AppError('Webhook not configured.', 503);
  let event;
  try {
    event = pay.stripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.payments.stripe.webhookSecret);
  } catch {
    throw new AppError('Invalid signature.', 400, 'BAD_SIGNATURE');
  }
  const obj = event.data.object;
  if (event.type === 'payment_intent.succeeded') {
    await pay.fulfill({ provider: 'stripe', providerPaymentId: obj.id }, { paid: { amountMinor: obj.amount_received ?? obj.amount, currency: obj.currency } });
  } else if (event.type === 'payment_intent.payment_failed') {
    await pay.markFailed({ provider: 'stripe', providerPaymentId: obj.id });
  }
  res.json({ received: true });
});

router.post('/razorpay', async (req, res) => {
  const secret = config.payments.razorpay.webhookSecret;
  if (!secret) throw new AppError('Webhook not configured.', 503);
  const sig = String(req.headers['x-razorpay-signature'] || '');
  if (!safeEqual(hmacHex(secret, req.body), sig)) throw new AppError('Invalid signature.', 400, 'BAD_SIGNATURE');
  const event = JSON.parse(req.body.toString('utf8'));
  const payment = event.payload?.payment?.entity;
  if (payment && (event.event === 'payment.captured' || event.event === 'order.paid')) {
    await pay.fulfill({ provider: 'razorpay', providerOrderId: payment.order_id }, { providerPaymentId: payment.id, paid: { amountMinor: payment.amount, currency: payment.currency } });
  } else if (payment && event.event === 'payment.failed') {
    // A failed attempt can be retried on the same order, so we leave the purchase pending.
  }
  res.json({ received: true });
});

module.exports = router;
