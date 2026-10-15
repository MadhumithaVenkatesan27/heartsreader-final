# Crossed Hearts / Heartsreader — Backend (Node.js + Express + MongoDB)

Built to match the static frontend (`script.js`, `reader.html`, `account.html`, `licenser*.js` …).
Every JSON response uses the envelope the frontend expects:
`{ "status": "success", "message"?, "accessToken"?, "data": { … } }` — errors are `{ "status": "fail" | "error", "message", "code" }`.

## Endpoints used by `ch-data.js` (My Library, My Account, reader)
All need `Authorization: Bearer <token>`; success is `{status:"success", data:{...}}`.

| Endpoint | What it does |
|---|---|
| `PUT /api/reading/progress` `{titleId, chapterId, page, totalPages, percent, completed}` | upsert per user + chapter; 97%+ = finished (stays finished) |
| `GET /api/reading/progress[?titleId=]` | `data.progress[]` (newest first = "recently opened") |
| `GET /api/bookmarks[?titleId=]`, `POST /api/bookmarks`, `PATCH /api/bookmarks/:id`, `DELETE /api/bookmarks/:id` | `data.bookmarks[]` / `data.bookmark` |
| `GET /api/library/titles` | `data.titles[]`: owned titles + which chapters are unlocked (`chapters[].unlocked`, `unlockedChapterIds`) |
| `GET /api/library` | `data.purchases[]` |
| `GET /api/physical-orders` | `data.orders` (always empty: digital only) |
| `GET /api/library/purchases/:id/invoice.pdf` | the PDF file |
| `GET /api/account/profile` | `data.profile {name,email,emailVerified,phone,phoneVerified,createdAt}` |
| `PATCH /api/account/profile` `{name}` | name 3-30 characters |
| `POST /api/account/email/change` `{newEmail,password}` then `POST /api/account/email/confirm` `{code}` | code is emailed to the new address |
| `POST /api/account/phone/change` `{phone}` then `POST /api/account/phone/confirm` `{code}` | phone needs the country code (+91...). Code is texted via Twilio (`TWILIO_*` in `.env`); without Twilio it is **printed in the server terminal** |
| `POST /api/account/password` `{currentPassword,newPassword}` | returns a new `accessToken` for this device |

Wishlist routes (`/api/wishlist`) are still there but unused now; delete `src/routes/wishlist.js` and its line in `src/app.js` if you want them gone.
`frontend-patches/ch-user.js` is an older helper; your own `ch-data.js` replaces it.

---

## START HERE: from scratch on Windows (PowerShell, VS Code)

Do these once, in order. Every command is run in the backend folder.

```powershell
# 0. Open the folder
cd D:\SourceCode\winterberry\crossedhearts\crossed-hearts-final\crossed-hearts-backend

# 1. Install packages
npm install

# 2. Create your settings file (only the first time)
copy .env.example .env
#    then open .env and fill in: MONGO_URI (Atlas), JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / JWT_READ_SECRET (32+ random chars),
#    FRONTEND_URL, RESET_PASSWORD_URL (ONE name only: RESET_PASSWORD_URL=http://localhost:3000/reset-password.html),
#    SMTP_* + MAIL_FROM (Brevo), BREVO_API_KEY, VAPID keys (step 3)
#    Atlas password with symbols: write @ as %40.

# 3. Make the web-push (notify) keys, paste the 2 lines it prints into .env
npm run vapid

# 4. Fill the database with the demo titles and the admin user (skip if you copied your data with copy-db)
npm run seed

# 5. Only if your antivirus breaks email (self-signed certificate), in EACH new terminal:
$env:NODE_OPTIONS="--use-system-ca"

# 6. Check Brevo (email + contacts)
npm run test:brevo

# 7. Start the server
npm run dev          # must print: ✔ MongoDB connected  and  port 5000
```

If **port 5000 is already in use**: `Get-NetTCPConnection -LocalPort 5000 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }` and run `npm run dev` again.
Only keep ONE terminal running `npm run dev`.

**Copy old local Docker data to Atlas (once):**
`node scripts/copy-db.js 'mongodb://chadmin:change-me-dev-password@127.0.0.1:27017/crossed_hearts?authSource=admin' 'mongodb+srv://USER:PASSWORD@cluster0.xxxx.mongodb.net/crossed_hearts?retryWrites=true&w=majority'`
(run from the backend folder, whole command on ONE line, URIs in single quotes).

