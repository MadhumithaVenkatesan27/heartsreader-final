process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret';
process.env.JWT_READ_SECRET = 'test-read-secret-test-read-secret-xx';
process.env.MOCK_PAYMENTS = 'true';
process.env.MONGO_URI = 'mongodb://placeholder';
process.env.UPLOADS_DIR = require('path').join(require('os').tmpdir(), 'ch-test-uploads');
process.env.SMTP_HOST = '';
process.env.ENABLE_LICENSOR_PORTAL = 'true'; // the licensor test below; the portal is OFF by default
{ const k = require('web-push').generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = k.publicKey; process.env.VAPID_PRIVATE_KEY = k.privateKey; }

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { PDFDocument } = require('pdf-lib');

const config = require('../src/config');
const createApp = require('../src/app');
const { outbox } = require('../src/utils/mailer');
const { smsOutbox } = require('../src/utils/sms');
const { hmacHex } = require('../src/utils/crypto');
const User = require('../src/models/User');
const Book = require('../src/models/Book');

let mongod;
let api;
let book;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const lastOtp = () => outbox.at(-1).text.match(/(\d{6})/)[1];

/** Frontend contract: every success is { status:'success', data, accessToken? } */
const success = (r) => {
  assert.equal(r.body.status, 'success', JSON.stringify(r.body));
  return r.body.data;
};

async function signup(email, name = 'Test User') {
  await api.post('/api/auth/register').send({ name, email, password: 'Passw0rd!x' }).expect(201);
  const r = await api.post('/api/auth/verify-email-otp').send({ email, code: lastOtp() }).expect(200);
  assert.ok(r.body.accessToken);
  return r.body.accessToken;
}

before(async () => {
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri('crossed_hearts_test');
  }
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).init()));
  api = request(createApp());

  fs.mkdirSync(process.env.UPLOADS_DIR, { recursive: true });
  for (const f of ['t1.pdf', 't2.pdf']) {
    const d = await PDFDocument.create();
    d.addPage().drawText(`fixture ${f}`);
    fs.writeFileSync(path.join(process.env.UPLOADS_DIR, f), await d.save());
  }
  book = await Book.create({
    title: 'Test Book', slug: 'test-book-vol-1', aliases: ['testbook-v1'],
    pricing: { chapterUSD: 1, chapterINR: 80, fullUSD: 5, fullINR: 400 },
    chapters: [
      { order: 1, title: 'Free one', free: true, pdfFile: 't1.pdf' },
      { order: 2, title: 'Paid two', pdfFile: 't2.pdf' },
      { order: 3, title: 'Paid three', pdfFile: 't2.pdf' },
    ],
  });
  await User.create({ name: 'Admin', email: 'admin@test.dev', role: 'admin', isEmailVerified: true, passwordHash: await bcrypt.hash('Admin-Pass-123', 4) });
  await User.create({ name: 'Lic', email: 'lic@test.dev', role: 'licensor', licensorId: 'lic-1', isEmailVerified: true, passwordHash: await bcrypt.hash('Lic-Pass-123', 4) });
  await Book.updateOne({ _id: book._id }, { licensors: [(await User.findOne({ licensorId: 'lic-1' }))._id] });
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('health', async () => {
  const r = await api.get('/api/health').expect(200);
  assert.equal(r.body.ok, true);
});

test('auth: register → verify-email-otp → me → refresh cookie → logout', async () => {
  const agent = request.agent(createApp());
  const reg = await agent.post('/api/auth/register').send({ name: 'A', email: 'a@test.dev', password: 'Passw0rd!x' }).expect(201);
  assert.equal(reg.body.accessToken, undefined); // no token yet → frontend shows the OTP step
  const bad = await agent.post('/api/auth/login').send({ email: 'a@test.dev', password: 'Passw0rd!x' }).expect(403);
  assert.equal(bad.body.code, 'EMAIL_NOT_VERIFIED');
  assert.equal(bad.body.status, 'fail');
  await agent.post('/api/auth/verify-email-otp').send({ email: 'a@test.dev', code: '000000' }).expect(400);
  const v = await agent.post('/api/auth/verify-email-otp').send({ email: 'a@test.dev', code: lastOtp() }).expect(200);
  assert.equal(success(v).user.email, 'a@test.dev');
  const me = await agent.get('/api/auth/me').set(auth(v.body.accessToken)).expect(200);
  assert.equal(success(me).user.name, 'A');
  const rf = await agent.post('/api/auth/refresh').expect(200); // httpOnly cookie rotation
  assert.ok(rf.body.accessToken);
  assert.ok(success(rf).user);
  await agent.post('/api/auth/logout').expect(200);
  await agent.post('/api/auth/refresh').expect(401);
  await api.post('/api/auth/register').send({ name: 'A', email: 'a@test.dev', password: 'Passw0rd!x' }).expect(409);
  await api.get('/api/auth/me').expect(401);
});

