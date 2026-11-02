# Métricas e logs (design)

Data: 2026-11-01. Dono: "2 clients abertos estão comendo 2 GB de RAM… não é melhor criar um metrics e logs para o game
de uma vez?". Decisões: leve, sem serviço externo; consulta por **comando** (admin no jogo e CLI) — o "painel web de
admin" segue fora (ROADMAP ⛔). Base existente: `/status` (admin, `systems/status.ts`: retrato do servidor agora),
`npm run admin -- telemetria` (jogabilidade), linhas `[tick] … máx` no log.

## O que medir

**Cliente** (cada um, a cada 60 s; o primeiro 30 s depois de entrar) — mensagem nova `C2S.ClientPerf`:
`{ fps: number; fpsMin: number; heapMb: number | null; texMb: number; objetos: number; app: "web" | "desktop"; uptimeS: number }`.
- `fps`/`fpsMin`: média e mínimo do FPS do Phaser na janela (amostra por segundo; `game.loop.actualFps`).
- `heapMb`: `performance.memory.usedJSHeapSize` (só Chromium/WebView2; senão null).
- `texMb`: soma de largura×altura×4 das fontes de textura carregadas no Phaser (`game.textures`), em MB — estimativa
  da memória de imagem.
- `objetos`: tamanho da display list da cena do mundo (game objects vivos).
- `app`: "desktop" quando `window.__lemonApp` existe.
- Servidor valida (números finitos, faixas razoáveis, `app` conhecido), limite em `MESSAGE_LIMITS` (1 por 20 s,
  o excedente é descartado em silêncio) e guarda o último relatório de cada jogador + histórico curto (últimas 60
  amostras por jogador, em memória).

**Servidor** (a cada 30 s, em memória: anel das últimas 24 h = 2.880 amostras): RSS e heap do processo
(`process.memoryUsage`), CPU % do processo no intervalo (`process.cpuUsage`), tick médio / máximo / p95 do intervalo,
jogadores online, monstros vivos, itens no chão, Estagiários com rota rodando (`p.bot`), mensagens recebidas por
segundo, autosave médio/máximo (o que o `/status` já mede). Ao virar o dia (ou a cada hora) grava um **resumo diário**
no `kv` (`metricas:AAAA-MM-DD`: mínimo/média/máximo de cada número do servidor e, dos clientes, média/máximo de heap,
texMb e fps-mínimo por personagem). Reiniciar o servidor perde só o anel; o resumo do dia segue no banco.

## Logs

Helper `logEvento(tipo, campos)` que imprime uma linha `[metrica] {"tipo":"…",…}` (JSON numa linha, fácil de filtrar
com `docker logs lemonquest | grep '\[metrica\]'`), com limite por tipo (no máximo 1 por minuto por tipo+chave):
- `tick_lento`: tick acima de 200 ms (substitui/complementa o `[tick] … máx` sem duplicar spam);
- `cliente_pesado`: relatório com heap > 700 MB, texMb > 400 ou fpsMin < 15 (nome, app, números);
- `servidor_memoria`: RSS acima de 1,5 GB;
- `erro_sistema`: quando o `runSafe` isola um erro (tipo do passo; a mensagem já é logada hoje);
- `resumo`: a cada 30 min, uma linha com os números do servidor (útil para histórico no `docker logs`).

## Como ver

- **`/metricas`** (comando de admin no jogo, `systems/admin.ts`, mesma lista de admins do `/status`): linhas no chat —
  servidor agora (RSS, heap, CPU %, tick médio/máx/p95, online, monstros, bots, msgs/s) e a **última hora** (máx RSS,
  máx tick, mín online/máx online); depois os clientes online ordenados por heap: `nome · app · heap · texturas · fps
  (mín) · objetos · há quanto tempo aberto`. `/metricas <nome>` mostra o histórico curto daquele cliente (heap e fps
  nas últimas amostras) para ver se cresce.
- **`npm run admin -- metricas [dias]`** (CLI que lê o banco, como a `telemetria`): resumos diários dos últimos N dias
  (padrão 7) — servidor e clientes por personagem.

## Fora do escopo

Painel web/gráficos (decisão do dono); serviço externo (Prometheus/Grafana); métricas de jogabilidade (já existem na
`telemetria`).

## Testes

Unitários: validação/limites do `ClientPerf` (shared), agregação do anel e do resumo diário, p95, formatação das
linhas do `/metricas` e da CLI, limite de frequência do `logEvento`, cálculo de `texMb` e da janela de FPS no cliente
(função pura). `WorldRoom.test.ts`: mensagem validada e limitada; `/metricas` só para admin.
