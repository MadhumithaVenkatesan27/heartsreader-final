const nodemailer = require("nodemailer");
const config = require("../config");

const VIA_API = String(process.env.MAIL_VIA_API || "").toLowerCase() === "true";

let transporter = null;
if (!VIA_API && config.mail.host) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: config.mail.user
      ? { user: config.mail.user, pass: config.mail.pass }
      : undefined,
    tls:
      process.env.SMTP_TLS_INSECURE === "true" && !config.isProd
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

/** In tests/dev without email settings, messages land here so they can be read back. */
const outbox = [];

function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || "");
  return m
    ? { name: m[1].trim() || undefined, email: m[2].trim() }
    : { email: String(from || "").trim() };
}

async function sendViaBrevoApi({ to, subject, text, html, replyTo }) {
  const body = {
    sender: parseFrom(config.mail.from),
    to: [{ email: to }],
    subject,
    htmlContent: html || `<p>${String(text || "").replace(/\n/g, "<br>")}</p>`,
    textContent: text,
  };
  if (replyTo) body.replyTo = { email: replyTo };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo API ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

async function sendMail({ to, subject, text, html, replyTo }) {
  if (VIA_API) return sendViaBrevoApi({ to, subject, text, html, replyTo });
  const message = { from: config.mail.from, to, subject, text, html, replyTo };
  if (!transporter) {
    outbox.push(message);
    if (outbox.length > 100) outbox.shift();
    if (!config.isTest)
      console.log(`\n📧 [dev mail → ${to}] ${subject}\n${text}\n`);
    return { dev: true };
  }
  return transporter.sendMail(message);
}

async function verifyMailer() {
  if (VIA_API) {
    console.log(
      process.env.BREVO_API_KEY
        ? "✔ Email: sending through the Brevo HTTPS API (MAIL_VIA_API=true)."
        : "⚠ MAIL_VIA_API=true but BREVO_API_KEY is empty. Sign-ups will fail.",
    );
    return;
  }
  if (!transporter) {
    console.log(
      "✉  Email: SMTP_HOST is empty -> codes are printed in the terminal.",
    );
    return;
  }
  try {
    await transporter.verify();
    console.log(`✔ Email ready via ${config.mail.host}`);
  } catch (err) {
    console.warn(`⚠ Email NOT working (${err.message}).`);
  }
}

module.exports = { sendMail, outbox, verifyMailer };