**Update your existing backend from this zip:** unzip into a NEW folder, copy your own `.env` into it, run `npm install`, then `npm run dev`.
(Or copy only the changed files: everything inside `src/`, `scripts/`, `test/`, `package.json`, `README.md`, `frontend-patches/`.)

**Automated tests:** `npm test` (uses an in-memory database, needs no setup).

### Frontend (the website folder, served at http://localhost:3000)
Copy from `frontend-patches/`:
1. `sw.js` -> the ROOT of the website (same folder as index.html). Needed for browser push notifications.
2. `ch-user.js` -> website folder, then add `<script src="ch-user.js"></script>` before `</body>` on the pages below.
3. **Notify me** (series page): use `CHN.on(...)` / `CHN.off(...)` inside `nEnable` / `nDisable`; first-time popup is in `series-page-notify-patch.js`.
4. **My Library page**: add `<div id="chLibrary"></div>` and call `chRenderLibrary();` after login is checked.
5. **My Account page**: add `<div id="chAccount"></div>` and call `chRenderAccount();`.
6. **Wishlist**: `CHW.add(id)`, `CHW.remove(id)`, `CHW.mergeLocal(localIds)` right after login.
7. **Reader**: `CHR.saveProgress(titleId, chapter, page, totalPages)` on page change, `CHR.addBookmark(...)`.
8. **Newsletter**: `script-newsletter-patch.js`.
`ch-user.js` reads the login token from `CH_TOKEN`, or `localStorage` keys `ch_token` / `accessToken`. If your site stores it elsewhere, change the one function `chToken()` at the top.
After a password change the server sends a NEW `accessToken`; save it the same way you do after login.

### How "Notify me" works per user
* Reader presses **Notify me** on a title + volume -> saved in `notifysubs` (guest by email/browser, or tied to the signed-in user).
* **Chapter added** (admin uploads a chapter) -> everyone following that title gets a push / email / bell notification, and stays subscribed.
* **Volume released** (`POST /api/admin/notify/release`) -> everyone waiting for that volume is told once, then removed from that list.
* `GET /api/notifications/mine` (login) returns what the signed-in reader follows, so "Notifying you" shows on any device.

---

## Run it (short version)

```bash
npm install
cp .env.example .env     # set MONGO_URI and the three JWT_* secrets (see the file for a one-liner)
npm run seed             # admin + licensor + 4 titles named like the frontend (matchmaker-v1, chigaya-v1, …)
npm run dev              # http://localhost:5000
```

* The frontend automatically talks to `http://localhost:5000/api` when it is opened from `localhost`/`127.0.0.1`.
  Serve it over http (VS Code **Live Server**, `npx serve`) — not `file://`. Put that origin in `FRONTEND_URL` in `.env`
  (defaults already cover Live Server on ports 5500 / 5502).
* MongoDB: local `mongodb://127.0.0.1:27017/crossed_hearts`, or a free Atlas cluster URI.
* With `SMTP_HOST` empty, emails (OTP, reset link) are **printed in the server console**.
* No payment keys yet? set `MOCK_PAYMENTS=true` — the whole buy-and-read flow works with fake providers (refused in production).

Seeded logins: admin `admin@example.com / ChangeMe-Admin-123` (use `POST /api/auth/login`), licensor `demo-licensor / Licensor-Demo-123` (licensor portal).

## Endpoints (what the frontend calls)

