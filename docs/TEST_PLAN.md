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

## Resultados — NPC com uma aba só (Mestre Brás) (2026-10-29)

| Verificação | Resultado |
|---|---|
| Reprodução | harness `?uitest` com `__ut.npcMsg` (Ferreiro, fala real) e `__ut.give("mithril_katana")`: antes, barra de abas com o único botão "Refinar" entre a fala e a explicação do refino; sem estouro horizontal (`scrollWidth` = `clientWidth`), fala e botão "Refinar para +1" no lugar em 1400 e 1000 px |
| Depois | título de seção "REFINAR" no lugar do botão; aba de verdade só com 2+ (Bento, Dona Marta, Quadro) |
| Typecheck | ok; nenhum E2E clica em `.npc-tab` de NPC de aba única |

## Resultados — janela de loot com filtros e subcategorias; pontinhos longe da parede (2026-10-28, noite)

| Verificação | Resultado |
|---|---|
| Typecheck | ok (shared, server, client) |
| Unitários | `lootFilter.test.ts` 10 (+1: cada grupo de arma só tem armas do tipo; cada grupo com a sua categoria; nenhuma arma sem tipo), `lootFilterLogic.test.ts` 5 (zonas a partir de um índice falso: item → zonas dos monstros que o soltam, chefe sem spawn fica fora; cada filtro — categoria, vocação com `vocationFits` e a Fada vendo o que é de druida, level "até o meu" e por faixa só para quem tem level, zona — e combinações com a busca). Suíte inteira: 141 arquivos, 1693 testes, 0 falhas |
| Harness `?uitest` (sonda Playwright) | 16 grupos (Materiais, Comida, Poções, Espadas, Machados, Clavas, Arcos, Varinhas, Bastões, Escudos e livros, Elmos, Armaduras, Pernas, Botas, Anéis, Amuletos); categoria Equipamento → 148 de 242; + "Minha (Cavaleiro)" → 86 (sem arcos, varinhas e bastões); + "Até o meu level (8)" → 13; "Desmarcar visíveis" → 13 ficam no chão (229/242 entram); "Limpar filtros" mantém a lista; Materiais + "vale menos de 100" → +21 (34 no chão); "Pegar tudo de novo" → 242/242; Esc com o foco no campo de busca fecha; zona presente no select; sem erro no console |
| Pontinhos | 6 px da parede (5 + borda), 5 px até a seta no hover |
| Wiki | `npm run wiki` ok; o texto da Mochila passa a dizer "16 grupos" e cita os filtros |
| E2E | CI da PR (não roda localmente) |

## Resultados — loot automático configurável (2026-10-28, popover de manhã; janela com todos os itens à tarde)

| Verificação | Resultado |
|---|---|
| Typecheck | ok (shared, server, client), nas duas versões |
| Unitários (versão final) | `shared/lootFilter.test.ts` 9 testes (lista = tabelas de loot sem ouro/missão/chave, 242 itens; grupos na ordem e sem vazio; sanitize com lixo, teto e migração do formato antigo; ouro/missão/chave e raro+ sempre; item da lista fica; resumo). `items/lootFilterLogic.test.ts` 3 (busca sem acento, lote sem repetir, contagem e "abaixo de"). `ground.test.ts` +6 (padrão igual ao de antes; osso da lista no tile do monstro, sem dono e sem aviso, outro jogador pega; colete da lista fica mas o raro entra; só ouro ainda gera cartão com `left`; chão lotado some em silêncio; grupo pula quem desmarcou e, sem ninguém querendo, chão reservado ao grupo). `WorldRoom.test.ts` +1 (entra com o padrão; `SetLootFilter` limpo e confirmado; salvo e volta no login; padrão apaga o campo; lixo ignorado). Suíte inteira: 141 arquivos, 1690 testes, 0 falhas |
| Harness `?uitest` (sonda Playwright, barras de rolagem visíveis) | janela abre pelo funil do trilho: 11 grupos, 242 itens, "Pega tudo · 242/242 entram"; desmarcar 1 item + "Nenhum" num grupo → "11 itens ficam no chão · 231/242", funis do trilho e da Mochila acesos; busca "poç" → 1 grupo, 6 itens; "Desmarcar o que vale menos de 100" → 51 itens; "Marcar tudo" → 242/242; Esc fecha (também com o foco no campo de busca, `within`); sem erro no console |
| Mochila (LO-6) | antes: corpo 202 px com a barra de 6 px dentro → 5ª coluna cortada; depois: `offsetWidth` 208, `clientWidth` 202, borda direita da 5ª coluna a 6 px da borda do corpo |
| Seta × pontinhos (LO-7) | antes: pontinhos a 1 px da seta; depois: 7 px no hover |
| Wiki | `npm run wiki` ok; "Experiência e levels → Mochila → Loot automático" (242 itens, 11 grupos) e o link em "Grupo → Loot do grupo" |
| E2E | CI da PR (não roda localmente) |
| Versão da manhã (popover) | 8 testes no shared, mesma cobertura no servidor; sonda do popover; suíte inteira 140 arquivos / 1686 testes verdes. Substituída à tarde a pedido do dono |

