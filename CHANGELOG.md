# Changelog

## [Não lançado] — 2026-10-24 · ajuste da Malha: nomes comuns e saídas

- Pedido do dono: **por enquanto, bichos e itens com nomes comuns**; NPCs, missões e locais continuam com os nomes
  reais do trabalho. 12 bichos (ciclos 10 e 11) e 28 itens renomeados (ex.: Escamação → Cobra Listrada, Trinca no Disco
  → Olho Sangrento, O Trem Que Nunca Encerra → Tirano da Serra, TIFF Bruto → Pergaminho Borrado, Marmita de Tampa
  Vermelha → Ensopado do Viajante), com descrições, gritos e habilidades de fantasia. **Nenhum id mudou**: saves,
  depots, chão, bestiário, conquistas e missões em andamento seguem iguais. Os títulos de missão ficam.
- **Saídas da Malha**: o trem de volta só existia na Estação Central, a oeste (a Malha tem 160 tiles). Agora o
  Maquinista (entrada do Túnel) e o novo **Agente da Parada** (linha principal, entre o Portal de Inspeção e a Oficina
  de Vagões) também levam à Vila ou à Estação. O Agente é o último objeto do mapa: `diff-world.mjs` deu 0 tiles
  alterados e 698/698 objetos antigos idênticos.

## [Não lançado] — 2026-10-24 · ciclo 11: Malha da Ferrovia e ClickUp dinâmico

Pedido do dono: mais contexto do trabalho, começando pelo ClickUp ao vivo e por uma região inteira do segmento
ferroviário, chegando de trem. Lore tirado dos repositórios do Gitea (Portal de Inspeção, Anomalia de Carga,
SmartTrain, sensor de trilho) com o disfarce de sempre: "a Ferrovia", sem lugares reais nem fabricantes.

**ClickUp no jogo** (`systems/clickup.ts`, `shared/workFilter.ts`; desligado sem `LEMONQUEST_CLICKUP_TOKEN`)
- Leitura a cada 5 min fora do tick (timer + fila consumida no `runSafe`), backoff até 30 min, estado em `kv`.
- **Chegou!**: compra que vira "pedidos entregues" é anunciada e solta uma Caixa de Encomenda na Estação ou no Pátio
  de Encomendas da Oficina (até 3 por hora). Na primeira leitura, o passado só é marcado como visto.
- **Sprints**: barra coletiva por projeto no Painel da Obra e no Quadro de Gestão à Vista; passar da média das 4
  semanas anteriores dispara a **Sprint Fechada** (XP ×1,25 por 1 h). O `EventSystem` ganhou uma camada de bônus que
  **soma** ao evento agendado em vez de substituí-lo (antes, o chefe do agendado não seria convocado).
- **Conquistas pessoais**: métrica `work_tasks` (1/10/50/200). Pedido do dono: o **próprio jogador** vincula, na aba
  "Na obra", colando o token pessoal do ClickUp; o servidor confere uma vez (`GET /user` e `/team`: membro do workspace
  e e-mail da Embeddo), grava só o id do usuário e **descarta o token** (nunca em banco, kv, log ou mensagem; teste).
  5 tentativas por 10 min. O `/vincular <personagem> <apelido|id>` do admin continua como alternativa.
- **Na obra**: até 10 tarefas abertas dos projetos ferroviários e da Oficina, com apelido do responsável.
- **Filtro de disfarce** endurecido pela revisão cruzada: normalização Unicode, separadores e letras soltas, cliente
  confidencial descartado em qualquer grafia (inclusive o título inteiro da compra), fabricantes viram "Fabricante",
  infraestrutura/RH/financeiro descartados, pessoas viram apelido ou "alguém". O token nunca aparece em log (teste).
- `docker-compose.yml` repassa o token do `.env`; `.env` entrou no `.gitignore` e no `.dockerignore`.

**Malha da Ferrovia** (`tools/mapgen/expansion4.mjs`, mapa 400×336 → 400×472)
- 160×110 tiles: Estação Central (PZ), Pátio de Manobra (feixe de 7 linhas, AMVs, 19 vagões), Portal de Inspeção
  (pórtico com 4 câmeras e 4 iluminadores, sensores de roda, abrigo do CLP), Oficina de Vagões, Via Permanente (ponte,
  passagem de nível) e Túnel da Serra. Trem nos Chefes da Estação (200 de ouro) e portal oculto Vila ↔ Estação, para
  quem desloga na Malha voltar lá. **0 tiles alterados, 623/623 objetos antigos idênticos**; arte de trilho desenhada
  no `lemon.mjs` com alocação adiada (o atlas só cresceu).
- Monstros com os defeitos reais do Portal (Trinca no Disco, Aro Fraturado, Calo, Escamação, nas cores do código),
  Frame Descartado, Iluminador Rebelde, Rato de Brita; mini-chefe Vagão Não Inspecionável; chefe **O Trem Que Nunca
  Encerra** com o evento Apito da Locomotiva (quarta 17h). 10 missões (lv 25–52), 14 itens, 9 NPCs, 10 conquistas.

**Correção de conteúdo do ciclo 10**: o NPC "EM-1000" da Oficina virou "Robô de Bancada" e perdeu a fala com a meta
de horas: o código e a métrica eram de um projeto do cliente confidencial.

## [Não lançado] — 2026-10-24 · loja: compra em lote

- Pedido do dono: comprar poções e outras coisas em quantidade. O servidor já aceitava até 100 por mensagem; faltava a
  interface. A linha da loja ganhou uma segunda linha com campo de quantidade digitável (Enter compra), −/+ (Shift ±10),
  atalho 10 e **Máx**, e o botão mostra "Comprar N". Vale também para itens não empilháveis; a encomenda semanal
  (tier 6–7) segue 1 por vez.
- A conta de espaço e de pilha foi para `shared/src/shop.ts` (`backpackRoom`, `shopBuyMax`, `maxStackOf`,
  `MAX_TRADE_COUNT`): o "Máx" do cliente e a validação do servidor usam a mesma regra. Testes: `shop.test.ts` e o E2E
  `e2e/shop.spec.ts` (compra 25 poções de uma vez, confere ouro e o Máx).

## [Não lançado] — 2026-10-23 · ciclo 10: o escritório entra no jogo (Oficina dos Engenhos)

O jogo foi feito para os colegas da Embeddo, mas não tinha nada do trabalho. Este ciclo traz o contexto por piada
interna e metáfora, sem trocar a identidade medieval. Regras do dono: pessoas só por apelido + papel (nunca nome
completo), clientes disfarçados (Ferrovia, Siderúrgica, Cervejaria…), um cliente confidencial fora de qualquer
referência, códigos internos de produto liberados, nada do chat privado. Plano e decisões no ROADMAP (Ciclo 10).

**Oficina dos Engenhos (zona nova, protegida)**
- Bairro de 30×22 tiles ao sul da Vila com War Room, Copa, Bancada e Pátio de Encomendas; entra-se pela porta no canto
  nordeste da paliçada da Vila ou pela carroça do Bastião (100 de ouro, grátis até o lv 8). Interior sempre iluminado.
- O mapa cresceu **para baixo** (400×288 → 400×336) em `tools/mapgen/expansion3.mjs`: o array antigo vira prefixo do
  novo, então **0 tiles alterados** e os 592 objetos antigos idênticos (prova: `tools/mapgen/diff-world.mjs`, novo). A
  arte usa só tilesets já carregados (um tileset novo deslocaria os gids do TilesetLemon). Acesso por portal porque o
  servidor só aceita login em tile alcançável a pé a partir do spawn.
- 14 NPCs: Pedrão (visão), Julião (embarcados, loja), Bianca (logística), Luan (cubo mágico), Iago (cofre de senhas),
  Gabriel (Rifa do Sextou, cassino), Guilherme o Boss (depósito + bênção), Alexandre do Quântico, Cocheiro Dito e as
  "placas" Geladeira (marmita, café), Quadro de Gestão à Vista, Banheiro Quântico, Robô de Bancada e Troféu do Demoday.

