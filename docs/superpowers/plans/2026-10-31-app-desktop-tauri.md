# App de desktop (Tauri 2) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um app de desktop (Windows, macOS, Linux) que abre o jogo do servidor numa janela própria, sem nada do
navegador, com as teclas do jogo livres e atualização automática pelo GitHub Releases.

**Architecture:** Pacote novo `packages/desktop` (Tauri 2, Rust mínimo). A janela carrega uma página local de boot;
o Rust confere por TCP se o servidor responde e navega para a URL do jogo. A página do jogo fica 100 % remota, sem
IPC nem API do Tauri; só um script de inicialização define `window.__lemonApp`. O updater (chave minisign própria)
consulta o `latest.json` da Release mais nova do GitHub e pergunta antes de instalar. O cliente web ganha só o link
"Baixar o app" na tela de login.

**Tech Stack:** Tauri 2.12 (crate `tauri`, `tauri-build`), plugins `tauri-plugin-updater`, `-dialog`, `-opener`,
`-window-state`, `-prevent-default` (só Windows), crates `url` e `serde_json`; `@tauri-apps/cli` 2.12; GitHub Actions
com `tauri-apps/tauri-action@v1`; cliente: Preact + vitest (já existentes).

Spec: [`docs/superpowers/specs/2026-10-31-app-desktop-tauri-design.md`](../specs/2026-10-31-app-desktop-tauri-design.md).

## Global Constraints

- Tudo em português: código, comentários (explicam o porquê), textos de interface, docs e mensagens de commit (uma
  linha descritiva, sem prefixo; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`).
- Nenhuma mudança no servidor (`packages/server`) nem no protocolo. No cliente, só `ui/appInfo.ts`, `ui/Login.tsx` e
  `ui/styles.css`.
- A página remota **nunca** recebe IPC: `withGlobalTauri` fica `false`, nenhuma capability com `remote`, nenhum comando
  Tauri. O único contato com a página é o script de inicialização `window.__lemonApp`.
- URL padrão embutida: `http://embeddo-geral-00:2567`. Override: `--url http(s)://host[:porta]` (só a origem é usada).
- Endpoint do updater: `https://github.com/leocsd/lemonquest/releases/latest/download/latest.json`. Link de download:
  `https://github.com/leocsd/lemonquest/releases/latest`. Releases do repositório são **só** do app.
- Versão do app: `packages/desktop/package.json > version` é a fonte única (`tauri.conf.json` lê `"../package.json"`;
  `Cargo.toml` fica em `0.0.0`). Tag de release: `app-vX.Y.Z`, igual à `version`.
- Janela: título "The Lemon Quest", 1280×800, mínimo 1024×640, centrada; estado lembrado entre aberturas.
- Teclas do jogo (F1–F4, F8, F9, H, Espaço, botão direito) nunca são interceptadas pelo app.
- Windows: NSIS `installMode: "currentUser"`; updater `installMode: "passive"`. macOS: DMG universal,
  `signingIdentity: "-"`, `Info.plist` com `NSAllowsArbitraryLoads`. Linux: AppImage.
- `packages/desktop/src-tauri/target/` e `gen/` nunca entram no git; `Cargo.lock` entra.
- Comandos de escrita em sistemas externos (`gh secret set`, `git push --tags`, `gh release`) podem ser barrados pelo
  classificador do modo automático: nesse caso, passe o comando ao dono para rodar com `!` na conversa.

**Desvio do spec, já decidido aqui:** a checagem do `/health` sai do JavaScript da página de boot e vai para o Rust
(conexão TCP a `host:porta`, 3 s), porque a página local roda em contexto seguro no macOS/Linux (`tauri://localhost`)
e um `fetch` para `http://` seria bloqueado como conteúdo misto. A página de boot continua só visual: o Rust navega
quando o servidor responde e, quando não responde, chama `window.__lemonBoot.falhou(n, automatico)` para ela mostrar
a contagem e o botão "Tentar agora" (que faz `location.reload()`, o que dispara nova tentativa no Rust). Pelo mesmo
motivo a página de boot chama-se `boot/index.html` (o Tauri espera `index.html` como entrada de `frontendDist`), não
`src/boot.html`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/desktop/package.json` | nome, **versão do app**, scripts `tauri`/`dev`/`build`/`icon`, dependência `@tauri-apps/cli` |
| `packages/desktop/README.md` | pré-requisitos por SO, build local, chave, como soltar versão, atritos |
| `packages/desktop/boot/index.html` | página local de boot (visual + `__lemonBoot.falhou`) |
| `packages/desktop/boot/limao.png` | cópia de `assets/favicon/icon-192.png` |
| `packages/desktop/src-tauri/Cargo.toml`, `build.rs`, `Cargo.lock` | crate `lemonquest-desktop` |
| `packages/desktop/src-tauri/tauri.conf.json` | produto, bundles, updater, janela nenhuma (criada no Rust) |
| `packages/desktop/src-tauri/Info.plist` | `NSAllowsArbitraryLoads` (macOS) |
| `packages/desktop/src-tauri/icons/*` | gerados por `tauri icon` |
| `packages/desktop/src-tauri/src/main.rs` | monta o app: plugins, menu, janela, updater |
| `packages/desktop/src-tauri/src/endereco.rs` | `URL_PADRAO`, `resolve_url(args, padrao)` |
| `packages/desktop/src-tauri/src/nav.rs` | `Destino`, `classificar(origem, destino)`, `e_boot(origem, url)` |
| `packages/desktop/src-tauri/src/boot.rs` | `script(versao, so, url)` (script de inicialização) |
| `packages/desktop/src-tauri/src/saude.rs` | `responde(url, limite)` (TCP) |
| `packages/desktop/src-tauri/src/atualizador.rs` | `verificar_em_segundo_plano(app)` + textos |
| `packages/desktop/src-tauri/src/menu.rs` | menu custom do macOS (sem Cmd+W) |
| `packages/client/src/ui/appInfo.ts` + `appInfo.test.ts` | lê `window.__lemonApp`; `APP_DOWNLOAD_URL`; `nomeDoSo` |
| `packages/client/src/ui/Login.tsx`, `styles.css` | link "Baixar o app" / "App vX" |
| `.github/workflows/ci.yml` | job `app`: `cargo check` + `cargo test` |
| `.github/workflows/app.yml` | tag `app-v*` → build 3 SOs → Release + `latest.json` |
| `package.json` (raiz), `.gitignore` | workspace, scripts `app:dev`/`app:build`, ignores |
| `README.md`, `CHANGELOG.md`, `docs/GAME_ROADMAP.md`, `docs/TEST_PLAN.md`, `packages/shared/src/data/news.ts` | entrega |

Todos os comandos abaixo partem da raiz do repositório (`C:\Users\leocs\Desktop\lemonquest`), branch `app-desktop`.
Comandos `cargo` rodam dentro de `packages/desktop/src-tauri`.

---

### Task 1: Pacote `packages/desktop` com a janela abrindo a página de boot

**Files:**
- Create: `packages/desktop/package.json`, `packages/desktop/boot/index.html`, `packages/desktop/boot/limao.png`,
  `packages/desktop/src-tauri/Cargo.toml`, `packages/desktop/src-tauri/build.rs`,
  `packages/desktop/src-tauri/tauri.conf.json`, `packages/desktop/src-tauri/Info.plist`,
  `packages/desktop/src-tauri/src/main.rs`, `packages/desktop/src-tauri/icons/*` (gerados)
- Modify: `package.json` (raiz: `workspaces`, scripts), `.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: o crate `lemonquest-desktop` que compila; `boot/index.html` com `window.__lemonBoot.falhou(tentativa: number, automatico: boolean)`
  e que lê `window.__lemonApp = { versao, so, url }`; scripts `npm run app:dev` / `npm run app:build`.

- [ ] **Step 1: Pacote npm e workspace**

Crie `packages/desktop/package.json`:

```json
{
  "name": "@lemonquest/desktop",
  "version": "0.1.0",
  "private": true,
  "description": "App de desktop do The Lemon Quest: casca Tauri que abre o jogo do servidor numa janela própria",
  "scripts": {
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build",
    "icon": "tauri icon ../../assets/favicon/icon-512.png"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.12.4"
  }
}
```

No `package.json` da raiz, acrescente o workspace e os scripts (o `-- --` final faz os argumentos chegarem ao binário:
`npm run app:dev -- --url http://localhost:2567` vira `tauri dev -- --url http://localhost:2567`):

```json
  "workspaces": [
    "packages/shared",
    "packages/server",
    "packages/client",
    "packages/desktop"
  ],
```

```json
    "admin": "npm run admin -w @lemonquest/server --",
    "app:dev": "npm run dev -w @lemonquest/desktop -- --",
    "app:build": "npm run build -w @lemonquest/desktop --"
```

No `.gitignore`, acrescente ao fim:

```gitignore

# App de desktop (Tauri): compilação do Rust e arquivos gerados pela CLI
packages/desktop/src-tauri/target/
packages/desktop/src-tauri/gen/
```

Instale (atualiza o `package-lock.json`):

Run: `npm install --no-audit --no-fund`
Expected: termina sem erro; `npx --no-install tauri --version` dentro de `packages/desktop` imprime `tauri-cli 2.12.x`.

- [ ] **Step 2: Página de boot**

Copie o limão: `cp assets/favicon/icon-192.png packages/desktop/boot/limao.png`.

Crie `packages/desktop/boot/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Lemon Quest</title>
    <style>
      /* Mesmo fundo escuro do HUD; fonte do sistema para a casca não pesar. */
      html, body { height: 100%; margin: 0; }
      body {
        display: flex; align-items: center; justify-content: center;
        background: #11141c; color: #e8e6df; font: 15px/1.5 system-ui, "Segoe UI", sans-serif;
        -webkit-user-select: none; user-select: none;
      }
      main { text-align: center; max-width: 520px; padding: 24px; }
      img { width: 96px; height: 96px; image-rendering: pixelated; }
      h1 { font-size: 22px; margin: 12px 0 4px; letter-spacing: 1px; }
      #estado { min-height: 48px; color: #b9bdc9; }
      body.erro #estado { color: #e9a86b; }
      #url { color: #7f8496; font-size: 12px; word-break: break-all; }
      #tentar {
        margin-top: 12px; padding: 8px 18px; font: inherit; cursor: pointer;
        color: #e8e6df; background: #2a3042; border: 1px solid #3f4761; border-radius: 4px;
      }
      #tentar:hover { background: #343b52; }
      #versao { position: fixed; right: 12px; bottom: 8px; font-size: 12px; color: #7f8496; }
    </style>
  </head>
  <body>
    <main>
      <img src="limao.png" alt="" draggable="false" />
      <h1>The Lemon Quest</h1>
      <p id="estado">Conectando ao servidor…</p>
      <p id="url"></p>
      <button id="tentar" type="button" hidden>Tentar agora</button>
    </main>
    <span id="versao"></span>
    <script>
      // O Rust (main.rs) decide: se o servidor responde, navega para o jogo; se não, chama __lemonBoot.falhou.
      // Recarregar esta página é o que pede uma nova tentativa ao Rust (on_page_load).
      (function () {
        var app = window.__lemonApp || { versao: "?", so: "?", url: "?" };
        var nomes = { windows: "Windows", macos: "Mac", linux: "Linux" };
        document.getElementById("url").textContent = app.url;
        document.getElementById("versao").textContent = "App v" + app.versao + " · " + (nomes[app.so] || app.so);
        var estado = document.getElementById("estado");
        var botao = document.getElementById("tentar");
        var timer = null;
        botao.addEventListener("click", function () {
          if (timer) clearInterval(timer);
          location.reload();
        });
        window.__lemonBoot = {
          falhou: function (tentativa, automatico) {
            document.body.classList.add("erro");
            botao.hidden = false;
            if (!automatico) {
              estado.textContent = "Servidor fora do ar ou sem rede (" + tentativa + " tentativas). Confira a rede e tente de novo.";
              return;
            }
            var restam = 5;
            var tick = function () {
              estado.textContent = "Servidor fora do ar ou sem rede. Tentando de novo em " + restam + " s… (tentativa " + tentativa + " de 10)";
              if (restam <= 0) { clearInterval(timer); location.reload(); return; }
              restam -= 1;
            };
            tick();
            timer = setInterval(tick, 1000);
          }
        };
      })();
    </script>
  </body>
