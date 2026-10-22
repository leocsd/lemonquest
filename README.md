# The Lemon Quest

<!-- PR de teste: linha adicionada só para validar o fluxo de pull request. -->

Jogo multiplayer no navegador, inspirado em Tibia, feito para jogar com a galera na rede do escritório (~10 jogadores).
Monorepo com npm workspaces:

- `packages/shared` - tipos e regras compartilhados
- `packages/server` - servidor (Node 24 + Colyseus 0.18 + SQLite)
- `packages/client` - cliente (Vite + Phaser + Preact)

## Como jogar

Abra o endereço do servidor no navegador (ex.: `http://192.168.0.10:2567`). Na primeira vez, "Criar conta" (nome da
conta e senha de no mínimo 6 caracteres); depois crie até 5 personagens na conta (nome e vocação) e escolha com qual
jogar.
Esqueceu a senha? Peça um código a um admin e use "Esqueci minha senha". Para excluir um personagem: "Excluir" no cartão
dele, na lista de personagens (pede o nome e a senha da conta; não funciona com ele online ou treinando offline).

| Ação | Controle |
| --- | --- |
| Andar | `W A S D`, setas ou teclado numérico (7/9/1/3 = diagonais) |
| Andar até um ponto | clique esquerdo no chão |
| Atacar / soltar alvo | clique (esquerdo ou direito) na criatura |
| Falar com NPC | clique no NPC |
| Largar item no chão | arraste da mochila/equipamento para o mundo (até 3 tiles; pilhas abrem uma barrinha para escolher a quantidade) |
| Pegar item do chão | clique direito, duplo clique ou `Ctrl`+clique no item (ou arraste para a mochila) |
| Olhar (detalhes de criatura, jogador, NPC, baú ou item do chão) | os dois botões do mouse juntos, ou `Shift`+clique |
| Mover item no chão | arraste o item para outro tile (até 3 tiles de você, linha livre; `Shift` numa pilha escolhe quanto) |
| Magias da barra | `1`–`0` por padrão (ou digite as palavras mágicas no chat, ex.: `exura`) |
| Escolher a tecla de cada magia | `H` (ou ⚙ no fim da barra): até 12 atalhos, qualquer tecla livre, também com `Shift`; salvo no personagem |
| Poção de vida / mana | `Q` / `E` |
| Seguir o alvo | `F8` |
| Ataque automático (escolhe sozinho o monstro mais próximo) | `F9` |
| Seguir um jogador | clique direito no jogador (no mundo ou na Batalha) → *Seguir*; quadrado verde marca quem você segue (andar, atacar ou `Esc` cancela) |
| Atacar um jogador (PvP, fora da zona de proteção) | clique direito no jogador → *Atacar*, ou clique nele na Batalha |
| Viajar Vila ↔ Posto da Fronteira ↔ Porto Esperança | fale com o cocheiro (portão leste da Vila / sul do Posto) ou com a Capitã Marina (barco, no Porto) |
| Abrir baú de quest / puxar alavanca | clique no baú ou na alavanca (o personagem anda até o lado) |
| Chat | `Enter` · comandos do chat (grupo etc.): `/ajuda` |
| Modo de luta | `F5` ofensivo, `F6` equilibrado, `F7` defensivo |
| Mapa | `M` |
| Volume / mudo | botão ♪ na barra de botões à direita |
| Ajuda com todos os atalhos | `F1` ou `?` |

**Quests do mundo (estilo Tibia):** baús de quest dão o prêmio uma vez por personagem; quando há vários baús juntos,
você escolhe um e os outros ficam vazios. Portas com fechadura pedem level ou uma missão concluída (quem não pode bate e
volta). Na Cidadela de Ferumbras, a Aniquilação precisa de quatro jogadores de lv 100+ nas placas para alguém puxar a
alavanca.

Itens no chão somem em 10 min (raros ou melhores: 20 min). Eles sobrevivem a um reinício do servidor, mas o tempo com
o servidor desligado também conta.

Não use a mesma senha do trabalho: a rede do escritório não é criptografada (HTTP).

## Administradores

Admin = personagem listado em `LEMONQUEST_ADMINS` (vírgulas, sem diferença de maiúsculas: `"Leonardo, Ana Maria"`).
Esses nomes ficam **reservados**: só as contas listadas em `LEMONQUEST_ADMIN_ACCOUNTS` (login, vírgulas) conseguem criar um
personagem com eles (inclusive variantes com/sem acento). Um personagem admin que já existe não é afetado.
Os comandos de admin funcionam **também em produção** (os de dev — `/level`, `/item`... — continuam só com
`LEMONQUEST_DEV_COMMANDS=1` e nunca em produção). Para quem não é admin, todos respondem "Comando desconhecido.".
As respostas aparecem só para o admin (aviso + linha no chat). Toda ação fica no log do servidor com `[admin]`.

| Comando | O que faz |
| --- | --- |
| `/online` | Lista quem está online (com level). |
| `/kick <nome> [motivo]` | Desconecta o jogador; o motivo aparece na tela dele. |
| `/mute <nome> <minutos>` | Silencia no chat (magias continuam). Vale após relogar; funciona com o personagem offline. |
| `/unmute <nome>` | Tira o silêncio. |
| `/anuncio <texto>` | Faixa grande no centro da tela de todos + linha no chat. |
| `/tp <nome>` | Leva você para perto do jogador. |
| `/resetsenha <conta>` | Gera um **código de recuperação** (8 caracteres, vale 24 h, uso único) — só você vê. Passe para o dono da conta, que usa em "Esqueci minha senha" na tela de login. |

