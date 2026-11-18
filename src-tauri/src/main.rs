#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::{
    menu::MenuItem, tray::TrayIconBuilder, webview::WebviewWindowBuilder, AppHandle, Manager,
    RunEvent, WebviewUrl, WindowEvent,
};

struct RuntimeChildren(Mutex<Vec<Child>>);

fn hide_console_window(_command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        _command.creation_flags(0x08000000);
    }
}

fn executable(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        path.with_extension("exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        path
    }
}

fn wait_for_server(port: u16) -> bool {
    for _ in 0..120 {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn open_browser(url: &str) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut value = Command::new("open");
        value.arg(url);
        value
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut value = Command::new("rundll32.exe");
        value.args(["url.dll,FileProtocolHandler", url]);
        value
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut value = Command::new("xdg-open");
        value.arg(url);
        value
    };
    hide_console_window(&mut command);
    command.spawn()?;
    Ok(())
}

fn start_runtime(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let bundle_dir = resource_dir.join("bundle");
    let runtime_dir = bundle_dir.join("runtime");
    let next_dir = bundle_dir.join("next-server");
    let app_data = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data)?;
    let worker_token = format!("clipread-local-{}", std::process::id());
    let worker = executable(runtime_dir.join("clipread-worker").join("clipread-worker"));
    let node = executable(runtime_dir.join("node"));
    let ytdlp = executable(runtime_dir.join("bin").join("yt-dlp"));
    let ffmpeg = executable(runtime_dir.join("bin").join("ffmpeg"));
    let model = runtime_dir.join("models").join("base.pt");

    let mut worker_command = Command::new(&worker);
    worker_command
        .current_dir(&runtime_dir)
        .env("HOST", "127.0.0.1")
        .env("PORT", "8787")
        .env("WORKER_AUTH_TOKEN", &worker_token)
        .env("YTDLP_BINARY", &ytdlp)
        .env("FFMPEG_BINARY", &ffmpeg)
        .env("WHISPER_MODEL", "base")
        .env("WHISPER_MODEL_PATH", &model)
        .env("JOB_DB_PATH", app_data.join("jobs.sqlite3"))
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console_window(&mut worker_command);
    let worker_child = worker_command.spawn()?;

    let mut server_command = Command::new(&node);
    server_command
        .current_dir(&next_dir)
        .arg(next_dir.join("server.js"))
        .env("HOSTNAME", "127.0.0.1")
        .env("PORT", "3000")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("TRANSCRIPTION_WORKER_URL", "http://127.0.0.1:8787")
        .env("TRANSCRIPTION_WORKER_TOKEN", &worker_token)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console_window(&mut server_command);
    let server_child = server_command.spawn()?;
    app.state::<RuntimeChildren>()
        .0
        .lock()
        .expect("runtime child lock poisoned")
        .extend([worker_child, server_child]);

    let app_handle = app.clone();
    thread::spawn(move || {
        if !wait_for_server(8787) || !wait_for_server(3000) {
            eprintln!("ClipRead runtime did not start within 30 seconds");
            stop_runtime(&app_handle);
            app_handle.exit(1);
            return;
        }
        if std::env::var("CLIPREAD_NATIVE_WINDOW").as_deref() == Ok("1") {
            let url = "http://127.0.0.1:3000".parse().expect("valid local URL");
            let _ = WebviewWindowBuilder::new(&app_handle, "main", WebviewUrl::External(url))
                .title("ClipRead")
                .inner_size(1280.0, 840.0)
                .min_inner_size(960.0, 680.0)
                .build();
        } else if let Err(error) = open_browser("http://127.0.0.1:3000") {
            eprintln!("Could not open the default browser: {error}");
        }
    });
    Ok(())
}

fn stop_runtime(app: &AppHandle) {
    if let Some(state) = app.try_state::<RuntimeChildren>() {
        let mut children = state.0.lock().expect("runtime child lock poisoned");
        for child in children.iter_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        children.clear();
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(RuntimeChildren(Mutex::new(Vec::new())));
            let quit = MenuItem::with_id(app, "quit", "Thoát ClipRead", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&quit])?;
            let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("ClipRead");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| {
                if event.id() == "quit" {
                    stop_runtime(app);
                    app.exit(0);
                }
            })
            .build(app)?;
            start_runtime(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                stop_runtime(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running ClipRead")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                stop_runtime(app);
            }
        });
}
