// Run once from inside your Frontend folder:   node fix-nav-links.js
// - Library links  -> my-library.html   (was account.html#digital / library.html)
// - removes every "Wishlist" nav link
// - account-pages.css -> account.css
const fs = require("fs");
const files = fs.readdirSync(".").filter((f) => f.endsWith(".html") && f !== "wishlist.html");
let n = 0;
for (const f of files) {
  const o = fs.readFileSync(f, "utf8");
  const s = o
    .replace(/account\.html#digital/g, "my-library.html")
    .replace(/(?<![\w-])library\.html/g, "my-library.html")
    .replace(/[ \t]*<a\s+href="wishlist\.html"[^>]*>\s*Wishlist\s*<\/a>[ \t]*\n?/g, "")
    .replace(/account-pages\.css/g, "account.css");
  if (s !== o) { fs.writeFileSync(f, s); n++; console.log("updated", f); }
}
console.log(n + " file(s) updated. You can now delete wishlist.html.");
