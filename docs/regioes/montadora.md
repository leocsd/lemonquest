# Montadora — especificação executável (ciclo 20)

Região grande, para todos os levels (setores de lv 10 a 120), no fim do mapa, abaixo da Siderúrgica (ciclo 19).
Tema **só fantasia**: as máquinas da linha criaram vontade própria e tudo o que sai da linha sai amarelo-limão. Nenhuma
marca, montadora, fabricante, modelo de carro, lugar real, empresa, cliente, projeto ou código; nada de "câmera",
"sensor", "CLP" ou "IoT" (ver §15).

Fontes: `docs/PLANO_CICLOS_14-20.md` (seção "Ciclos 19–20"), `CLAUDE.md` (regras do mapa) e `docs/regioes/siderurgica.md`
(contrato com o ciclo 19, §1). Este documento é o contrato entre as três frentes (§12): ids, coordenadas e números daqui
valem; mudou algo, mude aqui primeiro.

Convenção de coordenadas: bloco 180×140 com origem em **(216,746)**. Local `(lx, ly)` → global `(216+lx, 746+ly)`.
Nas tabelas vai sempre `local → global`. Retângulos são inclusivos.

---

## 0. Decisões e correções em relação ao plano

| Tema | Plano | Aqui | Por quê |
|---|---|---|---|
| Bloco | 180×140 em y 746..885, mapa 400×888 | igual; x **216..395** | A faixa da Siderúrgica é x 4..183 (ciclo 19); a Montadora fica no lado leste, deixando x 0..215 vazio nas linhas novas. Margem de 4 colunas à direita, como a Siderúrgica tem à esquerda. |
| Portaria (chegada da cegonha) | (232,592) | **(232,758)** | (232,592) é de uma versão antiga do plano em que a Montadora ficava ao lado da Siderúrgica, no bloco (216,580): local (16,12). Com a faixa própria em y 746, o mesmo ponto local vira (216+16, 746+12) = (232,758). |
| Chegada do atalho | (218,591) | **(222,774)** | Mesma translação daria (218,757), na borda de 3 tiles do bloco (lx 2 é muro). A chegada foi para o "portão de serviço" da Portaria, local (6,28). |
| Gosma Azul | listada como monstro do Pátio | reuso de `runaway_drum` | `runaway_drum` já se chama "Gosma Azul" (lv 10). Os "12 monstros novos" do plano são os outros 12 nomes. |
| Sala dos Protótipos 110–120 | só o chefe | chefe + spawns de 112–120 na Galeria | A faixa da zona sai dos spawns (índice do mundo); sem comuns a sala não teria faixa nem caça. Reuso de `abyss_tengu` (112) e `abyss_samurai` (120) do Abismo Profundo. |
| Monstro da Estufa | — | recolor `MtPaintBlob` de `Boss/GiantSlime2` | O `Boss/GiantBamboo2` é a Fornalha Primordial da Siderúrgica. |
| Tier 8 no Protótipo | 5–8% | 0,06 por peça, 4 peças | O teste de items hoje aceita 10–12% para chefe: cria-se a faixa 0,05–0,08 para os dois chefes finais de região (§4.5, combinado com o ciclo 19). |
| Títulos | "o Lava-Rápido", "Piloto de Testes" | conquista do Sapão → `lava_rapido`; missão "O Protótipo" → `piloto_testes` | Mesmo padrão de Orshabaal (título pela missão, conquista do chefe com pontos). |

---

## 1. Contrato com a Siderúrgica (ciclo 19)

Conferido contra `docs/regioes/siderurgica.md` publicado (§0, §1.1, §1.4, §3, §4.2–4.5, §5, §6.2, §7). Nada aqui
está "a confirmar"; em conflito futuro, vale o que estiver lá e este documento é corrigido.

1. **Mapa**: a Siderúrgica entrega o mapa **400×722** (`NEW_H6 = 722`, `BLOCK6 = { x0: 4, y0: 580, w: 180, h: 140 }`),
   último tile andável em **y 716** (paredes/borda até 719, vazio 720–721), nada andável fora de x 7–180 e a faixa
   x 184–399 × y 560–721 vazia para sempre. A Montadora entra em y 746: **29 linhas** sem nada andável (717–745; mínimo
   26). Checagem no `expand7`: `Y7 - 1 - últimaLinhaAndável(mapa antigo) >= 26`.
2. **Ordem no `generate.mjs`**: `const { map: world6 } = expand6({ old: world5, ts, S, L: LEMON, spawnTile: SPAWN })`
   vem depois de `lateObjects18`; `expand7` entra depois dele (`old: world6`) e a seção OUTPUT passa de `world6` para
   `world7`.
3. **Arte**: as assinaturas de `I = L.industry()` são contrato (`siderurgica.md` §5.2); a Montadora chama `L.industry()`
   de novo (objeto memorizado, nada se realoca; chaves `ind_` no atlas; fora do `L.S` de propósito) e usa:
   `I.asphalt(v)` (v 0–3, speed 85 `road`), `I.asphaltLine(dir 'h'|'v')`, `I.checker(v)` (v 0–3, speed 90 `floor`),
   `I.concrete(v)` (v 0–3), `I.stripe(dir 'h'|'v', part 'mid'|'end'|'corner')`,
   `I.belt(dir 'e'|'w'|'n'|'s', part 'start'|'mid'|'end')` (speed 70), `I.pipe(part)` (`'h' 'v' 'ne' 'nw' 'se' 'sw'
   't_n' 't_s' 't_e' 't_w' 'cross' 'cap_n' 'cap_s' 'cap_e' 'cap_w'`), `I.metalWall(part)` (`'nw' 'n' 'ne' 'w' 'c' 'e'
   'sw' 's' 'se' 'in_nw' 'in_ne' 'in_sw' 'in_se' 'pillar'`), `I.slidingDoor(dir 'h' 2×1 | 'v' 1×2)` (devolve linhas de
   gids), `I.chainFence(part 'h'|'v'|'post'|'corner')` e `I.concreteWall(part 'h'|'v'|'end'|'corner')`. Cada uma
   devolve um gid.
   De `T = L.steel()` só a bobina, `T.coil()` (contrato registrado no `siderurgica.md` §5.2: sem parâmetro, devolve o
   gid da bobina 1×1; `L.steel()` é memorizado, chamar no `expand7` não realoca), na carroceria do Caminhão de Bobinas.
   Tudo o que é novo sai de `L.factory()` (§11), com chaves `fab_` / `contentKey('fab', cv)`. Prova de atlas com o
   `diff-atlas.mjs` do ciclo 19.
4. **Caminhão de Bobinas**: `mt_bobinas` na Portaria (§2.5) e `mt_bobinas_sid` no tile reservado da Estação do Minério,
   **(30,605)** (local da Siderúrgica (26,25); vizinhos livres, na PZ, a ≥ 7 de outro NPC). Destino na Siderúrgica:
   `MINERIO_ARRIVAL` (constante do ciclo 19 em `npcs.ts`), a chegada do trem **(24,594)**.
5. **Prefixos**: a Siderúrgica usa ids **sem prefixo** (padrão da Malha e das caves); a Montadora usa `mt_` em tudo o que
   é novo (monstros, itens, missões, NPCs, baús `mt_crash_*`, conquistas `mt_*`), alavanca `crash_test`, evento
   `teste_de_pista`; recolors `assets/monsters/Mt*.png` (os de lá: `GusaSlime`, `SteelSlime`, `SlagGolem`,
   `ConverterGolem`). Não há colisão.
6. **Sprites**: nenhum sprite de monstro se repete. O Monstro da Estufa deixou o `Boss/GiantBamboo2` (é a Fornalha
   Primordial de lá) e virou o recolor `MtPaintBlob` de `Boss/GiantSlime2` (§3.5). Os NPCs da Montadora evitam os 12
   sprites de NPC da Siderúrgica (§7.1); placas usam o `Inspector`, como as de lá e os quadros do jogo.
7. **Testes travados que as duas mexem**: cada ciclo só acrescenta os próprios ids (listas de fogo/gelo/morto-vivo do
   `monsters.test.ts`, chefes de evento e eventos de dia útil a partir das 13h do `events.test.ts`,
   `REGION_FINAL_BOSSES`). A curva xp/vida, o ouro por faixa e a regra dos chefes vizinhos foram conferidos com os dois
   documentos somados (§3.2).
8. **Tier 8 dos chefes finais**: `REGION_FINAL_BOSSES = new Set(["fornalha_primordial", "mt_prototipo"])` no
   `items.test.ts` (criado no ciclo 19), faixa 0,05–0,08 por peça. A Fornalha dá `abyss_armor`, `abyss_archer_armor`,
   `abyss_mage_armor` e `abyss_shield`; o Protótipo, os três elmos e o `spellbook_abyss` (§4.5).
9. **Ficaram para o ciclo 20** (`siderurgica.md` §0): a faixa lv 114 do Quadro, com `gosma_aco_liquido` (caçável no
   lv 100 pela escotilha D6, sem missão) (§10), e **Rubi (`gem_red`), Aço Líquido (`frasco_aco_liquido`) e Cromo
   (`mt_cromo`) como custo de refino e encantamento** (§4.6).
10. **Comida**: a Cantineira vende `limonada_turno` (lv 10) e `prato_feito` (lv 25), criadas no ciclo 19 (§7.3).

---

## 2. Geometria

### 2.1 Bloco e etapa do gerador

- Arquivo novo `tools/mapgen/expansion7.mjs`, no molde de `expansion4.mjs` (bloco de superfície com setores) mais
  `expansion5.mjs` (área inferior escavada, estilo masmorra escura):
  `export const NEW_H7 = 888; export const Y7 = 746; export const BLOCK7 = { x0: 216, y0: 746, w: 180, h: 140 };`
  `export function expand7({ old, ts, S, L, spawnTile, village, oficinaPatio, siderurgica })` →
  `{ map, reach, portalMap }`. Semente própria `mulberry32(20261027)`; não mexe no gerador aleatório das etapas antigas.
- Copia o mapa antigo tile a tile, preenche as linhas novas com vazio sólido (`'O', 1, 1` + bloqueio), desenha o bloco,
  acrescenta os objetos **depois** de todos os antigos (ids estáveis), valida (§2.8) e devolve.
- Duas faixas verticais no bloco: **superfície** ly 0..99 (y 746..845) e **subsolo** ly 104..137 (y 850..883). Borda de
  3 tiles na superfície (lx 0..2, lx 177..179, ly 0..2, ly 97..99): muro externo (parede metálica + cerca), bloqueado.
  Linhas ly 100..103 e tudo fora das salas escavadas do subsolo: vazio.

### 2.2 Setores (zonas)

Cada setor de caça é fechado por parede (galpão) ou muro; só portais ligam setores de faixa diferente. A zona menor
vence (como no resto do mapa), então "Lava-Jato", "Estufa" e "Sala de Descanso" ficam dentro de setores maiores.
A faixa de level que o índice do mundo mostra sai dos spawns ("comuns" na tabela); a prop `faixa` é a faixa do setor
no plano e precisa conter a dos comuns (mesma regra do `siderurgica.test.ts`).

| Zona | Local (lx × ly) | Global (x × y) | Comuns | prop `faixa` | PZ | Música | Luz (`daynight.ts`) |
|---|---|---|---|---|---|---|---|
| Montadora (região inteira, fundo) | 0..179 × 0..139 | 216..395 × 746..885 | — | — | não | `31 - Sunny.ogg` | outdoor |
| Portaria da Montadora | 3..30 × 3..32 | 219..246 × 749..778 | — | — | **sim** | `33 - Calm Village.ogg` | town |
| Pátio de Carros (2 retângulos) | 32..103 × 3..45 e 3..31 × 34..45 | 248..319 × 749..791 e 219..247 × 780..791 | 12–16 | `10-25` | não | `20 - Good Time.ogg` | outdoor |
| Lava-Jato | 80..103 × 26..45 | 296..319 × 772..791 | 10 (+ chefe 26) | `10-25` | não | `18 - Aquatic.ogg` | lit |
| Estamparia | 104..176 × 3..45 | 320..392 × 749..791 | 30–36 | `25-40` | não | `3 - Revelation.ogg` | lit |
| Funilaria e Armação | 3..84 × 46..72 | 219..300 × 792..818 | 42–52 | `40-60` | não | `38 - Intro.ogg` | lit |
| Cabines de Pintura | 85..176 × 46..72 | 301..392 × 792..818 | 64–70 | `60-80` | não | `13 - Mystical.ogg` | lit |
| Estufa | 150..176 × 56..72 | 366..392 × 802..818 | chefe 74 | `60-80` | não | `37 - Dark Forest.ogg` | lit |
| Montagem Final | 3..100 × 73..96 | 219..316 × 819..842 | 84–92 | `80-100` | não | `32 - Manor.ogg` | lit |
| Sala de Descanso | 4..19 × 74..84 | 220..235 × 820..830 | — | — | **sim** | `9 - Quiet.ogg` | lit |
| Pista de Testes | 101..176 × 73..96 | 317..392 × 819..842 | 92–108 | `90-110` | não | `35 - Adventure.ogg` | outdoor |
| Sala dos Protótipos | 60..176 × 104..137 | 276..392 × 850..883 | 112–120 | `110-120` | não | `25 - End Theme 2.ogg` | dark |
| Pista do Crash Test (sala da alavanca) | 4..44 × 106..118 | 220..260 × 852..864 | — | — | não | `19 - Ascension.ogg` | lit |
| Boxe dos Troféus (baús) | 50..58 × 108..116 | 266..274 × 854..862 | — | — | não | `5 - Peaceful.ogg` | lit |