test('auth: resend-verification + forgot/reset password (token in query string)', async () => {
  await api.post('/api/auth/resend-verification').send({ email: 'nobody@test.dev' }).expect(200);
  await signup('reset@test.dev');
  await api.post('/api/auth/forgot-password').send({ email: 'reset@test.dev' }).expect(200);
  const token = outbox.at(-1).text.match(/token=([a-f0-9]+)/)[1];
  await api.post(`/api/auth/reset-password?token=${token}`).send({ password: 'NewPassw0rd!' }).expect(200);
  await api.post(`/api/auth/reset-password?token=${token}`).send({ password: 'Another1234' }).expect(400); // single use
  const login = await api.post('/api/auth/login').send({ email: 'reset@test.dev', password: 'NewPassw0rd!' }).expect(200);
  assert.ok(login.body.accessToken);
});

test('books: list (data.books), alias lookup, no file names leaked', async () => {
  const list = success(await api.get('/api/books?limit=100').expect(200));
  const b = list.books.find((x) => x.slug === 'test-book-vol-1');
  assert.ok(b);
  assert.equal(b.analytics.purchases, 0);
  assert.equal(b.chapters.every((c) => c.pdfFile === undefined), true);
  await api.get('/api/books/testbook-v1').expect(200); // alias used by the static frontend
  await api.get('/api/books/nope').expect(404);
  await api.get('/api/books?limit=9999').expect(400);
});

test('reviews: auth required, upsert, populated user name, average updates', async () => {
  const t = await signup('rev@test.dev', 'Rita');
  await api.post('/api/books/testbook-v1/reviews').send({ rating: 5 }).expect(401);
  await api.post('/api/books/testbook-v1/reviews').set(auth(t)).send({ rating: 9 }).expect(400);
  await api.post('/api/books/testbook-v1/reviews').set(auth(t)).send({ rating: 4, comment: 'good' }).expect(201);
  const r = success(await api.post('/api/books/testbook-v1/reviews').set(auth(t)).send({ rating: 2 }).expect(201));
  assert.equal(r.ratingCount, 1);
  assert.equal(r.ratingAverage, 2);
  const list = success(await api.get('/api/books/testbook-v1/reviews').expect(200));
  assert.equal(list.reviews[0].userId.name, 'Rita'); // frontend reads review.userId.name
});

test('payment-config is public', async () => {
  const cfg = success(await api.get('/api/library/payment-config').expect(200));
  assert.equal(cfg.razorpay.enabled, true);
  assert.ok(cfg.stripe.publishableKey);
});

test('reading + Razorpay (INR) purchase of one chapter, frontend flow', async () => {
  const t = await signup('buyer@test.dev');

  // free chapter: anyone can preview
  const pdf = await api.get('/api/library/testbook-v1/preview/ch1').expect(200);
  assert.match(pdf.headers['content-type'], /pdf/);
  await api.get('/api/library/testbook-v1/preview/ch2').expect(403); // paid chapter is not previewable

  // paid chapter locked
  await api.post('/api/library/testbook-v1/read-token/ch2').expect(401);
  await api.post('/api/library/testbook-v1/read-token/ch2').set(auth(t)).expect(403);
  await api.get('/api/library/testbook-v1/read/ch2').set(auth(t)).expect(403);

  // buy: server decides the price, client only names the chapter
  const order = success(await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'INR', chapterId: 'ch2', amount: 1 }).expect(201));
  assert.equal(order.amount, 8000); // paise
  assert.equal(order.currency, 'INR');
  assert.ok(order.razorpayOrderId && order.keyId);
  await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'USD' }).expect(400); // wrong provider route

  const confirm = { razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_test_1', razorpay_signature: 'x' };
  const c1 = success(await api.post('/api/library/testbook-v1/confirm-razorpay').set(auth(t)).send(confirm).expect(200));
  assert.equal(c1.purchase.status, 'paid');
  success(await api.post('/api/library/testbook-v1/confirm-razorpay').set(auth(t)).send(confirm).expect(200)); // idempotent

  // now readable, with the read-token handshake the reader page does
  const { readToken } = success(await api.post('/api/library/testbook-v1/read-token/ch2').set(auth(t)).expect(200));
  await api.get('/api/library/testbook-v1/read/ch2').set(auth(t)).expect(401); // missing token
  const file = await api.get(`/api/library/testbook-v1/read/ch2?readToken=${readToken}`).set(auth(t)).expect(200);
  assert.match(file.headers['content-type'], /pdf/);
  await api.get(`/api/library/testbook-v1/read/ch3?readToken=${readToken}`).set(auth(t)).expect(403); // ch3 not bought
  const other = await signup('thief@test.dev');
  await api.get(`/api/library/testbook-v1/read/ch2?readToken=${readToken}`).set(auth(other)).expect(403); // token is not transferable

  // buying again is refused
  await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'INR', chapterId: 'ch2' }).expect(409);
  await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'INR', chapterId: 'ch1' }).expect(400); // free

  // library shape script.js expects: populated bookId with chapters, so "ch2" can be derived
  const lib = success(await api.get('/api/library').set(auth(t)).expect(200));
  assert.equal(lib.purchases.length, 1);
  const p = lib.purchases[0];
  assert.equal(p.bookId.slug, 'test-book-vol-1');
  assert.equal(p.bookId.chapters.find((c) => String(c._id) === String(p.chapterIds[0])).order, 2);
  assert.match(p.invoiceNumber, /^INV-\d{4}-\d{6}$/);
  await api.get(`/api/library/purchases/${p._id}/invoice.pdf`).set(auth(t)).expect(200);
  await api.get(`/api/library/purchases/${p._id}/invoice.pdf`).set(auth(other)).expect(404);

  const notes = success(await api.get('/api/notifications').set(auth(t)).expect(200));
  assert.equal(notes.unread, 1);
  const stat = success(await api.get('/api/books/testbook-v1').expect(200));
  assert.equal(stat.book.analytics.purchases, 1);
});

