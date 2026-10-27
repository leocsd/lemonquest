# The Lemon Quest

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
| Mover item no chão | arraste o item para outro tile (até 3 tiles de você, linha livre; longe, o personagem anda até o item e move ao chegar; numa pilha, aperte `Shift` **depois** de começar a arrastar para escolher quanto — `Shift`+clique é olhar) |
| Magias da barra | `1`–`0` por padrão (ou digite as palavras mágicas no chat, ex.: `exura`). Só aparece o que o seu level já libera |
| Família de magias (◆) | uma tecla para várias magias do mesmo tipo (ataque no alvo, área, onda): sai a mais forte que estiver pronta, com mana e no alcance. Na barra, magia de alvo fica avermelhada com o alvo longe e apagada sem alvo |
| Magias: a tecla de cada magia | `H` (ou ⚙ no fim da barra): a barra aparece em grande; clique num slot e escolha a magia na grade com ícones, ou arraste o tile para o slot; arraste os slots para reordenar (◀ ▶ no painel fazem o mesmo) (até 12 atalhos, qualquer tecla livre, também com `Shift`; salvo no personagem). "Trocar tecla" captura a nova; "Recomendado" monta a barra com as famílias; magia nova entra sozinha numa tecla livre |
| Montar os seus grupos de magia | `H` → **+ Novo grupo** (ou **Copiar ◆ família**): até 8 grupos com as magias e a ordem que você quiser (lista numerada com ↑↓, "Mais forte primeiro"); a tecla solta a primeira da lista que estiver pronta. "Pôr na barra" põe o grupo numa tecla livre |
| Poção de vida / mana | `Q` / `E` (a que mais recupera entre as que o seu level permite) |
| Guardar / retirar no depot | com o depot aberto, clique direito ou duplo clique no item (junta na pilha igual que tiver espaço) |
| Organizar / buscar no depot | botão **Organizar** (junta as pilhas iguais e ordena por tipo e nome, sem mexer em raridade nem refino) e o campo de busca (sem acento, filtra pelo nome) |
| Seguir o alvo (gruda no monstro, qualquer vocação) | `F8` |
| Ataque automático (escolhe sozinho o monstro mais próximo) | `F9` |
| Seguir um jogador | clique direito no jogador (no mundo ou na Batalha) → *Seguir*; quadrado verde marca quem você segue (andar, atacar ou `Esc` cancela) |
| Atacar um jogador (PvP, fora da zona de proteção) | clique direito no jogador (mundo ou Batalha; o mesmo menu) → *Atacar*, o último item, em vermelho; ou clique nele na Batalha |
| Viajar Vila ↔ Posto da Fronteira ↔ Porto Esperança | fale com o cocheiro (portão leste da Vila / sul do Posto) ou com a Capitã Marina (barco, no Porto) |
| Abrir baú de quest / puxar alavanca | clique no baú ou na alavanca (o personagem anda até o lado) |
| Chat | `Enter` · comandos do chat (grupo etc.): `/ajuda` |
| Eventos da semana | botão **Agenda** (calendário) no trilho à direita, ou o selo "Próximo: …" no topo; no chat (todos): `/agenda` (a semana, um dia por linha) e `/evento` (o que vale agora e o próximo). Aviso no chat e no título da aba 10 min antes de cada evento |
| Modo de luta | `F2` ofensivo, `F3` equilibrado, `F4` defensivo (`F5` continua sendo o "atualizar" do navegador) |
| Mapa | `M` |
| Janelas | `I` equipamento/mochila · `K` habilidades · `O` roupas · `L` missões · `J` conquistas · `R` ranking · `B` bestiário |
| Volume / mudo | botão ♪ na barra de botões à direita |
| Painéis da barra lateral | arraste o cabeçalho para reordenar; 📌 fixa o painel (fica visível com a barra recolhida); a borda de baixo de Batalha/Mochila muda a altura (duplo clique: padrão) |
| Minimapa | roda do mouse: zoom; clique no relógio: efeitos de luz (dia/noite) |
| Botão direito em você | trocar roupa · pegar item do chão · sair do grupo · trocar personagem (volta à lista de personagens da conta) |
| Ajuda com todos os atalhos | `F1` ou `?` |

