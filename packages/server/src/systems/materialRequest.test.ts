import { describe, expect, it } from "vitest";
import { REQUEST_BANDS, REQUEST_NPC, S2C, requestBand, weekId, xpForLevel } from "@lemonquest/shared";
import { generateRequest, MaterialRequestSystem } from "./materialRequest.ts";
import { makeItem } from "./inventory.ts";
import { invWorld } from "./m4kit.ts";

const MON = new Date(2026, 9, 19, 12).getTime(); // segunda

function setup(level = 10) {
  const w = invWorld();
  const p = w.mk("p", { level });
  const rec: any = { id: 1, data: {} };
  let t = MON;
  const out: { type: string; msg: any }[] = [];
  const saved: string[] = [];
  const open = { npc: REQUEST_NPC }; // janela do Quadro aberta (o jogador está perto)
  const sys = new MaterialRequestSystem({
    record: () => rec, send: (_to, type, msg) => out.push({ type, msg: structuredClone(msg) }),
    inventory: w.inv, save: (id) => saved.push(id), now: () => t, npcOpen: () => open.npc,
  });
  const last = () => out.filter((o) => o.type === S2C.MaterialRequestState).at(-1)!.msg.request;
  const notices = () => out.filter((o) => o.type === S2C.Notice).map((o) => o.msg.text as string);
  return { w, p, rec, sys, out, last, notices, saved, open, setTime: (ms: number) => { t = ms; } };
}

describe("encomenda semanal de material", () => {
  it("gera a mesma encomenda pra mesma semana+faixa; faixa diferente pode mudar o material", () => {
    const week = weekId(new Date(MON));
    const defsLike = { defs: (id: string) => (id === "cheese" ? { value: 10 } : { value: 100 }) } as any;
    const a = generateRequest(week, 0, defsLike);
    const b = generateRequest(week, 0, defsLike);
    expect(a).toEqual(b);
    expect(requestBand(1)).toBe(0);
    expect(requestBand(88)).toBe(9);
  });

  it("lista a encomenda da semana com o progresso da mochila", () => {
    const s = setup(5);
    s.sys.onMessage(s.p, { action: "list" });
    const v = s.last();
    expect(v.have).toBe(0);
    expect(v.claimed).toBe(false);
    expect(v.count).toBeGreaterThan(0);
    expect(v.gold).toBeGreaterThan(0);
  });

  it("entrega: precisa da quantidade certa, consome os itens, paga ouro, e só uma vez por semana", () => {
    const s = setup(5);
    s.sys.onMessage(s.p, { action: "list" });
    const v = s.last();
    s.sys.onMessage(s.p, { action: "turnIn" });
    expect(s.notices().at(-1)).toBe("Você não tem o suficiente ainda.");
    s.w.inv.addItem(s.p, makeItem(v.materialId, v.count));
    s.sys.onMessage(s.p, { action: "turnIn" });
    expect(s.w.inv.gold("p")).toBe(v.gold);
    expect(s.w.inv.get("p")!.backpack.filter(Boolean)).toHaveLength(0);
    expect(s.saved).toContain("p");
    s.w.inv.addItem(s.p, makeItem(v.materialId, v.count));
    s.sys.onMessage(s.p, { action: "turnIn" });
    expect(s.notices().at(-1)).toBe("Você já entregou a encomenda desta semana.");
    expect(s.w.inv.gold("p")).toBe(v.gold); // não pagou de novo
  });

  it("entregar exige o Quadro aberto (perto dele), como as missões e as recompensas diárias (14-12)", () => {
    const s = setup(5);
    s.sys.onMessage(s.p, { action: "list" });
    const v = s.last();
    s.w.inv.addItem(s.p, makeItem(v.materialId, v.count));
    s.open.npc = "";
    s.sys.onMessage(s.p, { action: "turnIn" });
    expect(s.notices().at(-1)).toBe("Entregue a encomenda no Quadro de Recompensas.");
    s.open.npc = "shop";
    s.sys.onMessage(s.p, { action: "turnIn" });
    expect(s.w.inv.countItem("p", v.materialId)).toBe(v.count);
    expect(s.w.inv.gold("p")).toBe(0);
    expect(s.rec.data.request.claimed).toBe(false);
    s.open.npc = REQUEST_NPC;
    s.sys.onMessage(s.p, { action: "turnIn" });
    expect(s.w.inv.gold("p")).toBe(v.gold);
  });

  it("a faixa fica gravada na 1ª consulta: subir de level na semana não troca o material (14-12)", () => {
    // As faixas 0 e 6 não têm material em comum: se a faixa mudasse com o level, o material mudaria.
    const s = setup(5);
    s.sys.onMessage(s.p, { action: "list" });
    const before = s.last();
    expect(s.rec.data.request.band).toBe(0);
    s.p.level = 60;
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.last()).toEqual(before);
    expect(REQUEST_BANDS[6]!.materials).not.toContain(before.materialId);
    // Entrega o material da faixa gravada, mesmo no lv 60.
    s.w.inv.addItem(s.p, makeItem(before.materialId, before.count));
    s.sys.onMessage(s.p, { action: "turnIn" });
    expect(s.w.inv.gold("p")).toBe(before.gold);
    // Semana seguinte: grava a faixa nova.
    s.setTime(MON + 7 * 86_400_000);
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.rec.data.request).toMatchObject({ week: weekId(new Date(MON + 7 * 86_400_000)), claimed: false, band: requestBand(60) });
    expect(REQUEST_BANDS[requestBand(60)]!.materials).toContain(s.last().materialId);
  });

  it("estado gravado antes do ciclo 14 (sem faixa): grava a faixa do level atual na próxima consulta", () => {
    const s = setup(30);
    s.rec.data.request = { week: weekId(new Date(MON)), claimed: false };
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.rec.data.request.band).toBe(requestBand(30));
    s.p.level = 90;
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.rec.data.request.band).toBe(requestBand(30));
  });

  it("estado sem faixa de quem já subiu na semana: vale o level do começo da semana (o material não troca no deploy)", () => {
    const s = setup(90);
    const w = weekId(new Date(MON));
    s.rec.data.week = { id: w, xp: xpForLevel(40), kills: 0, fish: 0, bosses: 0 };
    s.rec.data.request = { week: w, claimed: false };
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.rec.data.request.band).toBe(requestBand(40));
  });

  it("faixa fora do intervalo é grampeada (sem ouro negativo)", () => {
    const week = weekId(new Date(MON));
    const inv = { defs: () => ({ value: 100 }) } as any;
    expect(generateRequest(week, -2, inv)).toEqual(generateRequest(week, 0, inv));
    expect(generateRequest(week, 99, inv)).toEqual(generateRequest(week, REQUEST_BANDS.length - 1, inv));
    expect(generateRequest(week, Number.NaN, inv).gold).toBeGreaterThan(0);
  });
});
