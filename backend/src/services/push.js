const webpush = require('web-push');
const config = require('../config');
const NotifySub = require('../models/NotifySub');
const { notify } = require('./notify');
const { sendMail } = require('../utils/mailer');

const pushReady = !!(config.push.publicKey && config.push.privateKey);
if (pushReady) webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);

const defaultUrl = () => config.frontendOrigins[0] || '/';

/** Send one payload to many subscriptions: browser push, plus the in-app bell for signed-in users, plus email for people who have no push. */
async function deliver(docs, payload) {
  let pushed = 0;
  let emailed = 0;
  await Promise.all(docs.map(async (d) => {
    if (d.subscription && d.subscription.endpoint && pushReady) {
      try {
        await webpush.sendNotification(d.subscription, JSON.stringify(payload));
        pushed += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await d.deleteOne(); // browser unsubscribed / expired
        else console.warn('push failed', err.statusCode || err.message);
      }
    } else if (d.email) {
      await sendMail({ to: d.email, subject: payload.title, text: `${payload.body}\n\n${payload.url || ''}` }).then(() => { emailed += 1; }).catch(() => {});
    }
    if (d.userId) await notify(d.userId, { type: 'release', title: payload.title, message: payload.body }).catch(() => {});
  }));
  return { matched: docs.length, pushed, emailed };
}

const lower = (arr) => [...new Set(arr.filter(Boolean).map((s) => String(s).toLowerCase()))];

/** A whole volume is out. Everyone waiting for that volume is told, then removed from its list. */
async function notifyVolumeReleased(titleIds, volume, { titleName, url, icon } = {}) {
  const ids = lower(titleIds);
  const docs = await NotifySub.find({ titles: { $elemMatch: { titleId: { $in: ids }, volume } } });
  const name = titleName || docs[0]?.titles.find((t) => ids.includes(t.titleId))?.titleName || 'Your title';
  const result = await deliver(docs, { title: `Volume ${volume} is out now!`, body: `${name} Volume ${volume} has just been released.`, url: url || defaultUrl(), icon, tag: `${ids[0]}:${volume}` });
  await NotifySub.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { $pull: { titles: { titleId: { $in: ids }, volume } } });
  return result;
}

/** A new chapter was added. Everyone following the title is told; they stay subscribed for the next chapter. */
async function notifyChapterAdded(titleIds, { titleName, chapterTitle, chapterNumber, volume, url, icon } = {}) {
  const ids = lower(titleIds);
  const docs = await NotifySub.find({ titles: { $elemMatch: { titleId: { $in: ids }, ...(volume ? { volume } : {}) } } });
  const name = titleName || docs[0]?.titles.find((t) => ids.includes(t.titleId))?.titleName || 'Your title';
  const label = chapterNumber ? `Chapter ${chapterNumber}${chapterTitle ? `: ${chapterTitle}` : ''}` : (chapterTitle || 'A new chapter');
  return deliver(docs, { title: `New chapter: ${name}`, body: `${label} is now available.`, url: url || defaultUrl(), icon, tag: `${ids[0]}:ch:${chapterNumber || chapterTitle}` });
}

/** Crossed Hearts news for everyone who opted in. */
async function notifyGeneral({ title, body, url, icon }) {
  return deliver(await NotifySub.find({ general: true }), { title, body, url: url || defaultUrl(), icon });
}

module.exports = { pushReady, notifyVolumeReleased, notifyChapterAdded, notifyGeneral };
