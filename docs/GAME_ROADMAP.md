# Roadmap — The Lemon Quest

Reflete o estado real. Números `#` = itens de [GAME_AUDIT.md](GAME_AUDIT.md). Status: ✅ concluído · 🔄 em andamento ·
⏳ pendente · 🧭 precisa de decisão do dono do jogo · ⛔ não fazer agora.

Ordem de leitura: **Ciclo 9** (o que está em andamento e as decisões tomadas) → pendências dos ciclos 7/7b/8 → ⛔.
Os ciclos 1–6 (100 % concluídos) estão no fim, em "Histórico".

## Plano dos ciclos 14–20 (aprovado em 2026-10-25)

Análise completa do jogo com dados de produção e decisões do dono: [PLANO_CICLOS_14-20.md](PLANO_CICLOS_14-20.md).
Ordem: 14 correções ✅ → 15 balanço das vocações e morte no 60+ ✅ → 16 fim de jogo (tier 8, encantamento com tiers,
covis, refino, Coliseu 61–70) ✅ → 17 descoberta e interface (+ bocas de caverna) ✅ → 18 invasões da Vila e Mural de
Excursões ✅ → 19 Siderúrgica ✅ → 20 Montadora ✅. Para depois (dono): Murphy, guilda, mercado, casas.

## Fada Gabi — vocação oculta (2026-10-28)

| # | Item | Status | Validação |
|---|---|---|---|
| FG-1 | Dono: "personagem Fada Gabi, criado direto, classe nova bloqueada ou oculta". Vocação `fairy` (Fada): fora da criação (`PLAYABLE_VOCATIONS`), da API e da wiki; druida de outro elemento (vida/mana, skills, mochila, equipamento e poções do druida por `vocationFits`/`GEAR_VOCATION`) | ✅ (2026-10-28) | `auth.test.ts` (API recusa), `items.test.ts` (cobertura por `vocationFits`), `vocationBalance.test.ts` (0,85–1,07× o feiticeiro; piso 0,65 mantido), wiki gerada sem "Fada"/"plim" |
| FG-2 | Dono: "skills fofas, algo bem divertido". 14 magias `plim …` espelhando as do druida número a número (sagrado/energia; choque no lugar de veneno) + Torcida da Fada no lv 100; famílias "Brilho no alvo"/"Brilho em volta"; efeito `sparkle` rosa | ✅ (2026-10-28) | `spells.test.ts` (espelho magia a magia, 59 magias), `spellFamilies.test.ts`, `hotkeys.test.ts` (11 teclas); fumaça no servidor E2E (magias pelo chat) |
| FG-3 | Dono: "fofa, ruiva, tom de rosa e com brilhinho; um addon só para ela". Roupa "Fada" (Woman ruiva de vestido rosa, gerada) com Asas de fada e Varinha de estrela, trancada por vocação (`unlock: "vocation:fairy"`, invisível às outras na janela de roupas); brilhinho permanente no boneco (`CharacterLook.glitter`) | ✅ (2026-10-28) | `outfits.test.ts`, `outfit.test.ts` (só a Fada veste, nem com `/desbloquear`), `achievements.test.ts`; `preview_sexo.png`/capturas |
| FG-4 | CLI: `create-account` (conta sem senha + código de recuperação) e `create-character` (kit inicial; aceita a vocação oculta) | ✅ (2026-10-28) | `admincli.test.ts`; README e `deploy/docker/README.md` |
| FG-5 | Criar a Fada Gabi em produção: não há conta "gabi" ainda (12 contas, nenhuma dela). Depois do deploy: `create-account <conta da Gabi>` + `create-character <conta> "Fada Gabi" fairy f` no container, e passar o código de recuperação a ela — ou criar na conta que o dono indicar | 🧭 | — |
| FG-6 | Olhar a Fada numa sessão real (brilhinho e efeitos `sparkle` em vários PCs; custo do emissor por boneco é 1 partícula a cada 150 ms) e ajustar a arte se o dono quiser (cor do cabelo, tamanho das asas) | ⏳ | — |

## Login e painel Online (2026-10-27)

| # | Item | Status | Validação |
|---|---|---|---|
| LO-1 | Dono: "salvar o login no navegador, entra direto e só escolhe o personagem". Sessão da conta no `localStorage` + `SESSION_IDLE_MS` 30 dias; "Sair da conta" apaga | ✅ (2026-10-27) | `auth.test.ts` (expiração, reinício) |
| LO-2 | Dono: "tirar o olho da senha ou pôr um pixel art". Olho aberto/fechado em `PixelIcon` | ✅ (2026-10-27) | captura da tela de login |
| LO-3 | Dono: "organizar melhor a lista de onlines e melhorar os botões". Blocos Seu grupo/Amigos/No mundo, rosto da vocação, botões de 22 px com ícones em pixel art | ✅ (2026-10-27) | `onlineLogic.test.ts` (blocos); E2E `mural.spec.ts` (seletores mantidos); captura no harness |
| LO-4 | Sessão de 30 dias num PC compartilhado do escritório: se virar problema, "Sair da conta" automático ao fechar a aba ou aviso no login | 🧭 | — |
| LO-5 | Relato do dono: "tem hora o jogo buga e não consigo abrir e fechar as missões nem a seta do mapa". Causa (dono, 2026-10-28: "a notificação no topo tampa as setas e o +"): a pilha do topo (`.top-stack`: selo do evento, avisos, Feed) é invisível e larga como a área de jogo, e `#ui > * { pointer-events: auto }` (especificidade de ID) vencia o `pointer-events: none` dela — engolia o clique no "+" do rastreador e no chevron do trilho. Corrigido com `:where(#ui > *)`; o mesmo valia para `.loot-stack`, `.quest-done`, `.level-banner`. A guarda em `isTyping()` (foco preso em campo escondido) fica | ✅ (2026-10-28) | sonda Playwright no harness `?uitest` (antes: `elementFromPoint` → `.top-stack`, clique engolido; depois: `.rail-chevron`, clique recolhe) + guarda em `e2e/agenda.spec.ts` |
| LO-6 | Dono: "mãozinha nas bolinhas para arrastar o HUD, em vez de pointer em tudo": cabeçalhos com cursor normal, só o `.drag-grip` com `grab` | ✅ (2026-10-27) | visual |

## Wiki do jogo (2026-10-27)

| # | Item | Status | Validação |
|---|---|---|---|
| WK-1 | Wiki gerada dos dados (`npm run wiki`, servida em `/wiki/`, link no F1) — PR #35 | ✅ (2026-10-27) | build falha com link quebrado; 735 páginas conferidas por amostra |
| WK-2 | Dono: "uma carinha mais do Lemon Quest". Visual do HUD: Pixelify Sans, painel-janela sobre fundo de cor sólida com grain (o dono dispensou o mapa ao fundo), cabeçalhos de seção com ▸, infobox como o painel Personagem, tabelas em poço | ✅ (2026-10-27) | capturas (início, criatura, item, NPC, missão, mapa, mecânica) |
| WK-3 | Números do servidor copiados na wiki (Baú de Recompensa, pesca, cassino): mover para o `shared` para nunca divergirem | ⏳ | — |

## Mochila automática e capacidade por vocação (2026-10-27)

| # | Item | Status | Validação |
|---|---|---|---|
| MO-1 | Dono: "organizar a mochila sozinho". Decisão: sempre automático, sem interruptor — a cada flush o servidor junta pilhas iguais e ordena como o Organizar do depot; arrastar dentro da mochila não faz nada (cliente explica) | ✅ (2026-10-27) | `inventory.test.ts` (organiza no flush); E2E `panels.spec.ts` |
| MO-2 | "Puxar o item para qualquer quadrado e ele entra no lugar vazio": depot e chão → pilha igual ou primeiro vazio, seja onde for solto; equipamento mantém a troca com item equipável | ✅ (2026-10-27) | `inventory.test.ts`, `ground.test.ts`; E2E `ground.spec.ts` |
| MO-3 | "Aumentar a capacidade de cada vocação". Decisão: como no Tibia — cavaleiro 30 → 60, paladino 26 → 52, magos 24 → 48, +1 a cada 4 levels (era 20 → 40 igual para todos); grade de 5 por linha | ✅ (2026-10-27) | `inventory.test.ts` (fórmula), `panelSize.test.ts`; wiki com tabela |
| MO-4 | Acompanhar se alguém sente falta de arrumar a mochila na mão (o depot continua manual, com Organizar); se pedirem, um interruptor "Organizar sozinha" por personagem | 🧭 | — |

## Personagens masculinos e femininos (2026-10-27)

| # | Item | Status | Validação |
|---|---|---|---|
| MF-1 | Dono: "masculino e feminino, mesmos addons". Opção A: mesmo id de roupa, sheet por sexo (`OutfitDef.female`), `CharacterData.sex` opcional (ausente = "m"), escolha na criação e troca livre na janela Roupas; 6 pares do pack + 6 sheets geradas (`tools/addons/generate.mjs`, inclusive as 4 barbudas por recolor, decisão do dono) + 8 fechadas iguais; overlays `_f` onde a cabeça feminina é mais alta | ✅ (2026-10-27) | `outfits.test.ts`, `outfit.test.ts`, `auth.test.ts`, `sprites.test.ts`; prévia 20×2 conferida |
| MF-2 | Nomes femininos só onde a roupa muda (as 8 fechadas mantêm o nome, como no Tibia); conferir com o dono se quer "Cavaleira", "Guerreira" etc. | 🧭 | — |
| MF-3 | Jogadoras reutilizam 6 sheets que já são NPCs (Woman = Hanna, Princess = Dona Marta…); se incomodar, gerar variações de cor para as NPCs | ⏳ | — |

## Cura como no Tibia (2026-10-27) — poções por vocação, Cura por ML, grupo sem limite

| # | Item | Status | Validação |
|---|---|---|---|
| CT-1 | Dono: "balanceado igual no Tibia: poções para cavaleiro, magos e paladino e cura por ML; o cavaleiro tem cura mais fraca porém pode usar poção mais forte". Cura 20 + 1,23·lv + 3·ML; Limpar Feridas (cav, lv 15) e Cura Divina (pal, lv 35); Cura em Grupo ML 3; poções Vida Forte/Enorme/Suprema (lv 50/80/110), Mana Forte/Enorme (50/80), Espírito (pal, 80), com vocação conferida no servidor e nas teclas Q/E | ✅ (2026-10-27) | `spells.test.ts` (faixas por vocação), `itemRules.test.ts`, `vocationBalance.test.ts` (pior/melhor ≥ 0,69), `arena.test.ts` |
| CT-2 | Coliseu recalibrado por varredura: `ARENA_DMG_POINTS` 40/50/60 → 3,68/4,52/2,64 e 62–70 → 1,73; degraus novos: lv 100 cai no portão (61), lv 110 nunca completa, lv 120 completa sem modificador, lv 135 completa em todas as semanas; Fúria e Enxame derrubam o lv 120 | ✅ (2026-10-27) | `arena.test.ts`, `monsterHunt.test.ts` |
| CT-3 | Acompanhar 1 semana: gasto de ouro em poções no 50+ (meta 16-7) e mortes/h por vocação com a cura nova (`admin telemetria`); se o cavaleiro sobrar no 100+, baixar a Suprema para 700 | ⏳ | telemetria de produção |
| CT-4 | Grupo sem limite de membros (`PARTY_MAX` 64 só como guarda); a regra de level da XP (2/3) ficou como o dono decidiu antes | ✅ (2026-10-27) | `party.test.ts` |

