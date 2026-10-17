/* series-page.js v5 — Tapas-style series page, driven by window.CH2_CONFIG.
   Replaces title-engine.js. Styles come from series-page.css
   (= the <style> block from chigaya.html).

   v5: header + sticky bar now have a "lead" reading button:
       - title not released yet (no digital `read` link) -> disabled "Coming soon"
       - released                                         -> "Read Ch.1 for free"
       - reader has saved progress                        -> "Resume reading"
   Reading progress is stored in localStorage under "ch_progress"
   (see window.chSaveProgress at the bottom of this file). */
(function () {
  const C = window.CH2_CONFIG;
  if (!C) return;

  /* ---- official shop links: just open the shop page, never trigger add-to-cart ---- */
  window.addEventListener(
    "click",
    function (e) {
      const a = e.target.closest && e.target.closest("a.tp-shop");
      if (!a) return;
      e.stopImmediatePropagation();
    },
    true,
  );

  /* ---- small extra CSS for things chigaya.html didn't need ---- */
  const st = document.createElement("style");
  st.textContent = `
    .tp-syn em{display:block;margin-top:10px;color:var(--tp-sub)}
    .tp[data-tab="all"] .tp-tabs{display:none!important}
    .tp-pe.bundle img{object-fit:contain}
    .tp-note{padding:0 16px 14px;font-size:12px;color:var(--tp-sub)}
    .tp-b[disabled],.tp-b.tp-soonbtn{opacity:.7;cursor:not-allowed;pointer-events:none}
    .tp-b.tp-soonbtn i{margin-right:6px;font-size:1.05em;vertical-align:-1px}
    .tp-genre{display:none!important}
    .tp-hi h1{max-width:none!important;width:100%;white-space:nowrap!important;text-wrap:nowrap!important;overflow:hidden;text-overflow:ellipsis}
    @media (max-width:640px){.tp-hi h1{white-space:normal!important;text-wrap:balance!important;overflow:visible}}
    .tp-b.tp-resume small{display:block;font-size:11px;font-weight:500;opacity:.75;line-height:1.1}`;
  document.head.appendChild(st);

  /* ---- derived config ---- */
  const V = C.vols;
  const N = Object.keys(V)
    .map(Number)
    .sort((a, b) => a - b);
  const mode = C.mode || "both";
  const hasDigital = mode !== "print";
  const hasPrint = mode !== "digital";
  const unit = C.unit || "Chapter";
  const imprint = C.imprint || C.Imprint || "Crossed Hearts";
  const isNovel = /novel/i.test((C.crumb || [])[1] || "");
  const kind = /manga/i.test((C.crumb || [])[0] || "")
    ? "Manga"
    : /novel/i.test((C.crumb || [])[0] || "") || isNovel
      ? "Novel"
      : "Comic";
  const plain = (s) => String(s).replace(/<br\s*\/?>/gi, " ");
  const S = { vol: N[0], asc: true };
  const $ = (id) => document.getElementById(id);
  const usd = (p) =>
    p == null ? "TBD" : Number.isInteger(p) ? "$" + p : "$" + p.toFixed(2);
  const q = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  const dig = N.filter((n) => hasDigital && V[n].d);
  const buyable = dig.filter((n) => V[n].d.buy);
  const allTotal = buyable.reduce((s, n) => s + V[n].d.price, 0);
  const hasCh = dig.some((n) => V[n].d.chapters);
  const freeUrl = dig.map((n) => V[n].d.read).find(Boolean);
  const status = C.status || (hasCh ? "Ongoing" : "Upcoming");
  const chapterMode = C.chapterMode || "unlock";
  const printLink = C.printPage || "print.html?title=" + C.id;
  /* volumes whose digital edition is not out yet -> they get a "Notify me" button */
  const upcoming = N.filter((n) => {
    const d = V[n].d;
    return hasDigital && d && !d.chapters && (d.buy === false || d.pre);
  });

  const h = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );
  const stripTags = (s) =>
    String(s || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  /* ---- reading progress (written by the reader page, read here) ----
     localStorage "ch_progress" = { "<titleId>": { vol, ch, url, t } } */
  const PK = "ch_progress";
  const pAll = () => {
    try {
      return JSON.parse(localStorage.getItem(PK) || "{}") || {};
    } catch (e) {
      return {};
    }
  };
  const progress = () => {
    const p = pAll()[C.id];
    return p && typeof p.url === "string" && p.url ? p : null;
  };

  /* characters: { name, image|img, bio|desc, role, traits, bg (inner-page image), raw }
     (old `accent` / `color` keys are ignored: characters are no longer tinted) */
  const chars = () => {
    const pages = Array.isArray(C.castPages) ? C.castPages : [];
    return (C.characters || [])
      .filter((c) => c && c.name && !/^</.test(c.name))
      .map((c, i) => ({
        name: String(c.name),
        image: c.image || c.img || "",
        bio: c.bio || c.desc || "",
        role: c.role || "",
        traits: c.traits || [],
        raw: !!c.raw,
        full: !!c.full,
        bg: c.bg || (pages.length ? pages[i % pages.length] : ""),
      }));
  };
  const initial = (n) => h(String(n).trim().charAt(0));
  const firstName = (n) => String(n).trim().split(/\s+/)[0];
  /* inner-page background: a manga page, washed out, with a spine shadow */
  const pgDiv = (u) =>
    `<div class="tp-pg${u ? "" : " nobg"}"${u ? ` style="--pg:url('${encodeURI(u).replace(/'/g, "%27")}')"` : ""}></div>`;
  /* character art: processed in the browser (see stickerize) unless raw:true */
  const artImg = (c) =>
    !c.image
      ? ""
      : c.raw
        ? `<img class="tp-cut tp-rawimg" src="${q(c.image)}" alt="${q(c.name)}" onload="this.classList.add('on')" onerror="this.parentNode.classList.add('tp-noart');this.remove()">`
        : `<img class="tp-cut" data-cut="${q(c.image)}"${c.full ? ' data-full="1"' : ""} alt="${q(c.name)}">`;

  /* ---- pieces ---- */
  function unlockBox() {
    if (!buyable.length) return "";
    const bonusRow = C.bonus
      ? `<div class="tp-bonus" role="button" tabindex="0" data-act="bonus"><i class="ti ti-gift" aria-hidden="true"></i><span>${h(C.bonus.label || "Bonus wallpaper")}</span><i class="ti ti-chevron-right" aria-hidden="true"></i></div>`
      : "";
    const cards = buyable
      .map((n) => {
        const v = V[n],
          d = v.d;
        return `<div class="tp-un"><div class="tp-un-t">Volume ${n}</div>
          <div class="tp-un-s">${d.range || "Full volume"}<br>${d.pre ? "Releases " + (v.dd || "TBA") : "Available now"}</div>
          <div class="tp-un-p">${usd(d.price)}</div>
          ${buyable.length === 1 ? bonusRow : ""}
          <button data-act="addvol" data-n="${n}">${d.pre ? "Pre-Order" : "Add to Cart"}</button></div>`;
      })
      .join("");
    const all =
      buyable.length > 1
        ? `<div class="tp-un best"><div class="tp-un-t">Everything</div>
          <div class="tp-un-s">Volumes ${buyable[0]}–${buyable[buyable.length - 1]}<br>The whole series</div>
          <div class="tp-un-p">${usd(allTotal)}</div>
          ${bonusRow}
          <button data-act="addall">Add All to Cart</button></div>`
        : "";
    const cp = dig.map((n) => V[n].d.cp).find(Boolean);
    const note =
      hasCh && cp
        ? `<div class="tp-un-note">Or unlock single ${unit.toLowerCase()}s for ${usd(cp)} each in the list below. ${unit} 1 is always free.</div>`
        : "";
    return `<section class="tp-box" id="tpUnlock"><div class="tp-box-h">Unlock options</div>
      <div class="tp-un-grid">${cards}${all}</div>${note}</section>`;
  }

  function cadenceBox() {
    const rows = N.map((n) => {
      const v = V[n],
        d = v.d;
      let parts = [];
      if (hasDigital && d && (d.chapters || d.full) && d.buy && !d.pre)
        parts.push("Digital available now");
      else if (hasDigital && v.dd) parts.push("Digital " + v.dd);
      if (hasPrint && v.pd) parts.push("Print " + v.pd);
      else if (hasPrint && v.p && !v.p.pre) parts.push("Print available now");
      return `<div><b>Volume ${n}</b><span>${parts.join(" · ") || "TBA"}</span></div>`;
    }).join("");
    return `<section class="tp-box tp-acc" id="tpCad">
      <button class="tp-row-btn" data-act="acc"><i class="ti ti-speakerphone" aria-hidden="true"></i><span>Release schedule</span><i class="ti ti-chevron-down chev" aria-hidden="true"></i></button>
      <div class="tp-acc-b">${rows}</div></section>`;
  }

  function chapterRows(n) {
    const v = V[n],
      d = v.d;
    if (!d) return "";
    if (!d.chapters) {
      const msg = d.buy
        ? d.pre
          ? "Pre-order the full volume now and read it when it releases on " +
            (v.dd || "the release date") +
            "."
          : d.full
            ? "This story is available as a complete standalone digital volume."
            : "Serialization has not started yet."
        : "The digital edition is coming " +
          (v.dd ? "on " + v.dd : "soon") +
          ".";
      const btn = d.buy
        ? `<button class="tp-b pri" data-act="addvol" data-n="${n}">${d.pre ? "Pre-Order" : "Add to Cart"} · ${usd(d.price)}</button>`
        : "";
      return `<div class="tp-soon"><i class="ti ti-hourglass-high" aria-hidden="true"></i>
        <h4>${d.full && !d.pre && d.buy ? "Complete digital volume" : unit + "s coming soon"}</h4><p>${msg}</p>${btn}${!d.buy && upcoming.includes(n) ? bellBtn(n, "tp-b pri") : ""}</div>`;
    }
    const idx = d.chapters.map((_, i) => i);
    if (!S.asc) idx.reverse();
    return idx
      .map((i) => {
        const t = d.chapters[i],
          num = i + 1;
        const th = (d.thumbs && d.thumbs[i]) || v.cover;
        if (num === 1)
          return `<div class="tp-ep"><a class="tp-th" href="${d.read}"><img src="${th}" alt="" loading="lazy"></a>
            <div class="tp-et"><small>${unit} ${num}</small><b>${t}</b><span class="tp-free">Free preview</span></div>
            <div class="tp-ea"><span class="tp-ep-p">Free</span><a class="tp-ep-b rd" href="${d.read}">▶ Read</a></div></div>`;
        return `<div class="tp-ep"><div class="tp-th lock"><img src="${th}" alt="" loading="lazy"><i class="ti ti-lock" aria-hidden="true"></i></div>
          <div class="tp-et"><small>${unit} ${num}</small><b>${t}</b></div>
          <div class="tp-ea"><span class="tp-ep-p">${usd(d.cp)}</span><button class="tp-ep-b" data-act="buych" data-n="${n}" data-i="${i}">${chapterMode === "unlock" ? "Unlock" : "Add"}</button></div></div>`;
      })
      .join("");
  }

  function episodesBox() {
    if (!dig.length) return "";
    const chips = dig
      .map((n) => {
        const v = V[n];
        return `<button class="tp-vol${n === S.vol ? " on" : ""}" data-act="vol" data-n="${n}"><b>Volume ${n}</b><small>${v.d.range ? v.d.range + " · " : ""}${v.dd && v.d.pre !== false && !v.d.chapters ? v.dd : "Available now"}</small></button>`;
      })
      .join("");
    const d = (V[S.vol] || {}).d || {};
    const count = d.chapters
      ? d.chapters.length + " " + unit.toLowerCase() + "s"
      : "Coming soon";
    const sort = d.chapters
      ? `<button class="tp-sort" data-act="sort" aria-label="Reverse order"><span>${S.asc ? "Oldest first" : "Newest first"}</span><i class="ti ti-arrows-sort" aria-hidden="true"></i></button>`
      : "";
    return `<section class="tp-box" id="tpEps">
      <div class="tp-eh"><h2>${count}</h2>${sort}</div>
      <div class="tp-vols">${chips}</div>
      <div id="tpEpList">${chapterRows(S.vol)}</div></section>`;
  }

  function detailsBox() {
    const v = V[S.vol];
    const tog = N.map(
      (n) =>
        `<button class="${n === S.vol ? "on" : ""}" data-act="vol" data-n="${n}">Volume ${n}</button>`,
    ).join("");
    const short = stripTags(v.syn).replace(/</g, "&lt;");
    return `<section class="tp-box"><div class="tp-box-h">Details</div><div class="tp-box-b">
      <div class="tp-syn-tabs">${tog}</div>
      <p class="tp-syn tp-clamp">${short}</p>
      <button class="tp-more" type="button" data-act="more">See more <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      ${C.humanTranslated ? '<div class="tp-trust"><i class="ti ti-language" aria-hidden="true"></i><span>100% human-translated — no AI/machine translation used</span></div>' : ""}
      <div class="tp-tags">${(C.chips || []).map((c) => `<span class="tp-tag">${h(c)}</span>`).join("")}</div>
    </div></section>`;
  }

  function creatorsBox() {
    const a = C.authors || [];
    if (!a.length) return "";
    return (
      `<section class="tp-box"><div class="tp-box-h">${a.length} Creator${a.length > 1 ? "s" : ""}</div>` +
      a
        .map(
          (x) =>
            `<div class="tp-person"><div class="tp-av">${x[1].charAt(0)}</div><div><b>${x[1]}</b><small>${x[0]}</small></div></div>`,
        )
        .join("") +
      `</section>`
    );
  }

  function trailerBox() {
    if (!C.trailer) return "";
    return `<section class="tp-box"><div class="tp-box-h">Official trailer</div>
      <video class="tp-video" autoplay muted loop playsinline controls poster="${V[N[0]].cover}"><source src="${C.trailer}" type="video/mp4"></video></section>`;
  }

  /* retailersBox() removed: only the official Crossed Hearts website is offered. */

  function printBox(main) {
    if (!hasPrint) return "";
    const rows = [];

    // "View more" button -> official Crossed Hearts shop page (new tab)
    const viewBtn = (url) => {
      if (url && /^https?:/.test(url))
        return `<a class="tp-get tp-shop" href="${url}" target="_blank" rel="noopener noreferrer">View more</a>`;
      return `<a class="tp-get" href="${printLink}">View more</a>`;
    };

    N.forEach((n) => {
      const v = V[n],
        p = v.p;
      if (!p) return;
      const when = p.pre ? "Pre-order · " + (v.pd || "TBA") : "Available now";
      rows.push(
        `<div class="tp-pe"><img src="${p.std.cover || v.cover}" alt="Vol ${n} paperback" loading="lazy"><div><b>Paperback</b>Vol. ${n} · Standard · ${usd(p.std.price)}<br>${when}</div>${viewBtn(p.std.url)}</div>`,
      );
      if (p.ltd) {
        const fktlSoldOut = C.id === "fktl" && p.ltd.out;
        const ltdWhen = fktlSoldOut ? "Sold out" : when;
        const ltdPrice = fktlSoldOut
          ? ""
          : " · " + (p.ltd.out ? "Sold out" : usd(p.ltd.price));
        rows.push(
          `<div class="tp-pe"><img src="${p.ltd.cover || v.cover}" alt="Vol ${n} ${q(p.ltd.name)}" loading="lazy"><div><b>${p.ltd.name}</b>Vol. ${n} · Limited${ltdPrice}<br>${ltdWhen}</div>${viewBtn(p.ltd.url)}</div>`,
        );
      }
    });
    if (C.bundle) {
      const b = C.bundle;
      rows.push(
        `<div class="tp-pe bundle"><img src="${b.cover || V[N[0]].cover}" alt="${q(b.name)}" loading="lazy"><div><b>${b.name}</b>${b.desc} · ${usd(b.price)}<br>${b.pre ? "Pre-order" : "Available now"}</div>${viewBtn(b.url)}</div>`,
      );
    }
    const note = main
      ? `<div class="tp-note">"View more" opens the official Crossed Hearts shop page for that edition.</div>`
      : "";
    return rows.length
      ? `<section class="tp-box${main ? " tp-print-main" : ""}" id="tpPrint"><div class="tp-box-h">Print editions</div>${rows.join("")}${note}</section>`
      : "";
  }

  function charsSection() {
    const ch = chars();
    if (!ch.length) return "";
    return (
      `<section class="tp-chars"><h2>Characters</h2><div class="tp-char-row">` +
      ch
        .map(
          (c, i) =>
            `<div class="tp-char${c.image ? "" : " tp-noart"}" role="button" tabindex="0" data-act="cast" data-i="${i}">${pgDiv(c.bg)}${artImg(c)}<b class="tp-ini">${initial(c.name)}</b><div class="card"><b>${h(c.name)}</b><span>${h(c.bio)}</span></div></div>`,
        )
        .join("") +
      `</div></section>`
    );
  }

  /* header widget: fanned "book pages" with the characters standing out of them */
  function castWidget() {
    const list = chars();
    if (!list.length) return "";
    const n = Math.min(list.length, 3),
      mid = (n - 1) / 2,
      step = n === 2 ? 62 : 50;
    const cards = list
      .slice(0, n)
      .map(
        (c, k) =>
          `<div class="tp-pcard${c.image ? "" : " tp-noart"}" data-act="cast" data-i="${k}" style="--x:${((k - mid) * step).toFixed(0)}px;--r:${((k - mid) * 8).toFixed(0)}deg;z-index:${k + 1}">${pgDiv(c.bg)}${artImg(c)}<b class="tp-ini">${initial(c.name)}</b><span class="tp-pname">${h(firstName(c.name))}</span></div>`,
      )
      .join("");
    return `<div class="tp-cast" role="button" tabindex="0" data-act="cast" data-i="0" aria-label="Meet the characters"><div class="tp-cast-cards">${cards}</div><p class="tp-cast-t"><i class="ti ti-heart-filled" aria-hidden="true"></i> Meet the cast <i class="ti ti-chevron-right" aria-hidden="true"></i></p></div>`;
  }

  /* digital titles save to the reader's Library; print-only titles just link out to the print store (View more) */
  const BOOKMARK = (on) =>
    `<svg viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  const libInner = (on) =>
    BOOKMARK(on) +
    "<span>" +
    (on ? "In library" : "Add to library") +
    "</span>";
  const inLib = () =>
    typeof chIsInSeriesLib === "function" && chIsInSeriesLib(C.id);
  function saveBtn() {
    if (!hasDigital)
      return `<a class="tp-b tp-viewmore" href="${typeof PRINT_URL !== "undefined" ? PRINT_URL : "https://thecrossedhearts.com/"}" target="_blank" rel="noopener">View more</a>`;
    const on = inLib();
    return `<button type="button" class="tp-b tp-lib${on ? " inlib" : ""}" id="lib-${C.id}" data-act="lib" aria-pressed="${on}">${libInner(on)}</button>`;
  }
  function libPaint() {
    document.querySelectorAll(".tp-lib").forEach((b) => {
      const on = inLib();
      b.classList.toggle("inlib", on);
      b.setAttribute("aria-pressed", on);
      b.innerHTML = libInner(on);
    });
  }

  /* The "lead" reading button (digital titles only):
       saved progress          -> Resume reading
       Ch.1 is readable        -> Read Ch.1 for free
       nothing released yet    -> "Digital coming soon" (disabled) */
  function leadBtn(bar) {
    if (!hasDigital) return "";
    const p = progress();
    if (p) {
      const chTxt = p.ch ? " · " + unit + " " + h(p.ch) : "";
      return `<a class="tp-b pri tp-resume" href="${q(p.url)}">▶ ${bar ? "Resume" : "Resume reading"}${chTxt}</a>`;
    }
    if (freeUrl)
      return `<a class="tp-b pri" href="${freeUrl}">${bar ? "Read Ch.1 free" : "Read Ch.1 for free"}</a>`;
    return `<button type="button" class="tp-b pri tp-soonbtn" disabled aria-disabled="true"><i class="ti ti-clock" aria-hidden="true"></i>${bar ? "Digital soon" : "Digital coming soon"}</button>`;
  }

  function cta(bar) {
    let h = "";
    const lead = leadBtn(bar);
    h += lead;
    if (freeUrl || progress()) {
      if (buyable.length)
        h += `<button class="tp-b" data-act="jump" data-t="tpUnlock">Unlock</button>`;
    } else if (buyable.length) {
      /* not readable yet: pre-order stays available next to "Coming soon" */
      const first = V[buyable[0]].d.pre;
      h += `<button class="tp-b${lead ? "" : " pri"}" data-act="jump" data-t="tpUnlock">${first ? "Pre-Order" : "Unlock"}</button>`;
    }
    if (
      (hasPrint &&
        (!(freeUrl || progress()) || !bar) &&
        document.getElementById("tpPrint") !== null) ||
      (hasPrint && printBox())
    )
      h += `<button class="tp-b${lead || buyable.length ? "" : " pri"}" data-act="jump" data-t="tpPrint">Print editions</button>`;
    if (upcoming.length) h += bellBtn(upcoming[0], "tp-b");
    return h;
  }

  /* two-line description under the title (set `blurb` in the config, otherwise
     it is taken from the Volume 1 synopsis); the arrow opens "See more" */
  function blurbHTML() {
    const t = stripTags(C.blurb || (V[N[0]] || {}).syn).replace(/</g, "&lt;");
    if (!t) return "";
    return `<p class="tp-blurb" role="button" tabindex="0" data-act="more"><span>${t}</span><i class="ti ti-chevron-right" aria-hidden="true"></i></p>`;
  }

  function head() {
    return `<div class="tp-crumb"><a href="index.html">Home</a><span>›</span><a href="${C.crumb[1]}">${C.crumb[0]}</a><span>›</span><b>${plain(C.name)}</b></div>
      <div class="tp-banner">${C.banner ? `<img src="${C.banner}" alt="" onerror="this.remove()">` : ""}</div>
      <div class="tp-headrow">
        <div class="tp-cover"><img id="tpCover" src="${V[S.vol].cover}" alt="${q(C.name)} cover"><span class="tp-fmt">${!hasDigital ? "Print" : hasPrint ? "Digital + Print" : "Digital"}</span></div>
        <div class="tp-hi${chars().length ? " has-cast" : ""}">
          <h1>${plain(C.title || C.name)}</h1>
          <div class="tp-meta"><span class="ok">● ${status}</span><span>·</span><span>${imprint}</span></div>
          ${blurbHTML()}
          <div class="tp-rate" id="tpRate"><span class="st">☆☆☆☆☆</span><a href="#tpReviews" class="tp-rate-t" data-act="torev">No ratings yet</a> · 0 purchases</div>
          <div class="tp-cta">${cta(false)}${saveBtn()}</div>
          ${castWidget()}
        </div>
      </div>
      <div class="tp-tabs" role="tablist"><button class="on" data-act="tab" data-t="eps">${hasCh ? unit + "s" : "Overview"}</button><button data-act="tab" data-t="info">Info</button></div>`;
  }

  function sideHTML() {
    /* digital titles keep the print editions in the sidebar;
       print-only titles show them in the main column instead (see page()) */
    return (
      creatorsBox() +
      detailsBox() +
      trailerBox() +
      (hasDigital ? printBox() : "")
    );
  }

  /* ---- release notifications (push + in-browser) ---- */
  const NK = "ch_notify";
  const nApi = () => (typeof CH_API_URL !== "undefined" ? CH_API_URL : "");
  const nGet = () => {
    try {
      return JSON.parse(localStorage.getItem(NK) || "{}");
    } catch (e) {
      return {};
    }
  };
  const nSave = (o) => {
    try {
      localStorage.setItem(NK, JSON.stringify(o));
    } catch (e) {}
  };
  const nKey = (n) => C.id + ":" + n;
  const nOn = (n) => !!(nGet().vols || {})[nKey(n)];
  const nToast = (m, t) => {
    if (typeof showToast === "function") showToast(m, t || "success");
  };
  const BELL_T = (on) =>
    on ? "Notifications on: tap to turn off" : "Notify me when it releases";
  function bellBtn(n) {
    const on = nOn(n);
    return `<button type="button" class="tp-wish tp-notify tp-bell${on ? " on" : ""}" data-act="notify" data-n="${n}" title="${BELL_T(on)}" aria-label="${BELL_T(on)}"><i class="ti ${on ? "ti-bell-ringing" : "ti-bell"}" aria-hidden="true"></i></button>`;
  }
  function nPaint() {
    document.querySelectorAll('[data-act="notify"]').forEach((b) => {
      const on = nOn(+b.dataset.n);
      b.classList.toggle("on", on);
      b.title = BELL_T(on);
      b.setAttribute("aria-label", BELL_T(on));
      b.querySelector("i").className =
        "ti " + (on ? "ti-bell-ringing" : "ti-bell");
    });
  }
  const nB64 = (b) => {
    const pad = "=".repeat((4 - (b.length % 4)) % 4);
    const raw = atob((b + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };
  async function nPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
      return null;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const r = await fetch(nApi() + "/notifications/vapid-key");
        const { key } = await r.json();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: nB64(key),
        });
      }
      return sub;
    } catch (e) {
      console.warn("Push unavailable:", e.message || e);
      return null;
    }
  }
  async function nShow(title, body, n) {
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;
    const opt = {
      body,
      icon: (V[n] || {}).cover,
      tag: "ch-" + nKey(n),
      data: { url: location.href },
    };
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) return reg.showNotification(title, opt);
    } catch (e) {}
    try {
      new Notification(title, opt);
    } catch (e) {}
  }
  function nSend(path, body) {
    return fetch(nApi() + "/notifications/" + path, {
      method: "POST",
      headers:
        typeof chAuthHeaders === "function"
          ? chAuthHeaders()
          : { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e) => console.warn("Notify sync failed:", e.message || e));
  }
  async function nEnable(n, general) {
    let perm = "unsupported";
    if ("Notification" in window)
      perm =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
    const st = nGet();
    st.vols = st.vols || {};
    st.vols[nKey(n)] = true;
    if (general) st.general = true;
    nSave(st);
    const sub = perm === "granted" ? await nPush() : null;
    nSend("subscribe", {
      titleId: C.id,
      titleName: plain(C.name),
      volume: n,
      releaseDate: V[n].dd || null,
      general: !!general,
      email: typeof CH_USER !== "undefined" && CH_USER ? CH_USER.email : null,
      subscription: sub ? sub.toJSON() : null,
    });
    closeModal();
    nPaint();
    if (perm === "granted") {
      nToast(
        "You're on the list! We'll notify you when Volume " + n + " is out.",
      );
      nShow(
        "You're on the list!",
        plain(C.name) +
          " Volume " +
          n +
          " - we'll let you know the moment it releases.",
        n,
      );
    } else {
      nToast(
        "Saved! Allow notifications in your browser to receive alerts.",
        "error",
      );
    }
  }
  async function nDisable(n) {
    const st = nGet();
    if (st.vols) delete st.vols[nKey(n)];
    nSave(st);
    let endpoint = null;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg && (await reg.pushManager.getSubscription());
      endpoint = sub && sub.endpoint;
    } catch (e) {}
    nSend("unsubscribe", { titleId: C.id, volume: n, endpoint });
    nPaint();
    nToast("Notifications turned off for Volume " + n + ".");
  }
  function nAsk(n) {
    const gen = nGet().general !== false;
    openModal(
      `<div class="tp-nf"><i class="ti ti-bell-ringing" aria-hidden="true"></i>
        <h3>Get notified</h3>
        <p>We'll send you a notification as soon as <b>Volume ${n}</b> of <b>${h(plain(C.name))}</b> is released${V[n].dd ? " (" + h(V[n].dd) + ")" : ""}.</p>
        <label class="tp-nf-ck"><input type="checkbox" id="tpNfGen"${gen ? " checked" : ""}> Also send me Crossed Hearts updates: new releases, sales and announcements</label>
        <button type="button" class="tp-b pri" data-act="nconfirm" data-n="${n}">Turn on notifications</button>
        <small>You can turn them off at any time.</small></div>`,
      "tp-nfm",
    );
  }
  /* if a volume the reader subscribed to has since been released, tell them */
  function nCheckReleased() {
    N.forEach((n) => {
      if (nOn(n) && !upcoming.includes(n)) {
        const st = nGet();
        delete st.vols[nKey(n)];
        nSave(st);
        nToast("Volume " + n + " of " + plain(C.name) + " is out now!");
        nShow(
          "Volume " + n + " is out now!",
          plain(C.name) + " Volume " + n + " has been released.",
          n,
        );
      }
    });
    nPaint();
  }

  /* ---- reader ratings & comments (uses the review API in script.js) ---- */
  function reviewsBox() {
    return `<section class="tp-box tp-rv" id="tpReviews">
      <div class="tp-box-h">Ratings &amp; comments</div>
      <div class="tp-box-b">
        <div class="tp-rv-sum" id="tpRvSum"></div>
        <div class="tp-rv-form" id="tpRvForm">
          <div class="tp-rv-lbl">Your rating</div>
          <div class="tp-rv-stars" id="tpRvStars" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="tp-rv-s" data-act="rvstar" data-n="${n}" role="radio" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</div>
          <div class="tp-rv-lbl">Your comment <span>(optional)</span></div>
          <textarea id="tpRvText" maxlength="600" placeholder="What did you think of this title?"></textarea>
          <div class="tp-rv-row"><span id="tpRvCount">0 / 600</span><button type="button" class="tp-b pri" id="tpRvSubmit" data-act="rvsubmit">Submit</button></div>
        </div>
        <div class="tp-rv-list" id="tpRvList"></div>
      </div>
    </section>`;
  }
  const RV = { rating: 0 };
  const rvStars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  function rvPaint(n) {
    document
      .querySelectorAll("#tpRvStars .tp-rv-s")
      .forEach((b, i) => b.classList.toggle("on", i < n));
  }
  function rvRender(reviews) {
    const list = reviews || [];
    const avg = list.length
      ? list.reduce((t, r) => t + r.rating, 0) / list.length
      : 0;
    const txt = list.length
      ? avg.toFixed(1) +
        " from " +
        list.length +
        " rating" +
        (list.length > 1 ? "s" : "")
      : "No ratings yet";
    const rate = $("tpRate");
    if (rate) {
      rate.querySelector(".st").textContent = rvStars(Math.round(avg));
      rate.querySelector(".tp-rate-t").textContent = txt;
    }
    if ($("tpRvSum"))
      $("tpRvSum").innerHTML = list.length
        ? `<b>${avg.toFixed(1)}</b><span class="st">${rvStars(Math.round(avg))}</span><small>${list.length} review${list.length > 1 ? "s" : ""}</small>`
        : `<small>No reviews yet. Be the first!</small>`;
    if ($("tpRvList"))
      $("tpRvList").innerHTML = list
        .slice(0, 20)
        .map(
          (r) =>
            `<div class="tp-rv-item"><div class="tp-rv-top"><span class="st">${rvStars(r.rating)}</span><b>${h(r.name || "Reader")}</b><small>${h(r.date || "")}</small></div>${r.text ? `<p>${h(r.text)}</p>` : ""}</div>`,
        )
        .join("");
  }
  async function rvLoad() {
    try {
      rvRender(await chFetchReviews(C.id));
    } catch (e) {
      rvRender(typeof chGetReviews === "function" ? chGetReviews(C.id) : []);
    }
  }
  async function rvSubmit() {
    if (typeof CH_USER === "undefined" || !CH_USER) {
      if (typeof openAuth === "function") openAuth("in");
      if (typeof showToast === "function")
        showToast("Sign in to leave a rating.", "error");
      return;
    }
    if (!RV.rating) {
      if (typeof showToast === "function")
        showToast("Please pick a star rating.", "error");
      return;
    }
    const btn = $("tpRvSubmit");
    btn.disabled = true;
    try {
      if (await chSaveReview(C.id, RV.rating, $("tpRvText").value)) {
        $("tpRvText").value = "";
        $("tpRvCount").textContent = "0 / 600";
        RV.rating = 0;
        rvPaint(0);
        await rvLoad();
      }
    } catch (e) {
      if (typeof showToast === "function")
        showToast(e.message || "Could not save your review.", "error");
    }
    btn.disabled = false;
  }
  function initReviews() {
    if (!$("tpReviews")) return;
    const ta = $("tpRvText");
    ta.addEventListener("input", () => {
      $("tpRvCount").textContent = ta.value.length + " / 600";
    });
    const st = $("tpRvStars");
    st.addEventListener("mouseover", (e) => {
      const b = e.target.closest(".tp-rv-s");
      if (b) rvPaint(+b.dataset.n);
    });
    st.addEventListener("mouseleave", () => rvPaint(RV.rating));
    rvLoad();
  }

  function page() {
    const mainCol = hasDigital
      ? `<section class="tp-box"><button class="tp-row-btn" data-act="login"><i class="ti ti-lock-open" aria-hidden="true"></i><span>Sign in to keep your purchases in your library</span><i class="ti ti-chevron-right" aria-hidden="true"></i></button></section>
        ${cadenceBox()}${unlockBox()}${episodesBox()}${reviewsBox()}`
      : `${cadenceBox()}${printBox(true)}${reviewsBox()}`;
    return (
      head() +
      `<div class="tp-cols">
      <div class="tp-main">
        ${mainCol}
      </div>
      <aside class="tp-side" id="tpSide">${sideHTML()}</aside>
    </div>${charsSection()}
    <div class="tp-bar">${cta(true)}</div>`
    );
  }

  function refresh() {
    $("tpCover").src = V[S.vol].cover;
    if ($("tpEps")) $("tpEps").outerHTML = episodesBox();
    $("tpSide").innerHTML = sideHTML();
  }

  /* ---- popups ---- */
  let ov = null;
  let castI = 0;
  function closeModal() {
    if (ov) {
      ov.remove();
      ov = null;
    }
    document.body.classList.remove("tp-lock");
  }
  function openModal(inner, cls, kind) {
    closeModal();
    ov = document.createElement("div");
    ov.className = "tp-ov";
    ov.dataset.kind = kind || "";
    ov.innerHTML = `<div class="tp-md ${cls || ""}" role="dialog" aria-modal="true"><button class="tp-mx" type="button" data-act="mclose" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button><div class="tp-mbody">${inner}</div></div>`;
    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeModal();
    });
    ($("tp") || document.body).appendChild(ov);
    document.body.classList.add("tp-lock");
    return ov.querySelector(".tp-mbody");
  }
  function setModal(kind, inner, cls) {
    if (ov && ov.dataset.kind === kind)
      ov.querySelector(".tp-mbody").innerHTML = inner;
    else openModal(inner, cls, kind);
  }

  /* --- See more: summary + series information + keywords + recommendations --- */
  const SKIP = /^(age rating|imprint|publisher|language)$/i;
  function volRows(v) {
    const out = [];
    if (v.seeMoreHtml) {
      const re = /<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>/g;
      let m;
      while ((m = re.exec(v.seeMoreHtml)))
        out.push([stripTags(m[1]), stripTags(m[2])]);
    } else {
      out.push(
        ["Volume status", v.state || "—"],
        ["Pages", v.pages || "TBD"],
        ["Translator", v.translator || "TBD"],
      );
      if (C.released != null)
        out.push(["Volumes released", C.released + " of " + N.length]);
    }
    /* imprint / age rating / publisher / language are shown once, below */
    return out.filter((r) => r[0] && !SKIP.test(r[0]));
  }
  function recs() {
    const cat = window.CH_CATALOG;
    if (!Array.isArray(cat)) return [];
    const file = (u) =>
      String(u || "")
        .split("?")[0]
        .split("/")
        .pop()
        .toLowerCase();
    const seen = new Set(
      [file(C.page || C.id + ".html"), C.id + ".html"].map((x) =>
        x.toLowerCase(),
      ),
    );
    const mine = new Set((C.chips || []).map((x) => String(x).toLowerCase()));
    const crumb = String((C.crumb || [])[0] || "").toLowerCase();
    return cat
      .map((it) => {
        const g = String(it.genre || "")
          .split("·")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean);
        const score =
          g.filter((x) => mine.has(x)).length * 10 +
          (crumb && String(it.category || "").toLowerCase() === crumb ? 1 : 0);
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .filter((x) => {
        const f = file(x.it.url);
        if (!f || seen.has(f)) return false;
        seen.add(f);
        return true;
      })
      .slice(0, 8)
      .map((x) => ({
        url: x.it.url,
        cover: x.it.cover,
        title: String(x.it.title || "")
          .replace(/\s*\((print|digital)\)\s*$/i, "")
          .replace(/\s*Vol\.?\s*\d+\s*$/i, ""),
      }));
  }
  function showDetails(vol) {
    const nv = V[vol] ? vol : S.vol;
    const v = V[nv];
    const tabs =
      N.length > 1
        ? `<div class="tp-syn-tabs">${N.map((n) => `<button class="${n === nv ? "on" : ""}" data-act="mvol" data-n="${n}">Volume ${n}</button>`).join("")}</div>`
        : "";
    const rows = [];
    (C.authors || []).forEach((a) => rows.push([a[0], a[1]]));
    rows.push(["Imprint", imprint]);
    if (C.agerating) rows.push(["Age rating", C.agerating]); // age rating appears once
    rows.push(
      ["Publisher", "Crossed Hearts"],
      ["Language", "English"],
      [
        "Format",
        !hasDigital ? "Print" : hasPrint ? "Digital + Print" : "Digital",
      ],
      ["Status", status],
    );
    volRows(v).forEach((r) => rows.push(r));
    const kw = (C.chips || []).map((c) => `<span>${h(c)}</span>`).join("");
    const rc = recs();
    const html = `<div class="tp-dm">
      <div class="tp-mcard"><h4>Summary</h4>${tabs}<p class="tp-msyn">${v.syn || ""}</p>${C.humanTranslated ? '<div class="tp-trust"><i class="ti ti-language" aria-hidden="true"></i><span>100% human-translated — no AI/machine translation used</span></div>' : ""}</div>
      <div class="tp-mcard"><h4>Series information</h4>${rows.map((r) => `<div class="tp-ir"><span>${h(r[0])}</span><span>${h(r[1])}</span></div>`).join("")}</div>
      ${kw ? `<div class="tp-mcard"><h4>Keywords</h4><div class="tp-kw">${kw}</div></div>` : ""}
      ${rc.length ? `<div class="tp-mcard"><h4>If you enjoyed ${h(plain(C.name))}</h4><div class="tp-recs">${rc.map((r) => `<a class="tp-rec" href="${q(r.url)}"><img src="${q(r.cover)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><b>${h(r.title)}</b></a>`).join("")}</div></div>` : ""}
    </div>`;
    setModal("details", html, "tp-md-m");
  }

  /* --- Bonus wallpaper preview --- */
  function showBonus() {
    const B = C.bonus;
    if (!B) return;
    const a = buyable[0],
      b = buyable[buyable.length - 1];
    const html = `<div class="tp-bn"><h3>${h(B.label || "Bonus wallpaper")}</h3>
      <p>${a !== b ? 'Included free when you unlock <b>Everything</b> <span style="white-space:nowrap">(Volumes ' + a + "–" + b + ")</span>." : "Included free with the digital edition."}</p>
      <div class="tp-bn-img">${B.img ? `<img src="${q(B.img)}" alt="${q(B.label || "Bonus wallpaper")}" onerror="this.parentNode.classList.add('miss');this.remove()">` : ""}<span class="tp-bn-miss">Wallpaper preview coming soon</span></div></div>`;
    openModal(html, "tp-md-s", "bonus");
  }

  /* --- Character art engine: white paper -> transparent, plus a sticker outline ---
     Use normal line-art on a WHITE background (or an already transparent PNG).
     The browser removes the white, trims the empty margins, cuts the bottom flat
     (so slanted page-crop edges disappear) and adds a white + thin dark outline.
     The figure then stands flush on its frame and pops out of the top / sides.
     full:true  = whole figure (feet visible): no flat cut, outline all around
     raw:true   = use the image exactly as it is */
  const cutCache = new Map();
  function stickerize(im, full) {
    const sc = Math.min(1, 900 / im.naturalHeight);
    const w = Math.max(1, Math.round(im.naturalWidth * sc));
    const ht = Math.max(1, Math.round(im.naturalHeight * sc));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = ht;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(im, 0, 0, w, ht);
    const id = g.getImageData(0, 0, w, ht);
    const d = id.data;
    const A = (x, y) => d[(y * w + x) * 4 + 3];
    const hasAlpha =
      A(0, 0) < 200 ||
      A(w - 1, 0) < 200 ||
      A(0, ht - 1) < 200 ||
      A(w - 1, ht - 1) < 200;

    /* 1) white paper touching the border -> transparent */
    if (!hasAlpha) {
      const bg = new Uint8Array(w * ht);
      const st = [];
      const push = (x, y) => {
        const i = y * w + x;
        if (bg[i]) return;
        const p = i * 4;
        if (d[p] > 228 && d[p + 1] > 228 && d[p + 2] > 228) {
          bg[i] = 1;
          st.push(i);
        }
      };
      for (let x = 0; x < w; x++) {
        push(x, 0);
        push(x, ht - 1);
      }
      for (let y = 0; y < ht; y++) {
        push(0, y);
        push(w - 1, y);
      }
      while (st.length) {
        const i = st.pop(),
          x = i % w,
          y = (i / w) | 0;
        if (x > 0) push(x - 1, y);
        if (x < w - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < ht - 1) push(x, y + 1);
      }
      for (let i = 0; i < bg.length; i++) if (bg[i]) d[i * 4 + 3] = 0;
      g.putImageData(id, 0, 0);
    }

    /* 2) trim the empty margins and find where every column of the art ends */
    const T = 40;
    const last = new Int32Array(w).fill(-1);
    let minX = w,
      maxX = -1,
      minY = ht,
      maxY = -1;
    for (let x = 0; x < w; x++) {
      for (let y = ht - 1; y >= 0; y--) {
        if (A(x, y) > T) {
          last[x] = y;
          break;
        }
      }
      if (last[x] >= 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (last[x] > maxY) maxY = last[x];
      }
    }
    if (maxY < 0) return Promise.resolve(null);
    for (let y = 0; y < ht && minY === ht; y++)
      for (let x = minX; x <= maxX; x++)
        if (A(x, y) > T) {
          minY = y;
          break;
        }

    /* 3) standing figure: cut the bottom flat (removes slanted / uneven page-crop edges) */
    let cut = maxY;
    if (!full) {
      const span = maxY - minY;
      const cols = [];
      for (let x = minX; x <= maxX; x++)
        if (last[x] >= minY + span * 0.6) cols.push(last[x]);
      cols.sort((p, q2) => p - q2);
      if (cols.length)
        cut = Math.max(
          cols[Math.floor(cols.length * 0.03)],
          maxY - span * 0.06,
        );
      cut = Math.round(cut);
    }
    const bw = maxX - minX + 1,
      bh = cut - minY + 1;
    const art = document.createElement("canvas");
    art.width = bw;
    art.height = bh;
    art.getContext("2d").drawImage(c, minX, minY, bw, bh, 0, 0, bw, bh);

    /* 4) white sticker border + thin dark outline */
    const R = Math.max(3, Math.round(bh * 0.012)),
      R2 = Math.max(1, Math.round(bh * 0.004)),
      pad = R + R2 + 2;
    const out = document.createElement("canvas");
    out.width = bw + pad * 2;
    out.height = bh + pad * 2;
    const o = out.getContext("2d");
    const sil = (col) => {
      const s2 = document.createElement("canvas");
      s2.width = bw;
      s2.height = bh;
      const k = s2.getContext("2d");
      k.drawImage(art, 0, 0);
      k.globalCompositeOperation = "source-in";
      k.fillStyle = col;
      k.fillRect(0, 0, bw, bh);
      return s2;
    };
    const ring = (s2, r) => {
      for (let i = 0; i < 40; i++) {
        const a2 = (i / 40) * Math.PI * 2;
        o.drawImage(s2, pad + Math.cos(a2) * r, pad + Math.sin(a2) * r);
      }
    };
    ring(sil("#1a1118"), R + R2);
    ring(sil("#ffffff"), R);
    o.drawImage(art, pad, pad);

    /* 5) standing figure: drop the outline under the feet so the cut edge sits flush on the frame */
    let fin = out;
    if (!full) {
      fin = document.createElement("canvas");
      fin.width = out.width;
      fin.height = out.height - pad;
      fin.getContext("2d").drawImage(out, 0, 0);
    }
    return new Promise((res) =>
      fin.toBlob((b2) => res(b2 ? URL.createObjectURL(b2) : null), "image/png"),
    );
  }
  function cutout(src, full) {
    const key = src + (full ? "|full" : "");
    if (!cutCache.has(key))
      cutCache.set(
        key,
        new Promise((resolve) => {
          const im = new Image();
          im.onload = () => {
            try {
              stickerize(im, full).then(
                (u) => resolve(u ? { url: u } : { url: src, raw: true }),
                () => resolve({ url: src, raw: true }),
              );
            } catch (e) {
              resolve({ url: src, raw: true });
            }
          };
          im.onerror = () => resolve(null);
          im.src = src;
        }),
      );
    return cutCache.get(key);
  }
  function hydrateCast(scope) {
    (scope || document).querySelectorAll("img[data-cut]").forEach((img) => {
      if (img.dataset.done) return;
      img.dataset.done = "1";
      cutout(img.getAttribute("data-cut"), img.dataset.full === "1").then(
        (r) => {
          if (!r) {
            if (img.parentNode) img.parentNode.classList.add("tp-noart");
            img.remove();
            return;
          }
          if (r.raw) img.classList.add("tp-rawimg");
          img.onload = () => img.classList.add("on");
          img.src = r.url;
        },
      );
    });
  }

  /* --- Character profiles popup --- */
  function showCast(i) {
    const list = chars();
    if (!list.length) return;
    castI = ((i % list.length) + list.length) % list.length;
    const c = list[castI];
    const html = `<div class="tp-cm">
      <div class="tp-cm-pic${c.image ? "" : " tp-noart"}">${pgDiv(c.bg)}${artImg(c)}<b class="tp-ini">${initial(c.name)}</b><span class="tp-cm-n">${String(castI + 1).padStart(2, "0")}<small>/${String(list.length).padStart(2, "0")}</small></span></div>
      <div class="tp-cm-info">
        ${list.length > 1 ? `<div class="tp-cm-tabs">${list.map((x, k) => `<button type="button" class="tp-cm-tab${k === castI ? " on" : ""}${x.image ? "" : " tp-noart"}" data-act="ctab" data-i="${k}" aria-label="${q(x.name)}">${pgDiv(x.bg)}${artImg(x)}<b class="tp-ini">${initial(x.name)}</b></button>`).join("")}</div>` : ""}
        ${c.role ? `<p class="tp-cm-role">${h(c.role)}</p>` : ""}
        <h3>${h(c.name)}</h3>
        <p class="tp-cm-bio">${h(c.bio)}</p>
        ${c.traits.length ? `<div class="tp-kw">${c.traits.map((t) => `<span>${h(t)}</span>`).join("")}</div>` : ""}
        ${list.length > 1 ? `<div class="tp-cm-nav"><button type="button" data-act="cnav" data-d="-1"><i class="ti ti-chevron-left" aria-hidden="true"></i> Prev</button><button type="button" data-act="cnav" data-d="1">Next <i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>` : ""}
      </div></div>`;
    setModal("cast", html, "tp-md-wide tp-md-cast");
    if (ov) hydrateCast(ov);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return closeModal();
    if (ov && ov.dataset.kind === "cast") {
      if (e.key === "ArrowRight") showCast(castI + 1);
      if (e.key === "ArrowLeft") showCast(castI - 1);
    }
    const t = e.target;
    if (
      (e.key === "Enter" || e.key === " ") &&
      t &&
      t.matches &&
      t.matches('[role="button"][data-act]')
    ) {
      e.preventDefault();
      t.click();
    }
  });

  /* ---- actions ---- */
  function addVol(n) {
    const d = V[n].d;
    chAddDigitalToCart(
      d.key,
      "full",
      "Volume " + n + " - Full Volume",
      d.price,
      V[n].cover,
    );
  }
  const actions = {
    vol(el) {
      S.vol = +el.dataset.n;
      refresh();
    },
    sort() {
      S.asc = !S.asc;
      $("tpEps").outerHTML = episodesBox();
    },
    acc(el) {
      el.closest(".tp-acc").classList.toggle("open");
    },
    addvol(el) {
      addVol(+el.dataset.n);
    },
    addall() {
      buyable.forEach(addVol);
      if (typeof showToast === "function")
        showToast("All volumes added to cart!", "success");
    },
    buych(el) {
      const n = +el.dataset.n,
        i = +el.dataset.i,
        d = V[n].d;
      const id = (d.cid || "ch") + (i + 1),
        label = unit + " " + (i + 1) + " - " + d.chapters[i];
      if (chapterMode === "unlock" && typeof initPurchase === "function")
        initPurchase(d.key, id, label, d.cp);
      else chAddDigitalToCart(d.key, id, label, d.cp, V[n].cover);
    },
    jump(el) {
      const t = el.dataset.t;
      if (hasDigital) $("tp").dataset.tab = t === "tpPrint" ? "info" : "eps";
      const target = $(t);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    tab(el) {
      $("tp").dataset.tab = el.dataset.t;
      document
        .querySelectorAll(".tp-tabs button")
        .forEach((b) => b.classList.toggle("on", b === el));
      window.scrollTo({
        top: document.querySelector(".tp-tabs").offsetTop - 80,
        behavior: "smooth",
      });
    },
    notify(el) {
      const n = +el.dataset.n;
      if (nOn(n)) nDisable(n);
      else nAsk(n);
    },
    nconfirm(el) {
      const g = document.getElementById("tpNfGen");
      nEnable(+el.dataset.n, g ? g.checked : true);
    },
    rvstar(el) {
      RV.rating = +el.dataset.n;
      rvPaint(RV.rating);
    },
    rvsubmit() {
      rvSubmit();
    },
    torev() {
      const t = $("tpReviews");
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    login() {
      if (typeof openAuth === "function") openAuth("in");
    },
    lib() {
      if (chToggleSeriesLib(C.id) !== null) {
        libPaint();
        libSync();
      }
    },
    more() {
      showDetails(S.vol);
    },
    mvol(el) {
      showDetails(+el.dataset.n);
    },
    bonus() {
      showBonus();
    },
    cast(el) {
      showCast(+el.dataset.i || 0);
    },
    ctab(el) {
      showCast(+el.dataset.i || 0);
    },
    cnav(el) {
      showCast(castI + (+el.dataset.d || 1));
    },
    mclose() {
      closeModal();
    },
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el && actions[el.dataset.act]) actions[el.dataset.act](el);
  });

  /* ---- reading progress API ----
     Call this from your reader page whenever a chapter is opened, e.g.
       chSaveProgress("gaze", { vol: 1, ch: 3, url: location.href });
     The series page will then show "Resume reading" instead of "Read Ch.1". */
  window.chSaveProgress = function (titleId, data) {
    if (!titleId || !data || !data.url) return;
    const all = pAll();
    all[titleId] = {
      vol: data.vol || 1,
      ch: data.ch || 1,
      url: String(data.url),
      t: Date.now(),
    };
    try {
      localStorage.setItem(PK, JSON.stringify(all));
    } catch (e) {}
    syncOpened(titleId, data.ch, data.url);
  };

  /* ---- backend sync: opened chapters are stored per account ---- */
  const hasToken = () => !!sessionStorage.getItem("ch_token");
  function withData(fn) {
    if (window.CHData) return fn(window.CHData);
    if (!window.__chDataLoading) {
      window.__chDataLoading = new Promise((ok, no) => {
        const s = document.createElement("script");
        s.src = "ch-data.js";
        s.onload = ok;
        s.onerror = no;
        document.head.appendChild(s);
      });
    }
    return window.__chDataLoading.then(() => fn(window.CHData));
  }
  function parseRead(url) {
    try {
      const u = new URL(url, location.href);
      if (!/(^|\/)reader(\.html)?\/?$/i.test(u.pathname)) return null;
      return {
        title: u.searchParams.get("title") || C.id,
        ch: u.searchParams.get("ch") || "ch1",
        page: u.searchParams.get("page"),
      };
    } catch (e) {
      return null;
    }
  }
  function syncOpened(titleId, ch, url) {
    if (!hasToken()) return;
    const r = parseRead(url) || { title: titleId, ch: ch, page: 1 };
    withData((D) => D.progress.opened(r.title, r.ch, r.page)).catch(() => {});
  }
  /* click on any Read / Resume link: remember it locally AND on the server */
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="reader"]');
    if (!a || e.button !== 0) return;
    const r = parseRead(a.getAttribute("href"));
    if (!r) return;
    const num = parseInt(String(r.ch).replace(/\D/g, ""), 10) || 1;
    window.chSaveProgress(C.id, {
      vol: 1,
      ch: num,
      url: a.getAttribute("href"),
    });
  });
  /* on page load: bring the account's progress back (other device / cleared browser) */
  function restoreProgress() {
    if (!hasToken() || !hasDigital) return;
    withData((D) => D.progress.list(D.normTitle(C.id)))
      .then((rows) => {
        if (!rows || !rows.length) return;
        const r = rows[0]; /* newest first */
        const local = progress();
        if (local && local.t && new Date(r.lastReadAt).getTime() <= local.t)
          return;
        const D = window.CHData;
        const num = parseInt(String(r.chapterId).replace(/\D/g, ""), 10) || 1;
        const all = pAll();
        all[C.id] = {
          vol: 1,
          ch: num,
          url: D.readerUrl(r.titleId, r.chapterId, r.page),
          t: new Date(r.lastReadAt).getTime() || Date.now(),
        };
        try {
          localStorage.setItem(PK, JSON.stringify(all));
        } catch (e) {}
        const c1 = document.querySelector(".tp-cta");
        if (c1) c1.innerHTML = cta(false) + saveBtn();
        const c2 = document.querySelector(".tp-bar");
        if (c2) c2.innerHTML = cta(true);
        libPaint();
      })
      .catch(() => {});
  }

  window.chClearProgress = function (titleId) {
    const all = pAll();
    delete all[titleId || C.id];
    try {
      localStorage.setItem(PK, JSON.stringify(all));
    } catch (e) {}
  };

  /* ---- Add to library: also saved on the server for signed-in readers ---- */
  function libReq(method, path) {
    const hd =
      typeof chAuthHeaders === "function"
        ? chAuthHeaders()
        : { "Content-Type": "application/json" };
    return fetch(nApi() + "/saved" + path, { method, headers: hd })
      .then((r) => r.json())
      .catch(() => null);
  }
  const libId = () => encodeURIComponent(String(C.id).toLowerCase());
  function libSync() {
    if (!hasToken()) return;
    libReq(inLib() ? "POST" : "DELETE", "/" + libId());
  }
  /* on page load: make this browser and the account agree (works across devices) */
  async function libPull() {
    if (!hasToken() || !hasDigital) return;
    const r = await libReq("GET", "");
    const list = r && r.data && r.data.saved;
    if (!Array.isArray(list)) return;
    const onServer = list.some((x) => x.titleId === String(C.id).toLowerCase());
    if (onServer && !inLib()) {
      if (typeof chToggleSeriesLib === "function") {
        chToggleSeriesLib(C.id);
        libPaint();
      }
    } else if (!onServer && inLib()) {
      libReq("POST", "/" + libId());
    }
  }

  /* ---- init ---- */
  const root = $("tpRoot");
  if (!hasDigital) $("tp").dataset.tab = "all";
  root.innerHTML = page();
  hydrateCast(root);
  initReviews();
  libPaint();
  nCheckReleased();
  restoreProgress();
  libPull();
  /* print.html links here with "#print": land on the print editions */
  if (location.hash === "#print")
    setTimeout(() => actions.jump({ dataset: { t: "tpPrint" } }), 450);

  /* version check: DevTools > Console shows which files the page really loaded */
  const SP_VER =
    "4"; /* CSS version this JS expects (unchanged: v5 only adds JS + inline CSS) */
  try {
    $("tp").dataset.spVersion = SP_VER;
    const cssVer = getComputedStyle($("tp"))
      .getPropertyValue("--sp-ver")
      .replace(/["'\s]/g, "");
    console.info(
      "series-page.js v5 | series-page.css " +
        (cssVer ? "v" + cssVer : "NOT UPDATED"),
    );
    if (cssVer !== SP_VER)
      console.warn(
        "series-page.css is out of date: replace it with the v" +
          SP_VER +
          " file and hard-refresh (Ctrl+F5).",
      );
  } catch (e) {}
  try {
    renderAuthForm("in");
  } catch (e) {}
  if (localStorage.getItem("ch-theme") === "light")
    document.body.classList.add("light-mode");
  window.toggleTheme = function () {
    const l = document.body.classList.toggle("light-mode");
    localStorage.setItem("ch-theme", l ? "light" : "dark");
  };
  window.addEventListener(
    "scroll",
    function () {
      const b = $("backToTop");
      if (b) b.style.display = window.scrollY > 400 ? "flex" : "none";
    },
    { passive: true },
  );
})();
