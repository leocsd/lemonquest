# App de desktop (Tauri 2) — casca que abre o jogo do servidor (2026-10-31)

## Contexto

O jogo roda no navegador (`packages/client`, Vite + Phaser + Preact) e em produção o próprio servidor serve o cliente
compilado em `http://embeddo-geral-00:2567` (`endpoint = location.origin`). O dono quer "um client" como o do Tibia:
ícone na área de trabalho, janela sem barra de endereço/abas, teclas sem briga com o navegador (F1/F3/F5/F11/F12,
Ctrl+W, Ctrl+T), abrir direto no servidor sem digitar URL e atualizar sozinho quando sair versão nova do app.
Público: os ~10 colegas do escritório, em Windows, macOS e Linux.

Alternativas descartadas: **Electron** (Chromium idêntico nos 3 SOs, mas ~100 MB e o auto-update no macOS exige
assinatura Apple — Developer ID, US$ 99/ano + notarização; sem isso o Mac só atualiza baixando de novo) e **PWA**
(exige HTTPS confiável — produção é `http://` na LAN e o Caddy usa CA interna — e não resolve Ctrl+W/F5/F12).

## Decisões do dono (2026-10-31)

| Pergunta | Decisão |
|---|---|
| O que o app resolve | Janela limpa e ícone; teclas sem briga; abrir direto no servidor; atualizar sozinho |
| De onde carrega o jogo | **Do servidor** (o app é só a casca; todo deploy do jogo chega na hora) |
| Como os colegas recebem | **Download** pelo link na tela de login (sem instalador com admin, sem pasta de rede) |
| Sistemas | **Windows, macOS e Linux** |
| Stack | **Tauri 2** (5–10 MB, webview do sistema, updater próprio sem conta Apple) |
| Hospedagem dos instaladores e do `latest.json` | **GitHub Releases** do repo público `leocsd/lemonquest`; o servidor do jogo não guarda nada |
| URL padrão (sem `--url`) | `http://embeddo-geral-00:2567` |
| Como aplica uma atualização | **Pergunta antes** ("Atualizar para X agora?" com Depois/Atualizar) |

## Objetivos

- Abrir o jogo numa janela própria, com ícone do limão, sem nada do navegador; nada do cliente muda de comportamento
  (login salvo de 30 dias, wiki, ranking, reconexão continuam vindo do servidor).
- F1–F4, F8, F9 e as demais teclas do jogo chegam ao jogo; F5, F12, Ctrl+P, Ctrl+F, Ctrl+W, Cmd+W não fazem nada.
- O app se atualiza pelo GitHub Releases com assinatura própria (minisign), nos 3 SOs, perguntando antes.
- Soltar versão nova = subir uma tag `app-vX.Y.Z`; a CI builda os 3 SOs e publica a Release.
- Um argumento (`--url`) aponta o app para outro servidor (dev local :2567, servidor dev :2568, E2E).

## Fora do escopo

Celular/toque (fora do público), tela cheia por tecla (maximizar basta), certificado de assinatura pago (SmartScreen
e Gatekeeper avisam uma vez por PC; documentado), espelho dos instaladores no servidor do jogo, qualquer API do Tauri
exposta à página do jogo (sem IPC), mudança de servidor/protocolo, empacotar o cliente dentro do app.

## Arquitetura

Pacote novo `packages/desktop` no monorepo (workspace npm só para os scripts; o código é Rust mínimo em `src-tauri/`).
O app cria **uma janela** cuja webview carrega uma página local de boot (`boot.html`, dentro do app) que confere se o
servidor responde e então navega para a URL do servidor. A partir daí a página é 100 % remota: o Tauri não injeta IPC
nem API nenhuma nela (sem `withGlobalTauri`, sem `dangerousRemoteDomainIpcAccess`); o único contato é um **script de
inicialização** que define `window.__lemonApp = Object.freeze({ versao, so, url })` antes de cada carga (vale para a
página de boot e para a remota).

Motores de renderização: Windows = WebView2 (Chromium, o mesmo do Edge que o escritório já usa); macOS = WKWebView
(Safari); Linux = WebKitGTK. O Phaser está em `Phaser.AUTO`: se o WebKitGTK não der WebGL, cai para Canvas sozinho.

