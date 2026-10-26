use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_notification::NotificationExt;

const STUB: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/stub.exe"));
const DETECTABLE_URL: &str = "https://discord.com/api/v9/applications/detectable";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ---------------------------------------------------------------- types

#[derive(Serialize, Deserialize, Clone)]
struct Exe {
    name: String,
    launcher: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct Game {
    id: String,
    name: String,
    icon: Option<String>,
    #[serde(default)]
    cover: Option<String>,
    exes: Vec<Exe>,
}

#[derive(Deserialize)]
struct RawExe {
    name: String,
    os: String,
    #[serde(default)]
    is_launcher: bool,
}

#[derive(Deserialize)]
struct RawGame {
    id: String,
    name: String,
    icon_hash: Option<String>,
    cover_image_hash: Option<String>,
    #[serde(default)]
    executables: Vec<RawExe>,
}

/// Bump when the shape of the cached game list changes, so old caches are re-downloaded.
const CACHE_VERSION: u32 = 2;

#[derive(Serialize, Deserialize)]
struct Cache {
    #[serde(default)]
    version: u32,
    fetched_ms: u64,
    games: Vec<Game>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GamesPayload {
    games: Vec<Game>,
    fetched_ms: u64,
    added_count: usize,
    added: Vec<String>,
    gained: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunInfo {
    key: String,
    game_id: String,
    game_name: String,
    exe: String,
    pid: u32,
    started_ms: u64,
    duration_s: u64,
}

struct Running {
    info: RunInfo,
    child: Child,
    /// the decoy exe on disk; removed again as soon as the process ends
    path: PathBuf,
}

struct AppState {
    running: Mutex<HashMap<String, Running>>,
    job: usize,
    close_to_tray: AtomicBool,
    tray_items: Mutex<Option<[tauri::menu::MenuItem<tauri::Wry>; 3]>>,
}

// ---------------------------------------------------------------- helpers

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Portable mode: a file named `portable` or `portable.txt` next to decoy.exe keeps ALL data (game list, settings,
/// WebView cache) in `<exe folder>\data` instead of the user profile.
fn portable_root() -> Option<&'static PathBuf> {
    static ROOT: OnceLock<Option<PathBuf>> = OnceLock::new();
    ROOT.get_or_init(|| {
        let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
        ["portable", "portable.txt"].iter().any(|n| dir.join(n).is_file()).then(|| dir.join("data"))
    })
    .as_ref()
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = match portable_root() {
        Some(p) => p.clone(),
        None => app.path().app_local_data_dir().map_err(|e| e.to_string())?,
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    portable: bool,
    data_dir: String,
}

#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        portable: portable_root().is_some(),
        data_dir: data_dir(&app)?.to_string_lossy().to_string(),
    })
}

fn stubs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("stubs"))
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("games.json"))
}

fn read_cache(app: &AppHandle) -> Option<Cache> {
    let raw = fs::read(cache_path(app).ok()?).ok()?;
    let cache: Cache = serde_json::from_slice(&raw).ok()?;
    (cache.version == CACHE_VERSION).then_some(cache)
}

fn rel_path(exe: &str) -> Option<PathBuf> {
    let mut p = PathBuf::new();
    for part in exe.split(['/', '\\']) {
        let part = part.trim();
        if part.is_empty() || part == "." || part == ".." {
            continue;
        }
        let clean: String = part
            .chars()
            .map(|c| if "<>:\"|?*".contains(c) || c.is_control() { '_' } else { c })
            .collect();
        p.push(clean);
    }
    if p.as_os_str().is_empty() {
        None
    } else {
        Some(p)
    }
}

fn hide_cmd(cmd: &mut Command) -> &mut Command {
    cmd.creation_flags(CREATE_NO_WINDOW)
}

fn assign_to_job(job: usize, child: &Child) {
    use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
    if job != 0 {
        unsafe {
            AssignProcessToJobObject(job as _, child.as_raw_handle() as _);
        }
    }
}

fn make_job() -> usize {
    use windows_sys::Win32::System::JobObjects::*;
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return 0;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        job as usize
    }
}

