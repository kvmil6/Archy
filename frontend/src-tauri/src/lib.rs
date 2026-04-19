use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

/// Walk up from the current directory until we find the repo root
/// (identified by the presence of backend/dev_server.py).
fn find_repo_root() -> Option<std::path::PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    for _ in 0..5 {
        if dir.join("backend").join("dev_server.py").is_file() {
            return Some(dir);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

fn start_backend() -> Option<Child> {
    let repo_root = find_repo_root()?;

    let python = if cfg!(target_os = "windows") {
        repo_root.join(".venv").join("Scripts").join("python.exe")
    } else {
        repo_root.join(".venv").join("bin").join("python")
    };

    if !python.exists() {
        eprintln!("Python venv not found at {:?}. Create it first: python -m venv .venv", python);
        return None;
    }

    let script = repo_root.join("backend").join("dev_server.py");

    Command::new(&python)
        .arg(&script)
        .current_dir(&repo_root)
        .spawn()
        .ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let backend = start_backend();
            if backend.is_none() {
                eprintln!("Warning: Could not start backend. Make sure .venv exists.");
            }
            *app.state::<BackendProcess>().0.lock().unwrap() = backend;
            // Give backend time to boot before showing window
            std::thread::sleep(std::time::Duration::from_millis(1500));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<BackendProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(ref mut child) = *guard {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