| Area | Endpoint |
|---|---|
| Auth | `POST /api/auth/register` · `verify-email-otp {email,code}` · `resend-verification` · `login` · `refresh` (cookie) · `logout` · `forgot-password` · `POST reset-password?token=…` · `GET me` |
| Catalogue | `GET /api/books?limit=100` → `data.books` · `GET /api/books/:idOrSlugOrAlias` (e.g. `matchmaker-v1`) |
| Reviews | `GET/POST /api/books/:id/reviews` `{rating, comment}` |
| Payment setup | `GET /api/library/payment-config` → Stripe publishable key + Razorpay key id / enabled flags |
| Buy — India (INR) | `POST /api/library/:titleId/razorpay-order {currency:"INR", chapterId?}` → `POST …/confirm-razorpay` (Razorpay checkout response) |
| Buy — rest of world (USD) | `POST /api/library/:titleId/payment-intent {currency:"USD", chapterId?}` → `POST …/confirm-payment {paymentIntentId}` |
| My purchases | `GET /api/library` → `data.purchases` · `GET /api/library/purchases/:id/invoice.pdf` |
| Reading | `POST /api/library/:bookId/read-token/:chapterId` → `data.readToken` · `GET /api/library/:bookId/read/:chapterId?readToken=` (PDF) · `GET …/preview/:chapterId` (free chapters, no login) |
| Account | `GET /api/physical-orders` → always `data.orders: []` (print orders are not part of this version) · `GET /api/notifications` · `POST /api/notifications/read-all` |
| Support | `POST /api/support/contact {category,name,email,message}` |
| Licensor portal | `POST /api/licensors/login-id {licensorId,password}` · `GET /api/licensors/me` · `GET /api/licensors/my-books` (sales + revenue) |
| Realtime | socket.io on the same port, `auth: { token }` → emits `notification:new` |
| Webhooks | `POST /api/webhooks/stripe` · `POST /api/webhooks/razorpay` (signed; raw body) |
| Admin | `/api/admin/…` stats, titles, PDF chapter upload, refunds, support inbox, users (admin role) |

`chapterId` is a chapter `_id` or the frontend key `ch<N>` (N = chapter number). Omit it (or `"bundle"`) to buy the whole volume.
Prices are always computed on the server from the book's pricing; the browser never sends an amount.

## Test it

### 1. Automated
```bash
npm test                                                    # spins up an in-memory MongoDB (downloads a binary the first time)
MONGO_URI_TEST=mongodb://127.0.0.1:27017/ch_test npm test   # or use your own MongoDB
```
The suite covers: sign-up with OTP, login/refresh/logout, password reset, catalogue + aliases, reviews, INR and USD purchases,
Razorpay signature check, read-token handshake, invoice PDF, library shape, licensor portal, admin upload/refund, and the socket.io notification.

### 2. In the browser (the real frontend)
1. `npm run seed && npm run dev` with `MOCK_PAYMENTS=true`.
2. Open the frontend with Live Server, sign up (the OTP is in the server console), open *The Matchmaker's Fiancé* and buy a chapter.
   Mock mode accepts any card / Razorpay confirmation. Chapter 1 of each seeded title is free; chapters 2–3 need a purchase.
3. Check *My Library*, *Account → invoices*, and the licensor portal (`licenser-login.html`, `demo-licensor`).

### 3. With curl
```bash
API=http://localhost:5000/api
curl "$API/books?limit=100"
curl -o free.pdf $API/library/matchmaker-v1/preview/ch1
curl -X POST $API/auth/register -H 'Content-Type: application/json' -d '{"name":"Me","email":"me@example.com","password":"Passw0rd!x"}'
curl -X POST $API/auth/verify-email-otp -H 'Content-Type: application/json' -d '{"email":"me@example.com","code":"<OTP from server console>"}'   # → accessToken
TOKEN=<accessToken>
curl -X POST $API/library/matchmaker-v1/razorpay-order -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"currency":"INR","chapterId":"ch2"}'
curl -X POST $API/library/matchmaker-v1/confirm-razorpay -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"razorpay_order_id":"<razorpayOrderId>","razorpay_payment_id":"pay_1","razorpay_signature":"x"}'
curl -X POST $API/library/matchmaker-v1/read-token/ch2 -H "Authorization: Bearer $TOKEN"        # → readToken
curl -o ch2.pdf "$API/library/matchmaker-v1/read/ch2?readToken=<readToken>" -H "Authorization: Bearer $TOKEN"
```

### 4. Real payments (test mode)
Set `MOCK_PAYMENTS=false` and add test keys to `.env`.
* **Razorpay:** `RAZORPAY_KEY_ID/SECRET`. Dashboard → Webhooks → `https://<host>/api/webhooks/razorpay` (events `payment.captured`, `order.paid`) → `RAZORPAY_WEBHOOK_SECRET`. Use `ngrok http 5000` locally.
* **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`. Local webhooks: `stripe listen --forward-to localhost:5000/api/webhooks/stripe` → put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`. Test card `4242 4242 4242 4242`.
Access is granted only after the backend verifies the Razorpay signature / re-reads the Stripe PaymentIntent; webhooks are a second, idempotent safety net.