```
packages/desktop/
  package.json            # name @lemonquest/desktop, version X.Y.Z (fonte única da versão do app), scripts dev/build/tauri
  README.md               # pré-requisitos, build local, chaves, como soltar versão, atritos por SO
  src/boot.html           # página local: limão, "Conectando a <url>…", tenta /health, "Tentar agora"
  src-tauri/
    Cargo.toml            # tauri 2, tauri-plugin-updater, -dialog, -opener, -window-state, -prevent-default (platform-windows)
    tauri.conf.json       # productName "The Lemon Quest", identifier com.lemonquest.desktop, version "../package.json",
                          # bundle (nsis currentUser, dmg universal, appimage, createUpdaterArtifacts, macOS signingIdentity "-"),
                          # plugins.updater (pubkey + endpoint), sem janela declarada (criada no Rust)
    Info.plist            # NSAppTransportSecurity/NSAllowsArbitraryLoads (macOS bloqueia http:// e ws:// em apps)
    icons/                # gerados de assets/favicon/icon-512.png com `tauri icon`
    src/main.rs, lib.rs   # setup: URL, janela, navegação, updater
    src/url.rs            # resolve_url(args, padrão) + testes
    src/boot.rs           # monta o script de inicialização + testes
```

## Componentes

### Janela e navegação (`lib.rs`)

- `resolve_url`: `--url <http(s)://host[:porta]>` nos argumentos vence; senão a padrão embutida
  (`http://embeddo-geral-00:2567`). URL inválida ou sem esquema → diálogo de erro e sai (código 2). Só a origem é
  usada (caminho e query do `--url` são descartados).
- Janela `main` criada no `setup`: título "The Lemon Quest", 1280×800, mínimo 1024×640, centrada; `window-state`
  restaura tamanho/posição/maximizado da última vez. Ícone do limão.
- `WebviewUrl::App("boot.html")` + `initialization_script(boot::script(versao, so, url))`.
- Política de navegação (`on_navigation`): dentro da origem do servidor (mesmo esquema/host/porta), permitido; qualquer
  outra URL `http(s)` abre no navegador do sistema (`tauri-plugin-opener`) e é negada na webview. Links com
  `target="_blank"` (wiki e ranking no cliente) abrem **no navegador do sistema** mesmo sendo da mesma origem, para o
  jogo continuar aberto na janela do app. `tauri://localhost` (boot) sempre permitido.
- Fechar a janela encerra o app (uma janela só).

### Teclas

- Windows: `tauri-plugin-prevent-default` com `Flags::empty()` e `browser_accelerator_keys(false)` — desliga no WebView2
  F5, F12, Ctrl+P, Ctrl+F, Ctrl+Shift+I, etc. Não se usa a flag `CONTEXT_MENU` do plugin: o jogo usa o botão direito e já
  suprime o menu nativo (`App.tsx` escuta `contextmenu`).
- macOS: menu da aplicação **custom**: app (Sobre, Ocultar, Sair = Cmd+Q) e Editar (desfazer, recortar, copiar, colar,
  selecionar tudo — necessários para digitar no chat). **Sem** "Fechar janela" (Cmd+W) e sem Visualizar/Recarregar.
- Linux: WebKitGTK não tem aceleradores de navegador por padrão; nada a fazer.
- O cliente já chama `preventDefault()` nas teclas que trata (F1–F4, F8, F9, H…); nenhuma tecla do jogo passa pelo plugin.

### Página de boot (`src/boot.html`)

Fonte do sistema (não embute a Pixelify Sans, para não pesar), fundo de cor sólida do HUD e o limão de
`icon-512.png`; texto "Conectando a `<url>`…" e, no rodapé, "App v1.0.0 · Windows" (vem de `window.__lemonApp`).
Lógica: `fetch(url + "/health", { mode: "no-cors", cache: "no-store" })` — resolve (resposta opaca) quando o servidor
responde, rejeita quando não há rota até ele; ao resolver, `location.replace(url)`. Ao rejeitar: "Servidor fora do ar
ou sem rede. Tentando de novo em 5 s…" com contagem e botão "Tentar agora" (até 10 tentativas automáticas; depois só
o botão). A URL aparece no texto para o jogador saber para onde o app está apontando.

Se o servidor cair **depois** (reinício no deploy), a página remota já carregada cuida de si (`ConnectionStatus` e
`location.reload()` do `session.ts`): se o reload falhar, a webview mostra sua página de erro nativa e o jogador fecha
e reabre o app (que volta pela boot). Aceito: é o mesmo que fechar e reabrir a aba hoje.

### Atualização (`lib.rs` + plugin updater)

- Chave: `npm run tauri signer generate -- -w ~/.tauri/lemonquest.key`, **uma vez**, pelo dono. Pública vai em
  `tauri.conf.json > plugins.updater.pubkey`; privada (e senha) vão em secrets do GitHub
  (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) e numa cópia do dono fora do repo. Perder a chave
  = as instalações existentes não aceitam mais update (teriam de baixar de novo).