</html>
```

- [ ] **Step 3: Crate Rust**

Crie `packages/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "lemonquest-desktop"
# A versão do app vem de packages/desktop/package.json (tauri.conf.json lê "../package.json"); esta não é usada.
version = "0.0.0"
description = "App de desktop do The Lemon Quest: abre o jogo do servidor numa janela própria"
edition = "2021"
publish = false

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2.12", features = [] }
tauri-plugin-updater = "2"
tauri-plugin-dialog = "2"
tauri-plugin-opener = "2"
tauri-plugin-window-state = "2"
serde_json = "1"
url = "2"

# Só no Windows: desliga os atalhos do WebView2 (F5, F12, Ctrl+P, Ctrl+F…). Mac e Linux não têm esses aceleradores.
[target.'cfg(windows)'.dependencies]
tauri-plugin-prevent-default = { version = "6", features = ["platform-windows"] }

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
```

Crie `packages/desktop/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

Crie `packages/desktop/src-tauri/tauri.conf.json` (o `pubkey` entra na Task 7):

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "The Lemon Quest",
  "version": "../package.json",
  "identifier": "com.lemonquest.desktop",
  "build": {
    "frontendDist": "../boot"
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "languages": ["PortugueseBR"]
      },
      "webviewInstallMode": {
        "type": "downloadBootstrapper",
        "silent": true
      }
    },
    "macOS": {
      "signingIdentity": "-",
      "minimumSystemVersion": "10.15"
    },
    "linux": {
      "appimage": {
        "bundleMediaFramework": false
      }
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "",
      "endpoints": ["https://github.com/leocsd/lemonquest/releases/latest/download/latest.json"],
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

Crie `packages/desktop/src-tauri/Info.plist` (o Tauri mescla com o Info.plist padrão; sem isso o macOS bloqueia
`http://` e `ws://` dentro de apps):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- O servidor do escritório é http:// na LAN; sem isto o WKWebView recusa a página e o WebSocket. -->
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
  </dict>
</dict>
</plist>
```

Gere os ícones a partir do limão (escreve em `src-tauri/icons/`):

Run: `cd packages/desktop && npx tauri icon ../../assets/favicon/icon-512.png && cd ../..`
Expected: lista de arquivos gerados incluindo `icons/icon.ico`, `icons/icon.icns`, `icons/32x32.png`,
`icons/128x128.png`, `icons/128x128@2x.png` (os de Android/iOS também são gerados; não fazem mal).

Crie `packages/desktop/src-tauri/src/main.rs` (versão mínima desta task: só abre a janela com a boot; as demais
tasks trocam este arquivo):

```rust
// Casca de desktop do The Lemon Quest. Spec: docs/superpowers/specs/2026-10-31-app-desktop-tauri-design.md.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
```

- [ ] **Step 4: Compilar**

Run: `cd packages/desktop/src-tauri && cargo check && cd ../../..`
Expected: `Finished` sem erros (a primeira vez baixa e compila o Tauri: alguns minutos). Gera `Cargo.lock`.

- [ ] **Step 5: Abrir a janela**

Run: `npm run app:dev`
Expected: abre uma janela "The Lemon Quest" 1280×800 com o limão, "Conectando ao servidor…" e `App v? · ?` no
rodapé (o script de inicialização entra na Task 5). Feche a janela (Ctrl+C no terminal se precisar).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore packages/desktop
git commit -m "App de desktop: pacote packages/desktop (Tauri 2) com a janela abrindo a página de boot" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `endereco.rs` — URL do servidor (`--url` ou padrão), só a origem

**Files:**
- Create: `packages/desktop/src-tauri/src/endereco.rs`
- Modify: `packages/desktop/src-tauri/src/main.rs` (só `mod endereco;`)

**Interfaces:**
- Produces: `pub const URL_PADRAO: &str = "http://embeddo-geral-00:2567";`
  `pub fn resolve_url(args: &[String], padrao: &str) -> Result<url::Url, String>` — devolve a **origem** (caminho `/`,
  sem query/fragmento). `Err` traz a mensagem para o jogador.

- [ ] **Step 1: Testes**

Crie `packages/desktop/src-tauri/src/endereco.rs` só com os testes:

```rust
//! Qual servidor o app abre: `--url` nos argumentos ou a URL padrão embutida. Só a origem interessa
//! (o jogo mora em `/`), então caminho, query e fragmento são descartados.

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
```

Em `main.rs`, logo abaixo do `#![cfg_attr(...)]`, acrescente `mod endereco;`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd packages/desktop/src-tauri && cargo test endereco:: && cd ../../..`
Expected: erro de compilação `cannot find function resolve_url` / `URL_PADRAO`.

- [ ] **Step 3: Implementação**

Acima do `#[cfg(test)]` em `endereco.rs`:

```rust
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd packages/desktop/src-tauri && cargo test endereco:: && cd ../../..`
Expected: `test result: ok. 7 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/src-tauri/src/endereco.rs packages/desktop/src-tauri/src/main.rs
git commit -m "App de desktop: URL do servidor por --url ou padrão, só a origem (endereco.rs)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `nav.rs` — política de navegação e detecção da página de boot

**Files:**
- Create: `packages/desktop/src-tauri/src/nav.rs`
- Modify: `packages/desktop/src-tauri/src/main.rs` (só `mod nav;`)

**Interfaces:**
- Consumes: `url::Url`.
- Produces:
  `pub enum Destino { Dentro, Local, Fora }`;
  `pub fn classificar(origem: &Url, destino: &Url) -> Destino` (`Dentro` = mesma origem do servidor; `Local` = página
  do app: `tauri://`, `http://tauri.localhost`, `localhost`/`127.0.0.1` do dev server, `about:`, `data:`, `blob:`;
  `Fora` = qualquer outra);
  `pub fn e_boot(origem: &Url, url: &Url) -> bool` (é a página de boot: não é a origem do servidor e o caminho é
  `/index.html`).