## Resultados — troca de alvo dos monstros (2026-10-28)

| Verificação | Resultado |
|---|---|
| Typecheck | ok |
| Unitários | `ai.test.ts` +7 (alvo fora da percepção com e sem outro dentro; sticky; nearest com folga de 2 tiles e prazo de 3 s; weakest com 15 pontos; damage com 1,3× e volta; random com RNG semeado; provocado e passivo), `monsters.test.ts` +1 (padrão por tipo em todo o catálogo); suíte inteira verde, `arena.test.ts` (metas do Coliseu) sem mudança |
| E2E | CI da PR (não roda localmente) |

## Resultados — rolagem do chat (2026-10-28)

| Verificação | Resultado |
|---|---|
| Reprodução | harness `?uitest`, sonda Playwright: 12 linhas do Feed em rajada (sem mexer no chat) → `scrollTop` parado a 218 px do fim e pílula "↓ 6 novas"; as mesmas 12 uma a uma (400 ms) → sempre no fim. Instrumentado: o evento de scroll da nossa descida chega no quadro seguinte, já com a lista maior |
| Unitários | `chatScroll.test.ts`: 6 testes (2 novos: rajada e "lendo só com o mouse em cima"); `npx vitest run packages/client` verde; typecheck ok |
| Sonda depois da correção | 13 cenários: rajada de 12 e de 6 (mouse fora) → fim; mouse em cima + subir 60 px + 3 novas → segura, pílula "↓ 3 novas"; mouse sai → fim; subir e sair sem novas → fica; +2 com o mouse fora → fim; recolhido +5 e reaberto → fim; +3 com o mouse no cabeçalho → fim; texto grande (zoom 1,3) +6 → fim; mouse parado sobre o chat sem subir +4 → fim; digitando +4 → fim |
| E2E | CI da PR (não roda localmente) |

## Resultados — Fada Gabi, vocação oculta (2026-10-28)