test('Razorpay signature is really checked when not in mock mode', async () => {
  const t = await signup('sig@test.dev');
  const order = success(await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'INR' }).expect(201));
  const was = { mock: config.payments.mock, secret: config.payments.razorpay.keySecret };
  config.payments.mock = false;
  config.payments.razorpay.keySecret = 'test-secret';
  try {
    const body = { razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_x' };
    const bad = await api.post('/api/library/testbook-v1/confirm-razorpay').set(auth(t)).send({ ...body, razorpay_signature: 'deadbeef' }).expect(400);
    assert.equal(bad.body.code, 'BAD_SIGNATURE');
    const good = hmacHex('test-secret', `${order.razorpayOrderId}|pay_x`);
    const r = success(await api.post('/api/library/testbook-v1/confirm-razorpay').set(auth(t)).send({ ...body, razorpay_signature: good }).expect(200));
    assert.equal(r.purchase.status, 'paid');
  } finally {
    config.payments.mock = was.mock;
    config.payments.razorpay.keySecret = was.secret;
  }
});

test('Stripe (USD) full-title purchase: payment-intent → confirm-payment', async () => {
  const t = await signup('us@test.dev');
  const intent = success(await api.post('/api/library/testbook-v1/payment-intent').set(auth(t)).send({ currency: 'USD' }).expect(201));
  assert.ok(intent.clientSecret && intent.paymentIntentId);
  await api.post('/api/library/testbook-v1/confirm-payment').set(auth(t)).send({ paymentIntentId: 'pi_unknown' }).expect(404);
  const done = success(await api.post('/api/library/testbook-v1/confirm-payment').set(auth(t)).send({ paymentIntentId: intent.paymentIntentId }).expect(200));
  assert.equal(done.purchase.amount, 5);
  assert.equal(done.purchase.currency, 'USD');
  assert.equal(done.purchase.purchaseType, 'book');
  // the whole volume is now readable, including chapters never bought one by one
  const { readToken } = success(await api.post('/api/library/testbook-v1/read-token/ch3').set(auth(t)).expect(200));
  await api.get(`/api/library/testbook-v1/read/ch3?readToken=${readToken}`).set(auth(t)).expect(200);
});

test('webhooks reject unsigned requests', async () => {
  await api.post('/api/webhooks/stripe').set('Content-Type', 'application/json').send('{}').expect(503); // no secret configured
});

test('support/contact form + validation', async () => {
  await api.post('/api/support/contact').send({ name: 'X', email: 'bad', message: 'hello there' }).expect(400);
  const r = await api.post('/api/support/contact').send({ name: 'X', email: 'x@test.dev', category: 'Billing', message: 'hello there' }).expect(201);
  assert.equal(r.body.status, 'success');
});

test('physical-orders: empty list for new user', async () => {
  const t = await signup('print@test.dev');
  assert.deepEqual(success(await api.get('/api/physical-orders').set(auth(t)).expect(200)).orders, []);
  await api.get('/api/physical-orders').expect(401);
});

