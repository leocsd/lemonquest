//! "O servidor responde?" por conexão TCP. Fica no Rust porque a página de boot roda em contexto seguro no
//! macOS/Linux (`tauri://localhost`) e um `fetch` dela para `http://` seria bloqueado como conteúdo misto.

use std::net::TcpStream;
use std::time::Duration;
use url::Url;

/// Verdadeiro se algum endereço de `host:porta` aceita conexão TCP dentro do limite (o limite vale por endereço;
/// a resolução de nome não tem limite — por isso a chamada fica numa thread própria, nunca na da interface).
pub fn responde(destino: &Url, limite: Duration) -> bool {
    // `socket_addrs` resolve nome, IPv4 e IPv6 (inclusive o literal entre colchetes que `host_str` devolve) e usa a
    // porta padrão do esquema quando a URL não traz porta.
    let Ok(enderecos) = destino.socket_addrs(|| None) else { return false };
    enderecos.into_iter().any(|e| TcpStream::connect_timeout(&e, limite).is_ok())
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::net::TcpListener;
    use std::time::Duration;
    use url::Url;

    #[test]
    fn porta_aberta_responde() {
        let ouvinte = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = ouvinte.local_addr().unwrap().port();
        let u = Url::parse(&format!("http://127.0.0.1:{porta}/")).unwrap();
        assert!(responde(&u, Duration::from_secs(1)));
    }

    #[test]
    fn porta_fechada_nao_responde() {
        let porta = {
            let ouvinte = TcpListener::bind("127.0.0.1:0").unwrap();
            ouvinte.local_addr().unwrap().port()
        }; // o ouvinte morreu aqui: a porta está fechada
        let u = Url::parse(&format!("http://127.0.0.1:{porta}/")).unwrap();
        assert!(!responde(&u, Duration::from_secs(1)));
    }

    #[test]
    fn host_que_nao_resolve_nao_responde() {
        let u = Url::parse("http://nao-existe.invalid:2567/").unwrap();
        assert!(!responde(&u, Duration::from_millis(500)));
    }

    #[test]
    fn ipv6_literal_responde() {
        // host_str() devolve "[::1]" com colchetes: a resolução tem de aceitar isso.
        let Ok(ouvinte) = TcpListener::bind("[::1]:0") else { return }; // máquina sem IPv6 de loopback: nada a provar
        let porta = ouvinte.local_addr().unwrap().port();
        let u = Url::parse(&format!("http://[::1]:{porta}/")).unwrap();
        assert!(responde(&u, Duration::from_secs(1)));
    }
}
