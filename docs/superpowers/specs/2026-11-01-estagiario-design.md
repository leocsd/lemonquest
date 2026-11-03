# Estagiário — bot de caça dentro do jogo (design)

Data: 2026-11-01. Dono: "introduzir um bot para farmar automático, igual um elfbot do Tibia 8.6, sem perder a graça".
No tema do escritório, o bot é o **Estagiário**: você o "contrata" para caçar por você.

## Decisões do dono

| Tema | Decisão |
|---|---|
| AFK | Pode ficar sozinho, mas só com o cliente (navegador ou app) aberto e conectado. Fechou ou caiu a conexão: desliga. |
| Rendimento | Igual a jogar (sem redução), por enquanto. |
| Visibilidade | Visível para todos: 🤖 no nome e o personagem do Estagiário ao lado do jogador. |
| Escopo | Tudo desde o começo: cura, ataque, rota de caça e alarmes. |
| Personagem do Estagiário | Só aparece com a **rota de caça** ligada. É só acompanhante: **não ataca, não toma dano, não atrai monstro**; ocupa 1 tile. |
| Turno | ~2 h de rota de caça por dia, recarregando aos poucos. Cura e ataque não gastam turno. |
| Onde | Qualquer lugar (sem restrição de área). |
| Alarmes | Só avisam; a caça continua. |
| Alcance de busca | 12 tiles (o mesmo do ataque automático, `AUTO_SEEK_DIST`, deployado em 2026-11-01). |

## Arquitetura: o "cérebro" fica no servidor

O cliente só configura e mostra. Quem decide e age é o servidor, a cada tick (50 ms), usando os sistemas que já
existem. Motivos: (1) o navegador e o WebView do app adormecem a aba em segundo plano (~1 ação por minuto depois de
alguns minutos), justamente no caso AFK; (2) o turno vira regra que não dá para burlar; (3) reaproveita ataque
automático, modo Seguir, loot automático (`lootFilter`), escolha de poção (`pickQuickPotion`), teclas inteligentes e
grupos de magia (`spellFamilies.ts`), pathfinding e a estrutura das invocações (`summons.ts`).

"Cliente aberto" = sessão conectada. Desconexão (inclusive a espera de reconexão) desliga tudo do Estagiário.

### Peças

- **`packages/shared/src/estagiario.ts`** (puro, com `estagiario.test.ts`): tipos da configuração, limites,
  `sanitizeEstagiario(raw, vocação, grupos)`, conta do turno (`turnoAgora`, `gastarTurno`) e as decisões puras:
  `escolherCura(estado, regras, prontos)`, `escolherAtaque(estado, regras, prontos)`, `proximoPonto(rota, pos, índice)`.
- **`packages/server/src/systems/estagiario.ts`** (`EstagiarioSystem`, com `estagiario.test.ts`): liga/desliga, roda as
  decisões no tick, executa pelas APIs dos sistemas existentes (magias, poções, movimento, combate), gasta o turno,
  grava a rota, emite alarmes. Entra nas listas do tick, `cleanupSession` e `onReconnect` do `WorldRoom` (convenção do
  projeto) e roda dentro de `runSafe`.
- **Personagem do Estagiário**: criatura aliada com dono, no molde das invocações, com marcação própria de
  **acompanhante** (`MonsterDef` novo `estagiario`, com flags que o servidor respeita): invulnerável, nunca é alvo (nem
  de monstro, nem de jogador, nem de magia em área), nunca ataca, não dá XP, não entra na battle list, bloqueia o tile.
  Anda atrás do dono a 1–2 tiles; se ficar a mais de 6 tiles ou o dono atravessar um portal, reaparece ao lado dele.
- **Persistência**: campo opcional `CharacterData.estagiario` (como `lootFilter`): configuração, rotas e o estado do
  turno. Ausente = padrão (nada ligado, turno cheio). **v3 (2026-11-02, etapa 1)**: também `ligado` (Cura, Ataque e
  Buffs voltam como estavam ao entrar; a rota não) — ver `2026-11-02-estagiario-v3-abordagem.md`.