test('licensor portal: login-id → me → my-books with sales; readers are locked out', async () => {
  await api.post('/api/licensors/login-id').send({ licensorId: 'lic-1', password: 'wrong-pass' }).expect(401);
  const login = await api.post('/api/licensors/login-id').send({ licensorId: 'lic-1', password: 'Lic-Pass-123' }).expect(200);
  const t = login.body.accessToken;
  assert.ok(t);
  assert.equal(success(login).user.role, 'licensor');
  success(await api.get('/api/licensors/me').set(auth(t)).expect(200));
  const mine = success(await api.get('/api/licensors/my-books').set(auth(t)).expect(200));
  const b = mine.books.find((x) => x.slug === 'test-book-vol-1');
  assert.ok(b);
  assert.ok(b.sales >= 2);
  assert.ok(b.revenue > 0);
  const reader = await signup('nolicensor@test.dev');
  await api.get('/api/licensors/my-books').set(auth(reader)).expect(403);
});

test('socket.io: purchase pushes "notification:new" to the logged-in user', async () => {
  const http = require('http');
  const { io: connect } = require('socket.io-client');
  const { attachRealtime } = require('../src/services/realtime');
  const server = http.createServer(createApp());
  attachRealtime(server);
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const t = await signup('live@test.dev');
  const sock = connect(url, { auth: { token: t }, transports: ['websocket'] });
  try {
    await new Promise((resolve, reject) => { sock.on('connect', resolve); sock.on('connect_error', reject); });
    const got = new Promise((resolve) => sock.on('notification:new', resolve));
    const intent = success(await request(server).post('/api/library/testbook-v1/payment-intent').set(auth(t)).send({ currency: 'USD', chapterId: 'ch2' }).expect(201));
    await request(server).post('/api/library/testbook-v1/confirm-payment').set(auth(t)).send({ paymentIntentId: intent.paymentIntentId }).expect(200);
    const payload = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('no socket event')), 3000))]);
    assert.equal(payload.notification.title, 'Payment successful');
    const bad = connect(url, { auth: { token: 'junk' }, transports: ['websocket'], reconnection: false });
    await new Promise((resolve) => bad.on('connect_error', (e) => { assert.match(e.message, /Unauthorized/); resolve(); }));
    bad.close();
  } finally {
    sock.close();
    await new Promise((r) => server.close(r));
  }
});

