# Siderúrgica — especificação executável (ciclo 19)

Fonte: `docs/PLANO_CICLOS_14-20.md`, seção "Ciclos 19–20" (aprovada pelo dono). Este documento fecha os números, as
coordenadas e os ids que o plano deixou em aberto, para três frentes trabalharem **em paralelo, em arquivos separados**.
Os ids daqui são o contrato entre as frentes: quem muda um id muda este arquivo primeiro e avisa as outras duas.

Regras que valem para tudo:

- **Só fantasia industrial**: o Alto-Forno "acordou", humor de chão de fábrica (turno, hora extra, crachá, marmita, EPI,
  prato feito). Nenhuma referência a empresa, cliente, marca, fabricante, lugar real, projeto ou código de projeto;
  nenhuma das palavras "câmera", "sensor", "CLP", "IoT". Pessoas só como personagens fictícios, nomeados pelo papel.
- **Mapa**: área nova cresce para baixo, nenhum tile antigo muda, nenhum tileset novo; objetos novos entram depois de
  todos os antigos; prova com `node tools/mapgen/diff-world.mjs <world-publicado.json>` (0 tiles alterados).
- **Balanço**: equipamento novo fica abaixo do valor do melhor item do mesmo slot no mesmo level (o modelo do Coliseu,
  `server/systems/balanceKit.ts`, escolhe por valor); `arena.test.ts` passa sem mudar meta.
- Dano de monstro neste documento: **número do fonte** (antes de `MONSTER_DAMAGE_TIERS`) e, entre parênteses ou em
  comentário, o número final que o jogo usa. Respawn de comum: fonte (o jogo aplica ×0,7).

Todos os números de monstro, missão e equipamento abaixo foram conferidos por script contra as regras dos testes atuais
(xp/vida em cadeia, ouro por faixa, habilidade ≤ 2× o dano, chefes vizinhos ±10% — inclusive os chefes de covil, que
passam a ter o Contramestre e a Fornalha como vizinhos —, XP de missão entre 0,3 e 2,5 levels, valor do equipamento).

## 0. Decisões principais

1. Bloco **180×140 em (4,580)**; mapa **400×560 → 400×722**. Último tile andável hoje: **y 552** (fundo das caves do
   ciclo 13). Primeiro andável da Siderúrgica: **y 583**. Vazio: **y 553–582 = 30 linhas** (mínimo 26).
2. Superfície em 6 setores selados (cerca, muro ou parede metálica) + **Coração do Forno** (área inferior escura, ly
   100–137). Setores só se ligam por **pares de portais**: porta com `minLevel` do lado de baixo, saída **sem** level do
   lado de cima, encostadas na mesma parede. Cadeia de níveis: **10 → 25 → 40 → 60 → 80 → 100**.
3. A **Estação do Minério** é a planta da Estação Central da Malha (mesmas coordenadas locais): chegada do trem
   **(24,594)** e portal oculto **(8,591)** batem com o plano sem conta extra.
4. Atalho oculto: porta da casinha de cargas da Malha **(46,384)** (`minLevel 10`) → (11,593); volta por (8,591) →
   (46,385). Trem: Vila **250**, Estação Central **200**, Sala de Controle → Vila/Minério/Malha.
5. 13 monstros + 3 chefes, ~110 monstros em 36 spawns; 6 monstros antigos reaproveitados nas faixas (Gosma Cinzenta,
   Fera das Brasas, Crânio Flamejante, Elemental de Magma, Cão Infernal, Colosso).
