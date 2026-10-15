const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { sha256, randomToken } = require('../utils/crypto');
const { ok } = require('../utils/respond');

const COOKIE = 'refreshToken';
const BCRYPT_COST = config.isTest ? 4 : 12;
const cookieOpts = () => ({ httpOnly: true, secure: config.cookie.secure, sameSite: config.cookie.sameSite, path: '/api/auth' });

/** Create tokens, set the refresh cookie and send { status, accessToken, data: { user } }. */
async function sendSession(res, user, { message, httpStatus = 200 } = {}) {
  const accessToken = jwt.sign({ sub: String(user._id), role: user.role }, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtl });
  const refresh = randomToken(32);
  const entry = { hash: sha256(refresh), expires: new Date(Date.now() + config.jwt.refreshTtlMs) };
  // keep the 5 most recent sessions, drop expired ones
  await User.updateOne({ _id: user._id }, [
    { $set: { refreshTokens: { $slice: [{ $concatArrays: [{ $filter: { input: { $ifNull: ['$refreshTokens', []] }, cond: { $gt: ['$$this.expires', '$$NOW'] } } }, [entry]] }, -5] } } },
  ], { updatePipeline: true }); // Mongoose 9 requires this flag for pipeline-style updates
  res.cookie(COOKIE, refresh, { ...cookieOpts(), maxAge: config.jwt.refreshTtlMs });
  return ok(res, { user: user.toPublic() }, { accessToken, ...(message ? { message } : {}) }, httpStatus);
}

/** Shared password login (readers by email, licensors by licensorId). Throws AppError on failure. */
async function loginWithPassword(query, password) {
  const user = await User.findOne(query).select('+passwordHash +failedLogins +lockUntil');
  const invalid = new AppError('Invalid credentials.', 401, 'INVALID_CREDENTIALS');
  if (!user || !user.isActive) throw invalid;
  if (user.lockUntil && user.lockUntil > new Date()) throw new AppError('Account temporarily locked. Try again in a few minutes.', 423, 'LOCKED');
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    user.failedLogins += 1;
    if (user.failedLogins >= 5) {
      user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      user.failedLogins = 0;
    }
    await user.save();
    throw invalid;
  }
  if (!user.isEmailVerified) throw new AppError('Please verify your email first.', 403, 'EMAIL_NOT_VERIFIED');
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();
  return user;
}

module.exports = { COOKIE, BCRYPT_COST, cookieOpts, sendSession, loginWithPassword };
