# The Lemon Quest — guia para o Claude Code

MMORPG 2D no navegador, estilo Tibia, para ~10 colegas na rede do escritório. Dono do jogo: Leonardo.
**Identidade a preservar:** "Tibia de escritório" — cliques e atalhos clássicos, mundo pequeno compartilhado,
progressão lenta e social, pixel art própria (tema limão). Público é PC na LAN; celular/toque está fora do escopo.

## Arquitetura (monorepo npm workspaces, TypeScript estrito, Node 24)
- `packages/shared`: tipos, fórmulas (`formulas.ts`, `combatFormulas.ts`), dados do jogo (`src/data/*`), protocolo
  (`messages.ts`, `C2S`/`S2C`). Exporta `.ts` direto, sem build; importado como `@lemonquest/shared`.
- `packages/server`: Colyseus 0.18 + SQLite (`node:sqlite`). Servidor **autoritativo**, tick de 50 ms, uma sala
  (`rooms/WorldRoom.ts`), sistemas isolados em `systems/*` (cada passo do tick roda dentro de `runSafe`), persistência
  em `persistence/`. Roda com `tsx` sem build (dev e serviço Windows); só o Docker usa o bundle esbuild.
- `packages/client`: Vite + Phaser 3 (mundo: `scenes/WorldScene.ts`, `game/*`) + Preact (HUD: `ui/**`, stores em
  `ui/hud/store.ts`). O cliente nunca decide regra de jogo, só mostra. Assets curados vão para `.public/` no build.
- Mapa: `tools/mapgen/generate.mjs` (+ `expansion*.mjs`) gera `assets/maps/world.json`, lido pelo servidor e pelo
  cliente. Expansão nunca altera tiles antigos (meta "0 tiles alterados"); spawn/NPC novo entra como objeto no fim.
  Área nova cresce para baixo (`expansion3.mjs` … `expansion6.mjs` Siderúrgica, `expansion7.mjs` Montadora, mapa 400×888) e nunca acrescenta tileset; provar com `node tools/mapgen/diff-world.mjs <world-antigo.json>` (e o atlas Lemon com
  `diff-atlas.mjs <lemon-terrain-antigo.png>`: tiles antigos idênticos). Especificações das regiões em `docs/regioes/`.
  Única exceção autorizada pelo dono: as bocas das 4 caves (`entrances14.mjs`, ciclo 17); provar com
  `diff-world.mjs <antigo> --allow 87,71,92,75 --allow 282,113,285,116 --allow 162,52,164,55 --allow 254,134,256,138`.
- Testes unitários ao lado do código (`x.ts` + `x.test.ts`, vitest; kits em `systems/testkit.ts` e `m4kit.ts`);
  E2E em `e2e/*.spec.ts` (Playwright, helpers em `e2e/helpers.ts`, sonda `window.__lq` com `?e2e`).

## Comandos
    npm run dev                                    # servidor :2567 + Vite :3000 (LAN: LEMONQUEST_DEV_LAN=1)
    npm run typecheck                              # 3× tsc (shared, server, client); não há lint
    npm test  |  npx vitest run <arquivo.test.ts>  # unitários (metade dos núcleos; VITEST_MAX_WORKERS)
    npm run build                                  # cliente (Vite) + bundle do servidor (esbuild)
    npm run test:e2e  [-- e2e/x.spec.ts -g "nome"] # builda o cliente, sobe servidor :2851 com banco em %TEMP%, 1 worker
    npm run newbie                                 # robô novato: as 4 vocações fazem a 1ª missão
    npm run smoke -- http://127.0.0.1:PORTA [--drop] # fumaça contra um servidor já no ar
    npm run admin -- reset-password <conta> | deleted
