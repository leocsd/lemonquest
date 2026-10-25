// Predição do cliente × servidor real em rede ruim (VPN de ~150 ms com perda): simula os dois lados com atraso,
// variação e "engasgos" (retransmissão do TCP: o pedaço e os seguintes esperam, entrega em ordem), andando com a tecla
// segurada. Metas: a predição lidera (passos confirmados), quase nunca desiste por tempo-limite e, depois de uma
// correção, volta a liderar em vez de só seguir o servidor (cada variação da rede virava tranco até soltar a tecla).
import { describe, expect, it } from "vitest";
import { CollisionGrid, Dir, TICK_MS } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { MovementSystem } from "./movement.ts";
import { Predictor } from "../../../client/src/game/predictor.ts";

const W = 400;
const OPEN = new CollisionGrid(W, 3, new Uint8Array(W * 3));

interface Net { oneWay: number; jitter: number; stallPct: number; stallMs: number }

/** Um minuto andando para leste. `toggle`: haste liga/desliga a cada 5 s (servidor na hora, cliente pelo patch). */
function walk(net: Net, speedPct: number, toggle = false, seed = 7, taps = false) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let now = 0;
  const mv = new MovementSystem(OPEN, { now: () => now });
  const p = { id: "p", x: 5, y: 1, dir: Dir.E, level: 60, speedPct, seq: 0, stepMs: 0 } as unknown as PlayerState;
  mv.addPlayer(p);
  const pr = new Predictor({ grid: OPEN, spawn: null, isOccupied: () => false });
  pr.level = 60; pr.speedPct = speedPct; pr.reset(5, 1, Dir.E);
  const up: { at: number; f: () => void }[] = [], down: typeof up = [];
  let upReady = 0, downReady = 0;
  const lat = () => net.oneWay + rnd() * net.jitter + (rnd() * 100 < net.stallPct ? net.stallMs : 0);
  const sendUp = (f: () => void) => { upReady = Math.max(now + lat(), upReady); up.push({ at: upReady, f }); };
  const sendDown = (f: () => void) => { downReady = Math.max(now + lat(), downReady); down.push({ at: downReady, f }); };
  let srv = { x: 5, y: 1 }, sent = { x: 5, y: 1 }, nextTick = 0, nextPatch = 0;
  pr.press(Dir.E);
  sendUp(() => mv.onMove(p, { dir: Dir.E, seq: 1 }));
  for (now = 0; now < 60_000; now++) {
    while (up.length && up[0]!.at <= now) up.shift()!.f();
    while (down.length && down[0]!.at <= now) down.shift()!.f();
    if (toggle && now > 0 && now % 5000 === 0) {
      const sp = p.speedPct === 100 ? 130 : 100;
      p.speedPct = sp;
      sendDown(() => { pr.speedPct = sp; });
    }
    if (now >= nextTick) { mv.tick(now, [p]); nextTick += TICK_MS; }
    if (now >= nextPatch) { // patch do estado (Colyseus, 50 ms), só quando a posição mudou
      if (p.x !== sent.x || p.y !== sent.y) {
        const x = p.x, y = p.y, ms = p.stepMs;
        sent = { x, y };
        sendDown(() => { pr.onServerPos(x, y, ms, now); srv = { x, y }; });
      }
      nextPatch += 50;
    }
    // taps: segura ~1,3 s e solta ~0,4 s, com o instante variando (o jogador solta no meio ou logo depois de um passo).
    // Como WorldScene.onInputDir: recupera o passo devido, informa onde a predição está e só então solta/aperta.
    const input = (dir: Dir | null) => {
      pr.update(now);
      const at = { x: pr.x, y: pr.y };
      if (dir === null) pr.release(); else pr.press(dir);
      sendUp(() => mv.onMove(p, { dir, seq: 2, at }));
    };
    if (taps && now > 0 && now % 1700 === 0) input(null);
    if (taps && now % 1700 === 400) input(Dir.E);
    if (now % 16 === 0) { pr.update(now); pr.checkStale(srv.x, srv.y, now); } // quadro do cliente (~60 fps)
  }
  return { tiles: p.x - 5, ...pr.stats };
}

const LAN: Net = { oneWay: 1, jitter: 2, stallPct: 0, stallMs: 0 };
const VPN: Net = { oneWay: 73, jitter: 15, stallPct: 0, stallMs: 0 };
const VPN_LOSS: Net = { oneWay: 73, jitter: 15, stallPct: 6, stallMs: 300 };

describe("andar com a tecla segurada em rede ruim", () => {
  it("LAN e VPN de 150 ms: todo passo é previsto e confirmado, nenhuma correção, também com haste ligando e desligando", () => {
    for (const net of [LAN, VPN]) {
      for (const [speed, toggle] of [[100, false], [130, false], [100, true]] as const) {
        const r = walk(net, speed, toggle);
        expect(r.stale + r.diverged, JSON.stringify(r)).toBe(0);
        expect(r.confirmed, JSON.stringify(r)).toBeGreaterThanOrEqual(r.tiles - 3);
      }
    }
  });

  it("VPN com perda: no máximo uma desistência por minuto e a predição volta a liderar logo depois", () => {
    for (const [speed, toggle] of [[100, false], [130, false], [100, true]] as const) {
      const r = walk(VPN_LOSS, speed, toggle);
      expect(r.stale, JSON.stringify(r)).toBeLessThanOrEqual(1);
      // Antes da correção do passo externo: depois da 1ª desistência, ~25% dos passos só seguiam o servidor.
      expect(r.external, JSON.stringify(r)).toBeLessThanOrEqual(6);
      expect(r.confirmed, JSON.stringify(r)).toBeGreaterThanOrEqual(r.tiles * 0.97);
    }
  });

  it("soltar e apertar a tecla (a cada 1,7 s): o último passo previsto antes de soltar nunca se perde", () => {
    // Antes de MoveMsg.at: até 17 desistências por minuto já na LAN (a mensagem de soltar chegava antes do instante em
    // que o servidor daria o passo que o cliente já tinha dado), cada uma puxando o boneco 1 tile para trás.
    for (const net of [LAN, VPN]) {
      for (const speed of [100, 130]) {
        const r = walk(net, speed, false, 7, true);
        expect(r.stale + r.diverged, JSON.stringify(r)).toBe(0);
      }
    }
    for (const speed of [100, 130]) expect(walk(VPN_LOSS, speed, false, 7, true).stale).toBeLessThanOrEqual(2);
  });
});
