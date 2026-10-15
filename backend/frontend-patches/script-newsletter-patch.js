/* script.js : replace handleNewsletter() with this (it was only console.log + a toast) */
async function handleNewsletter(e) {
  e.preventDefault();
  const inp = e.target.querySelector('input[type="email"]');
  if (!inp || !inp.value) return;
  try {
    const r = await fetch(CH_API_URL + "/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inp.value.trim(), name: typeof CH_USER !== "undefined" && CH_USER ? CH_USER.name : undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || "Could not subscribe. Try again.");
    showToast("✓ " + (j.message || "You're in!"), "success");
    inp.value = "";
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* The purchase-confirmation email is now sent by the backend as soon as the payment is verified,
   so the "EMAIL TRIGGER: Purchase confirm" console.log in script.js can simply be deleted. */
