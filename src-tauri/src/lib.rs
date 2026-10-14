mod desktop;
mod lifecycle;
mod store;

use desktop::*;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = show_notes(app.clone());
        }))
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            list_notes,
            get_note,
            create_note,
            save_note,
            set_note_color,
            set_note_pinned,
            delete_note,
            open_note,
            close_note,
            show_notes,
            hide_notes,
            request_quit,
            acknowledge_quit
        ])
        .on_window_event(|window, event| {
            let app = window.app_handle();
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    if window.label() == "main" {
                        let _ = hide_notes(app.clone());
                    } else {
                        let _ = app.emit_to(window.label(), "note:close-requested", ());
                    }
                }
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                    if let Some(webview) = app.get_webview_window(window.label()) {
                        if let Err(error) =
                            record_window(app, &webview, webview.is_visible().unwrap_or(false))
                        {
                            let _ = app.emit("app:error", error);
                        }
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("메모 앱을 시작할 수 없습니다.");
    app.run(|app, event| match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            if !app.state::<AppState>().exiting.load(Ordering::SeqCst) {
                api.prevent_exit();
                let _ = request_quit(app.clone());
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            let _ = show_notes(app.clone());
        }
        _ => {}
    });
}
