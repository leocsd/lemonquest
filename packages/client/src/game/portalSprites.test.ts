/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { QUESTS, TILE_SIZE, buildWorldIndex, findObjects, type TiledMap, type WorldPortal } from "@lemonquest/shared";
import { FRAMES, FRAME_H, FRAME_W, LOOKS, drawPortalSheet, readPng } from "../../../../tools/fx/portal.mjs";
import { portalHasLabel } from "./portalInfo.ts";
import {
  PORTAL_LOOKS, PORTAL_SHEET, portalAnchor, portalAnimKey, portalFrame, portalLook, portalOnScreen, portalPhase,
} from "./portalSprites.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const cave: WorldPortal = { x: 89, y: 74, toX: 17, toY: 504, minLevel: 10, zone: "Minas Abandonadas", label: "Minas Abandonadas · lv 10+" };
const questDoor: WorldPortal = { x: 335, y: 219, toX: 345, toY: 203, quest: "yeti_hunt", label: "Ninho dos Dragões de Gelo · missão O Yeti" };
const plain: WorldPortal = { x: 17, y: 501, toX: 88, toY: 74, zone: "Floresta Sussurrante", label: "Floresta Sussurrante" };
const exit: WorldPortal = { x: 374, y: 96, toX: 374, toY: 95, label: "Porto Esperança" };
const st = (done: string[] = []) => ({ done, chests: [] as string[] });

describe("portal desenhado: arte (tools/fx/portal.mjs → assets/fx/portal.png)", () => {
  const file = root + "assets/" + PORTAL_SHEET.url;

  it("folha com 10 quadros de 24x32 por linha e uma linha por estado, na ordem do cliente", () => {
    expect([FRAME_W, FRAME_H, FRAMES]).toEqual([PORTAL_SHEET.frameWidth, PORTAL_SHEET.frameHeight, PORTAL_SHEET.frames]);
    expect(LOOKS).toEqual(["aberto", "trancado", "saida"]);
    expect(PORTAL_LOOKS).toEqual(["open", "locked", "exit"]);
    const png = readFileSync(file);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([FRAMES * FRAME_W, LOOKS.length * FRAME_H]);
  });

  it("o PNG gravado é exatamente o que o script gera (determinístico e em dia)", () => {
    const saved = readPng(file), drawn = drawPortalSheet();
    expect([saved.width, saved.height]).toEqual([drawn.width, drawn.height]);
    expect(Buffer.from(saved.data).equals(Buffer.from(drawn.data))).toBe(true);
  });

  it("cada quadro tem o vórtice no centro do tile, dentro da largura do tile, e os quadros mudam (anima)", () => {
    const { width, data } = drawPortalSheet();
    const alpha = (row: number, f: number, x: number, y: number) => data[((row * FRAME_H + y) * width + f * FRAME_W + x) * 4 + 3];
    // Âncora no meio da base do tile: o pixel (12, 24) do quadro é o centro do tile.
    const cx = FRAME_W / 2, cy = FRAME_H - TILE_SIZE / 2;
    for (let row = 0; row < LOOKS.length; row++) {
      const frames = new Set<string>();
      for (let f = 0; f < FRAMES; f++) {
        expect(alpha(row, f, cx, cy), `${LOOKS[row]} q${f}`).toBe(255);
        // Na linha do centro, o disco (com contorno) não passa do tile (colunas 4..19 do quadro).
        const xs = [...Array(FRAME_W).keys()].filter((x) => alpha(row, f, x, cy) > 0);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(cx - TILE_SIZE / 2);
        expect(Math.max(...xs)).toBeLessThan(cx + TILE_SIZE / 2);
        let sig = "";
        for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) sig += alpha(row, f, x, y).toString(16);
        frames.add(sig);
      }
      expect(frames.size, LOOKS[row]).toBe(FRAMES);
    }
  });
});

