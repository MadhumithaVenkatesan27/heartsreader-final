const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/error');

function createApp() {
  const app = express();
  const tp = Number(config.trustProxy);
  app.set('trust proxy', Number.isNaN(tp) ? config.trustProxy : tp);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.frontendOrigins.includes(origin)),
    credentials: true,
  }));

  // Webhooks need the raw body, so they go before the JSON parser
  app.use('/api/webhooks', require('./routes/webhooks'));

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/books', require('./routes/books'));
  app.use('/api/me', require('./routes/me'));
  app.use('/api/account', require('./routes/account'));
  app.use('/api/reading', require('./routes/reading'));
  app.use('/api/bookmarks', require('./routes/bookmarks'));
  app.use('/api/wishlist', require('./routes/wishlist'));
  app.use('/api/newsletter', require('./routes/newsletter'));
  app.use('/api/notifications', require('./routes/pushNotifications'));
  app.use('/api/library', require('./routes/library'));
  if (config.enableLicensorPortal) app.use('/api/licensors', require('./routes/licensors')); // off for now
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', require('./routes/misc'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