- **Protocolo** (`shared/messages.ts`, validação no servidor e limite em `MESSAGE_LIMITS`):
  - C2S `EstagiarioConfig` (salvar configuração: regras de cura, de ataque, alarmes, rotas renomeadas/apagadas);
  - C2S `EstagiarioToggle` (`{ cura?: boolean; ataque?: boolean; rota?: string | null }`);
  - C2S `EstagiarioGravar` (`{ acao: "iniciar" | "parar" | "descartar"; nome?: string }`);
  - S2C `EstagiarioEstado` (o que está ligado, rota ativa, gravando, pausado e por quê, turno restante em ms);
  - S2C `EstagiarioAlarme` (`{ tipo, texto }`).
- **Estado sincronizado**: `PlayerState.bot` (boolean, true com a rota ligada) para o 🤖 no nome, na battle list e no
  painel Online de todos.
- **Cliente**: janela "Estagiário" (abas Cura, Ataque, Rota, Alarmes) aberta por um botão no trilho; turno restante e
  estado na própria janela e num selo no trilho; 🤖 no nome; alarmes com som, toast e o título/ícone da janela piscando.

## Módulos

### Cura (sempre disponível; não gasta turno)

- Até **6 regras**, avaliadas em ordem a cada tick; a primeira que vale e está pronta sai:
  `{ quando: "vida" | "mana"; abaixoDe: 1..99 (%); acao: { magia: spellId } | { pocao: "vida" | "mana" } }`.
- Magia: só curas que a vocação conjura (`light_heal`, `wound_cleansing`, `divine_healing`, `group_heal`/espelhos).
- Poção: a melhor que o personagem tem e pode usar, pela mesma regra do atalho de poção (`pickQuickPotion`).
- Respeita as recargas existentes (magia 1 s; recarga global de magia; poção: um único relógio para vida e mana, 2 s
  depois de uma poção de vida e 1 s depois de uma de mana).
- Padrão sugerido ao abrir a janela pela primeira vez: vida < 35% → poção de vida; vida < 70% → a cura da vocação;
  mana < 40% → poção de mana.

### Ataque (sempre disponível; não gasta turno)

- Escolha de alvo: a mesma do ataque automático (monstro selvagem mais próximo, com linha de visão, a até 12 tiles,
  fora da zona de proteção). **Nunca escolhe jogador.** Persegue pelo modo Seguir.
- Rotação: até **6 regras** `{ minBichos: 1..8; raio: 1..4; magia: spellId | família | grupo do jogador }`, avaliadas
  em ordem; conta os monstros selvagens vivos a até `raio` tiles do personagem. Família/grupo resolvem a magia pronta
  como as teclas inteligentes já fazem.
- **Reserva de mana**: `reservaMana: 0..90 (%)` — abaixo disso não conjura magia de ataque (sobra mana para a cura).
- Magia de ataque só sai com alvo monstro; se o jogador mirar um jogador manualmente, a rotação fica parada.

### Rota de caça (gasta turno; faz o Estagiário aparecer)

- **Gravar**: "Gravar" → o jogador anda pela caça → "Parar" (pede um nome, até 20 caracteres). O servidor registra um
  ponto quando a direção muda, a cada 6 tiles andados, e quando o jogador é teleportado (o ponto guarda o tile do portal
  pisado, para a rota atravessá-lo de novo). Até **5 rotas** por personagem, até **200 pontos** por rota.
- **Rodar**: o Estagiário anda de ponto em ponto (pathfinding existente). Monstro à vista (12 tiles, linha de visão):
  para, mata (módulo Ataque, ligado automaticamente enquanto a rota roda), o loot sai pelo loot automático do jogador e
  ele retoma do ponto mais próximo. No fim da rota, volta ao primeiro ponto (circuito).
- Ponto inalcançável por **10 s**: pula para o próximo.
- **Pausa** (o turno não gasta enquanto pausado): o jogador andou pelas setas ou clicou no chão — volta sozinho depois
  de **10 s** sem comando manual; janela de NPC aberta — volta quando fecha. Na pausa a perseguição forçada desliga (o
  jogador está no controle) e volta junto com a rota; o alvo é reavaliado do zero ao voltar.
