/**
 * npm run seed-titles
 * Creates one backend record for every title on the website, so reviews, ratings, the free preview, chapters,
 * payments and "Add to library" have something to attach to. Safe to run again: it only adds what is missing
 * (and adds any missing alias ids to a record that already exists). It never deletes or overwrites anything.
 *
 * To add a new title later: add one line to TITLES below and run it again.
 *   [ 'main-id-used-in-the-page-url', 'Title', 'Manga|Manhwa|Novel|Light Novel|Comic', ['other-ids-the-site-uses'] ]
 */
const mongoose = require('mongoose');
const config = require('../src/config');
const Book = require('../src/models/Book');

const TITLES = [
  ['chigaya', "You're Way Too Cheeky, Chigaya-kun!", 'Manga', ['chigaya-v1', 'chigaya-v2']],
  ['executioner', 'The Executioner of Grenimal', 'Manga', ['grenimal', 'executioner-v1', 'executioner-v2', 'grenimal-v1', 'grenimal-v2']],
  ['matchmaker', "The Matchmaker's Fiancé", 'Manga', ['matchmaker-v1']],
  ['allrounder', 'All-Rounder Maid Connie Wille', 'Manga', ['connie', 'allrounder-v1', 'allrounder-v2', 'connie-v1', 'connie-v2']],
  ['borrowing', 'Borrowing Your Textbook 175160', 'Manga', ['borrowing-v1']],
  ['timeisa', 'Time is a Closet', 'Manga', ['timecloset', 'timeisa-v1']],
  ['afternoon', 'Afternoon Tea for Two', 'Manga', ['afternoontea', 'afternoon-v1']],
  ['until', 'Until We Fall in Love', 'Manga', ['until-we-fall', 'until-v1']],
  ['theking', 'The King of Owls and His Troubled Attendant', 'Manga', ['king-owls', 'theking-v1']],
  ['roommate', 'Roommate', 'Manga', []],
  ['thebird', 'The Bird in the Cage Dreams', 'Manga', ['bird-cage', 'thebird-v1']],
  ['gaze', 'A Gaze Like Lightning', 'Manga', ['gaze-lightning', 'gaze-v1']],
  ['abandonedvillainess', 'The Abandoned Villainess Became a Zombie', 'Novel', ['zombie', 'abandoned', 'abandoned-v1', 'zombie-v1', 'zombie-v2']],
  ['whyraeliana', "Why Raeliana Ended Up at the Duke's Mansion", 'Novel', ['raeliana', 'raeliana-v1', 'raeliana-v2']],
  ['octopiece', 'Octopiece', 'Manga', []],
  ['baroness', 'Baroness Goes on Strike', 'Manhwa', []],
  ['fktl', 'From a Knight to a Lady', 'Manhwa', ['from']],
  ['archduke', "The Archduke's Adopted Saint", 'Manhwa', []],
  ['darling', "Darling, Why Don't We Divorce?", 'Manhwa', []],
  ['lovebeyond', "Love Beyond the Final Boss: The Hero Party's Quest for Love", 'Manga', []],
  ['mobs', "Two of Us Can't Stay Mobs!", 'Manga', []],
  ['emma', 'Emma and the Eyes That Bid Farewell', 'Manga', []],
  ['inksoaked', 'Ink Soaked into Ashen Paper', 'Novel', []],
  ['devilinme', 'The Devil in Me', 'Manga', []],
  ['fairytrap', 'Fairy Trap', 'Novel', []],
  ['addictedtoyou', 'Addicted to You', 'Manga', []],
  ['villainsdad', "Flirting with the Villain's Dad", 'Manhwa', []],
  ['rosemanor', 'Welcome to Rose Manor', 'Manhwa', []],
  ['seameetsshore', 'Where the Sea Meets Shore', 'Manga', []],
  ['kissbeforegunshot', 'A Kiss Before the Gunshot', 'Manga', ['kissbefore']],
  ['doomsdayrequiem', 'Doomsday Requiem With You', 'Light Novel', ['doomsday']],
  ['chiaroscuro', 'Chiaroscuro', 'Manga', []],
  ['soulguiders', 'Soul Guiders', 'Light Novel', []],
  ['reverse4you', 'Reverse 4 You', 'Manga', []],
  ['plslove', 'Pls Love', 'Manga', []],
  ['earthvows', 'The Earth: Vows of the Land', 'Manga', []],
  ['cranium', 'Cranium', 'Manga', []],
  ['enemieswithbenefits', 'Enemies With Benefits', 'Manga', ['enemies']],
];

(async () => {
  await mongoose.connect(config.mongoUri);
  let made = 0;
  let touched = 0;
  for (const [id, title, category, extra] of TITLES) {
    const ids = [...new Set([id, ...extra].map((x) => x.toLowerCase()))];
    // does the site already have a record for any of these ids?
    const have = await Book.findOne({ $or: [{ slug: { $in: ids } }, { aliases: { $in: ids } }] });
    if (have) {
      const missing = ids.filter((x) => x !== have.slug && !have.aliases.includes(x));
      if (missing.length) {
        await Book.updateOne({ _id: have._id }, { $addToSet: { aliases: { $each: missing } } });
        touched += 1;
      }
      continue;
    }
    await Book.create({ title, slug: id.toLowerCase(), aliases: ids.filter((x) => x !== id.toLowerCase()), category, isPublished: true });
    made += 1;
  }
  console.log(`Done. Created ${made} title record(s), updated ${touched}, ${TITLES.length - made - touched} already fine.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
