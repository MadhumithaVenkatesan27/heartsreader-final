const PRINT_URL = "https://thecrossedhearts.com/";

/* imprint id -> [name (alt text only), brand colour, ink colour] */
const IMP = {
  q: ["Queen of Hearts", "#e0003c", "#fff"],
  k: ["King of Spades", "#0080f5", "#fff"],
  d: ["Ace of Diamond", "#2bb673", "#fff"],
  bl: ["Blush Club", "#e6168c", "#fff"],
  gl: ["Glam Beat", "#ffe000", "#1a1208"],
  np: ["A Novel Press", "#e8651f", "#fff"],
  sh: ["Studio Hearts", "#8b2d42", "#fff"],
};
const T = {};
function R(k, i, h, img, t, g, a, d, p, b, n, bn, o) {
  T[k] = Object.assign({ i, h, img, t, g, a, d, p, b, n, bn }, o || {});
}

/* ===== PASTE ALL YOUR EXISTING R("key", ...) CALLS HERE, unchanged ===== */

const KEYS = Object.keys(T);
const DIGITAL = KEYS.filter((k) => T[k].d);
const PRINT_ONLY = KEYS.filter((k) => !T[k].d && T[k].p);
const genresOf = (r) => r.g.split(" · ").map((s) => s.trim());
const isExt = (u) => u.startsWith("http");
const printUrl = (r) => r.ch || PRINT_URL;
const openUrl = (k) => T[k].h;
const extAttr = (u) => (isExt(u) ? ' target="_blank" rel="noopener"' : "");
const logo = (i) => `Images/imprint-${i}.png`;

function card(k, rank) {
  const r = T[k],
    m = IMP[r.i],
    u = r.d ? openUrl(k) : printUrl(r);
  return `<a class="tp-card" href="${u}" data-go="${u}"${extAttr(u)} style="--acc:${m ? m[1] : "#c9a84c"}">
    <div class="tp-cover">
      <img loading="lazy" src="Images/${r.img}" alt="${r.t} cover" />
      ${r.n ? '<span class="tp-tag">NEW</span>' : ""}
      ${rank ? `<span class="tp-rank">${rank}</span>` : ""}
      ${m ? `<img class="tp-imp-mini" src="${logo(r.i)}" alt="${m[0]}" />` : ""}
    </div>
    <div class="tp-ct" title="${r.t}">${r.t}</div>
    <div class="tp-cg">${genresOf(r).slice(0, 2).join(" · ")}</div>
  </a>`;
}