Servidor isolado para teste manual ou smoke (não toca em `data/`):
`E2E_PORT=2870 E2E_SKIP_BUILD=1 E2E_ADMINS="SeuNome" node e2e/start-server.mjs` e abrir `http://localhost:2870/?e2e`
(comandos de dev `/level /item /gold /heal /tp /ml /quest` valem para os nomes em `E2E_ADMINS`).
Ambiente de dev no servidor: branch `dev` em `~/lemonquest-dev`, porta 2568, override
`deploy/docker/docker-compose.dev-server.yml` (PRs entram na `dev`; `dev` → `main` vai para a produção).

## Convenções
- Tudo em português: código, comentários (explicam o porquê), UI, docs e commits (uma linha descritiva, sem prefixo).
- Regra de jogo nova = dado/fórmula no `shared` + teste unitário ao lado; metas de balanço viram asserções.
- Mensagem nova do cliente: tipo em `shared/messages.ts`, validação no servidor e limite em `MESSAGE_LIMITS`
  (`WorldRoom.ts`); sistema novo entra nas listas do tick, `cleanupSession` e `onReconnect` do `WorldRoom`.
- Comandos de admin em `systems/admin.ts` (`LEMONQUEST_ADMINS`); de dev em `systems/devcommands.ts`
  (`LEMONQUEST_DEV_COMMANDS=1`, nunca em produção). Mudou comando ou variável? Atualize README e `deploy/*/README*`.
- Ao fechar um ciclo: `CHANGELOG.md`, `docs/GAME_ROADMAP.md` (status), `docs/TEST_PLAN.md` (resultados reais) e
  `shared/src/data/news.ts` (tela de Novidades).

## Segurança e armadilhas
- **Nunca** aponte servidor, teste ou script para `data/`, `docker-data/` ou `docker-data-dev/` (saves reais).
  Use o servidor E2E (porta própria, banco temporário). Nunca commite `*.db*`.
- E2E pesa na CPU: 1 worker; não rode junto com unitários ou build. Antes de culpar o código por falha E2E, veja no
  log do servidor a linha `[tick] … máx` (CPU saturada = ticks de centenas de ms = falha falsa).
- Falha E2E nova? O helper `teleport()` só devolve com o ator no tile e a câmera centrada nele (`settled()`); specs
  que clicam uma vez só devem usar `expect.poll` com reclique. Histórico em `docs/TEST_PLAN.md` (ciclo 9).
- O chão não tem dono (exceto 15 s de prioridade do grupo no loot de abate em grupo) e dura 10 min: testes que largam
  itens devem escolher um tile sem item (`ground()`).
- `WorldScene.ts` (~1.460 linhas) e `WorldRoom.ts` (~1.200) são grandes de propósito; não refatore sem pedido.
- Greps por nome acham cópias em `packages/*/dist/` e `packages/client/.public/` (gerados): ignore.

## Documentos de referência
- `docs/GAME_ROADMAP.md`: pendências, decisões do dono (🧭) e "não fazer agora" (⛔). **Leia antes de propor trabalho.**
- `docs/GAME_AUDIT.md`: achados `#1–#49` dos ciclos 1–5 e "o que está sólido (não mexer sem motivo)".
- `docs/audit/2026-10-22/`: auditoria completa (repositório, gameplay, limpeza, roadmap de evolução, baseline de validação).
- `docs/TEST_PLAN.md`: camadas de teste e resultados por ciclo. `CHANGELOG.md`: o que mudou e por quê.
- `README.md`: controles, admin, dev. `deploy/docker/README.md`, `deploy/windows/README-DEPLOY.md`: produção.
- `assets/CATALOG.md`: catálogo do pack Ninja Adventure (CC0); layout das sprites.

## Não fazer agora (decisões do dono — ROADMAP ⛔ e 🧭)
- Reescrever `WorldScene.ts`; interesse por área no servidor; layout mobile/toque; atualizar dependências em massa.
- Proteção de novato no PvP e esconder a zona no `/quem` (dono decidiu não fazer); montaria (bloqueada: falta arte).
- Sistemas inteiros sem decisão prévia: guilda, mercado entre jogadores, casas, mineração, painel web de admin.