/// Deletes a decoy exe (and any folders that became empty) once nothing is running from it any more.
fn cleanup_stub(app: &AppHandle, path: &Path) {
    let still_used = app.state::<AppState>().running.lock().unwrap().values().any(|r| r.path == path);
    if still_used {
        return;
    }
    for _ in 0..15 {
        if fs::remove_file(path).is_ok() || !path.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    if let Ok(root) = stubs_dir(app) {
        let mut dir = path.parent();
        while let Some(d) = dir {
            if d == root || !d.starts_with(&root) || fs::remove_dir(d).is_err() {
                break;
            }
            dir = d.parent();
        }
    }
}

fn end_run(app: &AppHandle, mut r: Running) {
    let _ = r.child.kill();
    let _ = r.child.wait();
    cleanup_stub(app, &r.path);
}

fn kill_all(app: &AppHandle) {
    let state = app.state::<AppState>();
    let drained: Vec<Running> = state.running.lock().unwrap().drain().map(|(_, v)| v).collect();
    for r in drained {
        end_run(app, r);
    }
    let _ = app.emit("run-stopped", "*");
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// ---------------------------------------------------------------- game database

async fn fetch_games() -> Result<Vec<Game>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Decoy/0.1")
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;
    let raw: Vec<RawGame> = client
        .get(DETECTABLE_URL)
        .send()
        .await
        .map_err(|e| format!("Не удалось скачать базу: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Discord ответил ошибкой: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Не удалось разобрать базу: {e}"))?;

    let mut games: Vec<Game> = raw
        .into_iter()
        .map(|r| Game {
            id: r.id,
            name: r.name,
            icon: r.icon_hash.filter(|s| !s.is_empty()),
            cover: r.cover_image_hash.filter(|s| !s.is_empty()),
            exes: r
                .executables
                .into_iter()
                .filter(|e| e.os == "win32")
                .map(|e| Exe { name: e.name.trim_start_matches('>').to_string(), launcher: e.is_launcher })
                .collect(),
        })
        .collect();
    games.sort_by_key(|g| g.name.to_lowercase());
    Ok(games)
}

#[tauri::command]
async fn get_games(app: AppHandle) -> Result<GamesPayload, String> {
    if let Some(c) = read_cache(&app) {
        return Ok(GamesPayload { games: c.games, fetched_ms: c.fetched_ms, added_count: 0, added: vec![], gained: vec![] });
    }
    refresh_games(app).await
}

#[tauri::command]
async fn refresh_games(app: AppHandle) -> Result<GamesPayload, String> {
    let games = fetch_games().await?;
    let old: HashMap<String, usize> = read_cache(&app)
        .map(|c| c.games.into_iter().map(|g| (g.id, g.exes.len())).collect())
        .unwrap_or_default();

    let mut added: Vec<String> = vec![];
    let mut added_count = 0;
    let mut gained: Vec<String> = vec![];
    if !old.is_empty() {
        for g in &games {
            match old.get(&g.id) {
                None => {
                    added_count += 1;
                    if added.len() < 10 {
                        added.push(g.name.clone());
                    }
                }
                Some(0) if !g.exes.is_empty() => gained.push(g.name.clone()),
                _ => {}
            }
        }
    }
    gained.truncate(20);

    let fetched_ms = now_ms();
    let cache = Cache { version: CACHE_VERSION, fetched_ms, games };
    let json = serde_json::to_vec(&cache).map_err(|e| e.to_string())?;
    fs::write(cache_path(&app)?, json).map_err(|e| e.to_string())?;
    Ok(GamesPayload { games: cache.games, fetched_ms, added_count, added, gained })
}

// ---------------------------------------------------------------- decoys

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn launch(
    app: AppHandle,
    game_id: String,
    game_name: String,
    exe: String,
    minutes: u64,
    auto_stop: bool,
    notify: bool,
    notify_title: String,
    notify_body: String,
) -> Result<RunInfo, String> {
    launch_inner(&app, game_id, game_name, exe, minutes, auto_stop, notify, notify_title, notify_body)
}

#[allow(clippy::too_many_arguments)]
fn launch_inner(
    app: &AppHandle,
    game_id: String,
    game_name: String,
    exe: String,
    minutes: u64,
    auto_stop: bool,
    notify: bool,
    notify_title: String,
    notify_body: String,
) -> Result<RunInfo, String> {
    let state = app.state::<AppState>();
    let key = format!("{game_id}|{exe}");
    if let Some(r) = state.running.lock().unwrap().get(&key) {
        return Ok(r.info.clone());
    }

    let rel = rel_path(&exe).ok_or("Некорректное имя exe")?;
    let path = stubs_dir(app)?.join(&rel);
    fs::create_dir_all(path.parent().ok_or("Некорректный путь")?).map_err(|e| e.to_string())?;
    let up_to_date = fs::read(&path).map(|b| b == STUB).unwrap_or(false);
    if !up_to_date {
        // ignore errors: the file may be locked by a copy that is already running
        let _ = fs::write(&path, STUB);
    }

    let mut cmd = Command::new(&path);
    hide_cmd(&mut cmd).current_dir(path.parent().unwrap());
    let child = cmd.spawn().map_err(|e| format!("Не удалось запустить заглушку: {e}"))?;
    assign_to_job(state.job, &child);

    let info = RunInfo {
        key: key.clone(),
        game_id,
        game_name: game_name.clone(),
        exe,
        pid: child.id(),
        started_ms: now_ms(),
        duration_s: minutes.max(1) * 60,
    };
    state.running.lock().unwrap().insert(key.clone(), Running { info: info.clone(), child, path: path.clone() });

    let (h, k, pid, secs) = (app.clone(), key, info.pid, info.duration_s);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(secs)).await;
        let st = h.state::<AppState>();
        let still = st.running.lock().unwrap().get(&k).map(|r| r.info.pid == pid).unwrap_or(false);
        if !still {
            return;
        }
        let _ = h.emit("run-finished", &k);
        if notify {
            let _ = h.notification().builder().title(notify_title).body(notify_body).show();
        }
        if auto_stop {
            let removed = st.running.lock().unwrap().remove(&k);
            if let Some(r) = removed {
                end_run(&h, r);
            }
            let _ = h.emit("run-stopped", &k);
        }
    });

    Ok(info)
}