| Verificação | Resultado |
|---|---|
| Typecheck | ok (3 pacotes) |
| Unitários | `npx vitest run`: 138 arquivos, 1655 testes, 0 falhas, 0 pulados (+5 novos: espelho das 14 magias da Fada, balanço da Fada, roupa trancada por vocação no shared e no servidor, CLI `create-account`/`create-character`; ajustados: criação recusa `fairy` pela API, atalhos padrão com 5 vocações, cobertura de itens por `vocationFits`, conquistas dispensam a roupa exclusiva, sprite da invocação repetido de propósito) |
| Balanço | `vocationBalance.test.ts`: Fada 1,07 / 1,22 / 0,95× o druida e 0,85 / 0,93 / 1,07× o feiticeiro nos lv 30/60/100 (só o elemento sagrado contra cada pacote); pior/melhor com ela ≥ 0,65 |
| Arte | `node tools/addons/generate.mjs`: 42 overlays antigos iguais byte a byte; `base_fada.png`, retrato e os 3 overlays novos conferidos em prévia 5× (ruiva cobre distinta da pele, vestido rosa, asas dos dois lados de frente, por cima de costas, uma de lado; varinha com estrela) |
| Wiki | gerada em pasta temporária: 735 páginas, nenhuma cita "Fada", "plim" ou "Borboleta Encantada" (o build do cliente falhou uma vez com 4 links quebrados na página "Cura e poções" até o filtro da vocação oculta entrar lá também) |
| Fumaça manual | servidor E2E isolado (`E2E_PORT=2870`, banco em `%TEMP%`): `POST /api/characters` com `fairy` → `invalid_request`; CLI `create-character` contra o banco temporário → personagem criado; no jogo: vocação `fairy`, roupa `fada` com `addons 3`, 150/50 no lv 1 e 324/920 no lv 30 (= druida), 11 atalhos com ícones `sparkle`, janela de roupas com "Fada" e os dois addons liberados (as outras vocações veem 20 roupas), Banho de Espuma/Asinhas/Beijinho/Cantiga/Glitter pelo chat (as de alvo e a invocação não saem na PZ, como esperado); capturas do boneco com asas, varinha e brilhinho, da lista de personagens ("Fada · Nível 1", retrato dela), das roupas e da janela Magias |
| E2E | CI da PR (não roda localmente) |

## Resultados — cura como no Tibia (2026-10-27)

| Verificação | Resultado |
|---|---|
| Typecheck | ok |
| Unitários | `npx vitest run`: 137 arquivos, 1631 testes, 0 falhas, 0 pulados (+4 novos: `moveHotkey`, poções por vocação em Q/E, faixas da Cura por vocação, Limpar Feridas/Cura Divina) |
| Balanço | `vocationBalance.test.ts`: pior/melhor 0,79 / 0,72 / 0,81 (lv 30/60/100); feiticeiro não lidera dano e sobrevivência; Escudo de Mana ≤ 1,1× |
| Coliseu | `arena.test.ts` com a curva nova: solo lv 120 ≤ 30 (cav 30, pal 30, feit 29); solo lv 34 cai na 22–23; grupo lv 100 cai na 61, lv 110 na 68–69, lv 120 completa, lv 135 completa em todas as semanas; Fúria/Enxame derrubam o lv 120 |
| Varredura | `scratchpad/sweep-coliseu.mts` (fora do repositório): 40 combinações de Cura/poções/ondas; o conjunto escolhido é o menor que devolve todos os degraus |
| E2E | CI da PR (não roda localmente) |

## Resultados — janela "Magias" (2026-10-27)

| Verificação | Resultado |
|---|---|
| Typecheck | ok |
| Unitários | `npx vitest run`: 136 arquivos, 1617 testes, 0 falhas, 0 pulados (+5 novos: `addSlot`, `sortStrongest`, `spellsModel` ×3) |
| E2E | CI da PR: aguardando (o E2E não roda localmente); `hotkeys.spec.ts` reescrito (5 cenários: tecla G/Q, tirar e pôr pelo +, arrastar na barra, família no level, grupo com "Mais forte primeiro") |
| Capturas | gerar com `E2E_SNAPS=1` num servidor E2E e conferir antes do deploy: `spells-window.png`, `spells-group-editor.png`, `spell-family.png` (14 px, botões ≥ 32 px, foco visível) |
| Texto maior (1,3) em 1366×768 | a conferir à mão antes do deploy: a janela deve caber e o corpo rolar |

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

## Resultados — ciclo 20 (2026-10-26, Montadora)

