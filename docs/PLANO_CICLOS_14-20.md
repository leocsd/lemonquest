# Plano de melhorias de jogabilidade — The Lemon Quest (ciclos 14–20)

## Contexto

O dono pediu uma análise com calma do jogo e um plano com bastante melhoria de jogabilidade e correções. Três frentes
de leitura do código (regras/balanço, experiência do jogador, conteúdo/servidor) acharam ~100 itens; os graves foram
conferidos à mão no código. Dados de produção (11 contas, 15 personagens, ~11 dias) que orientam o plano:

- Dois blocos de jogadores: 8 personagens lv 35–102 e 6 novatos lv ≤ 16 (quase sem jogo misto).
- 7 dos 15 personagens são feiticeiros (causa principal: Escudo de Mana + Poção de Mana Grande).
- Mortes/h: 20–40: 5,3 · 40–60: 4,3 · 60–80: 9,3 · 80–100: 1,0 (amostra pequena).
- Topo com 1,2 mi e 739 mil de ouro parados; gasto de 23% do ganho no 100+; equipamento para no lv 70.
- Ninguém matou Orshabaal/Ferumbras até o ciclo 12; pesca quase sem uso; druida lv 99 com 11 mil abates e 10 missões.
- Produção já está nos ciclos 12 e 13 (`976e96c`, rollback `lemonquest:pre-ciclo12-13`).

### Decisões do dono (tomadas nesta análise)

| Tema | Escolha |
|---|---|
| Vocações | Pacote completo: Escudo de Mana mais fraco, druida com defesa, magias de cavaleiro/paladino escalando com a skill de arma, fraquezas elementais (sagrado contra mortos-vivos); modelo do Coliseu corrigido antes |
| Morte | Mais pesada do lv 60+ (até 30% do level, nunca derruba level); bênção passa a valer |
| Fim de jogo | Tier 8 Abissal + encantamento com tiers/duração + refino +1..+5 + chefes de covil e Coliseu 61–70 |
| Jogo misto | Invasões da Vila + Mural de Excursões (regra do grupo e mentoria **ficam como estão**) |
| Regiões novas | **Siderúrgica** e **Montadora de carros**, mapas grandes como a Malha, cheias de missões; **as duas para todos os levels** (setores de lv 10 a 120: entrada fácil, fundo difícil); acesso por **trem** (Siderúrgica, pela Malha) e **caminhão-cegonha** (Montadora, na Vila/Oficina), cada uma com atalho oculto; tema **só fantasia industrial** (nenhuma referência a projetos/clientes da Embeddo); **Siderúrgica primeiro** (ciclo 19), Montadora depois numa faixa própria (ciclo 20) |
| PvP | Dano entre jogadores pela metade |
| Encantamento existente | Vira tier I com 10 h de combate (aviso nas Novidades) |
| Invasão da Vila | Quarta 12h15; a Maré de Tesouros passa para quinta 13h; morrer na invasão **perde XP normalmente** |
| Bocas de caverna | **Autorizado desenhar** as entradas das 4 caves (exceção controlada ao "0 tiles alterados", só nos retângulos das entradas; ver 17-12) |
| Orshabaal | `orshabaal_hunt` passa a exigir `selo_do_abismo` (ninguém está no lv 110 ainda: sem impacto em jogador) |
| Para depois | Murphy/Onda 3 (C10-4), guilda, mercado entre jogadores, casas |

Ordem: correções primeiro (ciclo 14, pequeno e seguro), depois balanço (15), fim de jogo (16), descoberta/onboarding
(17), social/retenção (18), Siderúrgica (19) e Montadora (20). Cada ciclo é uma PR, com `/fechar-ciclo` e deploy com
rollback, como os anteriores.

---

## Ciclo 14 — Correções (bugs e exploits confirmados)

Todos conferidos no código. Cada item: correção + teste unitário ao lado (padrão do projeto).