Props de toda zona: `music`, `pz` (true/false), `faixa` (texto ASCII, só nos setores de caça) e `regiao: "Montadora"`
(o ciclo 19 grava as mesmas, com `"Siderúrgica"`). Nenhuma música repete as da Siderúrgica. Os modos de luz entram em
`ZONE_MODES` de `packages/shared/src/daynight.ts` (os "outdoor" não precisam de linha).

Planta da superfície (local; cada caractere ≈ 6×6 tiles):

```
ly  0 ##############################
    #PPPPP|ppppppppppppp|EEEEEEEEEEE#   P Portaria (PZ)      p Pátio de Carros   E Estamparia (galpão)
    #PPPPP=ppppppppppppp>EEEEEEEEEEE#   = cancela aberta     > portas lv 25 (entra) e saída
    #PPPPP|pppppppppLLLL|EEEEEEEEEEE#   L Lava-Jato (chefe Sapão no fundo)
ly 33 #-----pppppppppLLLL|EEEEEEEEEEE#
    #ppppppvpppppppLLLL|EEEEEEEEEEE#   v portas lv 40 (entra) e saída, parede norte da Funilaria
ly 46 #FFFFFFFFFFFFFF>CCCCCCCCCKKKKK#   F Funilaria e Armação    > portas lv 60 / saída    C Cabines   K Estufa
    #FFFFFFFFFFFFFF|CCCvCCCCCKKKKK#   v portas lv 80 / saída (parede sul das Cabines)
ly 73 #DDMMMMMMMMMMMMMM>TTTTTTTTTTTT#   D Sala de Descanso (PZ)   M Montagem Final   > portas lv 90 / saída   T Pista
    #DDMMMMMMMMMMMMMM|TTT(oval)TTR#   R rampa do subsolo (porta lv 110)
ly 97 ##############################
```

### 2.3 Portas de nível

Padrão `quest_door` dos ciclos 11–13: a porta é um objeto `portal` com `minLevel` num tile de passagem da parede (limiar
`I.stripe` com as folhas abertas do `I.slidingDoor` nas paredes ao lado, §11), levando 3–4 tiles para dentro; ao lado,
na mesma parede, uma **saída sem nível** leva de volta. (A Siderúrgica põe os portais no chão, encostados num portão
bloqueado; aqui o portal é o próprio vão da parede, como as portas da Cidadela em `expansion2.mjs`. As duas formas valem
para o servidor; a regra "porta com level + saída sem level na mesma parede" é a mesma.)
Quem perde level dentro nunca fica preso. Monstro nunca pisa em portal, então não vaza de setor. Cada porta ganha uma
luz (`radius 4, '#ffe066', flicker false`) no tile de dentro e uma placa-NPC do lado de quem chega (§7.2).

| Porta | Portal (local → global) | Destino (local → global) | `minLevel` | Saída sem nível (local → global) | Volta para (local → global) |
|---|---|---|---|---|---|
| Pátio → Estamparia (parede oeste do galpão) | 104,20 → **320,766** | 107,20 → 323,766 | **25** | 104,23 → **320,769** | 102,23 → 318,769 |
| Pátio → Funilaria (parede norte) | 40,46 → **256,792** | 40,49 → 256,795 | **40** | 44,46 → **260,792** | 44,44 → 260,790 |
| Funilaria → Cabines (paredes leste/oeste) | 84,58 → **300,804** | 88,58 → 304,804 | **60** | 85,62 → **301,808** | 82,62 → 298,808 |
| Cabines → Montagem (paredes sul/norte) | 95,72 → **311,818** | 95,76 → 311,822 | **80** | 90,73 → **306,819** | 90,70 → 306,816 |
| Montagem → Pista (parede leste) | 100,84 → **316,830** | 104,84 → 320,830 | **90** | 100,92 → **316,838** | 98,92 → 314,838 |
| Pista → Sala dos Protótipos (rampa) | 171,94 → **387,840** | 160,109 → 376,855 | **110** | 160,106 → **376,852** | 169,94 → 385,840 |

Sem porta: Portaria ↔ Pátio (cancela aberta na cerca lx 31, ly 14..18 → x 247, y 760..764) e as passagens internas
(frente aberta do Lava-Jato lx 80, ly 33..37; vão da Estufa lx 150, ly 63..65; vão da Sala de Descanso lx 20,
ly 78..79; corredores do subsolo). `minLevel` cresce ao longo da cadeia: 25 < 40 < 60 < 80 < 90 < 110.

Paredes duplas entre galpões vizinhos (Lava-Jato lx 103 | Estamparia lx 104; Funilaria lx 84 | Cabines lx 85;
Cabines ly 72 | Montagem ly 73): o portal fica na parede do lado de quem entra e a saída na do outro lado.

### 2.4 Acesso

| O quê | Onde (global) | Para onde (global) | Preço | Detalhe |
|---|---|---|---|---|
| Cegonha na Vila (`mt_cegonha_vila`, NPC novo) | **(91,100)**, praça da Vila (PZ) | Portaria **(232,758)** | 250 | Só o objeto NPC; nenhum tile da Vila muda. |
| Cocheiro Dito (`coach_oficina`, destino novo) | (86,328) | Portaria (232,758) | 200 | `travel` ganha `MONTADORA_ARRIVAL` com preço 200. |
| Motorista da Cegonha (`mt_motorista`) | Portaria (228,754) | Vila (97,98) 250 · Oficina (83,330) 150 | — | Volta. |
| Caminhão de Bobinas (`mt_bobinas`) | Portaria (240,754) | Estação do Minério (24,594) | 200 | `{ ...MINERIO_ARRIVAL, price: 200 }` (§1.4). |
| Caminhão de Bobinas (`mt_bobinas_sid`) | Estação do Minério (30,605), tile reservado pelo ciclo 19 | Portaria (232,758) | 200 | Objeto acrescentado pelo `expand7` no mapa da Siderúrgica (só o NPC; nenhum tile muda). |
| Supervisora de Linha (`mt_supervisora`, posto avançado) | Sala de Descanso (226,824) | Vila 250 · Portaria 100 | — | Só **saída**: nenhum NPC leva para dentro da Montagem (pularia a porta lv 80). Também é depósito. |
| Atalho oculto (portal, `minLevel 10`) | Oficina, Pátio de Encomendas **(83,332)** | Portaria, portão de serviço **(222,774)** | — | (83,332) é um recanto sem saída (só liga ao norte), andável, sem objeto, não é destino de portal. |
| Volta do atalho (portal sem nível) | Portaria **(219,776)** (recanto no canto sudoeste) | Oficina **(83,331)** | — | Retorno vizinho do portal da Oficina, como nas caves. |

Constante em `npcs.ts`: `const MONTADORA_ARRIVAL: TravelDest = { id: "montadora", label: "Portaria da Montadora", x: 232, y: 758, price: 250 };`
(a cegonha da Vila usa 250; o Dito e o Caminhão de Bobinas usam `{ ...MONTADORA_ARRIVAL, price: 200 }`). A chegada da
Siderúrgica é `MINERIO_ARRIVAL` (ciclo 19, trem, (24,594)). Viagem grátis até o lv 8 continua (`TRAVEL_FREE_LEVEL`).
Se o ciclo 19 tiver feito o opcional C7 (`TravelDest.minLevel`), a Supervisora pode ganhar depois uma volta "Sala de
Descanso, lv 80+"; sem C7, continua só saída (mesma regra da Sala de Controle de lá).

### 2.5 Pontos-chave (NPCs, chegadas, alavanca, baús)

Todos andáveis, alcançáveis, a 2+ tiles de outro NPC, fora de portal e de destino de portal. NPC vira obstáculo em
jogo: a validação bloqueia todos juntos e confere que nenhum tile do bloco fica isolado (como os `lateNpcs`).

| Id | Papel | Local → global | Setor |
|---|---|---|---|
| `mt_motorista` | cegonha (viagem de volta) | 12,8 → 228,754 | Portaria |
| `mt_bobinas` | Caminhão de Bobinas | 24,8 → 240,754 | Portaria |
| `mt_porteiro` | missão 1 | 27,13 → 243,759 | Portaria |
| `mt_cantineira` | loja | 7,18 → 223,764 | Portaria |
| `mt_depot` | depósito | 11,18 → 227,764 | Portaria |
| `mt_enfermeira` | bênção | 20,22 → 236,768 | Portaria |
| `mt_lavador` | missões 2–4 | 24,28 → 240,774 | Portaria |
| `mt_placa_patio` | placa | 29,20 → 245,766 | Portaria |
| `mt_placa_estamparia` | placa | 101,18 → 317,764 | Pátio |
| `mt_placa_funilaria` | placa | 37,43 → 253,789 | Pátio |
| `mt_prensista` | missões 5–6 | 110,26 → 326,772 | Estamparia |
| `mt_soldadora` | missões 7–8 | 36,50 → 252,796 | Funilaria |
| `mt_placa_pintura` | placa | 81,60 → 297,806 | Funilaria |
| `mt_pintor` | missões 9–10 | 90,55 → 306,801 | Cabines |
| `mt_placa_montagem` | placa | 98,69 → 314,815 | Cabines |
| `mt_supervisora` | missão 11, depósito, viagem | 10,78 → 226,824 | Sala de Descanso |
| `mt_placa_pista` | placa | 97,81 → 313,827 | Montagem |
| `mt_piloto` | missões 12–14 | 126,90 → 342,836 | Pista (gramado do miolo) |
| `mt_cegonha_vila` | cegonha (ida) | — → **91,100** | Vila de Pedra Clara |
| `mt_bobinas_sid` | Caminhão de Bobinas | — → **30,605** | Estação do Minério |

Chegadas: cegonha/Dito/Bobinas **(232,758)** (local 16,12); atalho **(222,774)** (local 6,28).

**Alavanca "Crash Test"** (objeto `quest_lever`, `leverId: "crash_test"`), no gramado do miolo da pista, em frente aos
boxes:

| Peça | Local | Global |
|---|---|---|
| Alavanca (tile bloqueado, arte de alavanca `['G', 3, 3]`) | 139,89 | **355,835** |
| Placas (`['G', 0, 1]`), da esquerda para a direita | 132,89 · 134,89 · 136,89 · 138,89 | 348,835 · 350,835 · 352,835 · 354,835 |
| Destinos (mesma ordem) | 8,108 · 8,110 · 8,112 · 8,114 | 224,854 · 224,856 · 224,858 · 224,860 |
| Sala (`room`) | 4,106 .. 44,118 | `"220,852,260,864"` |
| Posições dos monstros | 32,108 · 36,112 · 32,116 · 40,108 · 42,112 · 40,116 | 248,854 · 252,858 · 248,862 · 256,854 · 258,858 · 256,862 |
| Porta da sala para os troféus (portal) | 45,112 | **261,858** → 267,858 |
| Saída dos troféus (portal) | 54,107 | **270,853** → 346,838 (pista, ao lado dos boxes) |

**Baús** (tile desenhado com a arte do baú `['E', 3, 1]`, bloqueado, como os de `expansion2.mjs`), parede leste do Boxe
dos Troféus: `mt_crash_knight` (273,855), `mt_crash_paladin` (273,857), `mt_crash_sorcerer` (273,859),
`mt_crash_druid` (273,861). Ordem de cima para baixo: cavaleiro, paladino, feiticeiro, druida (a mesma da Aniquilação).

### 2.6 Spawns

`[monstro, count, radius, level, local → global]`. 43 spawns, **125 monstros** (plano: ~110). Mapa: 785 monstros hoje →
898 com a Siderúrgica (36 spawns) → **1.023** com a Montadora (248 → 284 → 327 spawns). O `level` do spawn é
informativo (o índice do mundo usa o `MonsterDef.level`).

| Setor | Spawns |
|---|---|
| Pátio de Carros | `mt_calota` 4 r4 lv12 45,10 → 261,756 · `mt_calota` 3 r4 62,22 → 278,768 · `mt_calota` 3 r3 14,42 → 230,788 · `mt_calota` 3 r4 88,10 → 304,756 · `mt_serpente_fiacao` 3 r4 lv16 50,30 → 266,776 · `mt_serpente_fiacao` 3 r4 72,12 → 288,758 · `mt_serpente_fiacao` 3 r4 66,38 → 282,784 |
| Lava-Jato | `runaway_drum` 4 r4 lv10 86,38 → 302,784 · `runaway_drum` 3 r3 86,30 → 302,776 · **`mt_sapao` 1 r2 lv26 97,36 → 313,782** (baia do fundo) |
| Estamparia | `mt_polvo_graxa` 4 r4 lv30 118,10 → 334,756 · `mt_polvo_graxa` 4 r4 140,36 → 356,782 · `mt_polvo_graxa` 3 r4 165,32 → 381,778 · `mt_estampador` 3 r4 lv36 130,20 → 346,766 · `mt_estampador` 3 r4 158,12 → 374,758 · `mt_estampador` 2 r3 150,28 → 366,774 |
| Funilaria e Armação | `mt_lagartixa_faisca` 5 r4 lv42 15,56 → 231,802 · `mt_lagartixa_faisca` 5 r4 60,64 → 276,810 · `mt_lagartixa_faisca` 3 r3 52,57 → 268,803 · `mt_robo_soldador` 3 r4 lv52 30,64 → 246,810 · `mt_robo_soldador` 3 r4 70,52 → 286,798 · `mt_robo_soldador` 2 r3 45,67 → 261,813 |
| Cabines de Pintura | `mt_mariposa_tinta` 4 r4 lv64 104,60 → 320,806 · `mt_mariposa_tinta` 4 r4 128,62 → 344,808 · `mt_mariposa_tinta` 3 r3 145,66 → 361,812 · `mt_robo_pintor` 2 r4 lv70 115,66 → 331,812 · `mt_robo_pintor` 2 r4 140,51 → 356,797 |
| Estufa | **`mt_monstro_estufa` 1 r2 lv74 164,64 → 380,810** |
| Montagem Final | `mt_robo_montador` 3 r4 lv84 35,80 → 251,826 · `mt_robo_montador` 3 r4 70,92 → 286,838 · `mt_robo_montador` 2 r3 30,92 → 246,838 · `mt_duble` 3 r4 lv92 55,80 → 271,826 · `mt_duble` 3 r4 80,90 → 296,836 |
| Pista de Testes | `mt_tengu_cromado` 3 r4 lv104 115,79 → 331,825 · `mt_tengu_cromado` 3 r4 163,79 → 379,825 · `mt_piloto_fantasma` 3 r4 lv108 140,77 → 356,823 · `mt_piloto_fantasma` 3 r4 117,92 → 333,838 · `mt_duble` 2 r3 lv92 155,93 → 371,839 |
| Sala dos Protótipos (Galeria) | `abyss_tengu` 3 r4 lv112 150,125 → 366,871 · `abyss_samurai` 2 r4 lv120 132,124 → 348,870 · `abyss_tengu` 3 r4 114,122 → 330,868 · `abyss_samurai` 2 r3 120,128 → 336,874 (reuso do Abismo Profundo, os "protótipos rubros": a faixa dos comuns fica 112–120, dentro da `faixa` 110–120; Tengu Cromado e Piloto Fantasma ficam só na Pista) |
| Sala dos Protótipos (Salão) | **`mt_prototipo` 1 r3 lv120 78,123 → 294,869** |

