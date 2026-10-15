/* Print editions link to the official Crossed Hearts website */
const PRINT_URL = "https://thecrossedhearts.com/";

/* imprint id -> [name, brand colour, text colour on that colour] */
const IMP = {
  q: ["Queen of Hearts", "#e0003c", "#fff"],
  k: ["King of Spades", "#0080f5", "#fff"],
  d: ["Ace of Diamond", "#2bb673", "#fff"],
  bl: ["Blush Club", "#e6168c", "#fff"],
  gl: ["Glam Beat", "#ffe000", "#1a1208"],
  np: ["A Novel Press", "#e8651f", "#fff"],
  sh: ["Studio Hearts", "#8b2d42", "#fff"],
};

/* R(key, imprint, oldPage, cover, title, genre, age, digital price, print price, shelf badge, new-release badge, carousel banner, extras{ch}) */
const T = {};
function R(k, i, h, img, t, g, a, d, p, b, n, bn, o) {
  T[k] = Object.assign({ i, h, img, t, g, a, d, p, b, n, bn }, o || {});
}

/* QUEEN */
R(
  "chigaya",
  "q",
  "chigaya.html",
  "Chigaya-vol 1.png",
  "You're Way Too Cheeky, Chigaya-kun!",
  "Manga · Romance · School Life",
  "13+",
  "$0.75",
  "$12.99",
  "Vol.2 – Oct 2026",
  "",
  "Chigaya-clock-banner.png",
);
R(
  "matchmaker",
  "q",
  "matchmaker.html",
  "Matchmaker-vol 1.png",
  "The Matchmaker's Fiancé: My Fiancé Won't Leave Me Alone While I'm Finding Him the Ideal Bride",
  "Manga · Romance · Comedy",
  "13+",
  "$0.75",
  "$12.99",
  "Vol.1 – Aug 2026",
  "",
  "Matchmaker-clock-banner.png",
);
R(
  "mobs",
  "q",
  "twoOfUs.html",
  "Mobs Updated Cover Page.png",
  "Two of Us Can't Stay Mobs",
  "Manga · Fantasy · Romance",
  "13+",
  "$0.75",
  "$12.99",
  "Vol.1 – Feb 2027",
  "Feb 2027",
  "twomobs-banner.png",
);
R(
  "emma",
  "q",
  "emma.html",
  "emma and the eyes cover page.png",
  "Emma and the Eyes That Bid Farewell",
  "Manga · Fantasy · Shoujo",
  "13+",
  "$0.75",
  "$12.99",
  "Vol.1 – Feb 2027",
  "Feb 2027",
  "emma-banner.png",
);
R(
  "baroness",
  "q",
  "baroness.html",
  "BGOS-vol1.png",
  "Baroness Goes on Strike",
  "Manhwa · Romance · Fantasy",
  "16+",
  "",
  "$20.00",
  "Vol.3 – Dec 2026",
  "",
  "BGOS-clock-banner.png",
);
R(
  "knight",
  "q",
  "knight-to-lady.html",
  "FKTL-vol1.png",
  "From a Knight to a Lady",
  "Manhwa · Romance · Fantasy",
  "16+",
  "",
  "$20.00",
  "Vol.3 – Jan 2027",
  "",
  "FKTL-clock-banner.png",
);
R(
  "archduke",
  "q",
  "archduke.html",
  "TAAS-vol1.png",
  "The Archduke's Adopted Saint",
  "Manhwa · Romance · Fantasy",
  "16+",
  "",
  "$18.99",
  "Vol.2 – Dec 2026",
  "",
  "TAAS-clock-banner.png",
);
R(
  "darling",
  "q",
  "darling.html",
  "DWD-vol1.png",
  "Darling, Why Don't We Divorce?",
  "Manhwa · Romance · Fantasy",
  "16+",
  "",
  "$20.00",
  "Vol.1 – Dec 2026",
  "",
  "darling-clock-banner.png",
);
R(
  "flirting",
  "q",
  "flirtingwiththevillainsdad.html",
  "Flirting with villains dad.png",
  "Flirting with the Villain's Dad",
  "Manhwa · Romance · Drama",
  "16+",
  "$10.99",
  "$29.99",
  "Vol.1 – Mar 2027",
  "Feb 2027",
  "Flirting with villains dad.png",
);