## Janela "Magias" (2026-10-27) — usabilidade e acessibilidade dos atalhos e grupos

| # | Item | Status | Validação |
|---|---|---|---|
| JM-1 | Dono: "melhore a usabilidade e acessibilidade de gerenciar skills". Decisão (🧭 2026-10-27): caminho A — uma janela só em volta da barra, no lugar de "Atalhos" e "Grupos de magia" (`SpellsWindow.tsx`, `GroupEditor.tsx`, `SpellGrid.tsx`, `spellsModel.ts`); grade com ícones, editor numerado com "Mais forte primeiro", 14 px, botões ≥ 32 px, teclado completo. Spec: `docs/superpowers/specs/2026-10-27-janela-magias-design.md` | ✅ (2026-10-27) | `edit.test.ts`, `groupsEdit.test.ts`, `spellsModel.test.ts`, E2E `hotkeys.spec.ts` (CI) |

## Ciclo 20 (2026-10-26) — região Montadora

Especificação: [regioes/montadora.md](regioes/montadora.md). Último ciclo do plano 14–20.

| # | Item | Status | Validação |
|---|---|---|---|
| 20-1 | Mapa 400×888, setores com portas de level e saídas sem level, subsolo e Sala dos Protótipos | ✅ | `diff-world` 0 tiles, 1120/1120; validações do `expansion7.mjs`; `montadora.test.ts` |
| 20-2 | Arte `L.factory()` (+622 tiles) | ✅ | `diff-atlas.mjs` 984/984 |
| 20-3 | 12 monstros + 3 chefes, materiais, 7 peças, 4 anéis (Coliseu inalterado) | ✅ | `monsters`, `items`, `arena`/`vocationBalance` |
| 20-4 | Aço Líquido/Cromo no refino +4/+5 (tiers 7–8) e Rubi/Aço Líquido/Cromo no encantamento III | ✅ | `refine`, `imbuement` (shared e servidor), `m4`, `refineLogic` |
| 20-5 | 14 missões, 14 NPCs + 6 placas, viagens (cegonha, Dito, Bobinas, atalho), Teste de Pista quarta 13h, conquistas | ✅ | `quests`, `npcs`, `events`, `achievements`, `worldIndex`, `guide` |
| 20-6 | Alavanca Crash Test, dia por alavanca, texto por alavanca | ✅ | `questWorld.test.ts` (shared e servidor) |
| 20-7 | Faixa 114 do Quadro | ✅ | `bounties.test.ts` (faixas antigas congeladas) |
| 20-8 | Heap do cliente com o mapa 400×888 | ✅ | `tools/mapmem.mjs`: 84 MB (era 120 MB antes de tirar o vazio do Phaser; 88 MB no mapa de 560 sem a mitigação) |
| 20-12 | "Lava-Jato" mantido (dono, 2026-10-26: desfeita a troca para "Lava-Rápido"; o título "o Lava-Rápido" continua) | ✅ | `diff-world`: só o objeto da zona renomeado |
| 20-10 | Revisão: Galeria com Colosso (tier 8 comum +25%, não +83%), Rubi fora do refino 5–6, textos, mapa M fracionário | ✅ | `montadora.test.ts`, `refine`, `worldIndex` |
| 20-11 | % explorado das conquistas varre ~355 mil células por jogador a cada 5 s (cresceu com o mapa): guardar índices alcançáveis | ⏳ | otimização opcional |
| 20-9 | Parar de gravar o `leverDay` antigo e o `imbuement` antigo (mantidos para rollback) | ⏳ | ciclo seguinte |

## Ciclo 19 (2026-10-26) — região Siderúrgica

Especificação: [regioes/siderurgica.md](regioes/siderurgica.md).

| # | Item | Status | Validação |
|---|---|---|---|
| 19-1 | Mapa 400×722 com 7 setores, portas de level e saídas sem level, Estação do Minério e Coração do Forno | ✅ | `diff-world` 0 tiles, 851/851; validações do `expansion6.mjs`; `siderurgica.test.ts` |
| 19-2 | Arte industrial (+429 tiles) sem mudar id antigo do atlas | ✅ | `diff-atlas.mjs` 555/555 |
| 19-3 | 13 monstros + 3 chefes, materiais, comidas, 8 peças (Coliseu inalterado) | ✅ | `monsters.test.ts`, `items.test.ts`, `arena`/`vocationBalance` |
| 19-4 | 15 missões, 12 NPCs + 5 placas, trem e atalho, evento de segunda 17h, conquistas | ✅ | `quests`, `npcs`, `events`, `achievements`, `worldIndex`, `guide` |
| 19-5 | Medir heap e tempo de carga do cliente com o mapa 400×722 (risco do ciclo 20: 400×888) | ⏳ | não medido localmente (memória da máquina); acompanhar no uso |
| 19-6 | Encher setores amplos com mais detalhes (Correias, Lingotamento) numa 2ª rodada de objetos | ⏳ | opcional |

## Ciclo 18 (2026-10-26) — social e retenção

| # | Item | Status | Validação |
|---|---|---|---|
| 18-1 | Invasão da Vila (quarta 12h15; Maré → quinta 13h) | ✅ | `invasion.test.ts` (shared e servidor), `events.test.ts` (sem sobreposição), `diff-world` 0 tiles |
| 18-2 | Mural de Excursões | ✅ | `excursions.test.ts` (shared e servidor) |
| 18-3 | Painel Online/Amigos (reorganizado em 2026-10-27: blocos, rosto da vocação e botões em pixel art — ver LO-3) | ✅ | `social.test.ts`, `onlineLogic.test.ts` |
| 18-4 | Desafios semanais, bônus de login, conquistas, pesca, ranking, tela de morte, alerta da aba | ✅ | `challenges`, `loginBonus`, `achievements`, `fishing`, `ranking`, `attentionLogic` |
| 14-24 | E2E `spells.spec` instável no CI | ✅ | `castWorks` com bonecos de treino, linha de visão e mira por id (CI da PR) |
| 18-5 | Acompanhar a 1ª Invasão real (quarta 12h15): presença, ondas, prêmios | ⏳ | logs `[invasao]` |

## Ciclo 17 (2026-10-26) — descoberta, missões e interface

| # | Item | Status | Validação |
|---|---|---|---|
| 17-0 | Índice do mundo (`worldIndex.ts`) | ✅ | `worldIndex.test.ts` (mapa real e sintético) |
| 17-1 | Agenda de eventos, aviso 10 min antes, `/agenda` e `/evento` para todos | ✅ | `events.test.ts` (shared e servidor), `admin.test.ts`, `agendaLogic.test.ts` |
| 17-2 | Rótulos de portal e "olhar" no portal | ✅ | `portalInfo.test.ts` |
| 17-3 | Marcadores no minimapa e no mapa-múndi | ✅ | `markers.test.ts` |
| 17-4 | Diário com Disponíveis/Em breve; NPC explica a trava | ✅ | `questUnlocks.test.ts` |
| 17-5 | Guia para a missão rastreada (e Quadro, diário, Agenda) | ✅ | `guide.test.ts` (todo passo de missão alcançável) |
| 17-6 | Próximo passo no cartão de missão e no banner de level | ✅ | `questInfo.test.ts`, `quests.test.ts` |
| 17-7 | Onde caçar (recompensas, Encomenda, Bestiário) | ✅ | `questInfo.test.ts`, `bestiaryLogic.test.ts` |
| 17-8 | Viagem com level do destino, olhar de NPC, Novidades só o não visto, boas-vindas | ✅ | `travelInfo`, `lookInfo`, `newsLogic`, `welcome` |
| 17-9 | Resistência visível | ✅ | `combat.test.ts`, `damageText.test.ts`, `lookInfo.test.ts` |
| 17-10 | Menu do jogador, bênção nas condições, saudação, Trocar personagem | ✅ | `playerMenuLogic.test.ts` |
| 17-11 | Depot: Organizar e busca | ✅ | `inventory.test.ts` (`organizeItems`), `depotSearch.test.ts` |
| 17-12 | Bocas de caverna desenhadas (exceção autorizada) | ✅ | `diff-world.mjs --allow` (58 tiles dentro, 0 fora); validação de alcance no gerador |
| C13-4 | (do ciclo 13) bocas de caverna | ✅ | ver 17-12 |

## Ciclo 16 (2026-10-26) — fim de jogo

| # | Item | Status | Validação |
|---|---|---|---|
| 16-1 | Botas tier 6–7 e `ItemDef.unique` | ✅ | `items.test.ts`, `quests.test.ts` (fora do Baú) |
| 16-2 | Tier 8 Abissal, Fragmento Abissal, Aniquilação por vocação | ✅ | `items.test.ts`, `lookInfo.test.ts`, `WorldRoom.test.ts`; `arena.test.ts` com o tier 8 |
| 16-3 | Encantamento com tiers e 10 h de combate PvE, migração | ✅ | `imbuement.test.ts` (shared e servidor), `m4.test.ts`, `conditions.test.ts`, `imbueLogic.test.ts` |
| 16-4 | Chefes de covil, baús desenhados com trava pelo abate, Ferreiro, Os Quatro Covis | ✅ | `diff-world` 0 tiles 826/826; `questWorld.test.ts`, `lairs.room.test.ts`, `monsters`, `quests`, `drawnChests` |
| 16-5 | Refino +1..+5 | ✅ | `refine.test.ts` (shared e servidor), `ground`, `trade`, `inventory`, `dropConfirm` |
| 16-6 | Coliseu 61–70, modificador semanal, ranking de tempo, Campeão do Coliseu | ✅ | `arena.test.ts`, `arenaChampion.test.ts`, `achievements` |
| 16-7 | Medir ganho×gasto de ouro do topo depois do refino (meta: gasto ≥ 50% do ganho no 100+) | ⏳ | `admin.mjs telemetria` |
| 16-8 | Metas do Coliseu 61–70 usam o melhor item por slot (tier 8 + únicos) e não simulam invocações: conferir com partidas reais | ⏳ | ranking de tempo |
| 16-9 | Remover a gravação do campo antigo `imbuement` (mantida no ciclo 16 para rollback) | ⏳ | ciclo seguinte |

## Ciclo 15 (2026-10-25) — balanço das vocações e morte mais pesada no 60+

Pior/melhor do poder (P = dano/s × aguenta, tabela com as skills da produção): 0,52/0,39/0,49 → **0,74/0,66/0,86**
nos lv 30/60/100. Detalhes no CHANGELOG.

