//! Qual servidor o app abre: `--url` nos argumentos ou a URL padrão embutida. Só a origem interessa
//! (o jogo mora em `/`), então caminho, query e fragmento são descartados.

use url::Url;

/// Produção do escritório (nome do host na LAN, sobrevive a troca de IP).
pub const URL_PADRAO: &str = "http://embeddo-geral-00:2567";

/// `--url X` ou `--url=X` nos argumentos vence a padrão. Devolve só a origem.
pub fn resolve_url(args: &[String], padrao: &str) -> Result<Url, String> {
    let bruta = match args.iter().position(|a| a == "--url") {
        Some(i) => args
            .get(i + 1)
            .cloned()
            .ok_or_else(|| "--url precisa de um endereço, ex.: --url http://localhost:2567".to_string())?,
        None => match args.iter().find_map(|a| a.strip_prefix("--url=")) {
            Some(v) => v.to_string(),
            None => padrao.to_string(),
        },
    };
    let analisada = Url::parse(&bruta).map_err(|e| format!("endereço inválido \"{bruta}\": {e}"))?;
    if !matches!(analisada.scheme(), "http" | "https") {
        return Err(format!("o endereço \"{bruta}\" precisa começar com http:// ou https://"));
    }
    if analisada.host_str().map_or(true, str::is_empty) {
        return Err(format!("o endereço \"{bruta}\" não tem o nome do servidor"));
    }
    let mut origem = analisada;
    origem.set_path("/");
    origem.set_query(None);
    origem.set_fragment(None);
    Ok(origem)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn args(lista: &[&str]) -> Vec<String> {
        std::iter::once("lemonquest.exe").chain(lista.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn sem_argumentos_usa_a_padrao() {
        let u = resolve_url(&args(&[]), URL_PADRAO).unwrap();
        assert_eq!(u.as_str(), "http://embeddo-geral-00:2567/");
    }

    #[test]
    fn url_valida_vence_a_padrao() {
        let u = resolve_url(&args(&["--url", "http://localhost:2567"]), URL_PADRAO).unwrap();
        assert_eq!(u.as_str(), "http://localhost:2567/");
    }

    #[test]
    fn aceita_a_forma_com_igual() {
        let u = resolve_url(&args(&["--url=https://lemon.local"]), URL_PADRAO).unwrap();
        assert_eq!(u.as_str(), "https://lemon.local/");
    }

    #[test]
    fn mantem_so_a_origem() {
        let u = resolve_url(&args(&["--url", "http://10.0.0.5:2568/wiki/?x=1#y"]), URL_PADRAO).unwrap();
        assert_eq!(u.as_str(), "http://10.0.0.5:2568/");
    }

    #[test]
    fn sem_esquema_e_erro() {
        let erro = resolve_url(&args(&["--url", "localhost:2567"]), URL_PADRAO).unwrap_err();
        assert!(erro.contains("http://"), "{erro}");
    }

    #[test]
    fn url_invalida_e_erro() {
        assert!(resolve_url(&args(&["--url", "http://"]), URL_PADRAO).is_err());
    }

    #[test]
    fn url_sem_valor_e_erro() {
        let erro = resolve_url(&args(&["--url"]), URL_PADRAO).unwrap_err();
        assert!(erro.contains("--url"), "{erro}");
    }
}