Conferido por script (`mt-geo.mjs`, ver §13): spawn a ≥ raio+6 de PZ, ≥ 8 de NPC, ≥ 7+raio de portal/destino/chegada,
≥ 10 da alavanca e das placas, outros spawns a ≥ 11 de chefe, centro e raio dentro do retângulo do setor.

### 2.7 Desenho por setor (o que a frente A desenha)

Regra geral (como `expansion4.mjs`): um conjunto `keep` com NPCs, chegadas, portais, destinos, spawns, placas, alavanca
e baús; nenhuma peça cobre esses tiles (falha alta). Enfeite grande só onde `scatterOK` deixa (2 tiles de folga dos
`keep`, fora de corredor de porta). Cada spawn mantém ≥ `count × 3` tiles livres no raio. Tile andável que o desenho
isolar vira obstáculo (bolsão fechado), com contagem no log. Caminho de 3+ tiles de largura entre cada porta e o centro
do setor.

- **Portaria (PZ)**: piso de concreto/calçada com faixa de pedestre, asfalto na frente dos caminhões. Cegonha estacionada
  lx 4..11 × ly 4..6 (arte 8×3) carregando carros amarelo-limão; Caminhão de Bobinas lx 16..23 × ly 4..6; guarita
  lx 25..28 × ly 9..11 com cancela (aberta) na cerca lx 31, ly 13 e ly 19, vão ly 14..18; cantina lx 4..9 × ly 13..16
  (casa pequena, porta para o sul); guarda-volumes lx 10..12 × ly 14..16; ambulatório lx 17..22 × ly 17..20; muro sul
  ly 33 (lx 3..31); portão de serviço no canto sudoeste (portal em 3,30, chegada em 6,28) com uma luz fraca; limoeiros
  em canteiros (árvores do pack com folha verde), bancos, postes (`S.lamp`).
- **Pátio de Carros**: asfalto com vagas pintadas (linhas brancas e zebrado nos cantos); fileiras de carros vistos de cima
  (2×3, bloqueados), a maioria amarelo-limão e alguns nas outras 4 cores; calotas soltas no chão (decalque), cones,
  pallets. A faixa sul (lx 3..31 × ly 34..45) é o estacionamento dos funcionários. Lava-Jato: galpão lx 80..103 ×
  ly 26..45 com frente aberta a oeste (ly 33..37), piso molhado com ralos, rolos de lavagem (pares 1×2), poças de espuma;
  divisória em lx 91 (vão ly 34..36) separa a baia do fundo (lx 92..102 × ly 27..44), o covil do Sapão, com uma "piscina"
  de espuma desenhada (decalque andável) e luz azul (`'#7fd4ff'`).
- **Estamparia (galpão)**: chapa xadrez, paredes metálicas; 2 fileiras de prensas (3×3, bloqueadas) nas paredes norte
  (ly 4..6) e sul (ly 41..43), esteiras andáveis em ly 14..15 e ly 30..31 (lx 110..172), pilhas de chapa, pallets.
  Luz branca fria a cada ~12 tiles.
- **Funilaria e Armação (galpão)**: chapa xadrez com faixas zebradas nos corredores; gabaritos com carrocerias em primer
  (2×3) em 3 linhas, braços robóticos (2×2) entre elas, faíscas (luz laranja com `flicker: true`) junto dos braços.
- **Cabines de Pintura (galpão)**: 5 cabines fechadas de 7×6 na parede norte (lx 90..96, 99..105, 108..114, 117..123,
  126..132; ly 47..52, parede sul em ly 53 com vão de 2 no meio), respingos de tinta nas 5 cores no chão, latas
  empilhadas. Estufa (lx 150..176 × ly 56..72): parede em lx 150 e ly 56, vão em lx 150, ly 63..65; piso de grelha
  quente, portas de forno na parede leste, luz laranja-avermelhada forte (`'#ff7a3c'`, raio 6).
- **Montagem Final (galpão)**: linha de montagem (esteira andável) em ly 88..89 de lx 22 a 96, com carros em montagem
  (3×2, bloqueados) a cada ~6 tiles e travessias livres em lx 40..41, 60..61, 80..81; braços robóticos nas duas margens
  da linha; Sala de Descanso (PZ, lx 4..19 × ly 74..84, parede em lx 20 e ly 85, vão em lx 20, ly 78..79): armários
  (`['E', 2, 7]` 1×2), bancos, máquina de café, relógio de ponto, mesa.
- **Pista de Testes (ao ar livre)**: oval de asfalto com centro local (139,85) (global 355,831): elipse externa raios
  (35, 11), interna (27, 6); zebrado vermelho/branco nas duas bordas (desenhado por pixel ao longo da elipse, chave por
  conteúdo como os trilhos da Malha); linha de chegada xadrez na reta sul em lx 139 (ly 92..96); semáforo de largada;
  pneus empilhados e cones nos quatro cantos fora do oval; miolo de grama com os **boxes** (prédio lx 130..146 × ly 81..86,
  bloqueado) e a alavanca/placas na frente (§2.5); prédio da rampa do subsolo lx 170..174 × ly 91..93, com o portal na
  boca (171,94).
- **Subsolo** (estilo `dark` do `expansion5.mjs`: piso `['I', 20..21, 14..15]`, paredes `R` com as linhas certas):
  rampa lx 152..168 × ly 107..114 (chanfro 1; porta de saída na parede norte em 160,106, chegada 160,109);
  corredor lx 159..161 × ly 115..117; Galeria dos Protótipos lx 100..170 × ly 118..131 (chanfro 2) com protótipos
  cobertos por lona (2×3, bloqueados) servindo de pilares; corredor lx 96..99 × ly 123..125; Salão do Protótipo
  lx 62..95 × ly 110..135 (chanfro 3) com plataforma giratória desenhada no centro e holofotes amarelo-limão
  (`'#f2e14a'`, raio 6) nos cantos. Pista do Crash Test lx 4..44 × ly 106..118 (sem chanfro), chapa xadrez, zebrado,
  parede de impacto no lado leste; porta para o Boxe dos Troféus em 45,112 (tile da parede escavado como passagem);
  Boxe dos Troféus lx 50..57 × ly 108..116 (parede em lx 58), saída na parede norte em 54,107.
- **Luzes**: postes na Portaria e no Pátio (`'#ffc060'`, raio 5), lâmpadas frias nos galpões (`'#e8f4ff'`, raio 6,
  sem flicker), faíscas na Funilaria, holofotes na pista (`'#fff2c0'`, raio 6) e no subsolo como acima. Ordem dos
  objetos novos: NPCs, portais, zonas, spawns, alavanca, baús, luzes (todos depois dos antigos).

### 2.8 Validações no `expand7` (falha alta, como as etapas antigas)

1. `Y7 - 1 - últimaLinhaAndável(antigo) >= 26` (com a Siderúrgica: 746 − 1 − 716 = 29); o mapa antigo copiado sem
   mudança (o `diff-world.mjs` confirma depois) e os tiles antigos do atlas idênticos (`diff-atlas.mjs` do ciclo 19).
2. Nenhum tile andável nas linhas novas fora do bloco; nenhuma parede/piso do bloco encosta nas linhas < 746.
3. Tudo o que é andável no bloco é alcançável a partir do spawn do jogo (BFS com portais, a mesma do servidor para aceitar
   login dentro), **exceto** a Pista do Crash Test e o Boxe dos Troféus, que **não** podem ser alcançáveis a pé (como a
   Aniquilação em `expansion2.mjs`) e precisam ser alcançáveis a partir dos destinos da alavanca.
4. NPCs: andáveis, a 2+ um do outro, fora de portal/destino; bloqueados juntos, o alcançável perde exatamente os
   próprios tiles. `mt_cegonha_vila` (91,100) e `mt_bobinas_sid` (30,605): andáveis no mapa antigo, sem objeto em cima,
   dentro de uma PZ (Vila / Estação do Minério), a 2+ de NPC, a 8+ de spawn, fora do tile de nascimento, e não fecham
   bolsão (mesmo teste dos `lateObjects18`).
5. Chegadas (232,758) e (222,774): andáveis, não são portal, a 2+ de NPC, dentro da PZ da Portaria.
6. Portal da Oficina (83,332): andável no mapa antigo, sem objeto, não é destino de portal antigo; volta (83,331)
   vizinha, andável, não é portal.
7. Portas: portal e destino andáveis, destino não é portal; cada porta com `minLevel` tem uma saída sem nível a ≤ 6 tiles;
   os `minLevel` seguem 25, 40, 60, 80, 90, 110.
8. Spawns: as regras da §2.6 (as mesmas do `expansion4.mjs`) e o **level do monstro dentro da faixa do setor**
   (tabela `SECTOR_BAND` no próprio arquivo; reusos e chefes conferidos à parte). BFS **sem portais** a partir de cada
   spawn fica dentro do retângulo do setor (monstro não vaza).
9. Alavanca: placas andáveis e alcançáveis, fora da sala; alavanca bloqueada e a ≤ 1 de uma placa; destinos e posições
   dos monstros dentro da sala, andáveis; cada baú bloqueado com um vizinho andável alcançável a partir da chegada do
   Boxe dos Troféus.
10. Log final: `expansion7: 400x888, bloco 180x140 em 216,746, N npcs, N portais, 43 spawns (121 monstros), N luzes,
    N tiles Lemon; A/B tiles andáveis alcançáveis (N bolsões fechados)`.

---

## 3. Monstros (12 novos + 3 chefes)

Valores no **código-fonte** (`packages/shared/src/data/monsters.ts`): o dano e o `respawnMs` são os **base**; o laço do
fim do arquivo aplica o multiplicador por level (×1,4 no 20+, ×1,5 no 40+, ×1,6 no 70+, ×1,7 no 100+, nas habilidades
também) e o ×0,7 do respawn dos comuns. A coluna "efetivo" é o que o teste e o jogo veem.

### 3.1 Tabela

