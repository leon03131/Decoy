# Translations

One JSON file per language, named after the language code (`en.json`, `de.json`, `pt-BR.json`, ...).
Drop a new file here and the language shows up in Settings → Language, no code changes needed.
`ru.json` is the reference and always contains every key; missing keys fall back to English, then Russian.

Check your file with `npm run check-locales`. Save it as UTF-8 **without BOM**.

Full guide and a ready-made translation prompt: [docs/TRANSLATING.md](../../docs/TRANSLATING.md).