- [ ] **Step 1: Testes**

Crie `packages/desktop/src-tauri/src/nav.rs` só com os testes:

```rust
//! O que a janela pode carregar: o jogo (origem do servidor) e as páginas do próprio app. Qualquer outra URL vai
//! para o navegador do sistema, para o jogo nunca sair da janela.

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
```

Em `main.rs`, abaixo de `mod endereco;`, acrescente `mod nav;`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd packages/desktop/src-tauri && cargo test nav:: && cd ../../..`
Expected: erro de compilação (`classificar`, `e_boot`, `Destino` não existem).

- [ ] **Step 3: Implementação**

Acima do `#[cfg(test)]` em `nav.rs`:

```rust
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd packages/desktop/src-tauri && cargo test nav:: && cd ../../..`
Expected: `test result: ok. 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/src-tauri/src/nav.rs packages/desktop/src-tauri/src/main.rs
git commit -m "App de desktop: política de navegação (jogo e páginas do app na janela, resto no navegador) e detecção da boot" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `boot.rs` (script de inicialização) e `saude.rs` (servidor responde?)

**Files:**
- Create: `packages/desktop/src-tauri/src/boot.rs`, `packages/desktop/src-tauri/src/saude.rs`
- Modify: `packages/desktop/src-tauri/src/main.rs` (`mod boot; mod saude;`)

**Interfaces:**
- Produces: `pub fn boot::script(versao: &str, so: &str, url: &str) -> String` — JavaScript que define
  `window.__lemonApp` congelado com `{ versao, so, url }`;
  `pub fn saude::responde(destino: &Url, limite: Duration) -> bool` — conecta por TCP em `host:porta` (resolve DNS).

- [ ] **Step 1: Testes do script**

Crie `packages/desktop/src-tauri/src/boot.rs`:

```rust
//! Script de inicialização injetado em toda página que a janela carrega (boot e jogo): `window.__lemonApp`.
//! É o único contato do app com a página do jogo — nada de IPC.

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
```

- [ ] **Step 2: Testes da saúde**

Crie `packages/desktop/src-tauri/src/saude.rs`:

```rust
//! "O servidor responde?" por conexão TCP. Fica no Rust porque a página de boot roda em contexto seguro no
//! macOS/Linux (`tauri://localhost`) e um `fetch` dela para `http://` seria bloqueado como conteúdo misto.

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
}
```

Em `main.rs`, acrescente `mod boot;` e `mod saude;` abaixo de `mod nav;`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd packages/desktop/src-tauri && cargo test boot:: saude:: && cd ../../..`
Expected: erro de compilação (`script`, `responde` não existem).

- [ ] **Step 4: Implementações**

Acima do `#[cfg(test)]` em `boot.rs`:

```rust
pub fn script(versao: &str, so: &str, url: &str) -> String {
    // serde_json cuida do escape: a página nunca vê um valor fora de uma string JSON.
    let dados = serde_json::json!({ "versao": versao, "so": so, "url": url });
    format!(
        "Object.defineProperty(window, \"__lemonApp\", {{ value: Object.freeze({dados}), writable: false, configurable: false, enumerable: true }});"
    )
}
```

Acima do `#[cfg(test)]` em `saude.rs`:

```rust
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;
use url::Url;

/// Verdadeiro se algum endereço de `host:porta` aceita conexão TCP dentro do limite.
pub fn responde(destino: &Url, limite: Duration) -> bool {
    let Some(host) = destino.host_str() else { return false };
    let Some(porta) = destino.port_or_known_default() else { return false };
    let Ok(enderecos) = (host, porta).to_socket_addrs() else { return false };
    enderecos.into_iter().any(|e| TcpStream::connect_timeout(&e, limite).is_ok())
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd packages/desktop/src-tauri && cargo test boot:: saude:: && cd ../../..`
Expected: `test result: ok. 5 passed` (2 do boot, 3 da saúde).

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/src-tauri/src/boot.rs packages/desktop/src-tauri/src/saude.rs packages/desktop/src-tauri/src/main.rs
git commit -m "App de desktop: script de inicialização window.__lemonApp e checagem TCP do servidor" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Ligar tudo na janela (`main.rs`): boot → jogo, navegação, `_blank`, estado da janela

**Files:**
- Modify: `packages/desktop/src-tauri/src/main.rs` (reescrito por completo)