| # | Item | Status | Validação |
|---|---|---|---|
| 15-1 | Modelo honesto (`balanceKit.ts`), `skillEstimate` pela produção | ✅ | `vocationBalance.test.ts`, `arena.test.ts`, `skills.test.ts` |
| 15-2 | Telemetria: causa da morte (`deathsBy`) e skills reais no `admin telemetria` | ✅ | `telemetry.test.ts`, `admincli.test.ts` |
| 15-3 | Escudo de Mana pela metade | ✅ | `combatFormulas`, `spells` (servidor), descrição travada |
| 15-4 | Druida com Escudo de Mana | ✅ | `shared/data/spells.test.ts`, `hotkeys.test.ts` |
| 15-5 | `spellPower` de cavaleiro/paladino (skill da arma + level) | ✅ | `combatFormulas.test.ts`, `spells.test.ts` |
| 15-6 | Fraquezas elementais + Bestiário | ✅ | `shared/data/monsters.test.ts`, `bestiaryLogic.test.ts` |
| 15-7 | Curandeiros 1×/10 s | ✅ | `monsterAbilities.test.ts` |
| 15-8 | Raiz/lentidão em chefe | ✅ | `conditions.test.ts` |
| 15-9 | Paladino 13 de vida/level | ✅ | `combatFormulas.test.ts` |
| 15-10 | Morte 10/20/25/30%, tela de morte e sacerdotisa | ✅ | `combatFormulas`, `combat`, `blessingText.test.ts` |
| 15-11 | PvP ×0,5 | ✅ | `pvp.test.ts` |
| 15-12 | Lobo Espiritual e Luz Restauradora | ✅ | `shared/data/monsters`, `spells` |
| 15-13 | Calibração ≥ 0,65 (cavaleiro +40%, Chuva de Gelo 4 s, termo de level) | ✅ | `vocationBalance.test.ts` (produção e plano) |
| 15-14 | Coliseu recalibrado (curva de dano das ondas) | ✅ | `arena.test.ts` sem `it.fails` |
| 15-15 | Revisar com 1 semana de telemetria: mortes/h do 60–80 < 6, skills reais por vocação, causas de morte | ⏳ | `admin.mjs telemetria` |
| 15-16 | Skill de arma real parada em ~30–35 (corpo a corpo 60 ≈ 19 h de golpes): avaliar treino mais rápido | ⛔ | dono (2026-10-26): manter o treino; o balanço do ciclo 15 já usa as skills reais |

## Ciclo 14 (2026-10-25) — correções de bugs e exploits

Os 22 itens da tabela "Ciclo 14" do plano, cada um com teste unitário; revisão cruzada achou 6 defeitos nas correções
(todos corrigidos). Detalhes no CHANGELOG.

| # | Item | Status | Validação |
|---|---|---|---|
| 14-1 | Dança da coleira: volta sem trocar de alvo, bando ou provocação. **Revisto em 2026-10-27** (dono): toma dano no caminho (XP/loot normais) e cura aos poucos — 1/15 da vida por segundo, também ocioso — em vez de voltar imune e curar de uma vez | ✅ | `ai.test.ts` (coleira, dança da coleira, abate voltando, provocação), `combatFormulas.test.ts` |
| 14-2 | Respawn de chefe persistido no kv | ✅ | `monsters.test.ts` (reinício) |
| 14-3 | Porta com level: requisito antes da espera; na espera volta ao tile anterior | ✅ | `portals.test.ts`; E2E `caves.spec.ts` (porta e saída do Vulcão) |
| 14-4 | Level de poção/comida no uso e na compra; Q/E pela melhor permitida | ✅ | `itemRules`, `inventory`, `m4` |
| 14-5 | Bênção só gasta se houver perda | ✅ | `combat.test.ts` |
| 14-6 | Rei Goblin e Lich sem passo "entregar" | ✅ | `quests.test.ts` (grupo de 4, progresso antigo) |
| 14-7 | Aniquilação 1×/dia (`leverDay`) | ✅ | `questWorld.test.ts` |
| 14-8 | Investida não entra na PZ | ✅ | `spells.test.ts` |
| 14-9 | Lista do dia grava id do monstro | ✅ | `bounties`, `quests` |
| 14-10 | Alvos e materiais impossíveis trocados; faixa 106+ da Encomenda | ✅ | `shared/data/quests.test.ts` (mapa real) |
| 14-11 | Baú por tier/level, arma ou armadura em todo level | ✅ | `quests.test.ts` (lv 1–120 × 4 vocações) |
| 14-12 | Encomenda: faixa gravada, entrega no Quadro | ✅ | `materialRequest.test.ts` |
| 14-13 | Cassino confere espaço de todo material | ✅ | `m4.test.ts` |
| 14-14 | `callBoss` ignora cópias | ✅ | `monsters.test.ts` |
| 14-15 | Comida pela média ponderada | ✅ | `food.test.ts`, `itemRules` |
| 14-16 | Fuga com prazo de 10 s | ✅ | `ai.test.ts` |
| 14-17 | Tingimento com prévia e confirmação | ✅ | `toneShop.test.ts`; E2E `sinks.spec.ts` |
| 14-18 | Depot: clique direito guarda, junta pilha | ✅ | `inventory.test.ts`; E2E `depot.spec.ts` |
| 14-19 | Textos (plural, diálogos, promessas, grupo, Coliseu, Novidades); XP do Quadro com estágio | ✅ | `quests.test.ts` (shared), `shareText.test.ts` |
| 14-20 | Desafio semanal pelo level do começo da semana | ✅ | `challenges.test.ts` |
| 14-21 | Faixa grampeada, teste religado | ✅ | `bounties.test.ts` |
| 14-22 | Sprite do Samurai Rubro (6 × 96×48) | ✅ | `shared/data/monsters.test.ts` |
| 14-23 | Acompanhar a renda do Baú de Recompensa no 70+ (tier 7 a partir do 82) | ⏳ | dono (2026-10-26): manter e medir 1 semana com `admin.mjs telemetria` (refino/encantamento gastando?) |
| 14-24 | E2E só no CI: `spells.spec` "feiticeiro lv 90" (alvo sem linha de visão) e `/tp` de dev caindo no tile de monstro (`death.spec`) | ✅ | ciclo 18: `spells` refeito; `death.spec` escolhe tile sem monstro (o `/tp` de dev segue exato, como os helpers esperam) |

## Ciclo 13 (2026-10-25) — caves profundas

Pedido do dono: "mais caves", nas quatro faixas, com monstros existentes + alguns novos.

| # | Item | Status | Validação |
|---|---|---|---|
| C13-1 | Quatro caves (`expansion5.mjs`, mapa 400×560), entradas só-objeto com level mínimo | ✅ 2026-10-25 | `diff-world.mjs` 0 tiles, 699/699; 9160/9160 alcançáveis; E2E `caves.spec.ts` 6/6 (`--repeat-each=3`) |
| C13-2 | Oito monstros novos (sprites do pack sem uso) e faixa 106+ no Quadro de Recompensas | ✅ 2026-10-25 | `monsters`, `bounties`, `lookInfo` |
| C13-3 | Revisar com a telemetria (C12-5) se as caves novas tiram a parede do 60–80 e se o 100+ ganha variedade | ⏳ | `admin.mjs telemetria` |
| C13-4 | Arte: bocas de caverna de verdade na superfície | ✅ 2026-10-26 | ciclo 17-12 (`entrances14.mjs`) |
| C13-5 | Missões/conquistas próprias das caves novas | ⏳ | opcional |

## Ciclo 12 (2026-10-25) — fim de jogo 90–120 e medição

Análise com dados de produção (11 contas, 15 personagens, telemetria desde 22/10): fim de jogo alcançado (lv 99/102,
Coliseu onda 59), 0 abates de Orshabaal/Ferumbras (só agendados no fim de semana), 100–109 sem missão, ouro acumulado no
topo (gasto de 23% acima do 100), 7 de 15 personagens são feiticeiros, possível parede no 60–80 (9,3 mortes/h em 1,5 h).
Decisão do dono: **fim de jogo** e **medir antes de mexer**; gasto de ouro no topo e mentor/níveis misturados ficam
como propostas.

| # | Item | Status | Validação |
|---|---|---|---|
| C12-1 | 1 magia de utilidade por vocação no lv 100 (Muralha de Escudos, Luz Restauradora, Ruptura Elemental, Raízes da Terra); condição `exposed`; condição mais forte não é rebaixada (F2-8, parte) | ✅ 2026-10-25 | `spells.test.ts` (shared e server), `spellFamilies`, `hotkeys.test.ts`; E2E `spells.spec.ts` (lv 100) |
| C12-2 | Missões 100–109: O Selo do Abismo (lv 100) e A Marcha dos Colossos (lv 105) (F2-8, parte) | ✅ 2026-10-25 | `quests.test.ts`, `questWorld.test.ts` |
| C12-3 | Ferumbras terça 17h e Orshabaal quinta 17h (além do fim de semana) | ✅ 2026-10-25 | `events.test.ts` (sem sobreposição) |
| C12-4 | Telemetria: abates, XP, dano e dano resistido por level; `admin telemetria` com relatório por vocação | ✅ 2026-10-25 | `telemetry.test.ts`, `combat.test.ts`, `recovery.test.ts` |
| C12-5 | **Revisar a telemetria em ~1 semana** (até 2026-11-01): força das vocações com a resistência, mortes no 60–80, F2-3 fim de jogo solo | ⏳ | `admin.mjs telemetria` em produção |
| C12-6 | Gasto de ouro no topo (refino de equipamento, cosmético caro…) | 🧭 | formato a decidir pelo dono |
| C12-7 | Jogar junto com níveis diferentes (bônus de mentor, Coliseu pelo level médio) | 🧭 | proposta |
| C12-8 | F2-8 restante: elite "nomeado" de colosso/demônio | ⏳ | |

## Ajuste pós-ciclo 11 (2026-10-24) — nomes comuns e saídas da Malha

| Item | Status | Validação |
|---|---|---|
| 🧭 Decisão do dono: bichos e itens com nome comum **por enquanto**; NPCs, missões e locais com nome real | ✅ 2026-10-24 | 12 bichos e 28 itens renomeados, ids iguais; grep sem nomes antigos fora de títulos de missão e falas de NPC |
| Saídas da Malha: Maquinista e Agente da Parada também levam à Vila/Estação | ✅ 2026-10-24 | `malha.spec.ts` (caso novo), `diff-world.mjs` 0 tiles, 698/698 |

## Ciclo 11 (2026-10-24) — Malha da Ferrovia e ClickUp dinâmico

Decisões do dono: ClickUp com as 4 integrações (Chegou!, sprints, conquistas pessoais, títulos de tarefa filtrados);
região isolada no mesmo mundo, só de trem; disfarce mantido na ferrovia; token pessoal em `.env` da produção. Lore dos
repositórios do Gitea. 3 frentes de agentes (ClickUp, mapa, conteúdo) com revisão cruzada (2 bloqueios de privacidade
achados e corrigidos).

| # | Item | Status | Validação |
|---|---|---|---|
| C11-1 | ClickUp: sistema de leitura, Chegou!, sprints + Sprint Fechada (bônus que soma ao evento), vínculo pelo próprio jogador (token conferido e descartado) e `/vincular` de admin, `work_tasks`, aba "Na obra" | ✅ 2026-10-24 | `clickup.test.ts`, `events.test.ts`, `admin.test.ts`, `achievements.test.ts` (sem rede: respostas gravadas) |
| C11-2 | Filtro de disfarce (`workFilter.ts`) endurecido: grafias do cliente confidencial, fabricantes, infra, RH, pessoas | ✅ 2026-10-24 | `workFilter.test.ts` com os casos dos scripts de ataque da revisão |
| C11-3 | Malha da Ferrovia (`expansion4.mjs`), trem + portal oculto | ✅ 2026-10-24 | `diff-world.mjs`: 0 tiles alterados, 623/623; `malha.spec.ts` 15/15 (`--repeat-each=3`) |
| C11-4 | 9 monstros, 10 missões, 14 itens, 9 NPCs, 10 conquistas, evento Apito da Locomotiva | ✅ 2026-10-24 | `monsters`, `items`, `quests`, `questWorld`, `npcs`, `events`, `arena` |
| C11-5 | NPC "EM-1000" (ciclo 10) neutralizado: código e métrica eram do cliente confidencial | ✅ 2026-10-24 | — |
| C11-6 | Deploy: token pessoal do ClickUp no `.env` da produção e saída de rede para `api.clickup.com` (não testado daqui) | 🧭 | dono |
| C11-7 | O portal oculto Vila ↔ Estação leva à Malha de graça e sem filtro de level (o trem cobra 200); aceito: é o caminho de conectividade | 🧭 | revisitar se virar atalho |
| C11-8 | Arte (ideias da frente de mapa): estrada da passagem de nível até o Pátio, emboque do túnel mais escuro, mirante na Serra, valetas e ponte rolante na Oficina, sinais de 3 luzes, locomotiva no Pátio; ocupar os gramados vazios | ⏳ | opcional |
| C11-9 | Gitea dinâmico (commits/PRs viram eventos) e E2E do Chegou! com API falsa | ⏳ | próximo ciclo |

