# Estagiário v3 — abordagem nova (política, canais e diário)

Data: 2026-11-02. Dono: "A questão da cura ainda tá me incomodando. Eu fui caçar agora e quando a vida abaixou muito,
ele não usou pote." e depois "Vamos pensar em uma outra abordagem então. Como você criaria um bot com essas
funcionalidades? Sem levar em consideração o que temos hoje."

## 1. O caso que motivou

Leitura só-leitura do banco de produção (2026-11-02): o cavaleiro lv 111 do dono tinha como regras de cura só "poção de
vida abaixo de 80 %" e "poção de mana abaixo de 25 %", 349 Poções Supremas e 45 Grandes na mochila, as duas bebíveis.
Pelo código, com a Cura ligada ele beberia aos 79 %. A única explicação: **o interruptor Cura estava desligado**. Ele
voltava a desligado a cada entrada no mundo e a cada recarga da página (spec de 01/11: "Desconectou / fechou o cliente:
cura e ataque desligam"), e ligar a rota acendia Ataque e Buffs, mas não a Cura. O dono recarregou o cliente depois do
deploy do dia e a Cura apagou sem aviso.

Achado de passagem na mesma leitura: um paladino lv 83 sem nenhuma poção de vida na mochila — a regra de poção é pulada
em silêncio e só a magia cura. Nada avisava.

## 2. Princípios da abordagem nova

1. **Cura é camada de segurança, não módulo.** Bot ligado implica cura ligada. O jogador ajusta porcentagens, não liga e
   desliga a cura. Os interruptores ficam salvos por personagem e sobrevivem a recarregar a página; ao entrar, uma
   carência curta e pronto. Só a rota exige ligar à mão, porque gasta turno.
2. **Um canal por recarga.** Quatro recursos que não se misturam: a recarga de poção, a das magias de cura e suporte, a
   das magias de ataque e o movimento. Cada tick, cada canal decide no máximo uma ação, de forma independente. Com a
   vida em 25 %, poção e Limpar Feridas saem no mesmo tick. (Hoje sai uma cura por tick e a outra espera.)
3. **Decisão por "o que falta", não por ordem de lista.** A política calcula quanto falta de vida, quanto cada opção
   devolve e quanto custa em mana e tempo, e escolhe a melhor cobertura por custo. O cavaleiro bebe poção quase sempre
   (a cura dele devolve pouco); o mago usa a magia (cobre bem). É o que o simulador mediu, mas sai da fórmula, não de
   limiares ajustados à mão.
4. **Perfil por nome, não por valores.** O save guarda `preset: "equilibrado"`, não os números. Quem usa o recomendado
   recebe o recomendado atual a cada versão, sem clicar em nada. Só quem personalizou grava números. Elimina a classe
   inteira de "configuração salva antiga".
5. **Transparência.** Um diário com as últimas decisões e o motivo de cada uma, visível na janela: "12:41:03 vida 28 %,
   poção em recarga, usei Limpar Feridas, +96". O crachá mostra a última ação. Antes de começar, o bot confere a mochila
   e avisa: "nenhuma poção de vida que você possa beber".
6. **Perfis derivados dos dados e validados por simulação.** O jogo sabe quais magias e poções existem por vocação e
   level; o recomendado é calculado disso, e o arnês de balanço (`estagiarioSimKit.ts`) vira asserção de CI.

## 3. O laço de cada tick (alvo)

1. **Sentir**: um instantâneo puro — vida, mana, o que falta, recargas restantes por canal, ameaças ordenadas por
   distância e vida, aliados, poções bebíveis na mochila, comida, posição, zona segura, NPC aberto.
2. **Decidir**: uma função pura no `shared` — instantâneo + perfil entram, sai `{ pocao, magia, ataque, movimento,
   motivos }`. Testável em tabela, sem servidor.
3. **Agir**: cada canal executa a sua ação; recusa vira linha no diário e um pequeno recuo para não insistir todo tick.
4. **Comunicar**: estado ao cliente quando muda; alarmes quando passam de um limiar.

Perfil de cura com três números por vocação: emergência, conforto e reserva de mana. Abaixo da emergência, poção e magia
juntas e, se nada está pronto, o personagem se afasta do bicho mais perto. Entre emergência e conforto, a melhor
cobertura por custo. Mana abaixo da reserva, poção de mana, só se o canal de poção não está servindo a vida. Com Escudo
de Mana, a mana é a vida: a reserva sobe e a prioridade inverte sozinha. Buffs só quando o canal de magia não está
ocupado com cura. A reserva de mana do ataque vira "duas vezes a cura mais cara", que acompanha o level.

## 4. Interface (alvo)

- **Modo simples** com três presets (Seguro, Equilibrado, Agressivo) e três deslizadores.
- **Modo avançado** com a lista de regras de hoje, para quem gosta de ajustar.

## 5. Etapas (cada uma já melhora a caça e o simulador mede o ganho)

| Etapa | O quê | Status |
|---|---|---|
| 1 | Cura salva por personagem (com Ataque e Buffs) e ligada pela rota; diário de decisões na janela | ✅ 2026-11-02 |
| 2 | Canais independentes: poção e magia de cura no mesmo tick; buff só com o canal de magia livre | ✅ 2026-11-02 |
| 3 | Perfil por nome (`preset`) no save e a política de cura por cobertura/custo (3 números por vocação) | ✅ 2026-11-02 |
| 4 | Modo simples (presets + deslizadores) e modo avançado (regras) | ✅ 2026-11-02 |

Tudo na mesma PR ("Estagiário v3": dono aprovou a etapa 1 e depois "Faça as etapas 2 a 4").

## 6. Etapa 1 — o que foi feito

- **Interruptores salvos** (`CharacterData.estagiario.ligado = { cura?, ataque?, buffs? }`, só os `true`):
  `EstagiarioSystem.load` restaura; `saved` grava a escolha do jogador (não o que a rota liga por tabela). Na queda ou
  ao fechar o cliente, `desligarTudo` agora só **suspende** (`suspenso`): nada age, a rota desliga e a gravação se
  perde, mas os interruptores ficam para o save; `reconectou` (WorldRoom.onReconnect) volta a agir. Ao entrar ou
  reconectar com algo ligado, **carência** de 3 s (`CARENCIA_LOGIN_MS`) antes de agir; ligar algo à mão zera a carência.
- **Cura ligada pela rota** (`curaLigada = cura || rota`), como Ataque e Buffs; o interruptor fica travado com
  "ligada pela rota" enquanto a rota roda.
- **Diário** (`DiarioItem { t, canal, texto }`, `DIARIO_MAX = 50`, S2C `EstagiarioDiario { itens, tudo? }`, uma
  mensagem por tick com as linhas novas; `tudo` ao reconectar): cada poção ("vida 42 % → poção de vida, +450") e cura
  ("vida 30 % → Limpar Feridas, +96"), "esperando" com os motivos (poção em recarga, nenhuma poção que você possa
  beber, magia em recarga/sem mana/acima do level) no máximo a cada 2 s, "a Cura está desligada" com a vida abaixo de
  uma regra a cada 10 s, buffs, comida, rota (ligada, pausada, desligada com o motivo: turno, morte, zona de proteção,
  pontos travados, Coliseu, saiu do jogo, rota apagada), interruptores e alarmes (mesmo os que o jogador desligou).
  Aba **Diário** na janela, a linha mais nova em cima.
- Texto da aba Buffs corrigido (a frase "sobra mana para a cura" era da v1; na v2 o buff só exige a própria mana).

Decisão que contraria a spec de 01/11 ("Desconectou / fechou o cliente: cura e ataque desligam"): aprovada pelo dono em
2026-11-02 ("Pode fazer a etapa 1").

## 7. Etapa 2 — canais

`EstagiarioSystem.curar` devolve `{ pocao, magia }`: a poção (vida ou mana) e a magia de cura (própria ou de grupo)
são recargas diferentes e saem no mesmo tick. No modo avançado as regras de poção e as de magia viram duas listas,
cada uma com "a primeira que vale e está pronta" (a ordem dentro de cada lista continua a do jogador); no modo simples
a política decide os dois canais de uma vez. O buff só espera a magia de cura (mesma recarga global), não a poção. O
ataque continua depois (a recarga global o separa da cura por magia).

## 8. Etapa 3 — perfil por nome e a política de cura

- `EstagiarioConfig` ganha `modo` ("simples" | "avancado"), `preset` ("seguro" | "equilibrado" | "agressivo" | null)
  e `perfil { emergencia, conforto, reserva }` (% de vida/mana). `estagiarioPadrao` = simples/equilibrado.
- **Presets por vocação** (`perfilDoPreset`), partindo dos limiares medidos na v2 (poção a 50/60 %, cura própria a
  35 %, reserva 25/30/35):

  | Preset | Cavaleiro | Paladino | Magos (feiticeiro, druida, fada) |
  |---|---|---|---|
  | Seguro | 40 / 65 / 35 | 40 / 70 / 40 | 40 / 65 / 45 |
  | Equilibrado (padrão) | 30 / 50 / 25 | 30 / 60 / 30 | 30 / 55 / 35 |
  | Agressivo | 20 / 40 / 20 | 20 / 50 / 25 | 25 / 45 / 30 |

- **Política** (`decidirCura(situacao, perfil)`, pura, no shared): abaixo da emergência, poção e a magia de cura mais
  forte pronta, juntas; entre a emergência e o conforto, a magia se cobre ≥ `COBERTURA_MAGIA` (60 %) do que falta e
  ainda sobra a reserva de mana, senão a poção, senão a magia que houver; colega de grupo abaixo do conforto → cura em
  grupo (se a magia não foi precisa para si); mana abaixo da reserva → poção de mana, se o canal de poção está livre;
  com o Escudo de Mana a mana é a vida (limiar da poção de mana = conforto; na emergência de mana ela passa na frente da
  de vida, a não ser que a vida também esteja na emergência). O que segurou vira `motivos` (diário: "esperando").
- **Situação** montada no servidor (`curarSimples`): poções prontas e quanto recuperam (`InventorySystem.potionAmount`,
  a mesma escolha do `usePotion` com `cobrir`), magias de cura própria até o level com a cura esperada
  (`curaEstimada`, a fórmula sem a variação, com o `magicLevel` do jogador) e o custo (`spellMana`), a cura em grupo e
  se há colega abaixo do conforto ao alcance, o escudo (`conditions.has(id, "manashield")`).
- **Configuração efetiva** (`configEfetiva`): no simples, ataque/buffs/distância recomendados da vocação e
  `reservaMana = perfil.reserva`; as listas do jogador ficam guardadas para o avançado. A ideia "reserva do ataque =
  2× a cura mais cara" foi descartada: com o pool de mana do cavaleiro daria 50 % e mataria o Giro Feroz (a reserva
  medida é 20–25 %).
