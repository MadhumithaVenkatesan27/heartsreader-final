/** Branded HTML + plain-text emails (table layout and inline styles, so Gmail/Outlook/phones render them). */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

/**
 * renderEmail({ preheader, heading, name, paragraphs:[], code?, buttonText?, buttonUrl?, footnote? }) -> { html, text }
 * - buttonText/buttonUrl: a big clickable button, e.g. "Reset your password"
 * - code: a 6-digit code shown large
 */
function renderEmail({ preheader = '', heading, name, paragraphs = [], code, buttonText, buttonUrl, footnote }) {
  const p = (t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a2f2a;">${esc(t)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5efe9;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="background:#1a1118;padding:20px 28px;color:#f5ede8;font-size:20px;font-weight:bold;letter-spacing:.5px;">&#9829; Crossed Hearts</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:22px;color:#1a1118;">${esc(heading)}</h1>
${name ? p(`Hi ${name},`) : ''}
${paragraphs.map(p).join('')}
${code ? `<div style="margin:8px 0 22px;padding:16px;text-align:center;background:#faf3ee;border:1px dashed #e05c7a;border-radius:10px;font-size:34px;letter-spacing:8px;font-weight:bold;color:#1a1118;">${esc(code)}</div>` : ''}
${buttonUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 22px;"><tr><td style="background:#e05c7a;border-radius:8px;"><a href="${esc(buttonUrl)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(buttonText)}</a></td></tr></table>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#7a6c64;">If the button does not work, copy this link into your browser:<br><a href="${esc(buttonUrl)}" style="color:#b84060;word-break:break-all;">${esc(buttonUrl)}</a></p>` : ''}
${footnote ? `<p style="margin:0;font-size:12px;line-height:1.5;color:#7a6c64;">${esc(footnote)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;background:#faf3ee;font-size:11px;color:#7a6c64;">Crossed Hearts &middot; You received this email because of activity on your account.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    heading, '', name ? `Hi ${name},` : '', ...paragraphs, '',
    code ? `Your code: ${code}` : '',
    buttonUrl ? `${buttonText}: ${buttonUrl}` : '',
    footnote ? `\n${footnote}` : '',
    '\nCrossed Hearts',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  return { html, text };
}

const otpEmail = (name, code) => renderEmail({
  preheader: `Your verification code is ${code}`,
  heading: 'Verify your email',
  name,
  paragraphs: ['Use this code to finish creating your account. It expires in 10 minutes.'],
  code,
  footnote: 'If you did not create an account, you can ignore this email.',
});

const resetEmail = (name, url) => renderEmail({
  preheader: 'Reset your Crossed Hearts password',
  heading: 'Reset your password',
  name,
  paragraphs: ['We received a request to reset the password for your account. Click the button below to choose a new one. The link works for 1 hour.'],
  buttonText: 'Reset your password',
  buttonUrl: url,
  footnote: 'If you did not ask for this, you can safely ignore this email. Your password will not change.',
});

const emailChangeEmail = (name, code) => renderEmail({
  preheader: `Your confirmation code is ${code}`,
  heading: 'Confirm your new email',
  name,
  paragraphs: ['Use this code to confirm this address for your Crossed Hearts account. It expires in 10 minutes.'],
  code,
  footnote: 'If you did not ask for this, ignore this email.',
});

module.exports = { renderEmail, otpEmail, resetEmail, emailChangeEmail };
