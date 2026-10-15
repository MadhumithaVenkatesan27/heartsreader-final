/**
 * npm run test:brevo -- you@example.com
 * 1) checks the SMTP login (what sends OTP / reset emails)
 * 2) sends you a real test email
 * 3) checks the Brevo API key and adds you to your Brevo contact list (CRM)
 */
const config = require('../src/config');
const { sendMail, verifyMailer } = require('../src/utils/mailer');
const brevo = require('../src/services/brevo');

(async () => {
  const to = process.argv[2];
  if (!to) return console.log('Usage: npm run test:brevo -- you@example.com');

  console.log('\n1) Email (SMTP)');
  if (!config.mail.host) console.log('   SMTP_HOST is empty in .env, so mail is only printed here (dev mode).');
  await verifyMailer();
  try {
    await sendMail({ to, subject: 'Crossed Hearts - Brevo test', text: 'If you can read this, Brevo SMTP works. Check Spam if it is not in your inbox.' });
    console.log(`   Test email sent to ${to}${config.mail.host ? '' : ' (dev mode: shown above, not really sent)'}.`);
  } catch (e) {
    console.log(`   FAILED: ${e.message}`);
  }

  console.log('\n2) Brevo API / CRM');
  if (!brevo.enabled()) return console.log('   BREVO_API_KEY is empty in .env: contact sync is switched off (that is fine).');
  const acc = await brevo.accountInfo().catch((e) => ({ ok: false, json: { message: e.message } }));
  if (!acc.ok) return console.log(`   API key rejected (${acc.status || ''} ${acc.json.message || ''}). Generate a new key under SMTP & API -> API Keys.`);
  console.log(`   API key OK (account: ${acc.json.email}).`);
  if (!config.brevo.listId) console.log('   BREVO_LIST_ID is empty: the contact will be created but not placed on a list.');
  const r = await brevo.syncReader({ email: to, name: 'Test Reader' });
  console.log(r.ok ? `   Contact ${to} created/updated${config.brevo.listId ? ` on list #${config.brevo.listId}` : ''}. Look in Brevo -> Contacts.` : `   Contact sync failed (${r.status}): ${JSON.stringify(r.json)}`);
})();