| Camada | Resultado |
|---|---|
| Unitários | 1601 passados (134 arquivos; eram 1552); typecheck limpo. Novos: `montadora.test.ts` (geometria, 15 zonas, 6 portas com saída sem level, atalho, caçável no level da porta e não um abaixo, spawns e chefes, NPCs, alavanca e baús); casos novos em `monsters`, `items` (peças e anéis abaixo do melhor do slot; modelo do Coliseu nunca escolhe peça da Montadora), `refine`/`imbuement` (extra só no refino 7–8 e no encantamento III, cobrança tudo-ou-nada), `questWorld` (dia por alavanca, migração, rollback, texto por alavanca), `events` (quarta 13h), `bounties` (faixa 114, antigas congeladas), `worldIndex` (rota Vila → Pátio de Carros pela cegonha; Estação do Minério pelo Caminhão de Bobinas), `guide` (`guideAt`), `travelInfo` |
| Mapa e atlas | `diff-world.mjs`: 0 tiles alterados, 1120/1120 objetos antigos, 277 novos, 400×722 → 400×888; `diff-atlas.mjs`: 984/984 tiles antigos idênticos, +622; 15.059/15.059 tiles andáveis alcançáveis (561 só pela alavanca) |
| Memória do cliente | `tools/mapmem.mjs` (3 rodadas, servidor isolado): heap 65 / 76 / **84 MB** para 400×560 / 722 / 888 com o vazio fora do Phaser (antes: 88 / 100 / 120 MB); carga ~5,4 s em todos |
| Revisão cruzada | Sem bloqueante. Corrigidos: mapa mundial (M) passava da janela com 888 linhas (escala fracionária), Galeria dobrava as fontes comuns de tier 8 (Colosso no lugar: Tengu+Samurai 22 → 15 no mundo), Rubi no refino dos tiers 5–6 (tirado), "Lava-Jato" renomeado para "Lava-Rápido" (e de volta a "Lava-Jato" por decisão do dono no mesmo dia), 3 textos, teste de rota faltando |
| E2E | `montadora.spec.ts` escrita, não executada localmente. Resultado do CI da PR abaixo |

## Resultados — ciclo 19 (2026-10-26, Siderúrgica)

| Camada | Resultado |
|---|---|
| Unitários | 1551 passados (133 arquivos; eram 1525); typecheck limpo. Novos: `siderurgica.test.ts` (mapa real: setores, portas crescentes com saída sem level, spawns no setor e na faixa, chegadas na PZ, nada andável fora do bloco); casos novos em `monsters` (curva xp/vida, ouro, chefes vizinhos ±10% com os chefes de covil), `items` (equipamento abaixo do melhor do slot, tier 8 da Fornalha em `REGION_FINAL_BOSSES`), `arena` (modelo nunca escolhe peça da Siderúrgica, lv 1–150), `quests` (todo alvo caçável no level mínimo passando pelas portas), `npcs` (viagens), `events` (segunda 17h), `portalInfo` (saídas coladas a portas sem rótulo, toda porta de level com rótulo) |
| Mapa e atlas | `diff-world.mjs`: 0 tiles alterados, 851/851 objetos antigos, 269 novos, 400×560 → 400×722; `diff-atlas.mjs`: 555/555 tiles antigos idênticos, +429; `world.json` gzip 106,6 → 126,7 KB; atlas 125 → 199 KB; índice do mundo monta 400×722 em 16 ms |
| Revisão cruzada | Integração das 3 frentes sem defeito grave/médio (ids mapa↔catálogo nos dois sentidos, as 15 missões alcançáveis no level mínimo pelas portas, ninguém preso no lv 1, viagens sem pular porta, conteúdo limpo). Corrigidos: Viagem dizia "sem monstros" para a Estação do Minério (`levelsNear` agora olha o outro lado de uma porta de level), missão homônima do evento renomeada ("Canal Entupido"), saudação contraditória do Mestre de Turno, Limonada do Turno 1/5 → 1/4 de mana |
| Memória do cliente | O Phaser passa a receber só as camadas desenhadas (sem `collision` nem objetos, que o cliente lê do JSON cru) e células vazias como `null` (`insertNull`): menos objetos Tile com o mapa 400×722. Medição de heap não feita localmente |
| E2E | `siderurgica.spec.ts` escrita, não executada localmente (memória da máquina). CI da PR #25: typecheck/testes/build, E2E (inclusive `siderurgica.spec`) e Docker verdes |

## Resultados — ciclo 18 (2026-10-26, social e retenção)

