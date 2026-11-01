//! Verifica no GitHub Releases se há versão nova do app e pergunta antes de instalar. Sem rede ou endpoint fora do
//! ar, segue em silêncio: o jogo nunca espera o updater.

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub const LINK_DOWNLOAD: &str = "https://github.com/leocsd/lemonquest/releases/latest";

pub fn mensagem_nova_versao(versao: &str) -> String {
    format!("Nova versão do app ({versao}). Atualizar agora?

O jogo fecha e reabre sozinho.")
}

pub fn mensagem_falha(erro: &str) -> String {
    format!("Não deu para atualizar: {erro}.

Baixe de novo em {LINK_DOWNLOAD}")
}

/// Consulta o endpoint; com versão nova, pergunta uma vez por abertura ("Depois" só volta a perguntar na próxima).
pub fn verificar_em_segundo_plano(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let updater = match app.updater() {
            Ok(u) => u,
            Err(e) => {
                eprintln!("[app] updater indisponível: {e}");
                return;
            }
        };
        let atualizacao = match updater.check().await {
            Ok(Some(a)) => a,
            Ok(None) => return,
            Err(e) => {
                eprintln!("[app] não conseguiu verificar versão nova: {e}");
                return;
            }
        };
        let versao = atualizacao.version.clone();
        let app_instalar = app.clone();
        app.dialog()
            .message(mensagem_nova_versao(&versao))
            .title("The Lemon Quest")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom("Atualizar".into(), "Depois".into()))
            .show(move |aceitou| {
                if !aceitou {
                    return;
                }
                tauri::async_runtime::spawn(async move {
                    match atualizacao.download_and_install(|_, _| {}, || {}).await {
                        Ok(()) => app_instalar.restart(),
                        Err(e) => {
                            eprintln!("[app] atualização falhou: {e}");
                            app_instalar
                                .dialog()
                                .message(mensagem_falha(&e.to_string()))
                                .title("The Lemon Quest")
                                .kind(MessageDialogKind::Error)
                                .buttons(MessageDialogButtons::Ok)
                                .show(|_| {});
                        }
                    }
                });
            });
    });
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn pergunta_diz_a_versao_e_avisa_que_fecha() {
        let m = mensagem_nova_versao("0.2.0");
        assert!(m.contains("0.2.0"), "{m}");
        assert!(m.contains("fecha e reabre"), "{m}");
    }

    #[test]
    fn falha_diz_o_erro_e_o_link() {
        let m = mensagem_falha("sem rede");
        assert!(m.contains("sem rede"), "{m}");
        assert!(m.contains(LINK_DOWNLOAD), "{m}");
    }
}
