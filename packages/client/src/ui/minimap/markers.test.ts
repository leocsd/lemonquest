import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NPCS, buildWorldIndex, type TiledMap } from "@lemonquest/shared";
import {
  MAX_PERSONAL_MARKERS, guideMarkers, markerNear, npcService, personalMarkers, portalMarkers, questMarkers, sanitizePersonal,
  serviceMarkers, togglePersonal, visibleMarkers,
} from "./markers.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const index = buildWorldIndex(JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap);

describe("marcadores do mapa", () => {
  it("serviço de cada NPC: Quadro, viagem, depot, templo, loja (um por NPC)", () => {
    expect(npcService(NPCS.bounty_board!)).toBe("board");
    expect(npcService(NPCS.coach_village!)).toBe("travel");
    expect(npcService(NPCS.depot!)).toBe("depot");
    expect(npcService(NPCS.priest!)).toBe("temple");
    expect(npcService(NPCS.shop!)).toBe("shop");
    expect(npcService(NPCS.guilherme_boss!)).toBe("depot"); // depot + bênção: o depot vence
    expect(npcService(NPCS.guard_captain!)).toBeNull();
  });

  it("a Vila tem templo, depot, loja, viagem e Quadro no mapa", () => {
    const vila = serviceMarkers(index.npcs).filter((m) => index.zoneAt(m.x, m.y) === "Vila de Pedra Clara").map((m) => m.kind);
    for (const k of ["temple", "depot", "shop", "travel", "board"] as const) expect(vila, k).toContain(k);
  });

  it("missões: '!' para pegar e '?' para entregar, como sobre o NPC", () => {
    const m = questMarkers(index.npcs, (id) => (id === "guard_captain" ? "available" : id === "herbalist" ? "ready" : id === "shop" ? "progress" : null));
    expect(m.map((x) => x.kind).sort()).toEqual(["quest", "questReady"]);
    expect(m.find((x) => x.kind === "quest")!.label).toMatch(/Capitão Rodrigo: missão nova/);
  });

  it("portais com o rótulo do índice; só aparecem no explorado (missão, guia e pessoal sempre)", () => {
    const portals = portalMarkers(index.portals);
    expect(portals).toHaveLength(index.portals.length);
    expect(portals.find((p) => p.x === 89 && p.y === 74)!.label).toBe("Minas Abandonadas · lv 10+");
    const all = [...portals.slice(0, 2), ...guideMarkers({ dest: { x: 1, y: 1, label: "D" }, hop: { x: 2, y: 2, label: "P" } }), ...personalMarkers([{ x: 5, y: 5 }])];
    expect(visibleMarkers(all, () => false).map((m) => m.kind)).toEqual(["guide", "guide", "personal"]);
    expect(visibleMarkers(all, () => true)).toHaveLength(all.length);
    expect(guideMarkers(null)).toEqual([]);
  });

  it("marcador mais perto do mouse (o de cima vence o empate)", () => {
    const list = [{ kind: "shop", x: 10, y: 10, label: "a" }, { kind: "guide", x: 10, y: 10, label: "b" }, { kind: "portal", x: 20, y: 20, label: "c" }] as const;
    expect(markerNear(list, 11, 10, 2)!.label).toBe("b");
    expect(markerNear(list, 19, 21, 1)!.label).toBe("c");
    expect(markerNear(list, 15, 15, 2)).toBeUndefined();
  });

  it("marcador pessoal: põe, tira o que está perto, limite e lista salva inválida", () => {
    let l = togglePersonal([], 10, 10);
    expect(l).toEqual([{ x: 10, y: 10 }]);
    l = togglePersonal(l, 11, 9); // perto: tira
    expect(l).toEqual([]);
    for (let i = 0; i < MAX_PERSONAL_MARKERS + 3; i++) l = togglePersonal(l, i * 10, 0);
    expect(l).toHaveLength(MAX_PERSONAL_MARKERS);
    expect(l[0]).toEqual({ x: 30, y: 0 }); // os mais antigos saíram
    expect(sanitizePersonal([{ x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1.5, y: 2 }, null, "x"])).toEqual([{ x: 1, y: 2 }]);
    expect(sanitizePersonal("lixo")).toEqual([]);
  });
});