#[tauri::command]
fn stop(app: AppHandle, state: State<AppState>, key: String) {
    let removed = state.running.lock().unwrap().remove(&key);
    if let Some(r) = removed {
        end_run(&app, r);
    }
}

#[tauri::command]
fn stop_all(app: AppHandle) {
    kill_all(&app);
}

#[tauri::command]
fn list_running(app: AppHandle, state: State<AppState>) -> Vec<RunInfo> {
    let (mut v, dead) = {
        let mut map = state.running.lock().unwrap();
        let dead_keys: Vec<String> = map
            .iter_mut()
            .filter_map(|(k, r)| if matches!(r.child.try_wait(), Ok(None)) { None } else { Some(k.clone()) })
            .collect();
        let dead: Vec<Running> = dead_keys.iter().filter_map(|k| map.remove(k)).collect();
        (map.values().map(|r| r.info.clone()).collect::<Vec<RunInfo>>(), dead)
    };
    for r in dead {
        end_run(&app, r); // process already gone: just removes its file
    }
    v.sort_by_key(|r| r.started_ms);
    v
}

#[tauri::command]
fn discord_running() -> bool {
    let mut cmd = Command::new("tasklist");
    let out = hide_cmd(cmd.args(["/FO", "CSV", "/NH"])).output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
            ["discord.exe", "discordptb.exe", "discordcanary.exe"].iter().any(|n| s.contains(n))
        }
        Err(_) => false,
    }
}

#[tauri::command]
fn set_close_to_tray(state: State<AppState>, value: bool) {
    state.close_to_tray.store(value, Ordering::Relaxed);
}

#[tauri::command]
fn set_tray_labels(state: State<AppState>, show: String, stop: String, quit: String) {
    if let Some(items) = state.tray_items.lock().unwrap().as_ref() {
        let _ = items[0].set_text(show);
        let _ = items[1].set_text(stop);
        let _ = items[2].set_text(quit);
    }
}

#[tauri::command]
fn open_path(path: String) {
    let _ = Command::new("explorer.exe").arg(path).spawn();
}

#[tauri::command]
fn open_stubs_dir(app: AppHandle) -> Result<(), String> {
    let dir = stubs_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = Command::new("explorer.exe").arg(dir).spawn();
    Ok(())
}

#[tauri::command]
fn clear_stubs(app: AppHandle) -> Result<(), String> {
    kill_all(&app);
    let dir = stubs_dir(&app)?;
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------- locate an installed copy

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

fn game_roots() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = vec![];
    for l in b'A'..=b'Z' {
        let d = format!("{}:\\", l as char);
        if !Path::new(&d).exists() {
            continue;
        }
        for sub in [
            "Games",
            "Games\\Steam\\steamapps\\common",
            "Steam\\steamapps\\common",
            "SteamLibrary\\steamapps\\common",
            "Program Files",
            "Program Files (x86)",
            "XboxGames",
            "Epic Games",
            "Games\\Epic Games",
        ] {
            let p = Path::new(&d).join(sub);
            if p.is_dir() {
                v.push(p);
            }
        }
    }
    for vdf in [
        r"C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf",
        r"C:\Games\Steam\steamapps\libraryfolders.vdf",
    ] {
        if let Ok(text) = fs::read_to_string(vdf) {
            for line in text.lines() {
                if line.trim().starts_with("\"path\"") {
                    if let Some(p) = line.split('"').nth(3) {
                        let p = PathBuf::from(p.replace("\\\\", "\\")).join("steamapps").join("common");
                        if p.is_dir() {
                            v.push(p);
                        }
                    }
                }
            }
        }
    }
    v.sort();
    v.dedup();
    v
}

