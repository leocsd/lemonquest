import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { Server, matchMaker } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RANKING_CACHE_S } from "@lemonquest/shared";
import { rankingJson } from "./persistence/ranking.ts";
import { ROOT_DIR } from "./paths.ts";
import { WorldRoom, currentWorld } from "./rooms/WorldRoom.ts";
import { authRouter, setSessionKicker } from "./persistence/auth.ts";
import { checkpoint, closeDb, initDb } from "./persistence/db.ts";
import { backupCopyDir, backupDir, startBackups } from "./persistence/backup.ts";
import { devAdmins, devCommandsEnabled } from "./systems/devcommands.ts";
import { e2eMode } from "./e2e.ts";
import { gzipStatic } from "./gzipStatic.ts";

const PORT = Number(process.env.PORT ?? 2567);
const PROD = process.env.NODE_ENV === "production";
/** Modo E2E (Playwright): serve o cliente buildado fora de produção, para os comandos de dev funcionarem (ver e2e.ts). */
const E2E = e2eMode();
const SERVE_CLIENT = PROD || E2E;
const root = ROOT_DIR;
const CHECKPOINT_MS = 5 * 60_000;

// --- falhas no nível do processo ----------------------------------------------------------------------------------
// Os callbacks da sala já são protegidos pelo onUncaughtException do WorldRoom. O handler padrão do Colyseus
// (Utils.registerGracefulShutdown) DESLIGA o processo em qualquer uncaughtException — aqui ele fica desligado
// (gracefullyShutdown: false) e registramos os nossos: loga e segue; só desliga (salvando tudo) se virar uma enxurrada.
let crashes: number[] = [];
process.on("uncaughtException", (err, origin) => {
  console.error(`[processo] exceção não tratada (${origin}):`, err);
  const now = Date.now();
  crashes = crashes.filter((t) => now - t < 60_000);
  crashes.push(now);
  if (crashes.length >= 10) {
    console.error("[processo] 10 exceções em 1 min — desligando de forma ordenada (salvando tudo)");
    void shutdown("crash-loop", 1);
  }
});
process.on("unhandledRejection", (reason) => {
  console.error("[processo] promise rejeitada sem tratamento:", reason);
});

// --- checagens de boot -------------------------------------------------------------------------------------------
const dist = path.join(root, "packages/client/dist");
if (SERVE_CLIENT && !fs.existsSync(path.join(dist, "index.html"))) {
  console.error(`[lemonquest] cliente não encontrado em ${dist}. Rode \`npm run build\` primeiro.`);
  process.exit(1);
}
initDb();
if (E2E) console.warn("[lemonquest] MODO E2E (LEMONQUEST_E2E=1): cliente buildado servido e limites de criação de conta desligados.");
{
  const admins = [...devAdmins()];
  console.log(`[admin] administradores (LEMONQUEST_ADMINS): ${admins.join(", ") || "nenhum"}`);
}
if (devCommandsEnabled()) {
  const admins = [...devAdmins()];
  console.warn("!".repeat(72));
  console.warn(`!! COMANDOS DE DEV LIGADOS (LEMONQUEST_DEV_COMMANDS=1) para: ${admins.join(", ") || "(ninguém — defina LEMONQUEST_ADMINS)"}`);
  console.warn("!! /level /item /gold /heal /tp /ml — NÃO use isto no servidor do escritório.");
  console.warn("!".repeat(72));
}

