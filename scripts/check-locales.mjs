// Validates every src/locales/*.json against ru.json: JSON syntax, missing/extra keys, placeholder mismatches.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "locales");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const holders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const base = load("ru.json");
const baseKeys = Object.keys(base).filter((k) => k !== "_meta");
let bad = 0;

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
  const problems = [];
  if (!d._meta?.name) problems.push("_meta.name is missing");
  for (const k of baseKeys) {
    if (!(k in d)) problems.push(`missing key: ${k}`);
    else if (typeof d[k] !== "string") problems.push(`not a string: ${k}`);
    else if (holders(d[k]) !== holders(base[k])) problems.push(`placeholders differ in ${k}: "${holders(base[k])}" vs "${holders(d[k])}"`);
  }
  for (const k of Object.keys(d)) if (k !== "_meta" && !(k in base)) problems.push(`unknown key: ${k}`);
  if (problems.length) {
    bad++;
    console.log(`✗ ${f} (${d._meta?.name ?? "?"}): ${problems.length} problem(s)`);
    problems.slice(0, 15).forEach((p) => console.log("    " + p));
  } else {
    console.log(`✓ ${f} (${d._meta.name}): ${baseKeys.length} keys OK`);
  }
}
console.log(`\n${files.length} language file(s) checked, ${bad} with problems.`);
process.exit(bad ? 1 : 0);