**Interfaces:**
- Consumes: `endereco::{URL_PADRAO, resolve_url}`, `nav::{classificar, e_boot, Destino}`, `boot::script`, `saude::responde`.
- Produces: `fn abrir_janela(app: &tauri::App, destino: Url) -> tauri::Result<()>`,
  `fn abrir_fora(app: &tauri::AppHandle, url: &str)`, `fn erro_fatal(app: &tauri::AppHandle, mensagem: &str)`.
  A Task 6 acrescenta o menu e as teclas; a Task 7 acrescenta `atualizador::verificar_em_segundo_plano`.

- [ ] **Step 1: Reescrever `main.rs`**

```rust
// Casca de desktop do The Lemon Quest. Spec: docs/superpowers/specs/2026-10-31-app-desktop-tauri-design.md.
// Uma janela: carrega a página de boot (local), o Rust confere por TCP se o servidor responde e navega para o jogo.
// A página do jogo é 100 % remota, sem IPC: o único contato é o script de inicialização `window.__lemonApp`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod boot;
mod nav;
mod saude;
mod endereco;

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use url::Url;

/// Depois disso a boot para de recarregar sozinha e fica só o botão "Tentar agora".
const TENTATIVAS_AUTOMATICAS: u32 = 10;
/// Tempo máximo esperando o servidor aceitar a conexão TCP.
const LIMITE_CONEXAO: Duration = Duration::from_secs(3);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            match endereco::resolve_url(&args, endereco::URL_PADRAO) {
                Ok(destino) => abrir_janela(app, destino)?,
                Err(erro) => erro_fatal(app.handle(), &erro),
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app do The Lemon Quest");
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
                abrir_fora(&app_nav, url.as_str());
                false
            }
        })
        // `target="_blank"` e `window.open` (wiki, ranking): no navegador do sistema, o jogo continua aberto aqui.
        .on_new_window(move |url, _| {
            abrir_fora(&app_nova, url.as_str());
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
                    let _ = janela.eval(format!("window.__lemonBoot && window.__lemonBoot.falhou({n}, {automatico})"));
                }
            });
        })
        .build()?;
    Ok(())
}

/// Abre a URL no navegador padrão do sistema.
fn abrir_fora(app: &AppHandle, url: &str) {
    if let Err(e) = app.opener().open_url(url, None::<&str>) {
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
```

- [ ] **Step 2: Compilar e rodar os testes**

Run: `cd packages/desktop/src-tauri && cargo test && cd ../../..`
Expected: compila; `test result: ok. 18 passed` (7 endereco + 6 nav + 2 boot + 3 saúde).

- [ ] **Step 3: Provar o laço boot → jogo contra o servidor local**

Em outro terminal: `npm run dev` (servidor na 2567 + Vite na 3000; em dev o servidor não serve o cliente, só o Vite). Então:

Run: `npm run app:dev -- --url http://localhost:3000`
Expected: a boot aparece por um instante e a janela carrega a tela de login do jogo (o cliente em dev fala com o
servidor na 2567 por conta própria; isso é fetch/WebSocket, não navegação, e não passa pela política). Tela de login
ainda sem "App v…" (Task 8).

- [ ] **Step 4: Provar a boot com servidor fora do ar**

Pare o `npm run dev`. Run: `npm run app:dev -- --url http://localhost:2599`
Expected: "Servidor fora do ar ou sem rede. Tentando de novo em 5 s… (tentativa 1 de 10)", contagem regressiva,
recarrega e vai para a tentativa 2; o botão "Tentar agora" aparece; depois da 10ª: texto "(10 tentativas)" e só o botão.

- [ ] **Step 5: Provar `--url` inválida**

Run: `npm run app:dev -- --url localhost:2567`
Expected: caixa de erro nativa "o endereço "localhost:2567" precisa começar com http:// ou https://"; ao fechar, o
processo termina (código 2).

- [ ] **Step 6: Provar `_blank` e links de fora**

Com o servidor de volta (`npm run dev`) e o app aberto: pressione F1 e clique em "Wiki do jogo".
Expected: a wiki abre no navegador padrão do sistema (em dev ela pode dar 404 lá: o que se prova é que abriu fora do
app); a janela do app continua no jogo.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop/src-tauri/src/main.rs
git commit -m "App de desktop: boot → jogo pela checagem TCP, navegação presa ao servidor, _blank no navegador do sistema" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Teclas sem briga — Windows (`prevent-default`) e macOS (menu sem Cmd+W)

**Files:**
- Create: `packages/desktop/src-tauri/src/menu.rs`
- Modify: `packages/desktop/src-tauri/src/main.rs`

**Interfaces:**
- Produces: `#[cfg(target_os = "macos")] pub fn menu::instalar(app: &tauri::App) -> tauri::Result<()>`;
  `#[cfg(target_os = "windows")] fn teclas_windows<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R>`.

- [ ] **Step 1: Menu do macOS**

Crie `packages/desktop/src-tauri/src/menu.rs`:

```rust
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
```

- [ ] **Step 2: Ligar no `main.rs`**

Acrescente `mod menu;` à lista de módulos (depois de `mod boot;`). Substitua a construção do `Builder` em `main()`:

```rust
fn main() {
    #[allow(unused_mut)] // só o Windows acrescenta um plugin depois
    let mut construtor = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
                Ok(destino) => abrir_janela(app, destino)?,
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
```

- [ ] **Step 3: Compilar e testar**

Run: `cd packages/desktop/src-tauri && cargo test && cd ../../..`
Expected: compila no Windows; `18 passed`. (Se `PlatformOptions` ou `.platform` não existirem nesta versão do plugin,
abra `https://docs.rs/tauri-plugin-prevent-default` na versão resolvida no `Cargo.lock`, seção "Platform options",
e use o nome que ela mostrar; o efeito exigido é `AreBrowserAcceleratorKeysEnabled = false` no WebView2.)

- [ ] **Step 4: Provar as teclas no Windows**

Com o servidor local no ar: `npm run app:dev -- --url http://localhost:3000`. Logue e, no jogo:
- F5, F12, Ctrl+F, Ctrl+P, Ctrl+W: nada acontece (sem recarregar, sem devtools, sem busca, sem imprimir, sem fechar).
- F2/F3/F4 trocam o modo de luta; F8 segue; F9 ataque automático; F1 abre a ajuda; H abre Magias; botão direito no
  mundo funciona (sem menu de contexto do navegador).
Expected: tudo como descrito.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/src-tauri/src/menu.rs packages/desktop/src-tauri/src/main.rs
git commit -m "App de desktop: atalhos do WebView2 desligados no Windows e menu do macOS sem Cmd+W" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Updater — chave de assinatura, `atualizador.rs` e diálogo "Atualizar agora?"

**Files:**
- Create: `packages/desktop/src-tauri/src/atualizador.rs`
- Modify: `packages/desktop/src-tauri/tauri.conf.json` (`pubkey`), `packages/desktop/src-tauri/src/main.rs`

**Interfaces:**
- Produces: `pub fn atualizador::verificar_em_segundo_plano(app: tauri::AppHandle)`;
  `pub const LINK_DOWNLOAD: &str = "https://github.com/leocsd/lemonquest/releases/latest";`
  `pub fn mensagem_nova_versao(versao: &str) -> String`; `pub fn mensagem_falha(erro: &str) -> String`.

- [ ] **Step 1: Gerar a chave (uma vez, pelo dono)**

