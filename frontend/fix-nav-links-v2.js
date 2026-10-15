// Run from inside your Frontend folder:   node fix-nav-links-v2.js
const fs = require("fs");
const path = require("path");

/* ---------- 1. make sure account.css really exists ---------- */
function findFile(dir, name, depth) {
  depth = depth || 0;
  if (depth > 3) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) {
      const r = findFile(p, name, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

let cssHref = "account.css";
let cssPath = findFile(".", "account.css");
if (!cssPath) {
  const old = findFile(".", "account-pages.css");
  if (old) {
    cssPath = path.join(path.dirname(old), "account.css");
    fs.copyFileSync(old, cssPath);
    console.log("created", cssPath, "(copied from", old + ")");
  }
}
if (cssPath) {
  cssHref = path.relative(".", cssPath).split(path.sep).join("/");
  console.log("account.css found at:", cssHref);
} else {
  console.log(
    "!! account.css / account-pages.css NOT FOUND - the CSS file is missing from this folder.",
  );
}

/* ---------- 2. clean every html file ---------- */
const files = fs
  .readdirSync(".")
  .filter((f) => f.endsWith(".html") && f !== "wishlist.html");
let n = 0;
for (const f of files) {
  const o = fs.readFileSync(f, "utf8");
  let s = o
    .replace(/account\.html#digital/g, "my-library.html")
    .replace(/(?<![\w-])library\.html/g, "my-library.html")
    .replace(/account-pages\.css/g, "account.css");

  // <li> ... wishlist link ... </li>
  s = s.replace(
    /[ \t]*<li\b[^>]*>\s*<a\b[^>]*wishlist[^>]*>[\s\S]*?<\/a>\s*<\/li>[ \t]*\n?/gi,
    "",
  );
  // any anchor pointing to wishlist (any attribute order, multi-line), plus a separator before it
  s = s.replace(
    /(?:\s*(?:&middot;|&bull;|·|•|\|)\s*)?<a\b[^>]*wishlist[^>]*>[\s\S]*?<\/a>/gi,
    "",
  );

  // account + my-library pages must load account.css
  if (
    (f === "account.html" || f === "my-library.html") &&
    !/account\.css/.test(s)
  ) {
    s = s.replace(
      /<\/head>/i,
      '  <link rel="stylesheet" href="' + cssHref + '" />\n</head>',
    );
    console.log("added account.css link to", f);
  }

  if (s !== o) {
    fs.writeFileSync(f, s);
    n++;
    console.log("updated", f);
  }
  if (/wishlist/i.test(s))
    console.log(
      "!! 'wishlist' still appears in",
      f,
      "- search that file manually",
    );
}
console.log(n + " file(s) updated.");
