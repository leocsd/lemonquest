import { describe, expect, it } from "vitest";
import { REFINE_NPC, S2C, type DropFrom, type ItemInstance } from "@lemonquest/shared";
import { InventorySystem, makeItem } from "./inventory.ts";
import { REFINE_MSG, RefineSystem } from "./refine.ts";
import { player } from "./testkit.ts";

/** Catálogo de verdade (mithril_katana = tier 5, lv 35, ataque 70; gem_green = gema do tier 5). */
function setup(o: { npc?: string; rolls?: number[] } = {}) {
  const sent: { to: string; type: string; msg: any }[] = [];
  const inv = new InventorySystem({ send: (to, type, msg) => sent.push({ to, type, msg: structuredClone(msg) }) });
  const p = player("p1", 5, 5, { name: "Ana", vocation: "knight", level: 40 });
  inv.load(p, {});
  inv.applyStats(p, true);
  let npc = o.npc ?? REFINE_NPC;
  const rolls = [...(o.rolls ?? [])];
  const saved: string[] = [];
  const logs: string[] = [];
  const refine = new RefineSystem({
    inventory: inv, send: (to, type, msg) => sent.push({ to, type, msg: structuredClone(msg) }), npcOpen: () => npc,
    save: (id) => saved.push(id), rng: () => rolls.shift() ?? 0.99, log: (l) => logs.push(l),
  });
  const notices = () => sent.filter((s) => s.type === S2C.Notice).map((s) => s.msg as { text: string; kind: string });
  const bp = () => inv.get("p1")!.backpack;
  const give = (it: ItemInstance) => { inv.addItem(p, it); return it; };
  /** Como o cliente: pede o próximo nível do item que está vendo. */
  const ask = (from: DropFrom, it: ItemInstance, level = (it.refine ?? 0) + 1) => refine.onRefine(p, { from, uid: it.uid, level });
  return { inv, p, refine, sent, notices, bp, give, ask, saved, logs, setNpc: (id: string) => { npc = id; }, rolls };
}
const at = (index: number): DropFrom => ({ where: "backpack", index });

