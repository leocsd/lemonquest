// Memória e tempo de carga do cliente por tamanho de mapa (docs/regioes/montadora.md §13.4). Roda contra um servidor JÁ
// no ar, de preferência o E2E isolado (banco temporário, nunca data/):
//   E2E_PORT=2870 E2E_SKIP_BUILD=1 node e2e/start-server.mjs
//   node tools/mapmem.mjs http://127.0.0.1:2870 [--runs 3] [--heights 560,722,888]
// O mapa que o CLIENTE monta é trocado pela rota do Playwright (o servidor segue com o dele): o custo do Phaser e das
// grades é por célula, então o mapa atual cortado (as expansões nunca mudam tile antigo: cortar em 560 é o mapa de antes
// da Siderúrgica) ou com linhas de vazio a mais (a última linha repetida, como o gerador preenche) mede cada tamanho sem
// esperar a arte. Para cada altura: N rodadas (conta nova, aba nova), tempo do goto até o ator na tela e heap JS depois
// de window.gc(); imprime as medianas e a diferença contra a primeira altura (regra: +35% de heap ou +30% de carga
// pedem mitigação antes de publicar).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const base = (args[0] && !args[0].startsWith("--") ? args[0] : "http://127.0.0.1:2870").replace(/\/$/, "");
const runs = Math.max(1, Number(opt("--runs", "3")));
const heights = opt("--heights", "560,722,888").split(",").map(Number);
const LIMIT = { heap: 0.35, load: 0.3 };

const world = JSON.parse(readFileSync(ROOT + "assets/maps/world.json", "utf8"));

/** O mapa atual com `h` linhas: corta (objetos de fora saem) ou repete a última linha de cada camada (vazio sólido). */
function resized(h) {
  const W = world.width, H = world.height, th = world.tileheight;
  const layers = world.layers.map((l) => {
    if (l.type === "tilelayer") {
      const data = l.data.slice(0, W * Math.min(h, H));
      const last = l.data.slice(W * (H - 1), W * H);
      for (let y = H; y < h; y++) data.push(...last);
      return { ...l, height: h, data };
    }
    if (l.type === "objectgroup") return { ...l, objects: l.objects.filter((o) => o.y < h * th) };
    return l;
  });
  return { ...world, height: h, layers };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
let seq = 0;

async function api(ctx, path, data) {
  const r = await ctx.request.post(base + path, { data });
  return r.json();
}

/** Conta e personagem novos pela API (mesmo caminho do e2e/helpers.ts). */
async function newPlayer(ctx) {
  const account = `mapmem${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 20);
  const login = await api(ctx, "/api/login", { account, password: "senha-mapmem-123", create: true });
  if (!login.ok) throw new Error(`login: ${JSON.stringify(login)}`);
  for (let i = seq; i < seq + 26 * 26; i++) {
    const name = `Medidor ${LETTERS[i % 26].toUpperCase()}${LETTERS[Math.floor(i / 26) % 26]}`;
    const r = await api(ctx, "/api/characters", { session: login.session, name, vocation: "knight" });
    if (r.ok) return { name, session: login.session };
    if (r.error !== "name_taken") throw new Error(`personagem: ${JSON.stringify(r)}`);
  }
  throw new Error("nenhum nome livre");
}

async function measure(browser, body) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const p = await newPlayer(ctx);
    const page = await ctx.newPage();
    await page.route("**/maps/world.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body }));
    await page.addInitScript((s) => { sessionStorage.setItem("lemonquest.accountSession", s); }, p.session);
    const t0 = Date.now();
    await page.goto(base + "/?e2e");
    await page.getByRole("button", { name: `Jogar com ${p.name}` }).click({ timeout: 60_000 });
    await page.waitForFunction(() => { const m = window.__lq?.me(); return !!m && Number.isFinite(m.tileX); }, null, { timeout: 120_000 });
    await page.locator("#boot").waitFor({ state: "hidden", timeout: 60_000 });
    const loadMs = Date.now() - t0;
    await page.waitForTimeout(3000); // texturas e camadas assentadas
    const heap = await page.evaluate(async () => {
      for (let i = 0; i < 3; i++) { window.gc?.(); await new Promise((r) => setTimeout(r, 200)); }
      return performance.memory?.usedJSHeapSize ?? 0;
    });
    return { loadMs, heapMb: heap / 1048576 };
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] });
const rows = [];
try {
  for (const h of heights) {
    const body = JSON.stringify(resized(h));
    const samples = [];
    for (let r = 0; r < runs; r++) {
      const s = await measure(browser, body);
      samples.push(s);
      console.log(`[mapmem] 400×${h} rodada ${r + 1}: carga ${s.loadMs} ms, heap ${s.heapMb.toFixed(1)} MB`);
    }
    rows.push({ mapa: `${world.width}×${h}`, json_mb: +(body.length / 1e6).toFixed(2), carga_ms: median(samples.map((s) => s.loadMs)), heap_mb: +median(samples.map((s) => s.heapMb)).toFixed(1) });
  }
} finally {
  await browser.close();
}

const ref = rows[0];
for (const r of rows) {
  r.heap_pct = `${(((r.heap_mb / ref.heap_mb) - 1) * 100).toFixed(0)}%`;
  r.carga_pct = `${(((r.carga_ms / ref.carga_ms) - 1) * 100).toFixed(0)}%`;
}
console.table(rows);
const over = rows.filter((r) => r.heap_mb > ref.heap_mb * (1 + LIMIT.heap) || r.carga_ms > ref.carga_ms * (1 + LIMIT.load));
if (over.length) {
  console.log(`[mapmem] ACIMA do limite (+${LIMIT.heap * 100}% heap / +${LIMIT.load * 100}% carga contra ${ref.mapa}): ${over.map((r) => r.mapa).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`[mapmem] dentro do limite (+${LIMIT.heap * 100}% heap / +${LIMIT.load * 100}% carga contra ${ref.mapa})`);
}