- **Save compacto** (`compactar`): só o que difere do padrão da vocação; o preset vai pelo nome (sem os números); os
  números próprios vão com `preset: null`; as listas só quando mexidas; `modo` vai junto de qualquer coisa (o sanitize
  deduz o modo das listas quando ele não está lá — save de antes da v3). `CharacterData.estagiario.config` passa a
  `Partial<EstagiarioConfig>`.
- **Migração**: save sem `modo` com listas iguais ao recomendado → simples; personalizado → avançado com as regras de
  antes (o jogador escolhe o simples na aba Perfil quando quiser). O cavaleiro do dono (poção < 80 %) fica no avançado.

### Medido (estagiarioBalance.test.ts, soma lv 20/40/60, 4 monstros, 4 min, poções infinitas)

| Vocação | Simples equilibrado | v2 avançado | Antes (v1) | Seguro (vida mín., soma) × equilibrado | Agressivo (abates) |
|---|---|---|---|---|---|
| Cavaleiro | 159 | 154 | 78 | 154 × 123 | 153 |
| Paladino | 153 | 147 | 112 | 161 × 134 | 153 |
| Feiticeiro | 143 | 128 | 135 | 96 × 108 | 142 |
| Druida | 132 | 137 | 119 | 144 × 96 | 138 |

