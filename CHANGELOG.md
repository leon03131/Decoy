# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-27

First public release.

### Added
- Library of every game in Discord's public detection list, refreshed automatically once a day.
- Fast search by name or executable, grid and list views, favorites, "Recent" row, game artwork.
- Decoy processes with a configurable duration, countdown ring, notification and auto-stop.
- Decoys are created on start and deleted on stop; leftovers are cleaned up on the next launch.
- System tray with quick actions; decoys end together with the app.
- Interface in 178 languages (mostly machine-translated), including right-to-left ones. Each language is a JSON file
  in `src/locales`, loaded on demand; the language picker is searchable. The README is translated too, with a generated
  language bar (`npm run readme-langs`, `npm run check-readmes`) and validation scripts.
- Command line start: `decoy.exe --launch <exe> [minutes]`.
- Two downloads: a branded NSIS installer (per-user, English and Russian) and a portable zip that keeps all data
  next to the exe.
