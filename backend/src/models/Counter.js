const mongoose = require('mongoose');

const Counter = mongoose.model(
  'Counter',
  new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }),
);

/** Atomic, gap-free-ish sequence (used for invoice / order numbers). */
async function nextSeq(name) {
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return doc.seq;
}

module.exports = { Counter, nextSeq };
