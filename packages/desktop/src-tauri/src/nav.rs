//! O que a janela pode carregar: o jogo (origem do servidor) e as páginas do próprio app. Qualquer outra URL vai
//! para o navegador do sistema, para o jogo nunca sair da janela.

use url::Url;

pub enum Destino {
    /// O jogo (mesma origem do servidor): carrega na janela.
    Dentro,
    /// Página do próprio app (boot, dev server do Tauri): carrega na janela.
    Local,
    /// Qualquer outra coisa: abre no navegador do sistema.
    Fora,
}

pub fn classificar(origem: &Url, destino: &Url) -> Destino {
    if mesma_origem(origem, destino) {
        Destino::Dentro
    } else if e_local(destino) {
        Destino::Local
    } else {
        Destino::Fora
    }
}

/// A página de boot é a `index.html` servida pelo app (`tauri://localhost`, `http://tauri.localhost` no Windows ou o
/// dev server em `localhost`), nunca a `index.html` do servidor do jogo.
pub fn e_boot(origem: &Url, url: &Url) -> bool {
    !mesma_origem(origem, url) && url.path() == "/index.html"
}

fn mesma_origem(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

fn e_local(u: &Url) -> bool {
    match u.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => matches!(u.host_str(), Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")),
        _ => false,
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use url::Url;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }
    const ORIGEM: &str = "http://embeddo-geral-00:2567/";

    #[test]
    fn mesma_origem_e_dentro() {
        for d in ["http://embeddo-geral-00:2567/", "http://embeddo-geral-00:2567/wiki/x.html", "http://embeddo-geral-00:2567/ranking?a=1"] {
            assert!(matches!(classificar(&u(ORIGEM), &u(d)), Destino::Dentro), "{d}");
        }
    }

    #[test]
    fn porta_ou_esquema_diferente_e_fora() {
        assert!(matches!(classificar(&u(ORIGEM), &u("http://embeddo-geral-00:2568/")), Destino::Fora));
        assert!(matches!(classificar(&u(ORIGEM), &u("https://embeddo-geral-00:2567/")), Destino::Fora));
        assert!(matches!(classificar(&u(ORIGEM), &u("https://github.com/leocsd/lemonquest")), Destino::Fora));
    }

    #[test]
    fn paginas_do_app_sao_locais() {
        for d in ["tauri://localhost/index.html", "http://tauri.localhost/index.html", "http://localhost:1430/index.html", "http://127.0.0.1:1430/", "about:blank"] {
            assert!(matches!(classificar(&u(ORIGEM), &u(d)), Destino::Local), "{d}");
        }
    }

    #[test]
    fn servidor_em_localhost_continua_dentro() {
        assert!(matches!(classificar(&u("http://localhost:2567/"), &u("http://localhost:2567/wiki/")), Destino::Dentro));
    }

    #[test]
    fn boot_e_a_index_fora_da_origem() {
        assert!(e_boot(&u(ORIGEM), &u("tauri://localhost/index.html")));
        assert!(e_boot(&u(ORIGEM), &u("http://tauri.localhost/index.html")));
        assert!(e_boot(&u("http://localhost:2567/"), &u("http://localhost:1430/index.html")));
    }

    #[test]
    fn jogo_nunca_e_boot() {
        assert!(!e_boot(&u(ORIGEM), &u(ORIGEM)));
        assert!(!e_boot(&u(ORIGEM), &u("http://embeddo-geral-00:2567/index.html")));
        assert!(!e_boot(&u("http://localhost:2567/"), &u("http://localhost:2567/index.html")));
    }
}
