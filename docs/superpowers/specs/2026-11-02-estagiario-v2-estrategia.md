# Estagiário v2 — análise e estratégia de otimização (todas as vocações)

Data: 2026-11-02. Pedido do dono: "deixar o bot bem flexível, bom e otimizado para o jogo, sem perder a graça; os buffs
de correr não saem enquanto tem outro buff; otimizar para todas as classes". Este documento é a **análise** (o que o bot
faz hoje, medido) e a **estratégia** (o que mudar, em que ordem, e o que depende de decisão do dono). Nada aqui foi
implementado ainda. Spec original: [2026-11-01-estagiario-design.md](2026-11-01-estagiario-design.md).

## 1. Como foi medido

Simulação com os **sistemas reais** do servidor (`SpellSystem`, `ConditionSystem`, `CombatSystem`, `FightModeSystem`,
`MovementSystem`, IA dos monstros, regeneração do `shared`) e o `EstagiarioSystem` com Cura + Ataque + Buffs ligados,
configuração **recomendada atual** de cada vocação, skills de `skillEstimate`, sem equipamento. Quatro monstros corpo a
corpo renascendo a 9 tiles, 240 s por cenário, nos levels 20 (Esqueleto), 40 (Orc Guerreiro) e 60 (Ciclope). Poções:
a melhor do level, infinitas (cenário A) ou **sem poção de mana** (B), que é o caso de muito jogador. Mediu-se o que foi
conjurado, mana gasta por categoria, poções bebidas, abates, vida mínima e o tempo com cada buff ativo. O arnês ficou
fora do repositório (`_sim_estagiario.test.ts`, guardado no scratchpad da sessão); a fase 1 abaixo o transforma em teste
de balanço com asserções.

## 2. O que o bot faz hoje (achados)

### 2.1 A causa do "Pés Ligeiros não sai enquanto tem outro buff"

`escolherBuff` (shared/estagiario.ts) pula qualquer buff quando a mana está abaixo da **reserva de mana do ataque**
(`reservaMana`, 20–30 %), com uma única exceção: o Escudo de Mana. Em caça de verdade a mana vive abaixo da reserva
(cenário B: 86–97 % do tempo em todas as vocações), então o Escudo de Mana segue sendo reconjurado e o Pés Ligeiros
(e Pele de Ferro, Fúria) nunca: é exatamente o sintoma "o outro buff está lá e o de correr não sai".

| Cenário B (sem poção de mana) | Escudo de Mana ativo | Pés Ligeiros ativo |
|---|---|---|
| feiticeiro lv 20 / 40 / 60 | 59 % / 67 % / 67 % | 13 % / 13 % / 13 % |
| druida lv 20 / 40 / 60 | 60 % / 67 % / 67 % | 13 % / 13 % / 25 % |
| cavaleiro lv 60 (Pele de Ferro 4 %, Fúria 4 %) | — | 13 % |

O Pés Ligeiros custa 20 de mana e nem entra na recarga global (`global: false`): não há motivo para a reserva do
ataque segurá-lo. A reserva existe para a **cura** não ficar sem mana por causa do **ataque**; buff não é ataque.

### 2.2 A cura engole a mana (e a recarga global) — pior no cavaleiro e no paladino

A regra recomendada do cavaleiro é `[poção <35, Limpar Feridas <55, Cura <70, poção de mana <25]`. Como "Cura" tem o
limiar **maior** que "Limpar Feridas", entre 55 % e 70 % de vida só a Cura sai — e a Cura do cavaleiro é a pior magia
do jogo em mana: 70 de mana (28 % da mana de um lv 40) por ~11 % da vida, contra 40 de mana por 15 % do Limpar Feridas.

| Cura, lv 40 | mana | cura | vida por mana |
|---|---|---|---|
| cavaleiro: Cura | 70 | 81 (11 %) | 1,2 |
| cavaleiro: Limpar Feridas | 40 | 110 (15 %) | 2,8 |
| paladino: Cura | 70 | 105 (16 %) | 1,5 |
| paladino: Cura Divina | 60 | 120 (18 %) | 2,0 |
| magos: Cura | 70 | 138 (36 %) | 2,0 |

