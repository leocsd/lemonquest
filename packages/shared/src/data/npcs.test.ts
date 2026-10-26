/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ITEMS } from "./items.ts";
import { NPCS } from "./npcs.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const world = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8"));

function npcIds(): string[] {
  const layer = world.layers.find((l: any) => l.name === "objects");
  const ids = new Set<string>();
  for (const o of layer.objects) {
    const p = (o.properties ?? []).find((q: any) => q.name === "npcId");
    if (p) ids.add(p.value);
  }
  return [...ids];
}

describe("NPCS", () => {
  it("define todo npcId usado no mapa", () => {
    const ids = npcIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(NPCS[id], id).toBeDefined();
  });

  it("ids batem, sprites existem, textos presentes", () => {
    for (const [k, n] of Object.entries(NPCS)) {
      expect(n.id).toBe(k);
      expect(existsSync(root + "assets/" + n.sprite), n.id).toBe(true);
      const png = readFileSync(root + "assets/" + n.sprite);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${n.id}: sheet 64x112`).toEqual([64, 112]);
      expect(n.name.length).toBeGreaterThan(0);
      expect(n.greeting.length).toBeGreaterThan(0);
      expect(n.idleLines?.length ?? 0, n.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("itens das lojas existem e preços são válidos", () => {
    for (const n of Object.values(NPCS)) {
      for (const e of n.shop?.sells ?? []) {
        expect(ITEMS[e.itemId], `${n.id} -> ${e.itemId}`).toBeDefined();
        if (e.price !== undefined) expect(e.price).toBeGreaterThan(0);
      }
      const ids = (n.shop?.sells ?? []).map((e) => e.itemId);
      expect(new Set(ids).size, n.id).toBe(ids.length);
    }
  });

  it("papéis: loja, depósito e NPCs sem loja", () => {
    expect(NPCS.shop!.shop!.sells.length).toBeGreaterThan(10);
    expect(NPCS.depot!.depot).toBe(true);
    expect(NPCS.priest!.shop).toBeUndefined();
    expect(NPCS.guard_captain!.shop).toBeUndefined();
    expect(NPCS.bounty_board!.shop).toBeUndefined();
    expect(NPCS.old_hunter!.shop!.sells.some((e) => ITEMS[e.itemId]!.vocations?.includes("paladin"))).toBe(true);
    expect(NPCS.herbalist!.shop!.sells.some((e) => ITEMS[e.itemId]!.vocations?.includes("sorcerer"))).toBe(true);
  });

  it("destinos de viagem (carroça e barco) caem em tile andável do mapa", () => {
    const col = world.layers.find((l: any) => l.name === "collision").data as number[];
    const dests = Object.values(NPCS).flatMap((n) => (n.travel ?? []).map((d) => ({ npc: n.id, ...d })));
    expect(dests.length).toBeGreaterThan(3);
    for (const d of dests) {
      expect(d.x >= 0 && d.y >= 0 && d.x < world.width && d.y < world.height, `${d.npc} → ${d.id}`).toBe(true);
      expect(col[d.y * world.width + d.x], `${d.npc} → ${d.id} (${d.x},${d.y})`).toBe(0);
    }
  });

  it("Siderúrgica (ciclo 19): trem da Vila e da Malha até a Estação do Minério; quem viaja de lá volta à Vila", () => {
    const to = (npc: string, id: string) => NPCS[npc]!.travel!.find((d) => d.id === id);
    expect(to("chefe_estacao_vila", "minerio")).toEqual({ id: "minerio", label: "Estação do Minério", x: 24, y: 594, price: 250 });
    expect(to("chefe_estacao_malha", "minerio")).toEqual({ id: "minerio", label: "Estação do Minério", x: 24, y: 594, price: 200 });
    expect(to("supervisora_controle", "minerio")?.price).toBe(100);
    // A Malha continua com a viagem de antes (a E2E da Malha procura a linha pelo nome).
    expect(to("chefe_estacao_vila", "malha")?.price).toBe(200);
    expect(to("chefe_estacao_malha", "village")?.price).toBe(200);
    for (const id of ["chefe_estacao_minerio", "supervisora_controle"]) {
      expect(to(id, "village"), id).toMatchObject({ x: 97, y: 98, price: 250 });
      expect(to(id, "malha"), id).toMatchObject({ x: 60, y: 374, price: 200 });
    }
    // Sem TravelDest.minLevel (C7), ninguém viaja PARA DENTRO da Sala de Controle (x 7–23, y 628–643): pularia as portas.
    const dests = Object.values(NPCS).flatMap((n) => n.travel ?? []);
    expect(dests.filter((d) => d.x >= 7 && d.x <= 23 && d.y >= 628 && d.y <= 643)).toEqual([]);
  });

  it("Siderúrgica: 12 NPCs e 5 placas, com os papéis do posto avançado e da Estação do Minério", () => {
    const ids = [
      "chefe_estacao_minerio", "almoxarife", "depot_minerio", "capela_epi", "mestre_turno", "operadora_correia",
      "encarregada_coqueria", "forneiro_chefe", "mestre_aciaria", "operador_laminador", "supervisora_controle", "espirito_fundidor",
      "placa_correias", "placa_area_quente", "placa_epi", "placa_carga_suspensa", "placa_forno_acordado",
    ];
    for (const id of ids) expect(NPCS[id], id).toBeDefined();
    expect(NPCS.depot_minerio!.depot).toBe(true);
    expect(NPCS.supervisora_controle!.depot).toBe(true);
    expect(NPCS.capela_epi!.blessing).toBe(true);
    expect(NPCS.almoxarife!.shop!.buys).toContain("material");
    expect(NPCS.almoxarife!.shop!.sells.map((e) => e.itemId)).toEqual(expect.arrayContaining(["limonada_turno", "prato_feito"]));
    // Placas: sprite dos quadros, sem loja, viagem nem depósito.
    for (const id of ids.filter((x) => x.startsWith("placa_"))) {
      const n = NPCS[id]!;
      expect(n.sprite, id).toContain("Inspector/");
      expect([n.shop, n.travel, n.depot], id).toEqual([undefined, undefined, undefined]);
    }
  });

  it("Siderúrgica: a chegada do trem (24,594) cai na zona protegida \"Estação do Minério\"", () => {
    const layer = world.layers.find((l: any) => l.name === "objects");
    const pzAt = (x: number, y: number) => layer.objects.filter((o: any) => (o.type ?? o.class) === "zone"
      && x * 16 >= o.x && x * 16 < o.x + o.width && y * 16 >= o.y && y * 16 < o.y + o.height
      && (o.properties ?? []).some((p: any) => p.name === "pz" && p.value === true)).map((o: any) => o.name);
    expect(pzAt(24, 594)).toEqual(["Estação do Minério"]);
  });

  it("Montadora (ciclo 20): cegonha da Vila, Cocheiro Dito e Caminhão de Bobinas chegam à Portaria; ninguém leva para depois das portas", () => {
    const to = (npc: string, id: string) => NPCS[npc]!.travel!.find((d) => d.id === id);
    const portaria = { id: "montadora", label: "Portaria da Montadora", x: 232, y: 758 };
    expect(to("mt_cegonha_vila", "montadora")).toEqual({ ...portaria, price: 250 });
    expect(to("coach_oficina", "montadora")).toEqual({ ...portaria, price: 200 });
    expect(to("mt_bobinas_sid", "montadora")).toEqual({ ...portaria, price: 200 });
    expect(to("mt_supervisora", "montadora")?.price).toBe(100);
    // A volta: o Caminhão de Bobinas até a chegada do trem na Estação do Minério; a cegonha e a Supervisora até a Vila.
    expect(to("mt_bobinas", "minerio")).toEqual({ id: "minerio", label: "Estação do Minério", x: 24, y: 594, price: 200 });
    expect(to("mt_motorista", "village")).toMatchObject({ x: 97, y: 98, price: 250 });
    expect(to("mt_motorista", "oficina")).toMatchObject({ x: 83, y: 330, price: 150 });
    expect(to("mt_supervisora", "village")).toMatchObject({ x: 97, y: 98, price: 250 });
    // O Dito continua com as viagens de antes, na mesma ordem.
    expect(NPCS.coach_oficina!.travel!.map((d) => d.id)).toEqual(["village", "port", "montadora"]);
    // No bloco da Montadora (x 216–395, y 746–885) só se chega pela Portaria (x 219–246, y 749–778): o resto fica atrás
    // das portas de level 25–110, e a Sala de Descanso da Supervisora é só saída.
    const dests = Object.values(NPCS).flatMap((n) => (n.travel ?? []).map((d) => ({ npc: n.id, ...d })));
    const inBlock = dests.filter((d) => d.x >= 216 && d.x <= 395 && d.y >= 746 && d.y <= 885);
    expect(inBlock.length).toBeGreaterThanOrEqual(4);
    for (const d of inBlock) expect(d.x >= 219 && d.x <= 246 && d.y >= 749 && d.y <= 778, `${d.npc} → ${d.id} (${d.x},${d.y})`).toBe(true);
  });

  it("Montadora: 14 NPCs e 6 placas, com os papéis da Portaria e do posto avançado; sprites que a Siderúrgica não usa", () => {
    const ids = [
      "mt_cegonha_vila", "mt_motorista", "mt_bobinas", "mt_bobinas_sid", "mt_porteiro", "mt_cantineira", "mt_depot", "mt_enfermeira",
      "mt_lavador", "mt_prensista", "mt_soldadora", "mt_pintor", "mt_supervisora", "mt_piloto",
      "mt_placa_patio", "mt_placa_estamparia", "mt_placa_funilaria", "mt_placa_pintura", "mt_placa_montagem", "mt_placa_pista",
    ];
    expect(Object.keys(NPCS).filter((k) => k.startsWith("mt_")).sort()).toEqual([...ids].sort());
    expect([NPCS.mt_depot!.depot, NPCS.mt_supervisora!.depot, NPCS.mt_enfermeira!.blessing]).toEqual([true, true, true]);
    const shop = NPCS.mt_cantineira!.shop!;
    expect(shop.sells.map((e) => e.itemId)).toEqual(expect.arrayContaining(["limonada_turno", "prato_feito", "health_potion_large", "mana_potion_large"]));
    expect(shop.buys).toEqual(NPCS.ferramenteiro!.shop!.buys);
    // Placas: sprite dos quadros, sem loja, viagem nem depósito.
    for (const id of ids.filter((x) => x.startsWith("mt_placa_"))) {
      const n = NPCS[id]!;
      expect(n.sprite, id).toContain("Inspector/");
      expect([n.shop, n.travel, n.depot], id).toEqual([undefined, undefined, undefined]);
    }
    // Nenhum NPC da Montadora usa sprite de NPC da Siderúrgica, e os sete sprites novos são só daqui.
    const sid = ["chefe_estacao_minerio", "almoxarife", "depot_minerio", "capela_epi", "mestre_turno", "operadora_correia",
      "encarregada_coqueria", "forneiro_chefe", "mestre_aciaria", "operador_laminador", "supervisora_controle", "espirito_fundidor"];
    const sidSprites = new Set(sid.map((id) => NPCS[id]!.sprite));
    for (const id of ids.filter((x) => !x.startsWith("mt_placa_"))) expect(sidSprites.has(NPCS[id]!.sprite), id).toBe(false);
    const fresh = ["NinjaLeaf", "LionOrange", "CaveLion", "Lion", "LionBoy", "Pig", "GreenPig"].map((s) => `${s}/SpriteSheet.png`);
    for (const n of Object.values(NPCS)) if (!n.id.startsWith("mt_")) expect(fresh.some((f) => n.sprite.endsWith("/" + f)), n.id).toBe(false);
  });

  it("Montadora: a chegada (232,758) cai na zona protegida \"Portaria da Montadora\"", () => {
    const layer = world.layers.find((l: any) => l.name === "objects");
    const pzAt = (x: number, y: number) => layer.objects.filter((o: any) => (o.type ?? o.class) === "zone"
      && x * 16 >= o.x && x * 16 < o.x + o.width && y * 16 >= o.y && y * 16 < o.y + o.height
      && (o.properties ?? []).some((p: any) => p.name === "pz" && p.value === true)).map((o: any) => o.name);
    expect(pzAt(232, 758)).toEqual(["Portaria da Montadora"]);
  });

  it("loja principal cobre todas as vocações com arma de level 1 e ~8", () => {
    const items = NPCS.shop!.shop!.sells.map((e) => ITEMS[e.itemId]!);
    for (const voc of ["knight", "paladin", "sorcerer", "druid"] as const) {
      const ws = items.filter((d) => d.kind === "weapon" && d.vocations?.includes(voc));
      expect(ws.some((w) => w.level === 1), voc).toBe(true);
      expect(ws.some((w) => w.level === 8), voc).toBe(true);
    }
  });
});