| # | Problema | Onde | Correção |
|---|---|---|---|
| 14-1 | **Dança da coleira**: monstro voltando ao spawn que leva dano volta a perseguir; ao passar de 14 tiles recomeça a volta e zera o `returnSince`; nunca cura nem revida → chefes e caves de graça para quem ataca de longe | `server/systems/monsters.ts:587-595` (`onDamaged`), `ai.ts:82-88,116` | Monstro em `return` por coleira ignora dano e não troca de alvo até chegar ao spawn (evade); cura ao chegar já existe (`arrive`). Teste novo em `ai.test.ts` |
| 14-2 | **Chefes renascem a cada reinício** (respawn só em memória; `spawnAll` recria tudo) | `server/systems/monsters.ts:202,331-338` | Gravar `kv boss.respawnAt.<defId>` no abate de chefe; no boot pular chefe no prazo e enfileirar a volta |
| 14-3 | **Porta com level atravessável**: a espera de 1 s do portal retorna antes de conferir o requisito (porta lv 80 do Vulcão em 372,96) | `server/systems/portals.ts:65-67` | Conferir `canPass` antes da espera; bloqueado sempre devolve ao tile anterior |
| 14-4 | **Poções e comida sem level mínimo** no servidor; Q/E usa a primeira poção da mochila | `server/systems/inventory.ts:642-674` (`useAt`), `:483-492` (`onQuickPotion`); compra em `npcs.ts:155-175` | Conferir `def.level` no uso e na compra; Q/E escolhe a melhor poção permitida pelo level |
| 14-5 | **Bênção gasta numa morte sem perda** | `server/systems/combat.ts:476-479` | Consumir só se a perda sem bênção for > 0 (ciclo 15 muda a perda; manter a regra) |
| 14-6 | **Prova de chefe cai 1 vez para o grupo** (coroa do Rei Goblin, chave da Cripta) → grupo de 4 precisa de 4 abates | `shared/data/quests.ts:259-273,307-321`; `server/systems/loot.ts:141-172` | Tirar o passo "entregar" dessas missões (o passo "boss" já credita o grupo) |
| 14-7 | **Alavanca da Aniquilação sem espera**: fazenda de demônios sob demanda | `server/systems/questWorld.ts:67-99` | Cada personagem entra 1× por dia (dia troca às 6h, `bountyDay()`); grupo recusado se algum membro já entrou ("volta às 6h"); `CharacterData.leverDay` |
| 14-8 | **Investida termina dentro da PZ** (fura bloqueio de PZ no PvP) | `server/systems/spells.ts:356-363` (`dash`/`free`) | `free()` recusa tile de PZ |
| 14-9 | **Quadro de Recompensas: o ciclo 13 mudou faixas antigas** (progresso guardado por posição) | `shared/data/quests.ts:1004-1012`; `server/systems/quests.ts:101`, `bounties.ts:67-71` | Guardar o id do monstro com o progresso; monstros novos ficam só nas faixas onde já estão, mas a lista do dia passa a ser estável mesmo se a faixa mudar |
| 14-10 | **Recompensas impossíveis**: Dragão de Gelo na faixa 72+ (só depois da missão do Yeti); faixa 1 pede lobos lv 8 a lv 1; Encomenda 88+ pede escama de dragão de gelo | `shared/data/quests.ts:1003,1012`; `shared/data/materialRequest.ts:21` | Trocar por Lanterna Rubra/Crânio; lobo → rato cinzento na faixa 1; material alcançável |
| 14-11 | **Baú de Recompensa sem equipamento acima do lv ~58** (pool limitado a valor ≤ 15 mil) | `server/systems/quests.ts:485-488` (`chestGearPool`) | Filtrar por tier/level em vez de valor; lista vazia → gema/material da faixa |
| 14-12 | **Encomenda semanal muda de material ao subir de faixa** e entrega sem o NPC | `server/systems/materialRequest.ts:53,71-84` | Gravar a faixa na 1ª consulta; exigir o Quadro aberto |
| 14-13 | **Cassino pode "dar" material que some** (espaço conferido só para a Barra de Ferro) | `server/systems/npcs.ts:208,220` | Sortear antes e conferir espaço do item sorteado (ou largar no chão) |
| 14-14 | **`callBoss` conta cópias do Coliseu/alavanca como vivas** → evento anunciado sem chefe | `server/systems/monsters.ts:348` | Ignorar monstros com `arenaId`/`questLever`/`minionOf` |
| 14-15 | **Comida acumula a taxa máxima** com duração somada | `server/systems/food.ts:28-41` | Taxa ponderada pela duração restante |
| 14-16 | **Monstro que foge fica no limbo** (não cura, não revida outro) | `server/systems/ai.ts:116-138` | Fuga com prazo: 10 s sem dano → `startReturn` |
| 14-17 | **Tingimento de 8.000 em um clique** sem prévia/confirmação | `client/ui/outfit/OutfitWindow.tsx:140` | Clique no tom bloqueado só faz prévia; botão "Comprar (8.000)" com confirmação |
| 14-18 | **Depot**: clique rápido equipa em vez de guardar; não junta pilha; "Mochila cheia" falso | `client/ui/items/actions.ts:38-49`; `server/systems/inventory.ts:624-626` | Com depot aberto, clique rápido guarda; juntar em pilha igual com espaço (regra de `inventory.ts:435`) |
| 14-19 | **Textos errados**: dica do grupo "+20%" (real +35% e +20% com 3 vocações); plural do Quadro ("Cões Infernal", "Samurais Rubro"); Coliseu contraditório sobre quem fica fora da faixa; diálogos que mandam ao lugar errado (`cave_echoes`, `restless_dead`, `sapata_gasta`); promessas não cumpridas (chave da Cripta, escudos de `dragon_scales`/`frost_dragons`; `orshabaal_hunt.requires` passa a incluir `selo_do_abismo`); Novidades com informação superada | `client/ui/party/PartyPanel.tsx:38`; `shared/data/quests.ts:252,285,751-766,1031-1040`; `client/ui/arena/ArenaWindow.tsx:24,38,50`; `shared/data/items.ts:281`; `shared/data/news.ts` | Corrigir textos; `plural` por monstro + teste passando por todos os monstros das faixas; entregar o prometido ou reescrever |
| 14-20 | **Desafio semanal de XP usa o level de quando a janela abre** | `server/systems/challenges.ts:33-43`, `weekly.ts:13-19` | Criar o estado no 1º login da semana |
| 14-21 | **Dívida antiga**: teste pulado de faixa inválida nas recompensas (ouro negativo) | `server/systems/bounties.test.ts:97`, `bounties.ts:84` | Limitar a faixa (`clamp`) e religar o teste |
| 14-22 | **Sprite do Samurai Rubro errado** (erro do ciclo 13): a tira `GiantRedSamurai/Walk.png` tem 6 quadros de 96×48, foi declarada como 12 de 48 → anima meio samurai | `shared/data/monsters.ts` (`abyss_samurai`) | `frameWidth 96, frameHeight 48`, 6 quadros (layout custom); conferir na tela com E2E + captura |

Verificação do ciclo 14: `npm run typecheck`; `npm test`; E2E de `ground`, `depot`, `quests`, `death`, `arena`,
`sinks`, `caves`; teste novo de porta com level (E2E: pisar duas vezes na porta do Vulcão abaixo do lv 80 não entra).

---

## Ciclo 15 — Balanço das vocações e morte mais pesada no 60+

Medição de hoje (modelo de planejamento, medida P = dano × sobrevivência; pior/melhor): lv 30 **0,32**, lv 60
**0,36**, lv 100 **0,44**. Com o pacote: **0,68 / 0,75 / 0,67** e o feiticeiro deixa de liderar dano e
sobrevivência ao mesmo tempo. Ordem (um commit por passo, cada um com teste):

