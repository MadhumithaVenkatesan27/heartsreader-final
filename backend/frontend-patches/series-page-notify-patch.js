/* Patch for series-page.js : first-time "you'll be notified" popup + "Don't show this again".
   Behaviour:
   - Press "Notify me": the popup explains that you get a notification EVERY time a chapter is added
     and when the volume is released. It has a "Don't show this again" checkbox.
   - If that box was ticked once, later presses subscribe straight away (no popup).
   - Pressing the green "Notifying you" button turns it off (as before).
   Replace the existing nAsk() with the one below, and replace the two actions `notify` and `nconfirm`. */

const NK_SKIP = "ch_notify_skip_info"; // "1" = never show the popup again
const nSkipInfo = () => {
  try { return localStorage.getItem(NK_SKIP) === "1"; } catch (e) { return false; }
};

function nAsk(n) {
  const gen = nGet().general !== false;
  openModal(
    `<div class="tp-nf"><i class="ti ti-bell-ringing" aria-hidden="true"></i>
      <h3>Get notified</h3>
      <p>We'll send you a notification <b>every time a new chapter</b> of <b>${h(plain(C.name))}</b> is added, and as soon as <b>Volume ${n}</b> is released${V[n].dd ? " (" + h(V[n].dd) + ")" : ""}.</p>
      <label class="tp-nf-ck"><input type="checkbox" id="tpNfGen"${gen ? " checked" : ""}> Also send me Crossed Hearts updates: new releases, sales and announcements</label>
      <label class="tp-nf-ck"><input type="checkbox" id="tpNfSkip"> Don't show this message again</label>
      <button type="button" class="tp-b pri" data-act="nconfirm" data-n="${n}">Turn on notifications</button>
      <small>You can turn them off at any time.</small></div>`,
    "tp-nfm",
  );
}

/* in the `actions` object: */
notify(el) {
  const n = +el.dataset.n;
  if (nOn(n)) return nDisable(n);
  if (nSkipInfo()) return nEnable(n, nGet().general !== false); // popup switched off by the reader
  nAsk(n);
},
nconfirm(el) {
  const g = document.getElementById("tpNfGen");
  const s = document.getElementById("tpNfSkip");
  if (s && s.checked) { try { localStorage.setItem(NK_SKIP, "1"); } catch (e) {} }
  nEnable(+el.dataset.n, g ? g.checked : true);
},

/* Also in nEnable(): change the success toast to
   nToast("You're on the list! We'll notify you for every new chapter and when Volume " + n + " is out.");
   Optional: to let readers undo "Don't show again", add a small link in the footer that runs
   localStorage.removeItem("ch_notify_skip_info"). */