Na lista de batalha e no "olhar": `★` antes do nome é criatura **elite** (a cor do nome continua dizendo a dificuldade
para o seu level), `!` é perigosa e `⚑` chama o bando quando atacada; o "olhar" também diz a família do bando e se a
criatura foge com pouca vida.

**Quests do mundo (estilo Tibia):** baús de quest dão o prêmio uma vez por personagem; quando há vários baús juntos,
você escolhe um e os outros ficam vazios. Portas com fechadura pedem level ou uma missão concluída (quem não pode bate e
volta). Na Cidadela de Ferumbras, a Aniquilação precisa de quatro jogadores de lv 100+ nas placas para alguém puxar a
alavanca; cada personagem entra uma vez por dia (o dia troca às 6h, como as recompensas diárias).

Itens no chão somem em 10 min (raros ou melhores: 20 min). Eles sobrevivem a um reinício do servidor, mas o tempo com
o servidor desligado também conta.

Não use a mesma senha do trabalho: a rede do escritório não é criptografada (HTTP).

## Administradores

Admin = personagem listado em `LEMONQUEST_ADMINS` (vírgulas, sem diferença de maiúsculas: `"Leonardo, Ana Maria"`).
Esses nomes ficam **reservados**: só as contas listadas em `LEMONQUEST_ADMIN_ACCOUNTS` (login, vírgulas) conseguem criar um
personagem com eles (inclusive variantes com/sem acento). Um personagem admin que já existe não é afetado.
Os comandos de admin funcionam **também em produção** (os de dev — `/level`, `/item`... — continuam só com
`LEMONQUEST_DEV_COMMANDS=1` e nunca em produção). Para quem não é admin, todos respondem "Comando desconhecido.", exceto
o `/evento`, que para qualquer jogador só mostra o que vale agora e o próximo (como o `/agenda`).
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
| `/status` | Fotografia do servidor: online, monstros, tick, memória, autosave e a progressão medida (horas por level, mortes e ouro por faixa). |
| `/evento <nome> [minutos]` · `/evento parar` | Liga um evento semanal fora do horário (sem argumentos lista os eventos e o estado). Quem não é admin só lê o estado. |
| `/desbloquear <nome> <roupa\|addon\|título>` | Libera uma roupa, addon ou título para um personagem (ex.: `pirata`, `pirata_chapeu`, `title:persistente`). |
| `/vincular <personagem> <apelido\|id do ClickUp>` · `/vincular <personagem> nenhum` | Liga o personagem a um usuário do ClickUp (apelido da equipe, ex.: `pedrao`, `Lucas P.`, ou o id numérico): tarefas que ele fechar **a partir de agora** contam nas conquistas de tarefas. Sem argumentos lista os vínculos. Funciona com o personagem offline. |

Nomes com espaço funcionam (`/kick Ana Maria spam`). O `/status` mostra também a última leitura do ClickUp.
Sem nenhum admin online, o dono do servidor gera o código pelo terminal:

```bash
npm run admin -- reset-password <conta>          # na pasta do projeto (usa LEMONQUEST_DB ou data/lemonquest.db)
npm run admin -- deleted                         # lista personagens excluídos (arquivo deleted_characters)
npm run admin -- telemetria                      # progressão por faixa e por vocação (XP/h, abates/h, dano/h, % resistido, mortes/h), skills reais e causas de morte
```

