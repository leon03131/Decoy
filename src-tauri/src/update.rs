//! Signed self-update from GitHub releases.
//!
//! The release publishes `latest.json` (see scripts/make-release.ps1) next to the installer and the portable zip.
//! Every file is signed with the project's private key (kept offline) and the matching public key is baked into the
//! app (`plugins.updater.pubkey`), so a tampered or foreign file is refused even if the GitHub account were compromised.
//!
//! * installed copy  -> the signed NSIS installer is downloaded, verified and run (per-user, passive mode)
//! * portable copy   -> the signed portable zip is downloaded, verified, and `decoy.exe` is swapped in place
//!   (a running exe can be renamed on Windows), then the new exe is started and this one exits
use std::io::{Cursor, Read};
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    update: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
    /// true when the files for this update are already downloaded and verified
    ready: bool,
}

fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();
    if crate::portable_root().is_some() {
        // the manifest has a separate entry (zip + signature) for portable copies
        builder = builder.target("windows-x86_64-portable");
    }
    // testing hook: point the app at a local manifest (the signature check still applies)
    if let Ok(url) = std::env::var("DECOY_UPDATE_URL") {
        let url = url.parse().map_err(|e| format!("DECOY_UPDATE_URL: {e}"))?;
        builder = builder.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    builder.build().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_update(app: AppHandle, state: tauri::State<'_, UpdateState>) -> Result<Option<UpdateInfo>, String> {
    let found = build_updater(&app)?.check().await.map_err(|e| e.to_string())?;
    let Some(update) = found else {
        *state.update.lock().unwrap() = None;
        *state.bytes.lock().unwrap() = None;
        return Ok(None);
    };
    let same = state.update.lock().unwrap().as_ref().map(|u| u.version == update.version).unwrap_or(false);
    if !same {
        *state.bytes.lock().unwrap() = None; // a different version: any earlier download is useless
    }
    let info = UpdateInfo {
        version: update.version.clone(),
        current: update.current_version.clone(),
        notes: update.body.clone(),
        ready: same && state.bytes.lock().unwrap().is_some(),
    };
    *state.update.lock().unwrap() = Some(update);
    Ok(Some(info))
}

/// Downloads the update and checks its signature. Progress is reported with the `update-progress` event.
#[tauri::command]
pub async fn download_update(app: AppHandle, state: tauri::State<'_, UpdateState>) -> Result<(), String> {
    if state.bytes.lock().unwrap().is_some() {
        return Ok(());
    }
    let update = state.update.lock().unwrap().clone().ok_or("no update to download")?;
    let mut downloaded: u64 = 0;
    let handle = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = handle.emit("update-progress", serde_json::json!({ "downloaded": downloaded, "total": total }));
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    *state.bytes.lock().unwrap() = Some(bytes);
    Ok(())
}

/// Installs the downloaded update and restarts. Running decoys are stopped first (they cannot survive a restart).
#[tauri::command]
pub async fn install_update(app: AppHandle, state: tauri::State<'_, UpdateState>) -> Result<(), String> {
    let update = state.update.lock().unwrap().clone().ok_or("no update to install")?;
    let bytes = state.bytes.lock().unwrap().take().ok_or("the update is not downloaded yet")?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::kill_all(&handle);
        if crate::portable_root().is_some() {
            apply_portable(&handle, &bytes)
        } else {
            // runs the signed installer and exits the app; the installer starts the new version when it is done
            update.install(bytes).map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Replaces decoy.exe with the one from the (already verified) portable zip and starts it.
fn apply_portable(app: &AppHandle, zip_bytes: &[u8]) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?; // read before renaming: the path changes afterwards
    let dir = exe.parent().ok_or("cannot find the program folder")?.to_path_buf();

    // pull decoy.exe out of the archive
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("bad update archive: {e}"))?;
    let mut new_exe: Option<Vec<u8>> = None;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let Ok(name) = file.name().map(|n| n.replace('\\', "/").to_lowercase()) else { continue };
        if name.split('/').any(|p| p == "..") || !(name == "decoy.exe" || name.ends_with("/decoy.exe")) {
            continue;
        }
        let mut buf = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        new_exe = Some(buf);
        break;
    }
    let new_exe = new_exe.ok_or("decoy.exe is missing from the update archive")?;
    if new_exe.len() < 1_000_000 || &new_exe[..2] != b"MZ" {
        return Err("the update archive does not contain a valid decoy.exe".into());
    }

    // write next to the old one, then swap: a running exe cannot be overwritten but it can be renamed
    let staged = dir.join("decoy.exe.new");
    let backup = dir.join("decoy.exe.old");
    std::fs::write(&staged, &new_exe).map_err(|e| format!("cannot write into the program folder: {e}"))?;
    let _ = std::fs::remove_file(&backup);
    std::fs::rename(&exe, &backup).map_err(|e| format!("cannot replace decoy.exe: {e}"))?;
    if let Err(e) = std::fs::rename(&staged, &exe) {
        let _ = std::fs::rename(&backup, &exe); // put the old version back
        return Err(format!("cannot replace decoy.exe: {e}"));
    }

    // the new copy waits for this process to exit (single-instance lock, WebView2 data folder)
    Command::new(&exe)
        .arg("--wait-pid")
        .arg(std::process::id().to_string())
        .creation_flags(0x0000_0008 /* DETACHED_PROCESS */)
        .spawn()
        .map_err(|e| format!("cannot start the new version: {e}"))?;
    app.exit(0);
    Ok(())
}
