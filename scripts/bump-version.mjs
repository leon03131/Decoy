// Sets the app version in every place that has one:  node scripts/bump-version.mjs 0.2.0
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error("usage: node scripts/bump-version.mjs <major.minor.patch>   e.g. 0.2.0");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const edit = (file, fn) => {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  const after = fn(before);
  if (before === after) console.log(`= ${file} (already ${version})`);
  else {
    writeFileSync(path, after);
    console.log(`✓ ${file}`);
  }
};

edit("package.json", (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${version}$2`));

console.log(`\nNext: update CHANGELOG.md, commit, then  git tag v${version} && git push origin v${version}`);
console.log("(src-tauri/Cargo.lock updates itself on the next build.)");
