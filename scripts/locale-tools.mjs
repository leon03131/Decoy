// Helpers for keeping 170+ translations up to date without re-translating whole files.
//
//   node scripts/locale-tools.mjs delta [--langs de,fr] [--max 40]
//        Writes locale-delta/batch-N.json: the strings that some languages are still missing (English text) plus the
//        list of languages each batch covers. Give a batch to Gemini with the prompt in docs/TRANSLATING.md.
//   node scripts/locale-tools.mjs apply <answer.json>
//        Merges Gemini's answer ({ "<code>": { "<key>": "translation" } }) into src/locales, checking {placeholders}.
//   node scripts/locale-tools.mjs invalidate <key> [<key> ...]
//        Removes keys from every language except ru/en. Use it after changing the meaning of an existing string, so the
//        stale translations are not shown (English is used until the new translation arrives).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src", "locales");
const [cmd, ...rest] = process.argv.slice(2);

const read = (f) => JSON.parse(readFileSync(join(dir, f), "utf8").replace(/^﻿/, ""));
const save = (f, obj) => writeFileSync(join(dir, f), JSON.stringify(obj, null, 2) + "\n");
const codes = () => readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const holders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const flag = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};

const en = read("en.json");
const ru = read("ru.json");
const keys = Object.keys(ru).filter((k) => k !== "_meta");

if (cmd === "delta") {
  const only = flag("--langs")?.split(",");
  const perBatch = Number(flag("--max", 40));
  const missing = {}; // code -> [keys]
  for (const c of codes()) {
    if (c === "ru" || c === "en" || (only && !only.includes(c))) continue;
    const d = read(`${c}.json`);
    const m = keys.filter((k) => !(k in d));
    if (m.length) missing[c] = m;
  }
  const langs = Object.keys(missing);
  if (!langs.length) {
    console.log("Every language is complete.");
    process.exit(0);
  }
  // one batch = several languages that miss the same strings (usually all of them)
  mkdirSync(join(root, "locale-delta"), { recursive: true });
  let n = 0;
  for (let i = 0; i < langs.length; i += perBatch) {
    const group = langs.slice(i, i + perBatch);
    const union = [...new Set(group.flatMap((c) => missing[c]))].sort((a, b) => keys.indexOf(a) - keys.indexOf(b));
    const out = {
      _readme: "Translate every value of `strings` (English) into each language in `languages`. Keep {placeholders} unchanged. Answer with JSON only: { \"<code>\": { \"<key>\": \"translation\" } } for every language and every key listed under `needs`.",
      languages: Object.fromEntries(group.map((c) => [c, read(`${c}.json`)._meta?.name ?? c])),
      strings: Object.fromEntries(union.map((k) => [k, en[k] ?? ru[k]])),
      needs: Object.fromEntries(group.map((c) => [c, missing[c]])),
    };
    n++;
    writeFileSync(join(root, "locale-delta", `batch-${n}.json`), JSON.stringify(out, null, 2) + "\n");
    console.log(`locale-delta/batch-${n}.json: ${group.length} language(s), ${union.length} string(s)`);
  }
  console.log(`\nNext: send each batch to Gemini (see docs/TRANSLATING.md), save its answer, then  node scripts/locale-tools.mjs apply <answer.json>`);
} else if (cmd === "apply") {
  const file = rest[0];
  if (!file || !existsSync(file)) {
    console.error("usage: node scripts/locale-tools.mjs apply <answer.json>");
    process.exit(1);
  }
  let answer = readFileSync(file, "utf8").replace(/^﻿/, "").trim();
  answer = answer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); // tolerate a markdown fence
  const data = JSON.parse(answer);
  let added = 0;
  let skipped = 0;
  for (const [code, strings] of Object.entries(data)) {
    if (code.startsWith("_") || !existsSync(join(dir, `${code}.json`)) || typeof strings !== "object") continue;
    const d = read(`${code}.json`);
    for (const [k, v] of Object.entries(strings)) {
      if (!keys.includes(k) || typeof v !== "string" || !v.trim()) { skipped++; continue; }
      if (holders(v) !== holders(ru[k])) {
        console.log(`  skipped ${code}/${k}: {placeholders} differ`);
        skipped++;
        continue;
      }
      d[k] = v;
      added++;
    }
    // keep the same key order as ru.json
    const ordered = { _meta: d._meta };
    for (const k of keys) if (k in d) ordered[k] = d[k];
    save(`${code}.json`, ordered);
  }
  console.log(`${added} string(s) added, ${skipped} skipped. Now run: npm run check-locales`);
} else if (cmd === "invalidate") {
  if (!rest.length) {
    console.error("usage: node scripts/locale-tools.mjs invalidate <key> [<key> ...]");
    process.exit(1);
  }
  let removed = 0;
  for (const c of codes()) {
    if (c === "ru" || c === "en") continue;
    const d = read(`${c}.json`);
    let changed = false;
    for (const k of rest) if (k in d) { delete d[k]; removed++; changed = true; }
    if (changed) save(`${c}.json`, d);
  }
  console.log(`${removed} translation(s) removed (${rest.join(", ")}); they fall back to English until retranslated.`);
} else {
  console.log("commands: delta | apply <file> | invalidate <key...>   (see the comment at the top of this file)");
}
