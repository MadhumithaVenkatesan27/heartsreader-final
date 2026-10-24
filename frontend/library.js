/* =====================================================================
   Crossed Hearts — My Library  (library.js)
   Needs: script.js, ch-data.js   ·   Markup: library.html
   No sample data. Everything below renders what the backend returns.
   ===================================================================== */
(function () {
  "use strict";

  var D = window.CHData;
  var esc = D.esc;
  var $ = function (id) {
    return document.getElementById(id);
  };

  var state = {
    titles: [], // from GET /library/titles
    progress: [], // from GET /reading/progress
    bookmarks: [], // from GET /bookmarks
    partialFail: false, // progress or bookmarks failed to load
    model: [], // titles joined with progress (built by buildModel)
    tab: "titles",
    open: new Set(), // expanded chapter lists
    editingNote: null, // bookmark id being edited
    filters: {
      q: "",
      imprint: new Set(),
      format: new Set(),
      status: "all",
      sort: "recent",
    },
  };

  /* ------------------------------------------------------------------ */
  /*  helpers                                                            */
  /* ------------------------------------------------------------------ */
  function clamp(n) {
    n = Number(n) || 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function coverFallback(titleId) {
    // optional fallback to the static catalogue if the API sent no cover
    try {
      if (typeof ALL_TITLES_FLAT !== "undefined") {
        var t = ALL_TITLES_FLAT.find(function (x) {
          return x.id === titleId;
        });
        if (t && t.image) return t.image;
      }
    } catch (_) {}
    return "";
  }

  function coverHtml(url, titleId, alt) {
    var src = D.safeUrl(url) || coverFallback(titleId);
    return src
      ? '<img src="' +
          esc(src) +
          '" alt="' +
          esc(alt) +
          '" loading="lazy" onerror="this.remove()">'
      : '<i class="ti ti-book" aria-hidden="true"></i>';
  }

  function pageText(page, total) {
    if (!page) return "";
    return total ? "Page " + page + " of " + total : "Page " + page;
  }

  /* ------------------------------------------------------------------ */
  /*  join titles + progress                                             */
  /* ------------------------------------------------------------------ */
  function buildModel() {
    var byKey = new Map();
    state.progress.forEach(function (p) {
      byKey.set(p.titleId + "|" + p.chapterId, p);
    });

    state.model = state.titles.map(function (t) {
      var chapters = (t.chapters || [])
        .slice()
        .sort(function (a, b) {
          return (a.order || 0) - (b.order || 0);
        })
        .map(function (c) {
          var pr = byKey.get(t.titleId + "|" + c.chapterId) || null;
          var unlocked = c.access === "owned" || c.access === "free";
          var pct = pr ? clamp(pr.percent) : 0;
          var completed = !!(pr && (pr.completed || pct >= D.DONE_AT));
          return Object.assign({}, c, {
            unlocked: unlocked,
            pr: pr,
            pct: completed ? 100 : pct,
            completed: completed,
            page: pr ? Number(pr.page) || 0 : 0,
            totalPages: pr ? Number(pr.totalPages) || 0 : 0,
            lastReadAt: pr ? pr.lastReadAt : null,
          });
        });

      var unlocked = chapters.filter(function (c) {
        return c.unlocked;
      });
      var done = unlocked.filter(function (c) {
        return c.completed;
      }).length;
      var percent = unlocked.length
        ? Math.round(
            unlocked.reduce(function (s, c) {
              return s + c.pct;
            }, 0) / unlocked.length,
          )
        : 0;
      var touched = unlocked.some(function (c) {
        return c.pr || c.pct > 0;
      });
      var status = "new";
      if (unlocked.length && done === unlocked.length) status = "completed";
      else if (touched) status = "reading";

      var lastRead = chapters
        .filter(function (c) {
          return c.lastReadAt;
        })
        .sort(function (a, b) {
          return new Date(b.lastReadAt) - new Date(a.lastReadAt);
        })[0];

      var onlyFree =
        unlocked.length > 0 &&
        unlocked.every(function (c) {
          return c.access === "free";
        });

      return Object.assign({}, t, {
        chapters: chapters,
        unlockedCount: unlocked.length,
        doneCount: done,
        percent: percent,
        status: status,
        fully: chapters.length > 0 && unlocked.length === chapters.length,
        onlyFree: onlyFree,
        lastReadAt: lastRead ? lastRead.lastReadAt : null,
        resume: resumeTarget(t.titleId, chapters),
      });
    });
  }

  // Where should "Continue" take the reader?
  function resumeTarget(titleId, chapters) {
    var unlocked = chapters.filter(function (c) {
      return c.unlocked;
    });
    if (!unlocked.length) return null;

    var last = unlocked
      .filter(function (c) {
        return c.lastReadAt;
      })
      .sort(function (a, b) {
        return new Date(b.lastReadAt) - new Date(a.lastReadAt);
      })[0];

    if (last && !last.completed) {
      return {
        url: D.readerUrl(titleId, last.chapterId, last.page),
        label: "Continue · " + last.label,
        sub: pageText(last.page, last.totalPages),
        chapter: last,
      };
    }
    var startIdx = last ? unlocked.indexOf(last) + 1 : 0;
    var next =
      unlocked.slice(startIdx).find(function (c) {
        return !c.completed;
      }) ||
      unlocked.find(function (c) {
        return !c.completed;
      });
    if (next) {
      var started = !!next.pr;
      return {
        url: D.readerUrl(titleId, next.chapterId, started ? next.page : 1),
        label: (last ? "Read next · " : "Start reading · ") + next.label,
        sub: started ? pageText(next.page, next.totalPages) : "",
        chapter: next,
      };
    }
    return {
      url: D.readerUrl(titleId, unlocked[0].chapterId, 1),
      label: "Read again",
      sub: "",
      chapter: unlocked[0],
    };
  }

  function titleById(id) {
    return state.model.find(function (m) {
      return m.titleId === id;
    });
  }

  /* ------------------------------------------------------------------ */
  /*  state screens                                                      */
  /* ------------------------------------------------------------------ */
  function showScreen(kind, opts) {
    opts = opts || {};
    var box = $("libState");
    var main = $("libMain");
    if (kind === "ready") {
      box.innerHTML = "";
      main.hidden = false;
      return;
    }
    main.hidden = true;
    if (kind === "loading") {
      box.innerHTML =
        '<div class="sk-wrap" aria-busy="true" aria-label="Loading your library">' +
        '<div class="sk sm"></div><div class="sk"></div><div class="sk"></div></div>';
    } else if (kind === "out") {
      box.innerHTML =
        '<div class="st-box"><h3>Sign in to open your library</h3>' +
        "<p>" +
        esc(
          opts.message ||
            "Your titles, reading progress and bookmarks live here.",
        ) +
        '</p><button class="btn-gold" onclick="openAuth()">Sign In</button></div>';
    } else if (kind === "error") {
      box.innerHTML =
        '<div class="st-box"><h3>We couldn\'t load your library</h3><p>' +
        esc(opts.message || "Please try again.") +
        '</p><button class="btn-gold" id="libRetry">Try again</button></div>';
      var r = $("libRetry");
      if (r) r.onclick = load;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  load                                                               */
  /* ------------------------------------------------------------------ */
  var loadSeq = 0;
  async function load() {
    if (!D.isSignedIn()) {
      showScreen("out");
      return;
    }
    var seq = ++loadSeq;
    showScreen("loading");

    var res = await Promise.allSettled([
      D.library.titles(),
      D.progress.list(),
      D.bookmarks.list(),
    ]);
    if (seq !== loadSeq) return; // a newer load started

    var authFailed = res.some(function (r) {
      return (
        r.status === "rejected" &&
        (r.reason.status === 401 || r.reason.status === 403)
      );
    });
    if (authFailed) {
      D.dropSession();
      if (typeof updateNavAuthBtn === "function") updateNavAuthBtn();
      showScreen("out", {
        message: "Your session expired. Please sign in again.",
      });
      return;
    }
    if (res[0].status === "rejected") {
      showScreen("error", { message: res[0].reason.message });
      return;
    }

    state.titles = res[0].value;
    state.progress = res[1].status === "fulfilled" ? res[1].value : [];
    state.bookmarks = res[2].status === "fulfilled" ? res[2].value : [];

    // the reader may have saved progress/bookmarks under an older id (e.g. "timeisa-v1");
    // point them all at the title's own id so counts and "continue reading" line up
    var canon = {};
    state.titles.forEach(function (t) {
      [t.titleId, t.slug]
        .concat(t.ids || t.aliases || [])
        .forEach(function (x) {
          x = String(x || "").toLowerCase();
          if (x && !canon[x]) canon[x] = t.titleId;
        });
    });
    function fixId(r) {
      var k = String(r.titleId || "").toLowerCase();
      if (canon[k]) r.titleId = canon[k];
      return r;
    }
    state.progress.forEach(fixId);
    state.bookmarks.forEach(fixId);
    state.partialFail =
      res[1].status === "rejected" || res[2].status === "rejected";

    buildModel();
    showScreen("ready");
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /*  render: stats + continue banner                                    */
  /* ------------------------------------------------------------------ */
  function renderStats() {
    var m = state.model;
    var unlocked = m.reduce(function (s, t) {
      return s + t.unlockedCount;
    }, 0);
    var total = m.reduce(function (s, t) {
      return s + t.chapters.length;
    }, 0);
    var finished = m.reduce(function (s, t) {
      return s + t.doneCount;
    }, 0);
    var inProgress = m.filter(function (t) {
      return t.status === "reading";
    }).length;

    function box(n, label) {
      return (
        '<div class="lib-stat"><b>' + n + "</b><span>" + label + "</span></div>"
      );
    }
    $("libStats").innerHTML =
      box(m.length, "Titles") +
      box(unlocked + " / " + total, "Chapters unlocked") +
      box(finished, "Chapters finished") +
      box(inProgress, "In progress") +
      box(state.bookmarks.length, "Bookmarks");

    $("libPartial").hidden = !state.partialFail;
  }

  function renderContinue() {
    var el = $("libContinue");
    var latest = state.model
      .filter(function (t) {
        return t.lastReadAt && t.resume;
      })
      .sort(function (a, b) {
        return new Date(b.lastReadAt) - new Date(a.lastReadAt);
      })[0];
    if (!latest) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      '<div class="lib-continue">' +
      '<div class="thumb">' +
      coverHtml(latest.coverUrl, latest.titleId, latest.title) +
      "</div>" +
      '<div class="cc-text"><div class="cc-eyebrow">Pick up where you left off</div>' +
      '<div class="cc-title">' +
      esc(latest.title) +
      "</div>" +
      '<div class="cc-sub">' +
      esc(latest.resume.chapter.label) +
      (latest.resume.sub ? " · " + esc(latest.resume.sub) : "") +
      " · " +
      esc(D.timeAgo(latest.lastReadAt)) +
      "</div></div>" +
      '<a class="pill-btn" href="' +
      esc(latest.resume.url) +
      '"><i class="ti ti-player-play" aria-hidden="true"></i> Continue</a>' +
      "</div>";
  }

  /* ------------------------------------------------------------------ */
  /*  render: My Titles                                                  */
  /* ------------------------------------------------------------------ */
  function renderFilterMenus() {
    function uniq(key) {
      var set = new Set();
      state.model.forEach(function (t) {
        if (t[key]) set.add(t[key]);
      });
      return Array.from(set).sort();
    }
    function menu(menuId, key, values) {
      var el = $(menuId);
      el.innerHTML = values.length
        ? values
            .map(function (v) {
              return (
                '<label><input type="checkbox" data-filter="' +
                key +
                '" value="' +
                esc(v) +
                '"' +
                (state.filters[key].has(v) ? " checked" : "") +
                "> " +
                esc(v) +
                "</label>"
              );
            })
            .join("")
        : '<label style="color:var(--muted)">Nothing to filter yet</label>';
    }
    // every imprint is listed, even ones you own nothing from yet
    var ALL_IMPRINTS = [
      "Crossed Hearts",
      "COMISMA",
      "Queen of Hearts",
      "King of Spades",
      "Ace of Diamond",
      "Blush Club",
      "Glam Beat",
      "A Novel Press",
      "Studio Hearts",
    ];
    var imprints = ALL_IMPRINTS.slice();
    uniq("imprint").forEach(function (v) {
      if (imprints.indexOf(v) < 0) imprints.push(v);
    });
    menu("imprintMenu", "imprint", imprints);
    if ($("formatMenu")) menu("formatMenu", "format", uniq("format"));
    updateFilterCounts();
  }

  function updateFilterCounts() {
    [
      ["imprintCount", "imprint"],
      ["formatCount", "format"],
    ].forEach(function (p) {
      var el = $(p[0]);
      var n = state.filters[p[1]].size;
      el.textContent = n;
      el.classList.toggle("show", n > 0);
    });
  }

  function visibleTitles() {
    var f = state.filters;
    var q = f.q.trim().toLowerCase();
    var list = state.model.filter(function (t) {
      if (q && String(t.title).toLowerCase().indexOf(q) === -1) return false;
      if (f.imprint.size && !f.imprint.has(t.imprint)) return false;
      if (f.format.size && !f.format.has(t.format)) return false;
      if (f.status === "reading" && t.status !== "reading") return false;
      if (f.status === "completed" && t.status !== "completed") return false;
      if (f.status === "new" && t.status !== "new") return false;
      return true;
    });
    var sorters = {
      recent: function (a, b) {
        return (
          new Date(b.lastReadAt || b.purchasedAt || 0) -
          new Date(a.lastReadAt || a.purchasedAt || 0)
        );
      },
      title: function (a, b) {
        return String(a.title).localeCompare(String(b.title));
      },
      progress: function (a, b) {
        return b.percent - a.percent;
      },
      purchased: function (a, b) {
        return new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0);
      },
    };
    return list.sort(sorters[f.sort] || sorters.recent);
  }

  function chapterRow(t, c) {
    var cls = c.completed
      ? "done unlocked"
      : c.unlocked
        ? "unlocked"
        : "locked";
    var ico = c.completed
      ? "ti-circle-check"
      : c.unlocked
        ? "ti-lock-open"
        : "ti-lock";

    var sub;
    if (!c.unlocked) {
      sub = c.price ? "Locked · " + D.money(c.price, c.currency) : "Locked";
    } else if (c.completed) {
      sub = "Completed" + (c.lastReadAt ? " · " + D.timeAgo(c.lastReadAt) : "");
    } else if (c.pr) {
      sub =
        [pageText(c.page, c.totalPages), c.pct + "% read"]
          .filter(Boolean)
          .join(" · ") + (c.lastReadAt ? " · " + D.timeAgo(c.lastReadAt) : "");
    } else {
      sub = "Not started";
    }

    var chip =
      c.access === "free"
        ? '<span class="ch-chip free">Free</span>'
        : c.unlocked
          ? '<span class="ch-chip owned">Unlocked</span>'
          : '<span class="ch-chip locked">Locked</span>';

    var action;
    if (!c.unlocked) {
      action =
        '<a class="pill-btn ghost sm" href="' +
        esc(D.readerUrl(t.titleId, c.chapterId)) +
        '">Unlock</a>';
    } else if (c.completed) {
      action =
        '<a class="pill-btn ghost sm" href="' +
        esc(D.readerUrl(t.titleId, c.chapterId)) +
        '">Read again</a>';
    } else {
      action =
        '<a class="pill-btn sm" href="' +
        esc(D.readerUrl(t.titleId, c.chapterId, c.pr ? c.page : 1)) +
        '">' +
        (c.pr ? "Resume" : "Read") +
        "</a>";
    }

    return (
      '<div class="ch-row ' +
      cls +
      '">' +
      '<i class="ti ' +
      ico +
      ' ch-ico" aria-hidden="true"></i>' +
      '<div><div class="ch-label">' +
      esc(c.label) +
      "</div>" +
      '<div class="ch-sub">' +
      esc(sub) +
      "</div>" +
      (c.unlocked && c.pct > 0 && !c.completed
        ? '<div class="ch-mini"><i style="width:' + c.pct + '%"></i></div>'
        : "") +
      "</div>" +
      chip +
      action +
      "</div>"
    );
  }

  function titleCard(t) {
    var open = state.open.has(t.titleId);
    var badgeCls =
      t.onlyFree && t.status !== "completed" ? "preview" : t.status;
    var badgeTxt =
      t.status === "completed"
        ? t.fully
          ? "Completed"
          : "Caught up"
        : t.onlyFree
          ? "Free preview"
          : t.status === "reading"
            ? "Reading"
            : "Not started";
    var detail = D.safeUrl(t.detailUrl);

    return (
      '<article class="lt-card' +
      (open ? " open" : "") +
      '" data-title="' +
      esc(t.titleId) +
      '">' +
      (detail
        ? '<a class="lt-cover" href="' + esc(detail) + '">'
        : '<div class="lt-cover">') +
      coverHtml(t.coverUrl, t.titleId, t.title + " cover") +
      (detail ? "</a>" : "</div>") +
      '<div class="lt-main">' +
      '<div class="lt-head"><div><h3 class="lt-title">' +
      (detail
        ? '<a href="' + esc(detail) + '">' + esc(t.title) + "</a>"
        : esc(t.title)) +
      "</h3>" +
      '<div class="lt-meta">' +
      esc([t.imprint, t.format].filter(Boolean).join(" · ")) +
      (t.purchasedAt
        ? (t.imprint || t.format ? " · " : "") +
          "Added " +
          esc(D.fmtDate(t.purchasedAt))
        : "") +
      "</div></div>" +
      '<span class="lt-badge ' +
      badgeCls +
      '">' +
      badgeTxt +
      "</span></div>" +
      '<div class="lt-bar' +
      (t.status === "completed" ? " done" : "") +
      '"><i style="width:' +
      t.percent +
      '%"></i></div>' +
      '<div class="lt-stats">' +
      "<span><b>" +
      t.percent +
      "%</b> read</span>" +
      "<span><b>" +
      t.unlockedCount +
      "</b> of " +
      t.chapters.length +
      " chapters unlocked</span>" +
      "<span><b>" +
      t.doneCount +
      "</b> finished</span>" +
      (t.lastReadAt
        ? "<span>Last read " + esc(D.timeAgo(t.lastReadAt)) + "</span>"
        : "") +
      "</div>" +
      '<div class="lt-actions">' +
      (t.resume
        ? '<a class="pill-btn" href="' +
          esc(t.resume.url) +
          '"><i class="ti ti-player-play" aria-hidden="true"></i> ' +
          esc(t.resume.label) +
          "</a>"
        : "") +
      '<button class="pill-btn ghost lt-toggle" data-act="toggle" aria-expanded="' +
      open +
      '">Chapters <i class="ti ti-chevron-down" aria-hidden="true"></i></button>' +
      (!t.fully && detail
        ? '<a class="link-btn" href="' +
          esc(detail) +
          '">Unlock more chapters</a>'
        : "") +
      "</div>" +
      '<div class="lt-chapters">' +
      t.chapters
        .map(function (c) {
          return chapterRow(t, c);
        })
        .join("") +
      "</div></div></article>"
    );
  }

  function renderTitles() {
    var el = $("libTitleList");
    if (!state.model.length) {
      el.innerHTML =
        '<div class="empty-lib"><h3>Your library is empty</h3>' +
        "<p>Titles you buy or preview will show up here, with every unlocked chapter.</p>" +
        '<a href="index.html#allSeries" class="btn-gold">Browse titles →</a></div>';
      $("libToolbar").hidden = true;
      return;
    }
    $("libToolbar").hidden = false;
    var list = visibleTitles();
    el.innerHTML = list.length
      ? list.map(titleCard).join("")
      : '<div class="acct-empty">No titles match your filters.</div>';
  }

  /* ------------------------------------------------------------------ */
  /*  render: Recently opened                                            */
  /* ------------------------------------------------------------------ */
  function renderRecent() {
    var el = $("libRecentList");
    var rows = state.progress
      .filter(function (p) {
        return p.lastReadAt;
      })
      .sort(function (a, b) {
        return new Date(b.lastReadAt) - new Date(a.lastReadAt);
      })
      .slice(0, 25);

    if (!rows.length) {
      el.innerHTML =
        '<div class="empty-lib"><h3>Nothing opened yet</h3><p>Chapters you open will appear here so you can jump back in.</p></div>';
      return;
    }

    el.innerHTML = rows
      .map(function (p) {
        var t = titleById(p.titleId);
        var ch = t
          ? t.chapters.find(function (c) {
              return c.chapterId === p.chapterId;
            })
          : null;
        var titleName = (t && t.title) || p.titleName || p.titleId;
        var chLabel = (ch && ch.label) || p.chapterLabel || p.chapterId;
        var pct = clamp(p.percent);
        var completed = p.completed || pct >= D.DONE_AT;
        var sub = completed
          ? "Completed"
          : [pageText(p.page, p.totalPages), pct + "% read"]
              .filter(Boolean)
              .join(" · ");
        var url = D.readerUrl(p.titleId, p.chapterId, completed ? 1 : p.page);
        return (
          '<div class="rc-row">' +
          '<div class="thumb">' +
          coverHtml(t && t.coverUrl, p.titleId, titleName) +
          "</div>" +
          '<div class="rc-text"><div class="rc-title">' +
          esc(titleName) +
          "</div>" +
          '<div class="rc-sub">' +
          esc(chLabel) +
          " · " +
          esc(sub) +
          "</div></div>" +
          '<div class="rc-when">' +
          esc(D.timeAgo(p.lastReadAt)) +
          "</div>" +
          '<a class="pill-btn sm" href="' +
          esc(url) +
          '">' +
          (completed ? "Read again" : "Resume") +
          "</a></div>"
        );
      })
      .join("");
  }

  /* ------------------------------------------------------------------ */
  /*  render: Bookmarks                                                  */
  /* ------------------------------------------------------------------ */
  function renderBookmarks() {
    var el = $("libBookmarkList");
    if (!state.bookmarks.length) {
      el.innerHTML =
        '<div class="empty-lib"><h3>No bookmarks yet</h3><p>Tap the bookmark icon while reading to save a page here.</p></div>';
      return;
    }

    var groups = {};
    state.bookmarks.forEach(function (b) {
      (groups[b.titleId] = groups[b.titleId] || []).push(b);
    });

    el.innerHTML = Object.keys(groups)
      .map(function (titleId) {
        var t = titleById(titleId);
        var list = groups[titleId].slice().sort(function (a, b) {
          if (a.chapterId !== b.chapterId) {
            var ao = chapterOrder(t, a.chapterId);
            var bo = chapterOrder(t, b.chapterId);
            if (ao !== bo) return ao - bo;
          }
          return (Number(a.page) || 0) - (Number(b.page) || 0);
        });
        var name = (t && t.title) || list[0].titleName || titleId;
        return (
          '<section class="bm-group"><div class="bm-group-head">' +
          '<div class="thumb">' +
          coverHtml(t && t.coverUrl, titleId, name) +
          "</div>" +
          "<div><h3>" +
          esc(name) +
          "</h3><span>" +
          list.length +
          " bookmark" +
          (list.length !== 1 ? "s" : "") +
          "</span></div></div>" +
          list
            .map(function (b) {
              return bookmarkRow(t, b);
            })
            .join("") +
          "</section>"
        );
      })
      .join("");
  }

  function chapterOrder(t, chapterId) {
    var c =
      t &&
      t.chapters.find(function (x) {
        return x.chapterId === chapterId;
      });
    return c ? c.order || 0 : 9999;
  }

  function bookmarkRow(t, b) {
    var c =
      t &&
      t.chapters.find(function (x) {
        return x.chapterId === b.chapterId;
      });
    var chLabel = (c && c.label) || b.chapterLabel || b.chapterId;
    var editing = state.editingNote === b.id;
    return (
      '<div class="bm-row" data-bm="' +
      esc(b.id) +
      '">' +
      '<div class="bm-top"><div class="bm-where">' +
      esc(chLabel) +
      "<small>" +
      esc(pageText(b.page, b.totalPages)) +
      (b.createdAt ? " · " + esc(D.fmtDate(b.createdAt)) : "") +
      "</small></div>" +
      '<div class="bm-btns">' +
      '<a class="pill-btn sm" href="' +
      esc(D.readerUrl(b.titleId, b.chapterId, b.page)) +
      '">Go to page</a>' +
      '<button class="link-btn" data-act="bm-note">' +
      (b.note ? "Edit note" : "Add note") +
      "</button>" +
      '<button class="link-btn" data-act="bm-del">Remove</button></div></div>' +
      (editing
        ? '<div class="bm-edit"><input class="set-input" maxlength="300" placeholder="Add a short note" value="' +
          esc(b.note || "") +
          '">' +
          '<button class="pill-btn sm" data-act="bm-save">Save</button>' +
          '<button class="pill-btn ghost sm" data-act="bm-cancel">Cancel</button></div>'
        : b.note
          ? '<div class="bm-note">' + esc(b.note) + "</div>"
          : "") +
      "</div>"
    );
  }

  /* ------------------------------------------------------------------ */
  /*  render all + tabs                                                  */
  /* ------------------------------------------------------------------ */
  function renderAll() {
    renderStats();
    renderContinue();
    renderFilterMenus();
    renderTitles();
    renderRecent();
    renderBookmarks();
    var recentCount = state.progress.filter(function (p) {
      return p.lastReadAt;
    }).length;
    $("cntTitles").textContent = state.model.length;
    $("cntRecent").textContent = Math.min(recentCount, 25);
    $("cntBookmarks").textContent = state.bookmarks.length;
    setTab(state.tab, true);
  }

  function setTab(name, silent) {
    if (!["titles", "recent", "bookmarks"].includes(name)) name = "titles";
    state.tab = name;
    document.querySelectorAll(".acct-tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll(".acct-panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    if (!silent && history.replaceState)
      history.replaceState(null, "", "#" + name);
  }

  /* ------------------------------------------------------------------ */
  /*  events                                                             */
  /* ------------------------------------------------------------------ */
  function bind() {
    document.querySelectorAll(".acct-tab-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        setTab(b.dataset.tab);
      });
    });

    // filter dropdown open/close
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-menu]");
      document.querySelectorAll(".filter-dropdown-menu").forEach(function (m) {
        if (!btn || m.id !== btn.dataset.menu) m.classList.remove("open");
      });
      if (btn) $(btn.dataset.menu).classList.toggle("open");
    });

    // checkbox filters
    document.addEventListener("change", function (e) {
      var cb = e.target.closest("input[data-filter]");
      if (!cb) return;
      var set = state.filters[cb.dataset.filter];
      cb.checked ? set.add(cb.value) : set.delete(cb.value);
      updateFilterCounts();
      renderTitles();
    });

    $("libSearch").addEventListener("input", function (e) {
      state.filters.q = e.target.value;
      renderTitles();
    });
    $("libSort").addEventListener("change", function (e) {
      state.filters.sort = e.target.value;
      renderTitles();
    });
    $("statusChips").addEventListener("click", function (e) {
      var chip = e.target.closest("[data-status]");
      if (!chip) return;
      state.filters.status = chip.dataset.status;
      document.querySelectorAll("#statusChips .chip").forEach(function (c) {
        c.classList.toggle("active", c === chip);
      });
      renderTitles();
    });
    $("clearFilters").addEventListener("click", function () {
      state.filters.q = "";
      state.filters.status = "all";
      state.filters.imprint.clear();
      state.filters.format.clear();
      $("libSearch").value = "";
      document.querySelectorAll("#statusChips .chip").forEach(function (c) {
        c.classList.toggle("active", c.dataset.status === "all");
      });
      renderFilterMenus();
      renderTitles();
    });

    // expand / collapse chapter list
    $("libTitleList").addEventListener("click", function (e) {
      var t = e.target.closest('[data-act="toggle"]');
      if (!t) return;
      var card = t.closest(".lt-card");
      var id = card.dataset.title;
      state.open.has(id) ? state.open.delete(id) : state.open.add(id);
      card.classList.toggle("open");
      t.setAttribute("aria-expanded", state.open.has(id));
    });

    // bookmarks: note edit / save / delete
    $("libBookmarkList").addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var row = btn.closest(".bm-row");
      var id = row && row.dataset.bm;
      var act = btn.dataset.act;

      if (act === "bm-note") {
        state.editingNote = id;
        renderBookmarks();
        var inp = document.querySelector(
          '.bm-row[data-bm="' + id + '"] .bm-edit input',
        );
        if (inp) inp.focus();
      } else if (act === "bm-cancel") {
        state.editingNote = null;
        renderBookmarks();
      } else if (act === "bm-save") {
        var val = row.querySelector(".bm-edit input").value.trim();
        btn.disabled = true;
        try {
          await D.bookmarks.update(id, { note: val });
          var bm = state.bookmarks.find(function (b) {
            return b.id === id;
          });
          if (bm) bm.note = val;
          state.editingNote = null;
          renderBookmarks();
          showToast("Note saved.", "success");
        } catch (err) {
          btn.disabled = false;
          showToast(err.message, "error");
        }
      } else if (act === "bm-del") {
        if (!confirm("Remove this bookmark?")) return;
        try {
          await D.bookmarks.remove(id);
          state.bookmarks = state.bookmarks.filter(function (b) {
            return b.id !== id;
          });
          renderBookmarks();
          renderStats();
          $("cntBookmarks").textContent = state.bookmarks.length;
          showToast("Bookmark removed.", "info");
        } catch (err) {
          showToast(err.message, "error");
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  boot                                                               */
  /* ------------------------------------------------------------------ */
  // script.js calls onAuthChange() after sign-in / sign-up
  window.onAuthChange = function () {
    if (typeof updateNavAuthBtn === "function") updateNavAuthBtn();
    if (typeof updateNavAuth === "function") updateNavAuth();
    load();
  };

  document.addEventListener("DOMContentLoaded", async function () {
    var h = (location.hash || "").replace("#", "");
    if (h) state.tab = h;
    bind();
    showScreen("loading");
    // restores the session from the refresh cookie when needed
    try {
      if (typeof chRestoreSessionFromToken === "function")
        await chRestoreSessionFromToken();
    } catch (_) {}
    load();
  });
})();