## Not included yet
Print (physical) orders are intentionally not built: this backend is digital-only.
Subscriptions (the account page has a placeholder), and the chatbot has no server side beyond `support/contact`.

---

# How data is stored and how chapters unlock (end to end)

## Where everything lives (all permanent, in MongoDB)

| Collection | What it holds |
|---|---|
| `users` | name, email, **hashed** password, role (user / licensor / admin), verification + reset codes (hashed), login sessions (hashed) |
| `books` | one document per volume: title, slug, aliases (`matchmaker-v1`…), prices (USD/INR), **chapters** (order, title, free?, PDF file name), ratings, sales/read counters |
| `purchases` | **the unlock record**: user, book, chapters bought (or the whole book), amount, currency, provider (razorpay/stripe), provider payment id, status (`pending`→`paid`→`refunded`), invoice number |
| `reviews` | rating + comment, one per user per title |
| `notifications` | saved notifications (also pushed live over socket.io) |
| `supportmessages` | contact / help form messages |
| `counters` | the invoice number sequence |

Chapter **PDF files** are not in MongoDB; they sit on disk in `uploads/private/` (a Docker volume in the compose setup) and only the file *name* is stored in `books.chapters.pdfFile`. That name is never sent to the browser. For production use a persistent disk or move the files to S3 / Cloudflare R2.

## How a chapter gets unlocked

1. Reader clicks **Buy** → browser calls `POST /api/library/:title/razorpay-order` (India) or `…/payment-intent` (rest of world).
2. Server looks up the price in `books`, creates a `purchases` document with `status: "pending"`, and creates the Razorpay order / Stripe PaymentIntent.
3. Reader pays in the Razorpay / Stripe popup.
4. Browser calls `…/confirm-razorpay` or `…/confirm-payment`. The server does **not** trust the browser:
   Razorpay → it recomputes the HMAC signature with your secret; Stripe → it asks Stripe for the PaymentIntent and checks `succeeded` and the amount.
   Webhooks do the same check independently, so a payment still counts if the browser closed early.
5. Only then: `purchases.status` becomes **`paid`** (done atomically, so double-clicks / retries cannot double-count), an invoice number is assigned, sales counters go up, a notification is saved and pushed live.
6. **Unlocked.** Every read request recomputes access from `purchases`: a chapter opens if it is free, **or** the user has a `paid` purchase for the whole book, **or** for that chapter. Nothing is cached in the browser that grants access.
7. Reading: `POST /api/library/:book/read-token/:chapter` (checks the purchase, returns a 10-minute token) → `GET …/read/:chapter?readToken=…` (checks again, streams the PDF). A refund sets `status: "refunded"`, which closes the door immediately.

## Real time

socket.io runs on the same port as the API. The browser connects with its login token and joins a private room; whenever the server saves a notification (e.g. payment confirmed) it also emits `notification:new` to that room, so the toast appears instantly on every open tab.

## Docker: permanent database + a page to look at the data

```bash
cp .env.example .env     # then set MONGO_URI to the Docker one (see the comment in the file):
                         # mongodb://chadmin:change-me-dev-password@127.0.0.1:27017/crossed_hearts?authSource=admin
docker compose up -d     # MongoDB + Mongo Express
npm run seed && npm run dev
```

* **Browse the data:** open <http://localhost:8081> (login `admin` / `change-me-ui-password`) → database `crossed_hearts` → collections. Buy a chapter in the frontend and watch a new document appear in `purchases` with `status: "paid"`.
* **Or use the shell:** `docker exec -it ch-mongo mongosh -u chadmin -p change-me-dev-password --authenticationDatabase admin crossed_hearts`, then e.g.
  `db.purchases.find({status:"paid"}).pretty()` · `db.users.find({}, {email:1,role:1})` · `db.books.find({}, {title:1,"chapters.title":1})`
