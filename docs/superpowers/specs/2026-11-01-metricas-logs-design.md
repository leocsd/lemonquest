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
segundo, autosave médio/máximo (o que o `/status` já mede). Cada amostra vai também para o arquivo do dia (abaixo).
Reiniciar o servidor perde só o anel (o "agora/última hora" do `/metricas`); os arquivos ficam.

**Mudança do dono (2026-11-01): "eu quero só arquivos para monitorar depois".** Nada de métricas no banco (o resumo
diário no `kv` saiu); tudo vai para arquivos.

## Onde fica

- **Pasta:** `LEMONQUEST_METRICS_DIR` ou, sem ela, `metricas/` ao lado do banco em uso (`LEMONQUEST_DB`): `data/metricas/`
  no dev e no serviço Windows; `/app/data/metricas/` no container = `docker-data/metricas/` no host; o servidor E2E,
  com banco em `%TEMP%`, grava no temporário dele. Banco em memória (testes unitários) = nenhum arquivo.
- **Arquivos** (JSON Lines: um objeto por linha, só acrescenta, um arquivo por dia pela data local do servidor):
  - `servidor-AAAA-MM-DD.jsonl`: cada amostra de 30 s
    (`t, rssMb, heapMb, cpuPct, tickMedMs, tickMaxMs, tickP95Ms, online, monstros, chao, bots, msgsS, saveMedMs?, saveMaxMs?`);
  - `clientes-AAAA-MM-DD.jsonl`: cada relatório de cliente aceito (`t, nome, fps, fpsMin, heapMb, texMb, objetos, app, uptimeS`);
  - `eventos-AAAA-MM-DD.jsonl`: cada linha `[metrica]` (`t, tipo, …`), que continua saindo também no stdout.
- **Gravação:** as linhas ficam num buffer e vão juntas para o disco a cada 5 s (`fs.promises.appendFile`, fora do
  tick) e no desligamento (síncrono). Erro de disco é logado uma vez e nunca derruba o tick (as métricas seguem na memória).
- **Retenção:** arquivos com mais de 30 dias (`METRICS_RETENTION_DAYS`, `persistence/metricsFiles.ts`) são apagados na
  subida e uma vez por dia.
- **Ler:** `npm run admin -- metricas [dias]` (resumo por dia); no host do Docker
  `docker compose logs lemonquest | grep '\[metrica\]'`, `tail -n 5 docker-data/metricas/servidor-$(date +%F).jsonl`,
  `jq -r '[.nome,.app,.heapMb,.texMb,.fpsMin] | @tsv' docker-data/metricas/clientes-$(date +%F).jsonl`,
  `jq -c 'select(.tipo=="cliente_pesado")' docker-data/metricas/eventos-*.jsonl`; dentro do container,
  `docker compose exec lemonquest ls /app/data/metricas`.

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
- **`npm run admin -- metricas [dias]`** (CLI que lê os arquivos JSONL, sem abrir o banco): resumos diários dos últimos
  N dias (padrão 7, máximo 30) — servidor (mín/méd/máx de cada número) e clientes por personagem (heap e texturas
  média/máximo, FPS mínimo).

## Fora do escopo

Painel web/gráficos (decisão do dono); serviço externo (Prometheus/Grafana); métricas de jogabilidade (já existem na
`telemetria`).

## Testes

Unitários: validação/limites do `ClientPerf` (shared), agregação do anel e do resumo diário, p95, formatação das
linhas do `/metricas` e da CLI, limite de frequência do `logEvento`, cálculo de `texMb` e da janela de FPS no cliente
(função pura). `WorldRoom.test.ts`: mensagem validada e limitada; `/metricas` só para admin.