| Camada | Resultado |
|---|---|
| Unitários | 1525 passados (132 arquivos; eram 1423), 0 pulados; typecheck limpo. Novos: `invasion.test.ts` (shared e servidor: ondas pelo relógio e após reinício, escala por presentes fora da PZ, teto de 40 com o líder garantido, nunca em PZ, cura só do dano de invasor, prêmio e Vila defendida, sem segunda rodada na mesma janela), `excursions.test.ts` (shared e servidor: escolhas, limites, ping a cada 30 s, lembrete, expiração, kv, crédito do Guia só com 15 min e 1×/dia), `challenges.test.ts` (shared), `challengeLogic`, `onlineLogic`; casos novos em `social` (zona só com amizade mútua, grupo ou PZ), `events` (Invasão e Maré sem sobreposição), `loginBonus`, `fishing`, `achievements` (sem par repetido), `weekly`, `combat` (`lastHits`) |
| Mapa | `diff-world.mjs` contra o ciclo 17: 0 tiles alterados, 846/846 objetos antigos, 5 novos (4 `invasion_point` + Mural) |
| Revisão cruzada | 7 achados corrigidos: cura pontuando sem invasor, zona vazando pela estrela de amigo (agora amizade mútua, no painel e no `/quem`), invasão que podia rodar e premiar 2×, Guia de Excursão em 1 minuto, líder que não nascia com o teto cheio, spam de "Quero ir", presença inflada por quem fica no templo |
| E2E | Specs novas, não executadas localmente: `invasion.spec.ts`, `mural.spec.ts` (duas páginas); `spells.spec` refeito (bonecos de treino, linha de visão, mira por id) e `death.spec` (tile sem monstro) contra a instabilidade 14-24. CI da PR #24: 1ª rodada com `invasion` (defensor começava na PZ, que deixou de contar como presença), `challenges` (regex `` com o texto colado) e `depot` (arrasto) — specs corrigidas; 2ª rodada toda verde, inclusive `spells` |

## Resultados — ciclo 17 (2026-10-26, descoberta, missões e interface)

| Camada | Resultado |
|---|---|
| Unitários | 1415 passados (123 arquivos; eram 1333), 0 pulados; typecheck limpo. Novos: `worldIndex.test.ts` (mapa real: zonas, spawns, rótulo de porta de cave, `nextHop` da Vila até uma cave; montagem 5–22 ms), `questUnlocks.test.ts` (trava igual ao `questAvailable` do servidor em todo o catálogo), `guide.test.ts` (todo passo de toda missão tem destino alcançável do templo), `questInfo.test.ts` (todo monstro do Quadro e material da Encomenda têm onde caçar), `markers`, `portalInfo`, `travelInfo`, `damageText`, `agendaLogic`, `playerMenuLogic`, `depotSearch`, `welcome`; casos novos em `events`, `admin`, `inventory` (`organizeItems`), `newsLogic`, `combat` (`resisted`), `lookInfo`, `bestiaryLogic` |
| Mapa | `diff-world.mjs --allow` (4 retângulos das bocas): 0 tiles fora, 58 dentro (22/14/11/11), 843/843 objetos antigos, 3 luzes novas; conjunto de tiles alcançáveis fora dos retângulos idêntico (67550); gerador determinístico |
| E2E | Specs novas/ajustadas, não executadas localmente (máquina com pouca memória): `navigation.spec.ts`, `agenda.spec.ts`, `guide`, `quests`, `bestiary`, `depot`, `caves` (bocas de caverna com capturas), `malha` (nome elite). CI da PR #23: 75 passados, todas as specs novas verdes; só `spells` "feiticeiro lv 90" falhou (instabilidade antiga do CI, 14-24) |
| Revisão cruzada | 6 achados corrigidos com teste: guia apontando através de parede para 3 NPCs atrás de balcão (bolsões < 4 tiles ignorados; teste: todo NPC fora do Coliseu alcançável do templo), rota ignorando o requisito das portas (`canPass` no `nextHop`/`travelCost`), "Porta de missão" em porta só de level, rótulo da saída do Goroma sobreposto à porta lv 80, guia do novato que não desligava, `ConditionsStrip`/viagem redesenhando a cada passo |

## Resultados — ciclo 16 (2026-10-26, fim de jogo)