describe("refino no servidor", () => {
  it("sucesso: cobra ouro + gema, sobe o nível, avisa, grava e registra no log", () => {
    const s = setup();
    const k = s.give(makeItem("mithril_katana"));
    s.give(makeItem("gem_green", 3));
    s.inv.addGold(s.p, 10_000);
    s.ask(at(0), k);
    expect(s.bp()[0]!.refine).toBe(1);
    expect(s.inv.gold("p1")).toBe(7_000);
    expect(s.inv.countItem("p1", "gem_green")).toBe(2);
    expect(s.notices().at(-1)).toEqual({ text: "Refino concluído: Katana de Mithril +1!", kind: "good" });
    expect(s.saved).toEqual(["p1"]);
    expect(s.logs.at(-1)).toContain("[refino] Ana subiu mithril_katana → +1");
    // O inventário vai para o cliente com o nível novo.
    s.inv.flush();
    const msg = s.sent.filter((m) => m.type === S2C.Inventory).at(-1)!.msg;
    expect(msg.backpack[0].refine).toBe(1);
  });

  it("falha: perde só o custo; o item não some nem perde nível", () => {
    const s = setup({ rolls: [0.05] }); // +2 falha com 10%
    const k = s.give({ ...makeItem("mithril_katana"), refine: 1 });
    s.give(makeItem("gem_green", 1));
    s.inv.addGold(s.p, 6_000);
    s.ask(at(0), k);
    expect(s.bp()[0]).toBe(k);
    expect(k.refine).toBe(1);
    expect(s.inv.gold("p1")).toBe(0);
    expect(s.inv.countItem("p1", "gem_green")).toBe(0);
    expect(s.notices().at(-1)!.text).toBe("O refino falhou. Katana de Mithril +1 continua como estava; o ouro e a gema foram gastos.");
    expect(s.logs.at(-1)).toContain("falhou");
  });

  it("o sorteio usa a chance do nível alvo: +5 falha abaixo de 50%, passa a partir dela", () => {
    const s = setup({ rolls: [0.49, 0.5] });
    const k = s.give({ ...makeItem("mithril_katana"), refine: 4 });
    s.give(makeItem("gem_green", 2));
    s.inv.addGold(s.p, 36_000);
    s.ask(at(0), k);
    expect(k.refine).toBe(4);
    s.ask(at(0), k);
    expect(k.refine).toBe(5);
    expect(s.inv.gold("p1")).toBe(0);
  });

  it("sem ouro ou sem gema: nada é cobrado", () => {
    const s = setup();
    const k = s.give(makeItem("mithril_katana"));
    s.inv.addGold(s.p, 2_999);
    s.ask(at(0), k);
    expect(s.notices().at(-1)!.text).toBe(REFINE_MSG.material(1, "Esmeralda"));
    s.give(makeItem("gem_green", 1));
    s.ask(at(0), k);
    expect(s.notices().at(-1)!.text).toBe(REFINE_MSG.gold(3000));
    expect([k.refine, s.inv.gold("p1"), s.inv.countItem("p1", "gem_green")]).toEqual([undefined, 2_999, 1]);
    expect(s.saved).toEqual([]);
  });

  it("nível máximo, item não refinável e NPC fechado: avisa sem cobrar", () => {
    const s = setup();
    s.give(makeItem("gem_green", 5));
    s.give(makeItem("gem_yellow", 5));
    s.inv.addGold(s.p, 100_000);
    const top = s.give({ ...makeItem("mithril_katana"), refine: 5 });
    s.ask(at(2), top, 6);
    expect(s.notices().at(-1)!.text).toBe(REFINE_MSG.max);
    const ring = s.give(makeItem("ring_dragon"));
    s.ask(at(3), ring);
    expect(s.notices().at(-1)!.text).toBe("Anéis e amuletos não podem ser refinados.");
    const low = s.give(makeItem("steel_blade"));
    s.ask(at(4), low);
    expect(s.notices().at(-1)!.text).toContain("tier 5");
    const book = s.give(makeItem("spellbook_archmage"));
    s.ask(at(5), book);
    expect(s.notices().at(-1)!.text).toBe("Livros de magia não podem ser refinados.");
    const k = s.give(makeItem("fire_sword"));
    s.setNpc("shop");
    s.ask(at(6), k);
    expect(s.notices().at(-1)!.text).toBe(REFINE_MSG.closed);
    s.setNpc("");
    s.ask(at(6), k);
    expect(s.notices().at(-1)!.text).toBe(REFINE_MSG.closed);
    expect(s.inv.gold("p1")).toBe(100_000);
    expect([s.inv.countItem("p1", "gem_green"), s.inv.countItem("p1", "gem_yellow")]).toEqual([5, 5]);
    expect(k.refine).toBeUndefined();
  });

  it("clique duplo (nível pedido já passou) e item trocado de lugar: nada é cobrado", () => {
    const s = setup();
    const k = s.give(makeItem("mithril_katana"));
    s.give(makeItem("gem_green", 5));
    s.inv.addGold(s.p, 100_000);
    s.ask(at(0), k, 1);
    s.ask(at(0), k, 1); // segundo clique com a janela velha: já é +1
    expect(k.refine).toBe(1);
    expect(s.inv.gold("p1")).toBe(97_000);
    // Outro item no índice: uid não bate.
    s.ask(at(1), k);
    expect(s.notices().at(-1)!.text).toBe(REFINE_MSG.gone);
    s.ask(at(30), k);
    expect(s.notices().at(-1)!.text).toBe(REFINE_MSG.gone);
    expect(s.inv.gold("p1")).toBe(97_000);
  });

  it("item equipado: refina no lugar e os atributos do personagem sobem na hora", () => {
    const s = setup();
    const k = s.give(makeItem("mithril_katana"));
    s.inv.onMoveItem(s.p, { from: at(0), to: { where: "equip", slot: "weapon" } });
    const a = s.give(makeItem("mithril_armor"));
    s.inv.onMoveItem(s.p, { from: at(0), to: { where: "equip", slot: "armor" } });
    s.give(makeItem("gem_green", 5));
    s.inv.addGold(s.p, 100_000);
    expect([s.inv.stat("p1", "attack"), s.inv.stat("p1", "armor")]).toEqual([70, 5]);
    s.ask({ where: "equip", slot: "weapon" }, k);
    s.ask({ where: "equip", slot: "weapon" }, k);
    s.ask({ where: "equip", slot: "armor" }, a);
    expect([k.refine, a.refine]).toEqual([2, 1]);
    expect([s.inv.stat("p1", "attack"), s.inv.stat("p1", "armor")]).toEqual([76, 6]);
  });

  it("morto ou mensagem malformada: ignora", () => {
    const s = setup();
    const k = s.give(makeItem("mithril_katana"));
    s.give(makeItem("gem_green", 5));
    s.inv.addGold(s.p, 100_000);
    for (const m of [null, {}, { from: at(0) }, { from: { where: "depot", index: 0 }, uid: k.uid, level: 1 }, { from: at(0), uid: k.uid, level: "1" }]) {
      s.refine.onRefine(s.p, m as never);
    }
    s.p.hp = 0;
    s.ask(at(0), k);
    expect([k.refine, s.inv.gold("p1"), s.notices()]).toEqual([undefined, 100_000, []]);
  });
});
