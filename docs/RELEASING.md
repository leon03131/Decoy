# Releasing

A release has these files:

| File | What it is |
|---|---|
| `Decoy_<version>_x64-setup.exe` | NSIS installer. Per-user, no administrator rights, English and Russian. |
| `Decoy_<version>_x64-portable.zip` | Unzip and run. A `portable.txt` file next to `decoy.exe` keeps all data in `.\data`. |
| `latest.json` | The update manifest the app reads (version, notes, download URLs and **signatures**). |
| `SHA256SUMS.txt` | SHA-256 of the installer and the zip. |

## Repository

The project lives at <https://github.com/leon03131/Decoy>. On GitHub, add a description and topics, and check that
**Actions** are enabled (CI runs on every push and pull request).

## Update signing (one-time setup)

Decoy updates itself from GitHub releases, so a forged "update" would run on every user's PC. To make that impossible,
every update file is **signed** with a private key that only the maintainer has; the matching public key is built into
the app (`plugins.updater.pubkey` in `src-tauri/tauri.conf.json`). The app refuses any update whose signature does not
verify, even if someone gained access to the GitHub account.

```bash
npx tauri signer generate -w ~/.decoy-signing/decoy.key      # already done for this project
```

- The private key lives at `~/.decoy-signing/decoy.key` (outside the repository, **never commit it**). Its public half
  is `decoy.key.pub`, already in `tauri.conf.json`.
- **Back the key up** (password manager, encrypted drive). If it is lost, nobody can ship updates to existing installs:
  you would have to publish a new public key in a new version that people install by hand.
- If the key leaks, treat it like a stolen password: generate a new pair, put the new public key in `tauri.conf.json`,
  release a version signed with the **old** key (so existing installs accept it) that carries the new public key, and
  only then switch to signing with the new key.
- The key has no password right now. To add one, regenerate with `-p <password>` **before** shipping many installs
  (changing the key later has the rotation cost above) and set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when releasing.
- Version 0.1.0 had no updater: people on it have to install 0.2.0 by hand once.

For GitHub Actions add two repository secrets: `TAURI_SIGNING_PRIVATE_KEY` (the **content** of `decoy.key`) and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty if the key has none).

## Cut a release

1. Set the version everywhere and write the changelog entry:

   ```bash
   node scripts/bump-version.mjs 0.2.0
   ```

   Then edit [`CHANGELOG.md`](../CHANGELOG.md): the `## [0.2.0]` section becomes the update notes users see.

2. Build everything (installer, portable zip, `latest.json`, checksums) into `release/`:

   ```bash
   powershell -File scripts/make-release.ps1
   ```

   Commit, then tag and push (`git tag v0.2.0 && git push origin v0.2.0`). GitHub Actions can do step 2 for you and
   attach the files to a draft release, but it needs the secrets above and working billing; building locally always
   works.

3. On GitHub create the release for the tag `v0.2.0` and attach **all four files** from `release/`
   (`Decoy_0.2.0_x64-setup.exe`, `Decoy_0.2.0_x64-portable.zip`, `latest.json`, `SHA256SUMS.txt`). Keep the file names
   exactly as they are: `latest.json` points to them by name.

   Installed copies find the update as soon as the release is **published** (not while it is a draft), because the app
   reads `https://github.com/leon03131/Decoy/releases/latest/download/latest.json`. Test the files before publishing.

4. **VirusTotal links.** Small unsigned programs are sometimes flagged by antivirus engines, so link the scan reports
   in the release notes. Upload the installer and the zip at <https://www.virustotal.com>, or open the report straight
   from the hash in `SHA256SUMS.txt`:

   ```
   https://www.virustotal.com/gui/file/<sha256>
   ```

   Add a table or a line per file to the notes, then publish.

### Building locally without the signing key

```bash
npm run build:local
```

builds an installer without update signing (`src-tauri/tauri.local.conf.json`), for development and for contributors.

## How the app updates itself

- At startup (after 5 s) and every 6 hours the app downloads `latest.json` and compares its `version` with its own.
  *Settings → Automatic updates* turns this off; *Check now* forces a check.
- A newer version is downloaded in the background and checked against the signature. A banner offers
  **Restart and update**; nothing is installed without the click. Running decoys stop when the app restarts.
- **Installed copy:** the signed installer is run in passive mode (per-user, no administrator prompt) and starts the new
  version.
- **Portable copy:** the signed zip is downloaded, `decoy.exe` is swapped in place (a running exe can be renamed), and
  the new one is started. `portable.txt` and the `data` folder are left alone. This needs write access to the folder.
- Testing hook: the environment variable `DECOY_UPDATE_URL` points the app at another manifest (the signature check
  still applies, and a release build only accepts `https` URLs).

## The installer

The installer is an NSIS script generated by Tauri. What is customized, and where:

| What | Where |
|---|---|
| Sidebar (Welcome/Finish) and header bitmaps | `src-tauri/windows/sidebar.bmp`, `header.bmp`, generated by `scripts/make-installer-art.ps1` |
| Welcome and Finish page texts (English + Russian) | `src-tauri/windows/hooks.nsh` |
| Languages, install mode (per-user), icons | `bundle.windows.nsis` in `src-tauri/tauri.conf.json` |
| License text installed next to the app | `bundle.resources` (`LICENSE.txt`) |

To redo the artwork, edit `scripts/make-installer-art.ps1` and run it; the bitmaps must stay 24-bit BMP
(sidebar 164x314, header 150x57).

To add an installer language, add it to `languages` in `tauri.conf.json` and add its `LangString` lines (Windows language
id, for example `1031` for German) to `hooks.nsh`.

The installer is not code signed (the update signature above is a different thing), so Windows SmartScreen shows a
warning on first run. Code signing needs a certificate; see the Tauri documentation on Windows code signing.

## Portable mode

`decoy.exe` switches to portable mode when a file named `portable` or `portable.txt` sits next to it. Then the game
list, settings and the WebView cache live in `.\data` and nothing is written to the user profile. The settings page shows
a "Portable" badge when it is active.