describe("portal desenhado: estado e posição", () => {
  it("aberto quando passa; trancado por level ou missão (mesma regra do rótulo); saída colada é discreta", () => {
    expect(portalLook(cave, 9, st())).toBe("locked");
    expect(portalLook(cave, 10, st())).toBe("open");
    expect(portalLook(questDoor, 99, st())).toBe("locked");
    expect(portalLook(questDoor, 99, st(["yeti_hunt"]))).toBe("open");
    expect(portalLook(plain, 1, null)).toBe("open");
    expect(portalLook(exit, 1, null)).toBe("exit");
    // Porta com requisito nunca vira a variante discreta, mesmo com o destino colado.
    expect(portalLook({ ...exit, minLevel: 80 }, 1, null)).toBe("locked");
  });

  it("o vórtice fica no centro do tile; a fase e o quadro caem na linha certa da folha", () => {
    expect(portalAnchor(cave)).toEqual({ x: 89.5 * TILE_SIZE, y: 75 * TILE_SIZE });
    for (const p of [cave, questDoor, plain, exit, { x: 0, y: 0 }]) {
      const ph = portalPhase(p);
      expect(Number.isInteger(ph) && ph >= 0 && ph < PORTAL_SHEET.frames).toBe(true);
    }
    expect(portalPhase({ x: 372, y: 96 })).not.toBe(portalPhase({ x: 374, y: 96 })); // porta e saída lado a lado
    expect(portalFrame("open", 0)).toBe(0);
    expect(portalFrame("locked", 3)).toBe(PORTAL_SHEET.frames + 3);
    expect(portalFrame("exit", PORTAL_SHEET.frames - 1)).toBe(3 * PORTAL_SHEET.frames - 1);
    expect(new Set(PORTAL_LOOKS.map(portalAnimKey)).size).toBe(3);
  });

  it("só fica ligado o que toca a vista (o quadro sobe 2 tiles a partir da base do tile)", () => {
    const a = portalAnchor(cave);
    expect(portalOnScreen(cave, { x0: a.x - 50, y0: a.y - 50, x1: a.x + 50, y1: a.y + 50 })).toBe(true);
    expect(portalOnScreen(cave, { x0: a.x + 13, y0: a.y - 50, x1: a.x + 200, y1: a.y + 50 })).toBe(false);
    expect(portalOnScreen(cave, { x0: a.x - 50, y0: a.y + 1, x1: a.x + 50, y1: a.y + 200 })).toBe(false);
    // O topo do brilho (2 tiles acima da base) ainda conta.
    expect(portalOnScreen(cave, { x0: a.x - 50, y0: a.y - 300, x1: a.x + 50, y1: a.y - 2 * TILE_SIZE })).toBe(true);
  });

  it("no mapa real: todo portal ganha sprite; lv 1 vê as portas trancadas, lv 200 com tudo feito não vê nenhuma", () => {
    const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
    const idx = buildWorldIndex(map);
    expect(idx.portals.length).toBe(findObjects(map, "portal").length);
    expect(idx.portals.length).toBeGreaterThanOrEqual(76);
    const looks = (level: number, done: string[]) => idx.portals.map((p) => portalLook(p, level, st(done)));
    const newbie = looks(1, []);
    idx.portals.forEach((p, i) => {
      const door = !!(p.minLevel || p.quest || p.chestGroup);
      if (!portalHasLabel(p)) expect(newbie[i], `${p.x},${p.y}`).toBe("exit");
      else expect(newbie[i], `${p.x},${p.y}`).toBe(door ? "locked" : "open");
    });
    expect(portalLook(idx.portalAt(372, 96)!, 79, st())).toBe("locked"); // porta lv 80 do Vulcão
    expect(portalLook(idx.portalAt(372, 96)!, 80, st())).toBe("open");
    expect(portalLook(idx.portalAt(374, 96)!, 1, st())).toBe("exit"); // a saída do Goroma, ao lado
    expect(portalLook(idx.portalAt(89, 74)!, 9, st())).toBe("locked"); // boca das Minas, lv 10
    expect(newbie.filter((l) => l === "exit").length).toBeGreaterThan(0);
    expect(idx.portals.some((p) => p.chestGroup)).toBe(false); // nenhuma porta de baú no mapa hoje
    expect(looks(200, Object.keys(QUESTS))).not.toContain("locked");
  });
});