* **Data survives restarts:** `docker compose down` keeps it (named volume `mongo_data`). Only `docker compose down -v` deletes it.
* **Everything in Docker, including the API:** `docker compose --profile app up -d --build`, then `docker exec ch-api node scripts/seed.js`.
* Or skip Docker and use a free **MongoDB Atlas** cluster: put its connection string in `MONGO_URI`; Atlas has its own *Browse Collections* page.
* Before real use, change the passwords in `docker-compose.yml` (or in a `.env` next to it: `MONGO_ROOT_PASSWORD`, `MONGO_UI_PASSWORD`) and back the database up (`mongodump`, or Atlas backups).

## Per-user data & watermark (digital only)

| Endpoint (login required) | What it returns |
|---|---|
| `GET /api/me/overview` | account, stats, owned titles with unlocked chapters, purchases, wishlist, continue-reading |
| `PATCH /api/me`, `POST /api/me/change-password` | edit name, change password (signs out other devices) |
| `GET /api/me/purchases`, `GET /api/me/library` | purchase history with invoice links; which chapters are unlocked per title |
| `GET/POST/DELETE /api/me/wishlist[/:bookId]` | wishlist |
| `GET /api/me/progress`, `PUT /api/me/progress/:bookId/:chapterId`, `POST/DELETE .../bookmarks` | reading status, page, percent, bookmarks |
| `GET /api/me/reading-history` | chapters opened, with watermark ids |

**Watermark:** every chapter a logged-in reader opens is stamped in memory (diagonal name, top-left name, footer with name, email, date, trace ID, PDF metadata listing their unlocked chapters). Each open is stored in the `readevents` collection, so a leaked file's ID leads to a user. Anonymous free previews are not stamped.
New collections: `readingprogresses`, `readevents`; `users.wishlist`.

## Library, account, wishlist, notify-me (new)

| Endpoint (login unless noted) | Purpose |
|---|---|
| `GET /api/library/reading-state` | `{progress:[{titleId,chapter,page,totalPages,percent,completed,lastReadAt}], bookmarks:[{_id,titleId,chapter,page,note,createdAt}]}` |
| `PUT /api/library/progress` | `{titleId,chapter,page,totalPages,completed}` upsert per user+title+chapter (completed is permanent) |
| `POST /api/library/bookmarks` / `DELETE /api/library/bookmarks/:id` | add / remove a bookmark |
| `GET /api/library` | paid purchases; each `bookId` now has `imprint`, `format`, `totalChapters`, `coverUrl` |
| `PATCH /api/account/profile` `{name}` , `PATCH /api/account/phone` `{phone}` | edit name / phone (`phone` is also in `GET /api/auth/me`) |
| `POST /api/account/email/change` `{newEmail,password}` then `POST /api/account/email/verify` `{code}` | change email with a 6-digit code sent to the new address |
| `POST /api/account/password` `{currentPassword,newPassword}` | change password (other devices signed out, this one stays) |
| `GET /api/wishlist`, `PUT /api/wishlist {titleIds:[]}` (merge a guest list), `POST` / `DELETE /api/wishlist/:titleId` | server wishlist |
| `GET /api/notifications/vapid-key`, `POST /subscribe`, `POST /unsubscribe` (**no login needed**), `GET /mine` (login: what I follow) | the "Notify me" button |
| `POST /api/admin/notify/release`, `POST /api/admin/notify/general` (admin) | tell followers a volume is out / send news |

Adding a chapter through `POST /api/admin/books/:id/chapters` automatically notifies everyone following that title (add `?notify=false` to skip).
New collections: `readingprogresses`, `bookmarks`, `notifysubs`. The licensor portal is switched off (`ENABLE_LICENSOR_PORTAL=false`).

### Scripts
`npm run vapid` (browser-push keys) · `npm run test:brevo -- you@example.com` (checks Brevo SMTP + API + contact sync)

### MongoDB Atlas (cloud, official site)
1. cloud.mongodb.com -> sign up -> create a free **M0** cluster.
2. **Database Access** -> Add user (username + password; avoid `@ : /` in the password, or URL-encode it).
3. **Network Access** -> Add IP address -> your current IP (for production: your server's IP).
4. **Connect** -> Drivers -> copy the string and put the DB name before the `?`:
   `MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/crossed_hearts?retryWrites=true&w=majority`
5. `npm run seed`, `npm run dev`, then **Atlas -> Browse Collections** shows users, books, purchases... live.
Local data is not moved automatically; to copy it: `mongodump --uri="<local uri>"` then `mongorestore --uri="<atlas uri>" dump/`.