- Endpoint: `https://github.com/leocsd/lemonquest/releases/latest/download/latest.json` (gerado pela CI com
  `includeUpdaterJson`). Convenção: **Releases do repo são só do app** — "latest" do GitHub é a Release mais nova
  não-prerelease, e qualquer outra Release quebraria o updater.
- Fluxo: a janela abre primeiro (o jogador não espera o updater). Em paralelo o Rust chama `check()`; sem rede, endpoint
  fora ou JSON inválido → log e segue, sem diálogo. Com versão nova → diálogo nativo "Nova versão do app (X.Y.Z).
  Atualizar agora? O jogo fecha e reabre." [Depois] [Atualizar]. "Depois" não pergunta de novo até a próxima abertura.
  "Atualizar": baixa, verifica a assinatura, instala e reinicia (`app.restart()`); Windows em `installMode: "passive"`
  (barra de progresso do NSIS; o app sai antes por limitação do Windows e o instalador reabre o app); macOS troca o
  `.app` (`.app.tar.gz`); Linux troca o AppImage. Falha no download/instalação → diálogo "Não deu para atualizar: <erro>.
  Baixe de novo em <link da Release>." e o jogo continua.
- Versão: `packages/desktop/package.json > version` é a fonte única (`tauri.conf.json` lê `"../package.json"`).
  `Cargo.toml` fica em `0.0.0` (não é usado nos bundles). Tag `app-vX.Y.Z` tem de bater com a `version`, senão a CI falha.

### Cliente (`packages/client`)

- `ui/appInfo.ts`: `appInfo(w = window): { versao: string; so: string } | null` (lê `w.__lemonApp` se for objeto com
  `versao` string). Teste `appInfo.test.ts` ao lado (ausente, presente, malformado).
- `Login.tsx`: fora do app, abaixo do aviso de rede, link "Baixar o app para Windows, Mac ou Linux" →
  `https://github.com/leocsd/lemonquest/releases/latest` (`target="_blank"`); dentro do app, "App vX.Y.Z" discreto no
  mesmo lugar. Mais nada muda no cliente (o `endpoint` já é `location.origin`).

### Servidor

Nenhuma mudança. (O `/health` já existe e é o que a boot consulta.)

### CI

- `.github/workflows/ci.yml`: job `app` (ubuntu-latest): dependências do WebKitGTK (`libwebkit2gtk-4.1-dev`,
  `libappindicator3-dev`, `librsvg2-dev`, `patchelf`), `Swatinem/rust-cache`, `cargo check` e `cargo test` em
  `packages/desktop/src-tauri`. Roda em PR e push de `main`/`dev` como os outros jobs.