Docker: veja [deploy/docker/README.md](deploy/docker/README.md#9-administração).

### ClickUp no jogo (opcional)

Com `LEMONQUEST_CLICKUP_TOKEN` (token pessoal do ClickUp, só leitura) o servidor lê o ClickUp a cada
`LEMONQUEST_CLICKUP_POLL_MIN` minutos (padrão 5), **fora do tick**, e mostra no jogo, sempre passando pelo filtro de
disfarce (`shared/workFilter.ts`: cliente real vira apelido, tarefa com termo sensível some inteira):
**"📦 Chegou!"** quando uma compra entra em "pedidos entregues" (com Caixa de Encomenda no chão, até 3 por hora),
**barras da sprint** e a aba **"Na obra"** no Painel da Obra e no Quadro de Gestão à Vista, o evento **Sprint Fechada**
(XP ×1,25 por 1 h, multiplicado com o evento que estiver valendo: Noite de Caçada ×2 vira ×2,5) quando a semana alcança a média das 4 anteriores, e as **conquistas de tarefas** de quem
vinculou o próprio ClickUp (abaixo) ou foi vinculado por um admin com `/vincular`. Sem token, nada disso liga e o jogo fica igual. Erro de rede: tenta de novo com espera
crescente (até 30 min). `LEMONQUEST_CLICKUP_TEAM` e `LEMONQUEST_CLICKUP_PURCHASES_LIST` trocam o workspace e a lista
de compras (padrões em `shared/data/workProjects.ts`).

**Vincular o seu ClickUp (cada jogador, sem admin):** tarefas que você fechar no ClickUp a partir do vínculo contam nas
conquistas de tarefas (1/10/50/200, com títulos).

1. No ClickUp: avatar → **Configurações** → **Apps** → **API Token** → gere (ou copie) o token pessoal (`pk_…`).
2. No jogo: fale com o **Quadro de Gestão à Vista** (Oficina) ou o **Painel da Obra** (Estação Central da Malha), aba
   **"Na obra"** → **Vincular meu ClickUp**, cole o token e clique em **Vincular**.
3. O servidor confere quem é você (`GET /user`), se a conta é do workspace da Embeddo e se o e-mail é `@embeddo.io`,
   grava só o **id** do seu usuário no ClickUp e **descarta o token na hora**: ele não vai para banco, log nem tela.
   Um usuário do ClickUp conta para um personagem só (vincular em outro tira do anterior). **Desvincular** fica no mesmo
   lugar. Até 5 tentativas a cada 10 min por personagem.

> O jogo roda em HTTP (sem criptografia) na rede do escritório, então o token passa **uma vez** pela LAN ao vincular.
> O jogo não guarda o seu token; por isso, se quiser, **gere outro no ClickUp depois de vincular** (o antigo deixa de
> valer e o vínculo continua). O vínculo funciona mesmo sem `LEMONQUEST_CLICKUP_TOKEN`, mas as tarefas só contam
> quando o ClickUp do servidor estiver ligado.

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
mudanças em [CHANGELOG.md](CHANGELOG.md). Auditorias completas ficam como snapshot datado em `docs/audit/<data>/`
(a de 2026-10-22 tem o plano de evolução e a baseline de validação). Guia para sessões do Claude Code: [CLAUDE.md](CLAUDE.md).

### Fumaça contra um servidor no ar

```bash
npm run smoke -- http://127.0.0.1:2567 [--drop | --expect-ground] [--user nome]
```

Cria (ou reaproveita) conta e personagem, entra no mundo pelo SDK e confere a sincronização do estado; `--drop` larga um
item no chão e espera vê-lo; `--expect-ground` falha se não houver item no chão (usado depois de reiniciar o servidor).
O CI roda isto contra o bundle e contra a imagem Docker.

## Produção (servidor do escritório)

```bash
npm ci
npm run build        # gera packages/client/dist (assets curados, ~17 MB) e o bundle do servidor
npm run start:fast   # inicia o servidor em produção (serve o cliente na mesma porta)
npm start            # build + start
```

Em produção o servidor serve tudo na porta 2567 (`PORT` para mudar).

O build copia só o que o jogo usa (`tools/build-public.mjs`): do áudio do pack entram apenas os 45 sons referenciados
em `sfx.ts` (o build falha se um som citado não existir), e os previews do mapa (`assets/maps/preview*.png`,
`assets/maps/review/`) ficam fora do git e do build — o `tools/mapgen` os regenera. O `build:server` também gera
`.gz` (zlib, nível 9) de JS/CSS/HTML e do `world.json` em `packages/client/dist`; o servidor entrega o `.gz` quando o
navegador aceita gzip (`Content-Encoding: gzip`, 1,5 MB → ~70 KB no mapa), sem nenhuma dependência extra. Para conferir:
`curl -H "Accept-Encoding: gzip" -I http://127.0.0.1:2567/maps/world.json`.

**Guia completo para Windows (serviço, firewall, backups, atualização):** [deploy/windows/README-DEPLOY.md](deploy/windows/README-DEPLOY.md)

**Com Docker (Windows, Linux ou Mac):** `docker compose up -d --build` — guia em [deploy/docker/README.md](deploy/docker/README.md).