**Conteúdo**
- 6 missões: Pesquisa de Clima (Capitão, lv 3) e a cadeia da Oficina (lv 5–22: Chegou!, git caiu?, Bombonas
  Fugitivas, Rotaciona a Senha, Frames Descartados) com 3 equipamentos de recompensa.
- 3 monstros reskin em áreas existentes: Rato do Datacenter (Floresta), Bombona Fugitiva (passiva, foge a 60%) e Gosma
  de Escória (bando, Pântano e Cavernas). Valores dos equipamentos novos abaixo do vizinho do slot para não mexer no
  simulador do Coliseu (`arena.test.ts` escolhe por valor).
- 12 conquistas e 6 títulos com métricas existentes; eventos **Sextou!** (sex 17h, XP ×1,5 e loot +25%) e **Reunião
  Geral** (seg 9h, loot +50%); falas novas em 9 NPCs antigos; 5 dicas de carregamento e 3 de morte; Novidades.

**Testes**
- `questWorld.test.ts`: todo passo `explore` precisa casar com uma zona do mapa real (antes não era validado).
- E2E novo `e2e/oficina.spec.ts` (portal ida/volta, Geladeira, carroça, rato na Floresta). `quests.spec.ts` conclui a
  Pesquisa de Clima antes de testar o marcador do Capitão (com duas missões ele mostra "!", corretamente).

## [Não lançado] — 2026-10-22 · ciclo 9: auditoria completa, CI verde de novo e telemetria de progressão

Auditoria de 7 agentes com baseline executada: relatórios em `docs/audit/2026-10-22/` (repositório, gameplay, limpeza
dos arquivos do Claude, roadmap de evolução, baseline de validação). Decisões do dono e status em
`docs/GAME_ROADMAP.md` (Ciclo 9); achados `#50–#65` em `docs/GAME_AUDIT.md`.