| Id | Nome | Lv | HP | XP | Dano base → efetivo | Tipo | Arm. | atk ms / alc. | passo ms | aggro | respawn base | Ouro | Sprite |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `mt_calota` | Calota Rolante | 12 | 130 | 58 | 9–20 | physical | 5 | 1900 / 1 | 240 | 4 | 45_000 | 14–32 | `grid4(M+"Larva2/Larva2.png", { tint: 0xe2e8ee })` |
| `mt_serpente_fiacao` | Serpente de Fiação | 16 | 170 | 96 | 12–26 | energy | 3 | 2000 / 1 | 320 | 4 | 50_000 | 20–44 | `grid4(M+"Snake/Snake.png")` |
| `mt_polvo_graxa` | Polvo de Graxa | 30 | 390 | 350 | 24–48 → 34–67 | earth | 7 | 2000 / 3 | 400 | 5 | 60_000 | 80–160 | `grid4(M+"Octopus2/SpriteSheet.png", { tint: 0x5a5a68 })` |
| `mt_estampador` | Estampador Vermelho | 36 | 540 | 590 | 31–63 → 43–88 | physical | 13 | 2200 / 1 | 420 | 4 | 70_000 | 110–230 | `grid4(M+"KappaRed/SpriteSheet.png", { scale: 1.15 })` |
| `mt_lagartixa_faisca` | Lagartixa de Faísca | 42 | 620 | 800 | 38–76 → 57–114 | energy | 9 | 1700 / 1 | 260 | 5 | 70_000 | 100–200 | `grid4("monsters/MtSparkLizard.png")` |
| `mt_robo_soldador` | Robô Soldador | 52 | 1050 | 1540 | 52–100 → 78–150 | fire | 18 | 2000 / 1 | 380 | 5 | 80_000 | 150–285 | `grid4(C+"RobotCamouflage/SpriteSheet.png", { scale: 1.1 })` |
| `mt_mariposa_tinta` | Mariposa de Tinta | 64 | 1350 | 2230 | 62–120 → 93–180 | earth | 10 | 2000 / 4 | 300 | 6 | 90_000 | 180–340 | `grid4(M+"Butterfly/SpriteSheet.png", { scale: 1.1 })` |
| `mt_robo_pintor` | Robô Pintor | 70 | 1900 | 3330 | 70–135 → 112–216 | energy | 20 | 2100 / 4 | 380 | 5 | 100_000 | 210–400 | `grid4("monsters/MtRobotPainter.png", { scale: 1.1 })` |
| `mt_robo_montador` | Robô Montador | 84 | 3100 | 5900 | 100–190 → 160–304 | physical | 30 | 2000 / 1 | 380 | 5 | 120_000 | 300–590 | `grid4("monsters/MtRobotAssembler.png", { scale: 1.25 })` |
| `mt_duble` | Dublê de Crash Test | 92 | 4300 | 8800 | 120–230 → 192–368 | physical | 34 | 1900 / 1 | 300 | 6 | 125_000 | 360–720 | `grid4(C+"NinjaMasked/SpriteSheet.png", { tint: 0xfff070, scale: 1.15 })` |
| `mt_tengu_cromado` | Tengu Cromado | 104 | 5600 | 12100 | 140–270 → 238–459 | energy | 32 | 2000 / 4 | 300 | 7 | 150_000 | 450–900 | `strip(B+"TenguBlue/Walk.png", 82, 10, { tint: 0xe4ecf4, scale: 0.38 })` |
| `mt_piloto_fantasma` | Piloto Fantasma | 108 | 6000 | 13100 | 145–280 → 247–476 | death, `undead: true` | 28 | 1900 / 1 | 240 | 8 | 160_000 | 470–940 | `grid4(C+"Tengu2/SpriteSheet.png", { tint: 0xc8d8ff, scale: 1.1 })` |
| **`mt_sapao`** | Sapão do Lava-Jato | 26 | 4200 | 3200 | 32–70 → 45–98 | ice | 9 | 2000 / 1 | 420 | 6 | 7_200_000 | 1100–2000 | `strip(B+"GiantFrog/Idle40x40.png", 40, 5, { tint: 0xbfe6ff, scale: 1.2 })` |
| **`mt_monstro_estufa`** | Monstro da Estufa | 74 | 21000 | 23000 | 140–260 → 224–416 | fire | 28 | 2200 / 3 | 380 | 7 | 10_800_000 | 4500–8000 | `strip("monsters/MtPaintBlob.png", 52, 5, { frameWidth: 62, scale: 1.6 })` |
| **`mt_prototipo`** | O Protótipo | 120 | 70000 | 92000 | 230–410 → 391–697 | energy | 46 | 2000 / 1 | 320 | 8 | 14_400_000 | 17000–27000 | `strip("monsters/MtPrototype.png", 48, 6, { frameWidth: 96, scale: 1.6 })` |

Todos com `fleeAtHpPct: 0`. Chefes com `boss: true`. Frames reais conferidos: Larva2/Snake/Octopus2/KappaRed/Butterfly
64×64 (grid 4×4); RobotCamouflage, NinjaMasked, Tengu2 64×112 (grid4 lê as 4 primeiras linhas, como `black_knight`);
`TenguBlue/Walk.png` 820×82 = 10 quadros de 82 (o mesmo layout do `abyss_tengu` com `TenguRed`); `GiantFrog/Idle40x40.png`
200×40 = 5 de 40; `GiantSlime2/Idle.png` 310×52 = 5 de 62×52 (por isso `frameWidth: 62` com altura 52);
`GiantRedSamurai/Walk.png` 576×48 = 6 de 96×48 (os recolors mantêm o tamanho). Nenhum dos sprites usados direto é usado
hoje por monstro, NPC ou roupa (conferido com `git grep`) nem pela Siderúrgica (`siderurgica.md` §3.2). As origens dos
recolors já aparecem no jogo (`RobotGreen`/`RobotGrey` são NPCs da Oficina; `GiantRedSamurai` é o `abyss_samurai`) ou
são parecidas com outro chefe (`GiantSlime2`), e por isso entram só com a paleta trocada.

Bando: `mt_lagartixa_faisca` com `pack: { family: "faisca", shout: "Faíscas, curto-circuito!" }`.

### 3.2 Por que esses números

- **Curva xp/hp** (`monsters.test.ts`): cada novo fica a ±3% dos vizinhos de mesmo level (snake 0,43 → calota 0,45;
  spider 0,56 → serpente 0,56; tarantula 0,90 → polvo 0,90; crocodile 1,08 → estampador 1,09; orc_warrior 1,29 →
  lagartixa 1,29; winter_wolf 1,45 → soldador 1,47; ice_witch 1,65 → mariposa 1,65; dragon 1,75 → pintor 1,75;
  dragon_lord 1,91 → montador 1,90; behemoth 2,00/hellhound 2,07 → dublê 2,05; demon 2,10/juggernaut 2,20 → tengu 2,16,
  piloto 2,18). Conferido por script com o monstro novo antes e depois de cada empate.
- **Ouro** (`items.test.ts`): ouro máximo perto dos vizinhos de level; médias por faixa de 10 seguem crescentes
  (10s 40 … 100s 880) e nenhum monstro 20+ levels acima paga menos.
- **Dano** comparável aos vizinhos de level (tabela "efetivo"); habilidades ≤ 2× o dano máximo efetivo.
- **Chefes**: o teste "chefes de covil (ciclo 16)" compara cada covil com os chefes **não-covil** vizinhos de level
  (xp/vida, dano máximo e ouro/vida a ±10%), e o `siderurgica.md` aplica a mesma regra aos chefes de lá. Com as duas
  regiões somadas: o Sapão (26) vira o vizinho de baixo do `lair_mole_king` (28) e do Contramestre (36); a Fornalha (118),
  o de cima do `lair_flame` (82); e o **Monstro da Estufa (74) vira o vizinho de baixo do Golem do Convertedor (76)**.
  Por isso o ouro da Estufa subiu para 4500–8000 (ouro/vida 0,381): com 7500 o Golem saía da faixa (0,405 > 0,396).
  Valores finais dos chefes da Montadora: Sapão 0,76 / 98 / 0,476 (entre Lich e Contramestre); Estufa 1,10 / 416 / 0,381
  (entre Yeti e Golem do Convertedor); Protótipo 1,31 / 697 / 0,386 (Orshabaal dos dois lados).
- **Conferência conjunta** (script `mt-check-all.mts`, com os 16 monstros do `siderurgica.md` §3.1 e os 15 daqui): cadeia
  xp/vida nos quatro sentidos de empate (novos antes/depois dos antigos, c19 antes/depois de c20; levels 12, 64 e 104
  coincidem), habilidade ≤ 2× dano final, ouro por faixa (10s 40 · 20s 103 · 30s 182 · 40s 232 · 50s 273 · 60s 363 ·
  70s 424 · 80s 598 · 90s 723 · 100s 880 · 110s 1.000 · 120s 1.200) e "20 levels acima paga mais", os 4 covis e os 6
  chefes novos na regra dos vizinhos: **tudo passa**.

### 3.3 Habilidades (valores base; o laço multiplica)

| Monstro | Habilidades |
|---|---|
| `mt_serpente_fiacao` | `ability.bolt({ name: "Curto-Circuito", range: 3, min: 14, max: 30, kind: "energy", fx: "energy", cooldownMs: 9000 })` |
| `mt_polvo_graxa` | `ability.bolt({ name: "Jato de Graxa", range: 4, min: 28, max: 56, kind: "earth", fx: "earth", cooldownMs: 9000, condition: { id: "slow", durationMs: 3000, value: 30 } })` |
| `mt_estampador` | `ability.stomp({ name: "Prensada", radius: 1, min: 50, max: 105, cooldownMs: 10_000 })` |
| `mt_robo_soldador` | `ability.breath({ name: "Arco de Solda", length: 3, width: 1, min: 75, max: 145, kind: "fire", fx: "fire", cooldownMs: 9000 })` |
| `mt_mariposa_tinta` | `ability.bolt({ name: "Pó de Tinta", range: 4, min: 75, max: 145, kind: "earth", fx: "earth", cooldownMs: 9000, condition: { id: "poison", durationMs: 6000, value: 12 } })` |
| `mt_robo_pintor` | **primeiro** `ability.healAllies({ name: "Retoque", pct: 0.12, radius: 4, belowHpPct: 0.7, cooldownMs: 10_000 })`, depois `ability.bolt({ name: "Jato de Tinta", range: 4, min: 80, max: 160, kind: "energy", fx: "energy", cooldownMs: 8000 })` |
| `mt_robo_montador` | `ability.stomp({ name: "Aperto de Parafusadeira", radius: 1, min: 140, max: 275, cooldownMs: 10_000 })` |
| `mt_duble` | `ability.stomp({ name: "Impacto Frontal", radius: 1, min: 160, max: 320, cooldownMs: 9000 })` |
| `mt_tengu_cromado` | `ability.blast({ name: "Vento Cromado", radius: 2, range: 5, min: 175, max: 350, kind: "energy", fx: "energy", cooldownMs: 10_000 })`, `ability.bolt({ name: "Raio Cromado", range: 5, min: 150, max: 265, kind: "energy", fx: "energy", cooldownMs: 8000 })` |
| `mt_piloto_fantasma` | `ability.breath({ name: "Rastro Fantasma", length: 4, width: 1, min: 180, max: 360, kind: "death", fx: "death", cooldownMs: 9000 })` |
| `mt_sapao` | `ability.blast({ name: "Jato de Espuma", radius: 2, range: 4, min: 50, max: 100, kind: "ice", fx: "ice", cooldownMs: 10_000 })`, `ability.summon({ name: "Bolhas, ao ataque!", monsterId: "runaway_drum", count: 2, max: 4, cooldownMs: 25_000 })` |
| `mt_monstro_estufa` | `ability.blast({ name: "Bafo da Estufa", radius: 2, range: 5, min: 160, max: 320, kind: "fire", fx: "fire", cooldownMs: 9000 })`, `ability.summon({ name: "Tinta fresca!", monsterId: "mt_mariposa_tinta", count: 2, max: 4, cooldownMs: 30_000 })` |
| `mt_prototipo` | `ability.stomp({ name: "Arrancada", radius: 2, min: 300, max: 580, kind: "energy", fx: "energy", cooldownMs: 10_000 })`, `ability.breath({ name: "Faróis Altos", length: 5, width: 3, min: 260, max: 520, kind: "energy", fx: "energy", cooldownMs: 12_000 })`, `ability.summon({ name: "Linha de montagem!", monsterId: "mt_robo_montador", count: 2, max: 4, cooldownMs: 30_000 })` |

Naturezas novas (testes travados de `monsters.test.ts`, só acrescentar): **fogo** `mt_robo_soldador`, `mt_monstro_estufa`;
**gelo** `mt_sapao`; **morto-vivo** `mt_piloto_fantasma`.

### 3.4 Loot

| Monstro | Loot |
|---|---|
| `mt_calota` | `mt_parafuso` 0,55 (1–3) · `health_potion` 0,06 · `mana_potion` 0,05 · `bronze_boots` 0,015 · `mt_bone_visitante` 0,01 |
| `mt_serpente_fiacao` | `mt_fio_cobre` 0,5 (1–2) · `mt_parafuso` 0,3 · `health_potion` 0,08 · `mana_potion` 0,06 · `mt_calca_impermeavel` 0,008 |
| `mt_polvo_graxa` | `mt_graxa` 0,5 (1–2) · `mt_parafuso` 0,4 (2–4) · `health_potion_medium` 0,08 · `mana_potion_medium` 0,08 |
| `mt_estampador` | `mt_chapa_amassada` 0,45 (1–2) · `iron_bar` 0,04 · `health_potion_medium` 0,1 · `mt_escudo_porta` 0,008 |
| `mt_lagartixa_faisca` | `mt_faisca` 0,4 · `health_potion_medium` 0,1 · `mana_potion_medium` 0,1 |
| `mt_robo_soldador` | `mt_eletrodo` 0,4 · `iron_bar` 0,06 · `health_potion_large` 0,06 · `mt_mascara_solda` 0,006 |
| `mt_mariposa_tinta` | `mt_tinta` 0,35 · `mana_potion_large` 0,06 · `gem_yellow` 0,02 |
| `mt_robo_pintor` | `mt_tinta` 0,45 (1–2) · `mana_potion_large` 0,08 · `health_potion_large` 0,06 · `mt_avental_pintor` 0,005 |
| `mt_robo_montador` | `mt_motor` 0,3 · `mithril_bar` 0,03 · `health_potion_large` 0,1 · `mt_macacao` 0,004 |
| `mt_duble` | `mt_airbag` 0,3 · `health_potion_large` 0,12 · `gem_purple` 0,03 |
| `mt_tengu_cromado` | `mt_cromo` 0,25 · `mithril_bar` 0,05 · `mana_potion_large` 0,12 · `health_potion_large` 0,1 · `mt_amuleto_cromado` 0,003 |
| `mt_piloto_fantasma` | `mt_cromo` 0,3 · `ectoplasm` 0,4 (2–4) · `health_potion_large` 0,12 · `mt_amuleto_cromado` 0,003 |
| `mt_sapao` | `mt_coroa_espuma` 1 · `health_potion_medium` 1 (2–4) · `gem_green` 0,2 · `mt_bone_visitante` 0,2 · `mt_calca_impermeavel` 0,15 · `ring_pressa` 0,08 |
| `mt_monstro_estufa` | `mt_brasa_estufa` 1 · `mt_tinta` 1 (3–6) · `health_potion_large` 1 (3–6) · `mana_potion_large` 1 (3–6) · `gem_purple` 0,25 · `mt_avental_pintor` 0,12 · `ring_dragon` 0,1 |
| `mt_prototipo` | `mt_chave_prototipo` 1 · `abyss_shard` 1 (1–3) · `mt_cromo` 1 (3–6) · `mt_amuleto_cromado` 0,1 · `abyss_helmet` 0,06 · `abyss_archer_helmet` 0,06 · `abyss_mage_helmet` 0,06 · `spellbook_abyss` 0,06 |