| # | Passo | Onde | Números |
|---|---|---|---|
| 15-1 | **Modelo honesto do Coliseu** (antes de mexer em regra): `fighter`/`rotation`/`monsterDps` saem de `arena.test.ts` para `server/systems/balanceKit.ts`; duas mãos sem escudo (cavaleiro testa as duas montagens; paladino não ganha escudo por engano); Escudo de Mana e exura modelados; `skillEstimate(v, level)` em `shared/skills.ts` substitui o `mlEstimate` 0,75·L (ML mago 22/36/48 nos lv 30/60/100; arma 28/46/66) | `server/systems/balanceKit.ts` (novo), `vocationBalance.test.ts` (novo), `arena.test.ts`, `shared/skills.ts`, `shared/data/spells.test.ts` | só mede; com o escudo de hoje o feiticeiro solo lv 120 chega à onda 34–35 (quebra a meta ≤ 30 — prova do problema) |
| 15-2 | **Telemetria da causa da morte e das skills reais** (`deathsBy` por level; relatório de skills por vocação/faixa no `admin telemetria`) | `server/systems/telemetry.ts`, `combat.ts` (`killerKey`), `monsterAbilities.ts`, `conditions.ts`, `persistence/admincli.ts` | conferir com a produção antes de travar metas |
| 15-3 | **Escudo de Mana pela metade**: metade do dano sai da mana, metade da vida (`MANA_SHIELD_ABSORB = 0.5`, `manaShieldSplit`) | `shared/formulas.ts`, `server/systems/combat.ts:337-343`, descrição em `shared/data/spells.ts` | vida efetiva com escudo cheio no lv 100: 5.124 → 2.288 (cavaleiro: 2.235); sustentação por poção 900/s → 360/s |
| 15-4 | **Druida ganha o Escudo de Mana** (mesmo `utamo vita`, lv 15; palavras precisam ser únicas) | `shared/data/spells.ts` (`vocations: ["sorcerer","druid"]`); regra do teste vira "até `HOTKEY_MAX + 2` magias" (druida 14; barra recomendada 11 ≤ 12) | sobrevivência do druida 43% → 71% (lv 30) |
| 15-5 | **Potência das magias de cavaleiro/paladino** = `max(ML, ⌊(skill da arma + bônus − 10)/2⌋)`, só no dano (cura segue com ML) | `shared/formulas.ts` (`spellPower`), `server/systems/spells.ts:311-327` (+opção `weaponSkillBonus`) | Golpe Aniquilador lv 100: 680 → 790; Julgamento Divino: 458 → 502; metas de `spells.test.ts` continuam |
| 15-6 | **Fraquezas elementais**: mortos-vivos sagrado ×1,25; bichos de fogo gelo ×1,15; bichos de gelo fogo ×1,15 (tabela `ELEMENT_WEAKNESS` aplicada no `resist`) | `shared/data/monsters.ts`; Bestiário com linhas "Resiste a" e "Fraco contra" (`client/ui/bestiary/Bestiary.tsx`) | papel para o paladino (60–80 cheio de mortos-vivos) e para o druida contra dragões/demônios |
| 15-7 | **Curandeiros com limite**: cada monstro recebe cura de aliado no máximo 1× a cada 10 s | `shared/data/monsterAbilities.ts` (`HEAL_ALLIES_LOCKOUT_MS`), `server/systems/monsterAbilities.ts`, `Monster.healedAt` | bando de 3 Necromantes: 162 → 54 de vida/s |
| 15-8 | **Chefes**: raiz vira lentidão de 30%; lentidão pela metade (`bossCondition`) | `shared/data/monsters.ts`, `server/systems/conditions.ts:59-75` | Raízes da Terra segue útil contra chefes |
| 15-9 | **Paladino com 12 de vida por level** (era 10) | `shared/formulas.ts` `VOC_GROWTH` | lv 100: 1.680 → 1.878 (recalculado ao entrar) |
| 15-10 | **Morte**: 10% do level até 59, **20%** do 60–79, **25%** do 80–99, **30%** do 100+, nunca derruba level (`DEATH_PENALTY_STAGES`); bênção só gasta se a perda > 0 (já no 14-5); tela de morte "Sua bênção salvou 19.328 XP"; sacerdotisa mostra "Protege ~X XP agora" | `shared/formulas.ts`, `server/systems/combat.ts:476-480`, `shared/messages.ts` (`DiedMsg.blessingUsed/savedXp`), `client/ui/combat/combatUi.ts`, `NpcWindow.tsx`, `server/systems/npcs.ts` | lv 100: perda 6.443 → 19.328 XP; bênção 5.000 de ouro |
| 15-11 | **PvP com metade do dano** (`PVP_DAMAGE_MULT = 0.5` em `CombatSystem.hitPlayer`) | `shared/pvp.ts`, `server/systems/combat.ts:274` | mago lv 100 deixa de morrer em 1 s para duas magias |
| 15-12 | Lobo Espiritual mais forte no fim de jogo (dano extra 1,5 e +25 de vida por level); Luz Restauradora com recarga 20 s | `shared/data/monsters.ts` (`summonScaled`), `shared/data/spells.ts` | ajustes baratos |
| 15-13 | **Calibração**: travar em `vocationBalance.test.ts` — feiticeiro não lidera dano e sobrevivência juntos; pior/melhor ≥ 0,65 nos lv 30/60/100; vida efetiva com escudo ≤ 1,1× a do cavaleiro. Alavancas, nesta ordem: `MANA_SHIELD_ABSORB` 0,5–0,6 → Chuva de Gelo com recarga 4 s → paladino 13 de vida/level → +30% nas magias de dano do cavaleiro até o lv 35. Não reduzir o dano do feiticeiro | `server/systems/vocationBalance.test.ts` | meta ±15% (0,74) fica para a revisão com telemetria |
| 15-14 | **Coliseu**: o modelo honesto mostra o grupo forte demais (grupo lv 100 completa) — subir dano/vida das ondas 46–60 pelo menor passo que devolva as metas de `arena.test.ts` (commit separado; não mexer em vocação para isso) | `shared/data/arena.ts` | metas: solo lv 120 ≤ 30; grupo justo cai em X−5..X+3; lv 100 não completa |

