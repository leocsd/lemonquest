# Plano de testes — The Lemon Quest

## Camadas

| Camada | Comando | O que cobre |
|---|---|---|
| Tipos | `npm run typecheck` | shared, server, client (TS estrito) |
| Unitários | `npm test` (vitest) | fórmulas, dados, sistemas do servidor (combate, magias, IA, inventário, chão, grupo, missões, conquistas, coliseu, treino), persistência/auth, sala real com clientes falsos, predição/luzes/stores do cliente |
| Build | `npm run build` | cliente (Vite) + bundle do servidor (esbuild) |
| E2E | `npm run test:e2e` | Playwright/Chromium contra servidor de teste (porta 2851, banco temporário): login/conta, mundo, chão, painéis, grupo, coliseu, treino, conquistas, missões |
| Benchmark manual | `npx tsx packages/server/src/systems/pathfinding.bench.ts` | custo do A* (µs por caminho) |
| Carga | servidor E2E (`E2E_PORT=2872 E2E_SKIP_BUILD=1 node e2e/start-server.mjs`) + `node tools/loadtest.mjs http://127.0.0.1:2872 --bots 10 --secs 130` | tick do servidor (log `[tick]`), ida e volta de um passo |
| Fuzz | servidor E2E com `E2E_ADMINS="Fuzz Inv"` + `node tools/fuzz.mjs <url> --mode proto` / `--mode inventory --name "Fuzz Inv"` | servidor não cai nem registra exceção; inventário sem duplicação |
| CI | `.github/workflows/ci.yml` | typecheck + unitários + build + Docker `/health` + E2E |

Rodar o jogo isolado para testes manuais (não toca no banco real):
`E2E_PORT=2870 E2E_ADMINS="SeuNome" node e2e/start-server.mjs` e abrir `http://localhost:2870/?e2e`.

## Resultados — ciclo 1 (2026-10-14)

| Verificação | Antes | Depois |
|---|---|---|
| Typecheck | ok | ok |
| Unitários | 470/470 | 479/479 (+9 novos) |
| Build de produção | ok | ok (bundle do cliente 1,45 MB, sem mudança relevante) |
| E2E | — | 25/25 (rodada final com tudo, 4,7 min); Coliseu 12/12 em 4 repetições |
| A* (caminho curto, mapa 160×288) | 200–340 µs | 6–11 µs, caminhos idênticos (checksum) |

Testes novos:
- `auth.test.ts`: nomes sósias recusados na criação; nome de admin reservado (com/sem acento) e liberado por `LEMONQUEST_ADMIN_ACCOUNTS`.
- `recovery.test.ts`: troca de senha derruba personagem online e invalida token de entrada pendente.
- `WorldRoom.test.ts`: largar/pegar item grava personagem e chão juntos (≤ 1 s; antes só no autosave de 15 s); `kick` de
  quem espera reconexão cancela a reconexão.
- `client/ui/hud/store.test.ts` (4): `selectStore` não publica quando outro jogador muda; só quando a fatia muda.

Verificações manuais feitas no navegador (servidor isolado):
- Login → lista → mundo; combate desarmado contra rato (morte, XP, efeitos); alvo pela lista de batalha; comandos `/tp` `/heal`.
- Foco num checkbox do HUD + tecla D: o personagem anda (antes ficava parado).
- `curl -I /health`: sem `X-Powered-By`, com `nosniff` e `Referrer-Policy`.
- Console: sem erros do jogo (só mensagens da extensão do navegador).

## Resultados — ciclo 2 (2026-10-14)

| Verificação | Resultado |
|---|---|
| Unitários | 482/482 |
| E2E | 25/25 (rodada com as mudanças de jogabilidade); após a troca de dependências 24/25 → o que falhou passou 3/3 isolado (ver abaixo) |
| `npm audit --omit=dev` | 15 avisos → 0 |
| Bundle do servidor | 5,44 MB → 2,40 MB; `npm run start:bundle` sobe em produção e serve `/health` e o cliente |
| Docker | `docker build` ok (224 MB); container responde `/health` |
| Carga (10 bots, 131 monstros, 2 × 60 s) | tick médio 0,198 / 0,204 ms, máx 4,95 / 2,38 ms; passo p50 46 ms, p95 298 ms |
| Reconexão | monstro morto durante a queda: some do estado e `onRemove` dispara ao reconectar (sem "fantasmas") |