Nenhum loot de monstro existente muda (o `runaway_drum` continua igual; o balanço do resto do mapa fica intacto).

### 3.5 Sprites por troca de paleta (`tools/monsters/recolor.mjs`)

Cinco variantes novas em `VARIANTS`, depois das quatro da Siderúrgica (o script grava `assets/monsters/<Nome>.png` e a
prévia 8×, os dois versionados). Paletas de origem
contadas pixel a pixel (cor:quantidade); o contorno `#141b1b` nunca entra no mapa. `map` de cada uma:

| Arquivo | Origem (paleta) | `map` |
|---|---|---|
| `MtSparkLizard` (amarelo-faísca) | `ninja/Actor/Monster/Reptile/Reptile.png` (79b8ce:940 548789:722 4e484a:310 ef914f:72 fce2ca:46) | `{ "79b8ce": "f2b632", "548789": "c06a1e", "4e484a": "6e3418", fce2ca: "fff3b0" }` |
| `MtRobotPainter` (amarelo-limão) | `ninja/Actor/Character/RobotGreen/SpriteSheet.png` (56864c:1591 a8a129:1221 345a52:605 e0394c:108) | `{ "56864c": "d8b62a", a8a129: "f2e14a", "345a52": "8a6e1e", e0394c: "4a9df0" }` |
| `MtRobotAssembler` (laranja de máquina) | `ninja/Actor/Character/RobotGrey/SpriteSheet.png` (8d977f:1768 5f7160:1114 f2eaf1:910 e0394c:140) | `{ "8d977f": "d07a28", "5f7160": "9a5420", f2eaf1: "ffc070", e0394c: "7fe8ff" }` |
| `MtPaintBlob` (tinta quente) | `ninja/Actor/Boss/GiantSlime2/Idle.png` (adbc3a:1681 74a334:667 f2eaf1:293 e0394c:164 56864c:133 8f3e56:60 ffffff:4) | `{ adbc3a: "f2b632", "74a334": "e66a3a", "56864c": "a8441e", "8f3e56": "8a1c24", e0394c: "fff3b0" }` (olho claro sobre o laranja) |
| `MtPrototype` (limão e cromo) | `ninja/Actor/Boss/GiantRedSamurai/Walk.png` (e0394c:1609 8f3e56:1587 3b3643:740 f1c471:514 f2eaf1:292 ef914f:240 79b8ce:132 e46d3a:104 d14b34:56) | `{ e0394c: "f2e14a", "8f3e56": "b8962a", "3b3643": "6e7a88", f1c471: "dfe6ee", ef914f: "f8ec6a", e46d3a: "e6c23e", d14b34: "a8861e" }` (branco e o azul do visor ficam) |

---

## 4. Itens

Todos em `packages/shared/src/data/items.ts`, num bloco "Montadora (ciclo 20)" depois dos da Malha; nenhum item
existente muda.

### 4.1 Materiais (10)

| Id | Nome | Valor | Ícone | Cai de |
|---|---|---|---|---|
| `mt_parafuso` | Parafuso Solto | 18 | `img("Projectile/Caltrop.png", 0xc8d0d8)` | calota, serpente, polvo |
| `mt_fio_cobre` | Fio de Cobre | 60 | `img("Resource/BarCopper.png")` | serpente |
| `mt_graxa` | Pote de Graxa | 140 | `img("Potion/EmptyPot.png", 0x3a3a44)` | polvo |
| `mt_chapa_amassada` | Chapa Amassada | 260 | `img("Other/Stamp.png", 0xb8c0c8)` | estampador |
| `mt_faisca` | Faísca Engarrafada | 420 | `img("Potion/WaterPot.png", 0x8fd8ff)` (azul-elétrico: a Limonada do Turno usa o mesmo frasco em amarelo) | lagartixa |
| `mt_eletrodo` | Eletrodo de Solda | 650 | `img("Weapons/Stick/Sprite.png", 0xff9040)` | soldador |
| `mt_tinta` | Lata de Tinta Limão | 900 | `img("Potion/MilkPot.png", 0xf2e14a)` | mariposa, pintor, estufa |
| `mt_motor` | Motor Elétrico | 1500 | `matIcon("ember", 0x70b0ff)` | montador |
| `mt_airbag` | Airbag Murcho | 2200 | `img("Object/Bag.png", 0xf8f0e0)` | dublê |
| `mt_cromo` | Cromo Puro | 3800 | `img("Resource/BarSilver.png", 0xf0f4ff)` | tengu, piloto, protótipo |