Comunicação: Novidades explicando cada mudança (feiticeiros: "use a Cura junto com o escudo"; druidas ≥ lv 15 põem o
escudo numa tecla). O 15-3 (escudo), 15-6 (fraquezas), 15-7 (curandeiros), 15-10 (morte) e o 14-5 (bênção) vão **no
mesmo deploy**, para a morte mais pesada não chegar sem as compensações. `MANA_SHIELD_ABSORB` é uma constante só:
dá para voltar a 0,6 sem outra mudança. E2E: `death`, `spells`, `bestiary`, `arena`, `world`.

---

## Ciclo 16 — Fim de jogo (6 passos, cada um vai para produção sozinho)

| Passo | Conteúdo | Mapa? |
|---|---|---|
| 16-1 | Botas tier 6–7 (6 peças, todas abaixo das Botas da Pressa em valor → arena inalterada); campo `ItemDef.unique` (fora de loja e do Baú) | não |
| 16-2 | **Tier 8 "Abissal"** (lv 100) + Fragmento Abissal + baús da Aniquilação por vocação + recalibração da arena | não |
| 16-3 | **Encantamento com tiers e duração** (vale em magia pela metade) + migração | não |
| 16-4 | **Chefes de covil** (4) + provas + baús desenhados por objeto + NPC Ferreiro + missão "Os Quatro Covis" | só objetos |
| 16-5 | **Refino +1..+5** no Ferreiro | não |
| 16-6 | **Coliseu 61–70** + modificador semanal + ranking de tempo + título rotativo | não |

**16-2 Tier 8** (`TIER_LEVEL` vira `[1,8,15,25,35,50,70,100]` em `shared/data/items.ts`): ícones por *tint* sobre os
quadros existentes (`{ ...gear(shape,"steel"), tint: 0xa080ff }`), sem 9ª paleta (mudaria `gearFrame` de anel/amuleto).
13 peças: cavaleiro (lâmina 160 atk, elmo, armadura, escudo), paladino (arco 125→144, elmo, couraça, grevas), magos
(varinha de morte e bastão de terra 105 atk/magia 6, capuz, manto, Grimório Abissal). Valores 110–300 mil.
Material `abyss_shard` (Tengu 25%, Samurai 30%, Orshabaal/Ferumbras 100%). Drop só de `abyss_tengu`, `abyss_samurai`,
`orshabaal`, `ferumbras` e `lair_shogun` (0,15–0,3% nos comuns, 10–12% nos chefes). Aniquilação: os 4 baús mantêm o
id; conteúdo vira um por vocação (Machado Cortapedras, Arco/Varinha/Bastão Aniquilador, únicos, 320 mil). Rodar e
recalibrar `server/systems/arena.test.ts` no mesmo passo (o simulador escolhe o item mais caro por slot).

**16-3 Encantamento** (`shared/data/imbuement.ts` reescrito; `systems/imbuement.ts` novo): 10 h de **combate PvE**
(não gasta no boneco), magias com metade do valor, 3 tiers. Tier I = valores de hoje (5 mil + 5 materiais); II (lv 60,
30 mil + material de fim de jogo); III (lv 90, 100 mil + 5 Essência Demoníaca). `CharacterData.imbue = {effect, tier,
leftMs}`; o `imbuement` antigo (string) migra para tier I com 10 h. HUD: condição `imbued` com "7h" na faixa; Dona
Marta mostra grade 5 efeitos × 3 tiers. Novidades avisa a mudança.

**16-4 Covis** (objetos no fim do `generate.mjs`, bloco `lateObjects14` com validação estilo `lateNpcs11`; prova:
`diff-world.mjs` 0 tiles e 826/826 objetos antigos):

| Chefe | Cave | lv | Vida | Sprite (pack, sem uso) |
|---|---|---|---|---|
| Rei Toupeira | Minas | 28 | 4.500 | `Boss/GiantRacoon` (tint) |
| Kraken das Grutas | Grutas | 54 | 11.000 | `Boss/SquidGreen` |
| Chama Ancestral | Catacumbas | 82 | 22.000 | `Boss/GiantFlam` (tint) |
| Shogun Abissal | Profundo | 125 | 45.000 | `Boss/GiantBlueSamurai` |

Cada um deixa uma prova (100%) que destranca o baú do covil (`QuestChestGroupDef.needItem`). O baú vira objeto
`quest_chest` com `drawn: true` desenhado pelo cliente (`ninja/Items/Treasure/BigTreasureChest.png`), porque baú como
tile alteraria o mapa já em produção. Missão "Os Quatro Covis" (Batedora, lv 100). NPC "Mestre Brás, o Ferreiro"
(sprite `KnightGold`) perto do Bento.

**16-5 Refino** (`shared/data/refine.ts`, `systems/refine.ts`): `ItemInstance.refine` 1..5 (sanitizado; preservado em
depot/troca/chão); +3 de ataque por nível em arma, +1 de armadura nos demais; falha 0/10/25/40/50% sem destruir nem
rebaixar; ouro por tentativa do tier 5 (3–18 mil) ao tier 8 (25–150 mil) + gema/fragmento. `instanceStats()` única
conta no servidor e no cliente. Set T8 em +5 ≈ 2,5 mi: o gasto grande do topo. Aba "Refinar" no Ferreiro; selo "+N".

**16-6 Coliseu 61–70** (`shared/data/arena.ts`, `systems/arena.ts`): ondas com tengu/samurai/colosso, chefe Shogun na
65 e Ferumbras na 70; `ARENA_DMG_POINTS` + `[70, 2.4]`; marco da onda 60 (+20 mil) e fim (+50 mil, 25% da XP);
modificador da semana só nas 61–70 (Fúria, Carapaça, Enxame, Sem Trégua, Calmaria); ranking de tempo no kv e título
rotativo "Campeão do Coliseu" (padrão do `weeklyChampion`). Metas: lv 110 não completa as 70, lv 130 completa.

