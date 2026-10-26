// Keeps the language bar at the top of README.md and of every docs/i18n/README.<code>.md in sync.
//
//   node scripts/update-readme-langs.mjs           rewrite the bars (and fix GitHub route links in translations)
//   node scripts/update-readme-langs.mjs --check   change nothing, exit 1 if something is out of date or broken
//
// The bar is a one-line row of the most popular languages plus a collapsible "all languages" list. Names come from
// src/locales/<code>.json (_meta.name); a language gets a link when docs/i18n/README.<code>.md exists.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

// shown on one line; everything else goes into the collapsible list
const TOP = ["en", "zh-CN", "es", "hi", "ar", "pt-BR", "ru", "ja", "de", "fr"];

const read = (p) => readFileSync(p, "utf8").replace(/^﻿/, "");

// ---- languages
const localesDir = join(root, "src", "locales");
const i18nDir = join(root, "docs", "i18n");
const names = {};
for (const f of readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
  const code = f.slice(0, -5);
  names[code] = JSON.parse(read(join(localesDir, f)))._meta?.name ?? code;
}

let display;
try {
  display = new Intl.DisplayNames(["en"], { type: "language" });
} catch {
  display = null;
}
const english = (code) => {
  try {
    const n = display?.of(code);
    return n && n !== code ? n : names[code];
  } catch {
    return names[code];
  }
};

const readmeCodes = new Set(
  readdirSync(i18nDir)
    .map((f) => f.match(/^README\.(.+)\.md$/)?.[1])
    .filter(Boolean),
);
readmeCodes.add("en"); // the root README.md
const all = [...readmeCodes].filter((c) => names[c]).sort((a, b) => english(a).localeCompare(english(b), "en"));
const top = TOP.filter((c) => readmeCodes.has(c) && names[c]);

// ---- bar
const START = "<!-- LANGUAGES:START -->";
const END = "<!-- LANGUAGES:END -->";

function bar(current, isRoot) {
  const href = (code) => (code === "en" ? (isRoot ? "README.md" : "../../README.md") : isRoot ? `docs/i18n/README.${code}.md` : `README.${code}.md`);
  const link = (code) => (code === current ? `**${names[code]}**` : `[${names[code]}](${href(code)})`);
  // a language outside the top list still appears first in its own README
  const head = top.includes(current) ? top : [current, ...top];
  return [
    START,
    head.map(link).join(" · "),
    "",
    "<details>",
    `<summary>🌐 All languages (${all.length})</summary>`,
    "",
    all.map(link).join(" · "),
    "",
    "</details>",
    END,
  ].join("\n");
}

// ---- files
const targets = [{ file: join(root, "README.md"), code: "en", isRoot: true }];
for (const code of [...readmeCodes].filter((c) => c !== "en")) targets.push({ file: join(i18nDir, `README.${code}.md`), code, isRoot: false });

const problems = [];
let changed = 0;

for (const t of targets) {
  const rel = t.file.slice(root.length + 1);
  if (!names[t.code]) {
    problems.push(`${rel}: no src/locales/${t.code}.json for this language`);
    continue;
  }
  let text = read(t.file);
  const crlf = text.includes("\r\n");
  if (crlf) text = text.replace(/\r\n/g, "\n");
  const original = text;

  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s === -1 || e === -1 || e < s) {
    problems.push(`${rel}: LANGUAGES:START / LANGUAGES:END markers are missing`);
    continue;
  }
  text = text.slice(0, s) + bar(t.code, t.isRoot) + text.slice(e + END.length);

  // GitHub route links (releases, issues) are relative to the *rendered page*: translations sit two folders deeper
  if (!t.isRoot) text = text.replace(/\]\((?:\.\.\/)+(releases|issues|pulls)\b/g, "](../../../../$1");

  if (text !== original) {
    if (check) problems.push(`${rel}: out of date (run: npm run readme-langs)`);
    else {
      writeFileSync(t.file, crlf ? text.replace(/\n/g, "\r\n") : text);
      changed++;
    }
  }

  // every relative file link and image must exist
  for (const m of text.matchAll(/\]\(([^)\s]+)|(?:src|href)="([^"]+)"/g)) {
    const target = (m[1] ?? m[2]).split("#")[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    if (/(?:^|\/)(releases|issues|pulls)$/.test(target)) continue; // GitHub routes, not files
    if (!existsSync(resolve(dirname(t.file), target))) problems.push(`${rel}: broken link ${target}`);
  }
}

console.log(`${targets.length} README files, ${all.length} languages (${top.length} on the main line)`);
if (!check) console.log(changed ? `updated ${changed} file(s)` : "everything was already up to date");
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  problems.slice(0, 40).forEach((p) => console.log("  " + p));
  process.exit(1);
}
if (check) console.log("✓ language bars and links are up to date");