Sem mortes em nenhum preset com poção de mana. Nos magos a vida mínima é a rajada de quando o escudo cai (caótica por
cenário): o seguro é conferido pela soma geral (555 × 461) e no cavaleiro/paladino; o agressivo chega a 5 % no
feiticeiro lv 40/60 — a dica do preset avisa. Sem poção de mana os magos rendem 5–12 abates por level (como na v2: o
escudo come a mana).

## 9. Etapa 4 — a janela

Aba **Perfil** (a primeira): interruptor "Modo avançado"; no simples, os três presets como rádio (com a dica de cada
um), "Números seus" quando um deslizador foi mexido, os deslizadores Emergência / Conforto / Reserva de mana (com o
número ao lado; a faixa vale no Aplicar: emergência 5–60, conforto 10–90 e pelo menos 5 acima da emergência, reserva
0–60), a descrição do que o bot faz com os números (`descricaoPerfil`) e "Comer sozinho". As abas Cura, Ataque e Buffs
só aparecem no avançado (voltar ao simples com uma delas aberta cai no Perfil). O rascunho (`Rascunho`) ganha `modo`,
`preset` e `perfil`; mexer num deslizador zera o preset (senão o servidor guardaria os números do preset, não os seus).

## 10. Caçar com amigo (2026-11-02)