- Com a rota ligada, se o acompanhante sumir do mundo, ele volta ao lado do dono no tick seguinte.

### Alarmes (só avisam; a caça continua)

Cada um com liga/desliga na aba Alarmes (padrão: todos ligados):

| Alarme | Quando |
|---|---|
| Poção acabando | menos de 10 poções do tipo usado nas regras de cura |
| Vida baixa | vida abaixo de X% (configurável, padrão 25%) mesmo com as regras de cura |
| Jogador na tela | outro jogador a até 12 tiles (avisa uma vez por jogador, de novo só se ele sair e voltar) |
| Atacado por jogador | um jogador causou dano no personagem |
| Mensagem privada | chegou mensagem privada |
| Turno acabando | faltam 5 min de turno |
| Mochila cheia | o loot não coube e ficou no chão |
| Você morreu | sempre (não desliga) |

Aviso no cliente: som curto, toast e o título da janela/ícone do app piscando até o jogador focar a janela.

### Turno

- Máximo **2 h** (7.200.000 ms). Gasta em tempo real só com a rota **rodando** (não pausada).
- Recarrega com a rota desligada ou pausada: **5 min por hora** (1/12 do tempo), até o máximo — de vazio a cheio em 24 h.
- Guardado como `{ ms, em }` (restante e o instante da última conta); a recarga é calculada na hora de ler.
- Acabou: a rota desliga, o personagem do Estagiário vai embora, cura e ataque continuam como estavam.

## Desligamentos automáticos

| Evento | Rota | Cura e ataque |
|---|---|---|
| Morte | desliga (alarme "Você morreu") | continuam ligados para a próxima vida |
| Turno acabou | desliga | continuam |
| Entrou na zona de proteção (templo, depot) | desliga | continuam |
| Entrou ou saiu de uma partida do Coliseu | desliga (com aviso) | continuam |
| Desconectou / fechou o cliente | desliga | ~~desligam~~ v3 (2026-11-02): param até reconectar e voltam como estavam (salvos no personagem) |
| Moveu manualmente | pausa 10 s | continuam |
| Janela de NPC aberta | pausa | continuam |

Ao reconectar, nada religa sozinho.

## Fora do escopo (não fazer agora)

Rendimento menor para o bot; arte própria do Estagiário (usa um visual de personagem existente, com o nome "Estagiário
de <nome>"); Estagiário que ataca ou toma dano; reabastecer/vender/depositar sozinho (o "refill" do ElfBot); rotas
compartilhadas entre jogadores; restrição de áreas.

## Testes

- `shared/estagiario.test.ts`: sanitização (limites, magia de outra vocação, rota grande demais), turno (gasto, recarga,
  teto, relógio voltando), `escolherCura` (ordem, recarga, poção ausente), `escolherAtaque` (contagem por raio, reserva
  de mana, família/grupo, nunca jogador), `proximoPonto` (avanço, circuito, retomada pelo mais próximo).
- `server/systems/estagiario.test.ts` (kits `testkit.ts`/`m4kit.ts`): cenário com rato, rota de 3 pontos e poções —
  cura, mata, pega o loot, segue a rota, pausa no movimento manual, gasta turno, desliga ao morrer, na zona de proteção,
  sem turno e ao desconectar; gravação de rota com portal; alarmes emitidos uma vez.
- Personagem do Estagiário: não toma dano (golpe, magia em área), não é alvo de monstro nem de jogador, bloqueia o
  tile, some ao desligar a rota e ao desconectar, reaparece ao lado do dono depois de portal.
- `WorldRoom.test.ts`: validação e limites das três mensagens novas.
- E2E (`e2e/estagiario.spec.ts`, roda no CI): liga cura e rota numa caça de ratos, o 🤖 aparece no nome, o rato morre
  sem comando manual, o turno diminui, desligar remove o Estagiário.

## Documentos a atualizar no fim do ciclo

`CHANGELOG.md`, `docs/GAME_ROADMAP.md` (seção nova "Estagiário"), `docs/TEST_PLAN.md`, `shared/src/data/news.ts`,
`README.md` (controles: janela Estagiário) e a wiki se ela listar sistemas.
