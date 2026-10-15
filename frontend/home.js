(function () {
  const $ = (id) => document.getElementById(id);
  const DIG = DIGITAL_KEYS;

  /* Edit these two lists to change Trending / Highlights */
  const TRENDING = [
    "chigaya",
    "exec",
    "matchmaker",
    "allrounder",
    "gaze",
    "borrowing",
    "theking",
    "zombie",
    "raeliana",
    "timeisa",
  ];
  const HIGHLIGHTS = ["chigaya", "exec", "fairy", "raeliana", "borrowing"];
  const only = (list) => list.filter((k) => T[k] && isDigital(k));

  /* ---------- HERO ---------- */
  const HERO = DIG.filter((k) => T[k].bn).slice(0, 8);
  let heroI = 0,
    heroTimer = null;
  function heroBuild() {
    $("tpTrack").innerHTML = HERO.map((k, i) => {
      const r = T[k],
        u = openUrl(k);
      return `<a class="tp-slide${i ? "" : " on"}" href="${u}" data-go="${u}" aria-label="${esc(r.t)}">
        <img src="Images/${r.bn}" alt="${esc(r.t)}" ${i ? 'loading="lazy"' : ""} onerror="this.onerror=null;this.src='Images/${r.img}'" />
        <div class="tp-stext"><h2 title="${esc(r.t)}">${esc(shortTitle(r.t))}</h2><span>${esc(r.g)}</span></div>
      </a>`;
    }).join("");
    heroGo(0);
  }
  function heroGo(i) {
    const s = document.querySelectorAll(".tp-slide"),
      n = s.length;
    if (!n) return;
    heroI = (i + n) % n;
    s.forEach((el, k) => el.classList.toggle("on", k === heroI));
    $("tpNum").textContent = heroI + 1 + " / " + n;
  }
  function heroAuto() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => heroGo(heroI + 1), 5000);
  }
  function heroInit() {
    if (!HERO.length) {
      $("tpHero").hidden = true;
      return;
    }
    heroBuild();
    $("tpPrev").onclick = () => (heroGo(heroI - 1), heroAuto());
    $("tpNext").onclick = () => (heroGo(heroI + 1), heroAuto());
    const hero = $("tpHero");
    hero.addEventListener("mouseenter", () => clearInterval(heroTimer));
    hero.addEventListener("mouseleave", heroAuto);
    let x0 = null;
    hero.addEventListener(
      "touchstart",
      (e) => {
        x0 = e.touches[0].clientX;
        clearInterval(heroTimer);
      },
      { passive: true },
    );
    hero.addEventListener(
      "touchend",
      (e) => {
        if (x0 !== null) {
          const dx = e.changedTouches[0].clientX - x0;
          if (Math.abs(dx) > 40) heroGo(heroI + (dx < 0 ? 1 : -1));
        }
        x0 = null;
        heroAuto();
      },
      { passive: true },
    );
    heroAuto();
  }

  /* ---------- SECTION TILES ---------- */
  function tilesInit() {
    const n = (s) => DIG.filter((k) => sectionOf(k) === s).length;
    const tiles = [
      [
        "comics.html",
        "Comics",
        n("comics") + " digital series",
        "ti-layout-board",
        "#e0003c",
        "#8f0a29",
      ],
      [
        "manga.html",
        "Manga",
        n("manga") + " digital series",
        "ti-book-2",
        "#0080f5",
        "#2a3fa8",
      ],
      [
        "novel.html",
        "Novel",
        n("novel") + " digital series",
        "ti-notebook",
        "#e8651f",
        "#a8400f",
      ],
      [
        PRINT_URL,
        "Print",
        PRINT_ONLY_KEYS.length + " print-only titles",
        "ti-books",
        "#8b2d42",
        "#3d1220",
      ],
    ];
    $("catTiles").innerHTML = tiles
      .map(([h, t, s, ic, c1, c2]) => {
        const ext = isExt(h) ? ' target="_blank" rel="noopener"' : "";
        return `<a class="cat-tile" href="${h}"${ext} style="--c1:${c1};--c2:${c2}"><i class="ti ${ic}" aria-hidden="true"></i><strong>${t}</strong><small>${s}</small></a>`;
      })
      .join("");
  }

  const NEW = DIG.filter((k) => T[k].n);
  function trendingList() {
    const base = only(TRENDING);
    return base.concat(DIG.filter((k) => !base.includes(k))).slice(0, 10);
  }

  /* ---------- HIGHLIGHTS OF THE MONTH ---------- */
  function highlightsInit() {
    const list = only(HIGHLIGHTS),
      box = $("hlBox");
    if (!list.length) {
      box.hidden = true;
      return;
    }
    const month = new Date().toLocaleString("en-US", { month: "long" });
    $("hlMonth").textContent = month;
    let cur = 0;
    function show(i) {
      cur = i;
      const k = list[i],
        r = T[k],
        m = IMP[r.i],
        acc = m ? m[1] : "#c4647a",
        syn =
          synopsisOf(k) ||
          "Start reading the first chapter for free and see why readers keep coming back.";
      box.style.setProperty("--hl-acc", acc);
      box.innerHTML = `
        <a class="hl-cover" href="${openUrl(k)}" data-go="${openUrl(k)}"><img src="Images/${r.img}" alt="${esc(r.t)} cover" /></a>
        <div class="hl-body">
          <span class="hl-kicker">${month} Highlight${m ? " · " + m[0] : ""}</span>
          <h3 class="hl-title" title="${esc(r.t)}">${esc(shortTitle(r.t))}</h3>
          <div class="hl-meta">${esc(genresOf(r).join(" · "))} · ${esc(r.a)}</div>
          <p class="hl-syn">${esc(syn)}</p>
          <div class="hl-cta">
            <a class="btn-hl" href="${openUrl(k)}" data-go="${openUrl(k)}"><i class="ti ti-player-play"></i> Start reading</a>
            <button type="button" class="btn-hl ghost${wishOn(k) ? " on" : ""}" id="hlWish"><i class="ti ti-heart"></i> <span>${wishOn(k) ? "Saved" : "Add to Wishlist"}</span></button>
          </div>
          <div class="hl-picks">
            ${list.map((x, j) => `<button type="button" class="hl-pick${j === i ? " on" : ""}" data-hl="${j}" aria-label="${esc(T[x].t)}" title="${esc(T[x].t)}"><img src="Images/${T[x].img}" alt="" /></button>`).join("")}
          </div>
        </div>`;
    }
    box.addEventListener("click", (e) => {
      const p = e.target.closest("[data-hl]");
      if (p) return show(Number(p.dataset.hl));
      const w = e.target.closest("#hlWish");
      if (w && typeof chToggleWishlist === "function") {
        const k = list[cur];
        const on = chToggleWishlist(wishId(k), T[k].t);
        w.classList.toggle("on", on);
        w.querySelector("span").textContent = on ? "Saved" : "Add to Wishlist";
      }
    });
    show(0);
  }

  /* ---------- WEEKLY RECOMMENDATIONS (rotates every Monday) ---------- */
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return {
      w: Math.ceil(((t - y0) / 86400000 + 1) / 7),
      y: t.getUTCFullYear(),
    };
  }
  const WEEK = isoWeek(new Date());
  function seeded(k) {
    let h = 2166136261;
    const s = k + "|" + WEEK.y + "|" + WEEK.w;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  const topGenres = () => {
    const c = {};
    DIG.forEach((k) => subGenresOf(k).forEach((g) => (c[g] = (c[g] || 0) + 1)));
    return Object.entries(c)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g]) => g);
  };
  function weeklyInit() {
    const genres = ["For you"].concat(topGenres());
    $("wkChips").innerHTML = genres
      .map(
        (g, i) =>
          `<button class="tp-chip${i ? "" : " on"}" data-g="${esc(g)}">${esc(g)}</button>`,
      )
      .join("");
    $("wkSub").textContent =
      `Hand-picked for week ${WEEK.w} · refreshed every Monday`;
    const draw = (g) => {
      const pool = DIG.filter(
        (k) => g === "For you" || subGenresOf(k).includes(g),
      );
      $("wkGrid").innerHTML = pool
        .sort((a, b) => seeded(a) - seeded(b))
        .slice(0, 6)
        .map((k) => card(k))
        .join("");
    };
    $("wkChips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b) return;
      $("wkChips")
        .querySelectorAll(".tp-chip")
        .forEach((x) => x.classList.toggle("on", x === b));
      draw(b.dataset.g);
    });
    draw("For you");
  }

  /* ---------- ALL SERIES (digital only) ---------- */
  const st = { imp: "all", genre: "all", sec: "all", sort: "def", q: "" };
  function gridRender() {
    const list = DIG.filter((k) => {
      const r = T[k];
      if (st.imp !== "all" && r.i !== st.imp) return false;
      if (st.sec !== "all" && sectionOf(k) !== st.sec) return false;
      if (st.genre !== "all" && !genresOf(r).includes(st.genre)) return false;
      if (st.q && !r.t.toLowerCase().includes(st.q)) return false;
      return true;
    });
    if (st.sort === "az") list.sort((a, b) => T[a].t.localeCompare(T[b].t));
    $("tpGrid").innerHTML = list.map((k) => card(k)).join("");
    $("tpCount").textContent = list.length + " digital titles";
    $("tpEmpty").hidden = list.length > 0;
  }
  function chipRow(el, items, onPick) {
    el.innerHTML = items
      .map(
        ([id, name, c, ink], i) =>
          `<button class="tp-chip${i ? "" : " on"}" data-i="${esc(id)}" style="--acc:${c || "var(--tp-rose)"};--acc-ink:${ink || "#fff"}">${esc(name)}</button>`,
      )
      .join("");
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) return;
      el.querySelectorAll(".tp-chip").forEach((x) =>
        x.classList.toggle("on", x === b),
      );
      onPick(b.dataset.i);
    });
  }
  function filtersInit() {
    chipRow(
      $("tpSections"),
      [
        ["all", "All formats"],
        ["comics", "Comics"],
        ["manga", "Manga"],
        ["novel", "Novel"],
      ],
      (v) => ((st.sec = v), gridRender()),
    );
    chipRow(
      $("tpImprints"),
      [["all", "All imprints", "#c9a84c", "#080508"]].concat(
        Object.entries(IMP)
          .filter(([i]) => DIG.some((k) => T[k].i === i))
          .map(([i, m]) => [i, m[0], m[1], m[2]]),
      ),
      (v) => ((st.imp = v), gridRender()),
    );
    const c = {};
    DIG.forEach((k) =>
      genresOf(T[k]).forEach((g) => {
        if (!FORMAT_WORDS.includes(g.toLowerCase())) c[g] = (c[g] || 0) + 1;
      }),
    );
    const genres = Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => [g, g]);
    chipRow(
      $("tpGenres"),
      [["all", "All genres"]].concat(genres),
      (v) => ((st.genre = v), gridRender()),
    );
    $("tpSort").addEventListener(
      "input",
      (e) => ((st.sort = e.target.value), gridRender()),
    );
    $("tpQ").addEventListener(
      "input",
      (e) => ((st.q = e.target.value.trim().toLowerCase()), gridRender()),
    );
    gridRender();
  }

  /* ---------- PRINT-ONLY SHELF ---------- */
  function printShelf() {
    if (!PRINT_ONLY_KEYS.length) {
      $("printShelf").hidden = true;
      return;
    }
    $("printShelf").innerHTML = `
      <div class="tp-sh">
        <div><h2>Print Editions</h2><p>These titles are available in print only — they open on the Crossed Hearts print site.</p></div>
        <a class="btn-hl" href="${PRINT_URL}" target="_blank" rel="noopener">Visit the print site <i class="ti ti-external-link"></i></a>
      </div>
      <div class="tp-row">${PRINT_ONLY_KEYS.map((k) => card(k, { print: true })).join("")}</div>`;
  }

  /* ---------- JUMP TABS ---------- */
  function tabsInit() {
    const tabs = $("tpTabs");
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("[data-jump]");
      if (!b) return;
      const t = $(b.dataset.jump);
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const map = {};
    tabs
      .querySelectorAll("[data-jump]")
      .forEach((b) => (map[b.dataset.jump] = b));
    const io = new IntersectionObserver(
      (ents) => {
        ents.forEach((en) => {
          if (en.isIntersecting && map[en.target.id]) {
            tabs
              .querySelectorAll(".tp-tab")
              .forEach((x) => x.classList.remove("on"));
            map[en.target.id].classList.add("on");
          }
        });
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    Object.keys(map).forEach((id) => $(id) && io.observe($(id)));
  }

  const SOCIALS = [
    [
      "https://discord.com/login?redirect_to=%2Fchannels%2F%40me",
      "Discord",
      "ti-brand-discord",
    ],
    [
      "https://www.facebook.com/thecrossedhearts",
      "Facebook",
      "ti-brand-facebook",
    ],
    [
      "https://www.instagram.com/thecrossedhearts",
      "Instagram",
      "ti-brand-instagram",
    ],
    ["https://x.com/CrossedHearts_X", "X (Twitter)", "ti-brand-x"],
    [
      "https://www.youtube.com/@CrossedHearts_YT",
      "YouTube",
      "ti-brand-youtube",
    ],
  ];

  function boot() {
    heroInit();
    tilesInit();
    $("rowNew").innerHTML = rowHTML(
      "secNew",
      "New Releases",
      "Fresh and upcoming digital series",
      NEW,
    );
    $("rowTrending").innerHTML = rowHTML(
      "secTrending",
      "Trending Now",
      "What readers are opening most",
      trendingList(),
      (k, i) => ({ rank: i + 1 }),
    );
    const tr = document.querySelector("#secTrending .tp-row");
    if (tr) tr.classList.add("trending");
    highlightsInit();
    weeklyInit();
    filtersInit();
    printShelf();
    tabsInit();
    $("socials").innerHTML = SOCIALS.map(
      ([h, l, c]) =>
        `<a href="${h}" target="_blank" rel="noopener" aria-label="${l}"><i class="ti ${c}" aria-hidden="true"></i></a>`,
    ).join("");
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