/* KING */
R(
  "exec",
  "k",
  "executioner.html",
  "Grenimal-vol 1.png",
  "The Executioner of Grenimal",
  "Manga · Action · Mystery",
  "17+",
  "$0.75",
  "$12.99",
  "Vol.1 – Aug 2026",
  "",
  "executioner-clock-banner.png",
);
R(
  "allrounder",
  "k",
  "allrounder.html",
  "Connie-vol 1.png",
  "All-Rounder Maid Connie Wille",
  "Manga · Fantasy · Josei",
  "16+",
  "$0.75",
  "$12.99",
  "Vol.1 – Dec 2026",
  "",
  "allrounder-clock-banner.png",
);
R(
  "lovebeyond",
  "k",
  "loveBeyond.html",
  "Love beyond the final boss.jpeg",
  "Love Beyond the Final Boss: The Hero Party's Quest for Love",
  "Manga · Fantasy · Comedy",
  "13+",
  "$0.75",
  "$12.99",
  "Vol.1 – Feb 2027",
  "Feb 2027",
  "lovebeyond-banner.png",
);

/* DIAMOND / ACE */
R(
  "rose",
  "d",
  "welcometotherosemanor.html",
  "Welcome to the rose manor.jpeg",
  "Welcome to Rose Manor",
  "Manhwa · Horror · Thriller",
  "16+",
  "",
  "$29.99",
  "Vol.1 – Mar 2027",
  "Mar 2027",
  "rosemanor-banner.png",
);

/* GLAM BEAT */
R(
  "borrowing",
  "gl",
  "borrowing.html",
  "Borrowing.png",
  "Borrowing Your Textbook 175160",
  "Girls' Love · High School · Manga",
  "13+",
  "$0.75",
  "",
  "June 2026",
  "",
  "Borrowing-clock-banner.png",
);
R(
  "timeisa",
  "gl",
  "timeisa.html",
  "Time-ch1.png",
  "Time is a Closet",
  "Girls' Love · Manga · Supernatural",
  "16+",
  "$0.75",
  "",
  "May 2026",
  "",
  "Time-clock-banner.png",
);
R(
  "afternoon",
  "gl",
  "afternoon.html",
  "Afternoon-ch1.png",
  "Afternoon Tea for Two",
  "Girls' Love · Manga · Mystery",
  "16+",
  "$0.75",
  "",
  "May 2026",
  "",
  "Afternoon-clock-banner.png",
);
R(
  "ink",
  "gl",
  "inksoakedintoashenpaper.html",
  "Ink Soaked Into Ashen Paper Cover.png",
  "Ink Soaked into Ashen Paper",
  "Girls' Love · Novel · Fantasy",
  "16+",
  "$9.99",
  "$23.99",
  "Apr 2027",
  "Mar 2027",
  "inksoaked-banner.png",
);
R(
  "devil",
  "gl",
  "thedevilInMe.html",
  "Devil in me.png",
  "The Devil in Me",
  "Girls' Love · Supernatural · Vampire",
  "16+",
  "$6.99",
  "$12.99",
  "Mar 2027",
  "Mar 2027",
  "devilinme-banner.png",
);

/* BLUSH CLUB */
R(
  "gaze",
  "bl",
  "gaze.html",
  "gaze-std.png",
  "A Gaze Like Lightning",
  "Boys' Love · Manga · School Life",
  "17+",
  "$0.75",
  "$12.99",
  "Dec 2026",
  "",
  "Gaze-clock-banner.png",
);
R(
  "until",
  "bl",
  "until.html",
  "until-std.png",
  "Until We Fall in Love",
  "Boys' Love · Manga · School Life",
  "17+",
  "$0.75",
  "$12.99",
  "Dec 2026",
  "",
  "until-clock-banner.png",
);
R(
  "theking",
  "bl",
  "theking.html",
  "theking-std.png",
  "The King of Owls and His Troubled Attendant",
  "Boys' Love · Manga · Fantasy",
  "18+",
  "$0.75",
  "$12.99",
  "Dec 2026",
  "",
  "theking-clock-banner.png",
);
R(
  "thebird",
  "bl",
  "thebird.html",
  "thebird-std.png",
  "The Bird in the Cage Dreams",
  "Boys' Love · Manga · Fantasy",
  "18+",
  "$0.75",
  "$12.99",
  "Dec 2026",
  "",
  "thebird-clock-banner.png",
);
R(
  "fairy",
  "bl",
  "fairyTrap.html",
  "Fairy Trap Cover.png",
  "Fairy Trap",
  "Boys' Love · Novel · Fantasy",
  "17+",
  "$9",
  "$23.99",
  "Mar 2027",
  "Mar 2027",
  "fairytrap-banner.png",
);
R(
  "addicted",
  "bl",
  "addictedToYou.html",
  "Addicted-std.png",
  "Addicted to You",
  "Boys' Love · Romance · Drama",
  "18+",
  "$0.75",
  "$12.99",
  "Nov 2027",
  "Nov 2027",
  "addicted-banner.png",
);

