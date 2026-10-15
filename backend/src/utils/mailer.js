const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
if (config.mail.host) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    ...(config.mail.tlsInsecure ? { tls: { rejectUnauthorized: false } } : {}),
    // LOCAL TESTING ONLY: some antivirus / proxies re-sign mail connections ("self-signed certificate in certificate chain").
    // Never honoured in production.
    tls: process.env.SMTP_TLS_INSECURE === 'true' && !config.isProd ? { rejectUnauthorized: false } : undefined,
  });
  if (process.env.SMTP_TLS_INSECURE === 'true' && !config.isProd) console.warn('⚠ SMTP_TLS_INSECURE=true: email certificate checks are OFF (local testing only).');
}

/** In tests/dev without SMTP, messages land here so they can be read back. */
const outbox = [];

async function sendMail({ to, subject, text, html, replyTo }) {
  const message = { from: config.mail.from, to, subject, text, html, replyTo };
  if (!transporter) {
    outbox.push(message);
    if (outbox.length > 100) outbox.shift();
    if (!config.isTest) {
      console.log(`\n📧 [dev mail → ${to}] ${subject}\n${text}\n`);
    }
    return { dev: true };
  }
  return transporter.sendMail(message);
}

/** Called once at startup: tells you straight away whether the email provider (e.g. Brevo) accepts your settings. */
async function verifyMailer() {
  if (!transporter) {
    console.log('✉  Email: SMTP_HOST is empty -> verification codes are printed in this terminal instead of being emailed.');
    return;
  }
  try {
    await transporter.verify();
    console.log(`✔ Email ready via ${config.mail.host}${config.mail.tlsInsecure ? '  (⚠ SMTP_TLS_INSECURE is ON: certificates are NOT checked, development only)' : ''}`);
  } catch (err) {
    console.warn(`⚠ Email NOT working (${err.message}). Check SMTP_USER / SMTP_PASS / MAIL_FROM in .env. Sign-ups will fail until this is fixed.`);
    if (/self.signed|certificate/i.test(err.message)) console.warn('  Hint: an antivirus or firewall on this computer is re-signing secure connections. Turn off its "encrypted connection / SSL scanning" for now, or see the README (SMTP_TLS_INSECURE=true is a development-only workaround).');
  }
}

module.exports = { sendMail, outbox, verifyMailer };
