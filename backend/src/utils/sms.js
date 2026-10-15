const config = require('../config');

/** In tests/dev without an SMS provider, messages land here so they can be read back. */
const smsOutbox = [];

/** Send a text message. Real SMS through Twilio when TWILIO_* is set; otherwise printed in the console (not allowed in production). */
async function sendSms(to, body) {
  const { accountSid, authToken, from } = config.sms;
  if (!accountSid || !authToken || !from) {
    if (config.isProd) {
      const AppError = require('./AppError');
      throw new AppError('Text messages are not set up on this server yet.', 503, 'SMS_DISABLED');
    }
    smsOutbox.push({ to, body });
    if (smsOutbox.length > 100) smsOutbox.shift();
    if (!config.isTest) console.log(`\n📱 [dev sms → ${to}] ${body}\n`);
    return { dev: true };
  }
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!r.ok) {
    const AppError = require('./AppError');
    throw new AppError('Could not send the text message. Check the number and try again.', 502, 'SMS_FAILED');
  }
  return r.json();
}

module.exports = { sendSms, smsOutbox };