test('admin: role protected, create book, upload chapter, reject non-PDF, refund revokes access', async () => {
  const user = await signup('norole@test.dev');
  await api.get('/api/admin/stats').set(auth(user)).expect(403);
  const login = await api.post('/api/auth/login').send({ email: 'admin@test.dev', password: 'Admin-Pass-123' }).expect(200);
  const adm = login.body.accessToken;
  await api.get('/api/admin/stats').set(auth(adm)).expect(200);

  const created = await api.post('/api/admin/books').set(auth(adm)).send({ title: 'Brand New Title', category: 'Novel' }).expect(201);
  assert.equal(created.body.book.slug, 'brand-new-title');
  const id = created.body.book._id;

  await api.post(`/api/admin/books/${id}/chapters`).set(auth(adm))
    .field('title', 'Ch 1').field('order', '1').attach('pdf', Buffer.from('not a pdf'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(400);
  const ok = await api.post(`/api/admin/books/${id}/chapters`).set(auth(adm))
    .field('title', 'Ch 1').field('order', '1').field('free', 'true').attach('pdf', Buffer.from('%PDF-1.4 hi'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(201);
  assert.equal(ok.body.chapter.free, true);
  await api.get('/api/library/brand-new-title/preview/ch1').expect(200); // uploaded file is served
  await api.post(`/api/admin/books/${id}/chapters`).set(auth(adm))
    .field('title', 'dup').field('order', '1').attach('pdf', Buffer.from('%PDF-1.4 hi'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(409);

  const t = await signup('refund@test.dev');
  const order = success(await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'INR' }).expect(201));
  const paid = success(await api.post('/api/library/testbook-v1/confirm-razorpay').set(auth(t))
    .send({ razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_r', razorpay_signature: 'x' }).expect(200));
  await api.post(`/api/admin/purchases/${paid.purchase._id}/refund`).set(auth(adm)).expect(200);
  await api.post('/api/library/testbook-v1/read-token/ch2').set(auth(t)).expect(403); // refund revokes access
});


test('watermark: paid chapter is stamped with the reader\'s name and logged; anonymous preview is not', async () => {
  const t = await signup('wm@test.dev', 'Watermark Reader');
  const order = success(await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'INR', chapterId: 'ch2' }).expect(201));
  await api.post('/api/library/testbook-v1/confirm-razorpay').set(auth(t))
    .send({ razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_wm', razorpay_signature: 'x' }).expect(200);
  const { readToken } = success(await api.post('/api/library/testbook-v1/read-token/ch2').set(auth(t)).expect(200));
  const file = await api.get(`/api/library/testbook-v1/read/ch2?readToken=${readToken}`).set(auth(t)).buffer(true).parse((res, cb) => {
    const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
  }).expect(200);
  const pdf = await PDFDocument.load(file.body);
  assert.match(pdf.getAuthor(), /Watermark Reader/);
  const wmId = /wm:([0-9A-F]{10})/.exec(pdf.getKeywords())[1];
  const ReadEvent = require('../src/models/ReadEvent');
  assert.ok(await ReadEvent.findOne({ watermarkId: wmId }), 'read event saved');
  const anon = await api.get('/api/library/testbook-v1/preview/ch1').buffer(true).parse((res, cb) => {
    const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
  }).expect(200);
  assert.equal((await PDFDocument.load(anon.body)).getAuthor(), undefined);
});

test('me: overview, purchase history, library flags', async () => {
  const t = await signup('me@test.dev', 'Me User');
  await api.get('/api/me/overview').expect(401);
  let o = success(await api.get('/api/me/overview').set(auth(t)).expect(200));
  assert.equal(o.stats.titlesOwned, 0);

  const order = success(await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'INR', chapterId: 'ch3' }).expect(201));
  await api.post('/api/library/testbook-v1/confirm-razorpay').set(auth(t))
    .send({ razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_me', razorpay_signature: 'x' }).expect(200);

  // GET /library now carries imprint, format, totalChapters, coverUrl
  const lib = success(await api.get('/api/library').set(auth(t)).expect(200));
  const b = lib.purchases[0].bookId;
  assert.equal(b.imprint, 'Crossed Hearts');
  assert.equal(b.format, 'digital');
  assert.equal(b.totalChapters, 3);
  assert.equal(b.coverUrl, '');

  o = success(await api.get('/api/me/overview').set(auth(t)).expect(200));
  assert.equal(o.stats.titlesOwned, 1);
  assert.deepEqual(o.library[0].chapters.map((c) => c.unlocked), [true, false, true]); // free ch1 + bought ch3, not ch2
  const titles = success(await api.get('/api/library/titles').set(auth(t)).expect(200)).titles;
  assert.equal(titles.length, 1);
  assert.equal(titles[0].title, titles[0].book.title);
  assert.deepEqual(titles[0].chapters.map((c) => c.unlocked), [true, false, true]);
  await api.get('/api/library/titles').expect(401);
  const hist = success(await api.get('/api/me/purchases').set(auth(t)).expect(200));
  assert.match(hist.purchases[0].invoiceUrl, /invoice\.pdf$/);
});

test('reading state: progress upsert, completed sticks, bookmarks, merge shape for the frontend', async () => {
  const t = await signup('rs@test.dev');
  await api.put('/api/library/progress').send({ titleId: 'testbook-v1', chapter: 'ch1', page: 1 }).expect(401);
  await api.put('/api/library/progress').set(auth(t)).send({ titleId: 'testbook-v1', chapter: 'chapter-one', page: 1 }).expect(400);

  let p = success(await api.put('/api/library/progress').set(auth(t)).send({ titleId: 'testbook-v1', chapter: 'ch1', page: 5, totalPages: 20 }).expect(200)).progress;
  assert.equal(p.percent, 25);
  p = success(await api.put('/api/library/progress').set(auth(t)).send({ titleId: 'testbook-v1', chapter: 'ch1', page: 20, totalPages: 20, completed: true }).expect(200)).progress;
  assert.equal(p.completed, true);
  p = success(await api.put('/api/library/progress').set(auth(t)).send({ titleId: 'TestBook-V1', chapter: 'ch1', page: 2, totalPages: 20 }).expect(200)).progress; // "read again"
  assert.equal(p.completed, true, 'finishing is permanent');
  await api.put('/api/library/progress').set(auth(t)).send({ titleId: 'other-title', chapter: 'ch2', page: 3, totalPages: 10 }).expect(200);

  const bm = success(await api.post('/api/library/bookmarks').set(auth(t)).send({ titleId: 'testbook-v1', chapter: 'ch1', page: 7, note: 'good scene' }).expect(201)).bookmark;
  await api.post('/api/library/bookmarks').set(auth(t)).send({ titleId: 'testbook-v1', chapter: 'ch1', page: 7 }).expect(201); // same page again: no duplicate

  const st = success(await api.get('/api/library/reading-state').set(auth(t)).expect(200));
  assert.equal(st.progress.length, 2);
  assert.equal(st.progress[0].titleId, 'other-title'); // newest first
  assert.equal(st.bookmarks.length, 1);
  assert.equal(st.bookmarks[0].page, 7);

  const other = await signup('rs2@test.dev');
  await api.delete(`/api/library/bookmarks/${bm._id}`).set(auth(other)).expect(404); // not yours
  await api.delete(`/api/library/bookmarks/${bm._id}`).set(auth(t)).expect(200);
  assert.equal(success(await api.get('/api/library/reading-state').set(auth(t))).bookmarks.length, 0);
});

test('account: profile, name rules, email change with code, phone change with SMS code, password keeps this device signed in', async () => {
  const t = await signup('acct@test.dev', 'Acct User');
  await api.get('/api/account/profile').expect(401);
  let prof = success(await api.get('/api/account/profile').set(auth(t)).expect(200)).profile;
  assert.deepEqual([prof.name, prof.email, prof.emailVerified, prof.phone, prof.phoneVerified], ['Acct User', 'acct@test.dev', true, '', false]);
  assert.ok(prof.createdAt);
  await api.patch('/api/account/profile').send({ name: 'Xyz' }).expect(401);
  await api.patch('/api/account/profile').set(auth(t)).send({ name: 'Xy' }).expect(400); // 3-30 characters
  await api.patch('/api/account/profile').set(auth(t)).send({ name: 'x'.repeat(31) }).expect(400);
  assert.equal(success(await api.patch('/api/account/profile').set(auth(t)).send({ name: 'New Name' }).expect(200)).profile.name, 'New Name');

  // phone: needs the country code, then an SMS code
  await api.post('/api/account/phone/change').set(auth(t)).send({ phone: '98765 43210' }).expect(400);
  await api.post('/api/account/phone/change').set(auth(t)).send({ phone: 'abc' }).expect(400);
  await api.post('/api/account/phone/change').set(auth(t)).send({ phone: '+91 98765 43210' }).expect(200);
  assert.equal(smsOutbox.at(-1).to, '+919876543210');
  const pcode = smsOutbox.at(-1).body.match(/(\d{6})/)[1];
  assert.equal(success(await api.get('/api/account/profile').set(auth(t))).profile.phoneVerified, false);
  await api.post('/api/account/phone/confirm').set(auth(t)).send({ code: pcode === '000000' ? '111111' : '000000' }).expect(400);
  prof = success(await api.post('/api/account/phone/confirm').set(auth(t)).send({ code: pcode }).expect(200)).profile;
  assert.deepEqual([prof.phone, prof.phoneVerified], ['+919876543210', true]);
  assert.equal(success(await api.get('/api/auth/me').set(auth(t))).user.phone, '+919876543210');

  await api.post('/api/account/email/change').set(auth(t)).send({ newEmail: 'acct2@test.dev', password: 'wrong-password' }).expect(400);
  await api.post('/api/account/email/change').set(auth(t)).send({ newEmail: 'admin@test.dev', password: 'Passw0rd!x' }).expect(409); // taken
  await api.post('/api/account/email/change').set(auth(t)).send({ newEmail: 'acct2@test.dev', password: 'Passw0rd!x' }).expect(200);
  assert.equal(outbox.at(-1).to, 'acct2@test.dev');
  const code = lastOtp();
  await api.post('/api/account/email/confirm').set(auth(t)).send({ code: code === '000000' ? '111111' : '000000' }).expect(400);
  const v = success(await api.post('/api/account/email/confirm').set(auth(t)).send({ code }).expect(200));
  assert.equal(v.profile.email, 'acct2@test.dev');
  await api.post('/api/auth/login').send({ email: 'acct2@test.dev', password: 'Passw0rd!x' }).expect(200);

  await api.post('/api/account/password').set(auth(t)).send({ currentPassword: 'nope-nope-1', newPassword: 'NewPassw0rd!' }).expect(400);
  const changed = await api.post('/api/account/password').set(auth(t)).send({ currentPassword: 'Passw0rd!x', newPassword: 'NewPassw0rd!' }).expect(200);
  assert.ok(changed.body.accessToken, 'this device gets a fresh session');
  await api.post('/api/auth/login').send({ email: 'acct2@test.dev', password: 'Passw0rd!x' }).expect(401);
  await api.post('/api/auth/login').send({ email: 'acct2@test.dev', password: 'NewPassw0rd!' }).expect(200);
});

test('reading progress + bookmarks (/api/reading, /api/bookmarks), per user', async () => {
  const t = await signup('rd@test.dev');
  await api.get('/api/reading/progress').expect(401);
  await api.get('/api/bookmarks').expect(401);

  const put = (b) => api.put('/api/reading/progress').set(auth(t)).send(b);
  let p = success(await put({ titleId: 'Matchmaker-V1', chapterId: 'ch1', page: 4, totalPages: 20, percent: 20, completed: false }).expect(200)).progress;
  assert.deepEqual([p.titleId, p.chapterId, p.page, p.percent, p.completed], ['matchmaker-v1', 'ch1', 4, 20, false]);
  await put({ titleId: 'matchmaker-v1', chapterId: 'ch1', page: 10, totalPages: 20, percent: 50 }).expect(200); // upsert, not a second row
  p = success(await put({ titleId: 'matchmaker-v1', chapterId: 'ch1', page: 20, totalPages: 20, percent: 97 }).expect(200)).progress;
  assert.equal(p.completed, true); // 97% counts as finished
  assert.equal(p.percent, 100);
  p = success(await put({ titleId: 'matchmaker-v1', chapterId: 'ch1', page: 2, totalPages: 20, percent: 10 }).expect(200)).progress;
  assert.equal(p.completed, true, 'reading again does not undo finished');
  await put({ titleId: 'timecloset', chapterId: 'ch2', page: 3, totalPages: 12 }).expect(200); // percent worked out
  await put({ titleId: 'x', chapterId: '', page: 1 }).expect(400);

  let all = success(await api.get('/api/reading/progress').set(auth(t)).expect(200)).progress;
  assert.equal(all.length, 2);
  assert.equal(all[0].titleId, 'timecloset', 'newest first (recently opened)');
  assert.equal(all[0].percent, 25);
  assert.equal(success(await api.get('/api/reading/progress?titleId=matchmaker-v1').set(auth(t))).progress.length, 1);

  const b1 = success(await api.post('/api/bookmarks').set(auth(t)).send({ titleId: 'matchmaker-v1', chapterId: 'ch1', page: 5, totalPages: 20, note: 'nice' }).expect(201)).bookmark;
  assert.deepEqual([b1.titleId, b1.chapterId, b1.page, b1.note, b1.totalPages], ['matchmaker-v1', 'ch1', 5, 'nice', 20]);
  assert.ok(b1.id && b1._id);
  await api.post('/api/bookmarks').set(auth(t)).send({ titleId: 'matchmaker-v1', chapterId: 'ch1', page: 5, note: 'again' }).expect(201); // same page = update
  const b2 = success(await api.post('/api/bookmarks').set(auth(t)).send({ titleId: 'timecloset', chapterId: 'ch2', page: 1 }).expect(201)).bookmark;
  assert.equal(success(await api.get('/api/bookmarks').set(auth(t))).bookmarks.length, 2);
  const only = success(await api.get('/api/bookmarks?titleId=timecloset').set(auth(t))).bookmarks;
  assert.equal(only.length, 1);
  const up = success(await api.patch(`/api/bookmarks/${b1.id}`).set(auth(t)).send({ note: 'changed' }).expect(200)).bookmark;
  assert.equal(up.note, 'changed');
  await api.patch(`/api/bookmarks/${b1.id}`).set(auth(t)).send({ page: 1 }).expect(200);
  await api.patch(`/api/bookmarks/${b2.id}`).set(auth(t)).send({ page: 1 }).expect(200);

  // another reader sees none of it and cannot touch it
  const o = await signup('rd2@test.dev');
  assert.equal(success(await api.get('/api/bookmarks').set(auth(o))).bookmarks.length, 0);
  assert.equal(success(await api.get('/api/reading/progress').set(auth(o))).progress.length, 0);
  await api.delete(`/api/bookmarks/${b1.id}`).set(auth(o)).expect(404);
  await api.patch(`/api/bookmarks/${b1.id}`).set(auth(o)).send({ note: 'hack' }).expect(404);
  await api.delete('/api/bookmarks/not-an-id').set(auth(t)).expect(404);
  await api.delete(`/api/bookmarks/${b1.id}`).set(auth(t)).expect(200);
  assert.equal(success(await api.get('/api/bookmarks').set(auth(t))).bookmarks.length, 1);
});

test('wishlist: add, merge a guest list, remove, per user', async () => {
  const t = await signup('wl@test.dev');
  await api.get('/api/wishlist').expect(401);
  success(await api.post('/api/wishlist/Matchmaker-V1').set(auth(t)).expect(201));
  const merged = success(await api.put('/api/wishlist').set(auth(t)).send({ titleIds: ['matchmaker-v1', 'timecloset', 'timecloset'] }).expect(200)).wishlist;
  assert.deepEqual(merged.map((w) => w.titleId).sort(), ['matchmaker-v1', 'timecloset']);
  const other = await signup('wl2@test.dev');
  assert.equal(success(await api.get('/api/wishlist').set(auth(other))).wishlist.length, 0);
  const after = success(await api.delete('/api/wishlist/matchmaker-v1').set(auth(t)).expect(200)).wishlist;
  assert.deepEqual(after.map((w) => w.titleId), ['timecloset']);
});

test('notify me: vapid key, guest/user subscribe, unsubscribe, release + new-chapter notifications', async () => {
  const k = await api.get('/api/notifications/vapid-key').expect(200);
  assert.equal(k.body.key, process.env.VAPID_PUBLIC_KEY);

  // guest with only an email (browser push not allowed)
  const g = success(await api.post('/api/notifications/subscribe').send({ titleId: 'Brand-Soon', titleName: 'Brand Soon', volume: 2, general: true, email: 'guest@test.dev' }).expect(200));
  assert.equal(g.saved, true);
  assert.equal(g.push, false);
  // nothing to identify the guest by -> not saved
  assert.equal(success(await api.post('/api/notifications/subscribe').send({ titleId: 'x', volume: 1 }).expect(200)).saved, false);
  // a browser subscription (fake endpoint: we only check it is stored, nothing is sent to it)
  const t = await signup('notify@test.dev');
  const sub = { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p', auth: 'a' } };
  assert.equal(success(await api.post('/api/notifications/subscribe').set(auth(t)).send({ titleId: 'brand-soon', titleName: 'Brand Soon', volume: 2, subscription: sub }).expect(200)).push, true);
  await api.post('/api/notifications/subscribe').send({ titleId: 'brand-soon', volume: 2, subscription: { endpoint: 'not-a-url' } }).expect(400);
  const NotifySub = require('../src/models/NotifySub');
  assert.equal(await NotifySub.countDocuments({ 'titles.titleId': 'brand-soon' }), 2);
  await api.get('/api/notifications/mine').expect(401);
  const mine = success(await api.get('/api/notifications/mine').set(auth(t)).expect(200));
  assert.deepEqual(mine.titles.map((x) => `${x.titleId}:${x.volume}`), ['brand-soon:2']);
  await api.post('/api/notifications/unsubscribe').set(auth(t)).send({ titleId: 'brand-soon', volume: 2, endpoint: sub.endpoint }).expect(200);
  assert.equal(await NotifySub.countDocuments({ 'titles.titleId': 'brand-soon' }), 1);

  // admin: new chapter => the email-only follower is notified and STAYS subscribed
  const adm = (await api.post('/api/auth/login').send({ email: 'admin@test.dev', password: 'Admin-Pass-123' })).body.accessToken;
  const b = (await api.post('/api/admin/books').set(auth(adm)).send({ title: 'Brand Soon', slug: 'brand-soon' }).expect(201)).body.book;
  const pdf = Buffer.from('%PDF-1.4 hi');
  await api.post(`/api/admin/books/${b._id}/chapters`).set(auth(adm)).field('title', 'Opening').field('order', '1').field('free', 'true')
    .attach('pdf', pdf, { filename: 'x.pdf', contentType: 'application/pdf' }).expect(201);
  await new Promise((r) => setTimeout(r, 300)); // notification is sent in the background
  const mail = outbox.filter((m) => m.to === 'guest@test.dev').at(-1);
  assert.match(mail.subject, /New chapter: Brand Soon/);
  assert.equal(await NotifySub.countDocuments({ email: 'guest@test.dev', 'titles.titleId': 'brand-soon' }), 1, 'still following');

  // admin: volume released => notified, then removed from that volume's list
  const r = await api.post('/api/admin/notify/release').set(auth(adm)).send({ titleId: 'brand-soon', volume: 2, titleName: 'Brand Soon' }).expect(200);
  assert.equal(r.body.emailed, 1);
  assert.match(outbox.filter((m) => m.to === 'guest@test.dev').at(-1).subject, /Volume 2 is out now/);
  assert.equal(await NotifySub.countDocuments({ 'titles.titleId': 'brand-soon' }), 0);
  await api.post('/api/admin/notify/release').set(auth(await signup('plain@test.dev'))).send({ titleId: 'brand-soon', volume: 2 }).expect(403);
});

test('newsletter sign-up is public, validated, and idempotent', async () => {
  await api.post('/api/newsletter/subscribe').send({ email: 'not-an-email' }).expect(400);
  await api.post('/api/newsletter/subscribe').send({ email: 'Fan@Test.dev' }).expect(200);
  await api.post('/api/newsletter/subscribe').send({ email: 'fan@test.dev' }).expect(200);
  const NotifySub = require('../src/models/NotifySub');
  assert.equal(await NotifySub.countDocuments({ email: 'fan@test.dev', general: true }), 1);
});

test('purchase sends a confirmation email', async () => {
  const t = await signup('buyer-mail@test.dev', 'Buyer');
  const order = success(await api.post('/api/library/testbook-v1/razorpay-order').set(auth(t)).send({ currency: 'INR', chapterId: 'ch2' }).expect(201));
  await api.post('/api/library/testbook-v1/confirm-razorpay').set(auth(t))
    .send({ razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_mail', razorpay_signature: 'x' }).expect(200);
  await new Promise((r) => setTimeout(r, 200));
  assert.match(outbox.filter((m) => m.to === 'buyer-mail@test.dev').at(-1).subject, /Your Crossed Hearts purchase \(INV-/);
});
