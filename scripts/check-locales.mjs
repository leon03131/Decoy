// Validates every src/locales/*.json against ru.json.
//   errors   (exit 1): invalid JSON, a missing _meta.name, non-string values, unknown keys, changed {placeholders}
//   warnings (exit 0): missing keys. The app falls back to English for them, so a partly translated language works;
//                      use `node scripts/locale-tools.mjs delta` to get just the missing strings for translation.
// Pass --strict to treat missing keys as errors too.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const strict = process.argv.includes("--strict");
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "locales");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const holders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const base = load("ru.json");
const baseKeys = Object.keys(base).filter((k) => k !== "_meta");
let bad = 0;
let partial = 0;
const missingCounts = [];

for (const f of files) {
  if (f === "ru.json") continue;
  let d;
  try {
    d = load(f);
  } catch (e) {
    console.log(`✗ ${f}: invalid JSON (${e.message})`);
    bad++;
    continue;
  }
  const errors = [];
  let missing = 0;
  if (!d._meta?.name) errors.push("_meta.name is missing");
  for (const k of baseKeys) {
    if (!(k in d)) {
      missing++;
      if (strict) errors.push(`missing key: ${k}`);
    } else if (typeof d[k] !== "string") errors.push(`not a string: ${k}`);
    else if (holders(d[k]) !== holders(base[k])) errors.push(`placeholders differ in ${k}: "${holders(base[k])}" vs "${holders(d[k])}"`);
  }
  for (const k of Object.keys(d)) if (k !== "_meta" && !(k in base)) errors.push(`unknown key: ${k}`);
  if (errors.length) {
    bad++;
    console.log(`✗ ${f} (${d._meta?.name ?? "?"}): ${errors.length} problem(s)`);
    errors.slice(0, 15).forEach((p) => console.log("    " + p));
  } else if (missing) {
    partial++;
    missingCounts.push(missing);
  }
}

console.log(`\n${files.length} language file(s) checked, ${bad} with errors.`);
if (partial) {
  console.log(`${partial} language(s) are missing ${Math.min(...missingCounts)}-${Math.max(...missingCounts)} newer strings (shown in English until translated).`);
  console.log("  list them:  node scripts/locale-tools.mjs delta");
}
process.exit(bad ? 1 : 0);
