import { describe, expect, it } from "vitest";
import type { WorldPortal } from "@lemonquest/shared";
import { PORTAL_BLOCKED_COLOR, PORTAL_COLOR, lookPortal, portalBlockReason } from "./portalInfo.ts";

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
    expect(low.lines).toContain("Porta de missão");
    expect(low.lines.some((l) => l === "Monstros do outro lado: lv 14–24 · perigoso para o seu level")).toBe(true);
    expect(low.lines.at(-1)).toMatch(/level 10 ou mais/);
    const ok = lookPortal(cave, 30, st(), { min: 14, max: 24 });
    expect(ok.color).toBe(PORTAL_COLOR);
    expect(ok.lines).toContain("Monstros do outro lado: lv 14–24");
    expect(ok.lines.at(-1)).toBe("Você pode passar. Pise para atravessar.");
    expect(lookPortal(plain, 1, null).lines).toEqual(["Portal", "Pise para atravessar."]);
  });
});
