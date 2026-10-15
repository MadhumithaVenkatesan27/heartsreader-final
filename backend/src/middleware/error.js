const config = require('../config');

function notFound(req, res) {
  res.status(404).json({ status: 'fail', message: `Route not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message;
  let code = err.code && typeof err.code === 'string' ? err.code : undefined;

  if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON body.'; code = 'BAD_JSON'; }
  else if (err.name === 'CastError') { status = 400; message = 'Invalid id.'; code = 'BAD_ID'; }
  else if (err.name === 'MulterError') { status = 400; code = 'UPLOAD_ERROR'; }
  else if (err.code === 11000) { status = 409; message = 'Duplicate value.'; code = 'DUPLICATE'; }
  else if (err.type === 'StripeInvalidRequestError' || err.type === 'StripeCardError') { status = 402; code = 'PAYMENT_ERROR'; }

  if (status >= 500) {
    if (!config.isTest) console.error(err);
    if (config.isProd) message = 'Something went wrong. Please try again.';
  }
  res.status(status).json({ status: status >= 500 ? 'error' : 'fail', message, code });
}

module.exports = { notFound, errorHandler };
