# Janela única "Magias" — gerenciamento de atalhos e grupos (2026-10-27)

## Contexto

Hoje o jogador gerencia magias em duas janelas: **Atalhos** (`H`: linhas `[tecla] [select de magia] [✕]`, captura de
tecla ao clicar) e **Grupos de magia** (botão ◆ nos Atalhos: coluna de grupos/modelos, lista de prioridade com
arrastar/soltar e setas de 22 px, paleta de chips filtrada por tipo). O dono achou ruim: (1) montar e ordenar os grupos
é confuso — não fica claro o que "sai primeiro"; (2) escolher tecla e magia no painel Atalhos é lento (lista suspensa
sem ícone, captura pouco visível); (3) letras de 11–12 px e botões de 22 px são difíceis de ler e acertar.

Decisão do dono (2026-10-27): **caminho A** — uma janela só, desenhada em volta da barra, substituindo as duas.

## Objetivos

- Um modelo mental só: *a barra é a lista de teclas; clico num slot e escolho o que vai nele*.
- Ordem de prioridade do grupo evidente ("1º, 2º, 3º…"), com um clique para a ordem que quase todo mundo quer
  ("Mais forte primeiro") e uma explicação fixa do que a tecla faz.
- Legível e acessível: fonte ≥ 12,5 px (14 px no corpo), alvos ≥ 32 px, foco visível, operação completa pelo teclado,
  integração com "texto maior" e "alto contraste" do jogo.
- Nenhuma mudança de servidor, protocolo ou comportamento da barra em jogo.

## Fora do escopo

Servidor e mensagens (`C2S.SetHotkeys`/`S2C.Hotkeys` ficam iguais), regras de validade (`shared/hotkeys.ts`,
`shared/data/spellFamilies.ts`), famílias prontas (dados), comportamento da barra de ações durante o jogo (arrastar
entre slots, cooldown, alcance), celular/toque (fora do público), tutorial.

## Layout da janela

Tecla `H`, botão ⚙ da barra e `toggleHotkeys()` abrem a janela `SpellsWindow` (`role="dialog"`,
`aria-label="Magias"`), arrastável pela barra de título (`useWindowDrag("spells")`), `Esc` fecha pela pilha de
sobreposições. Largura `min(720px, 100vw − var(--hud-right) − 32px)`, altura máxima `calc(100vh − 120px)` com o corpo
rolável. Fundo `rgba(17, 20, 28, 0.96)`.

De cima para baixo:

1. **Dica** (uma linha, 13 px): "Clique num slot e escolha o que vai nele. ◆ = tecla inteligente: solta a 1ª magia
   pronta da lista."
2. **Barra em grande** (`.sw-bar`): um slot por atalho, na ordem da lista (`effectiveHotkeys`), mais um slot **"+"**
   enquanto houver menos de `HOTKEY_MAX` (12). Cada slot: 48×48 px com a mesma cara da barra real (tecla no canto
   superior esquerdo, ícone 32 px, ◆ se família/grupo, cadeado "lv N" se bloqueado pelo level) e o **nome embaixo**
   (12,5 px, 2 linhas no máximo, 56 px de largura por coluna). Slot selecionado: borda e brilho dourados. Magia
   bloqueada pelo level **aparece** aqui (na barra real ela só surge ao liberar) — o cadeado explica.
3. **Painel do slot selecionado** (`.sw-slot-panel`): título "Tecla **2** · ◆ Ataque no alvo" (ou "Slot novo" para o
   "+"), botões de 32 px: **Trocar tecla**, **Tirar da barra** e, se for grupo do jogador, **Editar grupo**. Durante a
   captura de tecla, no lugar dos botões aparece a faixa `role="status"` "Aperte a nova tecla — pode usar Shift ·
   Esc cancela"; tecla do jogo recusada mostra "Tecla Q usada por: Poção de vida" na mesma faixa e continua esperando.