- `.github/workflows/app.yml`: `on: push: tags: ["app-v*"]`. Passo 0 (ubuntu): confere tag == `package.json.version`.
  Matriz: `macos-latest` (`--target universal-apple-darwin`, com os dois targets Rust instalados), `ubuntu-22.04`
  (AppImage), `windows-latest` (NSIS). `tauri-apps/tauri-action@v0` com `projectPath: packages/desktop`,
  `tagName: app-v__VERSION__`, `releaseName: "App v__VERSION__"`, `releaseBody` (texto fixo: "Instalador do app de
  desktop do The Lemon Quest. Windows: *-setup.exe · Mac: *.dmg · Linux: *.AppImage."), `includeUpdaterJson: true`,
  secrets `TAURI_SIGNING_PRIVATE_KEY`/`…_PASSWORD`, `GITHUB_TOKEN`. Repo público: minutos de Actions (inclusive macOS) não
  custam.
- Artefatos por SO: `The.Lemon.Quest_X.Y.Z_x64-setup.exe` (+`.sig`), `The.Lemon.Quest_X.Y.Z_universal.dmg` e
  `The.Lemon.Quest.app.tar.gz` (+`.sig`), `The.Lemon.Quest_X.Y.Z_amd64.AppImage` (+`.sig`), `latest.json`.

### Instaladores por SO

| SO | Formato | Instala onde | Admin? | Atritos |
|---|---|---|---|---|
| Windows | NSIS `installMode: "currentUser"`, `webviewInstallMode: downloadBootstrapper` (baixa o WebView2 se faltar; Win11 já tem) | `%LOCALAPPDATA%\Programs\The Lemon Quest`, atalhos no Menu Iniciar e área de trabalho | Não | SmartScreen 1× ("Mais informações → Executar assim mesmo") |
| macOS | DMG universal (Intel + Apple Silicon), `signingIdentity: "-"` (ad-hoc: evita o "app danificado" no Apple Silicon) | Arrastar para Aplicativos | Não | 1× "Abrir assim mesmo" em Privacidade e Segurança; `Info.plist` libera `http://` |
| Linux | AppImage (único formato que o updater troca no lugar) | Onde o usuário puser (+ `chmod +x`) | Não | WebGL pode faltar no WebKitGTK → Canvas |

## Segurança

- A página remota não tem acesso a nenhuma API do app (sem IPC, sem `withGlobalTauri`, capabilities vazias para
  `main`); um XSS no jogo continua valendo o mesmo que no navegador, nada mais.
- Updater: só aceita bundle assinado pela nossa chave; endpoint HTTPS do GitHub fixo no binário.
- Navegação fora da origem do servidor nunca acontece dentro da janela (vai para o navegador do sistema).
- `NSAllowsArbitraryLoads` só porque a LAN é `http://`; a senha já trafega em claro hoje no navegador (o login avisa).

## Testes e validação

- Rust (`cargo test`): `resolve_url` (sem args → padrão; `--url` válida; `--url` sem esquema/inválida → erro; `--url`
  com caminho → mantém só a origem), `boot::script` (JSON escapado corretamente, `Object.freeze`), política de navegação
  como função pura `allow_navigation(origem, url) -> Permitir | AbrirFora`.
- Cliente (vitest): `appInfo.test.ts`. `npm run typecheck` segue com 3× tsc (o pacote desktop não tem TS).
- Manual, por SO, registrado no `TEST_PLAN.md`: abrir, logar, jogar 5 min; F5/F12/Ctrl+F/Ctrl+W/Cmd+W mortos;
  F1–F4/F8/F9/H/Espaço vivos; botão direito no mundo; wiki e ranking abrem no navegador; servidor desligado → boot com
  contagem; `--url http://localhost:2567` contra o dev local; `--url http://embeddo-geral-00:2568` contra o dev do servidor.
- Updater real: publicar `app-v0.1.0`, instalar nos 3 SOs, publicar `app-v0.1.1`, abrir → diálogo → atualiza → reabre em
  0.1.1. "Depois" não repete até reabrir. No Mac, confirmar que o `.app` atualizado abre sem novo "Abrir assim mesmo";
  se não abrir, documentar reinstalação pelo DMG como caminho do Mac.

## Entrega e documentação

- `README.md`: seção "App de desktop" (o que é, link da Release, atritos por SO, `--url`).
- `packages/desktop/README.md`: pré-requisitos (Rust, MSVC Build Tools + WebView2 no Windows, `libwebkit2gtk-4.1` no
  Linux, Xcode CLT no Mac), `npm run app:dev -- -- --url http://localhost:2567`, `npm run app:build`, gerar chave,
  soltar versão (bump em `package.json`, commit, `git tag app-vX.Y.Z`, `git push --tags`), onde ver a Release.
- Scripts na raiz: `app:dev`, `app:build` (delegam ao workspace).
- `CHANGELOG.md`, `docs/GAME_ROADMAP.md` (tabela "App de desktop (2026-10-31)" com AD-1…), `docs/TEST_PLAN.md`
  (resultados manuais por SO), `shared/src/data/news.ts` ("Agora tem app: baixe na tela de login").
- `deploy/*/README*`: sem mudança (servidor intacto).

## Riscos e itens a confirmar na implementação

1. Nome exato do gancho do Tauri 2 para pedidos de nova janela (`target="_blank"`): se não houver gancho dedicado,
   tratar via `on_navigation` mais um trecho no script de inicialização que redireciona `window.open` e cliques em
   `_blank` para o navegador do sistema. O comportamento exigido é o da seção "Janela e navegação".
2. `browser_accelerator_keys(false)` cobre F5/F12/Ctrl+P/Ctrl+F no WebView2; se alguma sobrar, lista custom no plugin
   sem tocar nas teclas do jogo (nunca F1–F4/F8/F9/H).
3. Updater no macOS sem assinatura Apple (só ad-hoc): a doc do Tauri não exige Developer ID para o updater, mas é a
   parte menos provada. Validar no Mac de quem usar antes de anunciar o app para Mac.
4. Reabertura automática após o update no Windows (modo passive): confirmar no teste real; senão, o diálogo diz "abra o
   jogo de novo".
5. WebGL no WebKitGTK: se o Canvas ficar lento no Linux, avaliar `WEBKIT_DISABLE_DMABUF_RENDERER=1` no AppImage.
