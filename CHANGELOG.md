# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-01

### Added
- **Automatic updates** from GitHub releases for both the installed and the portable copy. Updates are checked against a
  digital signature before anything is installed, and installing always waits for your click.
- **Smart timer:** the countdown starts when Discord has actually noticed the decoy (read from Discord's local log), and
  a spinner shows the wait. If Discord does not confirm within 90 seconds, the countdown starts anyway.
- **Decoys can no longer be left running.** They exit by themselves when Decoy closes, crashes or is killed from Task
  Manager, and any leftovers are swept at the next start.
- Lab: the limit on the number of decoys is gone. It shows a RAM estimate (about 2 MB each), asks for a second click
  from 1,000 up, and stops early if Windows refuses to start more.
- Tools for keeping the 178 translations up to date (`scripts/locale-tools.mjs`).

### Changed
- The default duration is **16 minutes** (15 for a typical task plus the up to one minute Discord needs to notice a new
  game). Saved settings of 15 are moved to 16.
- Every decoy is now a hard link to a single copy, so thousands of decoys cost no extra disk space or time; starting and
  stopping them no longer freezes the window.
- The Running page draws the first 120 decoys and summarises the rest.

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