6. Sprites: 10 do pack (o "Grey Trex" tem espaço no nome da pasta), 4 recolors (`GusaSlime`, `SteelSlime`,
   `SlagGolem`, `ConverterGolem`), Contramestre = `Character/NinjaBomb`, Fornalha = `Boss/GiantBamboo2` (a "chaminé
   viva" laranja do pack, sem recolor).
7. 11 materiais (Rubi = `gem_red`, 1.500), 3 provas de chefe, 2 comidas, 8 peças (todas abaixo do melhor do slot).
8. 15 missões do lv 10 ao 112, maior buraco 14 levels; títulos "o Contramestre", "Mestre do Convertedor" (conquistas) e
   "Coração de Aço" (missão final). Evento **Sangria do Alto-Forno, segunda 17h–18h**, chefe Golem do Convertedor.
9. Arte nova (~320 tiles) só em fábricas de alocação adiada `L.industry()` e `L.steel()`, chamadas pela primeira vez
   dentro da etapa nova; gusa é recolor de tile de água para o **TilesetLemon** (não vira água de pesca).
10. Integração: **B → C → A** (o mapa por último, porque os testes do mapa exigem monstros e NPCs definidos).

Fora deste ciclo (vão para o 20, junto da Montadora): faixa nova do Quadro de Recompensas (lv 114) e Rubi/Aço Líquido
como custo de refino/encantamento (o plano junta Rubi, Aço Líquido e Cromo; mudar custo de sistema existente pede o
Cromo pronto). O Caminhão de Bobinas também é do ciclo 20, mas o tile dele fica reservado aqui (§1.4).

---

## 1. Geometria

### 1.1 Encaixe no mapa

| Item | Valor |
|---|---|
| Mapa antes / depois | 400×560 → **400×722** (`NEW_H6 = 722`) |
| Bloco | `BLOCK6 = { x0: 4, y0: 580, w: 180, h: 140 }` → x 4–183, y 580–719; local (lx, ly) → global (4+lx, 580+ly) |
| Último tile andável do mapa atual | y 552 (salas 3 e 4 das caves profundas; paredes em 553) |
| Primeiro tile andável da região | y 583 (ly 3: borda em ly 0–2) |
| Linhas sem nada andável | y 553–582 = **30** (validação exige ≥ 26) |
| Último andável da região | y 716 (ly 136, Coração do Forno); y 717–719 parede/borda; y 720–721 vazio |
| Folga para a Montadora (ciclo 20, bloco em y 746) | ≥ 29 linhas (746 − 1 − 716) |
| Faixa ao lado (x 184–399, y 560–721) | vazio sólido **para sempre** (pintar depois contaria como tile alterado) |

Toda linha nova (y 560–721) começa como vazio sólido (`'O', 1, 1` + colisão), como nas expansões 3–5.

### 1.2 Planta local (setores e linhas que selam)

Borda (não andável, árvores/muro/vazio): **lx ≤ 2, lx ≥ 177, ly ≤ 2** e, na superfície, **ly 97–99**; ly 100–101 vazio;
o Coração do Forno começa em ly 104 (paredes de 2 tiles em ly 102–103, regra das caves).

| Setor (nome da zona) | Faixa | Retângulo(s) local (inclusivo) | Global | Observação |
|---|---|---|---|---|
| Estação do Minério (PZ) | — | lx 3–36, ly 3–27 | x 7–40, y 583–607 (34×25) | anel de cerca em lx 3/36 e ly 3/27, **sem** brecha |
| Pátio de Minério | 10–25 | lx 37–95, ly 3–46 **+** lx 3–36, ly 28–46 | x 41–99, y 583–626 **+** x 7–40, y 608–626 | em L, abraça a Estação |
| Correias e Coqueria | 25–40 | lx 97–176, ly 3–46 | x 101–180, y 583–626 (80×44) | |
| Alto-Forno | 40–60 | lx 120–176, ly 48–96 | x 124–180, y 628–676 (57×49) | |
| Aciaria (galpão) | 60–80 | lx 62–118, ly 48–96 | x 66–122, y 628–676 (57×49) | interior, paredes metálicas |
| Lingotamento e Laminação | 80–100 | lx 3–60, ly 48–96 | x 7–64, y 628–676 (58×49) | |
| Sala de Controle (PZ) | — | lx 3–19, ly 48–63 | x 7–23, y 628–643 (17×16) | dentro do Lingotamento; vence pela menor área |
| Coração do Forno | 100–120 | lx 3–176, ly 100–137 | x 7–180, y 680–717 (174×38) | área inferior, escura |

Linhas que selam (1 tile, bloqueadas, nada andável nelas além dos portões de §1.3, que também são bloqueados):

| Linha (local) | Separa | Arte |
|---|---|---|
| lx 96, ly 3–46 | Pátio \| Correias | cerca de tela (`I.chainFence`) |
| ly 47, lx 3–60 e lx 120–176 | topo \| Lingotamento / Alto-Forno | muro de concreto (`I.concreteWall`) |
| ly 47, lx 61–119 | topo \| Aciaria | parede metálica (`I.metalWall`, topo do galpão) |
| lx 61, ly 48–96 | Lingotamento \| Aciaria | parede metálica |
| lx 119, ly 48–96 | Aciaria \| Alto-Forno | parede metálica |
| Sala de Controle: lx 20 (ly 48–63) e ly 63 (lx 3–20) | Sala \| Lingotamento | parede metálica; **vão aberto** em (11,63)–(12,63) (a Sala não é selada: é PZ dentro do setor) |

Teste de vedação (§7.1): BFS sem portais a partir de cada chegada só alcança tiles do próprio setor.

### 1.3 Portas de nível

Padrão para todas (como as caves do ciclo 13, mas nos dois lados da mesma parede): na parede, dois tiles de **portão**
(arte, bloqueados); do lado A (setor de baixo) um portal **com** `minLevel` encostado no portão leva ao lado B, 2 tiles
para dentro; do lado B um portal **sem** level leva de volta ao lado A, num tile vizinho (Chebyshev 1) da porta com
level. Monstro nunca pisa em portal, então nada vaza; quem perde level sempre sai. Objeto: `tileObj('portal', x, y,
{ toX, toY, minLevel }, 'quest_door')` na porta e `tileObj('portal', x, y, { toX, toY }, 'portal')` na saída.

| Porta | De → para | minLevel | Porta (A) → chegada (B) | Saída (B) → volta (A) | Portão (arte) |
|---|---|---|---|---|---|
| D1 | Estação → Pátio | **10** | (23,606) → (23,609) | (24,608) → (24,605) | (23,607) (24,607) cancela `R.gate(false)` |
| D2 | Pátio → Correias | **25** | (99,604) → (102,604) | (101,605) → (98,605) | (100,604) (100,605) `I.slidingDoor('v')` |
| D3 | Correias → Alto-Forno | **40** | (152,626) → (152,629) | (153,628) → (153,625) | (152,627) (153,627) `I.slidingDoor('h')` |
| D4 | Alto-Forno → Aciaria | **60** | (124,652) → (121,652) | (122,653) → (125,653) | (123,652) (123,653) `I.slidingDoor('v')` |
| D5 | Aciaria → Lingotamento | **80** | (66,660) → (63,660) | (64,661) → (67,661) | (65,660) (65,661) `I.slidingDoor('v')` |
| D6 | Lingotamento → Coração do Forno | **100** | escotilha (34,672) → (34,686) | (34,683) → (35,673) | escotilha `T.hatch()` com corrimão `'H'` em (33..35,671) e (33,672) (35,672); saída com arte de porta `['D', 2, 0]` na parede norte da sala 0 |

Em local: D1 (19,26)→(19,29), (20,28)→(20,25); D2 (95,24)→(98,24), (97,25)→(94,25); D3 (148,46)→(148,49),
(149,48)→(149,45); D4 (120,72)→(117,72), (118,73)→(121,73); D5 (62,80)→(59,80), (60,81)→(63,81); D6 (30,92)→(30,106),
(30,103)→(31,93). Luz em cada porta: `light` raio 4 `#ffd060` (sem tremor) no primeiro tile do portão; escotilha raio 4
`#ff7a30` com tremor; chegada embaixo raio 3 `#ffe066`.

### 1.4 Pontos fixos (o mapa não pode cobrir nem pôr nada colado)

| Ponto | Local | Global |
|---|---|---|
| Chegada do trem (plataforma 1) | (20,14) | **(24,594)** |
| Portal oculto na Estação → Malha | (4,11) | **(8,591)** → (46,385) |
| Chegada do portal oculto vindo da Malha | (7,13) | (11,593) |
| Porta da casinha de cargas na Malha (objeto novo no mapa antigo) | — | **(46,384)** → (11,593), `minLevel 10` |
| Volta na Malha | — | (46,385) (andável, Chebyshev 1 da porta, na PZ da Estação Central) |
| Chegada de viagem na Sala de Controle (opcional C7, §4.3) | (11,57) | (15,637) |
| Reserva do Caminhão de Bobinas (ciclo 20, npc `mt_bobinas_sid`): tile e vizinhos livres, na PZ, a ≥ 7 de outro NPC | (26,25) | (30,605) |

NPCs (17 = 12 + 5 placas; viram obstáculo em jogo):

| npcId | Local | Global | Setor |
|---|---|---|---|
| `chefe_estacao_minerio` | (16,12) | (20,592) | Estação (plataforma 1) |
| `almoxarife` | (23,12) | (27,592) | Estação |
| `depot_minerio` | (28,12) | (32,592) | Estação |
| `capela_epi` | (30,18) | (34,598) | Estação (plataforma 2) |
| `mestre_turno` | (17,24) | (21,604) | Estação, ao lado do portão sul |
| `operadora_correia` | (103,12) | (107,592) | Correias e Coqueria |
| `encarregada_coqueria` | (128,10) | (132,590) | Correias e Coqueria (frente da bateria de fornos) |
| `forneiro_chefe` | (130,62) | (134,642) | Alto-Forno |
| `mestre_aciaria` | (112,54) | (116,634) | Aciaria |
| `operador_laminador` | (7,52) | (11,632) | Sala de Controle |
| `supervisora_controle` | (11,52) | (15,632) | Sala de Controle |
| `espirito_fundidor` | (15,52) | (19,632) | Sala de Controle |
| `placa_correias` | (94,21) | (98,601) | Pátio, ao lado de D2 |
| `placa_area_quente` | (145,45) | (149,625) | Correias, ao lado de D3 |
| `placa_epi` | (122,69) | (126,649) | Alto-Forno, ao lado de D4 |
| `placa_carga_suspensa` | (64,77) | (68,657) | Aciaria, ao lado de D5 |
| `placa_forno_acordado` | (27,90) | (31,670) | Lingotamento, ao lado da escotilha |

### 1.5 O que desenhar em cada setor

Coordenadas locais. Posições de estrutura são orientação (a frente A pode mover até ~3 tiles para caber a arte), desde
que portas, chegadas, NPCs e spawns de §3.5 fiquem livres com 2 tiles de folga e as validações de §7.1 passem.

**Estação do Minério (PZ)** — cópia da planta da Estação Central (`expansion4.mjs`, trecho "Estação Central"; **copiar,
não importar nem refatorar** a etapa publicada): `R.station()` em (11,6) com 3 linhas de base; plataformas lx 6–33 ×
ly 11–15 e lx 9–32 × ly 17–19; bancos (19,11) (25,11) (13,18) (27,18); relógios (12,13) (21,17); postes `lamp` em
lx 10/30 (ly 11) e 17/24 (ly 19); sinais (35,14) verde e (35,21) vermelho; caixotes e barril como na Malha; casinha
`houseOrange` (5,22), barril (10,24), caixotes (11,24) (11,25); árvores 2×2 em (5,5) (8,5) (24,5) (30,5) (34,6) (29,23)
(33,24). Diferenças: anel de cerca **fechado** (sem as brechas da Malha), via 1 `[5,16]→[33,16]` e via 2 `[8,20]→[32,20]`
com para-choque nas duas pontas (`endA`, `endB`), cancela de D1 no lugar da brecha sul, sem `chegou_drop`.

**Pátio de Minério (10–25)** — chão de brita (`R.gravel`), avenida de asfalto 3 tiles (`I.asphalt` + faixa pintada) de
(12,29) para leste por ly 29–31 até lx 90, subindo por lx 88–90 até ly 24 e entrando em D2; via norte-sul de asfalto em
lx 40–42 (ly 5–29). Ramal do Minério: `[40,6]→[92,6]` e `[44,14]→[90,14]`, ambos com para-choque; vagões `hopper` em
(44,6) (47,6) (50,6), locomotiva em (70,6). Pilhas de minério de ferro `T.orePile('ferro')` em (45,20) (52,22) (74,18);
de carvão `T.orePile('carvao')` em (60,20); esteira saindo em (84..95,18) rumo às Correias (continua do outro lado da
cerca). Faixa sul (lx 3–36, ly 28–46): montes de escória (`S.rubbleGray`) e brita. Postes a cada ~12 tiles na avenida.

**Correias e Coqueria (25–40)** — chão de concreto (`I.concrete`). Esteiras andáveis (velocidade 70, `I.belt`): correia 1
ly 18–19 de lx 97 a 141, subindo por lx 140–141 até ly 9; correia 2 ly 32–33 de lx 100 a 150 (para antes da arena).
Galerias de esteira elevada na camada `above` sobre as duas. Bateria de fornos de coque `T.cokeOven` em lx 112–146 × ly
4–7 (bloqueia; portas com brilho voltadas para o sul), torre de apagamento `T.quenchTower` (150,4), chaminé `T.chimney`
(160,3), silos 3×3 em (100..102,4..6). Canos `I.pipe` aéreos ao longo de ly 8 (lx 112–146). Pátio da Coqueria (arena do chefe): lx
152–176 × ly 26–46, concreto aberto com montes de coque nas bordas; raio 6 em volta de (164,34) livre.

**Alto-Forno (40–60)** — concreto e chapa xadrez (`I.checker`) na casa de corrida. Alto-Forno `T.blastFurnace()` (6×9)
em lx 140–145 × ly 54–62; três regeneradores `T.stove()` (2×6) em lx 124/128/132, ly 49–54. Canal de gusa (`T.gusa`,
bloqueado, luz `#ff6020` com tremor a cada ~3 tiles) do furo do forno (142,63) para o sul até ly 80, com duas
passarelas de chapa; via dos carros-torpedo `[122,84]→[175,84]` com para-choques e `T.torpedoCv` em lx 146 e 156. Poços
de escória (`T.slag`) em lx 164–175 × ly 88–95. Braseiros `S.brazier` nos cantos.

**Aciaria (60–80, galpão)** — paredes metálicas em todo o perímetro, chão de chapa xadrez com faixas zebradas
(`I.stripe`) marcando corredores em ly 70 e lx 90. Nave dos convertedores (noroeste): `T.converter()` (4×4) em (65,49) e
(84,49), plataforma de chapa entre eles; o chefe nasce em (76,58) — lx 70–82 × ly 52–64 livre. Panelas `T.ladle()` em (96,50) e
(104,50). Via do carro de panela `[64,70]→[116,70]`. Ponte rolante (`T.crane`, camada `above`, só visual) em ly 64 e ly
82, de lx 62 a 118. Pátio de sucata `T.scrap` em lx 113–117 × ly 90–95. Iluminação de galpão: luz fixa a cada ~10 tiles.

**Lingotamento e Laminação (80–100)** — chapa e concreto. Sala de Controle (§1.2) com mesas `T.controlDesk()` em
(5..7,49) e (13..15,49), NPCs em ly 52. Máquina de lingotamento contínuo (torre de panela + distribuidor) em lx 30–36 ×
ly 50–55. Mesas de rolos `T.rollerTable` (bloqueiam; algumas com placa quente): ly 68 de lx 24 a 58 com passagem em lx
40–41, e ly 82 de lx 22 a 40 com passagem em lx 30–31. Cadeiras de laminação `T.millStand()` (3×3) em (28,66) e (50,66).
Pátio de bobinas `T.coil` em lx 50–56 × ly 72–78. Escotilha do Poço do Cadinho em (30,92) (§1.3).

### 1.6 Coração do Forno (área inferior, escura)

Estilo das caves "abyss": piso `'I'` (20–21, 14–15), paredes `'R'` (regra de parede das caves: vizinho de piso ou piso 2
abaixo), pilares de rocha, `S.crackLava` com luz, ossos, braseiros nos cantos das salas grandes; poças e rios de gusa
(`T.gusa`) e crosta de escória (`T.slag`), sempre bloqueados.

| # | Sala | Retângulo local | Chanfro |
|---|---|---|---|
| 0 | Entrada (saída de D6 na parede norte em (30,103); chegada (30,106)) | lx 22–38, ly 104–112 | 2 |
| 1 | corredor 0→2 | lx 39–46, ly 107–109 | 0 |
| 2 | Galeria da Gusa (rio de gusa norte-sul em lx 74–75, passarelas em ly 108–109 e 116–117) | lx 47–100, ly 104–121 | 3 |
| 3 | corredor 2→4 | lx 101–106, ly 112–114 | 0 |
| 4 | Salão dos Forjadores (poças 3×3 de gusa em (130..132,110..112)) | lx 107–140, ly 106–130 | 3 |
| 5 | corredor 2→6 | lx 70–72, ly 122–125 | 0 |
| 6 | Fosso de Escória | lx 20–100, ly 126–136 | 2 |
| 7 | corredor 4→8 | lx 141–146, ly 117–119 | 0 |
| 8 | Cadinho Primordial (chefe em (161,120); anel de gusa junto às paredes, centro com raio 6 livre) | lx 147–175, ly 104–136 | 4 |

### 1.7 Zonas (objetos `zone` com `rect: true`; a tabela está em tiles, o objeto grava ×16)

Props: `music`, `pz` (true só nas duas PZ), **`faixa`** (texto ASCII `"10-25"`; PZ sem faixa) e **`regiao`**
(`"Siderúrgica"`). Hoje nada lê `faixa`/`regiao` (o índice do mundo tira a faixa dos spawns); ficam gravadas e testadas.

| Zona | x, y (tiles) | w×h | pz | faixa | music |
|---|---|---|---|---|---|
| Estação do Minério | 7, 583 | 34×25 | true | — | `36 - Village.ogg` |
| Pátio de Minério | 41, 583 | 59×44 | false | 10-25 | `23 - Road.ogg` |
| Pátio de Minério | 7, 608 | 34×19 | false | 10-25 | `23 - Road.ogg` |
| Correias e Coqueria | 101, 583 | 80×44 | false | 25-40 | `28 - Tension.ogg` |
| Alto-Forno | 124, 628 | 57×49 | false | 40-60 | `17 - Fight.ogg` |
| Aciaria | 66, 628 | 57×49 | false | 60-80 | `10 - Dark Castle.ogg` |
| Lingotamento e Laminação | 7, 628 | 58×49 | false | 80-100 | `21 - Dungeon.ogg` |
| Sala de Controle | 7, 628 | 17×16 | true | — | `27 - Chill.ogg` |
| Coração do Forno | 7, 680 | 174×38 | false | 100-120 | `24 - Final Area.ogg` |

Luz ambiente (`packages/shared/src/daynight.ts`, `ZONE_MODES`): Estação do Minério `lit`, Sala de Controle `lit`,
Aciaria `lit`, Coração do Forno `dark`; o resto ao ar livre (padrão).

---

## 2. Acesso

| Via | Origem | Destino | Preço | Onde muda |
|---|---|---|---|---|
| Trem | Chefe da Estação de Pedra Clara (`chefe_estacao_vila`, Vila 95,100) | Estação do Minério (24,594) | **250** | `npcs.ts` (frente C) |
| Trem | Chefe da Estação Central (`chefe_estacao_malha`) | Estação do Minério (24,594) | **200** | `npcs.ts` |
| Trem de volta | `chefe_estacao_minerio` | Vila (97,98) 250 · Estação Central (60,374) 200 | | `npcs.ts` |
| Posto avançado | `supervisora_controle` (Sala de Controle) | Vila 250 · Estação do Minério 100 · Estação Central 200 | | `npcs.ts` |
| Atalho oculto (ida) | porta da casinha de cargas da Malha **(46,384)**, `minLevel 10` | (11,593) | — | objeto novo em `expansion6.mjs` (frente A) |
| Atalho oculto (volta) | (8,591) na Estação do Minério, sem level | (46,385) | — | `expansion6.mjs` |

Até o level 8 o trem é de graça (`TRAVEL_FREE_LEVEL`): um novato chega à Estação (PZ) mas só sai dela pelo portão sul
no level 10 (D1). O atalho é o que deixa a região alcançável a pé a partir do templo (o servidor só aceita login dentro
de área alcançável) — por isso é obrigatório, como o portal oculto da Malha.

Validação do atalho no mapa antigo (frente A): (46,384) andável, sem objeto antigo em cima, não é portal nem destino de
portal antigo; (46,385) andável, não é portal, Chebyshev 1 da porta. Nenhum tile da Malha muda: só o objeto portal.

---

## 3. Monstros, itens e spawns (frente B, exceto §3.5 que é da A)

### 3.1 Monstros

| id | Nome | lv | Vida | XP | Dano fonte (final) | Elemento | Arm. | Ataque ms / alcance | Passo ms | Aggro | Respawn fonte | Ouro | Extra |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `caracol_ferrugem` | Caracol de Ferrugem | 12 | 160 | 70 | 8–18 (8–18) | físico | 6 | 2200 / 1 | 560 | 4 | 45 s | 12–28 | Cuspe de Ferrugem (lentidão) |
| `guaxinim_carvao` | Guaxinim do Carvão | 15 | 165 | 90 | 10–22 (10–22) | físico | 3 | 1700 / 1 | 270 | 6 | 45 s | 18–42 | bando `guaxinim`, foge a 20% |
| `morcego_chamine` | Morcego da Chaminé | 19 | 190 | 116 | 13–28 (13–28) | físico | 2 | 1700 / 1 | 230 | 7 | 45 s | 20–46 | Nuvem de Fuligem (veneno) |
| `serpente_correia` | Serpente da Correia | 27 | 330 | 275 | 22–46 (31–64) | físico | 8 | 1900 / 1 | 260 | 6 | 60 s | 60–140 | Chicote de Borracha |
| `gosma_gusa` | Gosma de Gusa | 31 | 400 | 380 | 25–50 (35–70) | fogo | 6 | 2000 / 1 | 400 | 5 | 60 s | 60–130 | bando `gusa`; Respingo de Gusa |
| `coruja_fuligem` | Coruja da Fuligem | 35 | 430 | 460 | 28–56 (39–78) | físico | 6 | 2000 / 4 | 320 | 7 | 60 s | 80–175 | Chuva de Fuligem (área, lentidão) |
| `contramestre_fuligem` | Contramestre Fuligem | 36 | 6.500 | 6.500 | 64–120 (90–168) | físico | 14 | 2000 / 1 | 360 | 8 | 2 h | 1.600–2.800 | **chefe**; pisão r2; chama 2 guaxinins |
| `salamandra_cadinho` | Salamandra do Cadinho | 43 | 680 | 900 | 40–80 (60–120) | fogo | 10 | 2000 / 3 | 340 | 7 | 75 s | 110–215 | Cuspe de Gusa (queimadura) |
| `golem_escoria` | Golem de Escória | 53 | 1.150 | 1.650 | 62–118 (93–177) | físico | 20 | 2100 / 1 | 460 | 6 | 85 s | 150–290 | Desabamento de Escória |
| `cavaleiro_aco_fundido` | Cavaleiro de Aço Fundido | 64 | 1.700 | 2.800 | 78–148 (117–222) | físico | 26 | 1900 / 1 | 340 | 6 | 95 s | 200–390 | Golpe Rubro (fogo, queimadura) |
| `coracao_brasa` | Coração de Brasa | 67 | 1.300 | 2.200 | 62–120 (93–180) | fogo | 12 | 2200 / 4 | 380 | 7 | 95 s | 190–380 | **cura aliados** (primeira habilidade) |
| `golem_convertedor` | Golem do Convertedor | 76 | 21.000 | 24.000 | 140–260 (224–416) | fogo | 28 | 2200 / 1 | 420 | 9 | 3 h | 4.800–8.500 | **chefe** do evento; sopro em cone; chama Golem de Escória |
| `rex_ferro` | Rex de Ferro | 88 | 3.600 | 7.000 | 108–205 (173–328) | físico | 34 | 2100 / 1 | 330 | 6 | 120 s | 330–660 | Pisada do Laminador r2 |
| `forjador_rubro` | Forjador Rubro | 104 | 5.200 | 11.200 | 135–255 (230–434) | fogo | 32 | 2000 / 4 | 320 | 7 | 140 s | 440–880 | Chuva de Fagulhas, Martelada em Brasa |
| `gosma_aco_liquido` | Gosma de Aço Líquido | 114 | 7.000 | 15.800 | 150–290 (255–493) | fogo | 38 | 2000 / 1 | 380 | 6 | 160 s | 520–1.050 | Respingo de Aço r2 |
| `fornalha_primordial` | A Fornalha Primordial | 118 | 55.000 | 72.000 | 215–400 (366–680) | fogo | 46 | 2000 / 4 | 400 | 9 | 4 h | 14.000–24.000 | **chefe final**; área, cone, chama Gosma de Aço, se cura a 30% |

Monstros antigos reaproveitados (nenhuma mudança neles): `slag_slime` Gosma Cinzenta (20, Pátio), `truque_desalinhado`
Fera das Brasas (48, Alto-Forno), `flame_skull` Crânio Flamejante (70, Aciaria), `magma_elemental` (86) e `hellhound`
(95) no Lingotamento, `juggernaut` Colosso (110, Coração do Forno).

Bicho de fogo resiste a fogo e é fraco a gelo automaticamente (`ELEMENT_WEAKNESS`, o "choque térmico" do plano).

Conferido por script com estes números: cadeia xp/vida (cada um ≥ 0,9× o anterior em level), ouro máximo por faixa de 10
levels e "20 levels acima paga mais", habilidade ≤ 2× o dano máximo final, e a regra dos chefes vizinhos ±10% (xp/vida,
dano máximo, ouro/vida). Atenção: com estes chefes, `lair_mole_king` passa a ter o Contramestre como vizinho de cima e
`lair_flame` passa a ter a Fornalha — os dois continuam dentro da faixa (0,80 em [0,64; 1,10] e 1,18 em [1,08; 1,44]).

Entradas para `packages/shared/src/data/monsters.ts`, no fim de `MONSTERS` (depois de `lair_shogun`), prontas para colar:

```ts
  // ===== Siderúrgica (ciclo 19, tools/mapgen/expansion6.mjs): o Alto-Forno acordou. Atributos interpolados dos vizinhos
  // de level (xp/vida, ouro e chefes conferidos nos testes); dano no fonte ANTES de MONSTER_DAMAGE_TIERS (final no
  // comentário). Bicho de fogo: resiste a fogo e é fraco a gelo ("choque térmico").
  // Pátio de Minério (lv 10–25)
  caracol_ferrugem: {
    id: "caracol_ferrugem", name: "Caracol de Ferrugem", level: 12, hp: 160, xp: 70, damage: [8, 18], damageKind: "physical", armor: 6,
    abilities: [
      ability.bolt({ name: "Cuspe de Ferrugem", range: 3, min: 10, max: 20, kind: "earth", fx: "earth", cooldownMs: 10_000, condition: { id: "slow", durationMs: 2500, value: 20 } }),
    ],
    attackMs: 2200, attackRange: 1, stepMs: 560, aggroRange: 4, fleeAtHpPct: 0, respawnMs: 45_000,
    gold: [12, 28],
    loot: [
      { itemId: "lasca_ferrugem", chance: 0.55, min: 1, max: 2 },
      { itemId: "health_potion", chance: 0.1 },
      { itemId: "mana_potion", chance: 0.06 },
      { itemId: "iron_bar", chance: 0.03 },
      { itemId: "iron_boots", chance: 0.015 },
    ],
    sprite: grid4(M + "Mollusc/Mollusc.png"),
  },
  guaxinim_carvao: {
    id: "guaxinim_carvao", name: "Guaxinim do Carvão", level: 15, hp: 165, xp: 90, damage: [10, 22], damageKind: "physical", armor: 3,
    attackMs: 1700, attackRange: 1, stepMs: 270, aggroRange: 6, fleeAtHpPct: 0.2, respawnMs: 45_000,
    pack: { family: "guaxinim", shout: "Ei! O carvão é nosso!" },
    gold: [18, 42],
    loot: [
      { itemId: "pedra_carvao", chance: 0.5, min: 1, max: 3 },
      { itemId: "lasca_ferrugem", chance: 0.15 },
      { itemId: "cheese", chance: 0.2, min: 1, max: 2 },
      { itemId: "health_potion", chance: 0.1 },
      { itemId: "ring_vigor", chance: 0.01 },
    ],
    sprite: grid4(M + "GoldRacoon/SpriteSheet.png", { tint: 0x8c8c98 }),
  },
  morcego_chamine: {
    id: "morcego_chamine", name: "Morcego da Chaminé", level: 19, hp: 190, xp: 116, damage: [13, 28], damageKind: "physical", armor: 2,
    abilities: [
      ability.bolt({ name: "Nuvem de Fuligem", range: 3, min: 12, max: 24, kind: "earth", fx: "earth", cooldownMs: 9000, condition: { id: "poison", durationMs: 5000, value: 3 } }),
    ],
    attackMs: 1700, attackRange: 1, stepMs: 230, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 45_000,
    gold: [20, 46],
    loot: [
      { itemId: "fuligem", chance: 0.5, min: 1, max: 2 },
      { itemId: "bat_wing", chance: 0.15 },
      { itemId: "mana_potion", chance: 0.08 },
      { itemId: "health_potion_medium", chance: 0.04 },
      { itemId: "amulet_arcano", chance: 0.008 },
    ],
    sprite: grid4(M + "YellowsBat/SpriteSheet.png", { tint: 0xb0a49c }),
  },
  // Correias e Coqueria (lv 25–40)
  serpente_correia: {
    id: "serpente_correia", name: "Serpente da Correia", level: 27, hp: 330, xp: 275, damage: [22, 46], damageKind: "physical", armor: 8, // final [31, 64]
    abilities: [
      ability.stomp({ name: "Chicote de Borracha", radius: 1, min: 24, max: 44, cooldownMs: 11_000 }), // final 34–62
    ],
    attackMs: 1900, attackRange: 1, stepMs: 260, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 60_000,
    gold: [60, 140],
    loot: [
      { itemId: "tira_correia", chance: 0.45, min: 1, max: 2 },
      { itemId: "snake_skin", chance: 0.15 },
      { itemId: "health_potion_medium", chance: 0.08 },
      { itemId: "steel_boots", chance: 0.006 },
      { itemId: "ring_furia", chance: 0.004 },
    ],
    sprite: grid4(M + "Snake2/Snake2.png", { tint: 0x8a8a96 }),
  },
  gosma_gusa: {
    id: "gosma_gusa", name: "Gosma de Gusa", level: 31, hp: 400, xp: 380, damage: [25, 50], damageKind: "fire", armor: 6, // final [35, 70]
    abilities: [
      ability.stomp({ name: "Respingo de Gusa", radius: 1, min: 28, max: 50, kind: "fire", fx: "fire", cooldownMs: 11_000, condition: { id: "burn", durationMs: 4000, value: 6 } }), // final 39–70
    ],
    attackMs: 2000, attackRange: 1, stepMs: 400, aggroRange: 5, fleeAtHpPct: 0, respawnMs: 60_000,
    pack: { family: "gusa", shout: "Blorp! Tá quente, hein?" },
    gold: [60, 130],
    loot: [
      { itemId: "gota_gusa", chance: 0.45, min: 1, max: 2 },
      { itemId: "escoria_quente", chance: 0.2 },
      { itemId: "iron_bar", chance: 0.06 },
      { itemId: "health_potion_medium", chance: 0.08 },
      { itemId: "mana_potion_medium", chance: 0.06 },
    ],
    sprite: grid4("monsters/GusaSlime.png"),
  },
  coruja_fuligem: {
    id: "coruja_fuligem", name: "Coruja da Fuligem", level: 35, hp: 430, xp: 460, damage: [28, 56], damageKind: "physical", armor: 6, // final [39, 78]
    abilities: [
      ability.blast({ name: "Chuva de Fuligem", radius: 1, range: 4, min: 30, max: 56, kind: "earth", fx: "earth", cooldownMs: 10_000, condition: { id: "slow", durationMs: 3000, value: 30 } }), // final 42–78
    ],
    attackMs: 2000, attackRange: 4, stepMs: 320, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 60_000,
    gold: [80, 175],
    loot: [
      { itemId: "pena_fuligem", chance: 0.4, min: 1, max: 2 },
      { itemId: "fuligem", chance: 0.3, min: 1, max: 3 },
      { itemId: "mana_potion_medium", chance: 0.12 },
      { itemId: "lente_trincada", chance: 0.05 },
      { itemId: "archmage_boots", chance: 0.005 },
    ],
    sprite: grid4(M + "Owl2/Owl2.png"),
  },
  // Chefe das Correias e Coqueria: grita, chama a turma de guaxinins e não paga a hora extra.
  contramestre_fuligem: {
    id: "contramestre_fuligem", name: "Contramestre Fuligem", level: 36, hp: 6500, xp: 6500, damage: [64, 120], damageKind: "physical", armor: 14, // final [90, 168]
    abilities: [
      ability.stomp({ name: "Bronca do Contramestre", radius: 2, min: 70, max: 125, windupMs: 900, cooldownMs: 11_000 }), // final 98–175
      ability.summon({ name: "Turma, pro pátio!", monsterId: "guaxinim_carvao", count: 2, max: 3, cooldownMs: 25_000 }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 360, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [1600, 2800],
    loot: [
      { itemId: "apito_contramestre", chance: 1 },
      { itemId: "health_potion_large", chance: 1, min: 2, max: 3 },
      { itemId: "pedra_carvao", chance: 1, min: 4, max: 8 },
      { itemId: "fuligem", chance: 1, min: 3, max: 6 },
      { itemId: "gem_green", chance: 0.8, min: 1, max: 2 },
      { itemId: "mithril_bar", chance: 0.3 },
      { itemId: "gem_red", chance: 0.15 },
      { itemId: "ring_furia", chance: 0.2 },
      { itemId: "amulet_lich", chance: 0.15 },
      { itemId: "capacete_fundidor", chance: 0.2 },
    ],
    sprite: grid4(C + "NinjaBomb/SpriteSheet.png", { scale: 1.6 }),
  },
  // Alto-Forno (lv 40–60)
  salamandra_cadinho: {
    id: "salamandra_cadinho", name: "Salamandra do Cadinho", level: 43, hp: 680, xp: 900, damage: [40, 80], damageKind: "fire", armor: 10, // final [60, 120]
    abilities: [
      ability.bolt({ name: "Cuspe de Gusa", range: 4, min: 45, max: 85, kind: "fire", fx: "fire", cooldownMs: 9000, condition: { id: "burn", durationMs: 5000, value: 8 } }), // final 68–128
    ],
    attackMs: 2000, attackRange: 3, stepMs: 340, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 75_000,
    gold: [110, 215],
    loot: [
      { itemId: "escama_salamandra", chance: 0.35 },
      { itemId: "gota_gusa", chance: 0.25 },
      { itemId: "ember", chance: 0.04 },
      { itemId: "mana_potion_medium", chance: 0.12 },
      { itemId: "health_potion_large", chance: 0.06 },
      { itemId: "ember_wand", chance: 0.006 },
    ],
    sprite: grid4(M + "Axolot/SpriteSheet.png", { scale: 1.15 }),
  },
  golem_escoria: {
    id: "golem_escoria", name: "Golem de Escória", level: 53, hp: 1150, xp: 1650, damage: [62, 118], damageKind: "physical", armor: 20, // final [93, 177]
    abilities: [
      ability.stomp({ name: "Desabamento de Escória", radius: 1, min: 65, max: 120, cooldownMs: 11_000 }), // final 98–180
    ],
    attackMs: 2100, attackRange: 1, stepMs: 460, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 85_000,
    gold: [150, 290],
    loot: [
      { itemId: "bloco_escoria", chance: 0.4, min: 1, max: 2 },
      { itemId: "escoria_quente", chance: 0.3, min: 1, max: 2 },
      { itemId: "iron_bar", chance: 0.12 },
      { itemId: "health_potion_large", chance: 0.08 },
      { itemId: "capacete_fundidor", chance: 0.004 },
      { itemId: "mithril_legs", chance: 0.004 },
    ],
    sprite: grid4("monsters/SlagGolem.png", { scale: 1.2 }),
  },
  // Aciaria (lv 60–80)
  cavaleiro_aco_fundido: {
    id: "cavaleiro_aco_fundido", name: "Cavaleiro de Aço Fundido", level: 64, hp: 1700, xp: 2800, damage: [78, 148], damageKind: "physical", armor: 26, // final [117, 222]
    abilities: [
      ability.stomp({ name: "Golpe Rubro", radius: 1, min: 85, max: 150, kind: "fire", fx: "fire", windupMs: 800, cooldownMs: 10_000, condition: { id: "burn", durationMs: 5000, value: 12 } }), // final 128–225
    ],
    attackMs: 1900, attackRange: 1, stepMs: 340, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 95_000,
    gold: [200, 390],
    loot: [
      { itemId: "placa_aco_fundido", chance: 0.35 },
      { itemId: "iron_bar", chance: 0.15 },
      { itemId: "gem_red", chance: 0.02 },
      { itemId: "health_potion_large", chance: 0.12, min: 1, max: 2 },
      { itemId: "calca_antichama", chance: 0.004 },
      { itemId: "crown_legs", chance: 0.004 },
    ],
    // Tingido de brasa: o KnightGold puro é o Mestre Brás (Ferreiro) e a roupa "Senhor da Guerra".
    sprite: grid4(C + "KnightGold/SpriteSheet.png", { tint: 0xff9a6a, scale: 1.1 }),
  },
  coracao_brasa: {
    id: "coracao_brasa", name: "Coração de Brasa", level: 67, hp: 1300, xp: 2200, damage: [62, 120], damageKind: "fire", armor: 12, // final [93, 180]
    abilities: [
      ability.healAllies({ name: "Pulso Quente", pct: 0.12, radius: 4, belowHpPct: 0.7, cooldownMs: 10_000 }),
      ability.bolt({ name: "Chama Pulsante", range: 4, min: 70, max: 125, kind: "fire", fx: "fire", cooldownMs: 9000 }), // final 105–188
    ],
    attackMs: 2200, attackRange: 4, stepMs: 380, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 95_000,
    gold: [190, 380],
    loot: [
      { itemId: "ember", chance: 0.3, min: 1, max: 2 },
      { itemId: "gota_gusa", chance: 0.25, min: 1, max: 2 },
      { itemId: "gem_red", chance: 0.04 },
      { itemId: "mana_potion_large", chance: 0.12 },
      { itemId: "botas_termicas", chance: 0.003 },
      { itemId: "spellbook_mystic", chance: 0.003 },
    ],
    sprite: grid4(M + "HeartRed/SpriteSheet.png", { scale: 1.1 }),
  },
  // Chefe da Aciaria e do evento "Sangria do Alto-Forno" (segunda 17h): o convertedor levantou do berço.
  golem_convertedor: {
    id: "golem_convertedor", name: "Golem do Convertedor", level: 76, hp: 21000, xp: 24000, damage: [140, 260], damageKind: "fire", armor: 28, // final [224, 416]
    abilities: [
      ability.breath({ name: "Sopro de Oxigênio", length: 4, width: 3, min: 150, max: 270, kind: "fire", fx: "fire", windupMs: 900, cooldownMs: 10_000, condition: { id: "burn", durationMs: 6000, value: 20 } }), // final 240–432
      ability.summon({ name: "Escória, de pé!", monsterId: "golem_escoria", count: 1, max: 2, cooldownMs: 30_000 }),
    ],
    attackMs: 2200, attackRange: 1, stepMs: 420, aggroRange: 9, fleeAtHpPct: 0, respawnMs: 10_800_000, boss: true,
    gold: [4800, 8500],
    loot: [
      { itemId: "nucleo_convertedor", chance: 1 },
      { itemId: "health_potion_large", chance: 1, min: 3, max: 5 },
      { itemId: "placa_aco_fundido", chance: 1, min: 3, max: 6 },
      { itemId: "gem_red", chance: 0.6, min: 1, max: 2 },
      { itemId: "gem_purple", chance: 0.5 },
      { itemId: "calca_antichama", chance: 0.15 },
      { itemId: "botas_termicas", chance: 0.15 },
      { itemId: "anel_alto_forno", chance: 0.1 },
      { itemId: "amuleto_rubi", chance: 0.1 },
      { itemId: "ring_demodras", chance: 0.05 },
    ],
    // Walk.png 744x62 = 12 frames de 62x62 (GiantBamboo recolorido em aço: tools/monsters/recolor.mjs).
    sprite: strip("monsters/ConverterGolem.png", 62, 12, { scale: 1.5 }),
  },
  // Lingotamento e Laminação (lv 80–100)
  rex_ferro: {
    id: "rex_ferro", name: "Rex de Ferro", level: 88, hp: 3600, xp: 7000, damage: [108, 205], damageKind: "physical", armor: 34, // final [173, 328]
    abilities: [
      ability.stomp({ name: "Pisada do Laminador", radius: 2, min: 115, max: 210, windupMs: 900, cooldownMs: 12_000 }), // final 184–336
    ],
    attackMs: 2100, attackRange: 1, stepMs: 330, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 120_000,
    gold: [330, 660],
    loot: [
      { itemId: "placa_aco_fundido", chance: 0.25, min: 1, max: 2 },
      { itemId: "mithril_bar", chance: 0.06 },
      { itemId: "gem_red", chance: 0.05 },
      { itemId: "health_potion_large", chance: 0.2, min: 1, max: 2 },
      // Sem Avental do Forjador e Elmo do Laminador (só Fornalha e missão): peça lv 80+ de todas as vocações derrubada por
      // monstro comum entra no Baú de Recompensa e sobe o piso dele acima do tier 7 (chestGearPool, servidor).
      { itemId: "demon_legs", chance: 0.003 },
    ],
    // A pasta do pack tem espaço no nome ("Grey Trex"): o express.static decodifica %20 e o teste de disco usa o caminho.
    sprite: grid4(M + "Grey Trex/SpriteSheet.png", { scale: 1.5 }),
  },
  // Coração do Forno (lv 100–120)
  forjador_rubro: {
    id: "forjador_rubro", name: "Forjador Rubro", level: 104, hp: 5200, xp: 11200, damage: [135, 255], damageKind: "fire", armor: 32, // final [230, 434]
    abilities: [
      ability.blast({ name: "Chuva de Fagulhas", radius: 2, range: 4, min: 150, max: 270, kind: "fire", fx: "fire", windupMs: 900, cooldownMs: 11_000, condition: { id: "burn", durationMs: 6000, value: 15 } }), // final 255–459
      ability.bolt({ name: "Martelada em Brasa", range: 4, min: 140, max: 250, kind: "fire", fx: "fire", cooldownMs: 8000 }), // final 238–425
    ],
    attackMs: 2000, attackRange: 4, stepMs: 320, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 140_000,
    gold: [440, 880],
    loot: [
      { itemId: "magma_core", chance: 0.2 },
      { itemId: "frasco_aco_liquido", chance: 0.05 },
      { itemId: "gem_red", chance: 0.08 },
      { itemId: "mana_potion_large", chance: 0.25, min: 1, max: 3 },
      { itemId: "health_potion_large", chance: 0.2, min: 1, max: 2 },
      { itemId: "ferumbras_boots", chance: 0.004 },
    ],
    sprite: grid4(C + "NinjaFire/SpriteSheet.png", { scale: 1.15 }),
  },
  gosma_aco_liquido: {
    id: "gosma_aco_liquido", name: "Gosma de Aço Líquido", level: 114, hp: 7000, xp: 15800, damage: [150, 290], damageKind: "fire", armor: 38, // final [255, 493]
    abilities: [
      ability.stomp({ name: "Respingo de Aço", radius: 2, min: 170, max: 300, kind: "fire", fx: "fire", windupMs: 900, cooldownMs: 11_000, condition: { id: "burn", durationMs: 6000, value: 18 } }), // final 289–510
    ],
    attackMs: 2000, attackRange: 1, stepMs: 380, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 160_000,
    gold: [520, 1050],
    loot: [
      { itemId: "frasco_aco_liquido", chance: 0.12 },
      { itemId: "gota_gusa", chance: 0.4, min: 2, max: 4 },
      { itemId: "gem_red", chance: 0.1 },
      { itemId: "health_potion_large", chance: 0.25, min: 2, max: 3 },
      { itemId: "demon_armor", chance: 0.003 },
      { itemId: "boots_haste", chance: 0.004 },
    ],
    sprite: grid4("monsters/SteelSlime.png", { scale: 1.3 }),
  },
  // Chefe final (grupo de 5+): a faísca que acendeu a usina. Tier 8 a 6% (plano: 5–8% nos chefes finais das regiões).
  fornalha_primordial: {
    id: "fornalha_primordial", name: "A Fornalha Primordial", level: 118, hp: 55000, xp: 72000, damage: [215, 400], damageKind: "fire", armor: 46, // final [366, 680]
    abilities: [
      ability.blast({ name: "Sangria Primordial", radius: 2, range: 5, min: 230, max: 400, kind: "fire", fx: "fire", windupMs: 900, cooldownMs: 9000, condition: { id: "burn", durationMs: 6000, value: 25 } }), // final 391–680
      ability.breath({ name: "Bafo da Fornalha", length: 5, width: 3, min: 220, max: 380, kind: "fire", fx: "fire", windupMs: 900, cooldownMs: 12_000 }), // final 374–646
      ability.summon({ name: "Filhas do aço, a mim!", monsterId: "gosma_aco_liquido", count: 1, max: 2, cooldownMs: 30_000 }),
      ability.heal({ name: "Reacender", pct: 0.05, belowHpPct: 0.3, cooldownMs: 30_000 }),
    ],
    attackMs: 2000, attackRange: 4, stepMs: 400, aggroRange: 9, fleeAtHpPct: 0, respawnMs: 14_400_000, boss: true,
    gold: [14000, 24000],
    loot: [
      { itemId: "coracao_fornalha", chance: 1 },
      { itemId: "frasco_aco_liquido", chance: 1, min: 1, max: 2 },
      { itemId: "gem_red", chance: 1, min: 2, max: 3 },
      { itemId: "health_potion_large", chance: 1, min: 4, max: 6 },
      { itemId: "abyss_shard", chance: 1, min: 2, max: 3 },
      { itemId: "abyss_armor", chance: 0.06 },
      { itemId: "abyss_archer_armor", chance: 0.06 },
      { itemId: "abyss_mage_armor", chance: 0.06 },
      { itemId: "abyss_shield", chance: 0.06 }, // a Montadora (ciclo 20) completa com elmos e grimório no Protótipo
      { itemId: "avental_forjador", chance: 0.15 },
      { itemId: "elmo_laminador", chance: 0.15 },
      { itemId: "boots_haste", chance: 0.12 },
      { itemId: "amulet_orshabaal", chance: 0.05 },
    ],
    // Walk.png 744x62 = 12 frames de 62x62: a "chaminé viva" laranja do pack, sem recolorir.
    sprite: strip(B + "GiantBamboo2/Walk.png", 62, 12, { scale: 2 }),
  },
```

### 3.2 Sprites

| Monstro | Arquivo (relativo a `assets/`) | PNG | Layout | Ajuste |
|---|---|---|---|---|
| Caracol de Ferrugem | `ninja/Actor/Monster/Mollusc/Mollusc.png` | 64×64 | grid4 | cor original (casca ferrugem) |
| Guaxinim do Carvão | `ninja/Actor/Monster/GoldRacoon/SpriteSheet.png` | 64×64 | grid4 | tint `0x8c8c98` |
| Morcego da Chaminé | `ninja/Actor/Monster/YellowsBat/SpriteSheet.png` | 64×64 | grid4 | tint `0xb0a49c` |
| Serpente da Correia | `ninja/Actor/Monster/Snake2/Snake2.png` | 64×64 | grid4 | tint `0x8a8a96` (borracha) |
| Coruja da Fuligem | `ninja/Actor/Monster/Owl2/Owl2.png` | 64×64 | grid4 | original |
| Salamandra do Cadinho | `ninja/Actor/Monster/Axolot/SpriteSheet.png` | 64×64 | grid4 | escala 1,15 |
| Coração de Brasa | `ninja/Actor/Monster/HeartRed/SpriteSheet.png` | 64×64 | grid4 | escala 1,1 |
| Rex de Ferro | `ninja/Actor/Monster/Grey Trex/SpriteSheet.png` | 64×64 | grid4 | escala 1,5 (pasta com espaço) |
| Cavaleiro de Aço Fundido | `ninja/Actor/Character/KnightGold/SpriteSheet.png` | 64×112 | grid4 (linhas 0–3) | tint `0xff9a6a`, escala 1,1 |
| Forjador Rubro | `ninja/Actor/Character/NinjaFire/SpriteSheet.png` | 64×112 | grid4 | escala 1,15 |
| Contramestre Fuligem | `ninja/Actor/Character/NinjaBomb/SpriteSheet.png` | 64×112 | grid4 | escala 1,6 |
| A Fornalha Primordial | `ninja/Actor/Boss/GiantBamboo2/Walk.png` | 744×62 | strip 62, 12 frames | escala 2 |
| Gosma de Gusa | `monsters/GusaSlime.png` (recolor de `Monster/Slime4/Slime4.png`) | 64×64 | grid4 | — |
| Gosma de Aço Líquido | `monsters/SteelSlime.png` (recolor de `Monster/Slime3/Slime3.png`) | 64×64 | grid4 | escala 1,3 |
| Golem de Escória | `monsters/SlagGolem.png` (recolor de `Character/Statue/SpriteSheet.png`) | 64×112 | grid4 | escala 1,2 |
| Golem do Convertedor | `monsters/ConverterGolem.png` (recolor de `Boss/GiantBamboo/Walk.png`) | 744×62 | strip 62, 12 frames | escala 1,5 |

Nenhum destes é usado hoje por monstro (KnightGold é o NPC Ferreiro e a roupa Senhor da Guerra: por isso o tint; Statue
é o Banheiro Quântico: o recolor some com a semelhança).

Variantes novas em `tools/monsters/recolor.mjs` (paletas extraídas dos PNGs; cor fora do mapa fica igual, contorno
`141b1b` intacto). Rodar `node tools/monsters/recolor.mjs` gera `assets/monsters/<Nome>.png` e `<Nome>-preview.png`
(os dois versionados, como o FrostDragon):

```js
  // Siderúrgica (ciclo 19): gusa incandescente, aço líquido branco-amarelo, escória com olhos em brasa, convertedor de aço.
  GusaSlime: {
    src: "ninja/Actor/Monster/Slime4/Slime4.png",
    map: { adbc3a: "e66a3a", "74a334": "d14b34", "56864c": "8a1c24", f2eaf1: "ffe9a0", e0394c: "ffad5d" },
  },
  SteelSlime: {
    src: "ninja/Actor/Monster/Slime3/Slime3.png",
    map: { "79b8ce": "ffe9a0", "548789": "ffad5d", "4a5270": "e66a3a", f2eaf1: "ffffff" },
  },
  SlagGolem: {
    src: "ninja/Actor/Character/Statue/SpriteSheet.png",
    map: { "5f7160": "5d4a42", "4e484a": "3a2e2c", fce2ca: "ffad5d" },
  },
  ConverterGolem: {
    src: "ninja/Actor/Boss/GiantBamboo/Walk.png",
    map: { adbc3a: "c3ccd2", "74a334": "93a0aa", "56864c": "66737d", "5f7160": "454f57", "4e484a": "2a2629", "8f3e56": "e66a3a", e0394c: "ffe9a0" },
  },
```

Paletas de origem conferidas: Slime4 `adbc3a 74a334 56864c f2eaf1 e0394c`; Slime3 `79b8ce 548789 4a5270 f2eaf1`; Statue
`5f7160 4e484a fce2ca`; GiantBamboo/Walk `adbc3a 5f7160 74a334 56864c 4e484a ffffff 9ba7aa 8f3e56 e0394c 323c39`.
Olhar as prévias 8× antes de fechar (se o contraste ficar ruim, ajustar só o hex de destino).

### 3.3 Materiais, Rubi, comida e provas

| id | Nome | Valor | Ícone | Cai de |
|---|---|---|---|---|
| `lasca_ferrugem` | Lasca de Ferrugem | 20 | `Resource/Rock.png` tint `0xb8643a` | Caracol 55%, Guaxinim 15% |
| `pedra_carvao` | Pedra de Carvão | 45 | `Resource/Rock.png` tint `0x3a3a44` | Guaxinim 50%, Contramestre |
| `fuligem` | Punhado de Fuligem | 75 | `matIcon("slime_goo", 0x4a4a52)` | Morcego 50%, Coruja 30%, Contramestre |
| `tira_correia` | Tira de Correia | 240 | `Resource/Branch.png` tint `0x3a3a42` | Serpente 45% |
| `gota_gusa` | Gota de Gusa | 300 | `matIcon("ember", 0xff7a30)` | Gosma de Gusa 45%, Salamandra 25%, Coração 25%, Gosma de Aço 40% |
| `pena_fuligem` | Pena de Fuligem | 380 | `Resource/feather.png` tint `0x5a5a64` | Coruja 40% |
| `escama_salamandra` | Escama de Salamandra | 560 | `matIcon("lizard_scale", 0xff8a40)` | Salamandra 35% |
| `bloco_escoria` | Bloco de Escória | 720 | `Resource/Rock.png` tint `0x5a4038` | Golem de Escória 40% |
| `placa_aco_fundido` | Placa de Aço Fundido | 1.300 | `Resource/BarSilver.png` tint `0xffb080` | Cavaleiro 35%, Rex 25%, Golem do Convertedor |
| `gem_red` | **Rubi** (gema nova) | 1.500 | `Resource/GemRed.png` (existe no pack) | Cavaleiro 2%, Coração 4%, Rex 5%, Forjador 8%, Gosma de Aço 10%, chefes |
| `frasco_aco_liquido` | Frasco de Aço Líquido | 4.200 | `Potion/EmptyPot.png` tint `0xffd070` | Gosma de Aço 12%, Forjador 5%, Fornalha |

Valores na escala dos vizinhos de level (snake_skin 55, pino_de_engate 180, ape_fur 320, orc_leather 380, chaveta 520,
cyclops_eye 650, hero_badge 950, magma_core 2.000, juggernaut_plate 4.500). Bloco no fim de `items.ts`, antes de
`/** Catálogo (derivado das listas acima). */` (depois do `abyssFrom`, então o tier 8 não muda):

```ts
// ---------------------------------------------------------------------------
// Siderúrgica (ciclo 19, lv 10–120): materiais da usina, Rubi, comida do turno, provas dos três chefes e 8 peças que
// fecham buracos de slot (botas 50/70, calças 60, anel 60, amuleto 70, armadura 80, elmos 40/85). Equipamento: valor
// ABAIXO do melhor item do slot no mesmo level para toda vocação que o usa (balanceKit.ts escolhe por valor; o Coliseu
// segue calibrado), todas as vocações.
// ---------------------------------------------------------------------------
mat("lasca_ferrugem", "Lasca de Ferrugem", img("Resource/Rock.png", 0xb8643a), 20, "Descascou do caracol e mancha tudo o que encosta. O ferro-velho aceita.");
mat("pedra_carvao", "Pedra de Carvão", img("Resource/Rock.png", 0x3a3a44), 45, "Os guaxinins juram que acharam no chão. O chão era a pilha.");
mat("fuligem", "Punhado de Fuligem", matIcon("slime_goo", 0x4a4a52), 75, "Preta, fina e teimosa: só sai da roupa na terceira lavada.");
mat("tira_correia", "Tira de Correia", img("Resource/Branch.png", 0x3a3a42), 240, "Borracha grossa de esteira. A serpente usava como casca.");
mat("gota_gusa", "Gota de Gusa", matIcon("ember", 0xff7a30), 300, "Ferro derretido que esfriou por fora. Por dentro, ainda não.");
mat("pena_fuligem", "Pena de Fuligem", img("Resource/feather.png", 0x5a5a64), 380, "Cai preta e deixa rastro. A coruja nem sentiu falta.");
mat("escama_salamandra", "Escama de Salamandra", matIcon("lizard_scale", 0xff8a40), 560, "Morna mesmo depois de uma semana na mochila.");
mat("bloco_escoria", "Bloco de Escória", img("Resource/Rock.png", 0x5a4038), 720, "O resto do ferro, com orgulho de sobra. Vira estrada.");
mat("placa_aco_fundido", "Placa de Aço Fundido", img("Resource/BarSilver.png", 0xffb080), 1300, "Ainda tem o brilho alaranjado de quem saiu do convertedor.");
mat("gem_red", "Rubi", img("Resource/GemRed.png"), 1500, "Gema vermelha lapidada. Os forneiros juram que nasce no calor do Alto-Forno.", 50);
mat("frasco_aco_liquido", "Frasco de Aço Líquido", img("Potion/EmptyPot.png", 0xffd070), 4200, "Brilha como o sol do meio-dia. Não abra dentro de casa.");
// Comida do turno (vendida pelo Almoxarife). Limonada: mana, como o Macarrão (lv 10); Prato Feito: equilibrado, entre o
// Banquete de Sushi (lv 20) e o Presunto de Dragão (lv 30).
food("limonada_turno", "Limonada do Turno", img("Potion/WaterPot.png", 0xf4e04a), 40, 10, 1, 4, 6, "Limão, gelo e açúcar de sobra. Segura o turno inteiro, ou quase.");
food("prato_feito", "Prato Feito", img("Food/Beaf.png", 0xe8c890), 160, 25, 9, 5, 10, "Arroz, feijão, bife e salada. O almoço oficial de quem pega no pesado.");
// Provas dos chefes: troféus (a missão usa passo "boss", o abate conclui para o grupo; não abrem nada).
add({ id: "apito_contramestre", name: "Apito do Contramestre", kind: "quest", value: 0, icon: img("Object/PanFlute.png", 0x707078), description: "Ainda cheira a fuligem e a café requentado. Lembrança de quem mandou o Contramestre Fuligem para casa mais cedo." });
add({ id: "nucleo_convertedor", name: "Núcleo do Convertedor", kind: "quest", value: 0, icon: matIcon("ember", 0xffc060), description: "Um caroço de aço que ainda pulsa. Lembrança de quem desligou o Golem do Convertedor." });
add({ id: "coracao_fornalha", name: "Coração da Fornalha", kind: "quest", value: 0, icon: matIcon("ember", 0xfff0a0), description: "Uma brasa branca do tamanho de um punho. Lembrança de quem apagou A Fornalha Primordial." });
```

### 3.4 Equipamento (8 peças, todas as vocações)

Referência = o item mais caro do slot que cada vocação já pode usar naquele level (o que o `balanceKit` escolheria).
O valor novo fica abaixo do **menor** desses (a peça serve a todas as vocações).

| id | Nome | Slot | lv | Atributos | Valor | Referência (menor "melhor do slot" no lv) | Fonte |
|---|---|---|---|---|---|---|---|
| `capacete_fundidor` | Capacete de Fundidor | elmo | 40 | armadura 2, vida +70 | 5.200 | `archmage_helmet` 5.500 (magos; cav. 7.500, pal. 6.500) | missão Sangria do Alto-Forno; Golem de Escória 0,4%; Contramestre 20% |
| `botas_fundidor` | Botas de Fundidor | botas | 50 | armadura 2, vida +50, velocidade +8 | 22.000 | `boots_haste` 60.000 | missão Escória Viva |
| `calca_antichama` | Calças Antichama | calças | 60 | armadura 4, vida +90 | 26.000 | `mystic_legs` 28.000 (magos; cav. 32.000, pal. 30.000) | Cavaleiro 0,4%; Golem do Convertedor 15% |
| `anel_alto_forno` | Anel do Alto-Forno | anel | 60 | crítico 3, regen. vida 4, regen. mana 2, velocidade +2 | 48.000 | `frost_ring` 60.000 | missão Sopro do Convertedor; Golem do Convertedor 10% |
| `botas_termicas` | Botas Térmicas | botas | 70 | armadura 2, vida +80, mana +40, velocidade +9 | 45.000 | `boots_haste` 60.000 | Coração de Brasa 0,3%; Golem do Convertedor 15% |
| `amuleto_rubi` | Amuleto de Rubi | amuleto | 70 | armadura 4, vida +240, mana +60 | 42.000 | `amulet_dragon` 45.000 | missão O Golem do Convertedor; Golem do Convertedor 10% |
| `avental_forjador` | Avental do Forjador | armadura | 80 | armadura 6, vida +160, mana +80 | 110.000 | `ferumbras_armor` 120.000 (magos; cav. 140.000, pal. 130.000) | Fornalha 15% |
| `elmo_laminador` | Elmo do Laminador | elmo | 85 | armadura 4, vida +120 | 48.000 | `ferumbras_helmet` 50.000 (magos; cav. 60.000, pal. 55.000) | missão Chapa Fina; Fornalha 15% |

As peças que caem de monstro comum passam a valer para o Baú de Recompensa (`chestEligible`); as que só saem de missão
ou chefe (`botas_fundidor`, `anel_alto_forno`, `amuleto_rubi`, `avental_forjador`, `elmo_laminador`) não, como as da
Malha. Avental e Elmo do Laminador saíram do Rex e do Forjador (decisão do ciclo 19, frente B): uma armadura lv 80 de todas
as vocações vinda de monstro comum sobe o piso do baú (`chestGearPool` mede a arma/armadura de level mais alto) e, do lv 83
em diante, o baú de toda vocação só daria avental e elmo, sem o tier 7 (`server/systems/quests.test.ts`, lv 100).

```ts
add({ id: "capacete_fundidor", name: "Capacete de Fundidor", kind: "helmet", slot: "helmet", icon: { ...gear("helmet_full", "iron"), tint: 0xffb060 }, level: 40, stats: { armor: 2, hpMax: 70 }, value: 5200,
  description: "Aba larga e viseira contra respingo. Gusa no capacete é sinal de experiência." });
add({ id: "botas_fundidor", name: "Botas de Fundidor", kind: "boots", slot: "boots", icon: { ...gear("boots", "steel"), tint: 0xff9a50 }, level: 50, stats: { armor: 2, hpMax: 50, speed: 8 }, value: 22000,
  description: "Biqueira de aço e sola que não derrete. Golem nenhum pisa no seu pé." });
add({ id: "calca_antichama", name: "Calças Antichama", kind: "legs", slot: "legs", icon: { ...gear("legs_pants", "steel"), tint: 0xffc080 }, level: 60, stats: { armor: 4, hpMax: 90 }, value: 26000,
  description: "Tecido grosso que não pega fogo. Pega fuligem, mas fogo, não." });
add({ id: "botas_termicas", name: "Botas Térmicas", kind: "boots", slot: "boots", icon: { ...gear("boots", "steel"), tint: 0xff7050 }, level: 70, stats: { armor: 2, hpMax: 80, manaMax: 40, speed: 9 }, value: 45000,
  description: "Quentes no pé e frias na sola. Ninguém na usina entende como." });
add({ id: "avental_forjador", name: "Avental do Forjador", kind: "armor", slot: "armor", icon: { ...gear("armor_vest", "bronze"), tint: 0xd08050 }, level: 80, stats: { armor: 6, hpMax: 160, manaMax: 80 }, value: 110000,
  description: "Couro curtido na fagulha. Pesa como armadura e protege como armadura." });
add({ id: "elmo_laminador", name: "Elmo do Laminador", kind: "helmet", slot: "helmet", icon: { ...gear("helmet_horned", "steel"), tint: 0xffa070 }, level: 85, stats: { armor: 4, hpMax: 120 }, value: 48000,
  description: "Saiu inteiro do laminador novo. A chapa era fina; o elmo, nem tanto." });
trinket("anel_alto_forno", "Anel do Alto-Forno", "ring", "gold", 60, { crit: 3, hpRegen: 4, manaRegen: 2, speed: 2 }, 48000, "Forjado na boca do Alto-Forno. Segura o calor por você.");
trinket("amuleto_rubi", "Amuleto de Rubi", "amulet", "dragon", 70, { armor: 4, hpMax: 240, manaMax: 60 }, 42000, "Um rubi do fundo da panela de aço, preso numa corrente que nunca esfria.");
```

(O `trinket` está definido depois das armaduras: o bloco inteiro da Siderúrgica vai depois dos anéis, no fim do arquivo.)

### 3.5 Spawns (frente A desenha; níveis = `MonsterDef.level`)

`[monstro, count, radius, level, x, y]` em coordenadas **globais** (local entre parênteses). Todos conferidos por script:
dentro do setor (raio inteiro), level dentro da faixa, ≥ raio+6 das PZ, ≥ 8 (Chebyshev − raio) de NPC e placa, ≥ 7+raio de
portal/chegada, chefes ≥ 11 de qualquer outro spawn. Se uma estrutura cair em cima, mover o ponto até 3 tiles mantendo
essas regras e o resto da linha.

| Setor | Spawns | Monstros |
|---|---|---|
| Pátio de Minério | `caracol_ferrugem` 4 r4 lv12 (12,618) (8,38) · `caracol_ferrugem` 4 r4 (34,621) (30,41) · `caracol_ferrugem` 4 r4 (52,617) (48,37) · `guaxinim_carvao` 6 r5 lv15 (66,592) (62,12) · `morcego_chamine` 3 r4 lv19 (86,589) (82,9) · `morcego_chamine` 3 r4 (84,618) (80,38) · `slag_slime` 4 r4 lv20 (66,610) (62,30) | 28 |
| Correias e Coqueria | `serpente_correia` 4 r4 lv27 (116,616) (112,36) · 4 r4 (128,606) (124,26) · 4 r4 (134,620) (130,40) · `gosma_gusa` 5 r5 lv31 (146,602) (142,22) · `gosma_gusa` 3 r4 (162,594) (158,14) · `coruja_fuligem` 3 r4 lv35 (174,588) (170,8) · `coruja_fuligem` 3 r4 (154,610) (150,30) · **`contramestre_fuligem` 1 r3 lv36 (168,614) (164,34)** | 26 + chefe |
| Alto-Forno | `salamandra_cadinho` 4 r4 lv43 (156,652) (152,72) · 4 r4 (142,670) (138,90) · `golem_escoria` 3 r4 lv53 (172,662) (168,82) · 3 r4 (170,638) (166,58) · `truque_desalinhado` 3 r4 lv48 (130,668) (126,88) | 17 |
| Aciaria | `cavaleiro_aco_fundido` 3 r4 lv64 (104,640) (100,60) · `cavaleiro_aco_fundido` 3 r4 **+** `coracao_brasa` 2 r4 lv67 no mesmo ponto (92,664) (88,84) · `coracao_brasa` 2 r4 (112,668) (108,88) · `flame_skull` 3 r4 lv70 (80,672) (76,92) · **`golem_convertedor` 1 r3 lv76 (80,638) (76,58)** | 13 + chefe |
| Lingotamento e Laminação | `rex_ferro` 3 r4 lv88 (48,642) (44,62) · 3 r4 (28,656) (24,76) · `magma_elemental` 3 r4 lv86 (50,670) (46,90) · `hellhound` 3 r4 lv95 (18,668) (14,88) | 12 |
| Coração do Forno | `forjador_rubro` 3 r4 lv104 (64,692) (60,112) · `gosma_aco_liquido` 3 r4 lv114 (92,696) (88,116) · `forjador_rubro` 3 r4 (126,692) (122,112) · `gosma_aco_liquido` 3 r4 (130,706) (126,126) · `juggernaut` 2 r4 lv110 (54,711) (50,131) · **`fornalha_primordial` 1 r3 lv118 (165,700) (161,120)** | 14 + chefe |

Total: **36 spawns, 110 monstros + 3 chefes** (mapa: 248 → 284 spawns, 785 → 898 monstros). Faixa que o índice do mundo
vai mostrar (comuns): Pátio 12–20, Correias 27–35, Alto-Forno 43–53, Aciaria 64–70, Lingotamento 86–95, Coração 104–114.

---

## 4. Missões, NPCs, evento e conquistas (frente C)

### 4.1 Missões

| # | id | Nome | NPC | lv | Requer | Passos | XP (levels no lv) | Ouro | Itens / desbloqueio |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `primeiro_turno` | Primeiro Turno | mestre_turno | 10 | — | talk almoxarife · explore Pátio de Minério · kill caracol ×6 | 1.200 (1,12) | 300 | limonada ×5, poção de vida ×10 |
| 2 | `ferrugem_no_patio` | Ferrugem no Pátio | mestre_turno | 12 | 1 | kill caracol ×15 · deliver lasca ×8 | 1.800 (1,27) | 450 | poção de vida média ×5 |
| 3 | `turno_da_noite` | Turno da Noite | mestre_turno | 15 | 2 | kill guaxinim ×15 · deliver pedra de carvão ×10 | 2.600 (1,28) | 700 | prato feito ×5, poção de mana média ×5 |
| 4 | `limpa_chamine` | Limpa-Chaminé | mestre_turno | 19 | 3 | kill morcego ×12 · kill slag_slime ×10 · deliver fuligem ×6 | 3.800 (1,25) | 1.100 | poção de vida média ×10 |
| 5 | `hora_extra` | Hora Extra (chefe, grupo) | mestre_turno | 34 | 4 e 7 | **boss** contramestre_fuligem | 18.000 (2,13) | 9.000 | poção de vida grande ×10 |
| 6 | `correia_nunca_para` | A Correia que Nunca Para | operadora_correia | 25 | 1 | explore Correias e Coqueria · kill serpente ×15 · deliver tira ×6 | 6.000 (1,23) | 1.600 | poção de vida média ×10 |
| 7 | `bateria_coqueria` | Bateria da Coqueria | encarregada_coqueria | 29 | 6 | kill gosma_gusa ×15 · deliver gota ×6 | 8.000 (1,26) | 2.200 | poção de mana média ×10, prato feito ×5 |
| 8 | `olhos_na_fumaca` | Olhos na Fumaça | encarregada_coqueria | 33 | 7 | kill coruja ×12 · deliver pena ×5 · talk operadora_correia | 10.000 (1,25) | 3.000 | poção de vida grande ×5 |
| 9 | `sangria_alto_forno` | Sangria do Alto-Forno | forneiro_chefe | 42 | 8 | explore Alto-Forno · kill salamandra ×15 · deliver escama ×5 | 15.000 (1,20) | 4.000 | `capacete_fundidor` |
| 10 | `escoria_viva` | Escória Viva | forneiro_chefe | 50 | 9 | kill golem_escoria ×15 · kill truque_desalinhado ×10 · deliver bloco ×6 | 22.000 (1,28) | 6.000 | `botas_fundidor` |
| 11 | `sopro_convertedor` | Sopro do Convertedor | mestre_aciaria | 62 | 10 | explore Aciaria · kill cavaleiro ×15 · kill coração ×10 · deliver placa ×5 | 34.000 (1,32) | 8.000 | `anel_alto_forno` |
| 12 | `golem_convertedor` | O Golem do Convertedor (chefe) | mestre_aciaria | 72 | 11 | **boss** golem_convertedor · talk forneiro_chefe | 70.000 (2,04) | 15.000 | `amuleto_rubi` |
| 13 | `chapa_fina` | Chapa Fina | operador_laminador | 86 | 12 | explore Lingotamento e Laminação · kill rex ×20 · kill magma_elemental ×10 · deliver placa ×6 | 60.000 (1,25) | 14.000 | `elmo_laminador` |
| 14 | `poco_do_cadinho` | O Poço do Cadinho | espirito_fundidor | 100 | 13 | explore Coração do Forno · kill forjador ×15 · kill gosma_aco ×10 · deliver frasco ×2 | 110.000 (1,71) | 25.000 | poção de vida grande ×25, de mana grande ×25, Rubi ×3 |
| 15 | `fornalha_primordial` | A Fornalha Primordial (chefe final, grupo 5+) | espirito_fundidor | 112 | 14 | **boss** fornalha_primordial | 180.000 (2,24) | 45.000 | poção de vida grande ×30; `title:coracao_de_aco` |

Levels em ordem: 10, 12, 15, 19, 25, 29, 33, 34, 42, 50, 62, 72, 86, 100, 112 — maior buraco **14** (≤ 15 pedido). XP
entre 0,3 e 2,5 levels do level mínimo (regra de `server/systems/quests.test.ts`); chefes ~2–2,2 levels, como Rei Goblin,
Tirano da Serra e Orshabaal. Todo alvo de `kill` nasce numa zona que a própria missão manda explorar (regra de
`quests.test.ts`) e é caçável no level mínimo (porta do setor ≤ level da missão). Um id de missão igual ao de monstro
(`golem_convertedor`, `fornalha_primordial`) já tem precedente (`goblin_king`, `locomotiva_fantasma`).

`pluralPt`: acrescentar a `PLURAL_IRREGULAR` `"Caracol": "Caracóis"` (a regra daria "Caracois") e `"Rex": "Rexes"` (a
regra daria "Rexs"); os outros nomes novos já saem certos (Guaxinins, Golens, Corações, Forjadores Rubros...).

Bloco no fim de `QUEST_LIST` (`packages/shared/src/data/quests.ts`):

```ts
  // --- Siderúrgica (ciclo 19, lv 10–112): o Alto-Forno acordou. Mestre de Turno (Pátio → Hora Extra), Correia e
  // Coqueria, Alto-Forno, Aciaria, Laminador e o Espírito do Primeiro Fundidor (Coração do Forno). ---
  q({
    id: "primeiro_turno", name: "Primeiro Turno", giver: "mestre_turno", minLevel: 10,
    summary: "O Mestre de Turno quer que você bata o ponto com o Almoxarife e conheça o Pátio de Minério, onde os Caracóis de Ferrugem tomaram conta das pilhas.",
    steps: [
      { kind: "talk", target: "almoxarife", count: 1, label: "Bater o ponto com o Almoxarife" },
      { kind: "explore", target: "Pátio de Minério", count: 1, label: "Conhecer o Pátio de Minério" },
      { kind: "kill", target: "caracol_ferrugem", count: 6, label: "Caracóis de Ferrugem" },
    ],
    dialog: {
      offer: "Novato? Ótimo, a usina acordou e precisa de braço. Bata o ponto com o Almoxarife, passe pelo portão sul e tire seis Caracóis de Ferrugem de cima das pilhas de minério. Topa o primeiro turno?",
      accept: "O Almoxarife fica na plataforma. O portão sul abre para quem é level 10 ou mais. Caracol é devagar, mas a casca é dura: bata sem dó.",
      progress: "Ponto batido, pátio visto e seis caracóis a menos. Ainda falta alguma coisa aí.",
      complete: "Primeiro turno fechado! Tem cara de quem vai ficar. Tome uma limonada, que o calor só aumenta daqui pra frente.",
    },
    rewards: { xp: 1200, gold: 300, items: [{ itemId: "limonada_turno", count: 5 }, { itemId: "health_potion", count: 10 }] },
  }),
  q({
    id: "ferrugem_no_patio", name: "Ferrugem no Pátio", giver: "mestre_turno", minLevel: 12, requires: ["primeiro_turno"],
    summary: "Os Caracóis de Ferrugem estão comendo o minério do Pátio. O Mestre de Turno quer quinze a menos e oito lascas de ferrugem como prova.",
    steps: [
      { kind: "kill", target: "caracol_ferrugem", count: 15, label: "Caracóis de Ferrugem" },
      { kind: "deliver", target: "lasca_ferrugem", count: 8, label: "Lascas de Ferrugem" },
    ],
    dialog: {
      offer: "Esses caracóis comem minério e soltam ferrugem por onde passam. O pátio está virando ferro-velho. Quinze deles, e me traga oito lascas para eu mostrar para a chefia.",
      accept: "Eles ficam perto das pilhas de minério. Se a casca brilhar dourada, é elite: chame alguém.",
      progress: "Ainda tem caracol enferrujando o meu pátio. Quinze, e oito lascas.",
      complete: "Oito lascas! A chefia vai achar que é a ferrugem do pátio inteiro. E é. Tome, poções para o próximo turno.",
    },
    rewards: { xp: 1800, gold: 450, items: [{ itemId: "health_potion_medium", count: 5 }] },
  }),
  q({
    id: "turno_da_noite", name: "Turno da Noite", giver: "mestre_turno", minLevel: 15, requires: ["ferrugem_no_patio"],
    summary: "Toda noite um bando de Guaxinins do Carvão rouba a pilha do Pátio. O Mestre de Turno quer o bando espantado e as pedras de volta.",
    steps: [
      { kind: "kill", target: "guaxinim_carvao", count: 15, label: "Guaxinins do Carvão" },
      { kind: "deliver", target: "pedra_carvao", count: 10, label: "Pedras de Carvão" },
    ],
    dialog: {
      offer: "Some carvão da pilha toda noite. Pensei que fosse o turno da noite, mas é um bando de Guaxinins do Carvão. Mate quinze e me devolva dez pedras de carvão.",
      accept: "Eles andam em bando: bateu em um, vem todo mundo. E quando apanham, fogem com o carvão. Não deixe.",
      progress: "Os guaxinins continuam fazendo turno extra na minha pilha. Quinze, e dez pedras.",
      complete: "Dez pedras de carvão, todas mordidas. Serve. Tome um prato feito, que turno da noite dá fome.",
    },
    rewards: { xp: 2600, gold: 700, items: [{ itemId: "prato_feito", count: 5 }, { itemId: "mana_potion_medium", count: 5 }] },
  }),
  q({
    id: "limpa_chamine", name: "Limpa-Chaminé", giver: "mestre_turno", minLevel: 19, requires: ["turno_da_noite"],
    summary: "Os Morcegos da Chaminé entopem as chaminés do Pátio e as Gosmas Cinzentas escorrem das pilhas de escória. Hora de limpar.",
    steps: [
      { kind: "kill", target: "morcego_chamine", count: 12, label: "Morcegos da Chaminé" },
      { kind: "kill", target: "slag_slime", count: 10, label: "Gosmas Cinzentas" },
      { kind: "deliver", target: "fuligem", count: 6, label: "Punhados de Fuligem" },
    ],
    dialog: {
      offer: "As chaminés do pátio entupiram de morcego e as gosmas cinzentas escorrem de tudo que é pilha. Doze morcegos, dez gosmas e seis punhados de fuligem para eu provar que alguém limpou.",
      accept: "Morcego de chaminé vem numa nuvem de fuligem. Feche a boca e bata.",
      progress: "Ainda tem fuligem demais no meu céu. Doze morcegos, dez gosmas, seis punhados.",
      complete: "Chaminé limpa, céu quase azul! Você está pronto para a hora extra, mas antes conheça a Coqueria.",
    },
    rewards: { xp: 3800, gold: 1100, items: [{ itemId: "health_potion_medium", count: 10 }] },
  }),
  q({
    id: "hora_extra", name: "Hora Extra", giver: "mestre_turno", minLevel: 34, requires: ["limpa_chamine", "bateria_coqueria"],
    summary: "O Contramestre Fuligem tomou o pátio da Coqueria e não deixa ninguém bater o ponto de saída. O Mestre de Turno pede que você chame a turma e acabe com a hora extra.",
    steps: [{ kind: "boss", target: "contramestre_fuligem", count: 1, label: "Contramestre Fuligem" }],
    dialog: {
      offer: "Tem um Contramestre Fuligem no pátio da Coqueria segurando todo mundo depois do expediente. Grita, chama os guaxinins e não paga a hora extra. Junte a turma, porque sozinho ninguém sai de lá. Encara?",
      accept: "Ele fica no canto leste da Coqueria. Vá em grupo: quando ele apita, vem guaxinim de tudo que é lado.",
      progress: "O Contramestre ainda está apitando. Ninguém bate o ponto enquanto ele estiver de pé.",
      complete: "Silêncio no pátio! Pela primeira vez em anos o turno acabou na hora. Isso é seu, e não precisa nem assinar.",
    },
    rewards: { xp: 18000, gold: 9000, items: [{ itemId: "health_potion_large", count: 10 }] },
  }),
  q({
    id: "correia_nunca_para", name: "A Correia que Nunca Para", giver: "operadora_correia", minLevel: 25, requires: ["primeiro_turno"],
    summary: "Serpentes da Correia fizeram ninho nas esteiras. A Operadora não pode parar a correia, então alguém vai ter que tirar as serpentes com ela andando.",
    steps: [
      { kind: "explore", target: "Correias e Coqueria", count: 1, label: "Chegar às Correias e Coqueria" },
      { kind: "kill", target: "serpente_correia", count: 15, label: "Serpentes da Correia" },
      { kind: "deliver", target: "tira_correia", count: 6, label: "Tiras de Correia" },
    ],
    dialog: {
      offer: "A correia não para. Nunca. Nem para tirar as Serpentes da Correia que se enrolaram nela. Quinze serpentes e seis tiras de borracha para eu remendar a esteira. Com ela andando.",
      accept: "Pise na esteira: ela te leva mais rápido. As serpentes também sabem disso.",
      progress: "Ainda tem serpente pegando carona. Quinze, e seis tiras.",
      complete: "Seis tiras! Remendo garantido por mais um mês, ou até a próxima serpente. Tome, para os ferimentos de esteira.",
    },
    rewards: { xp: 6000, gold: 1600, items: [{ itemId: "health_potion_medium", count: 10 }] },
  }),
  q({
    id: "bateria_coqueria", name: "Bateria da Coqueria", giver: "encarregada_coqueria", minLevel: 29, requires: ["correia_nunca_para"],
    summary: "As Gosmas de Gusa escaparam do cadinho e se esconderam entre os fornos da Coqueria. A Encarregada quer a bateria limpa.",
    steps: [
      { kind: "kill", target: "gosma_gusa", count: 15, label: "Gosmas de Gusa" },
      { kind: "deliver", target: "gota_gusa", count: 6, label: "Gotas de Gusa" },
    ],
    dialog: {
      offer: "Sessenta fornos, sessenta portas e uma infestação de Gosmas de Gusa entre elas. Quinze gosmas, e seis gotas de gusa: preciso medir a temperatura delas. De longe.",
      accept: "Gosma de gusa queima. Gelo apaga, fogo nem faz cócegas. Leve poção.",
      progress: "Ainda vejo gosma brilhando entre os fornos. Quinze, e seis gotas.",
      complete: "Seis gotas, ainda mornas. Medido! Leve isso e um prato feito: coqueria sem almoço não anda.",
    },
    rewards: { xp: 8000, gold: 2200, items: [{ itemId: "mana_potion_medium", count: 10 }, { itemId: "prato_feito", count: 5 }] },
  }),
  q({
    id: "olhos_na_fumaca", name: "Olhos na Fumaça", giver: "encarregada_coqueria", minLevel: 33, requires: ["bateria_coqueria"],
    summary: "Corujas da Fuligem vigiam a Coqueria do alto da fumaça e contam tudo ao Contramestre. A Encarregada quer as corujas fora e a Operadora da Correia avisada.",
    steps: [
      { kind: "kill", target: "coruja_fuligem", count: 12, label: "Corujas da Fuligem" },
      { kind: "deliver", target: "pena_fuligem", count: 5, label: "Penas de Fuligem" },
      { kind: "talk", target: "operadora_correia", count: 1, label: "Avisar a Operadora da Correia" },
    ],
    dialog: {
      offer: "Tem coruja na fumaça olhando tudo e dedurando para o Contramestre. Doze Corujas da Fuligem, cinco penas, e avise a Operadora da Correia que o céu está limpo.",
      accept: "Elas atacam de longe e jogam fuligem no olho. Chegue perto rápido.",
      progress: "Ainda tem olho na fumaça. Doze corujas, cinco penas e um recado para a Operadora.",
      complete: "Agora o Contramestre está cego e surdo. Ótima hora para uma hora extra, se é que você me entende.",
    },
    rewards: { xp: 10000, gold: 3000, items: [{ itemId: "health_potion_large", count: 5 }] },
  }),
  q({
    id: "sangria_alto_forno", name: "Sangria do Alto-Forno", giver: "forneiro_chefe", minLevel: 42, requires: ["olhos_na_fumaca"],
    summary: "As Salamandras do Cadinho se instalaram nos canais de gusa do Alto-Forno. O Forneiro-Chefe precisa dos canais livres para a sangria.",
    steps: [
      { kind: "explore", target: "Alto-Forno", count: 1, label: "Chegar ao Alto-Forno" },
      { kind: "kill", target: "salamandra_cadinho", count: 15, label: "Salamandras do Cadinho" },
      { kind: "deliver", target: "escama_salamandra", count: 5, label: "Escamas de Salamandra" },
    ],
    dialog: {
      offer: "Sangria é quando a gente abre o furo do forno e a gusa corre pelos canais. Só que as Salamandras do Cadinho acham que o canal é piscina. Quinze salamandras e cinco escamas.",
      accept: "Gelo é o melhor amigo de quem trabalha aqui: choque térmico. Fogo nelas é perda de tempo.",
      progress: "Canal entupido de salamandra não corre. Quinze, e cinco escamas.",
      complete: "Canal livre, gusa correndo! Tome um capacete de fundidor: o seu está derretendo.",
    },
    rewards: { xp: 15000, gold: 4000, items: [{ itemId: "capacete_fundidor", count: 1 }] },
  }),
  q({
    id: "escoria_viva", name: "Escória Viva", giver: "forneiro_chefe", minLevel: 50, requires: ["sangria_alto_forno"],
    summary: "A escória do Alto-Forno criou vida e virou Golem. Junto com as Feras das Brasas, eles tomaram o pátio de escória.",
    steps: [
      { kind: "kill", target: "golem_escoria", count: 15, label: "Golens de Escória" },
      { kind: "kill", target: "truque_desalinhado", count: 10, label: "Feras das Brasas" },
      { kind: "deliver", target: "bloco_escoria", count: 6, label: "Blocos de Escória" },
    ],
    dialog: {
      offer: "Escória é o resto do ferro. Pois o resto acordou, levantou e anda pelo pátio como Golem de Escória, com Feras das Brasas atrás. Quinze golens, dez feras e seis blocos.",
      accept: "Golem é lento e bate como uma ponte rolante. Não fique parado na frente dele.",
      progress: "Ainda tem escória andando por aí. Quinze golens, dez feras, seis blocos.",
      complete: "Seis blocos inteirinhos. Vão virar estrada. Calce estas botas: com biqueira de aço, golem nenhum pisa no seu pé.",
    },
    rewards: { xp: 22000, gold: 6000, items: [{ itemId: "botas_fundidor", count: 1 }] },
  }),
  q({
    id: "sopro_convertedor", name: "Sopro do Convertedor", giver: "mestre_aciaria", minLevel: 62, requires: ["escoria_viva"],
    summary: "Na Aciaria, o convertedor deu vida a Cavaleiros de Aço Fundido, e os Corações de Brasa curam todos eles. O Mestre da Aciaria quer o galpão de volta.",
    steps: [
      { kind: "explore", target: "Aciaria", count: 1, label: "Entrar na Aciaria" },
      { kind: "kill", target: "cavaleiro_aco_fundido", count: 15, label: "Cavaleiros de Aço Fundido" },
      { kind: "kill", target: "coracao_brasa", count: 10, label: "Corações de Brasa" },
      { kind: "deliver", target: "placa_aco_fundido", count: 5, label: "Placas de Aço Fundido" },
    ],
    dialog: {
      offer: "O convertedor sopra oxigênio na gusa e sai aço. Desde que acordou, sai cavaleiro. Quinze Cavaleiros de Aço Fundido, dez Corações de Brasa e cinco placas de aço para a gente estudar.",
      accept: "Mate os Corações primeiro: eles curam os cavaleiros. E não fique embaixo da ponte rolante.",
      progress: "O galpão ainda está cheio de cavaleiro. Quinze, dez Corações e cinco placas.",
      complete: "Cinco placas, e uma ainda quente. Tome este anel, forjado aqui mesmo: ele segura o calor por você.",
    },
    rewards: { xp: 34000, gold: 8000, items: [{ itemId: "anel_alto_forno", count: 1 }] },
  }),
  q({
    id: "golem_convertedor", name: "O Golem do Convertedor", giver: "mestre_aciaria", minLevel: 72, requires: ["sopro_convertedor"],
    summary: "O próprio convertedor levantou e virou o Golem do Convertedor. O Mestre da Aciaria pede um grupo para desligá-lo; o Forneiro-Chefe quer saber quando acabar.",
    steps: [
      { kind: "boss", target: "golem_convertedor", count: 1, label: "Golem do Convertedor" },
      { kind: "talk", target: "forneiro_chefe", count: 1, label: "Avisar o Forneiro-Chefe" },
    ],
    dialog: {
      offer: "O convertedor levantou do berço e anda pela Aciaria soprando oxigênio em brasa. Chame um grupo e desligue o Golem do Convertedor. Depois avise o Forneiro-Chefe, que ele vai querer comemorar.",
      accept: "Ele sopra em cone: fique de lado. Quando chamar a escória, mate os golens pequenos antes que cerquem você. Toda segunda às cinco ele acorda sozinho.",
      progress: "O Golem ainda sopra. Desligue o convertedor e avise o Forneiro-Chefe.",
      complete: "Convertedor desligado e o Forneiro já sabe! Este amuleto tem um rubi do fundo da panela. Use com orgulho.",
    },
    rewards: { xp: 70000, gold: 15000, items: [{ itemId: "amuleto_rubi", count: 1 }] },
  }),
  q({
    id: "chapa_fina", name: "Chapa Fina", giver: "operador_laminador", minLevel: 86, requires: ["golem_convertedor"],
    summary: "Rexes de Ferro deitaram na mesa de rolos do Laminador e os Elementais de Magma tomaram o lingotamento. O Operador quer a linha andando.",
    steps: [
      { kind: "explore", target: "Lingotamento e Laminação", count: 1, label: "Chegar ao Lingotamento" },
      { kind: "kill", target: "rex_ferro", count: 20, label: "Rexes de Ferro" },
      { kind: "kill", target: "magma_elemental", count: 10, label: "Elementais de Magma" },
      { kind: "deliver", target: "placa_aco_fundido", count: 6, label: "Placas de Aço Fundido" },
    ],
    dialog: {
      offer: "Laminador é simples: placa grossa entra, chapa fina sai. Só que agora tem Rex de Ferro deitado na mesa de rolos e Elemental de Magma no lingotamento. Vinte rexes, dez elementais e seis placas de aço para testar a linha.",
      accept: "O Rex pisa forte: quando ele levantar a pata, saia de perto. O resto é martelo e paciência.",
      progress: "A linha continua parada. Vinte rexes, dez elementais, seis placas.",
      complete: "Linha andando e chapa saindo fina como papel! Este elmo foi o primeiro que saiu do laminador novo.",
    },
    rewards: { xp: 60000, gold: 14000, items: [{ itemId: "elmo_laminador", count: 1 }] },
  }),
  q({
    id: "poco_do_cadinho", name: "O Poço do Cadinho", giver: "espirito_fundidor", minLevel: 100, requires: ["chapa_fina"],
    summary: "Abaixo da escotilha do Lingotamento fica o Coração do Forno, onde Forjadores Rubros e Gosmas de Aço Líquido servem à Fornalha Primordial. O Espírito do Primeiro Fundidor quer saber até onde a coisa foi.",
    steps: [
      { kind: "explore", target: "Coração do Forno", count: 1, label: "Descer ao Coração do Forno" },
      { kind: "kill", target: "forjador_rubro", count: 15, label: "Forjadores Rubros" },
      { kind: "kill", target: "gosma_aco_liquido", count: 10, label: "Gosmas de Aço Líquido" },
      { kind: "deliver", target: "frasco_aco_liquido", count: 2, label: "Frascos de Aço Líquido" },
    ],
    dialog: {
      offer: "Desça pela escotilha do Lingotamento até o Coração do Forno. Lá embaixo os Forjadores Rubros batem aço para a Fornalha, e o aço líquido anda sozinho. Quinze forjadores, dez gosmas e dois frascos de aço líquido. Preciso ver com estes olhos que não tenho mais.",
      accept: "Leve gelo, leve poção e leve gente. O calor lá embaixo derrete até coragem.",
      progress: "Ainda ouço os martelos lá embaixo. Quinze forjadores, dez gosmas, dois frascos.",
      complete: "Dois frascos... brilham como a primeira corrida. Então é verdade: a Fornalha acordou de vez. Descanse, porque o próximo passo é ela.",
    },
    rewards: { xp: 110000, gold: 25000, items: [{ itemId: "health_potion_large", count: 25 }, { itemId: "mana_potion_large", count: 25 }, { itemId: "gem_red", count: 3 }] },
  }),
  q({
    id: "fornalha_primordial", name: "A Fornalha Primordial", giver: "espirito_fundidor", minLevel: 112, requires: ["poco_do_cadinho"],
    summary: "A Fornalha Primordial, a faísca que acendeu a usina, acordou no Cadinho Primordial. O Espírito do Primeiro Fundidor pede um grupo de cinco ou mais para apagá-la.",
    steps: [{ kind: "boss", target: "fornalha_primordial", count: 1, label: "A Fornalha Primordial" }],
    dialog: {
      offer: "No fundo do Coração do Forno, no Cadinho Primordial, mora a Fornalha que eu acendi. Ela acordou e quer a usina inteira. Junte cinco, seis, quantos couberem, e apague A Fornalha Primordial. Eu não consigo mais. Você consegue?",
      accept: "Ela cospe aço líquido em área e chama as gosmas. Espalhem-se, curem-se e não parem de bater.",
      progress: "A Fornalha ainda queima. Eu sinto daqui.",
      complete: "Apagada... depois de tanto tempo. Você tem um coração de aço, e agora todo mundo vai saber. Obrigado. Posso descansar.",
    },
    rewards: { xp: 180000, gold: 45000, items: [{ itemId: "health_potion_large", count: 30 }], unlock: "title:coracao_de_aco" },
  }),
```

### 4.2 NPCs e placas

Sprites conferidos (todos `Character/*/SpriteSheet.png` 64×112, exigência de `npcs.test.ts`). Placas usam o sprite dos
quadros do jogo (Inspector), como o Quadro de Recompensas e o Painel da Obra.

| npcId | Nome | Papel | Sprite |
|---|---|---|---|
| `chefe_estacao_minerio` | Chefe da Estação do Minério | trem | `NinjaWater` |
| `almoxarife` | Almoxarife do Minério | loja (compra tudo) | `EggBoy` |
| `depot_minerio` | Guarda-Volumes do Minério | depósito | `LionYellow` |
| `capela_epi` | Capelã do EPI Espiritual | bênção | `NinjaMageOrange` |
| `mestre_turno` | Mestre de Turno | missões 1–5 | `CamouflageGreen` |
| `operadora_correia` | Operadora da Correia | missão 6 | `NinjaThunder` |
| `encarregada_coqueria` | Encarregada da Coqueria | missões 7–8 | `Cavegirl2` |
| `forneiro_chefe` | Forneiro-Chefe | missões 9–10, anuncia o evento | `Flam` |
| `mestre_aciaria` | Mestre da Aciaria | missões 11–12 | `NinjaRed` |
| `operador_laminador` | Operador do Laminador | missão 13 | `MaskGoldRacoon` |
| `supervisora_controle` | Supervisora da Sala de Controle | viagem + depósito (posto avançado) | `NinjaGreen` |
| `espirito_fundidor` | Espírito do Primeiro Fundidor | missões 14–15 | `Spirit` |
| `placa_correias`, `placa_area_quente`, `placa_epi`, `placa_carga_suspensa`, `placa_forno_acordado` | placas | ambientação nas portas 25/40/60/80/100 | `Inspector` |

Constante e entradas em `packages/shared/src/data/npcs.ts` (a constante perto de `MALHA_ARRIVAL`; as entradas no fim de
`NPCS`):

```ts
/**
 * Chegada de trem na Estação do Minério (Siderúrgica, ciclo 19, tools/mapgen/expansion6.mjs): plataforma 1, a mesma
 * planta da Estação Central. O preço depende de quem vende (Vila 250, Malha 200, Sala de Controle 100).
 */
const MINERIO_ARRIVAL = { id: "minerio", label: "Estação do Minério", x: 24, y: 594 } as const;
```

```ts
  // ===== Siderúrgica (ciclo 19): fantasia industrial, NPCs só por papel (tools/mapgen/expansion6.mjs). Trem pela
  // Estação do Minério e pela Sala de Controle (posto avançado); placas com o sprite dos quadros.
  chefe_estacao_minerio: {
    id: "chefe_estacao_minerio", name: "Chefe da Estação do Minério", sprite: C + "NinjaWater/SpriteSheet.png",
    greeting: "Estação do Minério, ponto final! Trem para a Vila de Pedra Clara ou para a Estação Central da Malha, e até o level 8 a passagem é por conta da casa. Para a usina, é pelo portão sul, a partir do level 10.",
    travel: [{ id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 250 }, MALHA_ARRIVAL],
    idleLines: [
      "Placa da estação: 'Estamos há 0 dias sem acidente. Recorde: 3.'",
      "O trem do minério chega carregado e volta vazio. O passageiro, ao contrário.",
      "Crachá na mão, por favor. Brincadeira: aqui ninguém tem crachá.",
    ],
  },
  almoxarife: {
    id: "almoxarife", name: "Almoxarife do Minério", sprite: C + "EggBoy/SpriteSheet.png",
    greeting: "Almoxarifado aberto! Poção, limonada e prato feito. Compro tudo o que você arrancar dos bichos da usina: lasca, carvão, fuligem, escória, até gota de gusa (de luva, por favor).",
    shop: {
      sells: sells(
        "health_potion_medium", "health_potion_large", "mana_potion_medium", "mana_potion_large",
        "limonada_turno", "prato_feito", "beaf", "yakitori",
      ),
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material", "food", "potion"],
    },
    idleLines: [
      "Requisição em três vias. A terceira é para o arquivo morto.",
      "Prato feito saindo! Ovo só às sextas.",
      "Lasca de ferrugem? Compro. Não pergunte para quê.",
    ],
  },
  depot_minerio: {
    id: "depot_minerio", name: "Guarda-Volumes do Minério", sprite: C + "LionYellow/SpriteSheet.png", depot: true,
    greeting: "O mesmo baú da Vila, aqui na plataforma. Deixe o peso antes de descer para o calor.",
    idleLines: [
      "Volume sem etiqueta vai para o alto-forno. Mentira. Ou não.",
      "Tudo guardado, tudo seco, tudo frio. O resto da usina não pode dizer o mesmo.",
    ],
  },
  capela_epi: {
    id: "capela_epi", name: "Capelã do EPI Espiritual", sprite: C + "NinjaMageOrange/SpriteSheet.png", blessing: true,
    greeting: "Capacete, luva, bota e bênção: o EPI completo. A bênção protege do que o capacete não protege.",
    idleLines: [
      "EPI espiritual: não substitui o capacete, mas ajuda.",
      "Quem entra no Alto-Forno sem bênção sai mais leve. De XP.",
      "Rezo por todos que descem ao Coração do Forno. Volte, viu?",
    ],
  },
  mestre_turno: {
    id: "mestre_turno", name: "Mestre de Turno", sprite: C + "CamouflageGreen/SpriteSheet.png",
    greeting: "Turno novo, gente nova! O Pátio de Minério fica depois do portão sul, a partir do level 10. Bata o ponto comigo antes de sair, que a usina acordou com fome.",
    idleLines: [
      "Sirene das seis! Quem chegou, chegou.",
      "Hora extra só com autorização. Do Contramestre, não: dele eu quero distância.",
      "O Alto-Forno acordou de mau humor. Acontece.",
    ],
  },
  operadora_correia: {
    id: "operadora_correia", name: "Operadora da Correia", sprite: C + "NinjaThunder/SpriteSheet.png",
    greeting: "Esta correia nunca para. Nunca. Nem quando as serpentes resolveram morar nela.",
    idleLines: [
      "Correia parada é prejuízo; correia andando sozinha é pior.",
      "Pise na esteira e corra junto: é mais rápido que andar.",
      "Viu uma tira de borracha solta? É serpente. Ou era.",
    ],
  },
  encarregada_coqueria: {
    id: "encarregada_coqueria", name: "Encarregada da Coqueria", sprite: C + "Cavegirl2/SpriteSheet.png",
    greeting: "Bem-vindo à Coqueria: aqui o carvão vira coque e o coque vira problema. As gosmas de gusa escaparam do cadinho e as corujas fizeram ninho na fumaça.",
    idleLines: [
      "Bateria de fornos: sessenta portas, sessenta brasas, nenhum descanso.",
      "Fumaça preta é coruja. Fumaça branca é vapor. Fumaça laranja é para correr.",
      "O Contramestre Fuligem anda pelo pátio leste. Grita mais do que trabalha.",
    ],
  },
  forneiro_chefe: {
    id: "forneiro_chefe", name: "Forneiro-Chefe", sprite: C + "Flam/SpriteSheet.png",
    greeting: "O Alto-Forno acordou. Ronca, cospe gusa e não deixa ninguém dormir. Toda segunda, às cinco, tem sangria, e o Golem do Convertedor sobe junto na Aciaria.",
    idleLines: [
      "Sangria toda segunda, às cinco. Traga a turma e a marmita.",
      "Gusa no canal, escória na panela, salamandra no meio do caminho.",
      "Choque térmico: gelo contra bicho de fogo. Lição número um.",
    ],
  },
  mestre_aciaria: {
    id: "mestre_aciaria", name: "Mestre da Aciaria", sprite: C + "NinjaRed/SpriteSheet.png",
    greeting: "Aciaria: onde a gusa vira aço e o aço vira cavaleiro. Não pergunte como. O convertedor criou vontade própria, e o Golem que mora nele não gosta de visita.",
    idleLines: [
      "Sopro de oxigênio: de longe, por favor.",
      "Panela cheia é panela perigosa. Panela vazia também.",
      "Ponte rolante passando! Ninguém embaixo da carga.",
    ],
  },
  operador_laminador: {
    id: "operador_laminador", name: "Operador do Laminador", sprite: C + "MaskGoldRacoon/SpriteSheet.png",
    greeting: "Chapa grossa entra, chapa fina sai. No meio do caminho tem um Rex de Ferro deitado na mesa de rolos.",
    idleLines: [
      "Bobina pronta é bobina embalada. Bobina solta é bobina rolando atrás de você.",
      "Velocidade de laminação: rápida. Paciência do operador: lenta.",
      "Chapa fina, conversa curta.",
    ],
  },
  supervisora_controle: {
    id: "supervisora_controle", name: "Supervisora da Sala de Controle", sprite: C + "NinjaGreen/SpriteSheet.png", depot: true,
    greeting: "Sala de Controle, posto avançado. Daqui sai trem para a Vila, para a Estação do Minério e para a Malha, e o baú é o mesmo de sempre. Lá embaixo, depois da escotilha, fica o Coração do Forno. Não recomendo.",
    travel: [
      { id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 250 },
      { ...MINERIO_ARRIVAL, price: 100 },
      MALHA_ARRIVAL,
    ],
    idleLines: [
      "Painel verde: tudo bem. Painel vermelho: corre.",
      "Café da garrafa térmica, frio desde o turno passado. Ou do retrasado.",
      "Escotilha fechada, forno acordado. Escotilha aberta, forno mais acordado ainda.",
    ],
  },
  espirito_fundidor: {
    id: "espirito_fundidor", name: "Espírito do Primeiro Fundidor", sprite: C + "Spirit/SpriteSheet.png",
    greeting: "Eu acendi a primeira corrida desta usina, muito antes de você nascer. A Fornalha Primordial era só uma faísca. Agora acordou, e lá embaixo ela não está sozinha.",
    idleLines: [
      "A primeira gusa a gente nunca esquece.",
      "O Coração do Forno não esfria. Nem deveria.",
      "Desça em grupo. Grupo grande. Cinco, no mínimo.",
    ],
  },
  placa_correias: {
    id: "placa_correias", name: "Placa: Correias e Coqueria", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "CORREIAS E COQUERIA — lv 25+. Não pise na esteira parada: ela pode voltar a andar.",
    idleLines: ["Correias e Coqueria — lv 25+.", "Esteira em movimento. Serpentes também."],
  },
  placa_area_quente: {
    id: "placa_area_quente", name: "Placa: Área Quente", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "ÁREA QUENTE — ALTO-FORNO — lv 40+. Gelo contra bicho de fogo: choque térmico.",
    idleLines: ["ÁREA QUENTE — lv 40+.", "Gusa no canal. Não é sopa."],
  },
  placa_epi: {
    id: "placa_epi", name: "Placa: Uso Obrigatório de EPI", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "USO OBRIGATÓRIO DE EPI — ACIARIA — lv 60+. Capacete, luva, bota e coragem.",
    idleLines: ["Aciaria — lv 60+.", "Proibido ficar embaixo da carga suspensa."],
  },
  placa_carga_suspensa: {
    id: "placa_carga_suspensa", name: "Placa: Carga Suspensa", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "CUIDADO: CARGA SUSPENSA — LINGOTAMENTO E LAMINAÇÃO — lv 80+. A Sala de Controle fica no canto noroeste.",
    idleLines: ["Lingotamento e Laminação — lv 80+.", "Ponte rolante passando!"],
  },
  placa_forno_acordado: {
    id: "placa_forno_acordado", name: "Placa: O Forno Está Acordado", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "NÃO ENTRE: O FORNO ESTÁ ACORDADO — CORAÇÃO DO FORNO — lv 100+. Desça em grupo de cinco ou mais.",
    idleLines: ["Coração do Forno — lv 100+.", "Escotilha quente. Não sente."],
  },
```

### 4.3 Viagem: mudanças em NPCs existentes

- `chefe_estacao_vila.travel`: `[MALHA_ARRIVAL, { ...MINERIO_ARRIVAL, price: 250 }]`; saudação passa a citar a
  Siderúrgica ("Trem para a Malha da Ferrovia e para a Estação do Minério, na Siderúrgica! …").
- `chefe_estacao_malha.travel`: `[{ id: "village", … price: 200 }, { ...MINERIO_ARRIVAL, price: 200 }]`; saudação cita a
  Estação do Minério.
- Nenhum teste existente fixa a lista de destinos desses dois (`worldIndex.test.ts` usa só o id `malha`; o
  `travel.test.ts` do servidor confere o `coach_village`).
- **Opcional C7 (só se sobrar tempo; o plano não exige):** `TravelDest.minLevel?` (servidor recusa abaixo do level em
  `server/systems/npcs.ts`, cliente mostra "lv 80+" e desabilita) e o destino `{ id: "controle", label: "Sala de
  Controle", x: 15, y: 637, price: 150, minLevel: 80 }` no `chefe_estacao_minerio`. Sem o `minLevel`, viagem para dentro
  da Sala pularia as portas de nível — então, sem C7, **não** criar viagem para a Sala. O tile (15,637) fica livre de
  qualquer forma (§1.4). Se fizer C7, atualizar `server/systems/travel.test.ts` (a mensagem `NpcOpen` ganha o campo).

### 4.4 Evento

Agenda de segunda hoje: Reunião Geral 9h–9h45, Despertar do Lich 12h15–13h. **Segunda 17h está livre** (terça 17h é
Ferumbras, quarta 17h o Apito, quinta 17h Orshabaal, sexta 17h o Sextou). Entra no fim de `WEEKLY_EVENTS`:

```ts
  // Siderúrgica (ciclo 19): a sangria das cinco de segunda, fim do expediente, como as outras edições das 17h (terça
  // Ferumbras, quarta Apito, quinta Orshabaal); a segunda às 17h estava livre.
  { id: "sangria_do_alto_forno", name: "Sangria do Alto-Forno", desc: "A corrida de gusa acordou o Golem do Convertedor na Aciaria! Loot +50%", xpMult: 1, lootMult: 1.5, day: 1, hour: 17, durationMin: 60, boss: "golem_convertedor" },
```

O servidor já convoca o chefe no começo (`monsters.callBoss`), no spawn único dele (80,638). Ajustes obrigatórios em
`events.test.ts`: lista ordenada de chefes ganha `"golem_convertedor"`; a lista "dia útil a partir das 13h" vira
`["apito_da_locomotiva", "ferumbras_no_expediente", "orshabaal_no_expediente", "sangria_do_alto_forno"]` (ordem do
array); `nextScheduled(segunda 13h)` passa de `cacada_ao_rei` para **`sangria_do_alto_forno`** (e acrescentar
`nextScheduled(segunda 18h) = cacada_ao_rei`); novo `expect(eventDef("sangria_do_alto_forno")).toMatchObject({ day: 1,
hour: 17, durationMin: 60, boss: "golem_convertedor", lootMult: 1.5 })`. O teste de sobreposição geral continua valendo.

### 4.5 Conquistas e títulos

`packages/shared/src/data/achievements.ts`:

- `AchMetric` ganha `"boss:contramestre_fuligem" | "boss:golem_convertedor" | "boss:fornalha_primordial"` (o servidor já
  conta `boss:<id>` de qualquer chefe).
- `TITLES`: `contramestre: "o Contramestre"`, `mestre_convertedor: "Mestre do Convertedor"`, `coracao_de_aco: "Coração de
  Aço"` (todos ≤ `MAX_TITLE_LEN` 24).
- Entradas (pares métrica/alvo inéditos):

```ts
  // Siderúrgica (ciclo 19): os três chefes da usina. "Coração de Aço" vem da missão final (A Fornalha Primordial).
  a("hora_extra_paga", "Hora Extra Paga", "Derrote o Contramestre Fuligem", "⏰", 30, "boss:contramestre_fuligem", 1, { rewards: ["title:contramestre"], rare: true }),
  a("convertedor_desligado", "Convertedor Desligado", "Derrote o Golem do Convertedor", "🔥", 40, "boss:golem_convertedor", 1, { rare: true }),
  a("mestre_do_convertedor", "Mestre do Convertedor", "Derrote o Golem do Convertedor 5 vezes", "⚙️", 40, "boss:golem_convertedor", 5, { rewards: ["title:mestre_convertedor"], rare: true }),
  a("fornalha_apagada", "Fornalha Apagada", "Derrote A Fornalha Primordial", "🧯", 60, "boss:fornalha_primordial", 1, { rare: true }),
```

O bestiário (`bestiary_all`) cresce sozinho com os 13 comuns novos, como em toda região anterior.

---

## 5. Arte

### 5.1 Como gerar sem mudar id antigo do atlas

O `TilesetLemon` (`assets/tiles/lemon-terrain.png`, 16 colunas, hoje 35 linhas = até 560 tiles; capacidade 2.560) aloca
tile sob demanda e **acrescenta no fim** (`LemonSet.add`: `id = used++`). Por isso:

1. Toda arte nova mora em duas fábricas de **alocação adiada** em `tools/mapgen/lemon.mjs`, no molde de `L.rail()`:
   `L.industry = () => (L._industry ??= createIndustry(L));` (compartilhada com a Montadora no ciclo 20) e
   `L.steel = () => (L._steel ??= createSteel(L));`. A **primeira chamada** acontece dentro de `expand6`, que roda depois
   de todas as etapas publicadas (depois de `lateObjects18`). Nenhuma etapa antiga chama as duas.
2. Não mudar função de desenho, chave nem ordem de alocação existente (inclusive `createRail`). `L.rail()` é memorizado:
   chamar de novo na etapa 6 devolve as mesmas funções, e tile com o mesmo conteúdo sai com o mesmo id (chave por hash
   de conteúdo, `contentKey`).
3. Chaves novas com prefixo `ind_` e `aco_`; peças compostas (lastro, trilho com para-choque, veículo sobre a via,
   recolors) com `contentKey(prefixo, cv)` para deduplicar.
4. **Nenhum tileset novo**: os canos vêm de `assets/ninja/Backgrounds/Tilesets/Pipes.png` (240×48, 15×3; família cinza
   nas colunas 5–9), lido com `pngjs` dentro de `lemon.mjs` (`TILESET_DIR` de `lib.mjs`) e copiado pixel a pixel para
   tiles Lemon; `Pipes.png` **não** entra em `TILESET_FILES`.
5. Velocidade do chão pelos props do tile Lemon: `L.tile(key, draw, { speed, terrain })` (a esteira usa `speed: 70`; o
   mínimo aceito pelo jogo é 10).
6. **Gusa = recolor da água para o Lemon**: `L.overlay(gidAgua, 'gusa', 0, recolorir)` sobre a família de água do pântano
   (`'W'` com deslocamento `(13, −1)` na tabela de blob: líquido roxo com margem de pedra). O líquido (pixels onde azul
   ou roxo dominam) vira a rampa `#8a1c24 → #d14b34 → #e66a3a → #ffad5d → #ffe9a0` por luminância; a margem de pedra
   fica. Como o gid final é do `TilesetLemon`, o `WaterGrid` **não** trata gusa como água (ninguém pesca no ferro
   derretido). Crosta de escória: o mesmo overlay com rampa cinza-marrom (`#3a2e2c → #5d4a42 → #8d7a6a`). Ambas
   bloqueadas na colisão.
7. Prova: `diff-world` (tilesets antigos com o mesmo `firstgid`; `TilesetLemon` só cresce) e `diff-atlas` (§7.1: os
   tiles 0…N0−1 do PNG novo idênticos ao publicado, pixel a pixel).

### 5.2 Peças

Na tabela, `I = L.industry()`, `T = L.steel()`, `R = L.rail()`, `S` = `L.S`. Os nomes de `T` são sugestão (só a
`expansion6.mjs` usa), **exceto `T.coil()`**: sem parâmetro, devolve o gid da bobina 1×1, e a Montadora usa na
carroceria do Caminhão de Bobinas (`L.steel()` também é memorizado; chamar no `expand7` não realoca). **Os de `I` são contrato com a Montadora** (ciclo 20 chama `L.industry()` de novo, recebe o mesmo
objeto memorizado e não aloca nada que já exista); ficam fora de `L.S` de propósito, porque `L.S` é montado na criação
do Lemon e alocaria tudo cedo demais. Assinaturas (cada uma devolve um gid, `slidingDoor` devolve as linhas de gids):

| Função | Parâmetros | Props do tile |
|---|---|---|
| `I.checker(v)` | `v` 0–3 | speed 90, `floor` |
| `I.stripe(dir, part)` | `dir` `'h'`/`'v'`; `part` `'mid'`/`'end'`/`'corner'` | speed 90, `floor` |
| `I.asphalt(v)` · `I.asphaltLine(dir)` | `v` 0–3 · `dir` `'h'`/`'v'` (faixa tracejada no meio) | speed 85, `road` |
| `I.concrete(v)` | `v` 0–3 | speed 90, `floor` |
| `I.belt(dir, part)` | `dir` `'e'`/`'w'`/`'n'`/`'s'` (sentido da seta); `part` `'start'`/`'mid'`/`'end'` | **speed 70**, `floor` |
| `I.pipe(part)` | `'h'`, `'v'`, `'ne'`, `'nw'`, `'se'`, `'sw'`, `'t_n'`, `'t_s'`, `'t_e'`, `'t_w'`, `'cross'`, `'cap_n'`, `'cap_s'`, `'cap_e'`, `'cap_w'` | — |
| `I.metalWall(part)` | nove partes `'nw'`, `'n'`, `'ne'`, `'w'`, `'c'`, `'e'`, `'sw'`, `'s'`, `'se'`; quinas internas `'in_nw'`, `'in_ne'`, `'in_sw'`, `'in_se'`; `'pillar'` | — |
| `I.slidingDoor(dir)` | `'h'` (2×1) / `'v'` (1×2) | — |
| `I.chainFence(part)` | `'h'`, `'v'`, `'post'`, `'corner'` | — |
| `I.concreteWall(part)` | `'h'`, `'v'`, `'end'`, `'corner'` | — |

Chaves no atlas com prefixo `ind_` (`ind_checker:<v>`, `ind_belt:<dir>:<part>` …); quem chama no ciclo 19 é sempre a
`expansion6.mjs`.

| Peça | Função | Tam. (tiles) | Camada / colisão | Origem | ~tiles |
|---|---|---|---|---|---|
| Prédio da estação, plataformas, bancos, relógio, sinais, cancela, brita, trilho e lastro, vagão `hopper`, locomotiva | `L.rail()` | — | como na Malha | **reaproveita** (mesmo conteúdo, mesmo id; pontas de via novas podem gerar alguns) | ~15 |
| Braseiro, rachadura de lava e de pedra, entulho cinza, ossos, teia, arandela | `L.S.*`, `L.overlay(…'sconce'…)` | 1×1 | deco | **reaproveita** | 0 |
| Paredes de rocha `'R'`, piso escuro `'I'`, cerca `'H'`, porta `'D'`, props `'E'`, casa `houseOrange`, `lamp`, árvores | pack | — | — | **reaproveita** | 0 |
| Chapa xadrez | `I.checker(v)` | 1×1 ×4 | chão, speed 90 `floor` | novo | 4 |
| Faixa zebrada (reta, ponta, quina) | `I.stripe(dir, part)` | 1×1 | chão, speed 90 | novo | 6 |
| Asfalto e faixa pintada | `I.asphalt(v)`, `I.asphaltLine(dir)` | 1×1 | chão, speed 85 `road` | novo | 8 |
| Concreto | `I.concrete(v)` | 1×1 ×4 | chão, speed 90 | novo | 4 |
| Esteira (H, V, pontas, curva) | `I.belt(dir, part)` | 1×1 | chão, **speed 70** `floor` | novo | 10 |
| Canos (reto H/V, curvas, T, cruz, flange) | `I.pipe(part)` | 1×1 | `above` (aéreo) ou deco+colisão | novo (cópia de Pipes.png) | 15 |
| Parede metálica (nove partes, T, quinas internas) | `I.metalWall(part)` | 1×1 | deco + colisão | novo | 14 |
| Portão de correr H e V | `I.slidingDoor(dir)` | 2×1 / 1×2 | deco + colisão | novo | 4 |
| Cerca de tela e poste | `I.chainFence(dir)` | 1×1 | deco + colisão | novo | 4 |
| Muro de concreto | `I.concreteWall(part)` | 1×1 | deco + colisão | novo | 4 |
| Gusa | `T.gusa(gidAgua)` | 1×1 (blob) | chão + colisão + luz | novo (recolor) | ~30 |
| Crosta de escória | `T.slag(gidAgua)` | 1×1 (blob) | chão + colisão | novo (recolor) | ~20 |
| Alto-Forno (torre, anel de ventaneiras em brilho, goela) | `T.blastFurnace()` | 6×9 | 3 linhas de base, resto `above` | novo | ~48 |
| Regenerador | `T.stove()` | 2×6 | 2 de base | novo | 12 |
| Convertedor (vaso inclinado nos munhões) | `T.converter()` | 4×4 | 2 de base | novo | 16 |
| Carro-torpedo sobre a via | `T.torpedoCv()` + `R.overTrack` | 5×2 | sobre o trilho | novo | ~12 |
| Panela de aço | `T.ladle()` | 2×2 | 1 de base | novo | 4 |
| Ponte rolante (viga, cabeceira, gancho) | `T.crane(part)` | 1×1 | `above` | novo | 8 |
| Mesa de rolos fria/quente | `T.rollerTable(dir, hot)` | 1×1 | deco + colisão | novo | 6 |
| Cadeira de laminação | `T.millStand()` | 3×3 | 2 de base | novo | 9 |
| Pilha de placas, bobina | `T.slabPile()`, `T.coil()` | 2×1, 1×1 | deco + colisão | novo (bobina volta no ciclo 20) | 4 |
| Pilha de minério de ferro / carvão | `T.orePile(kind)` | 3×2 | 1 de base | novo | 12 |
| Bateria de fornos de coque (porta com brilho, parede, topo) | `T.cokeOven(part)` | 1×2 | 1 de base | novo | 6 |
| Torre de apagamento | `T.quenchTower()` | 3×4 | 2 de base | novo | 12 |
| Chaminé listrada | `T.chimney()` | 2×6 | 1 de base | novo | 12 |
| Mesa de controle (botões e luzes, sem tela) | `T.controlDesk()` | 3×1 | deco + colisão | novo | 3 |
| Escotilha do Poço (andável) | `T.hatch()` | 1×1 | chão | novo | 2 |
| Sucata | `T.scrap(v)` | 1×1 | deco + colisão | novo | 3 |
| **Total** | | | | | **~320** (atlas 35 → ~55 linhas; PNG 256×~880) |

Estilo: o do pack (16×16, contorno `#141b1b`, paleta de `lemon.mjs`: `P.*`, `RP.*`; fogo `#e66a3a #ffad5d #ffe9a0`;
aço `#c3ccd2 #93a0aa #66737d #454f57`; amarelo de segurança `#e6c23e`). Revisar recortes ampliados (`tools/mapgen/crop.mjs`
/ `view.mjs`) antes de fechar.

---

## 6. Frentes paralelas

### 6.1 Arquivos (ninguém edita arquivo de outra frente)

| Frente | Arquivos | Entrega |
|---|---|---|
| **A — mapa e arte** | `tools/mapgen/expansion6.mjs` (novo), `tools/mapgen/lemon.mjs` (só acréscimos: `createIndustry`, `createSteel`), `tools/mapgen/generate.mjs` (etapa nova + saída), `tools/mapgen/diff-atlas.mjs` (novo), `assets/maps/world.json`, `assets/tiles/lemon-terrain.png`, `packages/shared/src/daynight.ts` (`ZONE_MODES`), `packages/shared/src/data/siderurgica.test.ts` (novo), `e2e/siderurgica.spec.ts` (novo) | §1, §2 (objetos), §3.5, §5, §7.1, §7.3 |
| **B — monstros, itens, sprites** | `packages/shared/src/data/monsters.ts`, `monsters.test.ts`, `items.ts`, `items.test.ts`, `tools/monsters/recolor.mjs`, `assets/monsters/{GusaSlime,SteelSlime,SlagGolem,ConverterGolem}{,-preview}.png` | §3.1–§3.4 |
| **C — missões, NPCs, evento, conquistas, viagem** | `packages/shared/src/data/quests.ts`, `quests.test.ts`, `npcs.ts`, `npcs.test.ts`, `events.ts`, `events.test.ts`, `achievements.ts`; se fizer C7: `server/src/systems/npcs.ts`, `server/src/systems/travel.test.ts`, `client/src/ui/npc/NpcWindow.tsx` | §4 |

Fora das frentes (integração, no fim): `CHANGELOG.md`, `docs/GAME_ROADMAP.md`, `docs/TEST_PLAN.md`,
`shared/src/data/news.ts` (Novidades: região nova, evento de segunda, percentual explorado cai para todos), via
`/fechar-ciclo`. Nenhum comando ou variável nova (README e `deploy/*` sem mudança).

### 6.2 Contrato (o que cada frente usa da outra)

- A usa de B/C só **ids**: monstros e levels de §3.5, `npcId` de §1.4, nomes de zona de §1.7 (C usa os mesmos nomes nos
  passos `explore`).
- C usa de B: ids de monstro (§3.1), material, comida, prova e equipamento (§3.3–§3.4).
- B não depende de A nem de C.

Com a Montadora (ciclo 20, `docs/regioes/montadora.md` §1), combinado com quem escreveu aquela especificação:

- **Ids sem prefixo** na Siderúrgica (padrão da Malha e das caves); a Montadora usa `mt_` em tudo, então não há colisão.
  Recolors daqui: `GusaSlime`, `SteelSlime`, `SlagGolem`, `ConverterGolem`; os de lá começam com `Mt`.
- Geometria: nada da Siderúrgica passa de y 719 (último andável y 716) e a faixa x 184–399 × y 560–721 fica vazia para
  sempre; o bloco da Montadora começa em y 746.
- `L.industry()`: as assinaturas de §5.2 são o contrato, mais `T.coil()`. A Montadora só acrescenta `L.factory()` dentro
  do `expand7`.
- Chefes vizinhos com as duas regiões somadas: o Monstro da Estufa (`mt_monstro_estufa`, lv 74, ouro 4.500–8.000) vira o
  vizinho de baixo do Golem do Convertedor; a Montadora conferiu os 4 covis e os 6 chefes novos com os dois catálogos.
  No ciclo 20, `frasco_aco_liquido` entra como custo extra no refino +4/+5 do tier 7 e, com `gem_red`, no encantamento
  III (`montadora.md` §4.6); o ciclo 19 não mexe em refino nem em encantamento.
- Caminhão de Bobinas: `mt_bobinas_sid` no tile reservado (30,605); o caminhão da Montadora leva à chegada do trem
  (24,594).
- Itens que a Montadora usa daqui: `limonada_turno` e `prato_feito` (loja da Cantineira), `gosma_aco_liquido` (faixa lv
  114 do Quadro, criada no ciclo 20; caçável no lv 100 pela escotilha, sem missão).
- Testes travados: cada ciclo só acrescenta os próprios ids (listas de fogo/gelo/morto-vivo, chefes de evento, eventos
  de dia útil a partir das 13h, `REGION_FINAL_BOSSES`).
- Sprites: nenhum sprite de monstro ou NPC se repete entre as duas regiões (o Monstro da Estufa virou o recolor
  `MtPaintBlob` de `Boss/GiantSlime2`; `Boss/GiantBamboo2` é só da Fornalha). Placas das duas regiões com `Inspector`.

### 6.3 Etapa nova no gerador (frente A)

```js
// tools/mapgen/expansion6.mjs
export const NEW_H6 = 722;
export const BLOCK6 = { x0: 4, y0: 580, w: 180, h: 140 };
export function expand6({ old, ts, S, L, spawnTile }) { /* … */ return { map, reach, portalMap }; }
```

Padrão das expansões 4/5: copia o mapa antigo (mesma largura, `layers[k].set`, `occ`, `objects.slice()`, `nextId`),
vazio sólido nas linhas novas, máscara local (`kind`) por setor, desenho, bolsões que o desenho isolou viram obstáculo
(como a expansion4), objetos novos **depois** dos antigos (NPCs, portais — inclusive o da Malha em (46,384) —, zonas,
spawns, luzes), validações e `return`. Gerador aleatório com semente própria (`mulberry32(20261026)`), sem consumir os
fluxos das etapas antigas. Em `generate.mjs`, depois do bloco `lateObjects18`:

```js
// ===================================================================== SIDERÚRGICA (ciclo 19: tools/mapgen/expansion6.mjs)
// Sexta expansão para baixo: o mapa acima (400×560) fica intacto e a região entra nas linhas 580..719, ligada à Vila e à
// Malha de trem (TravelDest) e à Malha por um portal oculto na casinha de cargas. Roda por último: é a única etapa que
// aloca L.industry()/L.steel() (os tiles Lemon antigos mantêm o id).
const { map: world6 } = expand6({ old: world5, ts, S, L: LEMON, spawnTile: SPAWN });
```

e a seção OUTPUT passa a usar `world6` (world.json, previews, `--debug`).

### 6.4 Ordem de integração

1. Todos partem da `main` com o ciclo 18 (`world.json` de 400×560 e 851 objetos = base do `diff-world`; guardar uma
   cópia em `%TEMP%\world-c18.json` e outra do PNG em `%TEMP%\lemon-c18.png` antes de gerar).
2. Merge **B** → **C** → **A** (A por último: com o mapa novo e sem B/C, falhariam `monsters.test` "define todo monstro
   usado nos spawns" e `npcs.test` "define todo npcId usado no mapa"). Entre o merge de C e o de A ficam vermelhos, como
   esperado, só os testes de C que precisam da região no mapa: `npcs.test` "destinos de viagem caem em tile andável"
   (24,594) e os de caçável no level de `quests.test`. Depois de A: tudo verde, inclusive `siderurgica.test.ts`.
3. Integração: `npm run typecheck`, `npm test`, E2E da região com `--repeat-each=3`, suíte E2E completa, carga (§7.4),
   revisão cruzada por outro agente, `/fechar-ciclo`.

---

## 7. Validações e testes

### 7.1 No gerador (`expansion6.mjs` falha alto, como as anteriores)

1. **Vazio**: maior linha andável do mapa antigo `lastRow` (552) e primeira andável do bloco: `primeira − 1 − lastRow ≥ 26`
   (hoje 30); nada andável em y 560–582 e y 717–721.
2. **Nada andável fora dos blocos**: nas linhas novas, todo tile andável está em x 7–180, y 583–716; nada em x ≥ 181
   (faixa vazia ao lado).
3. **Mapa antigo intacto**: as 4 camadas de y < 560 iguais às do `old`; `objects[0…n−1]` idênticos (JSON).
4. **Tudo alcançável**: BFS do templo com portais alcança todo tile andável do bloco, com NPCs e placas virados obstáculo
   (bolsão isolado pelo desenho vira obstáculo antes, contando quantos).
5. **Setores selados**: BFS **sem** portais a partir de cada chegada (trem, B das portas, chegada de baixo) só visita
   tiles do próprio setor (zona de menor área), e visita todos os andáveis dele.
6. **Portas**: 6 portas com `minLevel` estritamente crescente (10, 25, 40, 60, 80, 100) na ordem da cadeia; cada uma tem a
   saída **sem** `minLevel`/`quest` do outro lado; destino da porta = vizinho (Chebyshev 1) da saída e destino da saída =
   vizinho da porta; portal e destino andáveis; destino nunca é portal; portão (arte) bloqueado.
7. **Spawns**: andável, raio inteiro dentro do setor (zona), `level` da linha dentro da `faixa` da zona, ≥ raio+6 de PZ,
   Chebyshev − raio ≥ 8 de NPC/placa, ≥ 7+raio de portal e chegada, espaço ≥ 3×count tiles andáveis no quadrado do raio,
   chefes ≥ 11 de qualquer outro spawn, exatamente 1 spawn de cada chefe.
8. **NPCs**: andável, alcançável, ≥ 2 entre si, fora de portal/destino/chegada do trem, os da Estação e da Sala dentro da
   PZ; virar obstáculo não fecha bolsão (alcance perde exatamente os próprios tiles).
9. **Pontos fixos**: chegada do trem (24,594) na plataforma, em PZ, ≥ 2 de NPC; tile da reserva (30,605) e o da Sala
   (15,637) livres e andáveis; atalho: (46,384) andável no mapa antigo, sem objeto antigo, não é portal nem destino de
   portal antigo; (46,385) andável, não portal, vizinho da porta.
10. **Zonas**: 9 objetos (Pátio com 2 retângulos), props `music`, `pz`, `faixa`, `regiao`; todo andável do bloco cai em
    alguma zona da região.
11. **Atlas**: `N0 = LEMON.set.used` medido antes de `expand6`; imprimir `usados agora − N0` (esperado 250–400). Script
    novo `tools/mapgen/diff-atlas.mjs <lemon-antigo.png> [novo.png]`: os primeiros `altura_antiga/16 × 16` tiles idênticos
    pixel a pixel; sai 1 se algum mudou ou se o PNG encolheu.
12. Linha de resumo no console: tamanho, andáveis por setor, objetos, spawns/monstros, luzes, tiles Lemon novos, bolsões.

Depois de gerar: `node tools/mapgen/diff-world.mjs %TEMP%\world-c18.json` → `tiles alterados: 0; objetos antigos
idênticos: 851/851; … 400x560 -> 400x722` (sem `--allow`) e `node tools/mapgen/diff-atlas.mjs %TEMP%\lemon-c18.png`.

### 7.2 Unitários

**A — `packages/shared/src/data/siderurgica.test.ts` (novo, lê `world.json`)**
- mapa 400×722; nada andável em y 553–582 nem fora de x 7–180 nas linhas ≥ 560;
- as 9 zonas com `pz`/`faixa`/`regiao` (§1.7); `faixa` bate com `zoneLevels` do índice do mundo (mín/máx dos comuns);
- 6 portas: `minLevel` 10/25/40/60/80/100 e a saída sem level ao lado; rótulo do índice "Correias e Coqueria · lv 25+";
- spawns: cada um na zona certa, `level` = `MONSTERS[id].level`, dentro da faixa; 1 spawn de cada chefe na zona certa;
- caçável (cópia da função `reachable` de `quests.test.ts`): `caracol_ferrugem` no lv 10 e não no 9; `serpente_correia`
  25/24; `salamandra_cadinho` 40/39; `cavaleiro_aco_fundido` 60/59; `rex_ferro` 80/79; `forjador_rubro` 100/99;
- atalho: portal (46,384) `minLevel 10` → (11,593); portal (8,591) → (46,385);
- os 17 NPCs nos tiles de §1.4; `daynight`: Estação/Sala/Aciaria `lit`, Coração do Forno `dark`.

**B — `monsters.test.ts` e `items.test.ts`**
- tabela travada dos 16 monstros (id, level, vida, XP, chefe, trecho do sprite) e dos danos finais;
- `by("fire")` da lista travada ganha `coracao_brasa`, `forjador_rubro`, `fornalha_primordial`, `golem_convertedor`,
  `gosma_aco_liquido`, `gosma_gusa`, `salamandra_cadinho` (lista ordenada: `coracao_brasa, demodras, demon, dragon,
  dragon_lord, flame_skull, flame_spirit, forjador_rubro, fornalha_primordial, golem_convertedor, gosma_aco_liquido,
  gosma_gusa, hellhound, iluminador_rebelde, lair_flame, magma_elemental, minotaur_mage, orshabaal, salamandra_cadinho,
  slag_slime`);
- chefes da Siderúrgica: prova a 100%, invocam ajudante, respawn 2–4 h, xp/vida, dano máximo e ouro/vida entre os chefes
  vizinhos ±10% (mesma regra dos covis); o teste dos covis continua passando;
- `coracao_brasa`: `heal_allies` primeiro;
- items: os 11 materiais com valor da tabela, `gem_red` empilha 50, provas com `kind: "quest"`, valor 0 e descrição sem
  "abre"; comida com level e regen da tabela; **cada peça nova abaixo do valor do melhor item do slot no level dela para
  toda vocação** (calculado, não travado à mão, excluindo as próprias peças da Siderúrgica);
- tier 8: novo conjunto `REGION_FINAL_BOSSES = new Set(["fornalha_primordial", "mt_prototipo"])` (nome combinado com a
  Montadora; o `mt_prototipo` só existe no ciclo 20, o teste não exige que ele exista) com faixa **5–8%**
  (`[0.05, 0.08]`) por peça; a Fornalha dá `abyss_armor`, `abyss_archer_armor`, `abyss_mage_armor` e `abyss_shield` a 6%
  (o Protótipo dará elmos e grimório). Os chefes de `BOSSES` seguem 10–12% e os comuns 0,15–0,3%;
- ouro por faixa e "loot referencia itens existentes" (genéricos) continuam verdes.

**C — `quests.test.ts`, `npcs.test.ts`, `events.test.ts` (+ servidor sem mudança)**
- as 15 missões em ordem, com giver e minLevel; minLevels cobrem 10…112 sem buraco > 15; `hora_extra`,
  `golem_convertedor` e `fornalha_primordial` com passo `boss`; todo alvo de `kill`/`boss` caçável no `minLevel` (usa
  `huntable`); `fornalha_primordial` desbloqueia `title:coracao_de_aco`;
- `pluralPt("Caracol de Ferrugem") === "Caracóis de Ferrugem"`, `pluralPt("Rex de Ferro") === "Rexes de Ferro"`;
- npcs: `chefe_estacao_vila` e `chefe_estacao_malha` levam à Estação do Minério por 250/200; todo NPC de viagem da região
  tem destino `village`; a chegada (24,594) cai na zona PZ "Estação do Minério";
- events: §4.4;
- `server/src/systems/quests.test.ts` (XP 0,3–2,5 levels, NPCs/itens/monstros existentes), `achievements.test.ts` e
  `questUnlocks.test.ts` passam sem mudança (conferido: as listas de "em breve" e "liberadas" dos testes não mudam).

### 7.3 E2E — `e2e/siderurgica.spec.ts` (frente A escreve; roda na integração)

Molde: `e2e/malha.spec.ts` (viagem, portal com reclique, login dentro) e `e2e/caves.spec.ts` (porta de level).
Coordenadas globais.

1. **Trem da Vila**: lv 30, `/gold 500`; `chefe_estacao_vila` → "Estação do Minério" custa 250; chega a ≤ 2 de (24,594);
   faixa "Estação do Minério"; volta com `chefe_estacao_minerio` → Vila (97,98), ouro 0.
2. **Trem da Malha**: teleporta para (60,374), `chefe_estacao_malha` → Estação do Minério por 200.
3. **Atalho oculto**: lv 9 ao lado de (46,384) → reclica e continua na Malha; `/level 10` → chega a ≤ 1 de (11,593); pisa
   em (8,591) → volta a ≤ 1 de (46,385).
4. **Login dentro**: na Estação do Minério, recarrega a aba e volta lá (o atalho deixa a região alcançável do spawn).
5. **Porta de nível e saída sem level**: lv 24 em (98,605) → (99,604) não passa; lv 25 passa e chega em (102,604);
   `/level 20` → a saída (101,605) devolve em (98,605).
6. **Monstro do setor**: lv 60 perto de (128,606) vê `serpente_correia`; rodapé do minimapa "Correias e Coqueria".
7. **Posto avançado**: teleporta para (15,634); a Supervisora abre as abas "Viagem" (3 destinos) e "Depot".
8. **Evento** (com `E2E_ADMINS`): `/evento sangria_do_alto_forno` → `golem_convertedor` aparece perto de (80,638).
9. Capturas com `E2E_SNAPS=1`: `siderurgica-estacao`, `-patio`, `-correias`, `-alto-forno`, `-aciaria`, `-laminacao`,
   `-coracao` (teleporte + `waitSettled`), olhadas antes do deploy.

### 7.4 Carga e memória (risco maior: +29% de células no cliente)

- **Cliente** (Chromium do Playwright, servidor E2E): na `main` (400×560) e no branch (400×722), 3 vezes cada, mediana
  de: tempo de `goto` até `waitInWorld`; `performance.memory.usedJSHeapSize` 10 s depois de entrar no mundo, no templo e
  depois de teleportar para (64,692). Registrar no `docs/TEST_PLAN.md`. Limite para seguir sem mexer no cliente: heap
  ≤ +35% e tempo ≤ +30%. Se passar: antes da Montadora, `scene.make.tilemap({ key, insertNull: true })` em
  `client/src/game/worldMap.ts` e montar o tilemap do Phaser a partir de uma cópia rasa do JSON **sem** a camada
  `collision` (o `CollisionGrid` e o minimapa continuam lendo o JSON completo).
- `worldIndex.test.ts` exige montar o índice em < 1.500 ms: conferir o tempo impresso (`[worldIndex] 400×722 em … ms`).
- **Servidor**: `E2E_PORT=2872 E2E_SKIP_BUILD=1 E2E_ADMINS="$(node tools/loadtest.mjs --print-admins 10)" node
  e2e/start-server.mjs` e `node tools/loadtest.mjs http://127.0.0.1:2872 --bots 10 --secs 300 --tp 128,606 --level 35
  --auto --max-tick 25`, depois `--tp 64,692 --level 110`; olhar `[tick] … máx` no log (nada pesado rodando junto).
- `world.json`: anotar o tamanho com gzip (plano: ~96 → ~115 KB).

### 7.5 Revisão de texto antes da PR

`git diff main -- packages tools e2e | grep -inE "^\+.*(c[âa]mera|sensor|\bclp\b|\biot\b)"` vazio, e leitura dos textos
novos atrás de nome de empresa, marca, fabricante, lugar real, projeto ou pessoa real (só papéis e personagens).

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Memória e tempo de carga do cliente (+29% de células) | §7.4, com mitigação pronta antes do ciclo 20 |
| Id antigo do atlas mudar (alocação fora de ordem) | fábricas adiadas + `diff-atlas` + `diff-world` |
| Vazamento de monstro entre setores ou bolsão inalcançável | vedação por BFS sem portais e alcance total com NPCs obstáculo (§7.1) |
| Percentual explorado de todos cai | aviso nas Novidades no fechamento |
| Sprite de pasta com espaço ("Grey Trex") não carregar | teste de disco + passo 6/9 do E2E com o monstro visível; se falhar, gerar cópia `assets/monsters/IronRex.png` pelo `recolor.mjs` |
| Chefes novos mexerem nos testes dos covis | já conferido (§3.1); o teste continua passando sem mudar meta |
