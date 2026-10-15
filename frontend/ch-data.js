/* =====================================================================
   Crossed Hearts — shared data layer  (ch-data.js)
   Load AFTER script.js on: my-my-library.html, account.html, reader.html.   Exposes   window.CHData

   Every function here talks to the backend through ONE helper
   (request) so the backend developer only has to match the endpoint
   list in BACKEND_SUMMARY.md.  No sample data lives in this file.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- basics ---------- */
  var apiBase = function () {
    var u =
      typeof CH_API_URL !== "undefined" ? CH_API_URL : window.CH_API_URL || "";
    return String(u).replace(/\/$/, "");
  };
  var getToken = function () {
    return sessionStorage.getItem("ch_token");
  };
  var isSignedIn = function () {
    return !!getToken() && (typeof CH_USER !== "undefined" ? !!CH_USER : true);
  };

  function ApiError(message, status, data) {
    var e = new Error(message);
    e.name = "ApiError";
    e.status = status || 0;
    e.data = data || null;
    return e;
  }

  /* ---------- request helper ----------
     Success shape expected from the backend (same as the rest of the site):
       { status: "success", data: { ... } }
     Error shape:  { status: "fail"|"error", message: "..." }            */
  // Access tokens last only 15 minutes. Ask the server for a fresh one
  // (uses the refresh cookie, same call script.js makes on page load).
  var refreshing = null;
  function refreshToken() {
    if (refreshing) return refreshing;
    refreshing = fetch(apiBase() + "/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (d) {
        if (d && d.status === "success" && d.accessToken) {
          sessionStorage.setItem("ch_token", d.accessToken);
          return d.accessToken;
        }
        return null;
      })
      .catch(function () {
        return null;
      })
      .then(function (t) {
        refreshing = null;
        return t;
      });
    return refreshing;
  }

  async function request(path, opts, retried) {
    opts = opts || {};
    var token = getToken();
    if (!token) token = await refreshToken();
    if (!token) throw ApiError("Please sign in to continue.", 401);

    var headers = {
      Accept: "application/json",
      Authorization: "Bearer " + token,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    var res;
    try {
      res = await fetch(apiBase() + path, {
        method: opts.method || "GET",
        headers: headers,
        credentials: "include",
        keepalive: !!opts.keepalive,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      throw ApiError("Could not reach the server. Check your connection.", 0);
    }

    // expired token: refresh once and repeat the call
    if (res.status === 401 && !retried) {
      var fresh = await refreshToken();
      if (fresh) return request(path, opts, true);
    }

    var data = null;
    try {
      data = await res.json();
    } catch (_) {}

    if (!res.ok || (data && data.status && data.status !== "success")) {
      throw ApiError(
        (data && data.message) || "Something went wrong (" + res.status + ").",
        res.status,
        data,
      );
    }
    return data && data.data !== undefined ? data.data : data || {};
  }

  /* ---------- small helpers ---------- */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // only allow http(s) and same-site relative URLs inside href / src
  function safeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (/^(https?:)?\/\//i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ""; // javascript:, data:, etc.
    return u;
  }

  function fmtDate(d, withTime) {
    if (!d) return "";
    var dt = new Date(d);
    if (isNaN(dt)) return "";
    return withTime ? dt.toLocaleString() : dt.toLocaleDateString();
  }

  function timeAgo(d) {
    if (!d) return "";
    var t = new Date(d).getTime();
    if (isNaN(t)) return "";
    var diff = Math.round((t - Date.now()) / 1000);
    var abs = Math.abs(diff);
    var units = [
      ["year", 31536000],
      ["month", 2592000],
      ["week", 604800],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ];
    if (abs < 45) return "just now";
    try {
      var rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      for (var i = 0; i < units.length; i++) {
        if (abs >= units[i][1])
          return rtf.format(Math.round(diff / units[i][1]), units[i][0]);
      }
    } catch (_) {}
    return fmtDate(d);
  }

  function money(amount, currency) {
    var n = Number(amount || 0);
    var cur = currency || "USD";
    try {
      return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", {
        style: "currency",
        currency: cur,
        maximumFractionDigits: cur === "INR" ? 0 : 2,
      }).format(n);
    } catch (_) {
      return cur + " " + n.toFixed(2);
    }
  }

  // The reader treats a chapter as finished at 97 %. Keep the same rule.
  var DONE_AT = 97;

  function readerUrl(titleId, chapterId, page) {
    var u =
      "reader.html?title=" +
      encodeURIComponent(titleId) +
      "&ch=" +
      encodeURIComponent(chapterId);
    if (page && Number(page) > 1) u += "&page=" + Number(page);
    return u;
  }

  // the backend stores ids lower-case; chapters look like "ch1"
  function normTitle(t) {
    return String(t || "")
      .trim()
      .toLowerCase();
  }
  function normChapter(c) {
    c = String(c == null ? "" : c)
      .trim()
      .toLowerCase();
    return /^\d+$/.test(c) ? "ch" + c : c;
  }

  function normId(o) {
    if (o && !o.id && o._id) o.id = o._id;
    return o;
  }

  /* =====================================================================
     READING PROGRESS  (also feeds "recently opened")
     ===================================================================== */
  var progress = {
    _timer: null,
    _pending: null,

    // Debounced save. Call as often as you like (every page turn).
    save: function (p) {
      if (!getToken() || !p || !p.titleId || !p.chapterId) return;
      this._pending = p;
      var self = this;
      clearTimeout(this._timer);
      this._timer = setTimeout(function () {
        self.flush();
      }, 1500);
    },

    // Send immediately (chapter opened, tab closing, chapter changed)
    flush: async function (keepalive) {
      clearTimeout(this._timer);
      var body = this._pending;
      if (!body) return;
      this._pending = null;
      try {
        await request("/reading/progress", {
          method: "PUT",
          body: body,
          keepalive: !!keepalive,
        });
      } catch (e) {
        // network hiccup: keep it so the next save retries
        if (e.status !== 401 && e.status !== 403 && !this._pending)
          this._pending = body;
      }
    },

    // [{ titleId, chapterId, page, totalPages, percent, completed, lastReadAt }]
    list: async function (titleId) {
      var q = titleId ? "?titleId=" + encodeURIComponent(titleId) : "";
      var d = await request("/reading/progress" + q);
      return d.progress || [];
    },

    // A chapter was just opened (free preview or paid). Saved right away so it
    // shows under "recently opened" even if the reader never turns a page.
    // Keeps the page the reader already reached instead of resetting to 1.
    opened: async function (titleId, chapterId, page) {
      titleId = normTitle(titleId);
      chapterId = normChapter(chapterId);
      if (!getToken() || !titleId || !chapterId) return;
      var body = {
        titleId: titleId,
        chapterId: chapterId,
        page: Number(page) || 1,
      };
      try {
        var rows = await this.list(titleId);
        var old = rows.find(function (r) {
          return r.chapterId === chapterId;
        });
        if (old) {
          body.page = Number(page) || old.page || 1;
          body.totalPages = old.totalPages || 0;
          body.percent = old.percent;
          if (old.completed) body.completed = true;
        }
      } catch (_) {}
      this._pending = body;
      return this.flush();
    },
  };
  window.addEventListener("pagehide", function () {
    progress.flush(true);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") progress.flush(true);
  });

  /* =====================================================================
     BOOKMARKS
     ===================================================================== */
  var bookmarks = {
    _cache: {}, // titleId -> [bookmark]

    // all bookmarks, or only one title's
    list: async function (titleId) {
      var q = titleId ? "?titleId=" + encodeURIComponent(titleId) : "";
      var d = await request("/bookmarks" + q);
      var arr = (d.bookmarks || []).map(normId);
      if (titleId) this._cache[titleId] = arr;
      return arr;
    },

    add: async function (b) {
      // b: { titleId, chapterId, page, totalPages?, note? }
      var d = await request("/bookmarks", { method: "POST", body: b });
      var bm = normId(d.bookmark || {});
      if (!this._cache[b.titleId]) this._cache[b.titleId] = [];
      this._cache[b.titleId].push(bm);
      return bm;
    },

    update: async function (id, patch) {
      var d = await request("/bookmarks/" + encodeURIComponent(id), {
        method: "PATCH",
        body: patch,
      });
      return normId(d.bookmark || {});
    },

    remove: async function (id) {
      await request("/bookmarks/" + encodeURIComponent(id), {
        method: "DELETE",
      });
      var c = this._cache;
      Object.keys(c).forEach(function (k) {
        c[k] = c[k].filter(function (x) {
          return x.id !== id;
        });
      });
    },

    // used by the reader to know whether the current page is bookmarked
    find: function (titleId, chapterId, page) {
      return (this._cache[titleId] || []).find(function (b) {
        return b.chapterId === chapterId && Number(b.page) === Number(page);
      });
    },
  };

  /* =====================================================================
     LIBRARY  (titles owned + exactly which chapters are unlocked)
     ===================================================================== */
  var library = {
    titles: async function () {
      var d = await request("/library/titles");
      return d.titles || [];
    },
  };

  /* =====================================================================
     ORDERS  (re-uses the two endpoints the site already calls)
     ===================================================================== */
  var orders = {
    digital: async function () {
      var d = await request("/library");
      return d.purchases || [];
    },
    print: async function () {
      var d = await request("/physical-orders");
      return d.orders || [];
    },
    // returns a Blob (PDF)
    invoice: async function (purchaseId) {
      var res = await fetch(
        apiBase() +
          "/library/purchases/" +
          encodeURIComponent(purchaseId) +
          "/invoice.pdf",
        { headers: { Authorization: "Bearer " + getToken() } },
      );
      if (!res.ok)
        throw ApiError("Could not download the invoice.", res.status);
      return res.blob();
    },
  };

  /* =====================================================================
     ACCOUNT SETTINGS
     ===================================================================== */
  var account = {
    // { name, email, emailVerified, phone, phoneVerified, createdAt }
    profile: async function () {
      var d = await request("/account/profile");
      return d.profile || d.user || d;
    },
    updateName: async function (name) {
      var d = await request("/account/profile", {
        method: "PATCH",
        body: { name: name },
      });
      return d.profile || d.user || d;
    },
    requestEmailChange: function (newEmail, password) {
      return request("/account/email/change", {
        method: "POST",
        body: { newEmail: newEmail, password: password },
      });
    },
    confirmEmailChange: async function (code) {
      var d = await request("/account/email/confirm", {
        method: "POST",
        body: { code: code },
      });
      return d.profile || d.user || d;
    },
    requestPhoneChange: function (phone) {
      return request("/account/phone/change", {
        method: "POST",
        body: { phone: phone },
      });
    },
    confirmPhoneChange: async function (code) {
      var d = await request("/account/phone/confirm", {
        method: "POST",
        body: { code: code },
      });
      return d.profile || d.user || d;
    },
    changePassword: function (currentPassword, newPassword) {
      return request("/account/password", {
        method: "POST",
        body: { currentPassword: currentPassword, newPassword: newPassword },
      });
    },
  };

  /* ---------- clear a dead session the same way script.js does ---------- */
  function dropSession() {
    try {
      CH_USER = null;
    } catch (_) {}
    sessionStorage.removeItem("ch_token");
    sessionStorage.removeItem("ch_user");
    sessionStorage.removeItem("ch_lib");
    sessionStorage.removeItem("ch_library_purchases");
  }

  /* ---------- auto-record: reader.html?title=..&ch=..[&page=..] ----------
     Opening a chapter (free preview included) is saved without touching
     reader.html. Page turns are still saved by the reader via
     CHData.progress.save(...). */
  (function autoOpened() {
    if (!/(^|\/)reader(\.html)?\/?$/i.test(location.pathname)) return;
    var q = new URLSearchParams(location.search);
    var t = q.get("title"),
      c = q.get("ch");
    if (!t || !c) return;
    var go = function () {
      progress.opened(t, c, q.get("page")).catch(function () {});
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", go);
    else go();
  })();

  window.CHData = {
    request: request,
    ApiError: ApiError,
    isSignedIn: isSignedIn,
    dropSession: dropSession,
    esc: esc,
    safeUrl: safeUrl,
    fmtDate: fmtDate,
    timeAgo: timeAgo,
    money: money,
    readerUrl: readerUrl,
    normTitle: normTitle,
    normChapter: normChapter,
    DONE_AT: DONE_AT,
    progress: progress,
    bookmarks: bookmarks,
    library: library,
    orders: orders,
    account: account,
  };
})();
