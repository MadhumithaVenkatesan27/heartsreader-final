/* ===========================================================
   reading-state.js
   Shared data layer for My Library, My Account and the Reader.
   Load AFTER script.js (uses CH_USER, CH_LIB, CH_API_URL, ...).

   Works offline-first: everything is cached in localStorage and,
   when the user is signed in, synced to the backend. If the
   backend endpoints don't exist yet the pages still work.

   Add  ?demo=1  to my-library.html / account.html to preview
   the pages with fake data (nothing is saved, no API calls).
   =========================================================== */
(function () {
  "use strict";

  // ---- Title catalogue used by the library (same data that used to live in account.html)
  const RAW = [
    [
      "chigaya-v1",
      "You're Way Too Cheeky, Chigaya-kun! Vol.1",
      "COMISMA",
      "Manga",
      4,
    ],
    [
      "chigaya-v2",
      "You're Way Too Cheeky, Chigaya-kun! Vol.2",
      "COMISMA",
      "Manga",
      3,
    ],
    ["grenimal-v1", "The Executioner of Grenimal Vol.1", "COMISMA", "Manga", 3],
    ["grenimal-v2", "The Executioner of Grenimal Vol.2", "COMISMA", "Manga", 2],
    ["matchmaker-v1", "The Matchmaker's Fiancé Vol.1", "COMISMA", "Manga", 2],
    ["connie-v1", "All-Rounder Maid Connie Wille Vol.1", "COMISMA", "Manga", 2],
    ["connie-v2", "All-Rounder Maid Connie Wille Vol.2", "COMISMA", "Manga", 1],
    ["borrowing", "Borrowing Your Textbook 175160", "Glam Beat", "Manhwa", 4],
    ["timecloset", "Time is a Closet", "Glam Beat", "Manhwa", 2],
    ["afternoontea", "Afternoon Tea for Two", "Glam Beat", "Manhwa", 3],
    [
      "zombie-v1",
      "The Abandoned Villainess Became a Zombie Vol.1",
      "A Novel Press",
      "Novel",
      2,
    ],
    [
      "zombie-v2",
      "The Abandoned Villainess Became a Zombie Vol.2",
      "A Novel Press",
      "Novel",
      1,
    ],
    [
      "raeliana-v1",
      "Why Raeliana Ended Up at the Duke's Mansion Vol.1",
      "A Novel Press",
      "Novel",
      2,
    ],
    ["bgos-v1", "Baroness Goes on Strike Vol.1", "COMISMA", "Manhwa", 4],
    ["fktl-v1", "From a Knight to a Lady Vol.1", "COMISMA", "Manhwa", 4],
  ];
  const TITLE_META = {};
  RAW.forEach(function (r) {
    TITLE_META[r[0]] = {
      title: r[1],
      imprint: r[2],
      format: r[3],
      totalCh: r[4],
      href: "title-" + r[0] + ".html",
    };
  });

  const COVERS = {
    "chigaya-v1": "Images/Chigaya-vol 1.png",
    "chigaya-v2": "Images/Chigaya-vol 2.png",
    "grenimal-v1": "Images/Grenimal-vol 1.png",
    "grenimal-v2": "Images/Grenimal-vol 2.png",
    "matchmaker-v1": "Images/Matchmaker-vol 1.png",
    "connie-v1": "Images/Connie-vol 1.png",
    "connie-v2": "Images/Connie-vol 2.png",
    borrowing: "Images/Borrowing-ch1.png",
    timecloset: "Images/Time-ch1.png",
    afternoontea: "Images/Afternoon-ch1.png",
    "zombie-v1": "Images/Zombie-vol1.png",
    "zombie-v2": "Images/Zombie-vol2.png",
    "raeliana-v1": "Images/Whyraeliana-vol1.png",
    "raeliana-v2": "Images/Whyraeliana-vol2.png",
    "bgos-v1": "Images/BGOS-vol1.png",
    "bgos-v2": "Images/BGOS-vol2.png",
    "bgos-v3": "Images/BGOS-vol3.png",
    "fktl-v1": "Images/FKTL-vol1.png",
    "fktl-v2": "Images/FKTL-vol2.png",
    "fktl-v3": "Images/FKTL-vol2.png",
  };

  const isDemo = new URLSearchParams(location.search).has("demo");
  const emptyState = function () {
    return { progress: {}, bookmarks: [] };
  };
  const pkey = function (t, c) {
    return t + "::" + c;
  };
  let cache = null;
  const timers = {};

  function userKey() {
    return "ch_rs_" + (CH_USER && CH_USER.email ? CH_USER.email : "guest");
  }
  function readLocal() {
    try {
      const v = JSON.parse(localStorage.getItem(userKey()) || "null");
      return v && v.progress ? v : emptyState();
    } catch (e) {
      return emptyState();
    }
  }
  function writeLocal(s) {
    if (isDemo) return;
    try {
      localStorage.setItem(userKey(), JSON.stringify(s));
    } catch (e) {}
  }
  function canSync() {
    return !isDemo && !!CH_USER && !!sessionStorage.getItem("ch_token");
  }

  // ---- small fetch helper: returns data.data, throws Error(message) on failure
  async function api(path, opts) {
    opts = opts || {};
    const token = sessionStorage.getItem("ch_token");
    const res = await fetch(CH_API_URL + path, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? "Bearer " + token : "",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || data.status !== "success") {
      const err = new Error(data.message || "Request failed.");
      err.status = res.status;
      throw err;
    }
    return data.data || {};
  }

  function normProgress(p) {
    const total = Number(p.totalPages || 0);
    const page = Number(p.page || 1);
    const completed = !!p.completed;
    return {
      titleId: p.titleId,
      chId: p.chapter || p.chId,
      page: page,
      totalPages: total,
      percent: completed
        ? 100
        : Number(
            p.percent != null
              ? p.percent
              : total
                ? Math.round((page / total) * 100)
                : 0,
          ),
      completed: completed,
      lastReadAt: p.lastReadAt || "",
    };
  }

  // ---- load (local first, then merge with server)
  async function load(force) {
    if (isDemo) return cache || demoSeed();
    if (cache && !force) return cache;
    const local = readLocal();
    cache = local;
    if (canSync()) {
      try {
        const d = await api("/library/reading-state");
        const prog = {};
        (d.progress || []).forEach(function (p) {
          const e = normProgress(p);
          prog[pkey(e.titleId, e.chId)] = e;
        });
        // keep local entries that are newer than the server's, and push them up
        Object.keys(local.progress).forEach(function (key) {
          const v = local.progress[key];
          if (
            !prog[key] ||
            (v.lastReadAt || "") > (prog[key].lastReadAt || "")
          ) {
            prog[key] = v;
            queueSync(v);
          }
        });
        const bms = (d.bookmarks || []).map(function (b) {
          return {
            _id: b._id,
            titleId: b.titleId,
            chId: b.chapter || b.chId,
            page: Number(b.page || 1),
            note: b.note || "",
            createdAt: b.createdAt || "",
          };
        });
        cache = {
          progress: prog,
          bookmarks: d.bookmarks ? bms : local.bookmarks,
        };
        writeLocal(cache);
      } catch (e) {
        console.warn("Reading state: using local data only.", e.message || e);
      }
    }
    return cache;
  }

  function state() {
    return cache || (cache = readLocal());
  }

  // ---- progress (call from the reader on chapter open and on every page turn)
  function queueSync(entry) {
    if (!canSync()) return;
    const key = pkey(entry.titleId, entry.chId);
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      api("/library/progress", {
        method: "PUT",
        body: {
          titleId: entry.titleId,
          chapter: entry.chId,
          page: entry.page,
          totalPages: entry.totalPages,
          completed: entry.completed,
        },
      }).catch(function (e) {
        console.warn("Progress sync failed:", e.message || e);
      });
    }, 1500);
  }

  function saveProgress(o) {
    const s = state();
    const key = pkey(o.titleId, o.chId);
    const prev = s.progress[key] || {};
    const total =
      o.totalPages != null
        ? Number(o.totalPages)
        : Number(prev.totalPages || 0);
    const page = o.page != null ? Number(o.page) : Number(prev.page || 1);
    const done =
      o.completed != null
        ? !!o.completed
        : !!prev.completed || (total > 0 && page >= total);
    const entry = {
      titleId: o.titleId,
      chId: o.chId,
      page: page,
      totalPages: total,
      percent: done
        ? 100
        : total
          ? Math.min(100, Math.round((page / total) * 100))
          : 0,
      completed: done,
      lastReadAt: new Date().toISOString(),
    };
    s.progress[key] = entry;
    writeLocal(s);
    queueSync(entry);
    return entry;
  }

  // ---- bookmarks
  function isBookmarked(titleId, chId, page) {
    return state().bookmarks.some(function (b) {
      return (
        b.titleId === titleId &&
        b.chId === chId &&
        Number(b.page) === Number(page)
      );
    });
  }

  async function addBookmark(o) {
    const s = state();
    const bm = {
      _id: "local_" + Date.now(),
      titleId: o.titleId,
      chId: o.chId,
      page: Number(o.page || 1),
      note: (o.note || "").slice(0, 200),
      createdAt: new Date().toISOString(),
    };
    s.bookmarks.unshift(bm);
    writeLocal(s);
    if (canSync()) {
      try {
        const d = await api("/library/bookmarks", {
          method: "POST",
          body: {
            titleId: bm.titleId,
            chapter: bm.chId,
            page: bm.page,
            note: bm.note,
          },
        });
        const saved = d.bookmark || d;
        if (saved && saved._id) {
          bm._id = saved._id;
          writeLocal(s);
        }
      } catch (e) {
        console.warn("Bookmark sync failed:", e.message || e);
      }
    }
    return bm;
  }

  async function removeBookmark(id) {
    const s = state();
    const i = s.bookmarks.findIndex(function (b) {
      return b._id === id;
    });
    if (i === -1) return;
    s.bookmarks.splice(i, 1);
    writeLocal(s);
    if (canSync() && !String(id).startsWith("local_")) {
      try {
        await api("/library/bookmarks/" + encodeURIComponent(id), {
          method: "DELETE",
        });
      } catch (e) {
        console.warn("Bookmark delete failed:", e.message || e);
      }
    }
  }

  async function toggleBookmark(titleId, chId, page, note) {
    const s = state();
    const found = s.bookmarks.find(function (b) {
      return (
        b.titleId === titleId &&
        b.chId === chId &&
        Number(b.page) === Number(page)
      );
    });
    if (found) {
      await removeBookmark(found._id);
      return false;
    }
    await addBookmark({ titleId: titleId, chId: chId, page: page, note: note });
    return true;
  }

  // newest-first list of chapters the user has opened
  function recent(limit) {
    const list = Object.keys(state().progress)
      .map(function (k) {
        return state().progress[k];
      })
      .sort(function (a, b) {
        return (b.lastReadAt || "").localeCompare(a.lastReadAt || "");
      });
    return limit ? list.slice(0, limit) : list;
  }

  // ---- tab helper shared by pages (.pg-tab[data-tab] + .pg-panel#id)
  function bindTabs(onShow) {
    function show(name) {
      document.querySelectorAll(".pg-tab").forEach(function (b) {
        b.classList.toggle("active", b.dataset.tab === name);
      });
      document.querySelectorAll(".pg-panel").forEach(function (p) {
        p.classList.toggle("active", p.id === name);
      });
      if (onShow) onShow(name);
    }
    document.querySelectorAll(".pg-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        show(b.dataset.tab);
        history.replaceState(null, "", "#" + b.dataset.tab);
      });
    });
    const h = location.hash.replace("#", "");
    if (h && document.querySelector('.pg-tab[data-tab="' + h + '"]')) show(h);
    else if (onShow) {
      const first = document.querySelector(".pg-tab.active");
      if (first) onShow(first.dataset.tab);
    }
    return show;
  }

  // ---- demo data (?demo=1) — nothing is persisted
  function demoSeed() {
    const now = Date.now();
    const d = function (days, hrs) {
      return new Date(now - days * 864e5 - (hrs || 0) * 36e5).toISOString();
    };
    CH_USER = { id: "demo", name: "Demo Reader", email: "demo@example.com" };
    CH_LIB = {
      "chigaya-v1": ["ch1", "ch2"],
      "zombie-v1": ["bundle"],
      "grenimal-v1": ["ch1"],
      "bgos-v1": ["ch1", "ch2", "ch3"],
    };
    CH_LIBRARY_PURCHASES = [
      {
        _id: "p1",
        bookTitle: "You're Way Too Cheeky, Chigaya-kun! Vol.1",
        purchaseType: "chapter",
        chapterTitles: ["Chapter 1", "Chapter 2"],
        amount: 1.98,
        currency: "USD",
        invoiceNumber: "INV-0001",
        paidAt: d(12),
      },
      {
        _id: "p2",
        bookTitle: "The Abandoned Villainess Became a Zombie Vol.1",
        purchaseType: "book",
        chapterTitles: [],
        amount: 8.99,
        currency: "USD",
        invoiceNumber: "INV-0002",
        paidAt: d(5),
      },
      {
        _id: "p3",
        bookTitle: "Baroness Goes on Strike Vol.1",
        purchaseType: "chapter",
        chapterTitles: ["Chapter 1", "Chapter 2", "Chapter 3"],
        amount: 2.97,
        currency: "USD",
        invoiceNumber: "INV-0003",
        paidAt: d(2),
      },
    ];
    const P = function (t, c, page, total, done, when) {
      return {
        titleId: t,
        chId: c,
        page: page,
        totalPages: total,
        percent: done ? 100 : Math.round((page / total) * 100),
        completed: done,
        lastReadAt: when,
      };
    };
    const list = [
      P("chigaya-v1", "ch1", 22, 22, true, d(6)),
      P("chigaya-v1", "ch2", 9, 24, false, d(0, 3)),
      P("zombie-v1", "ch1", 30, 30, true, d(3)),
      P("zombie-v1", "ch2", 4, 28, false, d(1)),
      P("bgos-v1", "ch1", 12, 20, false, d(2)),
      P("grenimal-v1", "ch1", 18, 18, true, d(9)),
    ];
    const progress = {};
    list.forEach(function (e) {
      progress[pkey(e.titleId, e.chId)] = e;
    });
    cache = {
      progress: progress,
      bookmarks: [
        {
          _id: "b1",
          titleId: "chigaya-v1",
          chId: "ch2",
          page: 7,
          note: "Favourite scene",
          createdAt: d(0, 4),
        },
        {
          _id: "b2",
          titleId: "zombie-v1",
          chId: "ch1",
          page: 15,
          note: "",
          createdAt: d(3),
        },
        {
          _id: "b3",
          titleId: "bgos-v1",
          chId: "ch1",
          page: 5,
          note: "Re-read this",
          createdAt: d(2),
        },
      ],
    };
    return cache;
  }

  window.chRS = {
    TITLE_META: TITLE_META,
    COVERS: COVERS,
    isDemo: isDemo,
    api: api,
    load: load,
    state: state,
    bindTabs: bindTabs,
    saveProgress: saveProgress,
    recent: recent,
    addBookmark: addBookmark,
    removeBookmark: removeBookmark,
    toggleBookmark: toggleBookmark,
    isBookmarked: isBookmarked,
    demoSeed: demoSeed,
  };
})();
