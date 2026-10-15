const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const AppError = require('../utils/AppError');

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

async function load(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.accessSecret);
  } catch {
    throw new AppError('Invalid or expired token.', 401, 'TOKEN_INVALID');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new AppError('Account not found or disabled.', 401, 'TOKEN_INVALID');
  return user;
}

/** Requires a valid access token. Sets req.user. */
async function authenticate(req, _res, next) {
  const token = bearer(req);
  if (!token) throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');
  req.user = await load(token);
  next();
}

/** Sets req.user when a valid token is present, otherwise continues anonymously. */
async function optionalAuth(req, _res, next) {
  const token = bearer(req);
  if (token) req.user = await load(token);
  next();
}

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new AppError('You do not have permission to do that.', 403, 'FORBIDDEN');
  next();
};

module.exports = { authenticate, optionalAuth, requireRole };