fn walk_for_file(dir: &Path, file: &str, depth: u32, budget: &mut u32) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    let mut subdirs = vec![];
    for e in entries.flatten() {
        if *budget == 0 {
            return None;
        }
        *budget -= 1;
        let p = e.path();
        if p.is_dir() {
            subdirs.push(p);
        } else if p.file_name().map(|n| n.to_string_lossy().eq_ignore_ascii_case(file)).unwrap_or(false) {
            return Some(dir.to_path_buf());
        }
    }
    if depth > 0 {
        for d in subdirs {
            if let Some(f) = walk_for_file(&d, file, depth - 1, budget) {
                return Some(f);
            }
        }
    }
    None
}

#[tauri::command]
async fn find_installed(exes: Vec<String>) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let roots = game_roots();
        let mut budget: u32 = 60_000;
        for exe in &exes {
            let parts: Vec<&str> = exe.split(['/', '\\']).filter(|s| !s.is_empty()).collect();
            let Some(file) = parts.last() else { continue };
            let hint = if parts.len() > 1 { Some(norm(parts[0])) } else { None };
            for root in &roots {
                let Ok(rd) = fs::read_dir(root) else { continue };
                for child in rd.flatten() {
                    let p = child.path();
                    if !p.is_dir() {
                        continue;
                    }
                    let name = child.file_name().to_string_lossy().to_string();
                    if let Some(h) = &hint {
                        if &norm(&name) == h {
                            return Some(p.to_string_lossy().to_string());
                        }
                    } else if root.parent().is_some() && budget > 0 {
                        if let Some(found) = walk_for_file(&p, file, 2, &mut budget) {
                            return Some(found.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
        None
    })
    .await
    .ok()
    .flatten()
}

// ---------------------------------------------------------------- app

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .manage(AppState { running: Mutex::new(HashMap::new()), job: make_job(), close_to_tray: AtomicBool::new(true), tray_items: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            get_games,
            refresh_games,
            launch,
            stop,
            stop_all,
            list_running,
            discord_running,
            set_close_to_tray,
            set_tray_labels,
            app_info,
            open_path,
            open_stubs_dir,
            clear_stubs,
            find_installed
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<AppState>();
                if state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // The main window is created here (not from the config) so portable mode can point WebView2 at a
            // data folder next to the exe.
            let cfg = app.config().app.windows.iter().find(|w| w.label == "main").cloned().expect("main window config");
            let mut window = tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?;
            if let Some(root) = portable_root() {
                window = window.data_directory(root.join("webview"));
            }
            window.build()?;

            let show = MenuItemBuilder::with_id("show", "Открыть Decoy").build(app)?;
            let stop_item = MenuItemBuilder::with_id("stop", "Остановить все заглушки").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Выйти").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &stop_item, &quit]).build()?;
            *app.state::<AppState>().tray_items.lock().unwrap() = Some([show.clone(), stop_item.clone(), quit.clone()]);
            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("window icon"))
                .tooltip("Decoy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "show" => show_main(app),
                    "stop" => kill_all(app),
                    "quit" => {
                        kill_all(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // leftovers from a crash or kill: decoys only exist while they run
            if let Ok(dir) = stubs_dir(app.handle()) {
                let _ = fs::remove_dir_all(dir);
            }

            // `decoy.exe --launch <exe path> [minutes]` starts a decoy right away (handy for scripts and tests)
            let args: Vec<String> = std::env::args().collect();
            if let Some(i) = args.iter().position(|a| a == "--launch") {
                if let Some(exe) = args.get(i + 1) {
                    let minutes = args.get(i + 2).and_then(|m| m.parse().ok()).unwrap_or(15);
                    let _ = launch_inner(app.handle(), "cli".into(), exe.clone(), exe.clone(), minutes, true, false, String::new(), String::new());
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Decoy");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            kill_all(handle);
        }
    });
}