Nomes com espaço funcionam (`/kick Ana Maria spam`). Sem nenhum admin online, o dono do servidor gera o código pelo terminal:

```bash
npm run admin -- reset-password <conta>          # na pasta do projeto (usa LEMONQUEST_DB ou data/lemonquest.db)
npm run admin -- deleted                         # lista personagens excluídos (arquivo deleted_characters)
```

Docker: veja [deploy/docker/README.md](deploy/docker/README.md#9-administração).

## Desenvolvimento

```bash
npm ci
npm run dev          # servidor em :2567 + cliente (Vite) em http://localhost:3000
npm run typecheck
npm test
```

O Vite escuta só em `localhost`; para testar de outra máquina use `LEMONQUEST_DEV_LAN=1 npm run dev`.

### Testes E2E (Playwright)

```bash
npx playwright install chromium   # uma vez
npm run test:e2e                  # builda o cliente, sobe um servidor de teste e roda e2e/*.spec.ts no Chromium headless
npx playwright show-report        # relatório HTML (playwright-report/); screenshots de falhas em test-results/
```

- O `playwright.config.ts` sobe o próprio servidor (`e2e/start-server.mjs`) na porta **2851** (`E2E_PORT` muda), com
  banco e backups temporários em `%TEMP%/lemonquest-e2e-<porta>` (apagados a cada execução). Não toca no jogo de verdade.
- Ele roda com `NODE_ENV=test LEMONQUEST_E2E=1`: o servidor entrega o cliente buildado (como em produção) e desliga o
  limite de contas novas por IP; os comandos de dev (`/level`, `/tp`, `/item`…) valem para os nomes de teste
  (`e2e/names.ts`). Esse modo **nunca** liga com `NODE_ENV=production` nem sem a variável explícita.
- O cliente expõe `window.__lq` (estado do jogo e tile → pixel) só com `?e2e` na URL; os testes usam isso para clicar
  e arrastar no mundo como um jogador.
- `E2E_SKIP_BUILD=1` pula o build do cliente; `E2E_SNAPS=1` salva capturas de revisão em `test-results/snaps/`;
  `--trace on` grava traces (desligados por padrão: deixam o carregamento muito lento com vários workers).
- Rodar um arquivo/teste: `npm run test:e2e -- e2e/arena.spec.ts -g "solo"`.

### Robô novato (regressão da primeira missão)

```bash
npm run newbie                          # sobe um servidor de teste próprio e roda as 4 vocações (sai com erro se alguma não entregar a missão)
node tools/newbie.mjs --voc druid --limit 120 --out shots   # só uma vocação, com capturas
```

### Peso dos testes no PC

O Playwright usa **1 worker** por padrão (cada teste abre 1–2 navegadores; vários em paralelo travam PCs comuns).
Suba com `E2E_WORKERS=3 npm run test:e2e` se a máquina aguentar. O Vitest usa metade dos núcleos (`VITEST_MAX_WORKERS`).

### Teste de carga

```bash
E2E_PORT=2872 E2E_SKIP_BUILD=1 node e2e/start-server.mjs                 # servidor de teste (outro terminal)
node tools/loadtest.mjs http://127.0.0.1:2872 --bots 10 --secs 130         # bots andam, atacam e falam
```

O desempenho sai no log do servidor (`[tick] … média X ms, máx Y ms`, a cada 60 s fora de produção).

### Fuzz do protocolo

```bash
E2E_PORT=2872 E2E_SKIP_BUILD=1 E2E_ADMINS="Fuzz Inv" node e2e/start-server.mjs                   # outro terminal
node tools/fuzz.mjs http://127.0.0.1:2872 --mode proto --secs 90                                 # lixo em todas as mensagens
node tools/fuzz.mjs http://127.0.0.1:2872 --mode inventory --secs 180 --name "Fuzz Inv"          # mochila/equip/depot
```

O servidor não pode cair nem registrar exceção (confira o log); no modo `inventory` a soma de cada item nunca passa
do inicial e nenhum uid se repete (sai com código 1 se acontecer).

### Auditoria e roadmap

Diagnóstico técnico/gameplay em [docs/GAME_AUDIT.md](docs/GAME_AUDIT.md), prioridades e status em
[docs/GAME_ROADMAP.md](docs/GAME_ROADMAP.md), estratégia e resultados de testes em [docs/TEST_PLAN.md](docs/TEST_PLAN.md),
mudanças em [CHANGELOG.md](CHANGELOG.md).

## Produção (servidor do escritório)

```bash
npm ci
npm run build        # gera packages/client/dist (só os assets usados, ~20 MB)
npm run start:fast   # inicia o servidor em produção (serve o cliente na mesma porta)
npm start            # build + start
```

Em produção o servidor serve tudo na porta 2567 (`PORT` para mudar).

**Guia completo para Windows (serviço, firewall, backups, atualização):** [deploy/windows/README-DEPLOY.md](deploy/windows/README-DEPLOY.md)

**Com Docker (Windows, Linux ou Mac):** `docker compose up -d --build` — guia em [deploy/docker/README.md](deploy/docker/README.md).
