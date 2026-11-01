//! Script de inicialização injetado em toda página que a janela carrega (boot e jogo): `window.__lemonApp`.
//! É o único contato do app com a página do jogo — nada de IPC.

pub fn script(versao: &str, so: &str, url: &str) -> String {
    // serde_json cuida do escape: a página nunca vê um valor fora de uma string JSON.
    let dados = serde_json::json!({ "versao": versao, "so": so, "url": url });
    format!(
        "Object.defineProperty(window, \"__lemonApp\", {{ value: Object.freeze({dados}), writable: false, configurable: false, enumerable: true }});"
    )
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn define_o_objeto_congelado() {
        let js = script("1.2.3", "windows", "http://embeddo-geral-00:2567/");
        assert!(js.starts_with("Object.defineProperty(window, \"__lemonApp\""), "{js}");
        assert!(js.contains("Object.freeze("), "{js}");
        assert!(js.contains("\"versao\":\"1.2.3\""), "{js}");
        assert!(js.contains("\"so\":\"windows\""), "{js}");
        assert!(js.contains("\"url\":\"http://embeddo-geral-00:2567/\""), "{js}");
        assert!(js.contains("configurable: false"), "{js}");
    }

    #[test]
    fn escapa_aspas_e_barras() {
        let js = script("1\"", "linux", "http://x/\\y");
        assert!(js.contains(r#""versao":"1\"""#), "{js}");
        assert!(js.contains(r#""url":"http://x/\\y""#), "{js}");
    }
}
