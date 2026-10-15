require('dotenv').config();
const path = require('path');

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const isTest = env === 'test';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name} (see .env.example)`);
  return v;
}
function secret(name) {
  const v = required(name);
  if (isProd && (v.length < 32 || /^change-me/i.test(v))) {
    throw new Error(`${name} must be a random string of at least 32 characters in production`);
  }
  return v;
}
const list = (v) => String(v || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

const frontendOrigins = list(process.env.FRONTEND_URL);

const config = {
  env, isProd, isTest,
  port: Number(process.env.PORT || 5000),
  trustProxy: process.env.TRUST_PROXY || 0,
  mongoUri: required('MONGO_URI'),
  jwt: {
    accessSecret: secret('JWT_ACCESS_SECRET'),
    refreshSecret: secret('JWT_REFRESH_SECRET'),
    readSecret: secret('JWT_READ_SECRET'),
    accessTtl: '15m',
    refreshTtlMs: 30 * 24 * 3600 * 1000,
    readTtl: '10m',
  },
  requireEmailVerification: bool(process.env.REQUIRE_EMAIL_VERIFICATION, true),
  frontendOrigins,
  resetPasswordUrl: (process.env.RESET_PASSWORD_URL || `${frontendOrigins[0] || 'http://localhost:5502'}/reset-password.html`),
  cookie: {
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    secure: isProd || process.env.COOKIE_SAMESITE === 'none',
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    // DEV ONLY escape hatch for antivirus/proxy that re-signs TLS ("self-signed certificate in certificate chain"). Refused in production.
    tlsInsecure: bool(process.env.SMTP_TLS_INSECURE) && !isProd,
    from: process.env.MAIL_FROM || 'Crossed Hearts <no-reply@heartsreader.com>',
    supportTo: process.env.SUPPORT_EMAIL || 'support@heartsreader.com',
  },
  sms: { // optional: Twilio. Without it, phone codes are printed in the server console (development only)
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
  },
  payments: {
    mock: bool(process.env.MOCK_PAYMENTS) && !isProd,
    usdToInr: Number(process.env.USD_TO_INR || 85),
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    },
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    },
  },
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:support@heartsreader.com',
  },
  brevo: {
    apiKey: process.env.BREVO_API_KEY || '', // optional: syncs contacts into your Brevo CRM
    listId: Number(process.env.BREVO_LIST_ID || 0), // every verified reader
    newsListId: Number(process.env.BREVO_NEWS_LIST_ID || 0), // readers who opted in to updates
  },
  enableLicensorPortal: bool(process.env.ENABLE_LICENSOR_PORTAL, false),
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || './uploads/private'),
};

if (!/^https?:\/\/[^\s=]+$/i.test(config.resetPasswordUrl)) {
  throw new Error(`RESET_PASSWORD_URL must be a full web address such as http://localhost:3000/reset-password, but it is "${config.resetPasswordUrl}". In .env write the name once only: RESET_PASSWORD_URL=http://localhost:3000/reset-password`);
}
if (isProd && bool(process.env.SMTP_TLS_INSECURE)) {
  throw new Error('SMTP_TLS_INSECURE must not be enabled in production');
}
if (isProd && bool(process.env.MOCK_PAYMENTS)) {
  throw new Error('MOCK_PAYMENTS must not be enabled in production');
}
if (isProd && !config.requireEmailVerification) {
  throw new Error('REQUIRE_EMAIL_VERIFICATION must stay true in production');
}

module.exports = config;
