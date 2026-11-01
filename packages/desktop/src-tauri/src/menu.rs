//! Menu do macOS feito à mão: sem "Fechar janela" (Cmd+W fecharia o jogo no meio da caçada) e sem Visualizar/Recarregar.
//! "Editar" fica porque sem ele não há copiar/colar nem desfazer no chat.
#![cfg(target_os = "macos")]

use tauri::menu::{Menu, PredefinedMenuItem, Submenu};

pub fn instalar(app: &tauri::App) -> tauri::Result<()> {
    let aplicativo = Submenu::with_items(
        app,
        "The Lemon Quest",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("Sobre o The Lemon Quest"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("Ocultar"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Sair"))?,
        ],
    )?;
    let editar = Submenu::with_items(
        app,
        "Editar",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("Desfazer"))?,
            &PredefinedMenuItem::redo(app, Some("Refazer"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Recortar"))?,
            &PredefinedMenuItem::copy(app, Some("Copiar"))?,
            &PredefinedMenuItem::paste(app, Some("Colar"))?,
            &PredefinedMenuItem::select_all(app, Some("Selecionar tudo"))?,
        ],
    )?;
    let menu = Menu::with_items(app, &[&aplicativo, &editar])?;
    app.set_menu(menu)?;
    Ok(())
}