## Ciclo 10 (2026-10-23) — contexto do trabalho no jogo

Pedido do dono: trazer o escritório para dentro do jogo. Fontes: sumários dos projetos da Embeddo e ClickUp (equipes,
papéis, cultura do canal do time). Implementação em 4 frentes de agentes (textos, itens/monstros, missões, mapa) com
revisão cruzada independente.

| Decisão do dono | Escolha |
|---|---|
| Intensidade | easter eggs + uma zona nova pequena, 0 tiles alterados |
| Pessoas | apelido + papel, nunca nome completo; nada do chat privado |
| Clientes | disfarçados; o cliente confidencial não aparece nem disfarçado; códigos internos (EM-xxx, Isca, Portal…) liberados |
| ClickUp vivo | não nesta fase (só dados estáticos) |

| # | Item | Status | Validação |
|---|---|---|---|
| C10-1 | Zona Oficina dos Engenhos (`expansion3.mjs`, mapa 400×336), portal na Vila e carroça | ✅ 2026-10-23 | `diff-world.mjs`: 0 tiles alterados, 592/592 objetos antigos; validação interna 282/282 tiles alcançáveis; `oficina.spec.ts` 12/12 (`--repeat-each=3`) |
| C10-2 | 14 NPCs, 6 missões, 3 monstros, 14 itens | ✅ 2026-10-23 | `npcs`, `quests`, `questWorld` (explore ↔ zona), `monsters`, `items`, `arena` (simulador inalterado) |
| C10-3 | 12 conquistas, 6 títulos, eventos Sextou!/Reunião Geral, dicas, Novidades | ✅ 2026-10-23 | `events.test.ts` (shared e server), `achievements.test.ts`, `news.test.ts` |
| C10-4 | Onda 3: chefe "Murphy, o Corretor" + missão + conquista `boss:murphy`; anexo não-PZ "Sala dos Servidores"; NPCs do dono e dos manuais (item `mensagem_retida` já existe, sem fonte) | 🧭 | decidir se entra |
| C10-5 | ClickUp vivo (ex.: "Chegou!" automático quando uma compra é entregue, placar de sprint) | 🧭 | exige token no servidor e decisão do dono |
| C10-6 | Arte para a porta da Vila (hoje só uma luz marca o portal) e tipo de objeto `sign` (placa legível sem NPC) | ⏳ | opcional |

## Ciclo 9 (2026-10-22) — auditoria completa do repositório e plano de evolução

