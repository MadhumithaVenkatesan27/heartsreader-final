const crypto = require('crypto');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
const otp6 = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

module.exports = { sha256, randomToken, otp6, safeEqual, hmacHex };