/* A NOVEL PRESS */
R(
  "zombie",
  "np",
  "abandonedvillainess.html",
  "Zombie-vol1.png",
  "The Abandoned Villainess Became a Zombie",
  "Novel · Fantasy · Horror",
  "17+",
  "$9",
  "$19.99",
  "Vol.1 – Dec 2026",
  "",
  "Zombie-clock-banner.png",
);
R(
  "raeliana",
  "np",
  "whyraeliana.html",
  "raelianaVol1-std.jpg",
  "Why Raeliana Ended Up at the Duke's Mansion",
  "Novel · Romance · Isekai",
  "13+",
  "$9",
  "$23.99",
  "Vol.1 – Dec 2026",
  "",
  "raeliana-clock-banner.png",
);

/* STUDIO HEARTS */
R(
  "doomsday",
  "sh",
  "doomsday.html",
  "Doomsday cover.png",
  "Doomsday Requiem With You",
  "Light Novel · Shoujo · Mystery",
  "",
  "$9",
  "$23.99",
  "May 2027",
  "May 2027",
  "doomsday-banner.png",
);
R(
  "chiaro",
  "sh",
  "chiaroscuro.html",
  "Chairoscuro Cover.png",
  "Chiaroscuro",
  "Manga · Romance · Fantasy",
  "",
  "$9",
  "$12.99",
  "Apr 2027",
  "Apr 2027",
  "charoscuro-banner.png",
);
R(
  "soul",
  "sh",
  "soulguiders.html",
  "Soul guiders.png",
  "Soul Guiders",
  "Light Novel · Shounen · Mystery",
  "",
  "$9",
  "$23.99",
  "Apr 2027",
  "Apr 2027",
  "soulguider-banner.png",
);
R(
  "kiss",
  "sh",
  "kissbefore.html",
  "A kiss before gunshor cover .jpeg",
  "A Kiss Before the Gunshot",
  "Girls' Love · Romance · Mystery",
  "",
  "$0.75",
  "$12.99",
  "May 2027",
  "May 2027",
  "kissbefore-banner.png",
);

/* NO IMPRINT YET (Creator Original) */
R(
  "octo",
  "",
  "octopiece.html",
  "Octopiece-vol1.png",
  "OctoPiece",
  "Manga · Action · Adventure",
  "16+",
  "$0.75",
  "",
  "Jun 2026",
  "",
  "octopiece-clock-banner.png",
);
R(
  "wsms",
  "",
  "whereseameetshore.html",
  "Where Sea Meets Shore Cover.png",
  "Where Sea Meets Shore",
  "Manga · Romance · Fantasy",
  "",
  "$0.75",
  "",
  "Sep 2026",
  "Sep 2026",
  "seameets-banner.png",
);

/* LILY HOUSE (print) */
R(
  "rev",
  "",
  "reverse4you.html",
  "Reserve 4 you cover image.png",
  "Reverse 4 You",
  "Girls' Love · Sci-Fi · Romance",
  "",
  "",
  "$25",
  "December 2027",
  "",
  "Reserve 4 you cover image.png",
  { ch: "reverse4you.html" },
);
R(
  "pls",
  "",
  "plslove.html",
  "Pls Love.png",
  "Pls Love",
  "Girls' Love · Romance · Drama",
  "",
  "",
  "$25",
  "December 2027",
  "",
  "Pls Love.png",
  { ch: "plslove.html" },
);
R(
  "earth",
  "",
  "earthvows.html",
  "The Earth Vows of Land Cover image.png",
  "The Earth: Vows of the Land",
  "Girls' Love · Family Drama · Romance",
  "",
  "",
  "$25",
  "December 2027",
  "",
  "The Earth Vows of Land Cover image.png",
  { ch: "earthvows.html" },
);
R(
  "cranium",
  "",
  "cranium.html",
  "Cranium cover image.png",
  "Cranium",
  "Girls' Love · Mystery · Romance",
  "",
  "",
  "$25",
  "December 2027",
  "",
  "Cranium cover image.png",
  { ch: "cranium.html" },
);
R(
  "ewb",
  "",
  "enemies-withbenefits.html",
  "Enimes with Benefits cover image.png",
  "Enemies with Benefits",
  "Girls' Love · Drama · Romance",
  "",
  "",
  "$25",
  "June 2027",
  "",
  "Enimes with Benefits cover image.png",
  { ch: "enemies-with-benefits.html" },
);

/* ================================================================
   SHARED HELPERS  (used by index.html + comics/manga/novel pages)
   ================================================================ */
