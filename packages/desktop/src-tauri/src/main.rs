// Casca de desktop do The Lemon Quest. Spec: docs/superpowers/specs/2026-10-31-app-desktop-tauri-design.md.
// Uma janela: carrega a página de boot (local), o Rust confere por TCP se o servidor responde e navega para o jogo.
// A página do jogo é 100 % remota, sem IPC: o único contato é o script de inicialização `window.__lemonApp`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod atualizador;
mod boot;
mod menu;
mod nav;
mod saude;
mod endereco;

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use url::Url;

/// Depois disso a boot para de recarregar sozinha e fica só o botão "Tentar agora".
const TENTATIVAS_AUTOMATICAS: u32 = 10;
/// Tempo máximo esperando o servidor aceitar a conexão TCP.
const LIMITE_CONEXAO: Duration = Duration::from_secs(3);

fn main() {
    #[allow(unused_mut)] // só o Windows acrescenta um plugin depois
    let mut construtor = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());
    #[cfg(target_os = "windows")]
    {
        construtor = construtor.plugin(teclas_windows());
    }
    construtor
        .setup(|app| {
            #[cfg(target_os = "macos")]
            menu::instalar(app)?;
            let args: Vec<String> = std::env::args().collect();
            match endereco::resolve_url(&args, endereco::URL_PADRAO) {
                Ok(destino) => {
                    abrir_janela(app, destino)?;
                    atualizador::verificar_em_segundo_plano(app.handle().clone());
                }
                Err(erro) => erro_fatal(app.handle(), &erro),
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app do The Lemon Quest");
}

/// WebView2 trata F5, F12, Ctrl+P, Ctrl+F etc. como atalhos de navegador: desliga só isso. Nenhum grupo do plugin
/// (`Flags::empty()`) para não tocar em F3 (modo de luta) nem no botão direito, que o jogo já trata.
#[cfg(target_os = "windows")]
fn teclas_windows<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    use tauri_plugin_prevent_default::{Flags, PlatformOptions};
    tauri_plugin_prevent_default::Builder::new()
        .with_flags(Flags::empty())
        .platform(PlatformOptions::new().browser_accelerator_keys(false))
        .build()
}

/// Cria a janela do jogo apontando para a página de boot e instala as regras de navegação e o laço boot → jogo.
fn abrir_janela(app: &tauri::App, destino: Url) -> tauri::Result<()> {
    let versao = app.package_info().version.to_string();
    let script = boot::script(&versao, std::env::consts::OS, destino.as_str());
    let tentativas = Arc::new(AtomicU32::new(0));

    let origem_nav = destino.clone();
    let app_nav = app.handle().clone();
    let app_nova = app.handle().clone();
    let alvo_boot = destino.clone();

    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("The Lemon Quest")
        .inner_size(1280.0, 800.0)
        .min_inner_size(1024.0, 640.0)
        .center()
        .initialization_script(script)
        // Jogo e páginas do app ficam na janela; qualquer outra URL vai para o navegador do sistema.
        .on_navigation(move |url| match nav::classificar(&origem_nav, url) {
            nav::Destino::Dentro | nav::Destino::Local => true,
            nav::Destino::Fora => {
                abrir_fora(&app_nav, url);
                false
            }
        })
        // `target="_blank"` e `window.open` (wiki, ranking): no navegador do sistema, o jogo continua aberto aqui.
        .on_new_window(move |url, _| {
            abrir_fora(&app_nova, &url);
            NewWindowResponse::Deny
        })
        // Cada carga da página de boot (inclusive o `location.reload()` do botão "Tentar agora") é uma tentativa.
        .on_page_load(move |janela, payload| {
            if !matches!(payload.event(), PageLoadEvent::Finished) || !nav::e_boot(&alvo_boot, payload.url()) {
                return;
            }
            let alvo = alvo_boot.clone();
            let tentativas = tentativas.clone();
            // Fora da thread da interface: a conexão pode esperar até LIMITE_CONEXAO.
            std::thread::spawn(move || {
                let n = tentativas.fetch_add(1, Ordering::SeqCst) + 1;
                if saude::responde(&alvo, LIMITE_CONEXAO) {
                    if let Err(e) = janela.navigate(alvo) {
                        eprintln!("[app] não conseguiu navegar para o jogo: {e}");
                    }
                } else {
                    let automatico = n < TENTATIVAS_AUTOMATICAS;
                    if let Err(e) = janela.eval(format!("window.__lemonBoot && window.__lemonBoot.falhou({n}, {automatico})")) {
                        eprintln!("[app] não conseguiu avisar a página de boot: {e}");
                    }
                }
            });
        })
        .build()?;
    Ok(())
}

/// Abre a URL no navegador padrão do sistema — só `http(s)`; o resto é ignorado e registrado.
fn abrir_fora(app: &AppHandle, url: &Url) {
    if !nav::pode_abrir_fora(url) {
        eprintln!("[app] navegação recusada (esquema não é http/https): {url}");
        return;
    }
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("[app] não conseguiu abrir no navegador: {url}: {e}");
    }
}

/// Mostra o erro numa caixa nativa e encerra o app (código 2) quando o jogador fechar a caixa.
fn erro_fatal(app: &AppHandle, mensagem: &str) {
    let encerrar = app.clone();
    app.dialog()
        .message(mensagem)
        .title("The Lemon Quest")
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::Ok)
        .show(move |_| encerrar.exit(2));
}
