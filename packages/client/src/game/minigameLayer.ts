// Salão de Minijogos na cena: o que fica no chão da sala durante a partida (buracos do Chão que Cai, limões do
// Pega-Limão, placas do Genius) vem do estado (minigameStateStore); avisos, golpes e placas acesas vêm de
// S2C.MinigameFx e usam os efeitos de magia (SpellEffects.telegraph / blast / padFlash).
import Phaser from "phaser";
import { GENIUS_PADS, MINIGAME_ROOM_SIZE, TILE_SIZE, type MinigameFxMsg, type MinigameStateMsg } from "@lemonquest/shared";
import { minigameStateStore } from "../ui/minigame/minigame.ts";
import type { SpellEffects } from "./spellFx.ts";

const N = MINIGAME_ROOM_SIZE;
const TS = TILE_SIZE;
/** Logo acima do chão e dos avisos (SpellEffects GROUND = 7), abaixo de hover/alvo e das criaturas. */
const DEPTH = 7.5;

export class MinigameLayer {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly off: () => void;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, private readonly spells: SpellEffects) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    layer.add(this.g);
    this.off = minigameStateStore.subscribe((v) => this.draw(v?.s ?? null));
    this.draw(minigameStateStore.get()?.s ?? null);
  }

  private draw(s: MinigameStateMsg | null): void {
    const g = this.g;
    g.clear();
    if (!s || s.phase === "ended") return;
    const at = (i: number) => ({ x: (s.ox + (i % N)) * TS, y: (s.oy + Math.floor(i / N)) * TS });
    if (s.game === "genius") {
      for (const p of GENIUS_PADS) {
        const x = (s.ox + p.x0) * TS, y = (s.oy + p.y0) * TS;
        g.fillStyle(p.color, 0.28).fillRect(x + 1, y + 1, 2 * TS - 2, 2 * TS - 2);
        g.lineStyle(2, p.color, 0.95).strokeRect(x + 1, y + 1, 2 * TS - 2, 2 * TS - 2);
      }
    }
    for (const i of s.holes ?? []) {
      const { x, y } = at(i);
      g.fillStyle(0x0b0d12, 0.92).fillRect(x, y, TS, TS);
      g.lineStyle(1, 0x3a2a1a, 0.9).strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
    }
    for (const [i, v] of s.lemons ?? []) {
      const { x, y } = at(i);
      const cx = x + TS / 2, cy = y + TS / 2 + 1;
      const gold = v > 1;
      g.fillStyle(0x000000, 0.25).fillEllipse(cx, cy + 5, 10, 4);
      g.fillStyle(gold ? 0xffc928 : 0xf2e23a, 1).fillEllipse(cx, cy, gold ? 11 : 9, gold ? 9 : 7);
      g.fillStyle(0xffffff, 0.55).fillCircle(cx - 2, cy - 2, 1.5);
      g.fillStyle(0x4caf3a, 1).fillEllipse(cx + 3, cy - 4, 4, 2);
      if (gold) g.lineStyle(1, 0xfff4b0, 0.9).strokeEllipse(cx, cy, 13, 11);
    }
  }

  fx(m: MinigameFxMsg): void {
    if (!m || !Array.isArray(m.tiles)) return;
    switch (m.kind) {
      case "warn": return this.spells.telegraph(m.tiles, Math.max(100, m.ms ?? 1000), m.fx);
      case "hit": case "fall": return this.spells.blast(m.tiles, m.fx);
      case "pad": return this.spells.padFlash(m.tiles, m.color ?? 0xffffff, Math.max(150, m.ms ?? 400));
    }
  }

  destroy(): void {
    this.off();
    this.g.destroy();
  }
}
