use crate::{
    lifecycle::{QuitCoordinator, QuitDecision, Rect, clamp_window},
    store::{Note, Result, Store, WindowState},
};
use serde_json::Value;
use std::sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
};
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

pub struct AppState {
    pub database: Result<Store>,
    quit: Mutex<QuitCoordinator>,
    pub exiting: AtomicBool,
}

impl AppState {
    pub fn new(database: Result<Store>) -> Self {
        Self {
            database,
            quit: Mutex::new(QuitCoordinator::default()),
            exiting: AtomicBool::new(false),
        }
    }
    fn store(&self) -> Result<&Store> {
        self.database.as_ref().map_err(Clone::clone)
    }
}

fn changed(app: &AppHandle) {
    let _ = app.emit("notes:changed", ());
}
fn notify_error(app: &AppHandle, error: &str) {
    eprintln!("sticky notes: {error}");
    let _ = app.emit("app:error", error);
    let _ = show_notes(app.clone());
}

pub fn record_window(app: &AppHandle, window: &WebviewWindow, is_open: bool) -> Result<()> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let size = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    app.state::<AppState>().store()?.save_window(&WindowState {
        label: window.label().into(),
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        is_open,
    })
}

fn restore_rect(app: &AppHandle, saved: Option<&WindowState>, note: bool) -> Rect {
    let monitors: Vec<Rect> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let area = monitor.work_area();
            let position = area.position.to_logical::<f64>(monitor.scale_factor());
            let size = area.size.to_logical::<f64>(monitor.scale_factor());
            Rect {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            }
        })
        .collect();
    let default = monitors
        .first()
        .map_or((120.0, 120.0), |m| (m.x + 80.0, m.y + 80.0));
    let rect = saved.map_or(
        Rect {
            x: default.0,
            y: default.1,
            width: if note { 320.0 } else { 360.0 },
            height: if note { 360.0 } else { 640.0 },
        },
        |s| Rect {
            x: s.x,
            y: s.y,
            width: s.width.max(if note { 240.0 } else { 320.0 }),
            height: s.height.max(if note { 200.0 } else { 420.0 }),
        },
    );
    clamp_window(rect, &monitors)
}