`mat(id, nome, ícone, valor, descrição)` (stack 100). Descrições curtas, no tom do jogo (ex.: Parafuso Solto: "Caiu de
algum lugar importante. Ninguém sabe de onde."; Cromo Puro: "Reflete tanto que dá para pentear o cabelo nele.").

### 4.2 Itens de missão (3, troféus dos chefes)

`kind: "quest"`, `value: 0`, como os troféus da Malha e dos covis (não abrem nada):

| Id | Nome | Ícone | Descrição |
|---|---|---|---|
| `mt_coroa_espuma` | Coroa de Espuma | `img("Treasure/SilverCup.png", 0xbfe6ff)` | "Não desmancha nunca. Prova de que o Sapão do Lava-Jato caiu." |
| `mt_brasa_estufa` | Brasa da Estufa | `matIcon("ember", 0xff8a3c)` | "Ainda cheira a tinta fresca. Prova de que o Monstro da Estufa caiu." |
| `mt_chave_prototipo` | Chave do Protótipo | `img("Treasure/GoldKey.png", 0xf2e14a)` | "Não liga nenhum carro conhecido. Prova de que O Protótipo caiu." |

### 4.3 Equipamento (7) — abaixo do melhor do slot no level

O modelo de balanço (`server/systems/balanceKit.ts`) equipa o item **mais caro** liberado em cada slot. Regra (a mesma das
peças da Oficina e da Malha): o valor de cada peça nova fica **abaixo do melhor item do slot no level dela, para cada
vocação que pode usar**. Referências conferidas por script em `items.ts` hoje:

| Id | Nome | Slot | Lv | Vocações | Stats | Valor | Ícone | Referência (mais barata entre as vocações) |
|---|---|---|---|---|---|---|---|---|
| `mt_bone_visitante` | Boné de Visitante | helmet | 12 | todas | armor 1, speed 2 | 95 | `gear("helmet_cap", "gold")` | `ranger_helmet` 100 (paladino, lv 8) |
| `mt_calca_impermeavel` | Calça Impermeável | legs | 20 | todas | armor 2, hpMax 25 | 850 | `gear("legs_pants", "bronze")` | `iron_legs` 900 (cavaleiro, lv 15) |
| `mt_escudo_porta` | Escudo de Porta | shield | 30 | cavaleiro | armor 2, shield 3, hpMax 30 | 2900 | `gear("shield_kite", "steel")` | `steel_shield` 3200 (lv 25) |
| `mt_mascara_solda` | Máscara de Soldador | helmet | 45 | todas | armor 3, hpMax 40 | 5200 | `gear("helmet_full", "iron")` | `archmage_helmet` 5500 (magos, lv 35) |
| `mt_avental_pintor` | Avental de Pintor | armor | 65 | todas | armor 4, hpMax 80, manaMax 80 | 46000 | `gear("armor_robe", "gold")` | `mystic_armor` 50000 (magos, lv 50) |
| `mt_macacao` | Macacão Amarelo-Limão | legs | 85 | todas | armor 4, hpMax 100, speed 2 | 64000 | `gear("legs_pants", "gold")` | `ferumbras_legs` 70000 (magos, lv 70) |
| `mt_amuleto_cromado` | Amuleto Cromado | amulet | 100 | todas | armor 3, hpMax 250, manaMax 120, speed 2 | 180000 | `gear("amulet", "steel")` | `amulet_orshabaal` 300000 (lv 90) |

O escudo é só de cavaleiro de propósito: o paladino usa arco de duas mãos e hoje só tem o `leather_shield` (30); um
escudo geral de 2900 viraria o "melhor" dele no modelo. A Siderúrgica acrescenta 8 peças (elmos 40/85, botas 50/70,
calças 60, anel 60, amuleto 70, armadura 80; `siderurgica.md` §3.4); conferido por script com as 15 peças das duas
regiões somadas: cada uma fica abaixo do melhor do slot no level dela para toda vocação (a referência inclui as peças da
outra região), e em nenhum slot e level de 1 a 130 o mais caro passa a ser uma peça nova (o `balanceKit` e o Coliseu
não mudam). A Máscara de Soldador (lv 45) e o Capacete de Fundidor da Siderúrgica (lv 40) valem os mesmos 5200, ambos
abaixo do `archmage_helmet` (5500). Fontes: recompensa de missão (§6) e loot raro de monstro comum (§3.4), então as 7
peças entram no Baú de Recompensa (`chestEligible`: vendido ou derrubado por monstro comum).

### 4.4 Anéis por vocação (baú do Crash Test)

O helper `trinket` ganha um último parâmetro opcional `vocations?: Vocation[]` (só espalha `{ vocations }` quando vem).
Lv 95; referência: `ring_demodras` 120000 é o melhor anel de toda vocação do lv 70 em diante → valor 96000.
Não são `unique` (o teste de únicos trava as 4 armas da Aniquilação; os anéis seguem o padrão do `frost_ring`). Como só
saem dos baús, ficam fora do Baú de Recompensa sem regra nova (`chestEligible` pede loja ou monstro comum).

| Id | Nome | Vocação | Tier do ícone | Stats | Valor |
|---|---|---|---|---|---|
| `mt_anel_para_choque` | Anel do Para-Choque | knight | `steel` | armor 2, melee 3, hpRegen 4 | 96000 |
| `mt_anel_retrovisor` | Anel do Retrovisor | paladin | `gold` | distance 3, crit 5 | 96000 |
| `mt_anel_ignicao` | Anel da Ignição | sorcerer | `arcane` | magic 3, manaRegen 5 | 96000 |
| `mt_anel_radiador` | Anel do Radiador | druid | `mithril` | magic 2, manaRegen 4, hpRegen 3 | 96000 |

### 4.5 Tier 8 do Protótipo

`abyss_helmet`, `abyss_archer_helmet`, `abyss_mage_helmet`, `spellbook_abyss` a 0,06 cada (uma peça por forma de
vocação; a Fornalha do ciclo 19 dá `abyss_armor`, `abyss_archer_armor`, `abyss_mage_armor` e `abyss_shield` a 0,06).
O `items.test.ts` já sai do ciclo 19 com `REGION_FINAL_BOSSES = new Set(["fornalha_primordial", "mt_prototipo"])` e
faixa `[0.05, 0.08]` (o teste não exige que o `mt_prototipo` exista); o ciclo 20 só passa a ter o Protótipo nele. Os
outros chefes continuam em `[0.1, 0.12]`.

### 4.6 Rubi, Aço Líquido e Cromo no refino e no encantamento (pendência do ciclo 19)

O plano pede os três materiais de fim de região como custo de refino e encantamento; o ciclo 19 deixou para cá porque o
Cromo só existe agora. Regra: **nada fica mais barato e os níveis de baixo não mudam**; o material novo é um custo
**extra**, só nos degraus mais altos, para quem já está no fim de jogo puxar as regiões novas.

- **Refino** (`packages/shared/src/data/refine.ts`): `RefineCost` ganha `extra?: { materialId: string; count: number }`;
  `REFINE_EXTRA: Record<RefineTier, string> = { 5: "gem_red", 6: "gem_red", 7: "frasco_aco_liquido", 8: "mt_cromo" }`,
  `REFINE_EXTRA_FROM = 4`, `REFINE_EXTRA_COUNT = 1`. As tentativas de **+4 e +5** pedem, além do ouro e da gema do
  tier, 1 Rubi (tier 5–6), 1 Frasco de Aço Líquido (tier 7) ou 1 Cromo Puro (tier 8), consumido no sucesso e na falha
  como a gema. Esperado de +0 a +5: 1/(1−0,4) + 1/(1−0,5) ≈ 3,7 unidades por item (tier 8: ~14 mil em Cromo, perto dos
  ~650 mil de ouro). O ouro não muda (o teste "4 abissais ≈ 2,5 milhões" continua igual).
- **Encantamento** (`packages/shared/src/data/imbuement.ts`): `ImbuementTierDef` ganha o mesmo `extra?`; só o **tier
  III** (lv 90, 100 mil + 5 Essências Demoníacas) passa a pedir também: Dreno de Vida 2 Rubis, Dreno de Mana 2 Rubis,
  Espinhos 2 Cromo Puro (reflete), Perfurante 1 Frasco de Aço Líquido (atravessa), Veloz 2 Cromo Puro. Tiers I e II
  iguais.
- **Servidor**: `server/src/systems/refine.ts` e a compra de encantamento em `server/src/systems/npcs.ts` conferem
  **todos** os materiais antes de cobrar qualquer coisa ("Faltam materiais: 1x Rubi.") e consomem os dois juntos.
- **Cliente**: `ui/refine/refineLogic.ts`, `ui/refine/RefineTab.tsx` e `ui/imbue/ImbuementTab.tsx` mostram a segunda
  linha de material com a quantidade que o jogador tem e desabilitam o botão quando falta.
- **Testes**: `refine.test.ts` ("+1..+3 sem extra; +4/+5 pedem o material do tier; os três existem e empilham");
  `imbuement.test.ts` ("só o tier III tem extra; material existe"); testes do servidor de refino e de encantamento
  ("sem o extra nada é cobrado e o item não muda; com tudo, consome ouro, gema e extra").
- **Novidades e `/anuncio`**: muda o custo de um sistema que todo mundo do topo usa; avisar antes do deploy.

---

## 5. Alavanca "Crash Test" e baús

Em `packages/shared/src/data/questWorld.ts`:

```ts
// QUEST_LEVERS (depois da Aniquilação: a ordem do mapa segue a deste objeto)
crash_test: { id: "crash_test", name: "Crash Test", minLevel: 95, players: 4, minPlayers: 2,
  monsters: ["mt_duble", "mt_robo_montador", "mt_duble", "mt_tengu_cromado", "mt_robo_montador", "mt_piloto_fantasma"],
  startText: "Crash Test começou! Derrube os bonecos e alcance os troféus." },
// QUEST_CHEST_GROUPS
crash_test: { id: "crash_test", name: "Crash Test", where: "Boxe dos Troféus, sob a Pista de Testes", minLevel: 95 },
// QUEST_CHESTS (um anel por vocação + o mesmo material em todos)
chest("mt_crash_knight", "crash_test", { items: [...one("mt_anel_para_choque"), ...one("mt_cromo", 2)] }),
chest("mt_crash_paladin", "crash_test", { items: [...one("mt_anel_retrovisor"), ...one("mt_cromo", 2)] }),
chest("mt_crash_sorcerer", "crash_test", { items: [...one("mt_anel_ignicao"), ...one("mt_cromo", 2)] }),
chest("mt_crash_druid", "crash_test", { items: [...one("mt_anel_radiador"), ...one("mt_cromo", 2)] }),
```

- `leverMonsters` já escala pelo grupo: 2 jogadores → 3 monstros (dublê, montador, dublê), 3 → 5, 4 → 6.
- `QuestLeverDef` ganha `startText?: string`; o servidor usa `def.startText ?? "<nome> começou! Derrote os demônios e
  alcance o tesouro."` (texto atual da Aniquilação continua igual).
- **Um dia por alavanca**: hoje `CharacterData.leverDay` é um só; com duas alavancas, fazer o Crash Test bloquearia a
  Aniquilação no mesmo dia. Passa a `leverDays?: Record<string, string>` (id da alavanca → dia), com leitura de
  compatibilidade: `leverDay` antigo vale como `leverDays.annihilator`. `getLeverDay(charId, leverId)` /
  `setLeverDay(charId, leverId, day)` no `QuestWorldSystem` e no `WorldRoom` (`persistence/types.ts`).
- Baús: escolha única por personagem (grupo), para sempre, como a Aniquilação. A missão "Crash Test" (§6) exige entrar
  na sala (passo `explore` com `area`), não abrir o baú.

---

## 6. Missões (14)

`packages/shared/src/data/quests.ts`, num bloco "Montadora (ciclo 20)" no fim da `QUEST_LIST`. Só tipos de passo que
existem (`kill`, `deliver`, `explore`, `talk`, `boss`). Faixa coberta: 10 → 112, maior buraco 14 levels (68 → 82).
Recompensas na escala das missões vizinhas de level (ex.: lv 25 ≈ 8 mil, lv 48 ≈ 22 mil, lv 68 chefe ≈ Yeti 55 mil,
lv 112 chefe final entre Orshabaal 180 mil e Ferumbras 200 mil).

| # | Id | Nome | NPC | Lv | Requer | Passos | Recompensa |
|---|---|---|---|---|---|---|---|
| 1 | `mt_cracha` | Crachá de Visitante | `mt_porteiro` | 10 | — | talk `mt_cantineira` · talk `mt_enfermeira` · explore "Pátio de Carros" | 1500 xp, 400 ouro, `health_potion` ×5, `mana_potion` ×5 |
| 2 | `mt_calotas` | Calotas Fujonas | `mt_lavador` | 12 | 1 | kill `mt_calota` 12 · deliver `mt_parafuso` 6 | 2200 xp, 600 ouro, `mt_bone_visitante` |
| 3 | `mt_bolhas` | Bolhas no Lava-Jato | `mt_lavador` | 15 | 1 | explore "Lava-Jato" · kill `runaway_drum` 12 | 3000 xp, 900 ouro, `mt_calca_impermeavel` |
| 4 | `mt_sapao_hunt` | O Sapão do Lava-Jato | `mt_lavador` | 22 | 3 | boss `mt_sapao` 1 | 8000 xp, 3000 ouro, `health_potion_medium` ×10, `mana_potion_medium` ×10 |
| 5 | `mt_prensa` | Prensa Desregulada | `mt_prensista` | 25 | 2 | explore "Estamparia" · kill `mt_estampador` 12 | 8000 xp, 2500 ouro, `health_potion_medium` ×10 |
| 6 | `mt_chapa` | Chapa Torta | `mt_prensista` | 30 | 5 | kill `mt_polvo_graxa` 15 · deliver `mt_chapa_amassada` 6 | 10000 xp, 3000 ouro, `mana_potion_medium` ×15 |
| 7 | `mt_solda` | Ponto de Solda | `mt_soldadora` | 40 | 5 | explore "Funilaria e Armação" · kill `mt_lagartixa_faisca` 20 · deliver `mt_faisca` 5 | 15000 xp, 3500 ouro, `mt_mascara_solda` |
| 8 | `mt_curto` | Curto na Armação | `mt_soldadora` | 48 | 7 | kill `mt_robo_soldador` 15 · deliver `mt_eletrodo` 5 | 22000 xp, 5000 ouro, `health_potion_large` ×10 |
| 9 | `mt_nevoa` | Névoa de Tinta | `mt_pintor` | 60 | 7 | explore "Cabines de Pintura" · kill `mt_mariposa_tinta` 20 · kill `mt_robo_pintor` 8 | 32000 xp, 6000 ouro, `mt_avental_pintor` |
| 10 | `mt_estufa_hunt` | O Monstro da Estufa | `mt_pintor` | 68 | 9 | explore "Estufa" · boss `mt_monstro_estufa` 1 | 55000 xp, 12000 ouro, `health_potion_large` ×15 |
| 11 | `mt_linha` | A Linha Não Pode Parar | `mt_supervisora` | 82 | 9 | kill `mt_robo_montador` 20 · kill `mt_duble` 12 · deliver `mt_motor` 5 | 72000 xp, 14000 ouro, `mt_macacao` |
| 12 | `mt_crash` | Crash Test | `mt_piloto` | 95 | 11 | explore área `{ x: 220, y: 852, w: 41, h: 13 }` (label "Entre no Crash Test pela alavanca") · kill `mt_duble` 15 | 95000 xp, 20000 ouro, `health_potion_large` ×20, `mana_potion_large` ×20 |
| 13 | `mt_cromados` | Cromados | `mt_piloto` | 100 | 11 | kill `mt_tengu_cromado` 15 · kill `mt_piloto_fantasma` 15 · deliver `mt_cromo` 5 | 130000 xp, 28000 ouro, `mt_amuleto_cromado` |
| 14 | `mt_prototipo_hunt` | O Protótipo | `mt_piloto` | 112 | 13 | explore "Sala dos Protótipos" · boss `mt_prototipo` 1 | 190000 xp, 45000 ouro, `health_potion_large` ×30, unlock `title:piloto_testes` |

Regras dos testes que estas missões respeitam: todo `explore` sem área aponta para zona do mapa; missão com `explore` +
`kill` tem o alvo nascendo na zona explorada (Lava-Jato → `runaway_drum`; Estamparia → estampador; Funilaria →
lagartixa; Cabines → mariposa e pintor; o Crash Test usa `area`, que o teste pula). As missões de chefe 4 e 10 pedem
grupo no diálogo; a 14 pede "grupo de 5+", como no plano.

Resumos e ganchos (a frente C escreve `accept/progress/complete` no mesmo tom: humor de chão de fábrica, sem nome de
empresa, carro ou lugar real):

1. **Crachá de Visitante** — "Ninguém entra sem crachá. Ninguém. Nem o crachá." O Porteiro manda conhecer a Cantineira e
   a Enfermeira e dar uma volta no Pátio antes de liberar o crachá.
2. **Calotas Fujonas** — as calotas aprenderam a rolar sozinhas e fugiram dos carros; o Lavador quer 12 de volta ao chão
   e 6 parafusos soltos para prender as que sobraram.
3. **Bolhas no Lava-Jato** — a espuma do Lava-Jato criou vida e virou Gosma Azul; estoure 12.
4. **O Sapão do Lava-Jato** — no fundo do Lava-Jato mora um sapo do tamanho de uma van, que só aceita lavagem completa.
5. **Prensa Desregulada** — a prensa vermelha da Estamparia carimba tudo o que passa, inclusive operários; derrube 12
   Estampadores Vermelhos.
6. **Chapa Torta** — os Polvos de Graxa engraxam o chão e a chapa sai torta; 15 polvos e 6 chapas amassadas para análise.
7. **Ponto de Solda** — as Lagartixas de Faísca comem o arame de solda; 20 delas e 5 faíscas engarrafadas.
8. **Curto na Armação** — os Robôs Soldadores soldaram a porta do vestiário por dentro; 15 robôs e 5 eletrodos.
9. **Névoa de Tinta** — a tinta das cabines virou mariposa e o Robô Pintor retoca os inimigos dela.
10. **O Monstro da Estufa** — a estufa de secagem acordou com fome de tinta fresca.
11. **A Linha Não Pode Parar** — a Supervisora precisa da linha andando: robôs montadores e dublês fora do caminho, e 5
    motores para a reposição.
12. **Crash Test** — o Piloto quer saber se os bonecos aguentam batida de verdade: suba nas placas com o grupo e puxe a
    alavanca.
13. **Cromados** — o cromo dos protótipos foi parar em Tengus e Pilotos Fantasmas; traga 5 barras de volta.
14. **O Protótipo** — o primeiro carro que a linha fez sozinha mora no subsolo e não quer ser recolhido.

---

## 7. NPCs (14) e placas (6)

`packages/shared/src/data/npcs.ts`, bloco "Montadora (ciclo 20)". Sprites 64×112 (conferidos). Toda fala com 2+
`idleLines` (o teste exige). Nenhum sprite repete os 13 da Siderúrgica (`siderurgica.md` §4.2: NinjaWater, EggBoy,
LionYellow, NinjaMageOrange, CamouflageGreen, NinjaThunder, Cavegirl2, Flam, NinjaRed, MaskGoldRacoon, NinjaGreen,
Spirit e Inspector das placas, que aqui também é o das placas); os 7 novos (NinjaLeaf, LionOrange, CaveLion, Lion,
LionBoy, Pig, GreenPig) não são usados por ninguém hoje (conferido com `git grep`).

### 7.1 NPCs

| Id | Nome | Sprite (`C + …`) | Papel | Saudação (resumo) | Falas soltas |
|---|---|---|---|---|---|
| `mt_cegonha_vila` | Motorista da Cegonha | `Villager5` | viagem → Portaria (250) | "Cegonha para a Montadora! Vou buscar carro novo e levo gente na cabine. Até o level 8 é por conta da casa." | "Carro sai amarelo. Todo. Até o que era para ser azul." · "Cabine tem lugar para três. O quarto vai em cima, no carro." |
| `mt_motorista` | Motorista da Cegonha | `Villager5` | viagem → Vila 250, Oficina 150 | "Voltando para a Vila? A cegonha sai cheia de carro limão e um passageiro." | "Ré com cegonha é arte." · "Não encoste nos carros: a tinta ainda está fresca." |
| `mt_bobinas` | Motorista do Caminhão de Bobinas | `LionOrange` | viagem → Estação do Minério 200 | "Bobina de aço vem da Siderúrgica, eu volto vazio. Quer carona até a Estação do Minério?" | "Bobina rola. Por isso eu amarro três vezes." · "Da Siderúrgica para cá é chapa; daqui para lá é saudade." |
| `mt_bobinas_sid` | Motorista do Caminhão de Bobinas | `LionOrange` | viagem → Portaria 200 | "Levo bobina para a Montadora. Cabe mais um na boleia." | (as mesmas duas) |
| `mt_porteiro` | Porteiro da Montadora | `Villager3` | missão 1 | "Crachá, por favor. Não tem? Então vamos fazer um." | "Visitante usa crachá amarelo. Funcionário também. Tudo aqui é amarelo." · "A cancela abre sozinha. Ela decidiu isso semana passada." |
| `mt_cantineira` | Cantineira | `Woman` | loja (§7.3) | "Prato do dia, poção e café. Compro o que você arrancar das máquinas." | "Hoje tem prato feito. Amanhã também. Sempre tem." · "Lata de tinta não é tempero. Já avisei o Pintor." |
| `mt_depot` | Guarda-Volumes da Portaria | `OldMan2` | depósito | "O mesmo baú da Vila, aqui na portaria. Etiquete antes de entrar na fábrica." | "Peça sem etiqueta vira peça de reposição." · "Deixe o peso aqui antes da Estamparia." |
| `mt_enfermeira` | Enfermeira do Ambulatório | `Lion` | bênção | "Curativo, termômetro e uma bênção para o próximo tombo. A linha não perdoa." | "Faísca no olho? Óculos, querido. Óculos." · "Quem volta do Crash Test volta mancando." |
| `mt_lavador` | Lavador-Chefe | `NinjaLeaf` | missões 2–4 | "O Lava-Jato está sem controle: espuma com vida, calota fugindo e um sapo enorme no fundo." | "Lavagem completa ou nada." · "Se a espuma piscar para você, corra." |
| `mt_prensista` | Operadora da Prensa | `Pig` | missões 5–6 | "A prensa vermelha decidiu carimbar o que quiser. Inclusive a gente." | "Mão longe da prensa. A prensa não pensa." · "Chapa torta não vira carro. Vira escultura." |
| `mt_soldadora` | Mestra Soldadora | `CaveLion` | missões 7–8 | "Os robôs aprenderam a soldar sozinhos. O problema é o que eles soldam." | "Ponto de solda bonito é ponto de solda frio." · "As lagartixas comem arame. Pelo menos não comem eletrodo. Ainda." |
| `mt_pintor` | Pintor-Chefe | `LionBoy` | missões 9–10 | "Toda tinta aqui virou amarelo-limão, e a que sobrou criou asas." | "Primeira demão: primer. Segunda: limão. Terceira: limão de novo." · "A estufa ronca de noite. Ronca." |
| `mt_supervisora` | Supervisora de Linha | `Villager6` | missão 11, depósito, viagem → Vila 250, Portaria 100 | "A linha não pode parar. Se você parou aqui, é porque a linha parou. Ajude." | "Meta do turno: um carro por minuto. Realizado: um robô por minuto." · "Café na máquina, baú no armário, cegonha lá fora." |
| `mt_piloto` | Piloto de Testes Veterano | `GreenPig` | missões 12–14 | "Trinta anos de pista. Nunca vi carro andar sem motorista. Até esta semana." | "Volta rápida? Não. Volta inteira." · "O Protótipo passa na reta toda quarta, depois do almoço." |

`mt_enfermeira` com `blessing: true`; `mt_depot` e `mt_supervisora` com `depot: true`; viagens como na §2.4.
`coach_oficina` (Cocheiro Dito) ganha o destino `{ ...MONTADORA_ARRIVAL, price: 200 }` e uma fala nova
("Montadora? Levo até a portaria. Lá dentro é com a cegonha.").

### 7.2 Placas (sprite `Inspector`, sem papel, como os quadros do jogo e as placas da Siderúrgica)

| Id | Nome | Saudação | Falas soltas |
|---|---|---|---|
| `mt_placa_patio` | Placa do Pátio | "PÁTIO DE CARROS — lv 10+. Calotas soltas. Não persiga calota na faixa de pedestre." | "Lv 10+." · "Velocidade máxima: 10. De level." |
| `mt_placa_estamparia` | Placa da Estamparia | "ESTAMPARIA — lv 25+. Prensa em operação. Ou em rebelião." | "Lv 25+." · "Uso obrigatório de protetor auricular." |
| `mt_placa_funilaria` | Placa da Funilaria | "FUNILARIA E ARMAÇÃO — lv 40+. Área de solda: faíscas soltas." | "Lv 40+." · "Lagartixa não é mascote." |
| `mt_placa_pintura` | Placa das Cabines | "CABINES DE PINTURA — lv 60+. Tinta fresca em tudo, inclusive no ar." | "Lv 60+." · "Não respire fundo." |
| `mt_placa_montagem` | Placa da Montagem | "MONTAGEM FINAL — lv 80+. Linha em movimento. A linha não para." | "Lv 80+." · "Sala de Descanso logo à esquerda." |
| `mt_placa_pista` | Placa da Pista | "PISTA DE TESTES — lv 90+. Subsolo dos protótipos: lv 110+." | "Lv 90+." · "Proibido ultrapassar o Protótipo." |

### 7.3 Loja da Cantineira

`sells`: `health_potion_medium`, `health_potion_large`, `mana_potion_medium`, `mana_potion_large`, `beaf`, `yakitori`,
`sushi`, `cafe_oficina`, `marmita_tampa_vermelha` `limonada_turno` e `prato_feito` (comidas criadas no ciclo 19, que o
Almoxarife de lá também vende). `buys`: todos os tipos (como o Ferramenteiro da Malha).

---

## 8. Evento "Teste de Pista"

`packages/shared/src/data/events.ts`, no fim de `WEEKLY_EVENTS`:

```ts
// Montadora (ciclo 20): quarta às 13h, logo depois da Invasão da Vila (12h15–12h55) e antes do Apito (17h).
{ id: "teste_de_pista", name: "Teste de Pista", desc: "O Protótipo saiu para a pista! XP ×1,5 e loot +50%",
  xpMult: 1.5, lootMult: 1.5, day: 3, hour: 13, durationMin: 60, boss: "mt_prototipo" },
```

Quarta: Invasão 12h15–12h55, **Teste de Pista 13h–14h**, Apito da Locomotiva 17h–18h: sem sobreposição. A Sangria do
Alto-Forno da Siderúrgica (segunda 17h–18h) também não cruza nada. O chefe é convocado no spawn dele (Salão do
Protótipo) se não houver um vivo.

`events.test.ts`, por cima das mudanças do ciclo 19 (`siderurgica.md` §4.4):
- lista ordenada de chefes de evento ganha `"mt_prototipo"` (fica `[…, "golem_convertedor", …, "mt_prototipo", …]` em
  ordem alfabética);
- lista "dia útil a partir das 13h" (ordem do array) vira `["apito_da_locomotiva", "ferumbras_no_expediente",
  "orshabaal_no_expediente", "sangria_do_alto_forno", "teste_de_pista"]`;
- no teste do ciclo 18, `day(3)` passa a `["apito_da_locomotiva@1020+60", "invasao_da_vila@735+40",
  "teste_de_pista@780+60"]` e o comentário "quarta: Invasão 12h15–12h55, Teste de Pista 13h, Apito 17h";
- `nextScheduled(quarta 13h00)` **continua** `apito_da_locomotiva` (o Teste de Pista começa exatamente às 13h e o
  agendador pula o que já começou); casos novos: `scheduledEvent(quarta 13h30) = teste_de_pista`,
  `scheduledEvent(quarta 12h56) = null`, `nextScheduled(quarta 12h56) = teste_de_pista às 13h` e
  `expect(eventDef("teste_de_pista")).toMatchObject({ day: 3, hour: 13, durationMin: 60, boss: "mt_prototipo", xpMult: 1.5, lootMult: 1.5 })`.

---

## 9. Conquistas e títulos

`packages/shared/src/data/achievements.ts`:

- `AchMetric` ganha `"boss:mt_sapao" | "boss:mt_monstro_estufa" | "boss:mt_prototipo"` (o servidor já conta `boss:<id>`
  de qualquer chefe, `systems/achievements.ts`).
- `TITLES`: `lava_rapido: "o Lava-Rápido"`, `piloto_testes: "Piloto de Testes"`.
- Conquistas (bloco "Montadora (ciclo 20)"):
  - `a("mt_lava_rapido", "Lava-Rápido", "Derrote o Sapão do Lava-Jato", "\u{1FAE7}", 25, "boss:mt_sapao", 1, { rewards: ["title:lava_rapido"], rare: true })`
  - `a("mt_secagem", "Secagem Rápida", "Derrote o Monstro da Estufa", "\u{1F3A8}", 35, "boss:mt_monstro_estufa", 1, { rare: true })`
  - `a("mt_fim_de_linha", "Fim de Linha", "Derrote O Protótipo", "\u{1F3CE}\u{FE0F}", 60, "boss:mt_prototipo", 1, { rare: true })`
- O título "Piloto de Testes" vem da missão 14 (`unlock: "title:piloto_testes"`).

---

## 10. Quadro de Recompensas

`BOUNTY_BANDS` em `quests.ts` ganha **uma** faixa no fim (as 11 antigas não mudam: o sorteio de quem gravou antes
depende do índice):

```ts
// Ciclos 19–20: Siderúrgica e Montadora (margem de 14: monstros até lv 128, caçáveis no 114 sem missão).
{ minLevel: 114, monsters: ["gosma_aco_liquido", "mt_piloto_fantasma", "mt_tengu_cromado", "abyss_samurai"] },
```

Teste novo: `BOUNTY_BANDS.slice(0, 11)` igual ao snapshot de hoje; a faixa 114 passa no teste existente "caçável no
level mínimo": `gosma_aco_liquido` (lv 114) é caçável desde o lv 100 pela escotilha D6 da Siderúrgica, sem missão;
Tengu Cromado (104) e Piloto Fantasma (108) na Pista (porta lv 90); `abyss_samurai` (120) no Abismo Profundo e na
Galeria (portas lv 100/110). Todos ≤ 114 + 14 = 128. `REQUEST_BANDS` não muda.

---

## 11. Arte (`L.factory()`)

Alocação adiada, como `L.rail()`, `L.industry()` e `L.steel()`: em `tools/mapgen/lemon.mjs`, só acréscimos,
`L.factory = () => (L._factory ??= createFactory(L));`, chamado pela primeira vez **só** dentro do `expand7` (depois do
`expand6`, que é quem chama `L.industry()`/`L.steel()` pela primeira vez). Chaves com prefixo `fab_` e peças compostas
com `contentKey('fab', cv)`: peças iguais saem uma vez só. Paleta do pack e de `lemon.mjs` (contorno `#141b1b`; aço
`#c3ccd2 #93a0aa #66737d #454f57`; amarelo de segurança `#e6c23e`; limão dos carros `#f2e14a #d8b62a #a8861e`).
Estimativa ~170–200 tiles novos: atlas 560 → ~880 com a Siderúrgica (~320) → **~1.060** com a Montadora (PNG 256 ×
~1.060), abaixo da capacidade de 2.560 (o plano previa ~880 para as duas; a diferença é o tamanho real da arte do ciclo
19). Prova: `diff-world` e `diff-atlas` (§2.8).

**Reaproveita (não gera):** de `I = L.industry()` (assinaturas do `siderurgica.md` §5.2) — `I.asphalt(v)` e
`I.asphaltLine(dir)` (Pátio, Pista, frente da Portaria), `I.checker(v)` (galpões, arena), `I.concrete(v)` (Portaria,
Lava-Jato), `I.stripe(dir, part)` (corredores, limiar das portas, arena), `I.belt(dir, part)` (esteiras da Estamparia e
linha da Montagem, andáveis, speed 70), `I.pipe(part)` (canos aéreos nos galpões), `I.metalWall(part)` (todas as
paredes de galpão), `I.slidingDoor(dir)` (folhas abertas nas paredes ao lado de cada portal de porta da §2.3; o tile do
portal fica com o limiar zebrado), `I.chainFence(part)` (cerca entre Portaria e Pátio, contorno da Pista),
`I.concreteWall(part)` (muro externo); de `T = L.steel()` — `T.coil()` (as três bobinas da carroceria do Caminhão de
Bobinas); do pack — postes `S.lamp`, barris/caixotes/balcão/prateleira/armário do `TilesetElement`, árvores `N`
(limoeiros na Portaria), piso escuro `I` e paredes `R` do subsolo (como `expansion5.mjs`), placas/alavanca/arte de baú
`G`/`E` (como a Aniquilação); do Lemon — `S.rubbleGray`, `S.crackStone`, `S.cobweb` no subsolo.

**Gera em `createFactory(L)`** (cada item com tamanho em tiles):

| Peça | Tiles | Uso |
|---|---|---|
| Carro visto de cima, 5 cores (amarelo-limão, vermelho, azul, branco, verde), vertical 2×3 e horizontal 3×2 | 5 × 2 folhas | Pátio, Montagem (horizontal, na esteira) |
| Carroceria em primer (cinza), vertical 2×3 | 1 folha | Funilaria |
| Protótipo coberto por lona, 2×3 | 1 folha | Galeria do subsolo |
| Cegonha (cabine + carreta de dois andares com carros limão), 8×3 | 1 folha | Portaria |
| Caminhão de bobinas (cabine e carroceria; as bobinas são `T.coil()` por cima), 8×3 | 1 folha | Portaria |
| Guarita 4×3 e cancela (aberta) 1×2 | 2 folhas | Portaria |
| Prensa 3×3 | 1 folha | Estamparia |
| Braço robótico 2×2 (dois espelhamentos) | 2 folhas | Funilaria, Montagem |
| Cabine de pintura: parede de vidro com quina (blob simples de 8–12 tiles) | ~10 | Cabines |
| Respingo de tinta nas 5 cores (decalque) | 5 | Cabines |
| Estufa: grelha quente, porta de forno 2×2 | ~6 | Estufa |
| Lava-jato: piso molhado (3 variações), ralo, espuma (3), rolo de lavagem 1×2 | ~9 | Lava-Jato |
| Pista: zebrado vermelho/branco por pixel ao longo das duas elipses (chave por conteúdo), linha de chegada xadrez, semáforo de largada 1×2, pneus empilhados, cone | ~35 | Pista |
| Boxes (prédio com portas de enrolar) 17×6 | 1 folha | Pista |
| Prédio da rampa 5×3 | 1 folha | Pista |
| Pilha de chapas 2×1, pallet, motor no chão, calota solta (decalque) | ~6 | Pátio, Estamparia, Montagem |
| Relógio de ponto 1×2, máquina de café 1×2 | 2 folhas | Sala de Descanso |
| Parede de impacto (blocos com zebrado) | ~3 | Pista do Crash Test |
| Plataforma giratória (anel desenhado no piso) | ~9 | Salão do Protótipo |

Nada de logotipo, letreiro de marca ou desenho que imite carro real: carros genéricos "bolinha" vistos de cima.

---

## 12. Frentes paralelas

Três agentes com arquivos separados, ligados na integração. Ids, coordenadas e números deste documento são o contrato.
Pré-requisito: o ciclo 19 já está na `main` (mapa 400×722, `L.industry()`/`L.steel()`, `MINERIO_ARRIVAL`, comidas,
`gem_red`, `frasco_aco_liquido`, `REGION_FINAL_BOSSES`). Ordem de integração, a mesma do ciclo 19: **B → C → A** (o mapa
por último: com os spawns e NPCs novos no `world.json` e sem B/C falhariam "define todo monstro usado nos spawns" e
"define todo npcId usado no mapa"). Entre C e A ficam vermelhos só os testes de C que precisam da região no mapa
(destinos de viagem andáveis, caçável no level, alavanca e baús no mapa).

### Frente A — mapa e arte

Arquivos: `tools/mapgen/expansion7.mjs` (novo), `tools/mapgen/lemon.mjs` (só acréscimos: `createFactory` +
`L.factory`), `tools/mapgen/generate.mjs` (etapa `expand7` depois do `expand6`; saída `world7`; log),
`assets/maps/world.json`, `assets/tiles/lemon-terrain.png`, `packages/shared/src/daynight.ts` (+ `daynight.test.ts`:
modos de luz da §2.2), `packages/shared/src/data/montadora.test.ts` (novo, lê o `world.json`, no molde do
`siderurgica.test.ts`: mapa 400×888, nada andável em y 717–745 nem fora de x 219–392 nas linhas ≥ 722, as 14 zonas com
`pz`/`faixa`/`regiao` e `faixa` contendo os comuns do índice do mundo, as 6 portas e saídas, cada spawn na zona e na
faixa, 1 spawn por chefe, caçável no level de cada porta e não 1 level abaixo, atalho, NPCs nos tiles da §2.5).

1. Guardar o `world.json` e o `lemon-terrain.png` publicados (pós-ciclo 19) em `%TEMP%\world-c19.json` e
   `%TEMP%\lemon-c19.png` antes de gerar.
2. Escrever o `expand7` (§2), a arte (§11) e as validações (§2.8); rodar `node tools/mapgen/generate.mjs` duas vezes
   (o `world.json` sai idêntico: determinismo) e `--debug` para olhar `_v/debug.png`.
3. `node tools/mapgen/diff-world.mjs %TEMP%\world-c19.json` → 0 tiles alterados, N/N objetos antigos, 400x722 → 400x888;
   `node tools/mapgen/diff-atlas.mjs %TEMP%\lemon-c19.png` → tiles antigos do atlas idênticos.
4. Olhar `assets/maps/preview.png` recortado na região (y 746..885) e mandar o recorte na revisão.

### Frente B — monstros, itens, sprites, refino/encantamento e memória do cliente

Arquivos: `packages/shared/src/data/monsters.ts` (+ `monsters.test.ts`), `packages/shared/src/data/items.ts`
(+ `items.test.ts`), `packages/shared/src/data/refine.ts` (+ `refine.test.ts`), `packages/shared/src/data/imbuement.ts`
(+ `imbuement.test.ts`), `packages/server/src/systems/refine.ts` e a compra de encantamento em
`packages/server/src/systems/npcs.ts` (+ testes de servidor deles), `packages/client/src/ui/refine/refineLogic.ts`,
`ui/refine/RefineTab.tsx`, `ui/imbue/ImbuementTab.tsx`, `tools/monsters/recolor.mjs`, `assets/monsters/Mt*.png`
(+ prévias), `packages/client/src/game/worldMap.ts`, `tools/mapmem.mjs` (novo, medição).

1. 15 monstros (§3), 10 materiais, 3 troféus, 7 peças, 4 anéis e o parâmetro `vocations` do `trinket` (§4).
2. Recolors (§3.5, cinco) e conferência visual das prévias 8×.
3. Rubi, Aço Líquido e Cromo no refino e no encantamento (§4.6).
4. Testes (§13.1). `arena.test.ts` e `vocationBalance.test.ts` passam **sem mudar meta** (prova de que o
   `balanceKit` não escolheu peça nova).
5. Medição de memória/carga do cliente (§13.4) com um `world.json` de 400×888 sintético (o atual com linhas de vazio
   acrescentadas: o custo é por célula, não pelo conteúdo), para não esperar a frente A; mitigação se passar do limite
   (se o ciclo 19 já a aplicou, só medir).

### Frente C — missões, NPCs, evento, conquistas, viagem e alavanca

Arquivos: `packages/shared/src/data/npcs.ts` (+ `npcs.test.ts`), `packages/shared/src/data/quests.ts`
(+ `quests.test.ts`), `packages/shared/src/data/questWorld.ts`, `packages/server/src/systems/questWorld.ts`
(+ `questWorld.test.ts`), `packages/server/src/persistence/types.ts` (`leverDays`), `packages/server/src/rooms/WorldRoom.ts`
(só a ligação `getLeverDay/setLeverDay`), `packages/shared/src/data/events.ts` (+ `events.test.ts`),
`packages/shared/src/data/achievements.ts` (+ teste do servidor se travar contagem), `packages/shared/src/worldIndex.test.ts`
(caso de rota), `e2e/montadora.spec.ts` (novo).

1. NPCs e placas (§7), viagens (§2.4), loja.
2. Missões (§6), faixa 114 do Quadro (§10).
3. Alavanca, baús, `startText`, `leverDays` com compatibilidade (§5).
4. Evento (§8) e conquistas/títulos (§9).
5. E2E (§13.2).

Fechamento do ciclo (depois da revisão cruzada): `/fechar-ciclo` — `CHANGELOG.md`, `docs/GAME_ROADMAP.md`,
`docs/TEST_PLAN.md` (com os números de memória/carga), `shared/src/data/news.ts` (Novidades: região nova, cegonha na Vila,
Caminhão de Bobinas ligando as duas regiões, evento de quarta 13h, Rubi/Aço Líquido/Cromo no refino +4/+5 e no
encantamento III, e aviso de que o percentual explorado de todo mundo cai), README se mudar comando.

---

## 13. Testes e medição

### 13.1 Unitários

- `monsters.test.ts`: todo monstro dos spawns existe (já há); sprites/frames (já há); listas travadas de fogo, gelo e
  morto-vivo com os ids novos; teste novo "Montadora: 12 comuns + 3 chefes, chefes com respawn ≥ 2 h, bando da
  lagartixa, Robô Pintor cura aliados primeiro".
- `items.test.ts`: teste novo "Montadora: cada peça abaixo do melhor do slot no level dela, por vocação" (calculado,
  não fixo: `max(value)` dos itens do slot usáveis pela vocação no level, sem as peças da Montadora — as da Siderúrgica
  entram na referência, como o teste de lá faz com as daqui —, maior que o valor da peça); "anéis do Crash Test: um por
  vocação, lv 95, abaixo do `ring_demodras`, só saem dos baús (nenhum monstro, nenhuma loja)"; materiais em ordem de
  valor (18 → 3800); troféus `quest` valor 0 e descrição sem "abre"; `REGION_FINAL_BOSSES` já existe (§4.5): o
  Protótipo passa a ter 4 entradas de tier 8 dentro de 0,05–0,08.
- `refine.test.ts` / `imbuement.test.ts` e os testes de servidor de refino e encantamento: §4.6.
- `server/src/systems/quests.test.ts` ("XP de recompensa entre ~0,3 e 2,5 levels no level mínimo"): conferido por script
  para as 14 missões (de 1,32 a 2,37 levels; a mais alta é O Protótipo, 190 mil no lv 112, teto 200,5 mil).
- `npcs.test.ts`: destinos andáveis (já há); "cegonha na Vila em (91,100) leva à Portaria; Dito tem a Montadora; a
  Supervisora só leva para fora; chegada (232,758) dentro da PZ".
- `quests.test.ts`: "cada região cobre 10–112 sem buraco > 15 levels" (missões dos NPCs `mt_*`); "faixas antigas do
  Quadro congeladas" (`slice(0, 11)` contra snapshot); a faixa 114 entra no teste existente de caçável.
- `questWorld.test.ts` (servidor): alavanca `crash_test` no mapa com placas/destinos/posições na sala (o teste existente
  cobre as duas pela ordem de `QUEST_LEVERS`); "Crash Test com 2 jogadores solta 3 (dublê, montador, dublê)";
  "Aniquilação e Crash Test no mesmo dia: dias separados por alavanca"; "save antigo com `leverDay` conta como
  Aniquilação"; texto de início por alavanca.
- `events.test.ts`: §8.
- `daynight.test.ts`: modos de luz das zonas novas.
- `worldIndex.test.ts`: `nextHop` da Vila para o Pátio de Carros passa pela cegonha.
- Suítes inteiras: `npm run typecheck` e `npm test` verdes; `arena.test.ts` sem mudar meta.

### 13.2 E2E (`e2e/montadora.spec.ts`, `--repeat-each=3`, 1 worker, nada pesado junto)

1. Cegonha da Vila (91,100) leva à Portaria (232,758) e o Motorista traz de volta à Vila.
2. Cocheiro Dito leva da Oficina à Portaria.
3. Atalho: lv 9 bate no portal (83,332) e volta; lv 10 passa e chega em (222,774); o portão de serviço (219,776) devolve
   a (83,331).
4. Deslogar na Portaria volta na Portaria.
5. Porta da Estamparia: lv 24 bate em (320,766); lv 25 entra (323,766); a saída (320,769) devolve ao Pátio (318,769).
6. Calota Rolante aparece no Pátio de Carros (`monsters()` perto de (261,756)).
7. Crash Test: dois jogadores lv 95 nas placas (348,835) e (350,835), alavanca (355,835) → os dois nos destinos
   (224,854)/(224,856) e 3 monstros na sala; a porta (261,858) leva ao Boxe dos Troféus e o baú `mt_crash_knight` dá o
   anel (com `/tp` e `/level`, sem matar ninguém).
8. Caminhão de Bobinas: Portaria → Estação do Minério → Portaria.
9. Sala de Descanso: a Supervisora abre o depósito e vende a viagem de volta.

Antes de culpar o código por falha: olhar `[tick] … máx` no log do servidor E2E.

### 13.3 Mapa e carga

- `node tools/mapgen/diff-world.mjs %TEMP%\world-c19.json` = 0 tiles alterados, N/N objetos antigos;
  `node tools/mapgen/diff-atlas.mjs %TEMP%\lemon-c19.png` sem tile antigo mudado.
- `tools/loadtest.mjs` com 10 bots dentro da região (`--tp 262,800 --level 60 --auto --secs 300 --max-p95 300
  --max-tick 25`, Funilaria) e de novo no Pátio (`--tp 270,770 --level 15`): anotar `[tick] … máx` e p95 no
  `TEST_PLAN.md`.

### 13.4 Memória e tempo de carga do cliente (risco maior do ciclo)

Script `tools/mapmem.mjs` (Playwright, Chromium com `--enable-precise-memory-info --js-flags=--expose-gc`), contra o
servidor E2E isolado (`E2E_PORT=2870 E2E_SKIP_BUILD=1 node e2e/start-server.mjs`, nunca `data/`):

1. Entra com uma conta nova, mede o tempo do `goto` até `window.__lq.me()` ter tile (mapa montado e ator na tela).
2. `window.gc()` e lê `performance.memory.usedJSHeapSize`.
3. 3 rodadas por mapa, mediana, para: 400×560 (hoje), 400×722 (pós-ciclo 19) e 400×888 (pós-ciclo 20 ou sintético).

Regra de decisão (os mesmos limites do `siderurgica.md` §7.4, sempre contra a `main` de 400×560): se o 400×888 passar
de **+35%** de heap ou **+30%** de tempo de carga, aplicar a mitigação **antes** de publicar a Montadora e medir de novo.
Se o ciclo 19 já a aplicou (ele passa pelo mesmo limite com 400×722), aqui só se mede e registra. Conferir também o
tempo de montar o índice do mundo impresso pelo `worldIndex.test.ts` (`[worldIndex] 400×888 em … ms`, limite 1.500 ms).
A mitigação:

- Em `buildWorldMap` (`packages/client/src/game/worldMap.ts`): montar o tilemap do Phaser a partir de uma cópia do JSON
  **sem a camada `collision`** (registrar no `scene.cache.tilemap` uma segunda chave com `{ format: TILED_JSON, data:
  { ...tiled, layers: tiled.layers.filter((l) => l.name !== "collision") } }` e chamar `make.tilemap` com ela). O
  cliente já tem a grade própria (`CollisionGrid.fromTiled(tiled)` continua lendo o JSON inteiro).
- E `insertNull: true` no `make.tilemap`: célula vazia vira `null` em vez de um objeto `Tile` (as camadas `deco` e
  `above` são quase vazias). O cliente não usa `getTileAt/putTileAt` (conferido por grep), então nada quebra.

Números (antes/depois) vão para o `TEST_PLAN.md`. O `world.json` deve ficar perto de ~135 KB gzip.

---

## 14. Riscos

- Memória do cliente (+59% de células em relação a hoje): §13.4.
- Tick do servidor com ~1.020 monstros no mapa: §13.3; se o `máx` subir, baixar `count` dos spawns do Pátio primeiro
  (são os mais numerosos).
- Custo novo no refino +4/+5 e no encantamento III (§4.6): muda um sistema que o topo já usa; aviso nas Novidades e no
  `/anuncio` antes do deploy.
- Percentual explorado de todos cai (a conquista Cartógrafo fica mais longe): aviso nas Novidades.
- Três chefes novos no mesmo mapa da Siderúrgica: o evento de quarta 13h só convoca o Protótipo.
- Arte: sai inteira na entrega (tile publicado nunca muda depois).

---

## 15. Revisão de texto (antes da PR)

`git grep -n -i -E "câmera|camera|sensor|clp|iot|edgesm|em-1000|<marcas e lugares reais>" -- docs/regioes packages/shared/src/data tools/mapgen e2e`
sem nenhum resultado nas linhas novas. Nenhuma marca, montadora, fabricante, modelo de carro, lugar real, empresa,
cliente, projeto ou código interno em nome, fala, descrição, zona ou arte. Nomes de NPC só por papel (sem nome próprio
de pessoa).
