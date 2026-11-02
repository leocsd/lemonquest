// Métricas de desempenho do cliente (C2S.ClientPerf): o que cada navegador/app manda para o servidor medir RAM e FPS.
// Só leitura para o admin (/metricas e arquivos em metricas/); nenhuma regra de jogo depende disto.

/** C2S.ClientPerf: retrato do cliente na última janela (o primeiro 30 s depois de entrar, depois a cada 60 s). */
export interface ClientPerfMsg {
  /** Média do FPS do Phaser na janela (uma amostra por segundo). */
  fps: number;
  /** Menor FPS da janela. */
  fpsMin: number;
  /** performance.memory.usedJSHeapSize em MB (só Chromium/WebView2; senão null). */
  heapMb: number | null;
  /** Estimativa da memória de imagem: soma de largura×altura×4 das texturas carregadas, em MB. */
  texMb: number;
  /** Game objects vivos na cena do mundo. */
  objetos: number;
  /** "desktop" = app Tauri (window.__lemonApp); "web" = navegador. */
  app: "web" | "desktop";
  /** Segundos desde que a página abriu. */
  uptimeS: number;
}

export const CLIENT_PERF_APPS = ["web", "desktop"] as const;
/** Primeiro relatório depois de entrar no mundo (dá tempo de carregar as texturas da área). */
export const CLIENT_PERF_FIRST_MS = 30_000;
/** Relatórios seguintes. */
export const CLIENT_PERF_EVERY_MS = 60_000;
/** O servidor descarta (em silêncio) relatórios mais próximos que isto: um cliente modificado não enche o log. */
export const CLIENT_PERF_MIN_INTERVAL_MS = 20_000;

/** Faixas aceitas: fora disso é lixo (ou cliente modificado) e o relatório inteiro é descartado. */
export const CLIENT_PERF_MAX = {
  fps: 1000,
  heapMb: 64 * 1024,
  texMb: 64 * 1024,
  objetos: 1_000_000,
  uptimeS: 90 * 86400,
} as const;

const num = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Valida o relatório do cliente. null = descartar (algum número fora da faixa, app desconhecido, formato errado). */
export function sanitizeClientPerf(m: unknown): ClientPerfMsg | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  const fps = num(o.fps, CLIENT_PERF_MAX.fps);
  const fpsMin = num(o.fpsMin, CLIENT_PERF_MAX.fps);
  const texMb = num(o.texMb, CLIENT_PERF_MAX.texMb);
  const objetos = num(o.objetos, CLIENT_PERF_MAX.objetos);
  const uptimeS = num(o.uptimeS, CLIENT_PERF_MAX.uptimeS);
  const heapMb = o.heapMb === null ? null : num(o.heapMb, CLIENT_PERF_MAX.heapMb);
  if (fps === null || fpsMin === null || texMb === null || objetos === null || uptimeS === null) return null;
  if (o.heapMb !== null && heapMb === null) return null;
  if (!(CLIENT_PERF_APPS as readonly unknown[]).includes(o.app)) return null;
  return {
    fps: r1(fps),
    // Mínimo maior que a média só por arredondamento do cliente: fica na média.
    fpsMin: r1(Math.min(fpsMin, fps)),
    heapMb: heapMb === null ? null : r1(heapMb),
    texMb: r1(texMb),
    objetos: Math.round(objetos),
    app: o.app as ClientPerfMsg["app"],
    uptimeS: Math.round(uptimeS),
  };
}
