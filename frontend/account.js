/* =====================================================================
   Crossed Hearts — My Account  (account.js)
   Tabs: Orders (digital purchases) · Settings (profile)
   Reading, owned titles and bookmarks live on My Library (my-library.html).
   Needs: script.js, ch-data.js   ·   Markup: account.html
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
    tab: "orders",
    // orders
    orders: [], // digital book purchases
    ordersFailed: false,
    // settings
    profile: null,
    edit: null, // "name" | "email" | "phone" | "password"
    step: 1, // email / phone are two-step (details -> code)
    pending: "", // the new email / phone waiting for its code
  };

  /* ------------------------------------------------------------------ */
  /*  screens                                                            */
  /* ------------------------------------------------------------------ */
  function showScreen(kind, opts) {
    opts = opts || {};
    var box = $("acctState");
    var main = $("acctMain");
    if (kind === "ready") {
      box.innerHTML = "";
      main.hidden = false;
      return;
    }
    main.hidden = true;
    if (kind === "loading") {
      box.innerHTML =
        '<div class="sk-wrap" aria-busy="true"><div class="sk sm"></div><div class="sk"></div><div class="sk"></div></div>';
    } else if (kind === "out") {
      box.innerHTML =
        '<div class="st-box"><h3>Sign in to manage your account</h3><p>' +
        esc(
          opts.message ||
            "Your orders and account details are here once you sign in.",
        ) +
        '</p><button class="btn-gold" onclick="openAuth()">Sign In</button></div>';
    } else if (kind === "error") {
      box.innerHTML =
        '<div class="st-box"><h3>We couldn\'t load your account</h3><p>' +
        esc(opts.message || "Please try again.") +
        '</p><button class="btn-gold" id="acctRetry">Try again</button></div>';
      $("acctRetry").onclick = load;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  load                                                               */
  /* ------------------------------------------------------------------ */
  var seqNo = 0;
  async function load() {
    if (!D.isSignedIn()) {
      showScreen("out");
      return;
    }
    var seq = ++seqNo;
    showScreen("loading");

    var res = await Promise.allSettled([
      D.orders.digital(),
      D.account.profile(),
    ]);
    if (seq !== seqNo) return;

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

    state.ordersFailed = res[0].status !== "fulfilled";
    if (!state.ordersFailed) state.orders = res[0].value;

    if (res[1].status === "fulfilled") state.profile = res[1].value;
    else state.profile = null;

    // total failure (nothing at all loaded)
    if (state.ordersFailed && !state.profile) {
      showScreen("error", { message: res[1].reason.message });
      return;
    }

    showScreen("ready");
    renderOrders();
    renderSettings();
    setTab(state.tab, true);
  }

  /* ------------------------------------------------------------------ */
  /*  ORDERS                                                             */
  /* ------------------------------------------------------------------ */
  function allOrders() {
    return state.orders.slice().sort(function (x, y) {
      return (
        new Date(y.paidAt || y.createdAt || 0) -
        new Date(x.paidAt || x.createdAt || 0)
      );
    });
  }

  function digitalCard(p) {
    var book =
      p.bookTitle || (p.bookId && p.bookId.title) || "Book purchase";
    var isBook = (p.purchaseType || "book") === "book";
    var chapters =
      p.chapterTitles && p.chapterTitles.length
        ? p.chapterTitles.join(", ")
        : isBook
          ? "Full digital volume"
          : "Selected chapter";
    var id = p._id || p.id;
    return (
      '<div class="acct-status-card ord-card"><div class="ord-top"><div>' +
      '<span class="ord-type">Book</span>' +
      "<h3>" +
      esc(book) +
      "</h3>" +
      '<span class="po-date">' +
      esc(D.fmtDate(p.paidAt || p.createdAt, true)) +
      (p.invoiceNumber ? " · " + esc(p.invoiceNumber) : "") +
      "</span></div>" +
      '<span class="acct-badge active">' +
      esc(p.status || "Paid") +
      "</span></div>" +
      '<div class="ord-lines"><div class="ord-line"><div class="ol-text">' +
      '<div class="po-title">' +
      esc(chapters) +
      "</div>" +
      '<div class="po-meta">' +
      (isBook ? "Full volume" : "Chapter purchase") +
      "</div></div></div></div>" +
      '<div class="ord-foot"><a class="link-btn" href="my-library.html">Open in My Library</a>' +
      '<div style="display:flex;gap:12px;align-items:center"><strong>' +
      esc(D.money(p.amount, p.currency)) +
      "</strong>" +
      (id
        ? '<button class="pill-btn gold sm" data-act="invoice" data-id="' +
          esc(id) +
          '">Invoice</button>'
        : "") +
      "</div></div></div>"
    );
  }

  function renderOrders() {
    var rows = allOrders();
    var spent = rows.reduce(function (sum, p) {
      return sum + Number(p.amount || 0);
    }, 0);
    var cur = (rows[0] && rows[0].currency) || "USD";

    $("ordPartial").hidden = !state.ordersFailed;
    if (state.ordersFailed) {
      $("ordPartialText").textContent =
        "We couldn't load your order history right now, so this list may be incomplete.";
    }

    $("ordStats").innerHTML = rows.length
      ? '<div class="print-stat-box"><div class="print-stat-num">' +
        rows.length +
        '</div><div class="print-stat-label">Books purchased</div></div>' +
        '<div class="print-stat-box"><div class="print-stat-num">' +
        esc(D.money(spent, cur)) +
        '</div><div class="print-stat-label">Total spent</div></div>'
      : "";

    $("cntOrders").textContent = rows.length;

    var list = $("ordList");
    if (!rows.length) {
      list.innerHTML =
        '<div class="empty-lib"><h3>No purchases yet</h3><p>Books you buy will be listed here with their invoices.</p>' +
        '<a href="index.html#allSeries" class="btn-gold">Browse titles →</a></div>';
      return;
    }
    list.innerHTML = rows.map(digitalCard).join("");
  }

  async function downloadInvoice(id, btn) {
    btn.disabled = true;
    try {
      var blob = await D.orders.invoice(id);
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "crossed-hearts-invoice-" + id + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      showToast(err.message || "Could not download the invoice.", "error");
    } finally {
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  SETTINGS                                                           */
  /* ------------------------------------------------------------------ */
  function badge(ok) {
    return ok
      ? '<span class="ver-badge yes">Verified</span>'
      : '<span class="ver-badge no">Not verified</span>';
  }

  function card(key, label, valueHtml, buttonLabel, formHtml) {
    var editing = state.edit === key;
    return (
      '<section class="set-card" data-card="' +
      key +
      '"><div class="set-row"><div>' +
      '<div class="set-label">' +
      label +
      '</div><div class="set-value">' +
      valueHtml +
      "</div></div>" +
      (editing
        ? ""
        : '<button class="pill-btn ghost sm" data-act="edit" data-key="' +
          key +
          '">' +
          buttonLabel +
          "</button>") +
      "</div>" +
      (editing ? formHtml : "") +
      "</section>"
    );
  }

  function field(label, name, type, extra) {
    return (
      '<div class="set-field"><label for="f-' +
      name +
      '">' +
      label +
      "</label>" +
      '<input class="set-input" id="f-' +
      name +
      '" name="' +
      name +
      '" type="' +
      type +
      '" ' +
      (extra || "") +
      " required></div>"
    );
  }

  function formShell(key, inner, submitLabel, extraBtns) {
    return (
      '<form class="set-form" data-form="' +
      key +
      '" novalidate>' +
      inner +
      '<p class="set-msg" id="setMsg" role="status"></p>' +
      '<div class="set-btns"><button class="pill-btn" type="submit">' +
      submitLabel +
      "</button>" +
      '<button class="pill-btn ghost" type="button" data-act="cancel">Cancel</button>' +
      (extraBtns || "") +
      "</div></form>"
    );
  }

  function renderSettings() {
    var p = state.profile;
    var el = $("setBody");
    if (!p) {
      el.innerHTML =
        '<div class="st-box"><h3>Couldn\'t load your details</h3><p>Please try again.</p><button class="btn-gold" onclick="location.reload()">Reload</button></div>';
      return;
    }

    var nameForm = formShell(
      "name",
      field(
        "Username",
        "name",
        "text",
        'maxlength="30" autocomplete="nickname" value="' +
          esc(p.name || "") +
          '"',
      ) +
        '<p class="set-hint">3–30 characters. This is the name shown across the site.</p>',
      "Save username",
    );

    var emailForm =
      state.step === 1
        ? formShell(
            "email",
            field(
              "New email address",
              "email",
              "email",
              'autocomplete="email"',
            ) +
              field(
                "Current password",
                "password",
                "password",
                'autocomplete="current-password"',
              ) +
              '<p class="set-hint">We\'ll email a verification code to the new address.</p>',
            "Send verification code",
          )
        : formShell(
            "email",
            '<p class="set-hint">Enter the code we sent to <strong>' +
              esc(state.pending) +
              "</strong>.</p>" +
              field(
                "Verification code",
                "code",
                "text",
                'inputmode="numeric" autocomplete="one-time-code" maxlength="8"',
              ),
            "Confirm email",
            '<button class="link-btn" type="button" data-act="restart">Use a different email</button>',
          );

    var phoneForm =
      state.step === 1
        ? formShell(
            "phone",
            field(
              "Mobile number",
              "phone",
              "tel",
              'autocomplete="tel" placeholder="+91 98765 43210"',
            ) +
              '<p class="set-hint">Include your country code. We\'ll text a verification code to this number.</p>',
            "Send verification code",
          )
        : formShell(
            "phone",
            '<p class="set-hint">Enter the code we sent to <strong>' +
              esc(state.pending) +
              "</strong>.</p>" +
              field(
                "Verification code",
                "code",
                "text",
                'inputmode="numeric" autocomplete="one-time-code" maxlength="8"',
              ),
            "Confirm number",
            '<button class="link-btn" type="button" data-act="restart">Use a different number</button>',
          );

    var passForm = formShell(
      "password",
      field(
        "Current password",
        "current",
        "password",
        'autocomplete="current-password"',
      ) +
        field(
          "New password",
          "next",
          "password",
          'autocomplete="new-password" minlength="8"',
        ) +
        field(
          "Confirm new password",
          "confirm",
          "password",
          'autocomplete="new-password" minlength="8"',
        ) +
        '<p class="set-hint">At least 8 characters.</p>',
      "Update password",
    );

    el.innerHTML =
      (p.createdAt
        ? '<p class="soft-note">Member since ' +
          esc(D.fmtDate(p.createdAt)) +
          "</p>"
        : "") +
      card(
        "name",
        "Username",
        p.name ? esc(p.name) : "<em>Not set</em>",
        "Change",
        nameForm,
      ) +
      card(
        "email",
        "Email",
        esc(p.email || "") + badge(!!p.emailVerified),
        "Change",
        emailForm,
      ) +
      card(
        "phone",
        "Mobile number",
        p.phone
          ? esc(p.phone) + badge(!!p.phoneVerified)
          : "<em>Not added</em>",
        p.phone ? "Change" : "Add",
        phoneForm,
      ) +
      card("password", "Password", "<em>••••••••</em>", "Change", passForm) +
      '<div class="set-signout"><button class="pill-btn danger" data-act="signout">Sign out</button></div>';

    if (state.edit) {
      var first = el.querySelector(".set-form .set-input");
      if (first) first.focus();
    }
  }

  function setMsg(text, kind) {
    var m = $("setMsg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "set-msg" + (kind ? " " + kind : "");
  }

  function closeEdit() {
    state.edit = null;
    state.step = 1;
    state.pending = "";
    renderSettings();
  }

  // keep script.js's cached user + nav in step with what we just saved
  function syncSessionUser(patch) {
    try {
      if (typeof CH_USER !== "undefined" && CH_USER) {
        Object.assign(CH_USER, patch);
        sessionStorage.setItem("ch_user", JSON.stringify(CH_USER));
      }
    } catch (_) {}
    if (typeof updateNavAuthBtn === "function") updateNavAuthBtn();
    if (typeof updateNavAuth === "function") updateNavAuth();
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function submitForm(form) {
    var key = form.dataset.form;
    var btn = form.querySelector('button[type="submit"]');
    var val = function (n) {
      var i = form.elements[n];
      return i ? i.value : "";
    };
    setMsg("");

    function fail(msg) {
      setMsg(msg, "error");
    }
    async function run(fn) {
      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = "Please wait…";
      try {
        await fn();
      } catch (err) {
        if (err.status === 401 && !/password/i.test(err.message)) {
          D.dropSession();
          showScreen("out", {
            message: "Your session expired. Please sign in again.",
          });
          return;
        }
        fail(err.message || "Something went wrong. Please try again.");
      } finally {
        if (btn.isConnected) {
          btn.disabled = false;
          btn.textContent = old;
        }
      }
    }

    /* ---- username ---- */
    if (key === "name") {
      var name = val("name").trim();
      if (name.length < 3 || name.length > 30)
        return fail("Use between 3 and 30 characters.");
      if (name === (state.profile.name || "")) return closeEdit();
      return run(async function () {
        var p = await D.account.updateName(name);
        state.profile = Object.assign({}, state.profile, p, {
          name: p.name || name,
        });
        syncSessionUser({ name: state.profile.name });
        closeEdit();
        showToast("Username updated.", "success");
      });
    }

    /* ---- email ---- */
    if (key === "email" && state.step === 1) {
      var email = val("email").trim().toLowerCase();
      var pw = val("password");
      if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.");
      if (email === String(state.profile.email || "").toLowerCase())
        return fail("That's already your email.");
      if (!pw) return fail("Enter your current password.");
      return run(async function () {
        await D.account.requestEmailChange(email, pw);
        state.pending = email;
        state.step = 2;
        renderSettings();
        setMsg("Code sent. Check your inbox.", "ok");
      });
    }
    if (key === "email" && state.step === 2) {
      var ecode = val("code").trim();
      if (!/^\d{4,8}$/.test(ecode))
        return fail("Enter the numeric code from the email.");
      return run(async function () {
        var oldEmail = state.profile.email;
        var p = await D.account.confirmEmailChange(ecode);
        var newEmail = p.email || state.pending;
        state.profile = Object.assign({}, state.profile, p, {
          email: newEmail,
          emailVerified: p.emailVerified !== false,
        });
        syncSessionUser({ email: newEmail });
        closeEdit();
        showToast("Email updated.", "success");
      });
    }

    /* ---- phone ---- */
    if (key === "phone" && state.step === 1) {
      var phone = val("phone").replace(/[\s\-().]/g, "");
      if (!/^\+[1-9][0-9]{7,14}$/.test(phone))
        return fail("Include your country code, e.g. +91 98765 43210.");
      if (phone === String(state.profile.phone || "").replace(/[\s\-().]/g, ""))
        return fail("That's already your number.");
      return run(async function () {
        await D.account.requestPhoneChange(phone);
        state.pending = phone;
        state.step = 2;
        renderSettings();
        setMsg("Code sent by SMS.", "ok");
      });
    }
    if (key === "phone" && state.step === 2) {
      var pcode = val("code").trim();
      if (!/^\d{4,8}$/.test(pcode))
        return fail("Enter the numeric code from the SMS.");
      return run(async function () {
        var p = await D.account.confirmPhoneChange(pcode);
        state.profile = Object.assign({}, state.profile, p, {
          phone: p.phone || state.pending,
          phoneVerified: p.phoneVerified !== false,
        });
        closeEdit();
        showToast("Mobile number updated.", "success");
      });
    }

    /* ---- password ---- */
    if (key === "password") {
      var cur = val("current"),
        next = val("next"),
        conf = val("confirm");
      if (!cur) return fail("Enter your current password.");
      if (next.length < 8)
        return fail("New password must be at least 8 characters.");
      if (next !== conf) return fail("The new passwords don't match.");
      if (next === cur) return fail("Choose a password you haven't used here.");
      return run(async function () {
        await D.account.changePassword(cur, next);
        closeEdit();
        showToast("Password updated.", "success");
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  tabs + events                                                      */
  /* ------------------------------------------------------------------ */
  function setTab(name, silent) {
    if (!["orders", "settings"].includes(name)) name = "orders";
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

  function bind() {
    document.querySelectorAll(".acct-tab-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        setTab(b.dataset.tab);
      });
    });

    $("ordList").addEventListener("click", function (e) {
      var b = e.target.closest('[data-act="invoice"]');
      if (b) downloadInvoice(b.dataset.id, b);
    });

    $("setBody").addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var act = b.dataset.act;
      if (act === "edit") {
        state.edit = b.dataset.key;
        state.step = 1;
        state.pending = "";
        renderSettings();
      } else if (act === "cancel") {
        closeEdit();
      } else if (act === "restart") {
        state.step = 1;
        state.pending = "";
        renderSettings();
      } else if (act === "signout") {
        if (typeof signOut === "function") signOut();
      }
    });

    $("setBody").addEventListener("submit", function (e) {
      var f = e.target.closest("form[data-form]");
      if (!f) return;
      e.preventDefault();
      submitForm(f);
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
    try {
      if (typeof chRestoreSessionFromToken === "function")
        await chRestoreSessionFromToken();
    } catch (_) {}
    load();
  });
})();