Testes do ciclo 16 (além dos já existentes): `items.test.ts` (tier 8 por vocação, só no Profundo/chefes, nunca em
loja), `imbuement.test.ts` (shared, novo), `combat.test.ts`/`spells.test.ts` (consumo só em PvE, metade em magia),
`questWorld.test.ts` (baú trancado sem prova), `refine.test.ts` (shared e server), `ground`/`trade`/`inventory` (refino
preservado), `arena.test.ts` (metas 61–70), E2E `refine.spec.ts`, `caves.spec.ts` (chefe e baú), `sinks.spec.ts`
(encantamento II), `arena.spec.ts` (modificador e tempos).

---

## Ciclo 17 — Descoberta, missões e interface

**Base comum — índice do mundo** (`shared/src/worldIndex.ts`, puro, a partir do `world.json`): zonas, faixa de level
por zona (monstros não-chefe), spawns por monstro, NPCs, portais **com rótulo calculado** (zona do destino + `minLevel`
— não dá para gravar `label` nos portais antigos sem quebrar o `diff-world`), componentes conectados e `nextHop` pelo
grafo de portais. Usado no servidor (`onCreate`) e no cliente (depois do `worldMapJson`). `worldIndex.test.ts` contra o
mapa real. Alimenta todos os itens abaixo e os testes de conferência de dados.

| # | Item | Arquivos principais |
|---|---|---|
| 17-1 | **Agenda de eventos**: janela no trilho (eventos da semana, próximo em destaque), selo "Próximo: X às HH:MM" no `EventBadge`, aviso 10 min antes (Feed + título da aba), `/agenda` e `/evento` de leitura para todos | `shared/data/events.ts` (`upcomingEvents`), `server/systems/events.ts` (`onEnd`, `S2C.Agenda`, `S2C.EventSoon`), `client/ui/agenda/AgendaWindow.tsx`, `EventBadge.tsx`, `attention.ts` |
| 17-2 | **Rótulos de portal** ("Minas Abandonadas · lv 10+", vermelho abaixo do level) e "olhar" em portal | `client/game/portalLabels.ts` (cópia de `ChestLabels`), `lookInfo.ts` |
| 17-3 | **Marcadores** no minimapa e mapa-múndi (templo, depot, lojas, viagem, Quadro, "!"/"?", portais explorados, destino do guia, marcador pessoal) e o grupo no mapa-múndi | `client/ui/minimap/markers.ts`, `Minimap.tsx` |
| 17-4 | **Diário com "Disponíveis (N)" e "Em breve"**; NPC explica o pré-requisito que falta | `client/ui/quests/QuestLog.tsx`, `NpcQuests.tsx`; `shared` `questLockReason` |
| 17-5 | **Guia para a missão rastreada** (NPC, zona, spawn mais próximo; portal certo via `nextHop`), botão "Guiar" em rastreador/diário/Quadro/Agenda | `client/ui/hud/guide.ts` (`guideTarget` geral), `QuestTracker.tsx`; `WorldScene.ts` só muda a chamada |
| 17-6 | **Próximo passo** no cartão de missão concluída e no banner de level (missões e caves liberadas) | `QuestTracker.tsx`, `CombatOverlays.tsx`; `shared` `nextQuestsAfter`, `unlocksBetween` |
| 17-7 | Recompensas diárias no rastreador com "onde/quão difícil"; Encomenda diz onde o material cai; Bestiário com "Onde vive" e filtros | `QuestTracker.tsx`, `NpcQuests.tsx`, `bestiaryLogic.ts` |
| 17-8 | Viagem mostra a faixa de level do destino e alerta se perigoso; "olhar" de NPC lista serviços; Novidades só com o não visto (histórico recolhido); boas-vindas no Feed para personagem novo | `NpcWindow.tsx`, `lookInfo.ts`, `newsLogic.ts`, `WorldRoom.onJoin` |
| 17-9 | **Resistência visível**: `CombatEvent.resisted`, número com ↓/↑ e "resistiu" em vez de "errou"; "olhar" mostra resistências/fraquezas | `shared/types.ts`, `server/systems/combat.ts`, `WorldScene.ts` (≈2 linhas), `lookInfo.ts` |
| 17-10 | Menu do jogador com "Atacar" por último e em vermelho (mesmo menu na lista de batalha); bênção e encantamento na faixa de condições; saudação de NPC não redigitada; "Trocar personagem" no menu | `client/ui/social/playerMenu.ts`, `BattleList.tsx`, `ConditionsStrip.tsx`, `NpcWindow.tsx` |
| 17-11 | **Depot**: guardar com um clique, juntar pilhas (`AUTO_SLOT`), "Organizar" e busca | `shared/messages.ts` (`C2S.SortContainer`), `server/systems/inventory.ts`, `client/ui/items/actions.ts` |
| 17-12 | **Bocas de caverna desenhadas** nas 4 entradas (autorizado pelo dono): Minas (89,74) e Grutas (283,116) com o carimbo `caveMouthGray`/`caveMouthBrown` de `tools/mapgen/stamps.mjs` (o mesmo das cavernas antigas), Catacumbas (163,54) com uma entrada de cripta (arco de pedra + porta-caveira, como o mausoléu das Ruínas), Abismo Profundo (256,136) com uma fenda no chão do salão (rachaduras de lava + borda de rocha). O tile do portal continua andável e é a "porta" do desenho; o tile de retorno continua andável | etapa nova `tools/mapgen/entrances14.mjs` depois dos objetos já publicados; `diff-world.mjs` ganha `--allow x0,y0,x1,y1` (lista de retângulos): falha se qualquer tile **fora** deles mudar e imprime quantos mudaram dentro; validação: alcance a pé do mapa inteiro igual ao de antes (mesmo número de tiles andáveis alcançáveis, exceto os do próprio desenho), nenhum objeto antigo coberto |