Resultado (cenário A, poções infinitas): o cavaleiro lv 40 gasta **10.270** de mana em cura e **1.195** em ataque, bebe
**51 poções de mana** em 4 min e mata 24 orcs; o paladino lv 20 conjura a Cura **167 vezes** (8.350 de mana) e as
flechas 68. Como toda cura ocupa a recarga global de 1 s e a Cura recarrega em 1 s, enquanto a vida está abaixo do
limiar o ataque **nunca** acha a recarga livre: o dano vira só o ataque automático. O mesmo vale para o paladino
(Cura 70 > Cura Divina 60).

### 2.3 Sem poção de mana o bot vira "poção de vida + ataque básico"

Cenário B: mana média 4–16 % em todas as vocações, abates caem para 6–13 em 4 min (contra 24–49 com poção), nenhum buff
além do Escudo de Mana. A cura é avaliada antes de tudo e consome cada ponto de mana que regenera; a reserva bloqueia
ataque e buffs. O jogador sem poção de mana hoje tem um bot que só bebe poção de vida.

### 2.4 Mana e recarga desperdiçadas em conjurações que não podem sair

`ready()` não olha alcance nem linha de visão. O resolvedor escolhe a magia "pronta" e a conjuração falha em silêncio:
Golpe Brutal (alcance 1) e Investida (alcance 4) escolhidos com o alvo longe (até 58 falhas de alcance em 4 min), Lasca
de Gelo/Bola de Fogo (alcance 7) no alvo a 8–12 tiles (até 49 falhas). Nessas vezes a rotação **não tenta a regra
seguinte** no mesmo tick (uma Investida sairia no lugar do Golpe Brutal).

### 2.5 Golpe Giratório nunca sai com um bicho só

`minBichosArea` pede 2 bichos para toda área de raio < 3. O Golpe Giratório custa 8 de mana e dá 2,2× o ataque básico:
contra um monstro é a melhor magia do cavaleiro e hoje fica parada (11 usos em 4 min com 4 monstros em volta; 51 quando
liberado para 1 bicho — cenário D).

### 2.6 Poção sempre a maior

`pickQuickPotion` escolhe a poção que mais recupera. Para a cura por % isso é certo; para a mana do cavaleiro (245 de mana
no lv 40) a Poção de Mana Grande (900) joga fora dois terços. O bot deveria beber a **menor que cobre a falta**.

### 2.7 Quem ataca à distância luta colado

`FightModeSystem` gruda no alvo "qualquer que seja a vocação" (decisão do jogo para o jogador). Com a perseguição
forçada da rota, paladino, feiticeiro e druida param ao lado de 3–4 monstros e apanham como cavaleiros sem a vida de um:
vida mínima 16–30 % (paladino lv 60: Cura Divina 158 vezes em 4 min só para ficar vivo). O jogador faz o que o bot não
faz: fica a 2–4 tiles e anda. O jogador anda em 242 ms por tile no lv 40 (186 ms com Pés Ligeiros); o Orc Guerreiro
em 320 ms e o Esqueleto em 400 ms: manter distância é possível contra quase tudo que anda.

### 2.8 Capacidades da vocação que o bot ignora

- Druida/Fada: Invocar Lobo / Amiguinha Borboleta (lv 20, escala com o level) nunca é conjurado: `ehBuff` exclui invocação.
- Comida: ninguém come (regen de vida e mana "de graça" por 20 min).
- Cura em Grupo / Cantiga de Ninar só curam o próprio bot (a regra olha só a vida dele).
- Controle (Raiz, Flecha Paralisante) entra como "ataque" por ter dano; Provocar não entra em lugar nenhum.

### 2.9 O que está certo e fica como está

Busca de alvo a 12 tiles com linha de visão e "sempre o mais perto" (decisão do dono); onda virada para o alvo; a
contagem de bichos por forma (em volta, no alvo, na onda); poção que não dá para beber não trava a cura; pausas,
rota, portais, turno e alarmes (não medidos aqui, sem sinal de problema). A ordem cura → buff → ataque num tick é
correta: o que está errado é a **economia** (quem pode gastar o quê), não a ordem.

## 3. Estratégia

