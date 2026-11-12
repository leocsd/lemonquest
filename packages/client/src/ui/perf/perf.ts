// Desempenho do cliente (C2S.ClientPerf, shared/metrics.ts): o dono queria saber por que "2 clients abertos comem 2 GB".
// Parte pura (testada): janela de FPS e estimativa da memória de texturas. O PerfReporter só lê o jogo e manda; nada
// aqui muda o jogo nem aparece para o jogador.
import { CLIENT_PERF_EVERY_MS, CLIENT_PERF_FIRST_MS, type ClientPerfMsg } from "@lemonquest/shared";

/** Janela de FPS: uma amostra por segundo; `take` devolve média e mínimo e recomeça. */
export class FpsWindow {
  private sum = 0;
  private n = 0;
  private min = Infinity;

  add(fps: number): void {
    if (!Number.isFinite(fps) || fps < 0) return;
    this.sum += fps; this.n++;
    if (fps < this.min) this.min = fps;
  }

  get size(): number { return this.n; }

  take(): { fps: number; fpsMin: number } {
    const r = this.n ? { fps: this.sum / this.n, fpsMin: this.min } : { fps: 0, fpsMin: 0 };
    this.sum = 0; this.n = 0; this.min = Infinity;
    return r;
  }
}

/** Fonte de textura (só o que importa do Phaser: width/height da imagem/canvas carregada). */
export interface TexSource { width: number; height: number }

/** Soma largura×altura×4 (RGBA) das fontes, em MB: estimativa da memória de imagem (GPU e cópia na RAM). */
export function texMb(sources: Iterable<TexSource>): number {
  let bytes = 0;
  for (const s of sources) {
    const w = Number(s?.width), h = Number(s?.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) bytes += w * h * 4;
  }
  return bytes / 1048576;
}

/** Item da display list: Layer e Container têm `list` com os filhos. */
interface DisplayItem { list?: unknown }

/** Game objects vivos, contando os de dentro das camadas e containers (a display list da cena só tem o 1º nível). */
export function countObjects(list: readonly unknown[]): number {
  let n = 0;
  for (const it of list) {
    if (!it) continue;
    n++;
    const sub = (it as DisplayItem | null)?.list;
    if (Array.isArray(sub)) n += countObjects(sub);
  }
  return n;
}

/** performance.memory.usedJSHeapSize em MB (só Chromium/WebView2); null fora deles. */
export function heapMb(perf: unknown = globalThis.performance): number | null {
  const used = (perf as { memory?: { usedJSHeapSize?: unknown } } | undefined)?.memory?.usedJSHeapSize;
  return typeof used === "number" && Number.isFinite(used) ? used / 1048576 : null;
}

export interface PerfProbe {
  /** game.loop.actualFps. */
  fps: () => number;
  /** Fontes das texturas carregadas no Phaser. */
  textures: () => Iterable<TexSource>;
  /** Tamanho da display list da cena do mundo. */
  objetos: () => number;
  app: () => ClientPerfMsg["app"];
  heap?: () => number | null;
  /** Milissegundos desde que a página abriu (performance.now). */
  uptimeMs: () => number;
}

/** Monta o relatório a partir da janela de FPS e das leituras do jogo. */
export function buildReport(win: FpsWindow, probe: PerfProbe): ClientPerfMsg {
  const { fps, fpsMin } = win.take();
  return {
    fps, fpsMin, heapMb: (probe.heap ?? heapMb)(), texMb: texMb(probe.textures()),
    objetos: probe.objetos(), app: probe.app(), uptimeS: probe.uptimeMs() / 1000,
  };
}

/** Timers trocáveis nos testes. */
export interface PerfTimers {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
}

/**
 * Amostra o FPS a cada segundo e manda o relatório: o primeiro CLIENT_PERF_FIRST_MS depois de começar, depois a cada
 * CLIENT_PERF_EVERY_MS. `stop` (saiu da sala) para tudo. Uma leitura que falhar não derruba o jogo: só pula o envio.
 */
export function startPerfReporter(probe: PerfProbe, send: (m: ClientPerfMsg) => void, timers: PerfTimers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as number),
}): () => void {
  const win = new FpsWindow();
  // Tempo pelo relógio (uptimeMs = performance.now), não por disparo: com a aba escondida há mais de 5 min o navegador
  // segura o timer em 1×/min, e o "+1000 por disparo" mandava o relatório 1×/h — justo nas abas ociosas abertas o dia
  // todo, o caso que as métricas foram feitas para ver.
  const t0 = probe.uptimeMs();
  let next = CLIENT_PERF_FIRST_MS;
  const h = timers.setInterval(() => {
    try {
      win.add(probe.fps());
      const elapsed = probe.uptimeMs() - t0;
      if (elapsed < next) return;
      while (next <= elapsed) next += CLIENT_PERF_EVERY_MS; // atrasou muito: um relatório só, e o próximo no ritmo
      send(buildReport(win, probe));
    } catch { /* métrica não é motivo para quebrar o cliente */ }
  }, 1000);
  return () => timers.clearInterval(h);
}