Testes: unitários de cada função pura (`worldIndex`, `upcomingEvents`, `markers`, `guideTarget`, `questLockReason`,
`nextQuestsAfter`, `bestiaryLogic`) + conferências de dados com o índice (todo alvo de missão/recompensa/encomenda tem
spawn ou fonte alcançável) + E2E `agenda.spec.ts`, `quests.spec.ts`, `guide.spec.ts`, `caves.spec.ts` (rótulo),
`depot.spec.ts`. Nenhuma tecla nova (reservar tecla apagaria atalhos de magia já configurados): tudo por trilho e chat.

---

## Ciclo 18 — Social e retenção

**18-1 Invasões da Vila** — **quarta 12h15–12h55** (a Maré de Tesouros vai para quinta 13h–14h; `events.test.ts`
garante que nada se sobrepõe) — (`shared/data/invasion.ts`, `server/systems/invasion.ts`): evento com `invasion` no
`GameEventDef`; ondas por fração da duração (sobrevive a reinício), escalando com os presentes por faixa (≤12, 13–20,
≥21; teto 40 vivos; faixa alta só com jogador alto presente; última onda com líder elite). Nascimento reaproveita
`MonsterManager.spawnQuest` (+`hpMult`/`elite` opcionais, nunca em PZ) num anel de ~8 tiles em volta da Vila
(4 objetos `invasion_point` no mapa, só objetos). Contribuição por dano e cura (gancho novo `onHealOther`); quem fez
≥10 pontos ganha `bounty_chest` (escala com o level) e +1 se a Vila foi defendida. HUD na `top-stack`, marcadores no
minimapa, item na Agenda. Conquista "Defensor da Vila".