**Fase 0 — estabilização**
- **CI verde** (#50): o helper E2E `teleport()` agora espera o ator no tile (não só o estado do servidor) e `settled()`
  exige a câmera centrada no jogador (`PixelCamera.isCenteredOn`). Era a corrida que derrubava `fishing.spec` no CI
  (clique fora da tela) e deixava `look`, `spells` e `quests` instáveis. `look.spec` fecha o cartão com Esc e usa um
  tile sem item; `quests.spec` repete o Esc do diário; `spells.spec` evita mirar ratos.
- CI: cache dos navegadores do Playwright, `timeout-minutes: 45` no E2E, `tools/smoke.mjs` contra o bundle (job de
  testes) e contra o container (job Docker).
- **Telemetria de progressão** (`systems/telemetry.ts`): tempo jogado, mortes e ouro ganho/gasto por level ficam em
  `CharacterData.play`; o `/status` ganhou uma linha "Progressão medida" por faixa de level (h/level, mortes/h, ouro/h)
  e a duração do autosave (também no log `[tick]`). É o dado para recalibrar o ciclo 8 com jogo real.
- `Encoder.BUFFER_SIZE` do `@colyseus/schema` em 64 KB: some o aviso "buffer overflow" a cada login (#58).
- `tools/loadtest.mjs`: nomes fixos (`--print-admins` para o `E2E_ADMINS`), `--tp x,y`, `--level N`, `--auto`
  (ataque automático), `--max-p95`/`--max-tick` com saída 1 e leitura do `/status` no fim.
- Docs: `CLAUDE.md` na raiz e `.claude/settings.json` versionados; README com os 10 comandos de admin, teclas de janela
  e `npm run smoke`; ROADMAP reorganizado (ciclo 9 no topo, ciclos 1–6 no histórico) e contradições corrigidas
  (`proposta/todas`, cassino, propostas já decididas); TEST_PLAN com o ciclo 9; AUDIT com números reais (39 magias,
  ~49 mil linhas, 774 testes) e a hipótese dos "fantasmas" refutada.
- Limpeza: `tools/gen-placeholder-map.mjs` apagado (sem referências; sobrescreveria o mapa), 11 branches locais já
  mescladas apagadas.

**Fase 1 — correções (servidor)**
- Habilidade de monstro que mata não deixa condição: ninguém renasce no templo envenenado/queimando (#54); morte por
  dano contínuo anuncia "veneno"/"queimadura" em vez do id interno.
- XP das recompensas diárias segue o estágio de XP do level (#51): no lv 100 uma diária vale 12 % do que valia.
- Evento semanal reenviado na reconexão; sair em combate cancela a troca aberta em vez de prender o parceiro (#55).
- Autosave numa transação só, `PRAGMA synchronous = NORMAL`; tom de tingimento e bônus de login gravados na hora (#56).
- Dreno de vida/mana não cura ao bater no boneco de treino; a loja avisa "1/semana" nos itens de tier 6–7; o cassino
  pede um espaço na mochila antes de cobrar a ficha; limite de taxa próprio para compra/uso/poção/largar/pegar/
  descartar/mover no chão/postura (#48).

**Fase 1 — cliente (UX)**
- **Esc fecha sempre a janela de cima**: uma pilha única de janelas/menus (`ui/overlays.ts`) substitui 11 listeners
  independentes; clicar numa janela a traz para frente; Conquistas e Ranking não nascem mais uma sobre a outra; Diário,
  Bestiário, Treino, Novidades, Desafios, Conquistas e Ranking agora arrastam pela barra de título (a janela de Roupas é
  modal e perdeu o grip).
- **F5 volta a ser do navegador**: posturas de combate em **F2 / F3 / F4** (F1, README, dicas e o aviso da troca
  atualizados; um atalho de magia salvo nessas teclas é descartado com aviso). Botão direito sobre o HUD não abre mais o
  menu do navegador.
- **Sem venda ou largada por engano**: duplo clique/botão direito na mochila com a aba Vender aberta não vende mais (só o
  botão da loja); largar um item raro, épico ou lendário arrastando para o chão pede confirmação (Enter confirma, Esc cancela).
- **Chat** não puxa para o fim enquanto você lê o histórico: aparece a pílula "↓ N novas".
- **Legibilidade**: textos secundários com contraste ≥ 4,5:1 (e mais fortes no alto contraste); nenhuma fonte abaixo de
  10 px; "Texto maior" também amplia a barra de ações e as poções rápidas; o zoom das janelas vale só para o corpo
  rolável (em 1366×768 o botão × continua na tela); em telas de até 820 px o Equipamento nasce dobrado e a Mochila aberta.
- **Textos**: Novidades "Para onde vai o ouro" (bênção, encantamento, tingimento, cassino, encomenda); `/ajuda` e dicas do
  carregamento falam em teclas 1–0 e 60 ondas.
- Testes novos: `ratelimit`, `ai` (fuga, bando, grito, visão), `bounties`, `spellFamilies`, `outfitTones`, `overlays`,
  `dropConfirm`, `chatScroll`; `tools/fuzz.mjs` cobre os 34 tipos de mensagem.

**Fase 2 — balanço (decisões do dono em 2026-10-22)**
- **Grupo compensa**: +35 % de XP por membro extra (era +20 %) e +20 % com três ou mais vocações diferentes.
- **PvP**: só se inicia ataque contra quem está na sua faixa de level (regra dos 2/3, a mesma do grupo); revide e
  caveira continuam livres em qualquer level. `/quem` mostra a zona só de você, dos seus amigos, do seu grupo e de quem
  está em zona de proteção.
- **Skills**: armas e escudo sobem com a taxa pura (melee 60 ≈ 19 h de golpes, 80 ≈ 130 h; antes 8 000 h); magic level
  com ×1,1 por nível (ML 40 ≈ 30 h de magias; antes 150 h). O treino offline de 12 h rende 17–23 níveis em skill baixa.
- **Bênção** custa 50 × level (era 200): no lv 50, 2 500 de ouro para não perder XP na próxima morte.
- **Poções de mana** recuperam 120 / 350 / 900 (eram 50 / 150 / 400) pelo mesmo preço: feiticeiro e druida passam a
  sustentar a rotação de magias gastando ouro em vez de desistir dela.
- **Caçada de Terça**: XP em dobro na terça das 13h às 14h (logo depois do Rei Goblin), para quem joga no escritório; a
  Noite de Caçada de sexta continua.
- Tarântula e demônio: a habilidade (Picada Venenosa, Paralisia) deixa de bater menos que o golpe básico.
- **Campeão da Semana**: na virada da semana, quem liderou cada categoria semanal do ranking (XP, abates, peixes,
  chefes) ganha o título rotativo "Campeão da Semana" até a próxima segunda (o feed anuncia os campeões).
- **Loot de grupo com prioridade**: o que cai de um abate em grupo fica reservado ao grupo por 15 segundos (depois
  qualquer um pega, como antes); quando um membro pega um item raro ou melhor, o chat do grupo avisa.
- **Lobo Espiritual** do druida cresce com o level (vida e dano); **arcos e bestas** do tier 2 em diante batem 15 % mais.

**Bandos, elite e acessibilidade**
- O olhar (Shift+clique) diz quando o monstro chama o bando e quando foge com pouca vida; a lista de batalha marca ⚑
  quem chama o bando. Elite ganha ★ antes do nome, e o nome volta a ter a cor da dificuldade.
- Botões do trilho e × das janelas com nome para leitor de tela; o foco vai para a janela ao abrir e volta ao jogo ao
  fechar; slots da barra mostram » (fora de alcance) e ∅ (sem alvo) além da cor; convites de grupo e de troca entram na
  pilha do topo (não ficam atrás da barra do Coliseu); login com "mostrar senha" e aviso de Caps Lock; a tela de morte
  lembra da bênção; títulos de painel não cortam mais; a ajuda F1 ganhou a seção "Painéis"; Coliseu e NPC arrastam.

**Testes**
- E2E novos: morte com perda de XP e bênção, viagem de carroça, comandos de admin (`/status`, `/mute`, `/kick`) e os
  sinks (encantamento, tingimento, cassino); teste de migração do banco a partir de uma base v3; comando
  `/fechar-ciclo` para o Claude Code com o procedimento de fechamento de ciclo.

**Fase 3 — build e carregamento**
- Deploy menor (25 → 17 MB): só os sons usados vão para o build; previews do mapa deixam de ser versionados.
- Primeiro acesso mais leve: `world.json` é baixado uma vez (o minimapa reaproveita o do jogo) e o servidor entrega
  HTML, JS, CSS e o mapa em gzip (mapa de 1,5 MB → 72 KB) sem dependência nova.

## [Não lançado] — 2026-10-22 · ciclo 8: caves cheias, monstros mais fortes e Coliseu de verdade

**Caves** (`tools/mapgen/generate.mjs`, bloco `caveSpawns` no fim do pipeline: 0 tiles alterados, objetos antigos
intactos): 373 → 573 monstros. Cavernas 23 → 57, Cripta 12 → 30, Heróis 12 → 30, Ninho dos Dragões de Gelo 6 → 15,
Piratas 20 → 50, Labirinto 18 → 46, Yeti 9 → 24, Templo de Banuta 15 → 39, Abismo 11 → 29, Cidadela 11 → 17. Cada cave
tem um **bando** (8–12 do mesmo monstro, para área) e **spawns mistos** (tanque + atirador + conjurador no mesmo ponto).

**Monstros**
- Dano por level do monstro (ataque e habilidades, chefes inclusive): <20 ×1; 20–39 ×1,4; 40–69 ×1,5; 70–99 ×1,6;
  ≥100 ×1,7. Ex.: orc guerreiro 40–80 → 60–120; demônio 130–250 → 221–425. Dano/s de 3 monstros do level contra cavaleiro
  bem equipado: lv 42 70 → 120; lv 65 143 → 239; lv 100 230 → 429.
- **Poção de vida com recarga de 2 s** (mana segue 1 s; temporizador único). Poção Grande: 450 → 225 de cura por segundo.
- **Elites**: 5% dos monstros comuns lv 10+ nascem "Elite" (nome dourado): vida ×2,5, dano ×1,3, XP ×3, ouro e chance
  de loot ×2. Nunca em chefe, invocação, Coliseu ou sala de quest.
- **Conjuradores curam aliados** (xamã orc, mago minotauro, necromante, bruxa do gelo, merlkin): 10–12% da vida dos
  monstros feridos a até 4 tiles; chefes não recebem.
- **Bandos chamam reforço** (lobos, goblins, orcs, minotauros, piratas, bárbaros, macacos): no 1º golpe, abaixo de 50%
  e ao fugir, os da família a até 6 tiles atacam quem bateu (um grito por família por segundo). Fogem a 20%: goblin,
  piratas, sibang, merlkin.
- Respawn dos monstros comuns ×0,7.

**Coliseu muito mais forte** (dono: "solei de mago, não é para isso acontecer"): o dano novo vale na arena, mais vida
×2,5 e dano por onda (×1,5 na 1 → ×5 na 30 → ×1,7 na 60); desconto para grupos pequenos quase todo removido (monstros a
mais por membro 0,6 → 0,2; chefe de zona solo ≥ 80% da vida de grupo); sem reforço por level acima do justo. Modelo de
calibração novo com o poder real do jogador (o antigo subestimava ~4×). Solo: cai na onda ~22–30 em qualquer level
(antes um feiticeiro lv 20 chegava à 50). Grupo de 4 no level justo da onda 45: cai na 44; completar as 60 pede grupo
lv 120. XP e ouro por onda iguais.

## [Não lançado] — 2026-10-22 · barras antigas convertidas para as famílias

- No primeiro login depois da atualização, toda barra salva (e a de quem nunca configurou) vira a barra recomendada
  com as famílias ◆, uma vez (`CharacterData.hotkeysVersion`, `HOTKEYS_VERSION = 2`), com um aviso no chat ("Ajuste no
  H"). Personagem novo não recebe o aviso. Editar os atalhos marca a versão atual: não há segunda conversão.

## [Não lançado] — 2026-10-22 · famílias de magia e barra mais esperta

Benchmark (Tibia, WoW, RuneScape, Albion/ARPGs): ver a conversa do ciclo; escolhidos os itens 1–3.

- **Famílias de magia (tecla inteligente, ◆)** (`shared/data/spellFamilies.ts`): magias do mesmo papel num atalho só;
  apertar conjura a mais forte que estiver liberada, fora de recarga, com mana e no alcance do alvo (o cliente escolhe e
  manda a magia real: o servidor não muda). O slot mostra o ícone e a recarga da que vai sair. 9 famílias: ataque no
  alvo e área para as 4 vocações (paladino: chuva no alvo), onda do feiticeiro. As magias continuam com palavras e
  atalho próprio para quem preferir.
- **Barra recomendada** ("Recomendado" no painel H; padrão de personagem novo): famílias + magias avulsas em ordem de
  level. Teclas: cavaleiro 11 → 8, paladino 10 → 5, feiticeiro 12 → 7, druida 12 → 9.
- **Barra que se monta sozinha**: magia (ou família) ainda bloqueada no level não aparece na barra (o atalho continua
  salvo); ao subir de level, a magia nova entra na próxima tecla livre (como família, se nenhuma magia da família está
  na barra) e um aviso diz a tecla.
- **Barra que informa**: magia de alvo com o alvo ao alcance acende a borda na cor do elemento; com o alvo longe fica
  avermelhada; sem alvo, apagada (o balão diz "Alvo fora de alcance"/"Sem alvo").
- `DEFAULT_SPELL_RANGE` e `needsTarget` passaram para o shared. Probe E2E `__lq.spellCd(id)`.

## [Não lançado] — 2026-10-22 · mover item longe e perseguir grudado

- **Mover item do chão longe**: arrastar um item fora do alcance (3 tiles) faz o personagem andar até ele (pelo lado
  mais perto do destino) e mover ao chegar, como já acontecia ao pegar. O servidor avisa em vez de falhar calado: "O
  item está longe demais." / "Você não alcança esse lugar daqui." `DROP_RANGE` passou para o shared.
- **Perseguir o alvo (F8) gruda no monstro** em qualquer vocação: paladino e magos também chegam ao lado, em vez de
  parar no alcance do ataque.

## [Não lançado] — 2026-10-22 · ciclo 7: auditoria em equipe, troca segura, balanço do fim de jogo e social

Auditoria de 5 agentes (game design, engenharia, UX, QA, crítica) sobre os 47 commits desde `7d8bc4b`; detalhes e
decisões em `docs/GAME_ROADMAP.md` (Ciclo 7).

**Correções**
- **Troca**: o confirmar leva a versão da oferta (`rev`); um clique que chega depois de o outro mudar a oferta não vale
  ("A oferta mudou: confira e confirme de novo."). O ouro digitado é enviado antes de confirmar (antes confirmava com 0).
  Botão travado 1 s após a oferta do outro mudar. A troca volta após reconexão (`resend`). Morrer cancela a troca e o
  seguir. Os dois lados são gravados numa só transação (também no logout logo em seguida). Aba antiga sem `rev`: "Atualize
  a página (F5)".
- **Bloqueio de PZ**: viagem (barco/carroça) recusada enquanto dura, com os segundos que faltam (o barco do Porto
  escapava do bloqueio); o aviso da entrada da PZ também mostra os segundos.
- **Chão**: empilhar/fundir/mover não renova mais o prazo (itens ficavam eternos) nem encurta o do item recém-caído; teto
  de 2× o prazo desde a parte mais antiga (`created_at`, migração v7). Chão lotado despeja comuns/incomuns primeiro.
- **Caveira vermelha**: o ouro só sai da conta depois de caber no chão (`placeNear`); antes sumia com o tile cheio.
- **Recompensas no chão** (baú de quest, desafio): gravadas junto com o jogador; sobra com `uid` novo; desafio confere se
  a recompensa inteira cabe.
- Personagem que fica no mundo após sair/cair não continua no ataque automático. Loot de grupo só vai ao chão com outro
  membro perto do monstro. "Vender tudo" não vende raro, épico nem lendário.
- **Cliente**: "Animações reduzidas" não esconde mais avisos e faixas (e não treme a câmera). Olhar com os dois botões
  não executa a ação do primeiro (pegar item, abrir NPC/baú; o menu de pesca fecha; a caminhada para com `WalkTo.stop`). Avisos de erro
  ficam no chat (esmaecidos, sem repetir contadores, até 15). Esc fecha janela sem tirar o alvo; Esc da troca respeita o
  que está por cima. F1 atualizado, botão do Bestiário, textos de level/pesca/mochila, `Shift+/` reservado para a ajuda.

**Balanço** (decisão do dono do jogo)
- Estágios de XP {60: 0,6; 80: 0,4; 100: 0,3} → {40: 0,5; 60: 0,3; 80: 0,2; 100: 0,12} (abates por level no lv 40/70/100:
  12,7/15,5/20,5 → 25/31/51). Missões e desafios com XP cheia.
- Coliseu: ouro da onda w×(8+2w) → w×(8+w) (partida completa 192 mil → 118 mil por pessoa); quem fica abaixo de 2/3 do
  maior level não ganha XP nem ouro.
- Escudo: +floor((skill−10)/4) de armadura com escudo equipado (painel "Arm" mostra a conta). Treina com qualquer golpe
  recebido com escudo, no máximo 1 a cada 2 s, e só de monstro com level ≥ 1/3 do seu ou golpe que passa da armadura.
- Golpe Frontal: área 3×3 à frente (antes 1×3), base 20 → 30. Cura em Grupo: perLevel 1 → 2, perMagic 2 → 2,5, cd 8 → 5 s,
  mana 50 → 80.
- Selva e Piratas: ouro ×1,6; Pelo de Macaco 160 → 320, Presa de Tarântula 210 → 420, Couro de Crocodilo 320 → 600,
  Dobrão Pirata 45 → 150.

**Social**
- Chefes no almoço (12h15–13h): Lich seg, Rei Goblin ter, Yeti qui, Demodras sex; Orshabaal sáb 21h; Ferumbras dom 15h.
- `/quem` (`/who`): online com level, vocação, zona, "(ausente)" e "✓ grupo" (regra de 2/3).
- Aniquilação de 2 a 4 jogadores (3/5/6 demônios); quem puxa a alavanca precisa estar numa placa.

## [Não lançado] — 2026-10-22 · olhar (dois botões) e classe dos baús

- **Olhar**, como no Tibia: os dois botões do mouse juntos (ou `Shift`+clique) mostram um cartão do que está sob o
  mouse. Criatura: level, dificuldade, vida, ataque, habilidades e XP. Jogador: level, vocação, título, caveira, grupo.
  NPC: o que oferece. Baú/alavanca: quest, level, itens e classe. Item do chão: o balão completo do item, com os bônus
  vindos do servidor (`C2S.LookGround` → `S2C.LookItem`). O primeiro botão não deixa alvo nem menu aberto. Fecha com
  clique, Esc ou em 8 s.
- **Baús de quest com a classe em cima**: "Cavaleiro", "Paladino", "Feiticeiro", "Druida" (na cor da vocação) ou
  "Todas", conforme os itens do baú.

## [Não lançado] — 2026-10-22 · Coliseu até a onda 60, vender tudo e avisos do topo empilhados

- **Coliseu: 60 ondas** (antes 30; level justo até 110) com os monstros das Terras Selvagens e da Costa. Chefes nas
  ondas 35 (Raposa Chifruda), 40 (bárbaro de elite), 45 (Yeti), 50 (Demodras), 55 (behemoth de elite) e 60
  (Orshabaal). Teste de balanço: grupo de 4 no level justo fica na faixa do fim antigo. Bônus por completar: 30 mil de
  ouro. "Rei do Coliseu" continua na onda 30; conquista nova "Imperador do Coliseu" (onda 60, título).
- **Loja: vender tudo** (`NpcTradeMsg` `sellAll`): botão "Vender tudo (N)" com confirmação e total; "Todos" em cada
  pilha.
- **Centro do topo numa pilha só** (`.top-stack`): etiqueta do evento, barra do Coliseu, avisos e notícias um abaixo do
  outro (a etiqueta da Maré de Tesouros ficava por cima dos avisos).
- Botões do Coliseu com o estilo escuro do HUD (eram o botão branco padrão do navegador).

## [Não lançado] — 2026-10-21 · loot de grupo no chão e mover itens no chão

- **Loot em grupo** (2+ membros): itens e ouro caem no chão onde o monstro morreu. O toast de loot diz "(no chão)". O
  que não couber no chão vai para quem matou. Sozinho, continua indo direto para a mochila.
- **O chão não tem dono**: tudo o que está no chão (loot de grupo, loot que não coube na mochila, ouro da caveira
  vermelha) qualquer um pega ou move na hora. Acabou o "Esse item ainda não é seu." (as colunas `owner`/`owner_until`
  da tabela `ground_items` ficam sem uso).
- **Mover item no chão**: arrastar um item do chão para outro tile (`C2S.MoveGroundItem`): origem e destino a até
  3 tiles com linha livre; `Shift` numa pilha escolhe a quantidade; o tempo até sumir não reinicia.

## [Não lançado] — 2026-10-21 · mochila cresce com o level e rolagem minimalista

- **Capacidade da mochila** (`backpackCapacity`): 20 espaços no lv 1, +1 a cada 5 levels, até 40 (lv 25 → 24,
  lv 50 → 29, lv 100 → 39, lv 101+ → 40). A mochila cresce ao entrar, no level up (aviso "Sua mochila cresceu") e no
  `/level`; só encolhe espaços vazios do fim, então nenhum item some. Posições além da capacidade são recusadas no
  servidor.
- **Barras de rolagem** iguais em todas as janelas: 6 px, sem setas nem trilho, aparecem com o mouse sobre a área.

## [Não lançado] — 2026-10-21 · atalhos de magia e magias de fim de jogo

### Painel de atalhos (tecla H ou ⚙ na barra)
- Cada atalho liga uma **tecla** a uma **magia**: até 12, qualquer tecla livre (números, letras, F2–F4, F10–F12,
  símbolos), também com Shift. Ctrl/Alt ficam de fora (o navegador usa).
- Teclas do próprio jogo (andar, Q/E, I, K, L, M, B, O, J, R, H, F1, F5–F9, Enter, Esc) são recusadas com o motivo
  ("Tecla Q usada por: Poção de vida"); escolher a tecla de outra linha troca as duas.
- **Salvo no personagem** (servidor, `rec.data.hotkeys`): vale em qualquer PC. Na primeira entrada a barra antiga
  (ordem salva no navegador) vira atalhos nas teclas 1–8; sem ela, o padrão é 1–0 em ordem de level.
- A barra mostra um slot por atalho, com a tecla de cada um; arrastar um slot sobre outro troca as magias (as teclas
  ficam). O arrastar estava quebrado no Chrome (o `mousedown` dos botões do HUD era cancelado) — corrigido.

### 16 magias novas (lv 35, 50, 70 e 90)
- Cavaleiro: Golpe Frontal (`exori min`), **Fúria** (`utito tempo`, +25% de dano por 10 s), Fúria Giratória
  (`exori mas`), Golpe Aniquilador (`exori gran ico`).
- Paladino: Flecha Explosiva (`exevo con flam`), Flecha Paralisante (`exori con hur`), Julgamento Divino
  (`exori gran san`), Chuva de Estrelas (`exevo gran mas con`).
- Feiticeiro: Onda de Fogo (`exevo flam hur`), Morte Súbita (`exori mort`), Tempestade Elétrica (`exevo gran mas vis`),
  Chama Eterna (`exori gran flam`).
- Druida: Onda de Gelo (`exevo frigo hur`), Esmagar Terra (`exori gran tera`), Tempestade de Terra
  (`exevo gran mas tera`), Fúria da Natureza (`exori gran frigo`).
- Nenhuma cura nova. Metas em `spells.test.ts`: cada uma rende 1–1,7× a antecessora da mesma categoria no level em que
  libera; mana ≤ 35% da máxima; cooldowns por categoria.

## [Não lançado] — 2026-10-21 · Coliseu sem esperas e com botão de sair

- **Ondas emendadas:** entre ondas comuns só um respiro de 3 s (`ARENA_BREAK_MS`, fase `break`), sem loja nem "Pronto".
- **Pausa com o vendedor só depois das ondas-chefe** (5, 10, 15...): 45 s (`ARENA_SHOP_PAUSE_MS`), "Pronto" continua
  encurtando. A cura de 30% no fim de cada onda continua.
- **Sair do Coliseu:** botão "Sair" sempre visível na barra da partida (luta, respiro e pausa), com confirmação no
  próprio HUD (antes: um ⚑ pequeno só durante a luta, com o diálogo do navegador).
- Lobby mostra "grupo de N" (sem limite de pessoas; antes "N/4").

## [Não lançado] — 2026-10-21 · habilidades de monstros, estágios de XP e correção do PvP

### Habilidades de monstros
- `MonsterDef.abilities` (dados em `shared/data/monsterAbilities.ts`): golpe no alvo, área no próprio monstro, área no
  alvo, onda (sopro), cura em si mesmo e invocação. Uma habilidade ocupa o turno do ataque básico (o dano por segundo
  continua previsível); o primeiro uso só sai na metade do cooldown e a `chance` é sorteada uma vez por turno.
- Golpes com **aviso** (`windupMs`): `S2C.MonsterTelegraph` marca os tiles no chão; o dano cai em quem continuar neles.
  Matar o monstro durante o aviso cancela o golpe.
- **Invocações de monstro** (`minionOf`): sem respawn, XP, loot, crédito de missão ou conquista; somem quando o
  invocador some (morte, despawn, fim do Coliseu/sala da alavanca); herdam limites e filtro de alvos da arena.
- 26 monstros com habilidades: os chefes (Lich, Rei Goblin, Raposa Chifruda, Demodras, Orshabaal, Barba-Ruiva, Rei
  Kongra, Yeti, Ferumbras) e os do lv 30+ (tarântula, carniphila, xamã orc, minotauro mago, ciclope, olho maligno,
  cavaleiro negro, dragões, behemoth, demônio, bruxa do gelo, necromante, elemental de magma, cão infernal, juggernaut).
  Nenhuma passa de 2× o dano máximo do ataque básico do monstro (teste).
- O cliente desenha com o mesmo código das magias (`monsterAbilitySpell`: o grito aparece no lugar das palavras mágicas).
- Primeiro uso entre 30% e 100% do cooldown (sorteado: um bando não solta tudo junto); área/onda que não pegaria o
  alvo (diagonal fora do cone) não é usada; armadura conta inteira, como no ataque básico; invocados no Coliseu
  herdam a escala de vida do invocador.

### Estágios de XP
- `XP_STAGES`: XP de caça (abates e ondas do Coliseu) × 1 até o lv 59, × 0,6 do 60, × 0,4 do 80 e × 0,3 do 100.
  Missões e desafios dão a XP cheia; a curva de XP não mudou (ninguém perde level). Aviso ao entrar num estágio novo e
  dica na barra de XP.

### PvP
- **Correção:** sair do jogo apagava a caveira branca e o bloqueio de PZ. Agora o personagem fica no mundo até o
  bloqueio acabar (também depois de uma queda sem reconexão; `/kick` continua tirando na hora) e o prazo da caveira
  branca e do bloqueio ficam salvos no personagem (`pvpWhiteUntil`, `pvpPzLockUntil`): relogar não apaga nenhum dos
  dois. Parado no mundo, o personagem não ataca nem segue ninguém; se o bloqueio for renovado nesse meio-tempo, fica
  até ele acabar. Quem já está dentro da PZ sai na hora.

### Testes
- `e2e/arena.spec.ts`: o lobby mostra "2" (sem limite de pessoas desde b988e19), não "2/4".

## [Não lançado] — 2026-10-20 · Costa Esmeralda e quests estilo Tibia

### Mapa: Costa Esmeralda (segunda expansão a leste, 280 → 400 colunas)
- Gerada por `tools/mapgen/expansion2.mjs` depois do mapa anterior (coordenadas antigas iguais). No mapa antigo só
  mudam três passagens na borda leste das Terras Selvagens (y 24, 69 e 94) e a Cidadela de Ferumbras, cavada no
  subterrâneo vazio abaixo do Labirinto e do Abismo.
- **Superfície:** Ilha Gelada (lobos do inverno, bárbaros, bruxas do gelo, lv 50-62) com o Acampamento Nórdico (PZ);
  Selva de Banuta (sibangs, kongras, tarântulas, merlkins, crocodilos, carniphilas, lv 26-40) com as ruínas do templo;
  Porto Esperança (PZ na costa: loja, depósito, capela, barco); praia; Vulcão de Goroma (elementais de magma e cães
  infernais, lv 86-95) com a cratera murada (porta lv 80).
- **Masmorras:** Caverna dos Piratas (Capitão Barba-Ruiva), Templo de Banuta (Rei Kongra no santuário), Caverna do Yeti
  + Ninho dos Dragões de Gelo, Caverna dos Heróis (heróis e necromantes) e Cidadela de Ferumbras (colossos, cães,
  demônios e Ferumbras).
- 22 monstros novos (4 chefes), 15 materiais, armas de baú (Sabre do Pirata, Arco do Corsário, Varinha das Marés,
  Bastão de Coral, Machado Cortapedras), Ídolo de Banuta e Anel do Gelo Eterno.
- Carroça da Vila e da Fronteira levam a Porto Esperança; o barco da Capitã Marina volta para as duas.
- Raids novas: Rugido do Yeti (quinta 20h) e Retorno de Ferumbras (segunda 21h).
- Recompensas diárias: cinco faixas novas (lv 42, 52, 62, 72, 88) com os monstros das Terras Selvagens e da Costa.
- O minimapa explorado não se perde quando o mapa alarga (as linhas antigas são copiadas para a largura nova).

### Quests estilo Tibia
- **Baús de quest** (objeto `quest_chest`): abrem uma vez por personagem; baús do mesmo grupo são uma escolha. Sete
  quests: Esconderijo da Selva, Tesouro do Barba-Ruiva, Ídolo de Banuta, Baú do Yeti, Quest dos Heróis, Cume do Vulcão
  (Botas da Pressa) e a Aniquilação. Equipamentos de baú saem raros.
- **Portas de quest**: portais com `minLevel`, `quest` ou `chestGroup`; quem não cumpre volta ao tile anterior com o
  motivo. Ex.: Caverna dos Heróis (lv 60), Cidadela (lv 100), Ninho dos Dragões de Gelo (missão "O Yeti").
- **Aniquilação** (alavanca `quest_lever`): um jogador lv 100+ em cada uma das 4 placas e a sala vazia; puxar leva os
  quatro para a arena e solta 6 demônios (XP e loot normais, sem respawn; somem se a sala ficar vazia por 30 s). A
  porta da arena leva aos 4 baús (Armadura de Placas Mágica, Espada Longa Mágica, Machado Cortapedras ou o Urso da
  Aniquilação, todos com o título "o Aniquilador").
- **25 missões novas**: cadeias para as Terras Selvagens (Batedora Iara e Sacerdotisa da Fronteira, lv 40-110) e para a
  Costa (Explorador Jairo, Capitã Marina, Jarl Haakon, Irmã Celeste e Mestre Ignis, lv 25-120), com 8 títulos novos.
- `/quest reset chests` (dev) zera os baús do personagem.

## [Não lançado] — 2026-10-17 · Terras Selvagens (expansão leste)

### Combate
- **Ataque automático** (`F9`, botão no cabeçalho da Batalha): sem alvo, o personagem escolhe sozinho o monstro mais
  próximo com linha de visão (fora da zona protegida). Com "seguir o alvo" ligado procura até 6 tiles e vai atrás; com
  ele desligado só pega o que já está ao alcance. O modo é salvo com o personagem.
- **Seguir jogador** (clique direito → *Seguir* / *Parar de seguir*): anda atrás do jogador até ficar ao lado. Mover
  manualmente, escolher um alvo de ataque, `Esc`, ou o jogador ficar a mais de 15 tiles cancelam. Seguindo, o
  personagem ainda ataca o que estiver ao alcance sem sair do jogador. Quem você segue fica marcado com um quadrado
  verde (no mundo e na Batalha).
- **Batalha**: clique direito num jogador da lista → *Atacar* / *Seguir*.
- **Correr** (*Pés Ligeiros*, `utani hur`): agora de todas as vocações (lv 5, 20 de mana), +30% de velocidade por 30 s,
  cooldown de 15 s (dá para manter sempre ligada) e fora do cooldown global (dá para correr e atacar em seguida). Antes era só do paladino (8 s, cd 30 s).

### PvP (estilo Tibia)
- **Jogadores podem se atacar em qualquer lugar fora da zona de proteção** (Vila, Centro de Treinamento e Posto da
  Fronteira), sem limite de level: clique direito → *Atacar*, ou clique no jogador na Batalha. Ataque básico e magias de
  alvo único atingem jogadores; magias de área só atingem o alvo atual, quem tem caveira ou quem atacou você (passar
  perto de um inocente não dá caveira). Não vale contra o próprio grupo nem no Coliseu.
- **Caveira branca** (15 min) para quem ataca um jogador sem caveira que não o atacou antes. O revide é justo.
- **Caveira vermelha** com 3 mortes injustas em 24 h (salvas no personagem): ao morrer, perde o dobro de XP e metade
  do ouro cai no chão.
- Depois de atacar um jogador, não se entra em zona de proteção por 1 min.
- A caveira aparece ao lado do nome do personagem.
- **Morrer tira a caveira branca** (e o bloqueio de PZ); a vermelha continua até as mortes saírem da janela de 24 h.
- **Morrer tira do grupo** (party). Cair no Coliseu não conta.

### Coliseu
- **Sem limite de pessoas** por grupo (antes, 4). A quantidade de monstros e a vida dos chefes continuam escalando com o
  tamanho do grupo.

### Interface
- Largar uma pilha no chão sempre abre a barrinha de quantidade (começa em tudo); antes só com `Shift`.
- Cabeçalho da Batalha: os botões de modo de luta não ficam mais por cima do título e do contador.
- **Nomes de personagem** aceitam números (com pelo menos uma letra) e vão até 20 caracteres (antes, 16 e só letras).

### Viagem
- **Cocheiros** Bastião (portão leste da Vila) e Zuleica (sul do Posto da Fronteira): carroça entre os dois por 150 de
  ouro, grátis até o level 8. Não dá para viajar em combate. Os dois NPCs entraram no mapa só como objetos (nenhum
  tile mudou).

### Mapa
- **O mapa passou de 160 para 280 colunas.** A expansão é gerada por `tools/mapgen/expansion.mjs` (semente própria) DEPOIS
  do mapa original: tudo nas 160 colunas antigas fica igual (mesmos tiles e mesmos ids de objeto), menos duas passagens
  abertas na borda leste (ruínas, y=22; pântano, y=70). Personagens salvos continuam no mesmo lugar.
- Regiões: Deserto de Zao (Fortaleza Orc), Picos Gelados (Monte Ciclope, Cemitério dos Olhos), Floresta Sombria (Forte
  Negro, boca do Labirinto), Vale dos Dragões (covil de Demodras) e o **Posto da Fronteira** (zona protegida com loja,
  depósito, sacerdote e batedora).
- Subterrâneo: **Labirinto dos Minotauros** (labirinto gerado, salão da Raposa Chifruda) e **Abismo** (behemoths,
  demônios e o trono de Orshabaal).

### Monstros e itens
- 11 monstros (lv 42-100): orc guerreiro/xamã, minotauro/minotauro mago, ciclope, olho maligno, cavaleiro negro,
  dragão, senhor dos dragões, behemoth, demônio. 3 chefes: Raposa Chifruda, Demodras e Orshabaal.
- Raids agendados: Fúria de Demodras (terça 20h) e Invasão de Orshabaal (sábado 21h).
- Tier 6 (lv 50) e tier 7 (lv 70) para as 4 vocações (só no loot), Botas da Pressa, anéis/amuletos de chefe,
  materiais novos e Presunto de Dragão.

### Docker
- `docker-compose.dev.yml`: ambiente de desenvolvimento (Vite em http://localhost:3100 + servidor na 2568, código montado, recarrega ao
  salvar), com nome de projeto próprio para não brigar com o de produção.

## [Não lançado] — 2026-10-17 · roupas novas

### Jogo
- **7 roupas novas estilo Tibia**, cada uma com 2 addons gerados por `tools/addons/generate.mjs`: Nórdico (capa de pele,
  escudo redondo), Mendigo (bengala, trouxa), Domador de Feras (pele de fera, chicote), Caçador de Demônios (chifres,
  espada larga), Peregrino (cajado com lanterna, cabaça), Senhor da Guerra (capa de guerra, martelo) e Monge (contas,
  bastão). Total: 20 roupas.
- Desbloqueio por conquistas: 13 novas (`bestiary_10`, `kills_2500`, `boss_10`, `boss_lich_5`, `boss_goblin_5`,
  `level_75`, `melee_80`, `shield_60`, `offline_3h`, `offline_48h`, `pickup_2000`, `steps_150k`, `explore_90`) e
  recompensas novas em conquistas que antes davam só título ou nada (escudo 40, Coliseu 10, pesca 100, missões 10,
  itens largados/pegos, exploração 25%, grupo).

## [Não lançado] — 2026-10-15 · ciclo 6 (retenção e qualidade de vida)

### Jogo
- **Desafios da semana** (diário de missões > "Desafios semanais"): Caçada (150 abates), Pescaria (12 peixes) e
  Evolução (um level de XP), medidos desde a segunda-feira, com resgate manual e bônus por cumprir os três. Resgate
  só se a mochila comportar os itens (tudo ou nada).
- **Ranking semanal** (XP, abates, peixes, chefes) que zera na virada da semana ISO, e categoria geral **Pescador**.
  A janela e a página pública mostram "zera em…".
- **Bestiário** (tecla B): abates por monstro, vida, XP, dano e tabela de drops; o que ainda não foi derrotado fica
  como "???" com o level à mostra.
- **Chefes na agenda**: Despertar do Lich (quarta 20h) e Caçada ao Rei Goblin (domingo 20h) convocam o chefe no spawn
  (com loot +50%). `/evento <nome>` também convoca.
- **Bônus de login** por dias seguidos (ciclo de 7 dias; dia 7 é o maior; faltar um dia volta ao dia 1). O dia de
  jogo troca às 6h de Brasília, como as recompensas diárias.

### Interface
- **Poção automática** (botão ⚗): limite de vida e de mana (0–90%) que bebe a primeira poção da mochila sozinho.
- **Acessibilidade** (botão Aa): texto maior nas janelas de leitura, alto contraste e animações reduzidas.
- **Novidades**: tela que abre uma vez por versão (e pelo botão da ajuda).
- **Aviso fora da aba**: o título da aba ganha "(2)" com sussurro, convite de troca/grupo, amigo entrando e evento.

### Servidor
- O evento disparado por `/evento` sobrevive a reinício. Avisos de entrada (amigos online, bônus de login) saem 3 s
  depois da entrada: antes se perdiam porque o chat do cliente ainda não escutava.

## [Não lançado] — 2026-10-15 · ciclo 5

### Interface
- **Chat sobre a cabeça do personagem**, como no Tibia: o canal geral aparece em amarelo e o do grupo em azul-claro,
  em itálico e menor que o nome (para não confundir com o nick), com até 3 linhas empilhadas. Some sozinho; texto
  longo vira "…" no balão (o chat guarda o inteiro).

- **Seta-guia do novato** (até o level 3, enquanto a 1ª missão não acaba): aponta o Capitão, depois a floresta dos
  ratos e de volta ao Capitão; na borda da tela mostra a distância em passos.
- **Emotes** (`/e coracao`, `/e rir`... ou o botão ☺ do chat): ícone sobre a cabeça por ~2 s (8 emotes).
- **Sussurro** (`/w Nome mensagem`, `/r` responde) e **amigos** (`/amigo Nome` adiciona/remove, `/amigos` lista com
  ● online / ○ offline; aviso quando um amigo entra ou sai). Nomes com espaço funcionam.
- **Troca entre jogadores** (botão direito > "Trocar itens"): janela com a oferta dos dois (itens + ouro); os dois
  confirmam e a troca é atômica (nada muda se a mochila de alguém encher); qualquer mudança zera as confirmações;
  cancela por distância, morte, Coliseu ou saída.
- **Pesca**: Vara de Pesca (Velho Caçador Tomé), botão direito na água perto da margem, 5 s parado (andar ou apanhar
  solta a linha); truta, salmão e peixe dourado (raro); a chance de morder cresce com os peixes pescados; conquistas
  "Pescador" e "Mestre Pescador".
- **Barra de ações editável**: arraste uma magia para outro slot (a ordem fica salva por personagem).
- **Eventos semanais com bônus** (etiqueta ★ no topo): Maré de Tesouros (quarta 12h, loot +50%), Noite de Caçada (sexta
  19h, XP ×2) e Tarde de Sábado (14h–16h, XP ×1,5 e loot +25%). Admin: `/evento` mostra o andamento, `/evento <nome>
  [min]` dispara na hora e `/evento parar` encerra.

### Jogo
- **Druida novato não ficava mais sem o 5º rato**: o respawn só acontecia com ninguém a 7 tiles, então quem esperava
  parado no centro do spawn o impedia de voltar. Respawn adiado por mais de 30 s agora nasce, a mais de 3 tiles do
  jogador (chefes seguem só a regra de 7). Primeira missão do druida: 4 de 6 → 8 de 8.

### Ferramentas e testes
- `npm run newbie` (`tools/newbie.mjs`): robô novato sem admin nas 4 vocações; sai com erro se alguma não entregar.
- Admin: `/status` (uptime, online e pico, monstros, tick médio/máx, memória, erros).
- E2E: em modo E2E a janela de reconexão cai de 20 para 2 s (`LEMONQUEST_RECONNECT_S`; em produção segue 20): sem
  personagens fantasmas do teste anterior. Playwright com 1 worker por padrão; Vitest com metade dos núcleos.

### Servidor
- **Sessões de conta sobrevivem a reinício/deploy**: ninguém precisa digitar a senha de novo. Só o hash SHA-256 do
  token vai para o SQLite (tabela `account_sessions`, migração v6); a validade segue 30 min sem uso, logout e troca
  de senha invalidam, e continuam no máximo 8 sessões por conta.

## [Não lançado] — 2026-10-14 · ciclo 4 (polimento da noite)

### Interface
- Ajuda de atalhos (F1) agrupada em Movimento / Combate / Janelas e com as teclas que faltavam: L (missões),
  I (equipamento e mochila), Q/E (poções), F5–F7 (modo de luta), F8 (seguir o alvo).
- Janelas (missões, conquistas, ranking, NPC, Coliseu, roupas, treino, diálogo de item, menu de contexto) com o
  fundo próprio, mais opaco: antes todas saíam com o fundo genérico translúcido e o mapa aparecia por trás do texto.
- Depot: abrir o Guarda-Volumes abre a mochila (e a barra lateral, se recolhida) para dar de onde arrastar; ao
  fechar, tudo volta como estava. Em telas baixas a mochila começa dobrada e o depot parecia não funcionar.
- Loja: nomes longos quebram em duas linhas ("Poção de Vida Média" e "Poção de Mana Média" saíam iguais, cortados).
- Nome da zona ao entrar numa área passa por baixo das janelas e cartões (antes cobria a janela aberta por 2 s).
- Conquistas: "0 / 1.310 pts" numa linha só; ranking de level sem a coluna "Lv" repetida.
- Cartão de **primeiros passos** no canto inferior direito: no topo ele cobria os avisos e o caminho do novato (o
  Capitão fica a noroeste, os ratos ao norte) — o clique para andar até lá caía no cartão e o personagem não saía do
  lugar. Avisos e barra/faixas do Coliseu ficam centrados na área de jogo (sem a barra lateral).
- Desconectado (servidor reiniciado, rede caiu): a tela agora diz **"Aguardando o servidor voltar…"** e depois **"O
  servidor está no ar. Pode voltar."** (consulta `/health` a cada 3 s) — antes não dava para saber quando clicar.
- Janela estreita (meia tela, barra lateral aberta): o chat cobria as 3 primeiras magias da barra; agora ele sobe para
  cima dela quando não cabe ao lado.
- Tela de morte mostra uma **dica** para quem está começando (até o level 10): poção no Q, um monstro por vez,
  descansar na vila, o "!" da lista de batalha.
- **Volume do som**: o botão ♪ abre um painel com volume (0–100%, lembrado) e mudo — antes era só ligar/desligar.
- Chat: **/ajuda** (ou /comandos, /help) lista os comandos de grupo e lembra das magias e do F1; admins veem também
  os comandos de admin. "Comando desconhecido." agora sugere o /ajuda.
- Loja: caixa **"Só da minha vocação"** (ligada por padrão, lembrada) esconde o que a sua vocação não usa — no Bento
  um mago via 35 itens, metade espadas e arcos; e um "Lv N" em vermelho marca o que pede level acima do seu.

### Jogabilidade
- **Personagem novo começa com "seguir o alvo" ligado** (F8): parado, ninguém alcançava o rato que foge com pouca
  vida e a primeira missão emperrava (robô novato: cavaleiro 2 ratos e druida 4 em 10 min — a Lasca de Gelo deixa o
  rato com ~3 de vida; feiticeiro 41–73 s). À distância, seguir só aproxima até o alcance. Quem já tem personagem fica
  com o modo que escolheu.

### Economia (proposta #31)
- Tier 4 (level 25) à venda: Bento (armas de todas as vocações e o conjunto de Aço), Velho Caçador Tomé (Arco
  Composto, conjunto de Franco-Atirador) e Dona Marta (Varinha Flamejante, Bastão do Pântano, conjunto Arcano).
  Conjunto completo: 22–27 mil de ouro. O tier 5 continua só no loot, nos chefes e nos baús.

### Fim de jogo (proposta #32)
- Espíritos de chama (lv 38–40): de 3 para 7, em dois bandos — 4 no lugar de sempre e 3 num ponto novo das ruínas a
  leste. O mapa (tiles, colisão, decoração) não muda: o ponto novo entra só como objeto no fim do gerador.

### Jogabilidade (proposta #33)
- Feiticeiro e druida ganham 6 de vida por level (antes 5): no level 30, 324 em vez de 295.
- Paladino ganha os conjuntos que faltavam: **Caçador** (level 15, vendido pelo Velho Caçador Tomé; botas na aranha,
  capuz no morcego) e **Arqueiro-Mestre** (level 35: homem-lagarto, espírito de chama e Rei Goblin). Antes o
  paladino ficava do level 8 ao 25 com o conjunto de Patrulheiro (armadura 4; cavaleiro 7) e sem peça de fim de jogo.

### Engenharia
- Arquivos do cliente com hash no nome (`/assets/*`) ficam 1 ano no cache do navegador (antes revalidavam a cada
  visita); `index.html`, mapa e sprites continuam revalidando, então um deploy novo chega no próximo F5. Sem o Caddy
  (`deploy/docker/docker-compose.https.yml`) o servidor não comprime nada (~2,4 MB de JS + mapa por carga) — o
  Caddy já faz `encode zstd gzip`.
- Phaser num arquivo próprio (1,2 MB) separado do código do jogo (265 kB): com o cache longo, um deploy novo faz os
  jogadores baixarem só o código do jogo. O E2E agora confere que a página pública `/ranking` existe (a segunda
  entrada do build chegou a sumir nessa mudança).
- E2E novo do depot (abre a mochila dobrada, guarda um item arrastando, devolve a mochila dobrada).
- E2E do chão: repete o clique de pegar se um monstro passar pelo tile.

## [Não lançado] — 2026-10-14 · ciclo 3 (polimento)

### Interface
- Balão do item mostra o **dano por golpe** da arma e compara com o atual (▲/▼); avisa quando a arma não supera lutar
  sem arma. A conta é a mesma do servidor.
- Coliseu: a janela mostra o level de cada membro e marca **"sem XP"** quem está fora da faixa.
- Telas baixas (720p/768p): minimapa menor, batalha com 3 linhas por padrão e uma faixa "▾" quando a barra lateral
  tem mais conteúdo abaixo.
- Lista de batalha diz a **dificuldade** da criatura em texto (fraca/normal/difícil/perigosa/chefe) e marca com "!"
  as perigosas e os chefes — não depende mais só da cor do nome.
- Chat: cada aba guarda as próprias 80 linhas (o Grupo não apaga o Geral); avisos do servidor contam como não lidos
  quando você está na aba Grupo.
- Nomes e números do mundo ficam nítidos ao arrastar a janela para um monitor com outra escala.

### Engenharia
- Login: se o servidor não responder em 15 s, aparece "Não foi possível conectar ao servidor." (antes ficava em
  "Carregando personagens…" para sempre).
- Hover do mouse sem alocação por frame; cursor só é escrito quando muda.
- Testes E2E do Coliseu e do grupo sem corridas com a pausa e com alvos abatidos por outros jogadores.
- Heap do cliente medido com 10 bots: estável (~49–50 MB).

### Jogabilidade
- Personagem novo vê um cartão de **primeiros passos** (andar, atacar, primeira missão, atalhos); some ao fechar ou
  no primeiro abate.
- Druida ganha **Lasca de Gelo** (*exori frigo*) no level 1: dano de gelo barato, como a Bola de Fogo do feiticeiro.
  Na barra ela entra na tecla 2 e as outras magias do druida andam uma tecla.
- Lobo um pouco mais fraco (vida 80, dano 6–15; mesma XP): a faixa 5–10 ficava pesada para magos.
- Armas de tier 1 um pouco mais fortes (Espada Curta 11, Clava 10, Arco Curto 9, varinha/graveto 7): a arma inicial
  continua melhor que o punho até o tier 2.
- Quem bateu num monstro e foi para longe também não conta mais o abate em missões e conquistas (mesma regra da XP).
- Sair do jogo de propósito no meio de uma luta não salva mais da morte: o personagem fica 20 s no mundo, igual a uma
  queda de conexão (fechar a aba já funcionava assim).
- Armas de tier 3 (level 15) agora são vendidas: Bento (todas as vocações), Velho Caçador (Arco Longo) e Dona Marta
  (Varinha da Tempestade, Bastão de Gelo). Antes cavaleiros e feiticeiros não tinham de onde tirar arma de tier 3.

## [Não lançado] — 2026-10-14 · ciclo 2

### Jogabilidade
- Kit inicial: personagem novo começa com a arma básica da vocação equipada, 3 Poções de Vida e 5 Carnes.
- Coliseu: XP das ondas só para quem está na faixa de level do grupo (≥ 2/3 do maior); quem está abaixo ganha só o
  ouro (aviso explica). Acaba com o "carregar" personagens level 1.
- Loot vai para quem mais bateu **e está perto** (12 tiles); quem bateu e foi embora não leva. A XP do abate também é
  dividida só entre quem está perto.
- Arma nunca dá menos dano que lutar desarmado (antes uma arma abaixo do seu tier batia menos que o punho).
- **Balanço:** o dano desarmado cresce bem mais devagar com o level (cerca de metade). Arma do seu tier bate 1,5–2,5×
  o punho; quem joga equipado fica no mesmo patamar de antes. Quem lutava sem arma deve comprar uma (o Bento vende
  tier 1 e 2) ou usar a do loot.

### Acessibilidade
- Foco por teclado visível em botões, links, selects e checkboxes.

### Engenharia
- Servidor depende de `@colyseus/core` em vez do meta-pacote `colyseus` (que trazia auth, monitor, playground e Redis
  sem uso): `npm audit` 15 → 0 avisos, bundle 5,4 → 2,4 MB.
- `tools/loadtest.mjs`: teste de carga com bots (10 jogadores: tick médio 0,2 ms de 50 ms).

## [Não lançado] — 2026-10-14 · auditoria, ciclo 1

Diagnóstico completo em [docs/GAME_AUDIT.md](docs/GAME_AUDIT.md); estado em [docs/GAME_ROADMAP.md](docs/GAME_ROADMAP.md).

### Segurança
- Nomes de admin (`LEMONQUEST_ADMINS`) ficam reservados: só contas em `LEMONQUEST_ADMIN_ACCOUNTS` criam personagens com
  eles (variantes com/sem acento incluídas). Antes, qualquer conta podia criar um nome de admin ainda livre e usar
  `/resetsenha` para tomar outras contas.
- Nomes novos só com letras latinas comuns (ASCII, Latin-1, Latin Extended-A): barra sósias como `Ｌｅｏ`, `ʟeo`, `ﬁ`.
  Nomes já existentes continuam valendo.
- Troca de senha por código de recuperação desconecta os personagens da conta que estão no mundo e anula tokens de
  entrada pendentes.
- Chat (incluindo comandos e palavras mágicas) limitado a 6 mensagens/s por jogador.
- Cabeçalhos: sem `X-Powered-By`; `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`.
- `LEMONQUEST_TRUST_PROXY` (opcional) para o limite de login por IP funcionar atrás do Caddy.

### Correções
- Largar/pegar item grava o personagem e o chão juntos, numa transação (no máximo 1×/s): uma queda brusca do servidor
  não duplica nem some mais com o item.
- `/kick` e troca de senha também derrubam quem caiu e está esperando reconexão.
- Testes E2E do Coliseu sem corrida com toasts/faixas efêmeros.
- Backup é gravado em `.tmp` e só então substitui o da hora (uma falha não apaga o backup anterior).
- A Investida do cavaleiro não para mais em cima de portal.
- Teclas de movimento voltam a funcionar depois de clicar em checkbox/select do HUD (rastrear missão, título).
- Teleporte visual não lança exceção se o jogador sai nos 40 ms seguintes.

### Experiência
- Efeitos visuais de combate/magias/mortes de outros jogadores só aparecem até 16 tiles; som atenuado com a distância
  (mudo a partir de 10 tiles). O que envolve você ou seu grupo nunca é filtrado.
- Luzes de magias e projéteis têm vagas reservadas no modo de luz "baixo" (tochas da cidade não as apagam mais).

### Desempenho
- A* reaproveita buffers: ~200–340 µs → ~6–11 µs por caminho curto, sem lixo por busca.
- HUD não re-renderiza quando outro jogador anda (`meStore`/`selectStore`).
- Listeners `onChange` por entidade são liberados quando a entidade sai (antes acumulavam a sessão toda).
- Chat com chaves estáveis por linha.