#[tauri::command]
pub fn list_notes(state: State<'_, AppState>) -> Result<Vec<Note>> {
    state.store()?.list()
}
#[tauri::command]
pub fn get_note(state: State<'_, AppState>, id: String) -> Result<Note> {
    state.store()?.get(&id)
}
#[tauri::command]
pub fn create_note(app: AppHandle, state: State<'_, AppState>) -> Result<Note> {
    ensure_running(&state)?;
    let note = state.store()?.create()?;
    changed(&app);
    open_note(app, state, note.id.clone())?;
    Ok(note)
}
#[tauri::command]
pub fn save_note(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    document: Value,
    plain_text: String,
) -> Result<Note> {
    let note = state.store()?.save(&id, document, &plain_text)?;
    changed(&app);
    Ok(note)
}
#[tauri::command]
pub fn set_note_color(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    color: String,
) -> Result<Note> {
    let note = state.store()?.set_color(&id, &color)?;
    changed(&app);
    let _ = app.emit_to(format!("note-{id}"), "note:metadata", &note);
    Ok(note)
}
#[tauri::command]
pub fn set_note_pinned(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    pinned: bool,
) -> Result<Note> {
    let previous = state.store()?.get(&id)?.pinned;
    if let Some(window) = app.get_webview_window(&format!("note-{id}")) {
        window
            .set_always_on_top(pinned)
            .map_err(|e| e.to_string())?;
    }
    match state.store()?.set_pinned(&id, pinned) {
        Ok(note) => {
            changed(&app);
            let _ = app.emit_to(format!("note-{id}"), "note:metadata", &note);
            Ok(note)
        }
        Err(error) => {
            if let Some(window) = app.get_webview_window(&format!("note-{id}")) {
                let _ = window.set_always_on_top(previous);
            }
            Err(error)
        }
    }
}
#[tauri::command]
pub fn delete_note(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    ensure_running(&state)?;
    state.store()?.delete(&id)?;
    changed(&app);
    if let Some(window) = app.get_webview_window(&format!("note-{id}")) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn open_note(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    ensure_running(&state)?;
    // Only existing UUIDs can become window labels or initialization-script values.
    uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let note = state.store()?.get(&id)?;
    let label = format!("note-{id}");
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return record_window(&app, &window, true);
    }
    let windows = state.store()?.windows()?;
    let rect = restore_rect(&app, windows.iter().find(|s| s.label == label), true);
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("메모")
        .decorations(false)
        .inner_size(rect.width, rect.height)
        .min_inner_size(240.0, 200.0)
        .position(rect.x, rect.y)
        .always_on_top(note.pinned)
        .initialization_script(format!(
            "window.__STICKY_NOTE_ID__ = {};",
            serde_json::to_string(&id).map_err(|e| e.to_string())?
        ))
        .build()
        .map_err(|e| e.to_string())?;
    record_window(&app, &window, true)
}
#[tauri::command]
pub fn close_note(app: AppHandle, _state: State<'_, AppState>, id: String) -> Result<()> {
    if let Some(window) = app.get_webview_window(&format!("note-{id}")) {
        if let Err(error) = record_window(&app, &window, false) {
            eprintln!("window state: {error}");
        }
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn show_notes(app: AppHandle) -> Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or("목록 창을 찾을 수 없습니다.")?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn hide_notes(app: AppHandle) -> Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or("목록 창을 찾을 수 없습니다.")?;
    record_window(&app, &window, false)?;
    window.hide().map_err(|e| e.to_string())
}

fn cancel_quit(app: &AppHandle, error: &str) {
    if let Ok(mut quit) = app.state::<AppState>().quit.lock() {
        quit.cancel();
    }
    let _ = app.emit("app:quit-cancelled", ());
    notify_error(app, error);
}

fn ensure_running(state: &AppState) -> Result<()> {
    if state.quit.lock().map_err(|_| "종료 상태 오류")?.active() {
        return Err("앱이 메모를 저장하고 종료하는 중입니다.".into());
    }
    Ok(())
}

pub fn finish_quit(app: &AppHandle) {
    for window in app.webview_windows().values() {
        if let Err(error) = record_window(app, window, window.is_visible().unwrap_or(false)) {
            // Geometry is best-effort; drafts have already been flushed by every editor.
            eprintln!("window state at quit: {error}");
        }
    }
    app.state::<AppState>()
        .exiting
        .store(true, Ordering::SeqCst);
    app.exit(0);
}
#[tauri::command]
pub fn request_quit(app: AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    let labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|label| label.starts_with("note-"))
        .cloned()
        .collect();
    if labels.is_empty() {
        finish_quit(&app);
        return Ok(());
    }
    let token = {
        let mut quit = state
            .quit
            .lock()
            .map_err(|_| "종료 상태를 확인할 수 없습니다.")?;
        if quit.active() {
            return Ok(());
        }
        quit.begin(labels.clone())
    };
    for label in labels {
        if let Err(error) = app.emit_to(&label, "app:flush", &token) {
            notify_error(&app, &error.to_string());
        }
    }
    let timeout_app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));
        if timeout_app
            .state::<AppState>()
            .quit
            .lock()
            .is_ok_and(|mut quit| quit.expire(&token))
        {
            cancel_quit(
                &timeout_app,
                "메모 저장 확인이 지연되어 종료를 취소했습니다. 다시 시도해 주세요.",
            );
        }
    });
    Ok(())
}
#[tauri::command]
pub fn acknowledge_quit(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    success: bool,
) -> Result<()> {
    let decision = app
        .state::<AppState>()
        .quit
        .lock()
        .map_err(|_| "종료 상태 오류")?
        .ack(&token, window.label(), success);
    match decision {
        QuitDecision::Ready => finish_quit(&app),
        QuitDecision::Cancelled => cancel_quit(
            &app,
            "저장하지 못한 메모가 있어 종료를 취소했습니다. 메모 창에서 저장을 다시 시도하세요.",
        ),
        _ => {}
    }
    Ok(())
}

pub fn setup(app: &mut tauri::App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let database = (|| -> Result<Store> {
        let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        Store::open(&directory.join("notes.sqlite"))
    })();
    app.manage(AppState::new(database));
    app.set_menu(Menu::default(app.handle())?)?;
    let create = MenuItem::with_id(app, "new", "새 메모", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "메모 목록", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&create, &show, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("메모")
        .icon_as_template(true)
        .on_menu_event(|app, event| {
            let result = match event.id.as_ref() {
                "new" => create_note(app.clone(), app.state()).map(|_| ()),
                "show" => show_notes(app.clone()),
                "quit" => request_quit(app.clone()),
                _ => Ok(()),
            };
            if let Err(error) = result {
                notify_error(app, &error);
            }
        });
    tray = tray.icon(tauri::image::Image::from_bytes(include_bytes!(
        "../icons/tray.png"
    ))?);
    tray.build(app)?;
    if let Ok(store) = app.state::<AppState>().store() {
        let saved = store.windows().unwrap_or_default();
        if let Some(main) = app.get_webview_window("main") {
            let rect = restore_rect(
                app.handle(),
                saved.iter().find(|s| s.label == "main"),
                false,
            );
            main.set_position(tauri::LogicalPosition::new(rect.x, rect.y))?;
            main.set_size(tauri::LogicalSize::new(rect.width, rect.height))?;
        }
        for window in saved
            .iter()
            .filter(|s| s.is_open && s.label.starts_with("note-"))
        {
            if let Some(id) = window.label.strip_prefix("note-") {
                if let Err(error) = open_note(app.handle().clone(), app.state(), id.into()) {
                    eprintln!("restore: {error}");
                }
            }
        }
    }
    Ok(())
}