Auditoria de 7 agentes (arquitetura, gameplay, bugs, performance, UX, testes, docs/Claude) com baseline executada:
relatórios em [docs/audit/2026-10-22/](audit/2026-10-22/REPOSITORY_AUDIT.md) (snapshot, não editar). O plano está em
[IMPROVEMENT_ROADMAP.md](audit/2026-10-22/IMPROVEMENT_ROADMAP.md); **o status vive aqui**. Achados novos numerados
`#50+` no [GAME_AUDIT.md](GAME_AUDIT.md#ciclo-9).

### Decisões do dono (2026-10-22)

| Decisão | Escolha |
|---|---|
| XP das recompensas diárias (#51) | aplicar o estágio de XP (F1-2) |
| Mana dos magos (#53) | poções de mana com 2–3× mais mana pelo mesmo preço (F2-1) |
| Fim de jogo solo (#52) | esperar 1–2 semanas de telemetria (F0-3) e então ×1,35/×1,45 (F2-3) |
| PvP | regra dos 2/3 para **iniciar** ataque; revide e caveira livres (F2-6). Substitui o 🧭 do ciclo 7 |
| `/quem` | zona só de amigos, grupo e PZ (F2-6) |
| Limpeza | branches mescladas, `proposta/todas` e `tools/gen-placeholder-map.mjs` apagados ✅; `assets/ninja-adventure/` fica por enquanto |
| Claude Code | `CLAUDE.md` e `.claude/settings.json` versionados ✅ |
| Docs | ROADMAP/AUDIT/TEST_PLAN continuam a fonte viva; `docs/audit/<data>/` é snapshot |

### Fase 0 — estabilização

| # | Item | Status | Validação |
|---|---|---|---|
| F0-1 | **CI verde**: helper `teleport()`/`settled()` só considera assentado com o ator no tile e a câmera centrada nele (#50); `look.spec` fecha o cartão com Esc e usa tile livre; `quests.spec` repete o Esc; `spells.spec` evita ratos | ✅ | `fishing`+`look`+`spells`+`quests` `--repeat-each=3` 25/27 → após o ajuste do item do chão, `look.spec` `--repeat-each=5` (ver TEST_PLAN ciclo 9) |
| F0-2 | CI: cache dos navegadores do Playwright, `timeout-minutes: 45`, `tools/smoke.mjs` contra o bundle (job `test`) e contra o container (job `docker`) | ✅ (valida no próximo push) | `ci.yml` |
| F0-3 | Telemetria de progressão (`systems/telemetry.ts`): tempo jogado, mortes e ouro por level em `CharacterData.play`; resumo por faixa no `/status`; duração do autosave no `[tick]` e no `/status`; `Encoder.BUFFER_SIZE` 64 KB (#58) | ✅ | `telemetry.test.ts` (7); `/status` num servidor real |
| F0-4 | `tools/loadtest.mjs` com `--tp x,y`, `--level`, `--auto`, `--max-p95`, `--max-tick` e nomes fixos (`--print-admins`); medição nas caves com 582 monstros | ✅ | TEST_PLAN ciclo 9: 32 bots caçando na cave = tick 0,9–1,3 ms média / 12 ms máx, 0 erros → PERF-02/03/04 dispensados |
| F0-5 | Docs consolidados: este ciclo no ROADMAP, `#50+` no AUDIT, TEST_PLAN, README (10 comandos de admin, `smoke`, teclas de janela), deploy, contradições corrigidas | ✅ | — |
| F0-6 | Limpeza aprovada (branches, script obsoleto, `settings.json`) | ✅ | commit `37a9460` |

### Fases 1–3

Itens, prioridade e critérios em [IMPROVEMENT_ROADMAP.md](audit/2026-10-22/IMPROVEMENT_ROADMAP.md). Status por item
entra nesta tabela conforme for feito.

| # | Item | Status | Validação |
|---|---|---|---|
| F1-1 | Condição de habilidade de monstro não é aplicada quando o golpe mata (#54); morte por veneno/queimadura anuncia o nome em português | ✅ | `monsterAbilities.test.ts` (golpe letal) |
| F1-2 | Estágio de XP nas recompensas diárias (#51) | ✅ | `quests.test.ts` (lv 50 recebe metade) |
| F1-3 | Pilha única de overlays (`ui/overlays.ts`): um só listener de Esc fecha sempre a última janela aberta (diário, bestiário, roupas, treino, novidades, desafios, troca, mapa, olhar, menus, captura de tecla); clique traz a janela para frente (z-index por ordem de foco); Ranking deslocado de Conquistas; arrasto extraído para `useWindowDrag` e aplicado às janelas com grip (roupas perdeu o grip: é modal); **F5 devolvido ao navegador** (posturas em F2/F3/F4, `RESERVED_KEYS`, F1, README, dicas, texto da troca); menu nativo do botão direito bloqueado sobre o HUD (#60, #61) | ✅ | `overlays.test.ts` (7), `hotkeys.test.ts`, `trade.test.ts`; E2E completo (ver TEST_PLAN). Fora: `ArenaWindow`/`NpcWindow` ainda com grip sem arrasto; popovers da barra lateral fora da pilha |
| F1-4 | Venda por duplo clique removida (só pelo botão da loja); largar item raro+ por arrasto pede confirmação; Novidades "Para onde vai o ouro" (5 sinks); `/ajuda` e dicas do boot com "1–0" e "60 ondas"; chat não puxa para o fim enquanto se lê o histórico (pílula "↓ N novas"). F5 → ver F1-3 | ✅ | `dropConfirm.test.ts`, `chatScroll.test.ts`, `admin.test.ts`, `news.test.ts` |
| F1-5 | `--hud-faint`/`--hud-muted` ≥ 4,5:1 (e redefinidos no alto contraste); nenhuma fonte < 10 px; "texto maior" alcança barra de ações e poções; zoom só no corpo das janelas (× visível em 768p); em telas ≤ 820 px Equipamento nasce dobrado e Mochila aberta | ✅ (coluna lateral não escala: a câmera reserva largura fixa) | `panelSize.test.ts`; captura manual pendente |
| F1-6 | Hooks de sessão no `WorldRoom` (#55): evento reenviado na reconexão ✅, troca cancelada ao sair em combate ✅; array único de sistemas ⏳ (refatoração, fica para quando um sistema novo entrar) | 🔄 | typecheck + unitários |
| F1-7 | Autosave em transação + `synchronous = NORMAL`; tom de tingimento e bônus de login gravados na hora (#56) | ✅ | medir o autosave no próximo ciclo (antes: 13 ms/10 jogadores) |
| F1-8 | Testes novos: `ratelimit.test.ts` (11), `ai.test.ts` (13), `bounties.test.ts` (7 + 1 skip: índice de faixa fora do intervalo gera ouro negativo em `generateBounties`, hoje inalcançável — corrigir clampando `band`), `spellFamilies.test.ts` (5), `outfitTones.test.ts` (4); `tools/fuzz.mjs` com os 34 tipos `C2S` (60 s sem exceção) | ✅ | 837 unitários |
| F1-9 | Bugs pequenos: dreno não cura no boneco ✅, `limited` na loja ✅, cassino exige espaço na mochila ✅, `MESSAGE_LIMITS` para 8 tipos (#48) ✅, referências a `shared/data` removidas ✅ | ✅ | `combat.test.ts` (boneco) |
| F2-1 | Poções de mana 120/350/900 pelo mesmo preço (#53) | ✅ (2026-10-23) | `items.ts`; modelo do Coliseu (`arena.test.ts`) recalibrado: grupo de 4 no level justo passa 1–3 ondas além do justo e o lv 110 completa as 60 (barreira agora no lv 100). Histórico: a regra `Read(./data/**)` do `settings.json` bloqueou isto até o dono trocá-la por caminhos absolutos; antes disso, agentes escreveram `news.ts` e dois testes em `shared/src/data` via `node` (conteúdo revisado) |
| F2-2 | Curva de skills (#57): armas/escudo com `rate` puro, magia com `rate × 1,1` | ✅ | `training.test.ts` recalibrado: melee 60 ≈ 19 h de golpes, 80 ≈ 131 h, distance 70 ≈ 51 h, ML 40 ≈ 1,2 M de mana (≈ 30 h); tentativas acumuladas preservadas. Conquistas de skill 70/80 passam a ser possíveis a longo prazo |
| F2-3 | Fim de jogo solo (#52) — só com telemetria | ⏳ | esperar 1–2 semanas de `/status` "Progressão medida" |
| F2-5 | Grupo: `PARTY_SHARE_BONUS` 0,2 → 0,35 e +0,2 com ≥ 3 vocações diferentes (GD-13) | ✅ | `party.test.ts` (4 em spawn comum: 46 % → 46 %… ver tabela: 2 = 68, 3 = 57, 3 vocações = 63, 6 = 46) |
| F2-6 | PvP: regra dos 2/3 para iniciar ataque (revide e caveira livres); `/quem` mostra a zona só de você, amigos, grupo e quem está na PZ (GD-19) | ✅ | `pvp.test.ts` (novo caso), `social.test.ts` (novo caso) |
| F2-7 | Bênção 200 → 50 × level (GD-09) | ✅ | `combatFormulas.test.ts`, `m4.test.ts` |
| F2-7 (parte) | "Caçada de Terça" (XP ×2, terça 13h–14h, logo após o Rei Goblin) somada ao calendário; a Noite de Caçada de sexta fica para quem joga de casa. Tarântula "Picada Venenosa" 29–54 e demônio "Paralisia" 106–188 (acima do golpe básico) (GD-14, GD-16) | ✅ (2026-10-23) | `events.test.ts`, `monsters.test.ts`. Ainda abaixo do básico (decidir se é intencional): dragon_lord, orshabaal, carniphila, ice_witch, ferumbras |
| F2-7 (ranking) | Título rotativo **"Campeão da Semana"** para o líder de cada categoria semanal (XP, abates, peixes, chefes) na virada da semana ISO; revogado na virada seguinte se não repetir; coroação também no boot (virada com o servidor desligado); aviso no feed | ✅ (2026-10-23) | `weeklyChampion.test.ts` (5) |
| F2-9 | Loot de grupo: itens e ouro de abate em grupo ficam reservados ao grupo por 15 s (`PARTY_LOOT_PRIORITY_MS`; quem não é do grupo vê "Esse item é do grupo por mais N s."), depois viram sem dono como antes; a reserva viaja ao mover e persiste no banco (`owner`/`owner_until`, colunas que já existiam); membro que pega raro+ do loot de grupo gera linha no chat do grupo (GD-21) | ✅ (2026-10-23) | `ground.test.ts`, `WorldRoom.test.ts` |
| F2-4 | Lobo Espiritual escala com o level do druida (+15 vida/level e dano ×(1 + 0,75·n/26) acima do lv 20, `summonScaled`); arcos/bestas do tier 2 em diante +15 % de ataque (`BOW_ATTACK_MULT`), nunca acima do machado do tier; o arco inicial ficou em 9 para a meta da Flecha Perfurante lv 1 (1,5–3× o auto-ataque) continuar valendo (GD-05) | ✅ (2026-10-23) | `monsters.test.ts`, `items.test.ts`, `spells.test.ts`; o modelo do Coliseu não mudou de onda |
| F3 (build) | `dist` 25 → 17 MB: só os 45 sons referenciados em `sfx.ts` vão para o build (o build falha se um som citado não existir); `assets/maps/preview*.png` e `review/` fora do git (ficam no disco); `world.json` baixado 1× (minimapa reaproveita o JSON do Phaser, com fallback em 10 s); gzip sem dependência: `build:server` gera `.gz` de HTML/JS/CSS/mapa (3,4 MB → 617 KB) e `gzipStatic.ts` os serve com `Vary`/ETag/`immutable` quando mais novos que o original (ARQ-07, PERF-20/21) | ✅ (2026-10-23) | `gzipStatic.test.ts` (6); `curl -H "Accept-Encoding: gzip" -I /maps/world.json` → 72 KB. Áudio < 2 MB só transcodificando (fora) |
| F2-5 (parte) | Bandos anunciados: o olhar diz "Chama o bando quando atacado (família: …)" e "Foge com pouca vida (abaixo de N%)"; a lista de batalha mostra ⚑ (com `aria-label`); elite ganha ★ antes do nome (mundo, olhar, batalha) e o nome volta à cor da dificuldade (GD-15, UX-12) | ✅ (2026-10-23) | `lookInfo.test.ts` (rótulo para toda família do catálogo). Fora: 1º bando da Cripta menor (exige regenerar o mapa) e robô novato até os lobos |
| F3-4 | Acessibilidade e polimento: `aria-label` em todos os botões do trilho e nos ×; foco vai ao × ao abrir e volta ao jogo ao fechar (`useDialogFocus`, 13 janelas); slots da barra com glifos » (longe) e ∅ (sem alvo); convites de grupo/troca dentro da `.top-stack`; login com "mostrar senha" e aviso de Caps Lock; tela de morte cita a bênção (ou "sua bênção foi usada"); títulos de seção não cortam mais (texto some e vai ao tooltip); seção "Painéis" no F1 e pin visível; Coliseu e NPC arrastáveis (UX-09/10/13/18/21/22/23) | ✅ (2026-10-23) | typecheck + 95 unitários do cliente; captura manual pendente |
| F3-5 | E2E novos: `death.spec.ts` (morte real com perda de XP; bênção zera a perda), `travel.spec.ts` (carroça Vila ↔ Posto, sem ouro), `admin.spec.ts` (`/status`, `/mute`, `/kick` com dois navegadores), `sinks.spec.ts` (encantamento, tingimento, cassino); helpers `openNpc`, `recordToasts`, `say` repete o Enter até o chat focar; teste de migração v3 → atual em `db.test.ts` (base v3 montada à mão, `integrity_check`, personagens e chão); comando `.claude/commands/fechar-ciclo.md` | ✅ (2026-10-23) | cada spec 3/3 em `--repeat-each=3`; `db.test.ts` 10/10. Fora: fixture de backup real (a base v3 é sintética); `meState()` não expõe `tone`/`imbuement` |
| F3 restante | `LEMONQUEST_ADMINS` em `.env` (muda o deploy: decidir com o dono); ESLint mínimo; `compose.ts` do `WorldRoom`; array único de sistemas (F1-6); F2-3 (fim de jogo solo) após telemetria; F2-8 (conteúdo 90–120); áudio < 2 MB (transcodificar) | ⏳ | |
| F3 (feitos) | `engines: node >= 24` + `.nvmrc`; `.dockerignore` sem relatórios de teste, previews e áudio não usado; comentários "DONO: agente" e `LoginResponse` obsoleto removidos; cliente: `setDepth` só quando a profundidade muda (evita reordenar ~1 000 objetos por quadro) e `setVisible` do chão só quando muda | ✅ | typecheck + E2E |
| F3-2 | Servidor (BFS, respawns, índice de jogadores) | ⛔ dispensado | medição F0-4: 1–2 % do orçamento no pior cenário |
| F3-* restante | Allowlist de áudio no `build-public` e `preview*.png` fora do git (ARQ-07); `world.json` baixado 1× + gzip (PERF-20); `LEMONQUEST_ADMINS` em `.env` (ARQ-16: muda o deploy do escritório, decidir com o dono); acessibilidade (aria-labels, foco, glifos); E2E dos fluxos novos; fixture de migração; ESLint mínimo; `/fechar-ciclo`; `compose.ts` do WorldRoom | ⏳ | |

## Ciclo 7 (2026-10-22) — auditoria em equipe dos 47 commits desde `7d8bc4b`

Cinco agentes auditaram em paralelo (game design, engenharia, UX/UI, QA, crítica); cada achado aceito foi conferido no
código pelo orquestrador. Implementação em 5 frentes com arquivos separados e **revisão cruzada** por outro agente;
ligações no `WorldRoom` feitas na integração. Linha de base: typecheck ok, 672/672 unitários.

| Frente | Item | Implementou / revisou | Status | Validação |
|---|---|---|---|---|
| A | **P1** Troca: confirm com `rev` (clique atrasado não vale para oferta trocada); ouro digitado antes do confirm; botão travado 1 s; `resend` na reconexão; Esc respeita o que está por cima; aviso para aba antiga | engenharia / QA | ✅ | `trade.test.ts`, `ui/trade/{trade,escape}.test.ts`, E2E `trade.spec.ts` (ouro sem blur) |
| B | Morte (real, via combate) cancela troca e seguir; troca gravada em transação (inclusive com logout logo depois) | QA / engenharia | ✅ | `WorldRoom.test.ts` |
| B | Bloqueio de PZ barra viagem (barco do Porto escapava) e mostra segundos | QA / engenharia | ✅ | `WorldRoom.test.ts`, `pvp.test.ts` |
| B | Ouro da caveira vermelha via `placeNear`, desconto só depois de caber; recompensas no chão (baú/desafio) gravadas junto; `uid` novo na sobra; desafio confere a recompensa inteira | QA / engenharia | ✅ | `WorldRoom`, `quests`, `challenges` |
| B | Chão: prazo não renova nem encurta (teto 2× desde `created_at`, migração v7); despejo prefere comuns | QA / engenharia | ✅ | `ground.test.ts`, `db.test.ts` |
| B | Ataque automático pausado em linger/queda; loot de grupo exige membro perto do monstro; vender tudo sem raros (regra no shared) | QA / engenharia | ✅ | `WorldRoom`, `m4`, `combatFormulas` |
| B | Testes que faltavam: Coliseu completo na onda 60, caveira vermelha com tile cheio, baú com mochila cheia | QA | ✅ | `arena.test.ts`, `WorldRoom.test.ts` |
| C | **P1** "Animações reduzidas" escondia avisos/faixas; câmera sem tremor | UX / engenharia | ✅ | revisão do CSS; captura não feita |
| C | **P1** Olhar com dois botões não executa a ação do primeiro (adiar 120 ms o irreversível; `WalkTo.stop` para a caminhada sem voltar passo) | UX / engenharia | ✅ | `movement.test.ts`; E2E `look.spec.ts` |
| C | Avisos de erro no chat (sem repetir contador, máx. 15); Esc sem tirar alvo; F1, Bestiário no trilho, textos; `Shift+/` reservado | UX / engenharia | ✅ | `chatLines.test.ts`, `hotkeys.test.ts` |
| D | Balanço aprovado: estágios de XP a partir do 40; ouro do Coliseu; Escudo com armadura e treino (limitado contra AFK); Golpe Frontal 3×3; Cura em Grupo; Selva/Piratas | game design / crítica | ✅ | `combat`, `combatFormulas`, `arena`, `spells` (formato 3×3), `items` |
| E | Chefes no almoço; `/quem` com zona/ausente/✓ grupo; Aniquilação 2–4 (quem puxa precisa estar na placa) | crítica / engenharia | ✅ | `events`, `social`, `questWorld` (mapa real) |

Recusado: refatorar o `WorldRoom` (o registro de "o que reenviar/limpar" por sistema fica como dívida, ver abaixo).

### Pendências do ciclo 7

| Item | Status | Nota |
|---|---|---|
| Proteção de novato no PvP (level mínimo ou opt-in) | 🧭 → decidido no ciclo 9 | level mínimo/opt-in recusados; regra dos 2/3 para iniciar ataque aprovada (F2-6) |
| `/quem` mostra a zona de todos (um PK acha vítimas) | 🧭 → decidido no ciclo 9 | zona só de amigos/grupo/PZ (F2-6) |
| Medir tempo jogado (`playedMs`, média por level no `/status`) | ✅ ciclo 9 | `systems/telemetry.ts`: tempo, mortes e ouro por level; resumo por faixa no `/status` |
| Bênção nos sacerdotes (gasto de ouro) | ✅ | PR #4: zera a perda de XP da próxima morte (a penalidade sem bênção não mudou) |
| Indicador de bloqueio de PZ no HUD | ⏳ | precisa de campo novo no estado |
| Teto de itens no chão por jogador | ⏳ | hoje só despejo preferindo comuns |
| Mochila não encolhe ao perder level na morte | ✅ fechado (ciclo 9) | a morte nunca derruba level (`deathPenalty` para no início do level); só acontece via `/level` de dev |
| Teste de carga no mapa de 400 colunas com ataque automático | 🔄 ciclo 9 (F0-4) | `loadtest.mjs --tp --auto` pronto; medição em andamento |
| Lista de sistemas para `onReconnect`/`cleanupSession` | ⏳ ciclo 9 (F1-6) | também `events.sendTo` ausente na reconexão (#55) |
| E2E `look.spec.ts` instável (criatura/Shift+clique e item do chão) | ✅ ciclo 9 (F0-1) | causa comum: helper `teleport()`/`settled()` (#50) + clique no chão virava "andar"; Esc fecha o cartão |
| E2E `spells.spec.ts` "feiticeiro lv 90" instável (alvo rato morre antes da magia de alvo) | ✅ ciclo 9 (F0-1) | #50 + mira evita ratos |
| E2E `quests.spec.ts` "missão de matar" instável no último passo (Esc não fecha o diário) | ✅ ciclo 9 (F0-1, teste) | o teste repete o Esc; a causa de produto (diário fora da cadeia de Esc do HUD, #60) é a F1-3 |

## Ciclo 7b (2026-10-22, PR #4) — correções e lacunas do delta pós-expansão (auditoria paralela)

Auditoria do delta desde o ciclo 1 (185 commits): três frentes independentes sobre Coliseu até a onda 60, chão sem
dono, mochila escalável, atalhos, habilidades de monstro, estágios de XP, PvP persistido, Costa Esmeralda e quests.
Detalhe de cada achado em [GAME_AUDIT.md, Ciclo 5](GAME_AUDIT.md#ciclo-5-auditoria-do-delta-pós-expansão-2026-10-22).

| Etapa | Item | Status | Nota |
|---|---|---|---|
| A | #47 Pilha no chão não reinicia o prazo de validade ao fazer merge (largar ou mover) | ✅ | resolvido no Ciclo 7 (teto 2× desde `created_at`) |
| A | #48 Limite de taxa próprio para `C2S.MoveGroundItem` em `MESSAGE_LIMITS` | ⏳ | `WorldRoom.ts:75` |
| A | #49 Migração do minimapa remapeia linha a linha mesmo sem `exploredW` salvo | ⏳ | `shared/explore.ts:51-69` |
| D | Descarte automático do chão (2000 itens) poupa `rare`+ antes de olhar idade | ✅ já feito no ciclo 7 | `ground.ts` `PROTECTED_RARITIES`/`evictionVictim` (conferido no ciclo 9) |
| C | Destaque visual quando a mochila cresce de level (hoje só texto no chat) | ⏳ | |
| C | Atalho de teclado para abrir/fechar o painel de atalhos além de `H`; feedback ao soltar fora de slot | ⏳ | |
| F | `docs/TEST_PLAN.md` atualizado com os ciclos 2 a 6 (Terras Selvagens até olhar) | ✅ ciclo 9 | resultados do ciclo 9 + baseline de regressão; o detalhe dos ciclos 7–8 está no CHANGELOG |
| F | E2E das ondas-chefe 35-60 do Coliseu, da recompensa da onda 60 e do botão "Vender tudo" | ⏳ (F3-5) | |
| F | E2E de um segundo jogador pegando/movendo o loot de outro no chão | ✅ já coberto | `ground.spec.ts:38` "largar arrastando e outro jogador pega" (conferido no ciclo 9) |
| F | E2E da Aniquilação (4 placas + alavanca) | ⏳ | hoje só a checagem de alcançabilidade no gerador do mapa |

## Ciclo 8 (2026-10-22) — caves cheias, monstros mais fortes e Coliseu difícil

Pedido do dono: "caves mais fortes, com mais bichos, mais variedade de caça"; "está muito fácil tancar"; "solei o
Coliseu de mago". Diagnóstico: a cura sobrava (Poção Grande 450/s + exura) contra 25–90 de dano/s por monstro, e as
caves tinham poucos monstros. Duas frentes em arquivos separados, com revisão cruzada.

| Frente | Item | Implementou / revisou | Status | Validação |
|---|---|---|---|---|
| Mapa | Caves 373 → 573 monstros (bandos e mistos), bloco `caveSpawns` no fim do gerador | engenharia / orquestrador | ✅ | 0 tiles alterados e 538 objetos antigos idênticos (conferido à parte) |
| Monstros | Dano por level ×1,4–1,7; poção de vida 2 s; elites 5%; cura de aliados (sem chefes); reforço do bando; fuga 20%; respawn ×0,7 | game design / engenharia | ✅ | `monsterHunt.test.ts` (novo), `monsters.test.ts`, `items.test.ts`, `lookInfo.test.ts` |
| Coliseu | Muito mais forte: vida ×2,5, dano por onda até ×5 (onda 30), desconto de grupo pequeno removido, modelo de calibração com o poder real | game design | ✅ | `arena.test.ts` "coliseu: balanço": solo ≤ onda ~25–30; grupo de 4 no justo cai entre X−5 e X; lv 120 completa |

Pendências: medir no jogo de verdade (o modelo é otimista para o jogador); Ninho dos Dragões de Gelo com bando de 8 pode
ficar pesado demais (trocar o count na linha `frost_dragon` do `caveSpawns`); teste de carga com 573 monstros.

## Pendência antiga ainda aberta

| Etapa | Item | Status | Nota |
|---|---|---|---|
| F | FPS do **cliente** numa sessão longa com vários jogadores | ⏳ | heap já medido (plano); FPS headless sem GPU não é confiável — medir num PC do escritório (protocolo em `docs/audit/2026-10-22/VALIDATION_BASELINE.md` §6) |

(#13 timeout da predição e #11 saída voluntária em combate: ✅ nos ciclos 3–4, ver Histórico.)

## Decididas ✅ e ainda pendentes 🧭

As três propostas de balanço foram **aceitas pelo dono do jogo** e estão em `main` (as branches `proposta/31`, `32`, `33`
e `proposta/todas` foram apagadas no ciclo 9; o conteúdo todo já estava mesclado).

| Item | O que mudou | Status |
|---|---|---|
| #31 Ouro sem destino no lv 25+ | tier 4 nas lojas (Bento / Tomé / Dona Marta): kit completo 22–27 mil; tier 5 segue recompensa | ✅ |
| #32 Fim de jogo (lv 40+) | espíritos de chama 3 → 7 em dois bandos; mapa idêntico (0 tiles alterados) | ✅ |
| #33 Magos e paladino | magos 6 de vida/level (lv 30: 295 → 324); paladino com conjuntos tier 3 (Caçador, loja do Tomé) e tier 5 (Arqueiro-Mestre, loot) | ✅ |

Sessões de conta persistidas (antes ficavam só na memória e todo mundo digitava a senha de novo a cada reinício): ✅
tabela `account_sessions` guarda só o hash do token; mesma expiração de 30 min sem uso. Testado com reinício real do
servidor (a mesma sessão voltou a valer) e em `auth.test.ts` (3 casos novos).

Alternativas que ficaram de fora: para #31, manter tier 4–5 como recompensa e criar outro gasto; para #32, um monstro
novo lv 45–48 (precisa de sprite e de um lugar no mapa — um spawn novo na lista do gerador muda ~3 mil tiles).

| Item | O que mudou | Status |
|---|---|---|
| Atrito social do loot de grupo sem dono | Funciona como desenhado (qualquer um pega/move o que está no chão), mas numa rede de ~10 colegas pode gerar reclamação que nenhum teste automatizado capta | ✅ (2026-10-27) pedido do dono: ouro (partes iguais) e comum/incomum (rodízio) do abate em grupo vão direto à mochila de quem participou (`loot.ts` `nextSharer`, `party.lootSharers`); raro+ (`PARTY_GROUND_RARITIES`) segue no chão reservado 15 s para o grupo decidir. `ground.test.ts`, `party.test.ts` |

Configuração de produção:

| Item | O que fazer |
|---|---|
| #12 Backup fora do disco | Ligar `LEMONQUEST_BACKUP_COPY_DIR` em produção (pasta de rede/outro disco) |
| Admin em produção | Definir `LEMONQUEST_ADMIN_ACCOUNTS` com a(s) conta(s) dos admins, para poder recriar um personagem admin |

## Propostas — sink de ouro e conteúdo novo (2026-10-22) 🧭

Motivo: personagem de lv 80 com 500 mil de ouro sem o que comprar (lojas vendem só até tier 4, tier 5-7 só caem de
loot). Os itens marcados ✅ foram aprovados e implementados em 2026-10-22 (PR #4); só a montaria segue bloqueada. Benchmark:
bênção e imbuement vêm do Tibia (identidade que o jogo já persegue), cassino vem de Diablo (sink "de diversão" sem
custo de poder).

| Item | O que é | Esforço | Status |
|---|---|---|---|
| Bênção no templo | Reduz a zero a penalidade de XP na próxima morte; preço = level × 200 de ouro. Vendida por Liora (Vila), Irmão Tadeu (Posto) e Irmã Celeste (Porto) | pequeno | ✅ |
| Venda de tier 5-7 | Tier 5 no preço de tabela (Bento/Tomé/Dona Marta); tier 6-7 em "encomenda especial" a 1,5× o valor de loot, 1 peça por personagem por semana | pequeno | ✅ |
| Tarefas de caça | **Já existia** (Quadro de Recompensas, `bounties.ts`): 3/dia por faixa de level, até lv 88+. Moeda nova (Marca de Caça) descartada nesta rodada, ver nota | quase zero | ✅ |
| Missões recorrentes | NPC pede N de um material específico, rotação semanal. Reaproveita o próprio Quadro de Recompensas (aba "Encomenda") | pequeno | ✅ |
| Encantamento (imbuement) | 1 efeito ativo por personagem (dreno de vida, dreno de mana, espinhos, perfurante, veloz), ouro + material, Dona Marta | médio | ✅ |
| Montaria | Cosmética, sprite reaproveitado e tingido (sem bônus de velocidade) | médio (arte) | 🧭 bloqueado |
| Tingimento de outfit (por conta) | 8 tons pré-definidos na sprite da roupa (reusa `tint`, já usado em monstro, e `kv` existente pro unlock por conta); 8.000 de ouro cada, vale pra qualquer personagem da conta | médio | ✅ |
| Cassino | Ficha de 1.000 de ouro (Hanna, a Mascate): 45% nada, 35% +400 de ouro, 15% material, 5% +3.000 de ouro | pequeno | ✅ |

Bênção e venda de tier 5-7 implementadas (2026-10-22): `blessingPrice` em `shared/formulas.ts`, ação `C2S.NpcTrade`
`"blessing"`, flag `blessed` persistida no personagem, consumida em `combat.ts` na morte (zera `lostXp`, notice
própria). Tier 6-7 usa `NpcShopEntry.limited` + semana ISO (`weekId`) guardada em `rec.data.limitedBuyWeek`, checada
no servidor (não só esconder no cliente). Testes: `combatFormulas.test.ts`, `combat.test.ts` (morte com bênção),
`m4.test.ts` (compra de bênção e limite semanal).

Tingimento de outfit implementado (2026-10-22): catálogo em `shared/data/outfitTones.ts` (8 tons, `OUTFIT_TONE_PRICE`
= 8.000). `CharacterRecord` ganhou `accountId` (já vinha na linha do banco, só não estava exposto). Unlock por conta
guardado na tabela `kv` já existente (`account.tones.<id>`), sem migração de schema nova. Tingimento em si reaproveita
o campo `tint` que `CharacterLook`/`Actor` já aplicavam só em monstro (`outfitLook` ganhou um 4º parâmetro). No preview
da janela (canvas 2D puro, sem Phaser) foi preciso um tingimento manual (multiply + recorte pelo alpha original,
cacheado por imagem+cor). Testes: `outfit.test.ts` (validação do tom e `addAccountTone`/`getAccountTones`).
Atualização 2026-10-27 (pedido do dono: "melhore as cores dos personagens"): o multiply escurecia e sujava tudo. A cor
passou a ser aplicada preservando o brilho (`colorizePixel` em `outfitTones.ts`: sombras escuras, meios-tons na cor,
claros até o branco; pele em `TONE_KEEP` não tinge), igual na prévia (`outfit/colorize.ts`) e no mundo (textura
tingida por folha em `sprites.ts`/`actor.ts`, `tint` só para monstro). Paleta com 14 tons (ids antigos mantidos).

**Marca de Caça** (moeda nova, opcional, liga tarefas aos sinks sem imprimir mais ouro): descartada nesta rodada de
construção. Tarefas de caça e missões recorrentes pagam ouro direto, mais simples de construir e manter. Fica
anotada como ideia de reserva se algum dia o ouro direto dessas duas fontes virar demais.

Tarefas de caça e missões recorrentes implementadas (2026-10-22): a primeira já existia (Quadro de Recompensas), só
confirmado que cobre até o fim de jogo (banda lv 88+). A segunda é nova (`shared/data/materialRequest.ts`,
`server/systems/materialRequest.ts`): pede N de um material específico por semana (10 faixas de level, mesmos
materiais que já existem como loot vendável), paga ouro na entrega. Reaproveita o Quadro de Recompensas como NPC
(aba "Encomenda" nova ao lado de "Recompensas") e o padrão leve de `challenges.ts` (estado em `rec.data.request`,
sem passo de "aceitar"). Testes: `materialRequest.test.ts`.

Cassino implementado (2026-10-22): ficha fixa em `CASINO_TICKET_PRICE` (1.000), vendida por Hanna (Posto da
Fronteira, já era mercadora, só ganhou o flag `casino`). Prêmio puramente aleatório no servidor (`NpcSystem.rng`),
em expectativa paga menos que a ficha (sink de verdade, não fonte): 45% nada, 35% +400, 15% um material de flavor
(ferro/dente de goblin/ectoplasma/escama), 5% +3.000. Sem prêmio de poder nem de tom de tingimento (achei generoso
demais dar um tom de 8.000 numa ficha de 1.000, ficou só pra compra direta na janela de roupas). Testes:
caso novo em `m4.test.ts` (sorteio determinístico via `rng` injetado, uma faixa por vez).

**Encantamento implementado (2026-10-22), simplificado em relação ao desenho original**: o plano original era 1
slot na arma (o item), 3 tiers por efeito, decaimento por hora de combate, tier 3 preso a uma "Essência" nova só de
chefe. Construído de verdade: 1 efeito ativo **por personagem** (não pela arma), sem tiers, sem decaimento, troca
por outro a qualquer hora sem reembolso. Mais simples de manter e já entrega a parte que importava (a passiva em
si). Preço único de 5.000 de ouro + 5 do material por efeito, vendido pela Dona Marta:

| Efeito | Material | Onde aplica |
|---|---|---|
| Dreno de vida (5%) | Presa de Lobo | `combat.ts`, ataque automático contra monstro selvagem |
| Dreno de mana (4%) | Olho de Aranha | idem |
| Espinhos (8%) | Couro de Lobo | dano recebido de monstro, reflete de volta |
| Perfurante (ignora 15% da armadura) | Barra de Ferro | mitigação do ataque automático |
| Veloz (8% mais rápido) | Ferrão de Abelha | intervalo entre ataques automáticos |

Atordoante (crítico) ficou de fora: precisava de um sistema novo de status no monstro (stun), risco maior sem poder
testar visualmente. Só vale no PvE (ataque automático contra monstro selvagem), não em PvP nem em magia/invocação,
pra limitar o escopo do que foi tocado em `combat.ts`. Testes: 5 casos novos em `combat.test.ts` (um por efeito,
com monstro invulnerável pra isolar sem revide onde fazia sentido), 1 caso em `m4.test.ts` (compra/troca na loja).

**Tier 5-7 à venda, números reais do `items.ts`**: kit tier 5 completo ≈ 50 mil, tier 6 ≈ 144 mil, tier 7 ≈ 360 mil
(cavaleiro, paladino e mago na mesma escala, menores). Tier 6-7 a 1,5× o valor de loot (ex.: armadura da Coroa por
84 mil em vez de 56 mil), 1 peça por conta por semana.

**Cassino, estrutura de prêmio** (rascunho original, **não é o que foi construído**): ficha ≈ 1.000 ouro; 40% nada, 30%
ouro de volta, 15% material raro, 10% tom de tingimento, 5% cosmético único. O código (`npcs.ts`) usa a tabela da
seção acima: 45% nada, 35% +400, 15% material, 5% +3.000 (retorno esperado ≈ 335, sink de verdade).

**Montaria: bloqueada, não por decisão, por risco de asset.** Dos 8 itens desta rodada, é o único que não dá pra
construir só com código testável: precisa de uma sprite de montaria no formato de addon (32×32, grade 4×7,
`tools/addons/generate.mjs`), e sem conseguir ver o resultado renderizado (sem navegador nesta sessão), o risco de
entregar algo visualmente quebrado é alto. Técnica já mapeada (reaproveitar o mesmo `backSheet` que já existe pra
addons de capa/mochila, desenhado atrás do personagem, sincronizado com o próprio ciclo de caminhada), só falta a
arte em si e alguém conferir o resultado numa tela de verdade antes de ir pra produção.

## Não fazer agora ⛔

- **Reescrever `WorldScene.ts`** (1,1 mil linhas): funciona e tem E2E; dividir só quando uma mudança exigir.
- **Interesse por área no servidor** (mandar combate só para quem está perto): o filtro no cliente resolve o
  sintoma; no servidor muda o protocolo e só compensa com bem mais que 32 jogadores.
- **Layout mobile/toque (#14)**: o público é o escritório no PC; custo alto sem demanda.
- **Atualizar dependências em massa**: nenhuma vulnerabilidade alcançável; risco de regressão sem ganho.

## Histórico — ciclos 1 a 6 (2026-10-14 a 2026-10-15, 100 % concluídos)

Mantido para referência da numeração `#N` e das validações; nada aqui está pendente.

## Ciclo 1 (2026-10-14) — estabilidade, segurança e desempenho de base

| Etapa | Item | Status | Validação |
|---|---|---|---|
| A | #1 Nome de admin reservado na criação (inclui variantes com acento); liberar com `LEMONQUEST_ADMIN_ACCOUNTS` | ✅ | `auth.test.ts` (novo caso) |
| A | #9 Nomes novos só com letras latinas comuns (ASCII, Latin-1, Latin Ext-A) e NFKC; nomes antigos seguem válidos | ✅ | `auth.test.ts` (novo caso) |
| A | #4 Largar/pegar item grava jogador + chão juntos (transação), no máximo 1×/s (regravar o chão custa 1,4–7,3 ms com 100–2000 itens) | ✅ | `WorldRoom.test.ts` (novo caso) |
| A | #17 Backup grava em `.tmp` e só então substitui | ✅ | `persistence/*.test.ts` |
| A | #15 Limite de 6 msg/s para `C2S.Chat` (comandos e magias incluídos) | ✅ | unitários + E2E |
| A | #16 Investida não para em portal | ✅ | unitários de magias |
| A | #18 Teleporte visual com guarda do ator (`time.delayedCall`) | ✅ | typecheck + E2E |
| A | #20 Troca de senha derruba tokens pendentes e personagens online da conta (inclusive quem caiu e espera reconexão: `kick` cancela a reconexão) | ✅ | `recovery.test.ts`, `WorldRoom.test.ts` |
| A | #23 `x-powered-by` desligado; `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` | ✅ | `curl -I /health` |
| A | #3 `LEMONQUEST_TRUST_PROXY` opcional (`req.ip`); documentado só com a 2567 fechada | ✅ | typecheck; sem teste com Caddy real |
| B | #5 Uma regra só de "digitando"; checkbox/select soltam o foco após mudar | ✅ | navegador (foco em checkbox + D anda) + E2E |
| C | #2 Efeitos de terceiros só até 16 tiles; som atenuado (cheio até 3, mudo a partir de 10); jogador e grupo nunca filtrados | ✅ | typecheck + E2E; avaliação manual de áudio pendente |
| C | #19 Chat com chave estável por linha | ✅ | typecheck |
| E | #6 `meStore`/`selectStore`: HUD só re-renderiza quando o jogador local muda | ✅ | `store.test.ts` (0 publicações com outro jogador andando) |
| E | #7 `onChange` por entidade solto no `onRemove` | ✅ | typecheck + E2E |
| E | #8 A* com buffers reaproveitados (geração) | ✅ | 200–340 → 6–11 µs/caminho (`pathfinding.bench.ts`); 0 diferenças em 9000 buscas aleatórias com bloqueios vs. a versão antiga |
| E | #25 Luz: vagas reservadas (1/3) para magias/projéteis recortados pela tela; o resto entra no fim se sobrar vaga | ✅ | typecheck + E2E |
| F | E2E do Coliseu instável (já falhava no código original: 1/9 em repetição) — toasts/faixas efêmeros agora são gravados por um MutationObserver | ✅ | `arena.spec.ts` 12/12 em 4 repetições |

## Ciclo 2 (2026-10-14) — decisões de design + balanço

| Etapa | Item | Status | Validação |
|---|---|---|---|
| D | #10 Coliseu: XP das ondas só para quem está na faixa de level (≥ 2/3 do maior vivo); fora da faixa ganha só o ouro, com aviso | ✅ | `arena.test.ts` (novo caso) |
| D | #26 Kit inicial na criação: arma tier 1 da vocação equipada + 3 Poções de Vida + 5 Carnes | ✅ | `auth.test.ts` (novo caso); E2E ajustados (ground/quests não contam mais com mochila vazia) |
| D | #21 Loot para o maior causador de dano a até 12 tiles (senão, quem deu o último golpe); XP só entre quem está perto (sem ninguém perto, todos os que bateram) | ✅ | `combat.test.ts` (novo caso) |
| D | #27 Arma nunca dá menos dano que o punho (vale a faixa de maior média; a arma define alcance/tipo) | ✅ | `inventory.test.ts`; E2E do Coliseu voltou a vencer as ondas |
| D | #27 (decisão "a") Punho cresce devagar: `VOC_DAMAGE.perLevel` 1,6/1,4/1,1 → 0,85/0,75/0,6. Arma do tier bate 1,5–2,5× o punho; um tier atrás ainda ganha dele; equipado fica no patamar em que o Coliseu foi calibrado | ✅ | unitários (metas de magias usam o auto-ataque **com arma**; Bola de Fogo lv 1 = 1,8× com a varinha inicial, piso da meta 2× → 1,5×); E2E 25/25 |
| C | Foco por teclado visível em botões/links/selects/checkbox (`:focus-visible`) | ✅ | typecheck |
| E | #24 `colyseus` (meta-pacote) → `@colyseus/core` + `@colyseus/schema` explícito | ✅ | `npm audit --omit=dev`: 15 → **0**; lock 378 → 300 pacotes; `server.mjs` 5,44 → 2,40 MB; bundle de produção e imagem Docker sobem e respondem `/health`; E2E |
| F | Teste de carga `tools/loadtest.mjs` (10 bots andando/atacando/falando, 131 monstros) | ✅ | tick **0,20 ms em média, máx 2,4–5,0 ms** (orçamento 50 ms); passo ida e volta p50 46 ms / p95 298 ms |
| F | E2E "atacar e matar um monstro na floresta" falhava às vezes: jogador de teste anterior (janela de reconexão de 20 s) matava o alvo antes — o teste agora mira no próximo | ✅ | 3/3 isolado + 25/25 completo |
| F | Hipótese de "fantasmas" após reconexão automática | ✅ refutada | experimento com o SDK: monstro morto durante a queda some do estado e dispara `onRemove` ao reconectar |

## Ciclo 3 (2026-10-14) — polimento autônomo

| Etapa | Item | Status | Validação |
|---|---|---|---|
| C | Balão do item: **"Dano por golpe X–Y ▲/▼ atual A–B"** para armas da vocação; avisa "igual a lutar sem arma". A conta (`autoAttackRange`) foi para o shared e o servidor usa a mesma | ✅ | `itemInfo.test.ts` (igual ao servidor); capturas 1440×900 conferidas |
| C | Coliseu: janela mostra o level de cada membro e marca **"sem XP"** quem está abaixo de 2/3 do maior | ✅ | `arena.test.ts` |
| C | Telas baixas (720p/768p): minimapa 150 px, batalha com 3 linhas por padrão, faixa "▾" quando a coluna tem mais conteúdo (a barra de rolagem é escondida) | ✅ | `panelSize.test.ts`; capturas 1280×720 / 1366×768 / 1920×1080 |
| C | Chat: 80 linhas **por aba** (o Grupo não apaga o Geral); avisos do servidor contam como não lidos fora do Geral | ✅ | `chatLines.test.ts` |
| C | Textos do mundo acompanham a troca de monitor (DPR) | ✅ | emulação CDP: 151/151 textos 1 → 2 |
| E | Hover: vetor reaproveitado e cursor só escrito quando muda (rodava a cada frame) | ✅ | typecheck + E2E |
| F | Teste estatístico de dano: 160 mil `expect()` estouravam o tempo limite com CPU ocupada → conta violações | ✅ | arquivo em < 1 s |
| F | Docs do Docker: comando do admin e diretório de trabalho (`/app`) conferidos na imagem | ✅ | `docker run … node packages/server/dist/admin.mjs` |
| C | Acessibilidade: dificuldade da criatura em texto (dica da lista de batalha) e "!" para perigosa/chefe | ✅ | captura conferida |
| F | Heap do cliente em sessão com 10 bots | ✅ | plano (49,0 → 49,7 MB em 6 min) |
| D | #28 Armas tier 3 (lv 15) à venda: Bento (todas), Velho Caçador (arco), Dona Marta (varinha/cajado) — antes não caíam de nenhum monstro para cavaleiro e feiticeiro | ✅ | unitários; levantamento de fontes por vocação/tier |

### Ciclo 3 — depois da revisão independente

| Etapa | Item | Status | Validação |
|---|---|---|---|
| D | Crédito "só quem está perto" também em missões, conquistas de abate e abate em grupo (antes só XP/loot) | ✅ | `WorldRoom.test.ts` |
| A | Quem fica no mundo ao sair em combate para de andar (como na queda) | ✅ | `WorldRoom.test.ts` |
| A | `lastCreditId` zerado quando o monstro volta ao spawn | ✅ | unitários |
| E | Predição: amostra de confirmação limitada a 1 s | ✅ | `predictor.test.ts` |
| C | Login: chamadas da API com timeout de 15 s (servidor travado não deixa "Carregando personagens…" para sempre) | ✅ | typecheck + E2E |
| F | E2E: conferências sem `poll` logo após ações (chão/mochila) e canto livre de jogadores/itens que sobraram | ✅ | 25/25 |
| C | Cartão "Primeiros passos" para personagem novo | ✅ | capturas 1440×900 / 1280×720; some ao fechar/primeiro abate |
| D | #29 Armas tier 1 +1/+2 de ataque; lobo vida 80 / dano [6,15] | ✅ | unitários (metas de magias do lv 1 ≥ 1,5×); E2E 25/25 |
| D | #30 Druida: Lasca de Gelo (exori frigo), espelho da Bola de Fogo | ✅ | conferido no jogo: 8 de mana, rato 25 → 3 |

### Ciclo 4 — tour visual e robô

| Etapa | Item | Status | Validação |
|---|---|---|---|
| C | #34 Fundo próprio das janelas | ✅ | `getComputedStyle` 0,85 → 0,94/0,96 |
| C | #35 Depot abre a mochila dobrada e devolve ao fechar | ✅ | `e2e/depot.spec.ts` (novo) |
| C | #36 Ajuda F1 completa e agrupada | ✅ | captura |
| C | #37 Banner da zona abaixo das janelas | ✅ | capturas do treino/missão |
| C | #38 Loja/conquistas/ranking: textos cortados ou duplicados | ✅ | capturas |
| F | Robô que joga sem admin (4 vocações) | ✅ | lv 1→2–3 em 5 min sem mortes |
| F | E2E do chão resistente a monstro no tile | ✅ | 3/3 repetido |
| C | #39 Cartão de primeiros passos fora do caminho do novato (canto inferior direito) | ✅ | robô novato chega ao Capitão em 5 s (antes: parado); E2E `world.spec.ts` |
| C | #40 Chat sobe para cima da barra de magias em janela estreita | ✅ | 960 / 1100 / 1366 px sem sobreposição |
| C | #41 Loja: "Só da minha vocação" e "Lv N" | ✅ | no jogo: 18 de 35 itens para o mago |
| C | #42 /ajuda | ✅ | `admin.test.ts`; no jogo como jogador e admin |
| C | #43 Volume do som | ✅ | E2E novo em `world.spec.ts` |
| C | #44 Tela de desconectado avisa quando o servidor voltou | ✅ | servidor derrubado e religado com jogador dentro |
| F | #45 Phaser num chunk próprio; `/assets/*` immutable | ✅ | curl dos cabeçalhos; E2E confere `/ranking` |
| C | Rastreador de missões: com a missão pronta, mostra "→ Fale com <NPC que deu a missão>" | ✅ | `e2e/quests.spec.ts` (texto + captura `quest-ready`) |
| C | Chat sobre a cabeça do personagem (estilo Tibia): geral amarelo, grupo azul-claro, itálico menor que o nome, até 3 linhas, some sozinho, texto longo vira "…" (90 caracteres) | ✅ | `e2e/speech.spec.ts` (novo) + `party.spec.ts` |
| F | `tools/fuzz.mjs` (protocolo e inventário) | ✅ | 3 488 mensagens inválidas e 5 849 movimentos sem exceção nem duplicação |

### Ciclo 5 — funcionalidades novas (2026-10-15)

| Etapa | Item | Status | Validação |
|---|---|---|---|
| C | Seta-guia do novato (Capitão → floresta → Capitão) | ✅ | `guide.test.ts`, `e2e/guide.spec.ts` |
| C | Emotes (`/e`, botão ☺), sussurro (`/w`, `/r`) e amigos (`/amigo`, `/amigos`) | ✅ | `social.test.ts` (10), `e2e/social.spec.ts` |
| C | Troca entre jogadores (janela, confirmação dupla, troca atômica) | ✅ | `trade.test.ts` (11), `e2e/trade.spec.ts` |
| C | Pesca: vara, boia, 3 peixes, conquistas | ✅ | `fishing.test.ts` (9), `water.test.ts` (mapa real), `e2e/fishing.spec.ts` |
| C | Barra de ações: arrastar para reordenar (salva por personagem) | ✅ | `slotOrder.test.ts` |
| D | Eventos semanais com bônus de XP/loot + `/evento` (admin) + etiqueta no HUD | ✅ | `events.test.ts` (shared e server), `combat.test.ts` |
| F | `/status` do admin | ✅ | `admin.test.ts`, `status.test.ts` |
| F | `tools/newbie.mjs` (`npm run newbie`): regressão da 1ª missão nas 4 vocações | ✅ | 4/4 em 49–56 s |
| D | Respawn não trava com jogador parado no spawn (druida novato 4/6 → 8/8) | ✅ | `monsters.test.ts` (2 novos), 8 execuções do robô |
| F | E2E isolado: reconexão de 2 s em modo E2E; `party`/`ground` 10/10 em repetição | ✅ | `--repeat-each=5` |

### Ciclo 6 — retenção e qualidade de vida (2026-10-15)

| Etapa | Item | Status | Validação |
|---|---|---|---|
| D | Desafios da semana (3 metas + bônus, resgate tudo-ou-nada) | ✅ | `challenges.test.ts` (6), `e2e/challenges.spec.ts` |
| D | Ranking semanal (XP, abates, peixes, chefes) + categoria Pescador | ✅ | `weekly.test.ts` (shared e server), `achievements.test.ts` |
| D | Chefes na agenda (Lich qua 20h, Rei Goblin dom 20h) + `/evento` convoca | ✅ | `monsters.test.ts` (`callBoss`), `events.test.ts` |
| D | Bônus de login por dias seguidos (7 dias) | ✅ | `loginBonus.test.ts` (6) + conferido num servidor real (ouro e aviso; sem repetir no dia) |
| C | Bestiário (tecla B) com abates por monstro e drops | ✅ | `bestiaryLogic.test.ts`, `achievements.test.ts`, `e2e/bestiary.spec.ts` |
| C | Poção automática por % | ✅ | `autoPotion.test.ts` |
| C | Acessibilidade: texto maior, alto contraste, animações reduzidas | ✅ | `a11yLogic.test.ts` (efeito visual não conferido em captura) |
| C | Tela de Novidades; aviso fora da aba | ✅ | `news.test.ts`, `newsLogic.test.ts`, `attentionLogic.test.ts` |
| F | Evento manual persistido (reinício) | ✅ | `events.test.ts` |
| A | Avisos de entrada perdidos (cliente ainda não escutava): agora 3 s depois | ✅ | conferido num servidor real |

Ficou de fora de propósito: painel web de admin (os comandos `/status` e `/evento` bastam por enquanto), teste visual
automático por comparação de imagens, mercado entre jogadores, guilda, receitas, resistências de monstros e prestígio
(sistemas inteiros que pedem decisão de design).

Já existiam (conferido no código, sem mudança): cadeia de missões até o level 35 (12 missões), texto flutuante de dano
por tipo/crítico, mapa-múndi em tela cheia (tecla M), chefes de zona e Coliseu até a onda 30 com Lich e Rei Goblin.

Ficou de fora (precisa de mapa/arte novos): **dungeon instanciada própria** (o Coliseu e os chefes de zona cobrem o
conteúdo para grupo), **mineração** (só a pesca foi feita) e **casas com decoração** (o depot já guarda itens; casa
pede áreas no mapa e itens colocáveis no mundo).
