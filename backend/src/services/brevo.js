const config = require('../config');

/**
 * Optional Brevo CRM sync (separate from sending email through SMTP).
 * Needs BREVO_API_KEY (Brevo -> SMTP & API -> API Keys). Does nothing when it is not set.
 * Never throws: a Brevo problem must not break sign-up.
 */
const enabled = () => !!config.brevo.apiKey;

async function brevo(method, path, body) {
  const res = await fetch(`https://api.brevo.com/v3${path}`, {
    method,
    headers: { 'api-key': config.brevo.apiKey, accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json };
}

/** Create or update a contact and put it on the given lists. */
async function upsertContact({ email, name, listIds = [] }) {
  if (!enabled()) return { skipped: true };
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  const ids = listIds.filter(Boolean);
  try {
    const r = await brevo('POST', '/contacts', {
      email,
      attributes: { FIRSTNAME: first || '', LASTNAME: rest.join(' ') },
      ...(ids.length ? { listIds: ids } : {}),
      updateEnabled: true,
    });
    if (!r.ok) console.warn(`⚠ Brevo contact sync failed (${r.status}): ${r.json.message || ''}`);
    return r;
  } catch (err) {
    console.warn(`⚠ Brevo contact sync failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Every verified reader goes on the main list. */
const syncReader = (user) => upsertContact({ email: user.email, name: user.name, listIds: [config.brevo.listId] });
/** Readers who ticked "send me updates" go on the news list. */
const syncNewsOptIn = (email, name) => upsertContact({ email, name, listIds: [config.brevo.newsListId] });

/** For scripts/test-brevo.js */
const accountInfo = () => brevo('GET', '/account');

module.exports = { enabled, upsertContact, syncReader, syncNewsOptIn, accountInfo };