Dono: "Tem como colocar alguma opção para caçar com amigo?". A base já existia (grupo com XP compartilhada e loot
dividido; "Seguir um jogador" pelo clique direito; o Estagiário já olhava o grupo na cura em grupo e no alarme de jogador
perto). Decisões do dono: **gasta turno** como a rota (é caça sem ninguém no teclado, com crachá e acompanhante); **só no
mesmo grupo** (onde XP e loot já se dividem); o seguidor **prefere o alvo do colega** (se ao alcance da busca; senão o
mais perto); o **líder com rota espera**.

- **Protocolo**: `EstagiarioToggleMsg.seguir` (id do colega | null); `EstagiarioEstadoMsg.seguindo { id, nome } | null`;
  alarme novo `colega`.
- **Servidor** (`ligarSeguir` / `pararSeguir` / `tickSeguir` / `andarSeguindo`): validações (vivo, no jogo, mesmo grupo,
  a até `SEGUIR_MAX_TILES` = 15, turno, não gravando); liga como a rota (crachá, acompanhante, perseguição forçada com
  "manter distância"), um ou outro (a rota desliga o seguir e vice-versa). Sem alvo, `fight.follow` (o seguir do
  FightMode, sem aviso); com alvo vivo, `cancelFollow` — senão o seguir ganharia da perseguição no tick do FightMode — e
  o recuo de "manter distância" vale. Para com alarme se o colega morre, sai do grupo, sai do jogo ou fica a mais de 15
  tiles por `SEGUIR_SUMIU_MS` = 10 s (motivo "Fulano está longe" enquanto isso); morrer, cair e o Coliseu também param;
  a zona de proteção não (o colega foi ao depot e volta). Pausa por movimento manual/NPC como a rota
  (`acompanharPausa`, comum às duas). `alvoDoColega`: o monstro selvagem que o colega mira, a até `BUSCA_TILES`, não
  largado, vence o "mais perto".
- **Líder espera** (`esperarSeguidores`, chamado em `andar` antes da progressão dos pontos): com seguidores vivos do
  grupo a mais de `ESPERAR_TILES` = 8, a rota para de andar (segue lutando e curando) até todos estarem a até
  `ESPERAR_PERTO_TILES` = 4; desiste depois de `ESPERAR_MAX_MS` = 30 s por vez (um seguidor preso não prende a rota) e
  só espera de novo depois de todos chegarem perto; o relógio de "ponto travado" não anda enquanto espera. Motivo
  "esperando Fulano"; diário "esperando" / "cansou de esperar".
- **Cliente**: seção "Caçar com um colega" na aba Rota (lista do grupo com retrato, vocação e level; Seguir / Parar de
  seguir; sem grupo, o aviso explica o convite pelo clique direito); cabeçalho "Seguindo Fulano"; resumo no trilho.
- Fica para depois (ES-17): voltar a pé depois de um teleporte do colega; a espera em comboio de três.

## 11. A janela repensada (dono: "uma interfacezinha melhor com as melhores práticas de ui/ux")

Princípios aplicados (`estagiario.css`, `EstagiarioWindow.tsx`): hierarquia — o estado (o que roda, pausa, ponto, motivo)
é a primeira linha do cabeçalho, com o botão **Parar** ao lado e o turno como barra de progresso com números
tabulares; os interruptores vêm embaixo com a dica "ligada pela rota / pelo colega". Seções com título em cada aba
(Perfil de caça / Ajuste fino; Rotas gravadas / Caçar com um colega). Cartões de preset com nome, dica à vista e o selo
"padrão" no Equilibrado (rádio acessível). "Modo avançado" deixa de ser a primeira coisa da aba e vira a última linha.
Diário com chips de filtro e um ponto colorido por canal; contador de linhas novas na aba. Estados vazios que dizem o
que fazer. Foco visível pelo teclado em tudo que se clica; transições só nas propriedades que mudam (nunca `all`);
escala 0,96 ao apertar; `text-wrap: pretty` nas notas; `prefers-reduced-motion` desliga animações e transições;
retratos com contorno de 1 px a 10 % de branco. Os ids de teste existentes foram mantidos.
