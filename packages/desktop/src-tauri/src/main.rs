// Casca de desktop do The Lemon Quest. Spec: docs/superpowers/specs/2026-10-31-app-desktop-tauri-design.md.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod endereco;

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("The Lemon Quest")
                .inner_size(1280.0, 800.0)
                .min_inner_size(1024.0, 640.0)
                .center()
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app do The Lemon Quest");
}