Achado de balanço (#27) medido com as fórmulas: cavaleiro lv 15 / skill 30 bate 48 desarmado, 21 com a Espada Curta e 45
com a Espada Longa; depois do ajuste, a arma nunca fica abaixo do punho.

## Resultados — ciclo 3 (2026-10-14)

| Verificação | Resultado |
|---|---|
| Unitários | 491/491 (inclui permanência ao sair em combate, timeout adaptativo da predição) |
| E2E | 25/25; Coliseu 6/6 em repetição após os ajustes de corrida (mira com espera curta, `/tp` até o vendedor) |
| Heap do cliente (Chromium headless, GC forçado a cada 30 s, 10 bots andando/lutando/falando, 6 min) | **plano: 49,0 → 49,7 MB**; DOM sobe de 365 para ~660 e para (linhas do chat no teto de 80 por aba) |
| Troca de monitor (DPR 1 → 2, emulação CDP) | 151/151 textos do mundo na nova resolução |
| Capturas 1280×720 / 1366×768 / 1440×900 / 1920×1080 | coluna lateral cabe até a mochila (720p: mochila recolhida por padrão, como antes; faixa "▾" indica o resto) |

Uma primeira medição de 10 min foi descartada: o computador entrou em suspensão no meio (passo com "ida e volta"
de 21 min nos bots e janelas de 60 s com 951 ticks em vez de ~1200 no log do servidor).

## Resultados — ciclo 4 (2026-10-14, noite)

| Verificação | Resultado |
|---|---|
| Unitários | 493/493 |
| E2E | **26/26** nesta branch e em `proposta/todas` (novo: `depot.spec.ts`); `ground.spec.ts` 3/3 em repetição depois de repetir o clique de pegar; `party.spec.ts` falhou uma vez sob carga (A seguia o alvo para fora dos 12 sqm da divisão de XP) — o teste agora leva B junto |
| Tour visual 1366×768 / 1440×900 (scripts no scratchpad: conta → personagem → cada janela → cada NPC → morte) | achados #34–#38, corrigidos e recapturados |
| Fundo das janelas (`getComputedStyle`) | 0,85 em todas → 0,94 (missões) / 0,96 (conquistas, ranking) |
| Robô sem admin, 4 vocações, 5 min | level 2–3, 0 mortes |
| Fuzz `proto` (3 488 mensagens malformadas em 90 s, todos os 23 tipos) | nenhuma exceção no log, `/health` ok, conexão mantida. A 66 msg/s o servidor derruba o cliente (limite de 60/s, correto); string de 5 000 caracteres excede o tamanho máximo do WebSocket (conexão fechada, servidor de pé) |
| Fuzz `inventory` (5 849 movimentos mochila/equip/depot com índices e contagens inválidos) | nenhum item aumentou, nenhum uid repetido, nenhuma exceção |

## Resultados — ciclo 5 (2026-10-15)

| Verificação | Resultado |
|---|---|
| Unitários | 497/497 |
| E2E | 28/28 em `proposta/todas`; novos `speech.spec.ts` (balões de fala) e checagem do balão azul em `party.spec.ts` |
| Novato sem admin: aceitar "Ratos no Celeiro", matar 5 ratos e entregar (servidor limpo, seguir alvo ligado por padrão) | cavaleiro 56 s · paladino 49 s · feiticeiro 50 s · druida 53 s, todos nível 2, 0 mortes. Antes do padrão "seguir": cavaleiro e druida passavam de 10 min sem concluir |
| `party.spec.ts` e `ground.spec.ts` em `--repeat-each=5` | **10/10** depois que, em modo E2E, quem fecha a aba some em 2 s (antes ficava 20 s no mundo e competia pelos ratos). Histórico: instável: personagens do teste anterior ficam 20 s no mundo (alguns perseguindo) e comem os ratos da floresta, então `targetNearest` não acha alvo. Na suíte normal passa. Causa vista em captura e no helper, não corrigida |

### Como ler falhas do E2E com a máquina ocupada

Duas falhas desta rodada vieram de CPU saturada (testes unitários de outra revisão rodando junto): o log do servidor
mostrou `[tick] 425 ticks: média 8,3 ms, máx 1154 ms` (deveriam ser ~1200 ticks/min). Antes de culpar o código,
confira essa linha do log. O efeito visível no cliente ("Carregando personagens…" sem fim) virou erro com timeout de
15 s nas chamadas da API.

## Resultados — ciclo 9 (2026-10-22, auditoria completa)

Baseline antes de qualquer mudança (base `22a00c7`) e depois da Fase 0. Detalhe e procedimento de regressão em
[docs/audit/2026-10-22/VALIDATION_BASELINE.md](audit/2026-10-22/VALIDATION_BASELINE.md).

| Verificação | Antes (22a00c7) | Depois da Fase 0 |
|---|---|---|
| Typecheck | ok | ok |
| Unitários | 774/774 (77 arquivos, 13 s) | **781/781** (78 arquivos; +7 `telemetry.test.ts`) |
| Build | ok (cliente 4,9 s; `server.mjs` 2,6 MB) | ok |
| `npm audit --omit=dev` | 0 | 0 |
| Smoke (`tools/smoke.mjs`, servidor isolado) | ok 2/2, mas com aviso `@colyseus/schema buffer overflow` a cada login | ok; sem o aviso (`Encoder.BUFFER_SIZE` 64 KB) |
| E2E completo (1 worker, `retries: 0`) | 44/46 em 10,3 min (`look` criatura e `quests` missão de matar, os instáveis conhecidos) | — (ver linhas abaixo) |
| E2E instáveis `fishing`+`look`+`spells`+`quests` `--repeat-each=3` | — | 25/27: os 4 alvos passaram 3/3; o novo caso "olhar item do chão" falhou 2/3 por item de rodadas anteriores no mesmo tile |
| `look.spec.ts` `--repeat-each=5` após tile livre + chord repetido | — | **15/15** |
| CI do GitHub em `main` | **vermelho** nos 2 últimos runs (job E2E: `fishing.spec` 2/2 tentativas, clique em `y=-1662`) | corrigido no helper (#50); valida no próximo push |
| **Integração final** (Fases 0, 1, 2 parcial e 3 parcial; 2026-10-22 21:10–21:35) | — | typecheck ok · **837/837 unitários** (+1 skip documentado) · build ok · **E2E 45/46 em 9,7 min** (`retries: 0`): a única falha foi "olhar em você" com um rato passando pelo tile no instante do Shift+clique; o passo ganhou repetição e `look.spec.ts` passou 9/9 em `--repeat-each=3` |
| **Segunda rodada** (loot de grupo, lobo, arcos, bandos/acessibilidade, build/gzip, E2E novos; 2026-10-23) | — | typecheck ok · **856/856 unitários** (+1 skip) · build ok (`dist` 17 MB) · **E2E 52/52 em 10,7 min** (25 specs; `retries: 0`). Regressão pega e corrigida antes do commit: o botão "mostrar senha" dentro do `<label>` entrava no nome acessível do campo e quebrava "esqueci minha senha" (rótulo agora por `aria-labelledby`). CI da PR #6 (primeira rodada): 3 jobs verdes, E2E em 12,5 min com o cache |

Causa raiz dos E2E instáveis (confirmada no trace do CI e no código): o helper `teleport()` esperava só o estado do
servidor, e `settled()` dizia "parado" antes de a câmera sair do lugar (o ator salta 40 ms depois do estado e a câmera
segue por lerp). Agora `teleport` exige o ator no tile e `settled` exige a câmera centrada nele (`PixelCamera.isCenteredOn`).

Novos nesta rodada: `telemetry.test.ts` (tempo/mortes/ouro por level, resumo por faixa); `tools/loadtest.mjs` com
`--tp`, `--level`, `--auto`, `--max-p95`, `--max-tick`; `tools/smoke.mjs` no CI (bundle e container).

### Carga com 582 monstros e caves (pendência dos ciclos 7–8, medida em 2026-10-22)

Servidor E2E isolado (`E2E_PORT=2872 E2E_SKIP_BUILD=1 E2E_ADMINS="$(node tools/loadtest.mjs --print-admins 32)"`),
máquina ociosa, bots como admins para `/level`, `/tp` e `/status`. Limiares do protocolo (VALIDATION_BASELINE §6):
média ≤ 5 ms, máx ≤ 25 ms, 0 erros, p95 de passo ≤ 300 ms.

| Cenário | Tick média / máx | Passo p50 / p95 / máx | Autosave (sem transação, antes da #56) | Erros |
|---|---|---|---|---|
| Piso: 0 jogadores, 582 monstros (10 min) | **0,16–0,19 ms / 0,5–4,1 ms** | — | — | 0 |
| Vila: 10 bots andando/atacando, 120 s | 0,56 ms / 6,8 ms | 52 / 285 / 404 ms | — | 0 |
| Cave dos orcs (184,18): 10 bots lv 45 com ataque automático, 180 s | **0,50 ms / 8,0 ms** | 37 / 244 / 517 ms | média 13 ms, máx 18 ms | 0 |
| Cave dos orcs: **32 bots** lv 45 com ataque automático, 120 s | **0,9–1,3 ms / 11–12 ms** | 38 / 252 / 999 ms | média 28 ms, máx 31 ms | 0 |

Leitura: o servidor fica em 1–2 % do orçamento de 50 ms mesmo no pior cenário (32 jogadores numa cave cheia). Os
itens PERF-02/03/04 do relatório de performance (índice de jogadores no A*, buffers no BFS, respawns espalhados) **não
precisam ser feitos** agora. O autosave é o único pico mensurável fora do tick (13 ms com 10 jogadores, 28 ms com 32):
corrigido na #56 (uma transação + `synchronous = NORMAL`); medir de novo no próximo ciclo. A telemetria de progressão
apareceu no `/status` já nessa rodada ("40–59: 24,7 mortes/h" para bots que não se curam, como esperado). O `[status]`
reportou 0 erros isolados e heap de 32–43 MB.

## Resultados — ciclo 15 (2026-10-25, balanço das vocações e morte)

| Camada | Resultado |
|---|---|
| Unitários | 1214 passados (102 arquivos; eram 1162), 0 pulados; typecheck limpo. Novos: `balanceKit.ts` + `vocationBalance.test.ts` (P por vocação nos lv 30/60/100 nas tabelas de produção e do plano; feiticeiro não lidera dano e sobrevivência juntos; vida efetiva do escudo ≤ 1,1× a do cavaleiro), `skills.test.ts`, `admincli.test.ts`, `blessingText.test.ts`; casos novos em `combatFormulas`, `pvp`, `combat`, `spells`, `telemetry`, `monsterAbilities`, `conditions`, `shared/data/monsters`, `shared/data/spells`, `hotkeys`, `bestiaryLogic`. `arena.test.ts` com as metas de volta e sem `it.fails` |
| Balanço medido | Pior/melhor do P (produção): 0,52/0,39/0,49 → 0,74/0,66/0,86; tabela do plano 0,74/0,73/0,83. Coliseu: solo lv 34 22–23, solo lv 120 29–30, grupo justo da 40/45/50/55/60 em 38/46/48/54/completa, lv 100 cai na 54, lv 120 completa |
| Revisão cruzada | Sem bug grave; corrigidos: descrição do Escudo de Mana presa a "metade" (agora travada contra a constante por teste), teto "Protege até" da sacerdotisa sem a caveira vermelha, `cloneData` da telemetria quebrando com `byLevel` nulo, comentário e README da telemetria |
| E2E | Não rodado localmente (decisão do dono: E2E local só a pedido). Specs ajustadas: `death.spec` (milhar com ponto em "−N XP"). Resultado do CI da PR abaixo |

## Resultados — ciclo 14 (2026-10-25, correções de bugs e exploits)

| Camada | Resultado |
|---|---|
| Unitários | 1162 passados (97 arquivos; eram 1087), 0 pulados — o teste de faixa inválida das recompensas (`bounties.test.ts`) voltou a rodar; typecheck limpo. Novos: `shared/itemRules.test.ts`, `shared/data/quests.test.ts` (anda pelo mapa real a partir do templo no level mínimo de cada faixa: todo alvo de recompensa e material de encomenda alcançável), `toneShop.test.ts`, `shareText.test.ts`; casos novos em `ai`, `monsters`, `combat`, `portals`, `questWorld`, `spells`, `inventory`, `food`, `m4`, `quests`, `bounties`, `materialRequest`, `challenges`, `shared/data/monsters` (todo sprite cabe no PNG) |
| Revisão cruzada | Dois agentes revisores acharam 6 defeitos nas correções, todos corrigidos com teste que falha antes: saída sem level ao lado da porta lv 80 do Vulcão ainda atravessável; Provocar num monstro voltando pela coleira o deixava perseguindo imune; gravação do prazo do chefe sem try/catch no tick; baú do lv 48–49 e 63–69 só com acessório (anel de lv 68 subia o piso); encomenda antiga sem faixa no dia do deploy; XP do cartão do Quadro sem o estágio (já existia) |
| E2E completo | 68/68 na primeira passada (13,4 min, 1 worker; `[tick]` máx 13 ms) |
| E2E do ciclo | `caves` + `depot` + `sinks` em `--repeat-each=3`: 14/15 — falhou 1× "Minas Abandonadas": o poll apertava "d" de novo antes de ler a chegada e andava além do tile (corrida do teste). Corrigido com `stepUntil` (só aperta enquanto está do lado de partida): `caves` 15/15 em `--repeat-each=5`, com o teste novo da porta lv 80 do Vulcão e da saída ao lado (pisar 10× abaixo do level nunca passa do y 96) e captura do Samurai Rubro inteiro (`caves-samurai.png`) |
| CI da PR | 1ª rodada: 66 passados, 1 instável, 1 falha. `spells.spec` "feiticeiro lv 90" falhou 2× com "Sem alvo" (já falhava no CI dos ciclos 12 e do "andar sem engasgos"): o clique vai no tile do servidor e, na máquina lenta, o desenho da Gosma andando ainda está no anterior. A falha trocou o worker e o novo começou noutro trecho da lista de nomes, já gasto: `world.spec` "som" caiu com "nenhum nome livre". Correções nos helpers: `targetNearest` alterna o clique no tile com o clique na linha da Batalha; `createPlayer` percorre a lista inteira de nomes. Local: os 9 specs que usam `targetNearest` 24/24; `spells` 9/9 em `--repeat-each=3`. 2ª rodada do CI: 66 passados, `death` instável (passou no retry), `spells` falhou de novo (ver "Instabilidade conhecida") |

## Resultados — 2026-10-25 (andar sem engasgos e câmera presa ao jogador)

| Camada | Resultado |
|---|---|
| Unitários | 1093 passados, 1 pulado (`npm test`, 93 arquivos); typecheck limpo. `segments.test.ts` novo: predição + fila a 60/75/144 Hz, quadro perdido, correção e clique com chegada irregular; os casos sem relógio reproduzem o defeito antigo |
| Medição no navegador | Sonda temporária (posição do ator e da câmera por quadro, não commitada), servidor E2E isolado; rede do dono por proxy só no WebSocket (73 ms ±15 por sentido, engasgo 3% de 250 ms, FIFO). Quadros no meio de uma caminhada fora de ±10% da vizinhança: teclado LAN 4,6% → 0; teclado rede do dono 4,2% → 0 (2 236 quadros); clique rede do dono 6,1% → 0. Boneco balançando na tela 32 px → 0. Predição: 0 correções e 0 desistências antes e depois |
| Desempenho | `update` da cena 0,8 ms por quadro (mediana; p99 3,6 ms) com 781 monstros, 0 quadros longos (Long Animation Frames) |
| E2E completo | 66/67. Falhou `look.spec` "dois botões numa criatura": isolado 1/3 com a mudança × 3/3 antes dela. Causa no teste, não no jogo: o clique vai no tile do servidor e o rato que vem na direção do personagem logo depois do /tp ainda está desenhado no tile anterior; a câmera presa assenta ~300–500 ms mais cedo, então o 1º clique pegava o rato andando mais vezes. Erro de clique já acontecia antes; o que derrubava o teste era o `textContent()` sem timeout dentro do `expect.poll` (esperava o cartão até o fim do poll, sem nova tentativa). Corrigido nos três polls do arquivo (`{ timeout: 500 }`): `look.spec` 15/15 em `--repeat-each=5` |
| Produção | No ar em 2026-10-25 (`34d66cb`, PR #18): `/health` ok e o `index.html` serve o bundle novo |
| Lição do proxy | A 1ª versão do proxy usava um timer por pacote: timers do Node com o mesmo vencimento disparam fora de ordem e o cliente aplicava patches trocados (servidor "voltava" um tile). Proxy de rede ruim precisa de fila FIFO |

## Resultados — ciclo 13 (2026-10-25, caves profundas)

| Camada | Resultado |
|---|---|
| Mapa | `diff-world.mjs`: 0 tiles alterados, 699/699 objetos antigos, tilesets estáveis, 400×472 → 400×560; validação interna 9160/9160 tiles das caves alcançáveis do spawn |
| Unitários | 1087 passados, 1 pulado; typecheck limpo |
| E2E | `caves.spec.ts` 6/6 em `--repeat-each=3` (o portal tem 1 s de espera entre usos: o teste espera antes de sair); `world`, `travel`, `malha`, `oficina` 19/19 com o mapa novo |

## Resultados — 2026-10-25 (livros e grupos de magia, elementos e lag, ciclo 12)

| Camada | Resultado |
|---|---|
| Unitários | 1087 passados, 1 pulado (`npm test`); typecheck limpo |
| Lag ao andar | `movement.lag.test.ts` (simulação predição × servidor com atraso/variação/engasgo) falha sem as correções; no navegador, rede igual à do dono (proxy 73 ms ±15 por sentido, engasgo 3% de 250 ms): 7 puxões → 0 desistências; LAN: 2 → 0 |
| E2E completo (elementos/lag) | 62/64: `ground.spec` e `look.spec` falharam por itens de outros specs no chão; passam isolados; `ground.spec` "arrastar" agora filtra pelo próprio canto (3/3 em `--repeat-each=3`) |
| E2E ciclo 12 | `hotkeys.spec` 4/4, `quests.spec` 2/2, `spells.spec` 2/2 em `--repeat-each=2` + caso novo do lv 100 (2/2). No lv 90 a barra mostra 7 teclas: a 8ª (Ruptura, lv 100) fica oculta até liberar |
| Produção | Telemetria nova só a partir do deploy do ciclo 12: rodar `admin.mjs telemetria` em ~1 semana |

## Resultados — ajuste da Malha (2026-10-24, nomes comuns e saídas)

typecheck 0 erros; `npx vitest run` 90 arquivos, 1055 passaram, 1 skip; `diff-world.mjs` contra o mapa do `main`:
`tiles alterados: 0; objetos antigos idênticos: 698/698; objetos novos: 1`; `malha.spec.ts` (6 casos, com o Agente da
Parada) + `oficina.spec.ts` 20/20 com `--repeat-each=2`. Grep dos nomes antigos: só títulos de missão e falas de NPC
(mantidos por decisão do dono).

## Resultados — ciclo 11 (2026-10-24, Malha da Ferrovia e ClickUp)

| Camada | Resultado |
|---|---|
| `npm run typecheck` | 0 erros |
| `npx vitest run` | **90 arquivos, 1055 passaram, 1 skip** (o de `bounties.test.ts`, ciclo 9) |
| `diff-world.mjs` contra o mapa do `main` | `tiles alterados: 0; objetos antigos idênticos: 623/623; objetos novos: 75; tilesets estáveis: true; 400x336 -> 400x472`; TilesetLemon 208 → 560 tiles (só cresceu, pixels antigos idênticos). Gerador sem mudanças reproduziu o mapa byte a byte antes da expansão |
| `e2e/malha.spec.ts` (novo, 5 casos) | 15/15 com `--repeat-each=3`, `[tick]` máx 6,9 ms |
| `npm run test:e2e` completo | **passed, 0 falhas** (antes do vínculo pelo jogador); depois do vínculo: malha + oficina + shop + quests + travel = 14/14 |
| `npm run build` | ok; `world.json` 2,41 MB, **gzip 87 KB** (antes 74 KB) |
| `npm run smoke` (servidor isolado) | ok; `[tick]` média 0,80 ms / máx 34 ms com 687 monstros; ClickUp sem token = 0 linhas de log |
| `npm run newbie` | 4/4 vocações, 0 mortes, 46–70 s |

ClickUp: tudo testado sem rede, com respostas gravadas e anonimizadas (`clickup.test.ts`, `workFilter.test.ts`,
`events.test.ts`, `admin.test.ts`). A revisão cruzada atacou o filtro com dois scripts e achou 2 bloqueios (compra do
cliente confidencial anunciada pelo nome do item; grafias como `JLR_UK`, `J.L.R`, largura cheia): corrigidos e todos
os casos viraram teste. Token nunca em log/kv/S2C (teste com erro de rede, 401 e 429; e no vínculo pelo jogador).
**Não testado de ponta a ponta com o ClickUp real**: falta o token e a confirmação de saída de rede da produção.

## Resultados — ciclo 10 (2026-10-23, Oficina dos Engenhos)

| Camada | Resultado |
|---|---|
| `npm run typecheck` | 0 erros (shared, server, client) |
| `npx vitest run` | **87 arquivos, 858 passaram, 1 skip** (o skip de `bounties.test.ts` do ciclo 9: faixa fora do intervalo em `generateBounties`, inalcançável) |
| `node tools/mapgen/diff-world.mjs <world do HEAD>` | `tiles alterados: 0; objetos antigos idênticos: 592/592; objetos novos: 31; tilesets estáveis: true; 400x288 -> 400x336`; `lemon-terrain.png` byte-idêntico. Antes de mudar o gerador, a mesma comparação com o gerador do HEAD deu 0 objetos novos (prova de determinismo) |
| `e2e/oficina.spec.ts` (novo, 4 casos) | 12/12 com `--repeat-each=3`, `[tick]` máx 18 ms |
| `npm run test:e2e` completo | **56/56** (13,2 min) |
| `quests.spec` + `look.spec` `--repeat-each=2` | 10/10 depois do ajuste do `quests.spec` (ver abaixo) |
| `npm run build` | ok; `world.json` 1,57 → 1,79 MB, **gzip 74 KB** (antes 72 KB) |
| `npm run smoke` (servidor E2E isolado :2870) | ok, `[tick]` média 0,84 ms / máx 21 ms com 602 monstros |
| `npm run newbie` | 4/4 vocações, 0 mortes, 43–78 s |

Achados do próprio ciclo:
- `quests.spec` "missão de matar" falhava de forma determinística: o Capitão agora oferece também a Pesquisa de Clima,
  então o marcador fica "!" (disponível) com Ratos no Celeiro em andamento, o que é correto. O teste conclui a Pesquisa
  com `/quest complete` antes e procura a missão de ratos pelo nome no diário. Não é instabilidade.
- `look.spec` "dois botões numa criatura" falhou 1× na primeira rodada e passou nas 3 seguintes (instabilidade antiga,
  ciclo 7/9).
- O **robô novato** pegou um problema de balanço: o bando de 6 Ratos do Datacenter (lv 3, agressivos) nascia a 9
  tiles dos ratos da primeira missão, e o druida lv 1 morreu 2× (128 s). Spawn movido para (47,42), a 30 tiles: druida
  em 49 s sem morte.

## Instabilidade conhecida do E2E (investigada)

`arena.spec.ts` falhava de vez em quando com a máquina carregada: o toast "Onda N vencida" dura 3 s e a faixa
"Onda N!" some rápido, e a asserção chegava depois. Medido com `--repeat-each=3`: código original 1 falha em 9 (duas
rodadas: 9/9 e 8/9); com as mudanças 2 em 9, e a falha persistia com as mudanças de cliente ou de `WorldRoom.ts`
revertidas (bisseção) → não era regressão. Correção: `recordUi`/`seenUi` gravam cada toast/faixa/barra no momento em
que aparece. Depois: 12/12 (`--repeat-each=4`).

**Só no CI (ciclo 14, em aberto):** `spells.spec` "feiticeiro lv 90" falha no runner do GitHub (4 das últimas 6 rodadas,
desde o ciclo 12) e passa local (9/9 em `--repeat-each=3`). Capturas do CI: "Sem linha de visão"/"Sem alvo" com as
Gosmas a 10 sqm atrás de árvores — o alvo escolhido fica longe ou some entre a mira e a palavra. `death.spec` caiu 1×
(passou no retry): o `/tp` de dev pôs o cavaleiro no tile de um rato (distância 0 na Batalha) — o comando não confere
monstro no tile. Pendência: `/tp` de dev com `nearestFreeTile` e `castWorks` escolhendo alvo com linha de visão.

## Pendente / exige avaliação manual

- **Áudio** da atenuação por distância (efeitos de terceiros): ouvir em sessão real com 2+ jogadores.
- **FPS do cliente** numa sessão de 30+ min com vários jogadores (num PC com GPU; o heap já foi medido, ciclo 3).
- **Proxy**: `LEMONQUEST_TRUST_PROXY` atrás do Caddy real com a 2567 fechada.
- Celular/toque: não suportado (fora do escopo, ver roadmap).
