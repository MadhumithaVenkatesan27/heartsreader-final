/**
 * Copies every collection (users, books, purchases, reviews, notifysubs, readingprogresses, bookmarks, ...)
 * from one MongoDB to another, e.g. your local Docker database -> MongoDB Atlas.
 *
 *   node scripts/copy-db.js '<FROM uri>' '<TO uri>' [--replace]
 *
 * - Both addresses must contain the database name (...mongodb.net/crossed_hearts?...).
 * - Without --replace, a collection that already has documents in the target is skipped (nothing is overwritten).
 * - With --replace, those target collections are emptied first and then filled from the source.
 * - The old "physicalorders" collection is never copied (print orders were removed).
 * - Only database records are copied. Chapter PDFs live in the uploads folder and are not part of the database.
 */
const { MongoClient } = require('mongodb');

const SKIP = new Set(['physicalorders']);

function dbName(uri) {
  try {
    return decodeURIComponent(new URL(uri).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

(async () => {
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const [from, to] = args.filter((a) => !a.startsWith('--'));
  if (!from || !to) {
    console.log("Usage: node scripts/copy-db.js '<FROM uri>' '<TO uri>' [--replace]");
    process.exit(1);
  }
  if (!dbName(from) || !dbName(to)) {
    console.log('Both addresses must include the database name, e.g. .../crossed_hearts?...  (the part right after the host).');
    process.exit(1);
  }
  const src = new MongoClient(from, { serverSelectionTimeoutMS: 15000 });
  const dst = new MongoClient(to, { serverSelectionTimeoutMS: 15000 });
  try {
    await src.connect();
    await dst.connect();
    const sdb = src.db(dbName(from));
    const ddb = dst.db(dbName(to));
    console.log(`Copying "${sdb.databaseName}" -> "${ddb.databaseName}"${replace ? ' (replacing existing data)' : ''}\n`);

    const cols = (await sdb.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name).filter((n) => !n.startsWith('system.') && !SKIP.has(n)).sort();
    for (const name of cols) {
      const s = sdb.collection(name);
      const d = ddb.collection(name);
      const total = await s.countDocuments();
      const existing = await d.countDocuments();
      if (existing && !replace) {
        console.log(`  skipped   ${name.padEnd(20)} (target already has ${existing} documents; use --replace to overwrite)`);
        continue;
      }
      if (existing) await d.deleteMany({});
      let copied = 0;
      let batch = [];
      for await (const doc of s.find()) {
        batch.push(doc);
        if (batch.length === 500) { await d.insertMany(batch, { ordered: false }); copied += batch.length; batch = []; }
      }
      if (batch.length) { await d.insertMany(batch, { ordered: false }); copied += batch.length; }
      console.log(`  copied    ${name.padEnd(20)} ${copied}/${total} documents`);
    }
    console.log('\nDone. Refresh Atlas -> Browse Collections.');
  } catch (err) {
    console.error(`\nFailed: ${err.message}`);
    if (/bad auth|Authentication failed/i.test(err.message)) console.error('Hint: wrong user or password (URL-encode special characters, e.g. @ -> %40).');
    if (/ENOTFOUND|ECONNREFUSED|timed out|ServerSelection/i.test(err.message)) console.error('Hint: cannot reach a database. Local: is Docker running? Atlas: is your IP allowed under Network Access?');
    process.exitCode = 1;
  } finally {
    await src.close().catch(() => {});
    await dst.close().catch(() => {});
  }
})();