Run (em `packages/desktop`): `npx tauri signer generate -w ~/.tauri/lemonquest.key`
Digite uma senha quando pedir (guarde-a junto com a chave).
Expected: cria `~/.tauri/lemonquest.key` (privada) e `~/.tauri/lemonquest.key.pub` (pública) e imprime a pública.
**A chave privada nunca entra no repositório.** Guarde uma cópia fora do PC (perdê-la = as instalações existentes
não aceitam mais update).

Cole o conteúdo de `~/.tauri/lemonquest.key.pub` (uma linha longa em base64) em
`packages/desktop/src-tauri/tauri.conf.json > plugins.updater.pubkey`.

Segredos do GitHub (o classificador pode barrar; se barrar, o dono roda com `!`):

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/lemonquest.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD   # cola a senha quando pedir
```

- [ ] **Step 2: Testes dos textos**

Crie `packages/desktop/src-tauri/src/atualizador.rs`:

```rust
//! Verifica no GitHub Releases se há versão nova do app e pergunta antes de instalar. Sem rede ou endpoint fora do
//! ar, segue em silêncio: o jogo nunca espera o updater.

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
```

Em `main.rs`, acrescente `mod atualizador;` (primeiro da lista de módulos).

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd packages/desktop/src-tauri && cargo test atualizador:: && cd ../../..`
Expected: erro de compilação (`mensagem_nova_versao`, `mensagem_falha`, `LINK_DOWNLOAD` não existem).

- [ ] **Step 4: Implementação**

Acima do `#[cfg(test)]` em `atualizador.rs`:

```rust
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub const LINK_DOWNLOAD: &str = "https://github.com/leocsd/lemonquest/releases/latest";

pub fn mensagem_nova_versao(versao: &str) -> String {
    format!("Nova versão do app ({versao}). Atualizar agora?\n\nO jogo fecha e reabre sozinho.")
}

pub fn mensagem_falha(erro: &str) -> String {
    format!("Não deu para atualizar: {erro}.\n\nBaixe de novo em {LINK_DOWNLOAD}")
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
```

Em `main.rs`: registre o plugin e dispare a verificação depois de abrir a janela.

```rust
    #[allow(unused_mut)] // só o Windows acrescenta um plugin depois
    let mut construtor = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());
```

```rust
            match endereco::resolve_url(&args, endereco::URL_PADRAO) {
                Ok(destino) => {
                    abrir_janela(app, destino)?;
                    atualizador::verificar_em_segundo_plano(app.handle().clone());
                }
                Err(erro) => erro_fatal(app.handle(), &erro),
            }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd packages/desktop/src-tauri && cargo test && cd ../../..`
Expected: `test result: ok. 20 passed`.

- [ ] **Step 6: Rodar o app**

Run: `npm run app:dev -- --url http://localhost:3000`
Expected: abre normalmente; no terminal, uma linha `[app] não conseguiu verificar versão nova: …` (ainda não existe
Release) e nada de diálogo. O ciclo real de update é a Task 11.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop/src-tauri/src/atualizador.rs packages/desktop/src-tauri/src/main.rs packages/desktop/src-tauri/tauri.conf.json
git commit -m "App de desktop: updater pelo GitHub Releases com chave própria e diálogo Atualizar/Depois" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Cliente — `appInfo.ts` e o link "Baixar o app" na tela de login

**Files:**
- Create: `packages/client/src/ui/appInfo.ts`, `packages/client/src/ui/appInfo.test.ts`
- Modify: `packages/client/src/ui/Login.tsx` (imports e o bloco final do `return`), `packages/client/src/ui/styles.css`
  (depois de `.login-notice`, linha 267)

**Interfaces:**
- Consumes: `window.__lemonApp` (Task 4).
- Produces: `export interface AppInfo { versao: string; so: string }`, `export function appInfo(w?: unknown): AppInfo | null`,
  `export function nomeDoSo(so: string): string`, `export const APP_DOWNLOAD_URL`.

- [ ] **Step 1: Teste**

Crie `packages/client/src/ui/appInfo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { appInfo, nomeDoSo, APP_DOWNLOAD_URL } from "./appInfo.ts";

describe("appInfo", () => {
  it("sem marca (navegador comum) é null", () => {
    expect(appInfo({})).toBeNull();
    expect(appInfo(null)).toBeNull();
    expect(appInfo(undefined)).toBeNull();
  });

  it("lê versão e sistema da marca do app", () => {
    expect(appInfo({ __lemonApp: { versao: "0.1.0", so: "windows", url: "http://x/" } })).toEqual({ versao: "0.1.0", so: "windows" });
  });

  it("marca malformada é null; sistema ausente vira vazio", () => {
    expect(appInfo({ __lemonApp: "0.1.0" })).toBeNull();
    expect(appInfo({ __lemonApp: { so: "linux" } })).toBeNull();
    expect(appInfo({ __lemonApp: { versao: "" } })).toBeNull();
    expect(appInfo({ __lemonApp: { versao: "1.0.0" } })).toEqual({ versao: "1.0.0", so: "" });
  });

  it("nome do sistema para o jogador", () => {
    expect(nomeDoSo("windows")).toBe("Windows");
    expect(nomeDoSo("macos")).toBe("Mac");
    expect(nomeDoSo("linux")).toBe("Linux");
    expect(nomeDoSo("")).toBe("?");
    expect(nomeDoSo("freebsd")).toBe("freebsd");
  });

  it("link de download aponta para a Release mais nova", () => {
    expect(APP_DOWNLOAD_URL).toBe("https://github.com/leocsd/lemonquest/releases/latest");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/client/src/ui/appInfo.test.ts`
Expected: FAIL (`Cannot find module './appInfo.ts'`).

- [ ] **Step 3: Implementação**

Crie `packages/client/src/ui/appInfo.ts`:

```ts
// Marca que o app de desktop (packages/desktop) deixa na página antes de cada carga: `window.__lemonApp`.
// O cliente só a lê para mostrar a versão e esconder o link de download; nenhuma regra de jogo depende dela.

export interface AppInfo {
  versao: string;
  so: string;
}

/** Página da Release mais nova no GitHub (instaladores de Windows, Mac e Linux). */
export const APP_DOWNLOAD_URL = "https://github.com/leocsd/lemonquest/releases/latest";

const NOMES_SO: Record<string, string> = { windows: "Windows", macos: "Mac", linux: "Linux" };

export function appInfo(w: unknown = globalThis): AppInfo | null {
  if (!w || typeof w !== "object") return null;
  const marca = (w as { __lemonApp?: unknown }).__lemonApp;
  if (!marca || typeof marca !== "object") return null;
  const { versao, so } = marca as { versao?: unknown; so?: unknown };
  if (typeof versao !== "string" || !versao) return null;
  return { versao, so: typeof so === "string" ? so : "" };
}

export function nomeDoSo(so: string): string {
  return NOMES_SO[so] ?? (so || "?");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/client/src/ui/appInfo.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Tela de login**

Em `packages/client/src/ui/Login.tsx`, acrescente o import depois de `import { loading } from "./loading.ts";`:

```ts
import { APP_DOWNLOAD_URL, appInfo, nomeDoSo } from "./appInfo.ts";
```

Dentro de `export function Login()`, logo antes do `return (` final (o que monta `<div class="login-wrap"`), acrescente:

```ts
  // Dentro do app de desktop mostra a versão; no navegador, o link para baixar o app.
  const app = appInfo();
```

E no JSX, logo depois da linha
`<p class="login-notice">Rede do escritório sem criptografia: não use a mesma senha do trabalho.</p>`:

```tsx
        {app
          ? <p class="login-app" data-testid="login-app">App v{app.versao} · {nomeDoSo(app.so)}</p>
          : <p class="login-app"><a href={APP_DOWNLOAD_URL} target="_blank" rel="noopener">Baixar o app para Windows, Mac ou Linux</a></p>}
```

Em `packages/client/src/ui/styles.css`, logo depois da linha de `.login-notice` (267):

```css
.login-app { margin: 6px 0 0; font-size: 12px; color: #7f8496; text-align: center; }
.login-app a { color: #c9d05a; text-decoration: underline; text-underline-offset: 2px; }
.login-app a:hover { color: #e6ec7a; }
```

- [ ] **Step 6: Typecheck e testes do cliente**

Run: `npm run typecheck && npx vitest run packages/client`
Expected: 3× tsc sem erro; todos os testes do cliente passam.

- [ ] **Step 7: Ver na tela**

`npm run dev` e abra `http://localhost:3000`: abaixo do aviso de rede aparece o link "Baixar o app para Windows, Mac ou
Linux". No app (`npm run app:dev -- --url http://localhost:3000`): "App v0.1.0 · Windows" no mesmo lugar.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/ui/appInfo.ts packages/client/src/ui/appInfo.test.ts packages/client/src/ui/Login.tsx packages/client/src/ui/styles.css
git commit -m "Tela de login: link para baixar o app de desktop (no app, mostra a versão)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: CI — `cargo check`/`cargo test` em toda PR e Release por tag `app-v*`

**Files:**
- Modify: `.github/workflows/ci.yml` (job novo `app`, depois do job `test`)
- Create: `.github/workflows/app.yml`

**Interfaces:**
- Consumes: segredos `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (Task 7), `packages/desktop/package.json > version`.
- Produces: Release `app-vX.Y.Z` com `*-setup.exe`, `*.dmg`, `*.app.tar.gz`, `*.AppImage`, `.sig` e `latest.json`.

- [ ] **Step 1: Job `app` no `ci.yml`**

Insira entre o job `test` e o job `docker`:

```yaml
  app:
    name: App de desktop (cargo check e testes)
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - name: Dependências do WebKitGTK
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: packages/desktop/src-tauri
      - run: cargo check --locked
        working-directory: packages/desktop/src-tauri
      - run: cargo test --locked
        working-directory: packages/desktop/src-tauri
```

- [ ] **Step 2: Workflow de Release**

Crie `.github/workflows/app.yml`:

```yaml
name: App de desktop (release)

# Tag app-vX.Y.Z → builda Windows (NSIS), macOS (DMG universal) e Linux (AppImage), publica a Release com os
# instaladores, as assinaturas do updater e o latest.json que o app consulta. A versão vem de
# packages/desktop/package.json e tem de bater com a tag.
on:
  push:
    tags: ["app-v*"]

jobs:
  versao:
    name: Tag bate com a versão do pacote
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          tag="${GITHUB_REF_NAME#app-v}"
          pkg="$(node -p "require('./packages/desktop/package.json').version")"
          [ "$tag" = "$pkg" ] || { echo "tag app-v$tag não bate com packages/desktop/package.json ($pkg)"; exit 1; }

  release:
    name: Build e Release (${{ matrix.platform }})
    needs: versao
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: --target universal-apple-darwin --bundles app,dmg
            targets: aarch64-apple-darwin,x86_64-apple-darwin
          - platform: ubuntu-22.04
            args: --bundles appimage
            targets: ""
          - platform: windows-latest
            args: --bundles nsis
            targets: ""
    runs-on: ${{ matrix.platform }}
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.targets }}
      - name: Dependências do WebKitGTK (Ubuntu)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: packages/desktop/src-tauri
      - run: npm ci --no-audit --no-fund
      - uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: packages/desktop
          tagName: app-v__VERSION__
          releaseName: "App v__VERSION__"
          releaseBody: "Instalador do app de desktop do The Lemon Quest. Windows: *-setup.exe · Mac: *.dmg · Linux: *.AppImage. O app abre o jogo do servidor do escritório e se atualiza sozinho."
          releaseDraft: false
          prerelease: false
          uploadUpdaterJson: true
          updaterJsonPreferNsis: true
          args: ${{ matrix.args }}
```

- [ ] **Step 3: Validar a sintaxe**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/app.yml','utf8'); console.log(y.split('\n').length, 'linhas')"` e, se houver `npx --no-install yaml` disponível, `npx yaml .github/workflows/app.yml`. Senão, abra o arquivo e confira a indentação (2 espaços, listas com `- `).
Expected: sem erro de parse.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/app.yml
git commit -m "CI: cargo check e testes do app de desktop em toda PR; release por tag app-v* com Windows, macOS e Linux" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Documentação e entrega (README, README do pacote, CHANGELOG, ROADMAP, Novidades)

**Files:**
- Create: `packages/desktop/README.md`
- Modify: `README.md` (seção nova antes de `## Administradores`, linha 73), `CHANGELOG.md` (topo, depois de `# Changelog`),
  `docs/GAME_ROADMAP.md` (seção nova antes de `## Loot automático configurável (2026-10-28)`),
  `packages/shared/src/data/news.ts` (entrada nova no topo de `NEWS`)

- [ ] **Step 1: README do pacote**

Crie `packages/desktop/README.md`:

```markdown
# App de desktop do The Lemon Quest

Casca [Tauri 2](https://v2.tauri.app) que abre o jogo do servidor numa janela própria: ícone na área de trabalho,
nada do navegador, teclas do jogo livres e atualização automática. O jogo em si continua vindo do servidor
(`http://embeddo-geral-00:2567`); o app só carrega a página. Spec:
[`docs/superpowers/specs/2026-10-31-app-desktop-tauri-design.md`](../../docs/superpowers/specs/2026-10-31-app-desktop-tauri-design.md).

## Pré-requisitos para compilar

- Rust estável (`rustup`), Node 24 e `npm install` na raiz (instala a `@tauri-apps/cli`).
- **Windows**: Visual Studio Build Tools com "Desenvolvimento para desktop com C++" e o WebView2 Runtime (o
  Windows 11 já tem).
- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Linux**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.

## Rodar em desenvolvimento

    npm run app:dev                                   # abre http://embeddo-geral-00:2567
    npm run app:dev -- --url http://localhost:3000    # Vite local (npm run dev noutro terminal)
    npm run app:dev -- --url http://embeddo-geral-00:2568   # ambiente de dev do servidor

`--url` aceita só a origem (`http(s)://host[:porta]`); caminho e query são ignorados.

## Como funciona

- `boot/index.html`: página local de boot ("Conectando ao servidor…"). O Rust (`src-tauri/src/main.rs`) confere por
  TCP se o servidor responde e navega para o jogo; senão, a boot mostra a contagem e o botão "Tentar agora".
- A página do jogo é 100 % remota, sem IPC nem API do Tauri. O único contato é o script de inicialização que define
  `window.__lemonApp = { versao, so, url }` (o cliente mostra "App vX" na tela de login).
- Navegação: só a origem do servidor e as páginas do app ficam na janela; `target="_blank"` (wiki, ranking) e qualquer
  outra URL abrem no navegador do sistema.
- Teclas: no Windows o plugin `prevent-default` desliga os atalhos do WebView2 (F5, F12, Ctrl+F, Ctrl+P); no macOS o
  menu é feito à mão, sem Cmd+W. O botão direito e F1–F4/F8/F9 do jogo ficam intactos.
- Updater: consulta `https://github.com/leocsd/lemonquest/releases/latest/download/latest.json` ao abrir; com versão
  nova pergunta "Atualizar agora?" (Depois/Atualizar). Sem rede, segue em silêncio.

## Soltar uma versão

1. Suba a `version` em `packages/desktop/package.json` (fonte única; `tauri.conf.json` lê dali) e commite.
2. `git tag app-vX.Y.Z && git push origin app-vX.Y.Z`.
3. O workflow `.github/workflows/app.yml` builda Windows (NSIS por usuário), macOS (DMG universal, assinatura ad-hoc)
   e Linux (AppImage) e publica a Release `app-vX.Y.Z` com os instaladores, as assinaturas e o `latest.json`.
4. Confira em `https://github.com/leocsd/lemonquest/releases/latest`. Os apps instalados perguntam para atualizar na
   próxima abertura.

As Releases do repositório são **só** do app: o updater lê a Release mais nova.

## Chave de assinatura do updater

Gerada uma vez com `npx tauri signer generate -w ~/.tauri/lemonquest.key` (dentro de `packages/desktop`). A pública
está em `src-tauri/tauri.conf.json > plugins.updater.pubkey`; a privada e a senha ficam nos segredos do GitHub
(`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) e numa cópia do dono fora do repositório.
Perder a chave = as instalações existentes não aceitam mais update (teriam de baixar de novo).

Build local assinado (para testar um instalador):

    # PowerShell
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ~/.tauri/lemonquest.key -Raw
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "a senha"
    npm run app:build -- --bundles nsis        # Windows; macOS: --bundles app,dmg; Linux: --bundles appimage

Saída em `src-tauri/target/release/bundle/`.

## Atritos conhecidos (sem certificado pago)

- **Windows**: SmartScreen avisa uma vez ("Mais informações → Executar assim mesmo"). Instala em
  `%LOCALAPPDATA%\Programs\The Lemon Quest`, sem admin.
- **macOS**: na primeira abertura, "Abrir assim mesmo" em Ajustes → Privacidade e Segurança. O `Info.plist` libera
  `http://` (a LAN não tem HTTPS).
- **Linux**: `chmod +x` no AppImage. Se o WebKitGTK não der WebGL, o Phaser cai para Canvas sozinho.
```

- [ ] **Step 2: README da raiz**

Antes de `## Administradores`, insira:

```markdown
## App de desktop

Em vez do navegador, dá para jogar num app próprio (Windows, Mac e Linux): ícone na área de trabalho, janela só do
jogo, nenhuma tecla brigando com o navegador e atualização automática. Baixe na tela de login ("Baixar o app") ou em
<https://github.com/leocsd/lemonquest/releases/latest>. O app abre o servidor do escritório; para apontar para outro,
rode-o com `--url http://host:porta`. Detalhes, build e como soltar versão: [`packages/desktop/README.md`](packages/desktop/README.md).

Avisos únicos por PC, por não termos certificado pago: no Windows o SmartScreen pede "Mais informações → Executar
assim mesmo"; no Mac, "Abrir assim mesmo" em Privacidade e Segurança.

```

- [ ] **Step 3: CHANGELOG**

Depois de `# Changelog` (e da linha em branco), insira:

```markdown
## [Não lançado] — 2026-10-31 · app de desktop (Windows, Mac e Linux)

Dono: "criar um client" — ícone na área de trabalho, janela sem nada do navegador, teclas sem briga, abrir direto no
servidor e atualizar sozinho. Pacote novo `packages/desktop` (Tauri 2, ~10 MB): uma janela carrega a página de boot,
o Rust confere por TCP se o servidor responde e navega para o jogo, que continua 100 % remoto (sem IPC; só
`window.__lemonApp` com versão/sistema/URL). Navegação presa à origem do servidor: wiki, ranking e qualquer link de
fora abrem no navegador do sistema. Windows: atalhos do WebView2 desligados (F5, F12, Ctrl+F, Ctrl+P); macOS: menu sem
Cmd+W. Updater com chave própria (minisign) lendo o `latest.json` da Release mais nova do GitHub, perguntando antes
("Atualizar agora?"). `--url` aponta para outro servidor. Tela de login ganha "Baixar o app" (no app, "App vX").
CI: `cargo check`/`cargo test` em toda PR; tag `app-vX.Y.Z` builda os 3 sistemas e publica a Release. Servidor intacto.

```

- [ ] **Step 4: ROADMAP**

Antes de `## Loot automático configurável (2026-10-28)`, insira:

```markdown
## App de desktop (2026-10-31)

Spec: [superpowers/specs/2026-10-31-app-desktop-tauri-design.md](superpowers/specs/2026-10-31-app-desktop-tauri-design.md).
Decisões do dono: casca que carrega o jogo do servidor; Windows + macOS + Linux; Tauri 2; instaladores e `latest.json`
no GitHub Releases; URL padrão `http://embeddo-geral-00:2567`; update pergunta antes.

| # | Item | Status | Validação |
|---|---|---|---|
| AD-1 | Pacote `packages/desktop` (Tauri 2): janela, boot → jogo por TCP, navegação presa ao servidor, `_blank` no navegador do sistema, `--url` | ✅ (2026-10-31) | `cargo test` (endereco, nav, boot, saúde); manual |
| AD-2 | Teclas: WebView2 sem atalhos de navegador (Windows), menu do macOS sem Cmd+W; F1–F4/F8/F9 e botão direito intactos | ✅ (2026-10-31) | manual no Windows |
| AD-3 | Updater: chave minisign, `latest.json` na Release, diálogo Atualizar/Depois, falha avisa com link | ✅ (2026-10-31) | `cargo test` (textos); ciclo real 0.1.0 → 0.1.1 (AD-5) |
| AD-4 | Tela de login: "Baixar o app" fora do app, "App vX" dentro; CI (`cargo check`/`test` por PR; Release por tag `app-v*`) | ✅ (2026-10-31) | `appInfo.test.ts`; workflow `app.yml` |
| AD-5 | Validação manual nos 3 sistemas e ciclo real de update (app-v0.1.0 → app-v0.1.1) | ⏳ | `docs/TEST_PLAN.md` |
| AD-6 | macOS: update sem assinatura Apple (só ad-hoc) é a parte menos provada; validar no Mac de quem usar antes de anunciar para Mac. Se não abrir depois do update, documentar reinstalação pelo DMG | 🧭 | — |
| AD-7 | Linux: WebGL no WebKitGTK (Phaser cai para Canvas); se ficar lento, avaliar `WEBKIT_DISABLE_DMABUF_RENDERER=1` no AppImage | ⏳ | relato de quem usar Linux |

```

- [ ] **Step 5: Novidades**

Em `packages/shared/src/data/news.ts`, no topo do array `NEWS` (antes da entrada `"2026-10-28h"`):

```ts
  {
    id: "2026-10-31a",
    date: "31 de outubro",
    title: "Agora tem app de desktop",
    items: [
      "Baixe o app na tela de login (Windows, Mac ou Linux): ícone na área de trabalho, janela só do jogo e nenhuma tecla brigando com o navegador.",
      "O app abre direto no servidor do escritório e pergunta quando sair versão nova dele. O jogo no navegador continua igual.",
    ],
  },
```

- [ ] **Step 6: Typecheck e testes**

Run: `npm run typecheck && npx vitest run packages/shared`
Expected: sem erro (há testes que validam `NEWS`: ids únicos, datas).

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md docs/GAME_ROADMAP.md packages/shared/src/data/news.ts packages/desktop/README.md
git commit -m "App de desktop: README, CHANGELOG, ROADMAP e Novidades" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Validação manual, primeira Release e ciclo real de update

**Files:**
- Modify: `docs/TEST_PLAN.md` (seção nova antes de `## Resultados — NPC com uma aba só (Mestre Brás) (2026-10-29)`),
  `docs/GAME_ROADMAP.md` (AD-5 → ✅), `packages/desktop/package.json` (`version`)

**Interfaces:**
- Consumes: tudo acima; segredos no GitHub (Task 7); workflow `app.yml` (Task 9).

- [ ] **Step 1: PR para a `dev` e CI verde**

`git push -u origin app-desktop` e abra a PR para `dev` (`gh pr create --base dev --fill`; se o classificador barrar,
o dono roda com `!`). Espere o job `App de desktop (cargo check e testes)` e os demais passarem.

- [ ] **Step 2: Primeira Release (`app-v0.1.0`)**

Com a PR mergeada na `dev` (ou na própria branch, se o dono preferir testar antes):

```bash
git tag app-v0.1.0 && git push origin app-v0.1.0
```

Acompanhe em `gh run list --workflow app.yml`. Expected: 3 jobs verdes; Release `app-v0.1.0` com
`The.Lemon.Quest_0.1.0_x64-setup.exe` (+`.sig`), `The.Lemon.Quest_0.1.0_universal.dmg`, `The.Lemon.Quest.app.tar.gz`
(+`.sig`), `The.Lemon.Quest_0.1.0_amd64.AppImage` (+`.sig`) e `latest.json` com as chaves `windows-x86_64`,
`darwin-x86_64`, `darwin-aarch64`, `linux-x86_64`.

Se o job do macOS reclamar que o `app.tar.gz` não foi gerado com `--bundles app,dmg`, troque os `args` do macOS para
`--target universal-apple-darwin` (sem `--bundles`) e refaça a tag.

- [ ] **Step 3: Instalar e rodar o roteiro em cada sistema**

Roteiro (anote o resultado de cada linha):

| # | Passo | Windows | macOS | Linux |
|---|---|---|---|---|
| 1 | Baixar da Release, instalar (SmartScreen / "Abrir assim mesmo" / `chmod +x`) e abrir | | | |
| 2 | Boot → tela de login do servidor; "App v0.1.0 · <SO>" abaixo do aviso de rede | | | |
| 3 | Logar, andar, atacar, abrir mochila, chat (copiar/colar), 5 min de jogo | | | |
| 4 | F5, F12, Ctrl+F, Ctrl+P, Ctrl+W (Cmd+W no Mac): nada acontece | | | |
| 5 | F1, F2/F3/F4, F8, F9, H, Espaço, botão direito no mundo: funcionam | | | |
| 6 | F1 → "Wiki do jogo" e Ranking → abrem no navegador do sistema; o app continua no jogo | | | |
| 7 | Fechar e reabrir: tamanho/posição da janela lembrados; login salvo continua | | | |
| 8 | Com o servidor desligado: boot com contagem e "Tentar agora"; religar → entra | | | |
| 9 | Linux: WebGL ou Canvas? (`F12` não abre; olhar o `[Phaser]` no console não dá — anotar fluidez ao andar) | — | — | |

- [ ] **Step 4: Ciclo real de update (`app-v0.1.1`)**

Suba `version` para `0.1.1` em `packages/desktop/package.json`, commite ("App de desktop 0.1.1: ciclo de teste do
updater"), `git tag app-v0.1.1 && git push origin app-v0.1.1`, espere a Release. Em cada sistema com a 0.1.0 instalada:

| # | Passo | Windows | macOS | Linux |
|---|---|---|---|---|
| 10 | Abrir → diálogo "Nova versão do app (0.1.1). Atualizar agora?" | | | |
| 11 | "Depois" → jogo segue; fechar e reabrir → pergunta de novo | | | |
| 12 | "Atualizar" → baixa, instala, reabre em 0.1.1 ("App v0.1.1" no login) | | | |
| 13 | macOS: o app atualizado abre sem novo "Abrir assim mesmo"? | — | | — |
| 14 | Windows: reabriu sozinho depois do instalador (modo passive)? | | — | — |

- [ ] **Step 5: Registrar no TEST_PLAN**

Insira antes de `## Resultados — NPC com uma aba só (Mestre Brás) (2026-10-29)`:

```markdown
## Resultados — app de desktop (2026-10-31)

Unitários: `cargo test` em `packages/desktop/src-tauri` (20: endereco 7, nav 6, boot 2, saúde 3, atualizador 2);
`appInfo.test.ts` (5). Typecheck 3× tsc. Sem E2E novo (a casca não tem regra de jogo).

Manual, instaladores da Release `app-v0.1.0` e update para `app-v0.1.1`:

| Sistema | Instalar/abrir | Boot → login | Teclas mortas (F5/F12/Ctrl+F/Ctrl+P/Ctrl+W) | Teclas do jogo | Wiki/Ranking fora | Janela lembrada | Servidor fora | Update 0.1.0 → 0.1.1 |
|---|---|---|---|---|---|---|---|---|
| Windows | | | | | | | | |
| macOS | | | | | | | | |
| Linux | | | | | | | | |

(Preencha cada célula com OK ou com o que falhou e como ficou; linhas de sistema sem máquina disponível ficam
"não testado — sem máquina".)
```

Preencha a tabela com o observado nos Steps 3 e 4. No `docs/GAME_ROADMAP.md`, mude AD-5 para `✅ (data)` e, se o Mac
atualizou bem, AD-6 para `✅`; senão, registre o que aconteceu em AD-6.

- [ ] **Step 6: Commit**

```bash
git add docs/TEST_PLAN.md docs/GAME_ROADMAP.md packages/desktop/package.json
git commit -m "App de desktop: resultados da validação manual nos 3 sistemas e do ciclo de update 0.1.0 → 0.1.1" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Cobertura do spec (auto-revisão)

| Requisito do spec | Task |
|---|---|
| Pacote `packages/desktop`, `package.json` com versão única, scripts, workspace | 1 |
| Janela 1280×800 mín. 1024×640 centrada, estado lembrado (`window-state`) | 1, 5 |
| `tauri.conf.json`: NSIS currentUser, DMG universal ad-hoc, AppImage, `createUpdaterArtifacts`, updater | 1, 7, 9 |
| `Info.plist` com `NSAllowsArbitraryLoads` | 1 |
| Ícones do limão | 1 |
| `--url` (só origem) e URL padrão; erro → diálogo e sai com 2 | 2, 5 |
| Página de boot: "Conectando a <url>", versão/SO, contagem 5 s, 10 tentativas, "Tentar agora" | 1, 5 |
| Checagem de saúde (no Rust, por TCP — desvio registrado) | 4, 5 |
| Script `window.__lemonApp = { versao, so, url }` congelado, sem IPC | 4, 5 |
| Navegação: origem do servidor e páginas do app na janela; resto e `_blank` no navegador do sistema | 3, 5 |
| Teclas: Windows `browser_accelerator_keys(false)` sem `CONTEXT_MENU`; macOS menu sem Cmd+W; Linux nada | 6 |
| Updater: chave, pubkey, endpoint, diálogo Atualizar/Depois, silêncio sem rede, falha com link | 7 |
| Cliente: `appInfo.ts` + teste; link na tela de login / "App vX" | 8 |
| Servidor: nenhuma mudança | — |
| CI: job `cargo check`/`test`; `app.yml` com matriz 3 SOs, tag == versão, `latest.json` | 9 |
| Docs: README, README do pacote, CHANGELOG, ROADMAP, TEST_PLAN, Novidades | 10, 11 |
| Validação manual nos 3 SOs e ciclo 0.1.0 → 0.1.1 | 11 |