Princípio: **o bot joga como um colega bom jogaria, não melhor** ("sem perder a graça"). Ganhos vêm de parar de
desperdiçar (mana, recarga, poção) e de fazer o que o jogador faz à mão (buff, distância, invocação, comer), não de
rotações sobre-humanas. Cada regra nova continua visível e editável na janela; "Usar recomendado" de cada aba entrega
um perfil bom por vocação.

### Fase 1 — economia de mana e recomendações (bugs; sem UI nova; rende mais que tudo o resto)

1. **Buff não respeita a reserva do ataque.** `escolherBuff` passa a exigir só a mana da própria magia e a "mana ≥ X %"
   opcional da regra. (A ideia inicial, "sobra para uma cura", foi medida e descartada: sem poção de mana cavaleiro e
   paladino vivem com a mana no chão e o Pés Ligeiros voltava a ficar ativo 13 % do tempo; os buffs custam uma fração da
   regeneração.) Fecha o pedido do dono.
2. **Recomendações de cura por vocação** (`curaRecomendada`):
   - cavaleiro: `poção <35 · Limpar Feridas <60 · Cura <60 · poção de mana <25` (a Cura só sai antes do lv 15, quando
     o Limpar Feridas está trancado pelo level — mesmo limiar, nunca por cima);
   - paladino: `poção <35 · Cura Divina <60 · Cura <60 · poção de mana <30` (idem antes do lv 35);
   - feiticeiro/druida/fada: `poção <35 · Cura <55 · poção de mana <35`.
   Medido (cenário D, poções infinitas): cavaleiro lv 40 de 24 → **40 abates** e 51 → **23 poções de mana**; paladino
   lv 40 25 → **45**; cavaleiro lv 60 16 → **30** (38 → 16 poções); magos iguais ou um pouco melhores. Vida mínima
   igual (30 %) ou poucos pontos abaixo.
3. **Golpe Giratório com 1 bicho** no recomendado do cavaleiro (`minBichosArea`: área de raio 1 e barata = 1).
4. **Resolvedor ciente de alcance e visão**: magia de alvo/área-no-alvo só conta como pronta com o alvo a `range` e
   com linha de visão (reusa `cheb` + `monsters.los`); a rotação segue para a regra seguinte no mesmo tick. Zera as
   falhas de alcance de 2.4 e dá ao cavaleiro a Investida quando o Golpe Brutal não alcança.
5. **Poção certa**: `pickPotionFor(falta)` no `shared/itemRules.ts` — a menor poção que cobre o que falta (ou a maior,
   se nenhuma cobre); o bot usa esta e Q/E seguem como estão.
6. **Teste de balanço do Estagiário** (`server/systems/estagiarioBalance.test.ts`, a partir do arnês da análise):
   por vocação e level, com a config recomendada, asserções do tipo "mana em cura ≤ 1,5× mana em ataque (cav/pal)",
   "Pés Ligeiros ativo ≥ 90 % do tempo com poção de mana e ≥ 60 % sem", "≤ N poções de mana por 4 min", "0 falhas de
   alcance". Metas de balanço viram asserções (convenção do projeto).
7. Novidades/README: "clique Usar recomendado nas abas Cura e Ataque" (quem já salvou configuração própria mantém as
   regras antigas; quem nunca mexeu recebe as novas sozinho, porque só o que difere do padrão é gravado).

### Fase 2 — flexibilidade na janela (regras mais ricas, sem mudar o jeito de jogar)

