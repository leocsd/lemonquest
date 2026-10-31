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
