# Contributing to Decoy

Thanks for helping out. Bug reports, ideas, translations and code are all welcome.

## Before you start

- Search the [issues](../../issues) to see whether your problem or idea is already there.
- For bigger changes, open an issue first so we can agree on the direction before you spend time on it.

## Reporting a bug

Use the **Bug report** template and include your Windows version, the Decoy version, the game you tried and what
Discord showed. If a decoy is not recognized, please say whether the game appears with executables in the library
and how long you waited (detection can take about 15 seconds).

## Translations

See [docs/TRANSLATING.md](docs/TRANSLATING.md). A new language is one JSON file plus, optionally, a translated README.
Most existing translations are machine-made, so fixing a wrong or awkward phrase in your own language is very welcome.
Run `npm run check-locales` (and, if you touched a README, `npm run readme-langs` then `npm run check-readmes`) before
opening the pull request.

## Development

Prerequisites: Node.js 20+, stable Rust (MSVC) and the Visual Studio C++ build tools.

```bash
npm install
npm run tauri dev
```

Before you open a pull request:

```bash
npx tsc --noEmit
npm run check-locales
npm run check-readmes
cargo check --manifest-path src-tauri/Cargo.toml
```

### Guidelines

- Keep the change focused; one topic per pull request.
- Match the style of the surrounding code (formatting, naming, comment density).
- Every user-visible string goes through the locale files (`src/locales`), never hard-coded in a component. Add the
  new key to `ru.json` **and** `en.json`.
- Do not add dependencies lightly; the app is small on purpose.
- Do not add anything that uses a user's Discord token, automates accepting or completing quests, or touches the
  Discord client. That is out of scope for this project.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