| Camada | Resultado |
|---|---|
| Unitários | 1333 passados (112 arquivos; eram 1214), 0 pulados; typecheck limpo. Novos: `refine.test.ts` (shared e servidor), `imbuement.test.ts` (shared e servidor), `arenaChampion.test.ts`, `lairs.room.test.ts` (sala real: quem bate e o grupo perto ganham o abate do covil; arena não conta), `drawnChests.test.ts`, `dropConfirm.test.ts`, `imbueLogic.test.ts`; casos novos em `items`, `quests`, `questWorld`, `monsters`, `arena` (ondas 61–70 com cada modificador, virada de semana), `ground` (ouro de 1,5 mi sobrevive ao reinício), `m4` (clique duplo no encantamento cobra 1×), `conditions` |
| Mapa | `diff-world.mjs` contra o ciclo 15: 0 tiles alterados, 826/826 objetos antigos, 17 novos (4 chefes, 12 baús, Mestre Brás); 67583/67596 tiles alcançáveis (13 baús/obstáculos) |
| Balanço | `vocationBalance` e `arena` com o tier 8 completo: 48/48; Coliseu 61–70: grupo lv 110 cai na 61, lv 130 completa com qualquer modificador |
| Revisão cruzada | Dois revisores: 5 achados corrigidos (cobrança dupla do encantamento no clique duplo; rollback de imagem zeraria encantamentos — o save grava também o campo antigo; ouro > 1 mi cortado no reinício do chão; venda avulsa de refinado sem confirmação; tempo do Coliseu na semana do fim) + a trava dos baús de covil trocada da prova (passável a alts) para o abate registrado; coroação do Coliseu isolada em `runSafe` |
| E2E | Execução local completa interrompida pelo sistema por falta de memória na máquina (não foi falha de teste); não reiniciada. Specs ajustadas: `arena` (Onda N/70), `sinks` (encantamento), `caves` (baú de covil trancado), `refine.spec.ts` novo. CI da PR #22: 68 passados, `achievements` instável (passou no retry), `malha` "Cobra Listrada" falhou 2× porque a cobra nasceu elite ("Elite Cobra Listrada") e o teste comparava o nome exato — corrigido no ciclo 17 (`toMatch(/Cobra Listrada$/)`) |

## Resultados — ciclo 15 (2026-10-25, balanço das vocações e morte)

| Camada | Resultado |
|---|---|
| Unitários | 1214 passados (102 arquivos; eram 1162), 0 pulados; typecheck limpo. Novos: `balanceKit.ts` + `vocationBalance.test.ts` (P por vocação nos lv 30/60/100 nas tabelas de produção e do plano; feiticeiro não lidera dano e sobrevivência juntos; vida efetiva do escudo ≤ 1,1× a do cavaleiro), `skills.test.ts`, `admincli.test.ts`, `blessingText.test.ts`; casos novos em `combatFormulas`, `pvp`, `combat`, `spells`, `telemetry`, `monsterAbilities`, `conditions`, `shared/data/monsters`, `shared/data/spells`, `hotkeys`, `bestiaryLogic`. `arena.test.ts` com as metas de volta e sem `it.fails` |
| Balanço medido | Pior/melhor do P (produção): 0,52/0,39/0,49 → 0,74/0,66/0,86; tabela do plano 0,74/0,73/0,83. Coliseu: solo lv 34 22–23, solo lv 120 29–30, grupo justo da 40/45/50/55/60 em 38/46/48/54/completa, lv 100 cai na 54, lv 120 completa |
| Revisão cruzada | Sem bug grave; corrigidos: descrição do Escudo de Mana presa a "metade" (agora travada contra a constante por teste), teto "Protege até" da sacerdotisa sem a caveira vermelha, `cloneData` da telemetria quebrando com `byLevel` nulo, comentário e README da telemetria |
| E2E | Não rodado localmente (decisão do dono: E2E local só a pedido). Specs ajustadas: `death.spec` (milhar com ponto em "−N XP"). CI da PR #21: typecheck/testes/build, E2E e Docker verdes |

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