4. **Grade de magias** (`.sw-grid`, modo "escolher"): tiles de 64×72 px (ícone 32 px, nome em 12,5 px com 2 linhas,
   rodapé "lv N · M mana"), em três blocos com título: **◆ Meus grupos** (tiles dos grupos + botões "+ Novo grupo" e
   "Copiar família ▾"), **◆ Famílias prontas**, **Magias**. Clicar num tile põe no slot selecionado (`setRowSpell`;
   se já estava em outra tecla, as duas trocam e a mensagem avisa "Já estava na tecla 3: as duas trocaram"). Tile do
   que está no slot selecionado fica marcado; tiles já na barra mostram a tecla (`<kbd>2</kbd>`); tiles bloqueados pelo
   level ficam em cinza com "lv N" em vermelho, mas clicáveis. Com o slot "+" selecionado, clicar num tile cria o
   atalho na próxima tecla livre (`addSlot`). Sem slot selecionado (janela recém-aberta): a grade mostra tudo e
   clicar num tile seleciona o slot onde ele está ou, se não está na barra, cria o atalho (= "+").
5. **Editor de grupo** (`.sw-group`, modo "editar", no lugar da grade): ver seção própria.
6. **Rodapé** (`.sw-foot`): mensagens (`role="status"`, verde/vermelho), contador "8/12 atalhos", botão
   **Recomendado** (barra padrão da vocação via `defaultHotkeys`; pede um segundo clique, "Clique de novo para trocar a
   sua barra pela recomendada", porque descarta a configuração atual).

## Editor de grupo

Abre ao clicar **Editar grupo** (slot com grupo selecionado), **+ Novo grupo** (cria vazio e seleciona) ou **Copiar
família** (menu com as famílias da vocação; cria a cópia e seleciona). Conteúdo:

- **Nome**: campo de 32 px, 15 px de fonte, `aria-label="Nome do grupo"`; vazio durante a digitação não é aplicado
  (regra atual: `draft`).
- **Situação na barra**: "Na tecla **2**" ou botão **Pôr na barra** (`placeGroup`).
- **Explicação fixa** (13 px): "Ao apertar a tecla: tenta a 1ª; se estiver em recarga, sem mana ou fora do alcance,
  tenta a 2ª, e assim por diante."
- **Lista numerada** (`<ol>`): linhas de 40 px com selo "1º/2º/…" (dourado, 14 px), ícone 28 px, nome 14 px, subtítulo
  "lv N · M mana · R s" (12,5 px), selo verde "sai agora" na magia que `pickFromFamily` escolheria neste instante
  (prévia ao vivo, 4×/s, como hoje) e botões de 32 px **↑**, **↓**, **✕** com `aria-label` ("Subir Chama Eterna").
  Arrastar para reordenar continua (código atual), mas não é necessário.
- **Mais forte primeiro**: botão que ordena a lista por level decrescente e, em empate, por mana decrescente
  (`sortStrongest`). Mensagem "Ordenado: a mais forte sai primeiro."
- **Adicionar ao grupo**: os mesmos tiles da grade, só com as magias da vocação fora do grupo (famílias e grupos não
  entram em grupo); clicar põe no fim (`addSpell`). Limite `GROUP_SPELLS_MAX` (8) com mensagem.
- **Voltar à barra** (volta ao modo "escolher", mantendo o slot selecionado) e **Excluir grupo** (dois cliques, como
  hoje; excluir tira o atalho da barra — regra do `sanitizeHotkeys`).

## Legibilidade e acessibilidade

- Tipografia: 14 px no corpo, 12,5 px no secundário, nunca abaixo; cores `--hud-text`/`--hud-muted` (≥ 4,5:1).
- Alvos: botões ≥ 32 px, tiles ≥ 64 px, slots 48 px.
- Foco: `:focus-visible` com contorno de 2 px `--hud-gold` (3 px `#ffe066` em alto contraste, regra já existente).
- Teclado: `Tab` percorre slots → painel → tiles → rodapé; dentro da barra e da grade as **setas** movem o foco
  (tabindex rotativo), `Enter`/`Espaço` ativa; o editor usa botões reais (sem depender de arrastar).
- Leitor de tela: `role="dialog"` com nome, `aria-pressed` no slot/tile selecionado, `aria-live="polite"` nas mensagens
  e na faixa de captura, `aria-label` em todo botão só com símbolo.
- `a11y.css`: `.spells-win .win-body` entra nas listas de `data-text` (zoom 1,15/1,3) no lugar de
  `.hotkeys-win .win-body`; alto contraste já cobre `.hud-card`.
- `prefers-reduced-motion` / `data-motion="reduce"`: sem animação de captura e sem transições nos tiles.

## Arquitetura e arquivos

- **Novo** `packages/client/src/ui/hotkeys/SpellsWindow.tsx` (janela, ~350 linhas) e `spells.css`; componentes
  internos no mesmo arquivo: `BigBar`, `SlotPanel`, `SpellGrid`/`SpellTile`, `GroupEditor`.
- **Removidos** `HotkeysWindow.tsx`, `SpellGroupsWindow.tsx`, `hotkeys.css`, `groups.css`. `Hud.tsx` renderiza
  `<SpellsWindow />`; `hotkeysOpen`/`toggleHotkeys` (em `hotkeys.ts`) continuam sendo o estado de abertura;
  `groupsOpen`/`toggleGroups` somem.
- **Mantidos** `hotkeys.ts` (stores, envio com espera, migração), `edit.ts` e `groupsEdit.ts` (funções puras).
- **Novas funções puras** (com teste ao lado):
  - `edit.ts`: `addSlot(list, vocation, spellId): EditResult` — atalho novo na próxima tecla livre com a magia/grupo
    dado; erro se a barra está cheia ou o id já está na barra (devolve a tecla onde está).
  - `groupsEdit.ts`: `sortStrongest(groups, id): SpellGroup[]` — level decrescente; em empate, `mana` base da magia
    (`SpellDef.mana`) decrescente; ordenação estável (empate total mantém a ordem atual).
- Estado local da janela: `sel: number | "new" | null` (slot selecionado), `mode: "pick" | { group: string }`,
  `capturing: boolean`, `msg`, `confirmReset`, `confirmDel`, `draft` (nome), `dropAt` (arrastar no editor).
- Captura de tecla: mesmo mecanismo do `HotkeysWindow` atual (listener na fase de captura, `pushOverlay` para o Esc,
  cancela ao clicar fora ou focar campo de texto), movido para um hook `useKeyCapture(active, onKey)` no mesmo arquivo.

## Fluxo de dados

Sem mudança: edições chamam `setHotkeys(list)` / `setSpellGroups(groups, list?)`, que sanitizam com as regras do
servidor, atualizam os stores (a barra real redesenha na hora) e agendam um envio (`C2S.SetHotkeys`, 400 ms). O
servidor confirma com `S2C.Hotkeys`; divergência reenvia uma vez (regra atual em `hotkeys.ts`).

## Casos de borda

- Barra cheia (12): slot "+" some; "Pôr na barra" e `addSlot` avisam "A barra está cheia: tire um atalho".
- Grupo vazio na barra: slot mostra o nome com "(vazio)"; a barra real não o mostra (regra atual).
- Excluir grupo que está na barra: o slot some (sanitização) e a mensagem diz "excluído e tirado da barra".
- Tecla já usada por outro slot: as duas trocam (`assignKey`), mensagem avisa; tecla do jogo: recusada com o motivo.
- Magia bloqueada pelo level: configurável; aparece com cadeado aqui e só surge na barra real ao liberar.
- "Recomendado" descarta a barra atual: exige segundo clique em 5 s.
- Nome do grupo vazio: fica "Grupo N" ao sair do campo (regra do servidor).
- Vocação sem famílias/grupos: bloco correspondente não aparece.

## Testes

- Unitários: `edit.test.ts` (`addSlot`: tecla livre, barra cheia, já na barra), `groupsEdit.test.ts`
  (`sortStrongest`: ordem por level e mana, estável, grupo inexistente).
- E2E `e2e/hotkeys.spec.ts` reescrito para a janela nova, mantendo os 4 cenários: (1) trocar a tecla da Cura para G,
  recusar Q com motivo, lançar com G, manter depois de recarregar; (2) arrastar um slot sobre outro na barra real
  (não muda); (3) família liberando no level (não muda); (4) montar grupo: "+ Novo grupo", nome, adicionar Bola de
  Fogo e Onda de Fogo pelos tiles, **Mais forte primeiro** (Onda de Fogo lv 35 antes da Bola lv 1), "Pôr na barra",
  lançar pela tecla, recarregar e conferir. Capturas `E2E_SNAPS` da janela (modo escolher, captura de tecla, editor).
- Conferência manual com "texto maior" (1,3) em 1366×768: a janela cabe e rola.

## Documentação ao fechar

`CHANGELOG.md` (seção própria), `shared/src/data/news.ts` (entrada "Janela de magias nova"), `README.md` (linhas do
`H` e dos grupos na tabela de controles), `docs/GAME_ROADMAP.md` (linha ✅ com a decisão do dono),
`docs/TEST_PLAN.md` (resultados). `a11y.css` atualizado.