const KEYS = Object.keys(T);
const genresOf = (r) => r.g.split(" · ").map((s) => s.trim());
const isExt = (u) => /^https?:/.test(u);
const printUrl = (r) => r.ch || PRINT_URL;
const openUrl = (k) => T[k].h;
const extAttr = (u) => (isExt(u) ? ' target="_blank" rel="noopener"' : "");
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");

const isDigital = (k) => !!T[k].d;
const isPrintOnly = (k) => !T[k].d && !!T[k].p;
const DIGITAL_KEYS = KEYS.filter(isDigital);
const PRINT_ONLY_KEYS = KEYS.filter(isPrintOnly);

function sectionOf(k) {
  const g = genresOf(T[k]).map((x) => x.toLowerCase());
  if (g.includes("novel") || g.includes("light novel")) return "novel";
  if (g.includes("manhwa") || g.includes("comics") || g.includes("webtoon"))
    return "comics";
  return "manga";
}
const FORMAT_WORDS = [
  "manga",
  "manhwa",
  "novel",
  "light novel",
  "comics",
  "webtoon",
];
const subGenresOf = (k) =>
  genresOf(T[k]).filter((x) => !FORMAT_WORDS.includes(x.toLowerCase()));

/* Series names on ONE line: drop the long subtitle after ":" */
function shortTitle(t) {
  const i = t.indexOf(":");
  return i > 8 ? t.slice(0, i).trim() : t;
}

/* id used by "Add to My Library" (matches the series id on the title page) */
const libId = (k) => {
  const flat = typeof ALL_TITLES_FLAT !== "undefined" ? ALL_TITLES_FLAT : [];
  const hit = flat.find((t) => t.href === T[k].h);
  return hit ? hit.id : T[k].h.replace(/\.html?$/i, "");
};

function synopsisOf(k) {
  const cat = window.CH_CATALOG || [];
  const hit = cat.find((c) => c.url === T[k].h && c.synopsis);
  return hit ? hit.synopsis : "";
}

function card(k, opts) {
  opts = opts || {};
  const r = T[k],
    m = IMP[r.i],
    u = opts.print || isPrintOnly(k) ? printUrl(r) : openUrl(k),
    full = esc(r.t),
    syn = synopsisOf(k);
  return `<a class="tp-card${opts.rank ? " ranked" : ""}" href="${u}" data-go="${u}"${extAttr(u)} data-key="${k}" style="--acc:${m ? m[1] : "#c9a84c"}">
    ${opts.rank ? `<span class="tp-rank">${opts.rank}</span>` : ""}
    <div class="tp-cover">
      <img loading="lazy" src="Images/${r.img}" alt="${full} cover" />
      ${r.n ? `<span class="tp-tag">NEW</span>` : ""}
      ${isPrintOnly(k) ? `<span class="tp-tag print">PRINT</span>` : ""}
      <span class="tp-fmt">${r.d ? '<i class="ti ti-device-tablet" title="Digital"></i>' : ""}${r.p ? '<i class="ti ti-book" title="Print"></i>' : ""}</span>
      ${m ? `<span class="tp-imp">${m[0]}</span>` : ""}
      <span class="tp-hover"><b>${esc(subGenresOf(k).slice(0, 3).join(" · "))}</b>${syn ? `<em>${esc(syn)}</em>` : ""}<u>${isPrintOnly(k) ? "View in print store" : "Read now"} &rsaquo;</u></span>
    </div>
    <div class="tp-ct" title="${full}">${esc(shortTitle(r.t))}</div>
    <div class="tp-cg">${esc(genresOf(r).slice(0, 2).join(" · "))}</div>
    ${r.n || r.b ? `<div class="tp-cb">${esc(r.n || r.b)}</div>` : ""}
  </a>`;
}

document.addEventListener(
  "click",
  (e) => {
    const a = e.target.closest("a[data-go]");
    if (!a) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const url = a.dataset.go;
    if (/^https?:/.test(url)) window.open(url, "_blank", "noopener");
    else window.location.href = url;
  },
  true,
);

function rowHTML(id, title, sub, keys, cardOpts) {
  if (!keys.length) return "";
  return `<section class="tp-block" id="${id}">
    <div class="tp-sh"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>
      <div class="tp-arrows"><button class="tp-circ" data-scroll="-1" aria-label="Scroll left">&#8249;</button><button class="tp-circ" data-scroll="1" aria-label="Scroll right">&#8250;</button></div>
    </div>
    <div class="tp-row">${keys.map((k, i) => card(k, cardOpts ? cardOpts(k, i) : null)).join("")}</div>
  </section>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-scroll]");
  if (!b) return;
  const row = b.closest(".tp-block").querySelector(".tp-row");
  row.scrollBy({
    left: row.clientWidth * 0.8 * Number(b.dataset.scroll),
    behavior: "smooth",
  });
});
