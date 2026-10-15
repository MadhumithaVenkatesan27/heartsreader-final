/* EXAMPLE backend for push notifications (Node + Express + Mongoose + web-push).
   Untested sample: adapt to your own server.
   Setup:  npm i web-push
           npx web-push generate-vapid-keys   -> put keys in .env
   Mount:  app.use("/api/notifications", require("./notifications-backend-example").router);
*/
const express = require("express");
const webpush = require("web-push");
const mongoose = require("mongoose");

webpush.setVapidDetails(
  "mailto:support@thecrossedhearts.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const Sub = mongoose.model(
  "NotifySub",
  new mongoose.Schema(
    {
      endpoint: { type: String, unique: true },
      subscription: Object,
      email: String,
      general: { type: Boolean, default: false }, // Crossed Hearts news
      titles: [
        {
          titleId: String,
          titleName: String,
          volume: Number,
          releaseDate: String,
        },
      ],
    },
    { timestamps: true },
  ),
);

const router = express.Router();

router.get("/vapid-key", (req, res) =>
  res.json({ key: process.env.VAPID_PUBLIC_KEY }),
);

router.post("/subscribe", async (req, res) => {
  const {
    titleId,
    titleName,
    volume,
    releaseDate,
    general,
    email,
    subscription,
  } = req.body;
  if (!subscription || !subscription.endpoint)
    return res.json({ ok: true, push: false });
  const doc =
    (await Sub.findOne({ endpoint: subscription.endpoint })) ||
    new Sub({ endpoint: subscription.endpoint });
  doc.subscription = subscription;
  if (email) doc.email = email;
  if (general) doc.general = true;
  if (!doc.titles.some((t) => t.titleId === titleId && t.volume === volume))
    doc.titles.push({ titleId, titleName, volume, releaseDate });
  await doc.save();
  res.json({ ok: true, push: true });
});

router.post("/unsubscribe", async (req, res) => {
  const { titleId, volume, endpoint } = req.body;
  if (endpoint)
    await Sub.updateOne(
      { endpoint },
      { $pull: { titles: { titleId, volume } } },
    );
  res.json({ ok: true });
});

async function sendAll(docs, payload) {
  await Promise.all(
    docs.map((d) =>
      webpush
        .sendNotification(d.subscription, JSON.stringify(payload))
        .catch((err) => {
          if (err.statusCode === 404 || err.statusCode === 410)
            return d.deleteOne(); // expired
          console.warn("push failed", err.statusCode);
        }),
    ),
  );
}

/* Call this when you mark a volume as released (e.g. from your admin route). */
async function notifyVolumeReleased(titleId, volume, { titleName, url, icon }) {
  const docs = await Sub.find({ titles: { $elemMatch: { titleId, volume } } });
  await sendAll(docs, {
    title: `Volume ${volume} is out now!`,
    body: `${titleName} Volume ${volume} has just been released.`,
    url,
    icon,
    tag: `${titleId}:${volume}`,
  });
  await Sub.updateMany(
    { _id: { $in: docs.map((d) => d._id) } },
    { $pull: { titles: { titleId, volume } } },
  );
}

/* Crossed Hearts news for everyone who opted in (new titles, sales, announcements). */
async function notifyGeneral({ title, body, url, icon }) {
  await sendAll(await Sub.find({ general: true }), { title, body, url, icon });
}

module.exports = { router, notifyVolumeReleased, notifyGeneral };
