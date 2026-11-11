// Fila de passos de um ator (lógica pura, sem Phaser): quanto andar em cada quadro.
import type { Facing } from "@lemonquest/shared";

export interface Segment {
  fx: number; fy: number; // px (canto superior esquerdo do tile)
  tx: number; ty: number;
  dur: number;
  t: number;
  walk: boolean;
  started: boolean;
  facing?: Facing;
  /**
   * Início no relógio da predição (performance.now), só nos passos previstos do próprio jogador: a posição sai do
   * relógio, não da soma dos deltas do quadro. Somando deltas, o ator começava cada passo até um quadro adiantado e a
   * virada de tile ou parava um quadro (o passo seguinte ainda não existia) ou dava um tranco de 35% (catch-up com
   * fila 2) — o "andar engasgado" ~4×/s, igual na LAN e na rede ruim.
   */
  at?: number;
}

/** Posição renderizada (px) e o instante em que o último trecho terminou. */
export interface Playback {
  rx: number;
  ry: number;
  endAt: number;
}

/** Atraso acumulado (rede/jitter): com mais de um trecho na fila, toca um pouco mais rápido para não ficar para trás. */
export const catchUpRate = (queued: number) => (queued > 1 ? 1 + 0.35 * (queued - 1) : 1);

/**
 * Avança a fila em um quadro (`dtMs` do Phaser, `now` = performance.now). Trechos com `at` seguem o relógio; os outros
 * (passos do servidor, correções) gastam o delta do quadro com catch-up. `onStart` roda quando um trecho começa.
 */
export function playSegments(queue: Segment[], pb: Playback, dtMs: number, now: number, onStart: (s: Segment) => void): void {
  const rate = catchUpRate(queue.length);
  let budget = dtMs * rate;
  while (queue.length) {
    const s = queue[0]!;
    if (s.at === undefined && budget <= 0) break;
    if (!s.started) {
      s.started = true;
      // Nunca antes do trecho anterior terminar na tela (correção, passo do servidor): sem salto, só emenda.
      if (s.at !== undefined && s.at < pb.endAt) s.at = pb.endAt;
      onStart(s);
    }
    if (s.at !== undefined) {
      const t = now - s.at;
      if (t >= s.dur) {
        s.t = s.dur;
        pb.rx = s.tx; pb.ry = s.ty;
        pb.endAt = s.at + s.dur;
        queue.shift();
        budget = Math.min(budget, (now - pb.endAt) * rate); // o próximo trecho só ganha o que sobrou do quadro
        continue;
      }
      s.t = Math.max(0, t);
      const k = s.t / s.dur;
      pb.rx = s.fx + (s.tx - s.fx) * k;
      pb.ry = s.fy + (s.ty - s.fy) * k;
      break;
    }
    const need = s.dur - s.t;
    if (budget >= need) {
      s.t = s.dur; budget -= need;
      pb.rx = s.tx; pb.ry = s.ty;
      pb.endAt = now - budget / rate;
      queue.shift();
    } else {
      s.t += budget; budget = 0;
      const k = s.t / s.dur;
      pb.rx = s.fx + (s.tx - s.fx) * k;
      pb.ry = s.fy + (s.ty - s.fy) * k;
    }
  }
}