**18-2 Mural de Excursões** (`shared/data/excursions.ts`, `server/systems/excursions.ts`): NPC-quadro na praça (objeto
perto do Quadro de Recompensas); posta destino (lista do índice do mundo + Coliseu/chefes), faixa de level, horário
(até +12 h), vagas; sem texto livre; "Quero ir" avisa o líder, que convida com o `C2S.Party` existente ("Convidar
todos"); lembrete 2 min antes; expira 30 min depois; persistido no kv (`excursoes.v1`). Aba na Agenda. Conquista
"Guia de Excursão".

**18-3 Painel Online/Amigos** na barra lateral (regra de zona do `/quem`), com Convidar/Sussurrar.

**18-4 Retenção**: desafios semanais (lote de 9, 3 sorteados por semana, prêmio escalado pelo level, aviso ao cumprir,
resgate automático na virada, botão no trilho; estado criado no 1º login da semana); bônus de login que não quebra no
fim de semana e escala com o level; conquistas lv 90–120 e de Ferumbras/Orshabaal; pesca com Baú do Pescador e meta
menor; ranking destaca o próprio personagem; tela de morte com "o que te acertou nos últimos 5 s"; alerta na aba em
segundo plano quando atacado/vida baixa.

Mensagens novas (com `MESSAGE_LIMITS`): `C2S.Excursion` (3/s), `C2S.Social` (3/s), `C2S.SortContainer` (1/s); S2C
`Agenda`, `EventSoon`, `Invasion`, `Excursions`, `ExcursionPing`, `Online`. Sistemas novos entram em `steps`,
`cleanupSession` e `onReconnect` do `WorldRoom`. Testes: `invasion.test.ts`, `excursions.test.ts`, `social.test.ts`,
`challenges.test.ts`, `loginBonus.test.ts` + E2E `invasion.spec.ts`, `mural.spec.ts` (duas páginas),
`challenges.spec.ts`.

---

## Ciclos 19–20 — Siderúrgica e Montadora (regiões grandes, todos os levels)

**Geometria (decisão do dono: Siderúrgica primeiro)**:
- **Ciclo 19 — Siderúrgica** (`tools/mapgen/expansion6.mjs`): bloco 180×140 em (4,580), mapa 400×560 → **400×722**.
- **Ciclo 20 — Montadora** (`tools/mapgen/expansion7.mjs`): faixa própria, bloco 180×140 em y 746..885 (≥ 26 linhas
  de vazio abaixo da Siderúrgica), mapa → **400×888** (+59% de células no cliente em relação a hoje). A faixa vazia
  ao lado da Siderúrgica fica vazia para sempre (pintá-la depois contaria como tile alterado).
- Cada região: superfície (ly 0..99, com galpões de paredes `R`) + área inferior (ly 104..137); ~12–13 mil tiles
  andáveis cada, ~150 objetos, ~110 monstros (781 → ~1.000 no total). O mapa de cada uma sai completo na sua entrega
  (tile publicado nunca muda); spawns/NPCs/portas de 80–120 podem entrar numa 2ª rodada como objetos.
- **Memória do cliente** é o risco maior do ciclo 20: medir heap e tempo de carga antes e depois (400×722 e 400×888);
  se pesar, tirar a camada `collision` do parse do Phaser (o cliente já tem a grade de colisão própria) antes da
  Montadora.

**Portas de nível**: portais com `minLevel` (padrão `quest_door`) entre setores, ao lado de uma saída **sem** nível
(quem perde level não fica preso); monstro nunca pisa em portal, então não vaza de setor. Placas-NPC ("ÁREA QUENTE —
lv 40+") e luz em cada porta. Zonas com props `faixa` e `regiao` (o índice do mundo do ciclo 17 mostra a faixa).

### Siderúrgica (fantasia industrial: o Alto-Forno "acordou"; humor de chão de fábrica)

| Setor | Faixa | Destaques |
|---|---|---|
| Estação do Minério (PZ) | — | trem; loja (Almoxarife), depósito, bênção ("EPI espiritual") |
| Pátio de Minério | 10–25 | Caracol de Ferrugem, Guaxinim do Carvão (bando), Morcego da Chaminé, Gosma Cinzenta |
| Correias e Coqueria | 25–40 | Serpente da Correia, Gosma de Gusa, Coruja da Fuligem; **chefe Contramestre Fuligem (36)** |
| Alto-Forno | 40–60 | Salamandra do Cadinho, Golem de Escória, Fera das Brasas |
| Aciaria (galpão) | 60–80 | Cavaleiro de Aço Fundido, Coração de Brasa (cura aliados), Crânio Flamejante; **chefe Golem do Convertedor (76)** |
| Lingotamento e Laminação (+ Sala de Controle PZ) | 80–100 | Rex de Ferro, Elemental de Magma, Cão Infernal; posto avançado com viagem e depósito |
| Coração do Forno (área inferior, escura) | 100–120 | Forjador Rubro, Gosma de Aço Líquido, Colosso; **chefe final A Fornalha Primordial (118)** |

13 monstros novos + 3 chefes (sprites do pack sem uso: Mollusc, GoldRacoon, YellowsBat, Snake2, Owl2, Axolot, Grey
Trex, HeartRed, KnightGold, NinjaFire; e 4 por troca de paleta no `tools/monsters/recolor.mjs`: Gosma de Gusa, Golem
de Escória, Golem do Convertedor, Gosma de Aço). Bichos de fogo com fraqueza a gelo ("choque térmico"). 11 materiais
(Lasca de Ferrugem 20 … Frasco de Aço Líquido 4.200; gema nova Rubi), 3 itens de missão, comida (Limonada do Turno,
Prato Feito) e 8 peças de equipamento que fecham buracos (botas 50/70, anel 60, amuleto 70) — **todas abaixo do valor
do melhor item do slot no mesmo level**, para não mexer no simulador do Coliseu. **15 missões** do lv 10 ao 112
(Primeiro Turno → Ferrugem no Pátio → Turno da Noite → Limpa-Chaminé → Hora Extra [chefe, grupo] → A Correia que Nunca
Para → Bateria da Coqueria → Olhos na Fumaça → Sangria do Alto-Forno → Escória Viva → Sopro do Convertedor → O Golem
do Convertedor [chefe] → Chapa Fina → O Poço do Cadinho → A Fornalha Primordial [chefe final, grupo 5+]). 12 NPCs + 5
placas. **Evento**: Sangria do Alto-Forno, **segunda 17h** (Golem do Convertedor, loot +50%). Conquistas e títulos
("o Contramestre", "Mestre do Convertedor", "Coração de Aço").

**Acesso**: trem da Vila (250) e da Estação Central da Malha (200) → Estação do Minério (24,594); atalho oculto da
casinha de cargas da Malha (46,384) ↔ (8,591), `minLevel 10` na ida. O Caminhão de Bobinas (Siderúrgica ↔ Montadora)
entra no ciclo 20, como NPC-objeto acrescentado na Estação do Minério.

### Montadora (fantasia: as máquinas criaram vontade própria; carros saem amarelo-limão)

| Setor | Faixa | Destaques |
|---|---|---|
| Portaria (PZ) | — | caminhão-cegonha; cantina, depósito, enfermeira (bênção) |
| Pátio de Carros (+ Lava-Jato) | 10–25 | Calota Rolante, Serpente de Fiação, Gosma Azul; **chefe Sapão do Lava-Jato (26)** |
| Estamparia | 25–40 | Polvo de Graxa, Estampador Vermelho |
| Funilaria e Armação | 40–60 | Robô Soldador, Lagartixa de Faísca (bando) |
| Cabines de Pintura (+ estufa) | 60–80 | Mariposa de Tinta, Robô Pintor (cura aliados); **chefe Monstro da Estufa (74)** |
| Montagem Final (+ Sala de Descanso PZ) | 80–100 | Robô Montador, Dublê de Crash Test; posto avançado |
| Pista de Testes | 90–110 | Tengu Cromado, Piloto Fantasma; **alavanca "Crash Test" (2–4 jogadores)** com baú de anéis por vocação |
| Sala dos Protótipos | 110–120 | **chefe final O Protótipo (120)** |

12 monstros novos + 3 chefes; 10 materiais (Parafuso Solto 18 … Cromo Puro 3.800), 3 itens de missão, 7 peças de
equipamento + 4 anéis por vocação no baú do Crash Test (o helper `trinket` passa a aceitar `vocations`). **14 missões**
(Crachá de Visitante → Calotas Fujonas → Bolhas no Lava-Jato → O Sapão do Lava-Jato [chefe] → Prensa Desregulada →
Chapa Torta → Ponto de Solda → Curto na Armação → Névoa de Tinta → O Monstro da Estufa [chefe] → A Linha Não Pode
Parar → Crash Test → Cromados → O Protótipo [chefe final, grupo 5+]). 14 NPCs + 6 placas. **Evento**: Teste de Pista,
**quarta 13h** (O Protótipo, XP ×1,5 e loot +50%). Conquistas e títulos ("o Lava-Rápido", "Piloto de Testes").

**Acesso**: caminhão-cegonha novo na Vila (91,100) e destino novo no Cocheiro Dito da Oficina → Portaria (232,592);
atalho oculto do Pátio de Encomendas da Oficina (83,332) ↔ (218,591), `minLevel 10` na ida.

### Integração e arte

- **Tier 8 Abissal** também cai dos chefes finais (Fornalha e Protótipo, 5–8%); Rubi/Aço Líquido/Cromo entram como
  custo de encantamento e refino (ciclo 16); refino pode morar na Sala de Controle.
- **Quadro de Recompensas**: só **uma** faixa nova no topo (lv 114: Gosma de Aço, Piloto Fantasma, Tengu Cromado,
  Samurai Rubro); faixas antigas congeladas por teste (`BOUNTY_BANDS.slice(0, 11)`).
- **Arte Lemon nova** (~320 tiles, atlas 560 → ~880): `L.industry()` compartilhada (chapa xadrez, faixa zebrada,
  asfalto, esteira que acelera, canos copiados de `Pipes.png`, paredes metálicas), `L.steel()` (gusa por troca de cor
  da água, Alto-Forno, convertedor, carro-torpedo sobre o trilho, ponte rolante, laminador) e `L.factory()` (carros vistos
  de cima em 5 cores, cegonha, prensa, braço robótico, cabines, pista). Alocadas **só** dentro das etapas novas (ids
  antigos estáveis). Reaproveita estação/plataforma/sinais da ferrovia, braseiro, rachaduras de lava, cercas.
- **Ordem no `generate.mjs`**: a mesma da seção Execução (pela ordem de publicação; nunca inserir etapa antes de uma
  já publicada).

### Testes e medição

Validações no gerador (≥ 26 linhas de vazio, nada andável fora dos blocos, tudo alcançável, spawns dentro do setor e
com level da faixa, portas com `minLevel` crescente e saídas sem nível, salas da alavanca inalcançáveis a pé) +
`diff-world.mjs` (0 tiles alterados). Unitários: `monsters` (xp/hp, dano efetivo, chefes), `items` (equipamento novo
abaixo do vizinho do slot), `quests` (cada região cobre 10–112 sem buraco > 15 levels), `questWorld`, `npcs` (volta à
Vila, chegada em PZ), `events` (segunda 17h e quarta 13h sem sobrepor), `achievements`, `bounties` (faixas antigas
congeladas); **`arena.test.ts` passa sem mudar meta**. E2E `siderurgica.spec.ts` e `montadora.spec.ts` (viagens,
atalhos, login dentro, porta barra/abre pelo level, monstro do setor, alavanca com 2 jogadores). Carga:
`tools/loadtest.mjs --tp` dentro de cada região (olhar `[tick] … máx`), heap e tempo de carga do cliente com o mapa
400×722. Revisão de texto por grep antes da PR: nenhuma marca, fabricante, lugar real, "câmera", "sensor", "CLP",
"IoT" ou código de projeto.

Riscos: memória do cliente (+29% de células no ciclo 19, +59% no 20), `world.json` ~96 → ~115 KB (19) → ~135 KB
gzip (20), esforço de arte (sai final na entrega de cada região), percentual explorado de todos cai a cada região
(avisar nas Novidades).

---

## Execução

- **Um ciclo por PR**, na ordem 14 → 15 → 16 → 17 → 18 → 19 → 20. Os ciclos 14 e 15 são os mais urgentes (exploits e
  balanço); 16–18 podem ser fatiados por passo (cada passo já foi desenhado para ir sozinho à produção).
- Dentro de cada ciclo, o padrão dos ciclos 7–11: frentes de agentes com **arquivos separados** + **revisão cruzada**
  por outro agente; ligações no `WorldRoom` feitas na integração. As frentes só são lançadas depois deste plano
  aprovado (agentes lançados em modo de plano herdam o modo e não conseguem editar).
- Ordem das etapas de mapa no `generate.mjs` (nunca inserir antes de uma já publicada): `expand5` → objetos do ciclo
  16 (covis, Ferreiro) → bocas de caverna do ciclo 17 (`entrances14.mjs`, única etapa que muda tile antigo, só nos
  retângulos autorizados) → objetos do ciclo 18 (pontos de invasão, Mural) → `expand6` (Siderúrgica) → `expand7`
  (Montadora). Antes de cada etapa, guardar o `world.json` publicado no `%TEMP%` para o `diff-world.mjs`.
- Comunicação: cada ciclo fecha com `/fechar-ciclo` (CHANGELOG, ROADMAP, TEST_PLAN, Novidades, README/deploy).
  Mudanças que mexem no jogo de todos (escudo, morte, encantamento, faixas do mapa) ganham aviso nas Novidades e no
  `/anuncio` antes do deploy.
- Deploy como nos ciclos anteriores: imagem de rollback `lemonquest:pre-cicloNN`, `git pull`, rebuild, `/health` e
  logs; preferir servidor vazio (o dono autorizou deploy com gente online quando pedir).

## Verificação (por ciclo e no fim)

1. `npm run typecheck` e `npm test` verdes (hoje 1087 testes; cada ciclo acrescenta os seus).
2. E2E do ciclo com `--repeat-each=3` em 1 worker, sem rodar nada pesado junto (ver `[tick] … máx` no log antes de
   culpar o código). Suíte E2E completa no fim de cada ciclo grande.
3. Mapa: `node tools/mapgen/diff-world.mjs <world-publicado.json>` = 0 tiles alterados e N/N objetos antigos.
4. Balanço: `vocationBalance.test.ts` (pior/melhor ≥ 0,65), `arena.test.ts` com as metas, `monsters`/`items` com as
   regras de valor e XP/vida.
5. Produção: depois de cada deploy, `/health`, logs, e `admin.mjs telemetria` (mortes/h por faixa e causa, XP/h por
   vocação, gasto de ouro no 100+); revisão de 1 semana após o ciclo 15 e após o 16 (meta: gasto ≥ 50% do ganho no
   100+, nenhuma vocação abaixo de 0,65 do poder da mais forte, mortes/h do 60–80 abaixo de 6).
6. Capturas de tela (E2E com `E2E_SNAPS=1`) dos painéis novos e das regiões, olhadas antes do deploy.

## Fora deste plano (decisões já tomadas ou para depois)

- Mantidos como estão: regra de 2/3 do grupo e mentoria (não escolhidos nesta análise); perseguição "grudando" no
  alvo para quem ataca à distância (decisão anterior do dono, 22/10).
- Fica para depois (decisão do dono): Murphy/Onda 3 (C10-4), guilda, mercado entre jogadores, casas.
