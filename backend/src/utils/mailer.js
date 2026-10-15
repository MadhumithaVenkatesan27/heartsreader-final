const nodemailer = require('nodemailer');
const config = require('../config');

// When MAIL_VIA_API=true we send through Brevo's HTTPS API (works on Render's free plan,
// which blocks SMTP ports). Otherwise we use SMTP exactly as before.
const useApi = process.env.MAIL_VIA_API === 'true' && !!process.env.BREVO_API_KEY;

let transporter = null;
if (!useApi && config.mail.host) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    // LOCAL TESTING ONLY: some antivirus / proxies re-sign mail connections ("self-signed certificate in certificate chain").
    // Never honoured in production.
    tls: process.env.SMTP_TLS_INSECURE === 'true' && !config.isProd ? { rejectUnauthorized: false } : undefined,
  });
  if (process.env.SMTP_TLS_INSECURE === 'true' && !config.isProd) console.warn('⚠ SMTP_TLS_INSECURE=true: email certificate checks are OFF (local testing only).');
}

/** In tests/dev without SMTP, messages land here so they can be read back. */
const outbox = [];

/** Turns 'Crossed Hearts <hello@site.com>' into { name, email }. */
function parseAddress(value) {
  const str = String(value || '').trim();
  const m = str.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
  return { email: str };
}

async function sendViaBrevoApi({ to, subject, text, html, replyTo }) {
  const recipients = (Array.isArray(to) ? to : [to]).map(parseAddress);
  const body = {
    sender: parseAddress(config.mail.from),
    to: recipients,
    subject,
    htmlContent: html || `<p>${String(text || '').replace(/\n/g, '<br>')}</p>`,
    textContent: text || undefined,
  };
  if (replyTo) body.replyTo = parseAddress(replyTo);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

async function sendMail({ to, subject, text, html, replyTo }) {
  const message = { from: config.mail.from, to, subject, text, html, replyTo };
  if (useApi) return sendViaBrevoApi({ to, subject, text, html, replyTo });
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

/** Called once at startup: tells you straight away whether the email provider accepts your settings. */
async function verifyMailer() {
  if (useApi) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Brevo API said ${res.status}`);
      console.log('✔ Email ready via Brevo API (HTTPS)');
    } catch (err) {
      console.warn(`⚠ Email NOT working (${err.message}). Check BREVO_API_KEY and that MAIL_FROM is a verified sender in Brevo.`);
    }
    return;
  }
  if (!transporter) {
    console.log('✉  Email: SMTP_HOST is empty -> verification codes are printed in this terminal instead of being emailed.');
    return;
  }
  try {
    await transporter.verify();
    console.log(`✔ Email ready via ${config.mail.host}`);
  } catch (err) {
    console.warn(`⚠ Email NOT working (${err.message}). Check SMTP_USER / SMTP_PASS / MAIL_FROM in .env. Sign-ups will fail until this is fixed.`);
    if (/self.signed|certificate/i.test(err.message)) console.warn('  Hint: an antivirus or firewall on this computer is re-signing secure connections. Turn off its "encrypted connection / SSL scanning" for now, or see the README (SMTP_TLS_INSECURE=true is a development-only workaround).');
  }
}

module.exports = { sendMail, outbox, verifyMailer };
