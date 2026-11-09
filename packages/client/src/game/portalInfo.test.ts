import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWorldIndex, type TiledMap, type WorldPortal } from "@lemonquest/shared";
import { PORTAL_BLOCKED_COLOR, PORTAL_COLOR, lookPortal, portalBlockReason, portalHasLabel, portalKind } from "./portalInfo.ts";

const cave: WorldPortal = { x: 89, y: 74, toX: 17, toY: 504, minLevel: 10, zone: "Minas Abandonadas", label: "Minas Abandonadas · lv 10+" };
const plain: WorldPortal = { x: 17, y: 501, toX: 88, toY: 74, zone: "Floresta Sussurrante", label: "Floresta Sussurrante" };
const questDoor: WorldPortal = { x: 335, y: 219, toX: 345, toY: 203, quest: "yeti_hunt", label: "Ninho dos Dragões de Gelo · missão O Yeti" };
const st = (done: string[] = []) => ({ done, chests: [] as string[] });

describe("portal: rótulo vermelho e olhar", () => {
  it("porta com level: bloqueia abaixo, passa no level", () => {
    expect(portalBlockReason(cave, 9, st())).toMatch(/level 10/);
    expect(portalBlockReason(cave, 10, st())).toBeNull();
    expect(portalBlockReason(plain, 1, null)).toBeNull();
  });

  it("porta de missão: bloqueia até concluir", () => {
    expect(portalBlockReason(questDoor, 99, st())).toMatch(/Conclua a missão/);
    expect(portalBlockReason(questDoor, 99, st(["yeti_hunt"]))).toBeNull();
  });

  it("olhar: o mesmo rótulo, monstros do outro lado e o motivo", () => {
    const low = lookPortal(cave, 5, st(), { min: 14, max: 24 });
    expect(low).toMatchObject({ title: "Minas Abandonadas · lv 10+", color: PORTAL_BLOCKED_COLOR });
    expect(low.lines[0]).toBe("Passagem lv 10+");
    expect(low.lines.some((l) => l === "Monstros do outro lado: lv 14–24 · perigoso para o seu level")).toBe(true);
    expect(low.lines.at(-1)).toMatch(/level 10 ou mais/);
    const ok = lookPortal(cave, 30, st(), { min: 14, max: 24 });
    expect(ok.color).toBe(PORTAL_COLOR);
    expect(ok.lines).toContain("Monstros do outro lado: lv 14–24");
    expect(ok.lines.at(-1)).toBe("Você pode passar. Pise para atravessar.");
    expect(lookPortal(plain, 1, null).lines).toEqual(["Portal", "Pise para atravessar."]);
    expect(lookPortal(questDoor, 99, st(["yeti_hunt"])).lines[0]).toBe("Porta de missão");
  });

  it("tipo da porta: missão ou baú = 'Porta de missão'; só level = 'Passagem lv N+'; sem requisito = 'Portal'", () => {
    expect(portalKind(questDoor)).toBe("Porta de missão");
    expect(portalKind({ ...plain, chestGroup: "goroma" })).toBe("Porta de missão");
    expect(portalKind({ ...questDoor, minLevel: 50 })).toBe("Porta de missão");
    expect(portalKind(cave)).toBe("Passagem lv 10+");
    expect(portalKind(plain)).toBe("Portal");
  });
});

describe("portal: quem ganha rótulo no mapa", () => {
  it("saída sem requisito colada na porta (destino a até 3 tiles) fica sem rótulo; o resto, com", () => {
    expect(portalHasLabel(plain)).toBe(true);
    expect(portalHasLabel(cave)).toBe(true);
    const exit: WorldPortal = { x: 374, y: 96, toX: 374, toY: 95, label: "Porto Esperança" };
    expect(portalHasLabel(exit)).toBe(false);
    expect(portalHasLabel({ ...exit, toY: 93 })).toBe(false);
    expect(portalHasLabel({ ...exit, toY: 92 })).toBe(true);
    // Porta com requisito sempre tem rótulo, mesmo com o destino colado (o vermelho é o aviso).
    expect(portalHasLabel({ ...exit, minLevel: 80 })).toBe(true);
  });

  it("no mapa real nenhum portal é saída colada numa porta (ciclo 22: viraram portas de sala) e toda porta tem rótulo", () => {
    const root = fileURLToPath(new URL("../../../../", import.meta.url));
    const idx = buildWorldIndex(JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap);
    expect(idx.portals.filter((p) => !portalHasLabel(p))).toEqual([]);
    expect(idx.portalAt(374, 96)).toBeUndefined();
    expect(idx.portalAt(372, 96)).toBeUndefined();
    const goroma = idx.doorAt(372, 96)!;
    expect(goroma.label).toBe("Vulcão de Goroma · lv 80+");
    for (const d of idx.doors) expect(portalHasLabel(d), d.id).toBe(true);

    // Toda porta com level mantém o rótulo.
    for (const p of idx.portals) if ((p.minLevel ?? 0) > 0) expect(portalHasLabel(p), `${p.x},${p.y}`).toBe(true);
  });
});