// --- HTTP ------------------------------------------------------------------------------------------------------------
const app = express();
app.disable("x-powered-by");
// Atrás de proxy reverso (Caddy do docker-compose.https.yml): sem isto todo mundo chega com o IP do proxy e o limite
// de login por IP vira um só para o escritório inteiro. Valor no formato do Express ("loopback, uniquelocal", "1"...).
const TRUST_PROXY = process.env.LEMONQUEST_TRUST_PROXY?.trim();
if (TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
if (!PROD) {
  // Em dev o cliente (Vite :3000) chama a API na :2567.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });
}
app.use(express.json({ limit: "16kb" }));
// Ranking público (cache de 30 s no servidor e no navegador); só nomes de personagens. `?me=<personagem>` (janela do
// jogo) acrescenta a posição dele em cada categoria — a mesma informação pública, só que além do top 10.
app.get("/api/ranking", (req, res) => {
  try {
    const me = typeof req.query.me === "string" && req.query.me.length <= 40 ? req.query.me : undefined;
    res.setHeader("Cache-Control", `public, max-age=${RANKING_CACHE_S}`);
    res.type("application/json").send(rankingJson(Date.now(), me));
  } catch (e) {
    console.error("[ranking] falhou:", e);
    res.status(500).json({ ok: false });
  }
});
app.use("/api", authRouter);
app.get("/health", (_req, res) => { res.json({ ok: true }); });

// Em produção (e no modo E2E) o próprio servidor entrega o cliente buildado (uma porta só no escritório).
if (SERVE_CLIENT) {
  // Pré-comprimidos (.gz do `npm run build`, ver tools/build-server.mjs): JS/CSS/HTML e o world.json (1,5 MB → ~250 KB).
  // O .gz do mapa fica em dist/maps, mas o original que vale é o de assets/maps (abaixo): se for mais novo, ganha.
  const mapsDir = path.join(root, "assets/maps");
  app.use(gzipStatic(dist, (c) => (c.gz.startsWith("maps/") ? path.join(mapsDir, c.gz.slice("maps/".length, -3)) : path.join(dist, c.gz.slice(0, -3)))));
  // O mapa vem de assets/maps (o MESMO arquivo que o servidor carrega) — cliente e servidor nunca dessincronizam.
  app.use("/maps", express.static(mapsDir, { fallthrough: false }));
  app.get("/ranking", (_req, res) => { res.sendFile(path.join(dist, "ranking.html")); });
  // /assets/* tem hash do conteúdo no nome (Vite): pode ficar 1 ano no cache sem nem revalidar. O resto (index.html,
  // sprites do pacote) continua revalidando por ETag — um deploy novo chega no próximo F5.
  app.use(express.static(dist, {
    setHeaders: (res, file) => {
      if (path.relative(dist, file).split(path.sep)[0] === "assets") res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }));
}

// --- Colyseus ---------------------------------------------------------------------------------------------------------
// Estado inicial de uma entrada (580+ monstros + chão + jogadores) passa dos 16 KB do buffer padrão do schema: sem
// isto a biblioteca realoca, recodifica e avisa "buffer overflow" a cada login (visto no ciclo 9).
Encoder.BUFFER_SIZE = 64 * 1024;
const httpServer = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }), gracefullyShutdown: false });
gameServer.define("world", WorldRoom);
// Troca de senha (código de recuperação) derruba os personagens da conta que estão no mundo.
setSessionKicker((sid, reason) => currentWorld()?.kick(sid, reason));
// Só joinOrCreate pelo HTTP (create/join/joinById ficam fechados). A reconexão automática do SDK vai direto
// pelo WebSocket com o reconnectionToken, sem passar por /matchmake.
matchMaker.controller.exposedMethods = ["joinOrCreate"];
if (PROD) {
  // O Colyseus põe CORS aberto (Allow-Origin = origem pedida) em TODA resposta HTTP do servidor, inclusive /api.
  // Em produção cliente e API têm a mesma origem: sem cabeçalhos CORS.
  matchMaker.controller.DEFAULT_CORS_HEADERS = {} as typeof matchMaker.controller.DEFAULT_CORS_HEADERS;
  matchMaker.controller.getCorsHeaders = () => ({});
}

let stopBackups: () => void = () => {};
const checkpointTimer = setInterval(() => {
  try { checkpoint("PASSIVE"); } catch (e) { console.error("[db] checkpoint falhou:", e); }
}, CHECKPOINT_MS);
checkpointTimer.unref();

gameServer.onShutdown(async () => {
  stopBackups();
  clearInterval(checkpointTimer);
  try {
    closeDb(); // wal_checkpoint(TRUNCATE) + close
    console.log("[db] checkpoint + base fechada");
  } catch (e) {
    console.error("[db] erro ao fechar:", e);
  }
});

let shuttingDown = false;
async function shutdown(reason: string, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[lemonquest] desligando (${reason})...`);
  const force = setTimeout(() => { console.error("[lemonquest] desligamento travou — saindo"); process.exit(code || 1); }, 15_000);
  force.unref();
  // Salva os jogadores (WorldRoom.onBeforeShutdown) → descarta salas → onShutdown (checkpoint + close).
  await gameServer.gracefullyShutdown(false);
  process.exit(code);
}
// SIGHUP: janela do console fechada; SIGBREAK: Ctrl+Break no Windows.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) process.on(sig, () => void shutdown(sig));

await gameServer.listen(PORT, "0.0.0.0");
await matchMaker.createRoom("world", {}); // O mundo único, criado já no boot (joinOrCreate sempre cai nele).
stopBackups = startBackups();
console.log(`[lemonquest] backups em ${backupDir()}${backupCopyDir() ? ` (cópia externa em ${backupCopyDir()})` : ""}`);
console.log(`[lemonquest] servidor ouvindo em http://0.0.0.0:${PORT}`);