8. **Regra de ataque**: campos opcionais `manaMin` (só conjura com mana ≥ X %, 0 = a reserva geral; "Inferno só com
   mana acima de 60 %") e `vidaAlvoMin` (não gasta a magia grande num bicho com menos de X % de vida).
9. **Regra de buff**: `quando: sempre | em combate | fora de combate` (hoje é só o "só em combate") e `manaMin`.
   "Em combate" passa a ser a condição `combat` do jogador (deu/levou dano há 6 s), não "tem alvo": o Escudo de Mana
   sobe quando apanha, não só quando mira.
10. **Invocação como regra** (druida/fada): "manter invocado · em combate / sempre"; conjura quando `summons.ownedBy`
    está vazio e a magia está pronta. Entra na aba Buffs como categoria "Invocação" (`ehBuff` ganha a irmã `ehInvocacao`).
11. **Comer sozinho** (aba Cura, interruptor, padrão ligado): quando o "alimentado" acaba (ou faltam < 1 min) e há comida
    na mochila, come (uma por vez; `InventorySystem` ganha `eatAny(p, { silent })`; o alarme de poção não muda).
12. **Cura em grupo** (druida/fada): regra `quando: "aliado"` — aliado do grupo a até 4 tiles abaixo de X % → Cura em
    Grupo/Cantiga de Ninar. Só vale em party (`isAlly`), como a magia já faz.
13. **Motivos novos** no cabeçalho: "guardando mana para a cura", "alvo fora do alcance", "mantendo distância".

### Fase 3 — comportamento de luta (muda como o personagem se move; itens 14 e 15 decididos pelo dono em 2026-11-02, item 16 🧭)

14. **Manter distância** (paladino, feiticeiro, druida, fada), opção na aba Ataque: `distância: colado | 2 | 3 | 4`.
    Com um monstro adjacente e a opção ligada, o bot dá um passo para um tile livre que mantém o alvo no alcance e na
    linha de visão (o ataque automático e as magias continuam saindo andando, como hoje); contra monstro à distância
    não recua. Só com a rota ou o Ataque ligados pelo jogador; nunca na PZ; respeita a pausa manual. É o que o jogador
    faz à mão e o maior ganho de sobrevivência para três das quatro vocações. **Decidido (dono, 2026-11-02): fazer;
    ligado por padrão a 3 tiles para paladino, feiticeiro, druida e fada; o cavaleiro não vê a opção.** Limites
    combinados: só reage quando um monstro corpo a corpo encosta (um passo por vez, sem "dança" preventiva), não recua
    de monstro que ataca à distância, nunca na PZ nem na pausa manual, e no máximo ~6 tiles de onde a luta começou
    (a rota retoma pelo ponto mais próximo ao matar).
15. **Perseguir só até o alcance** (sem recuar): mesmo sem a opção 14, o bot à distância para de andar ao entrar no
    alcance da arma com visão, em vez de ir até o lado do monstro (`FightModeSystem.tick` ganha um modo "até o alcance"
    só para a perseguição forçada; o jogador jogando à mão segue "colado", decisão existente). **Decidido (dono,
    2026-11-02): fazer; é pré-requisito do item 14.**
16. **Prioridade de alvo**, opção na aba Ataque: `mais perto (padrão) | menos vida | quem me ataca`. 🧭 o dono decidiu
    "sempre o mais perto" para o F8 em 2026-11-01; aqui é só do bot e opcional.

### Fora desta estratégia (decisões já tomadas)

Reabastecer/vender/depositar sozinho, rendimento menor para o bot e arte própria (ES-7 🧭); turno/crachá para Cura,
Ataque e Buffs sem rota (ES-10 decidido). Nada de "rotação perfeita": nenhuma regra usa informação que o jogador não
vê na tela.

## 4. Perfis recomendados por vocação (resultado esperado das fases 1–2)

Perfis em vigor depois da afinação da seção 8 (2026-11-02, segunda rodada):

| | Cura | Ataque (bichos/raio) | Buffs | Distância |
|---|---|---|---|---|
| Cavaleiro | **poção <50** · Limpar Feridas <35 · Cura <35 · mana <25 | Terremoto 2/r3 · Fúria Giratória 1/r2 · Giro Feroz 1/r1 · Golpe Giratório 1/r1 · Investida 1 · Golpe no alvo 1 | Pés Ligeiros sempre · Pele de Ferro em combate · Fúria em combate | colado |
| Paladino | **poção <60** · Cura Divina <35 · Cura <35 · mana <30 | Chuva de Estrelas 2/r3 · Julgamento Divino 1/r2 · Flecha Explosiva 1/r1 · Onda Sagrada 2/r3 · Chuva de Flechas 1/r2 · Flecha no alvo 1 | Pés Ligeiros sempre | 3 |
| Feiticeiro | **poção <50** · Cura <55 · mana <35 | Tempestade Elétrica 2/r4 · Onda de Fogo 1/r4 · Inferno 2/r3 · Explosão de Fogo 1/r2 · Onda de Energia 1/r4 · Ataque no alvo 1 | **Escudo de Mana sempre** · Pés Ligeiros sempre | 3 |
| Druida / Fada | **poção <50** · Cura <55 · mana <35 | Tempestade de Terra 2/r4 · Onda de Gelo 1/r4 · Nevasca 2/r3 · Chuva de Gelo 1/r2 · Ataque no alvo 1 (a Fada com as magias-espelho) | **Escudo de Mana sempre** · Pés Ligeiros sempre · Lobo/Borboleta em combate | 3 |

Reserva de mana: cavaleiro 20 %, paladino 25 %, magos 30 % (iguais a antes; a reserva é só do ataque).

## 5. Validação

- Unitários: `shared/estagiario.test.ts` (buff e reserva, recomendações, `pickPotionFor`, resolvedor com alcance),
  `server/systems/estagiario.test.ts` (invocação, comer, distância, prioridade), `estagiarioBalance.test.ts` (item 6).
- `npm run typecheck` + suíte inteira. E2E (`e2e/estagiario.spec.ts`) só se mudar o fluxo da janela, no CI.
- Fechar o ciclo: `CHANGELOG.md`, `docs/GAME_ROADMAP.md` (ES-12), `docs/TEST_PLAN.md` (números do teste de balanço),
  `shared/src/data/news.ts`, `README.md` (opções novas da janela).

## 6. Resultado da implementação (2026-11-02, fases 1–3; prioridade de alvo segue 🧭)

Medido por `server/systems/estagiarioBalance.test.ts` (sistemas reais, 4 monstros da faixa num anel, 4 min, semente
fixa; "antes" = a configuração recomendada de 2026-11-01, colada):

| Cenário (com poção de mana) | Abates antes → v2 | Poções de mana antes → v2 | Mana em cura antes → v2 |
|---|---|---|---|
| cavaleiro lv 20 / 40 / 60 | 27→39 / 25→44 / 16→29 | 59→31 / 51→28 / 36→20 | 7200→3000 / 10260→4520 / 10740→4760 |
| paladino lv 20 / 40 / 60 | 46→44 / 35→42 / 18→32 | 22→21 / 26→16 / 15→10 | 3250→3550 / 10500→5400 / 10580→6360 |
| feiticeiro lv 20 / 40 / 60 | 48→39 / 49→37 / 36→34 | 27→20 / 21→12 / 23→17 | 3300→1750 / 5670→1960 / 7140→3850 |
| druida lv 20 / 40 / 60 | 45→43 / 30→48 / 36→43 | 18→12 / 14→13 / 20→12 | 2600→1300 / 4970→3220 / 5950→1820 |

Pés Ligeiros ativo 100 % do tempo com poção de mana e 95–100 % sem (antes: 13 %). Zero conjurações falhas por alcance.
Ninguém morre com poção de mana. Os magos em bando de 4 matam um pouco menos mantendo distância (recuar espalha o
bando e as áreas pegam menos), mas tomam metade do dano; contra 1–2 monstros matam o mesmo ou mais. No lv 20 o
paladino já ia bem colado (os esqueletos são lentos): ali a distância não muda nada. Sem poção de mana os magos
continuam quase parados (6–12 abates): são a mana, não o bot. Cada luta isolada é caótica (um passo diferente muda a
ordem em que o bando chega); o teste compara as somas dos três levels por vocação, que são estáveis.

Desvios do plano: o item 1 ficou sem "sobra para uma cura" (ver fase 1); a origem do recuo é a da **cadeia** de lutas
(lutas emendadas em até 3 s contam como uma), senão quem mantém distância ia parar a 20 tiles da rota; os motivos
novos são "mantendo distância", "alvo fora do alcance" e "sem mana para o buff". Depois da entrega o dono viu "um delay
para seguir o bicho na primeira vez que o vê": sem alvo a busca passou a cada 100 ms (era 400) e, fora da rota, o alvo
novo retoma a perseguição assim que o jogador fica parado (todo Move/WalkTo pausa a perseguição por 1,5 s e o bot não
retomava para não cancelar a pausa).

## 8. Afinação por vocação (2026-11-02, segunda rodada)

Dono, depois do deploy da v2: "faz sentido usar a cura ao invés de pote com kina? O pote cura muito mais e a skill come
tempo de skills para atacar" e "antes de aplicar, faça essa análise para todas as classes e skills". Grid medido com o
`estagiarioSimKit.ts` (o simulador extraído do teste de balanço): por vocação, uma dimensão de cada vez a partir do
recomendado da v2 (8 curas, 9 ataques, 4–5 buffs, 4 distâncias), nos lv 20/40/60, duas sementes, contra 4 monstros da
faixa; depois as combinações vencedoras contra 4 e 2 monstros e sem poção de mana. Abates em 4 min, soma dos levels:

| Vocação | Dimensão | O que ganhou | Abates (v2 → afinado) |
|---|---|---|---|
| cavaleiro | cura | poção <50 primeiro, Limpar Feridas/Cura <35 de emergência (a poção cura 61 % de uma vez e não ocupa a recarga global; a mana vai para as magias) | 112 → 156 |
| cavaleiro | ataque | Giro Feroz e Fúria Giratória com 1 bicho (Terremoto segue com 2) | +5 (bando) / +25 (2 monstros) |
| cavaleiro | buffs | mantidos: sem buffs rende igual em bando, mas vida mínima 23 % em vez de 37 % | — |
| paladino | cura | poção <60 (mesmos abates da <50, vida mínima 44–51 % em vez de 25–39 %), Cura Divina/Cura <35 | 115 → 151 |
| paladino | distância | 3 fica (colado: +9 % em bando, −9 % com 2 monstros e o dobro de poções de vida; 4: −7 %) | — |
| feiticeiro | cura | poção <50 e Cura <55 (as duas: a Cura é 36 % da vida por 70 de mana) | 109 → 119 |
| feiticeiro | ataque | áreas de raio 1–2 e ondas com 1 bicho (Explosão de Fogo e ondas no alvo sozinho); raio 3+ com 2 | 119 → 133 (2 monstros: 92 → 131) |
| feiticeiro | buffs | Escudo de Mana sempre (em combate chegava depois do primeiro golpe): vida mínima 20 % em vez de 7 % no lv 40 | 109 → 116 |
| feiticeiro | distância | 3 fica (colado: +7 % em bando, −8 % com 2 monstros; empate) | — |
| druida | cura | poção <50 e Cura <55: abates iguais, vida mínima 24–39 % em vez de 2–22 % | — |
| druida | ataque / buffs | áreas 1 bicho e Escudo de Mana sempre; lobo em combate (sempre: −8 %, 90 de mana por minuto andando) | 132 → 140 (2 monstros: 94 → 134) |
| todas | reserva de mana | 10 não muda; 45 derruba 7–20 %: ficam 20/25/30 | — |
| todas | ordem | alvo primeiro, só alvo ou só área: −15 a −60 % (área e alvo único se completam) | — |

Resultado final (recomendado novo contra o recomendado de 2026-11-01, com o mesmo motor): cavaleiro 82 → 156 em bando
e 88 → 127 com 2 monstros; paladino 113 → 149 e 117 → 146; feiticeiro 134 → 135 e 109 → 126; druida 123 → 142 e
98 → 127. Sem poção de mana o cavaleiro vai de 52 para 79 e o paladino de 25 para 69; os magos seguem em ~20–30 (são a
mana). O preço é poção de vida: o cavaleiro lv 40 bebe 26 por 4 min em vez de 5 (e 16 de mana em vez de 52).

## 7. Riscos e cuidados

- **Configurações salvas** mantêm regras antigas (inclusive a Cura do cavaleiro a 70 %): avisar nas Novidades; não
  migrar à força (a configuração é do jogador).
- **Manter distância** mexe no movimento do personagem: tem de respeitar pausa manual, PZ, rota (não sair do caminho
  por mais que 1–2 tiles), monstros à distância (não adianta recuar) e tiles ocupados. Fica atrás de opção.
- **Comer sozinho** gasta comida do jogador: interruptor claro e alarme não muda.
- **Recarga global**: toda cura de 1 s continua ocupando a global; os limiares recomendados mais baixos resolvem o
  grosso, e o jogador ajusta o resto. Não inventar "cura prevista" nem fila de ações.
