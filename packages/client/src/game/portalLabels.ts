// Rótulo sobre cada portal ("Minas Abandonadas · lv 10+"): zona do destino e requisito da porta, em vermelho enquanto o
// personagem não passa. Fica na câmera de UI (zoom 1), reposicionado a cada quadro como os rótulos dos baús.
import Phaser from "phaser";
import { TILE_SIZE, type QuestsMsg, type WorldIndex, type WorldPortal } from "@lemonquest/shared";
import { questStore } from "../ui/quests/quests.ts";
import type { LookContent } from "./lookInfo.ts";
import { PORTAL_BLOCKED_COLOR, PORTAL_COLOR, lookPortal, portalBlockReason } from "./portalInfo.ts";
import { textRes } from "./textRes.ts";

const FONT = '"Pixelify Sans", Verdana, system-ui, sans-serif';

export class PortalLabels {
  /** `blocked` null = cor por recalcular (quando o rótulo entrar na tela). */
  private readonly labels: { p: WorldPortal; text: Phaser.GameObjects.Text; blocked: boolean | null; color: string }[] = [];
  /** Level e estado de missões da última pintura: só recalcula a cor quando um dos dois muda. */
  private paintedFor: { level: number; quests: QuestsMsg | null } | null = null;

  constructor(scene: Phaser.Scene, uiLayer: Phaser.GameObjects.Layer, private readonly index: WorldIndex) {
    for (const p of index.portals) {
      const text = scene.add.text(0, 0, p.label, {
        fontFamily: FONT, fontSize: "10px", fontStyle: "bold", color: PORTAL_COLOR, stroke: "#10131c", strokeThickness: 3,
        resolution: textRes(),
      }).setOrigin(0.5, 1).setVisible(false);
      uiLayer.add(text);
      this.labels.push({ p, text, blocked: null, color: PORTAL_COLOR });
    }
  }

  /** Centro do topo do tile do portal, em pixels de tela; some fora da tela. */
  placeUi(toScreenX: (wx: number) => number, toScreenY: (wy: number) => number, viewW: number, viewH: number, level: number): void {
    const quests = questStore.get();
    if (!this.paintedFor || this.paintedFor.level !== level || this.paintedFor.quests !== quests) {
      this.paintedFor = { level, quests };
      for (const l of this.labels) l.blocked = null;
    }
    for (const l of this.labels) {
      const x = Math.round(toScreenX((l.p.x + 0.5) * TILE_SIZE)), y = Math.round(toScreenY(l.p.y * TILE_SIZE) - 2);
      const on = x > -120 && x < viewW + 120 && y > -20 && y < viewH + 20;
      l.text.setVisible(on);
      if (!on) continue;
      l.text.setPosition(x, y);
      if (l.blocked !== null) continue;
      l.blocked = portalBlockReason(l.p, level, quests) !== null;
      const color = l.blocked ? PORTAL_BLOCKED_COLOR : PORTAL_COLOR;
      if (color !== l.color) { l.color = color; l.text.setColor(color); }
    }
  }

  /** Rótulos visíveis agora, com a cor (testes E2E). */
  shown(): { x: number; y: number; label: string; color: string }[] {
    return this.labels.filter((l) => l.text.visible).map((l) => ({ x: l.p.x, y: l.p.y, label: l.p.label, color: l.color }));
  }

  /** "Olhar" no tile (x,y), se for portal. */
  lookAt(x: number, y: number, level: number): LookContent | null {
    const p = this.index.portalAt(x, y);
    if (!p) return null;
    const levels = (p.zone ? this.index.zoneLevels(p.zone) : undefined) ?? this.index.levelsNear(p.toX, p.toY);
    return lookPortal(p, level, questStore.get(), levels);
  }

  destroy(): void {
    for (const l of this.labels) l.text.destroy();
    this.labels.length = 0;
  }
}
