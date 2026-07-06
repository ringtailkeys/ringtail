// Ringtail — the native desktop shell. It does NOT reimplement the UI: it boots the
// compiled daemon as a bundled sidecar (serving the SAME apps/dashboard the browser
// `ringtail up` serves) and points the webview at that 127.0.0.1 origin. One UI, two
// shells. The shell's job is the native magic the browser can't give: unified title
// bar with inset traffic lights, NSVisualEffect / Mica vibrancy, a menu-bar Rocco,
// and a graceful sidecar lifecycle. ZERO telemetry — the daemon binds loopback only.

use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, RunEvent, Url, WebviewWindow};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the running daemon child so we can kill it on quit (no orphan process).
struct Sidecar(Mutex<Option<CommandChild>>);

/// Ask the OS for a free loopback port (bind :0, read it, drop the listener). Same
/// contract as the CLI's `freePort()` — a tiny bind→spawn race that's fine for a
/// single-user local boot.
fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .expect("could not grab a free loopback port")
}

/// Native translucency — one crate, both platforms. macOS gets the under-window
/// NSVisualEffect material (the dashboard injects a translucent cream so the blur
/// reads as Night Shift); Windows gets Mica with an Acrylic fallback for Win 10.
fn apply_native_vibrancy(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        let _ = apply_vibrancy(
            window,
            NSVisualEffectMaterial::UnderWindowBackground,
            Some(NSVisualEffectState::Active),
            Some(14.0),
        );
    }
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::{apply_acrylic, apply_mica};
        if apply_mica(window, None).is_err() {
            // Win 10 has no Mica — fall back to a cream-tinted Acrylic.
            let _ = apply_acrylic(window, Some((246, 237, 221, 40)));
        }
    }
    // Linux (dev only) has no equivalent — the opaque dashboard cream stands in.
    let _ = window;
}

/// Injected once into the webview: make the dashboard's outer background translucent
/// so the native vibrancy shows THROUGH it, tinted to the Night Shift cream. This is
/// the ONLY native-shell styling tweak — the shared dashboard source is untouched
/// (the browser shell stays opaque cream), so DRY holds. `!important` beats the App's
/// inline `background: var(--bg)`.
const VIBRANCY_CSS: &str = r#"
(function () {
  var s = document.createElement('style');
  s.textContent =
    'html,body{background:transparent !important;}' +
    '#root > div{background:color-mix(in srgb, var(--bg) 78%, transparent) !important;' +
    'backdrop-filter:saturate(1.1);}';
  document.head.appendChild(s);
})();
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main window missing from tauri.conf.json");

            apply_native_vibrancy(&window);

            // The bundled dashboard build (apps/dashboard/dist → resources/dashboard).
            let dashboard_dist = app
                .path()
                .resource_dir()?
                .join("dashboard");

            // Boot the daemon sidecar on a free loopback port, handing it the dist to
            // serve — exactly the env `ringtail up` sets, so the webview is same-origin.
            let port = free_port();
            let origin = format!("http://127.0.0.1:{port}");
            let (mut rx, child) = app
                .shell()
                .sidecar("ringtaild")?
                .env("PORT", port.to_string())
                .env("RINGTAIL_SERVE_DIST", dashboard_dist.to_string_lossy().to_string())
                // The native app is the GATED edition: sign-in wall + freemium + upgrade.
                // `ringtail up` from source omits this → defaults to `oss` (fully free).
                .env("RINGTAIL_EDITION", "app")
                .spawn()?;
            app.state::<Sidecar>().0.lock().unwrap().replace(child);

            // Surface the daemon's boot log to the app's stderr (handy for `tauri dev`).
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stderr(line) | CommandEvent::Stdout(line) = event {
                        eprint!("[ringtaild] {}", String::from_utf8_lossy(&line));
                    }
                }
            });

            // Handshake: wait for the daemon to accept connections, then swap the splash
            // for the live cockpit + inject the vibrancy tweak. Poll off-thread so the UI
            // (the splash) stays responsive; navigate back on the main thread.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for _ in 0..150 {
                    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                std::thread::sleep(Duration::from_millis(200)); // let routes settle
                let origin2 = origin.clone();
                let _ = handle.run_on_main_thread(move || {
                    if let Some(w) = handle.get_webview_window("main") {
                        if let Ok(url) = Url::parse(&origin2) {
                            let _ = w.navigate(url);
                        }
                        let _ = w.eval(VIBRANCY_CSS);
                    }
                });
            });

            // Native app menu (macOS shows it in the bar; Windows/Linux per-window).
            let menu = MenuBuilder::new(app)
                .items(&[
                    &PredefinedMenuItem::about(app, Some("Ringtail"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ])
                .build()?;
            app.set_menu(menu)?;

            // Menu-bar / tray Rocco → show the cockpit or quit.
            let show = MenuItemBuilder::with_id("show", "Show Ringtail").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit Ringtail").build(app)?;
            let tray_menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
            let _tray = TrayIconBuilder::with_id("ringtail-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Ringtail — your keys, raided · washed · stashed")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Ringtail app")
        .run(|app, event| {
            // Graceful shutdown: kill the daemon child so no loopback server is orphaned.
            if let RunEvent::Exit | RunEvent::ExitRequested { .. } = event {
                if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
