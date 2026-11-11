import { describe, expect, it } from "vitest";
import { IMBUE_DURATION_MS, IMBUE_WARN_MS, PLAYER_ATTACK_MS, S2C, TICK_MS } from "@lemonquest/shared";
import type { CharacterData } from "../persistence/types.ts";
import { ImbuementSystem, IMBUE_MAX_STEP_MS, parseImbue } from "./imbuement.ts";
import { def, openGrid, player, world } from "./testkit.ts";

const H = 3600_000;

/** Sistema com o combate PvE controlado à mão (`fighting`). */
function sys() {
  const sent: { to: string; type: string; msg: any }[] = [];
  const fighting = new Set<string>();
  const s = new ImbuementSystem({ inPveCombat: (id) => fighting.has(id), send: (to, type, msg) => sent.push({ to, type, msg }) });
  let clock = 1_000_000;
  /** Avança `ms` em ticks de TICK_MS. */
  const run = (ms: number) => { for (const end = clock + ms; clock < end;) { clock += TICK_MS; s.tick(clock); } };
  s.tick(clock);
  const notices = () => sent.filter((x) => x.type === S2C.Notice).map((x) => x.msg.text as string);
  return { s, sent, fighting, run, notices, setClock: (t: number) => { clock = t; }, now: () => clock };
}

describe("encantamento: migração e persistência", () => {
  it("save antigo (imbuement string, permanente) vira tier I com 10 h; salvar grava o novo e mantém o antigo (rollback)", () => {
    expect(parseImbue({ imbuement: "lifesteal" })).toEqual({ effect: "lifesteal", tier: 1, leftMs: IMBUE_DURATION_MS });
    const t = sys();
    const data: CharacterData = { imbuement: "pierce" };
    t.s.load("p1", data);
    expect(t.s.get("p1")).toEqual({ effect: "pierce", tier: 1, leftMs: IMBUE_DURATION_MS });
    expect(t.s.bonus("p1")).toEqual({ effect: "pierce", value: 0.15 });
    t.s.saveTo("p1", data);
    expect(data).toEqual({ imbue: { effect: "pierce", tier: 1, leftMs: IMBUE_DURATION_MS }, imbuement: "pierce" });
    // Carregar o que foi salvo dá o mesmo (a migração não roda de novo).
    t.s.load("p2", data);
    expect(t.s.get("p2")).toEqual(t.s.get("p1"));
  });

  it("rollback ao ciclo 15: o save do ciclo 16 leva o efeito no campo antigo; a carga prefere o imbue", () => {
    const t = sys();
    t.s.set("p1", "haste", 3);
    t.fighting.add("p1");
    t.run(60_000);
    const data: CharacterData = {};
    t.s.saveTo("p1", data);
    // O código do ciclo 15 lê só `imbuement` (string): o encantamento pago continua lá (como permanente).
    expect(data.imbuement).toBe("haste");
    expect(data.imbue).toEqual({ effect: "haste", tier: 3, leftMs: IMBUE_DURATION_MS - 60_000 });
    // De volta ao ciclo 16: vale o imbue (tier e tempo), não a migração do antigo.
    expect(parseImbue(data)).toEqual({ effect: "haste", tier: 3, leftMs: IMBUE_DURATION_MS - 60_000 });
  });

  it("save antigo vazio ou inválido = nenhum (\"\" era o valor salvo de quem nunca comprou)", () => {
    for (const imbuement of ["", "nope", "toString", undefined]) expect(parseImbue({ imbuement }), String(imbuement)).toBeUndefined();
    expect(parseImbue(undefined)).toBeUndefined();
    const t = sys();
    const data: CharacterData = { imbuement: "" };
    t.s.load("p1", data);
    t.s.saveTo("p1", data);
    expect(data).toEqual({});
  });

  it("imbue novo vale como está; tempo acima de 10 h é cortado; lixo é ignorado (e cai no antigo, se houver)", () => {
    expect(parseImbue({ imbue: { effect: "haste", tier: 3, leftMs: 2 * H } })).toEqual({ effect: "haste", tier: 3, leftMs: 2 * H });
    expect(parseImbue({ imbue: { effect: "haste", tier: 2, leftMs: 99 * H } })!.leftMs).toBe(IMBUE_DURATION_MS);
    // Save corrompido/editado à mão: os tipos do CharacterData não valem na carga.
    const bad = [
      { effect: "haste", tier: 4, leftMs: H }, { effect: "nope", tier: 1, leftMs: H }, { effect: "haste", tier: 1, leftMs: 0 },
      { effect: "haste", tier: 1, leftMs: -5 }, { effect: "haste", tier: 1, leftMs: Number.NaN }, { effect: "haste", tier: "1", leftMs: H },
    ] as unknown as CharacterData["imbue"][];
    for (const imbue of bad) expect(parseImbue({ imbue }), JSON.stringify(imbue)).toBeUndefined();
    expect(parseImbue({ imbue: bad[0], imbuement: "thorns" })).toEqual({ effect: "thorns", tier: 1, leftMs: IMBUE_DURATION_MS });
  });

  it("acabou: salvar apaga o imbue e o campo antigo", () => {
    const t = sys();
    const data: CharacterData = { imbue: { effect: "lifesteal", tier: 2, leftMs: 1000 }, imbuement: "lifesteal" };
    t.s.load("p1", data);
    t.fighting.add("p1");
    t.run(1100);
    expect(t.s.get("p1")).toBeUndefined();
    t.s.saveTo("p1", data);
    expect(data).toEqual({});
  });
});

describe("encantamento: duração em combate PvE", () => {
  it("o tempo só corre em combate PvE; fora dele fica parado", () => {
    const t = sys();
    t.s.set("p1", "lifesteal", 2);
    t.run(60_000);
    expect(t.s.get("p1")!.leftMs).toBe(IMBUE_DURATION_MS);
    t.fighting.add("p1");
    t.run(60_000);
    expect(t.s.get("p1")!.leftMs).toBe(IMBUE_DURATION_MS - 60_000);
    t.fighting.delete("p1");
    t.run(60_000);
    expect(t.s.get("p1")!.leftMs).toBe(IMBUE_DURATION_MS - 60_000);
  });

  it("tique atrasado (servidor engasgado) desconta no máximo IMBUE_MAX_STEP_MS", () => {
    const t = sys();
    t.s.set("p1", "manasteal", 1);
    t.fighting.add("p1");
    t.setClock(t.now() + 30_000);
    t.s.tick(t.now());
    expect(t.s.get("p1")!.leftMs).toBe(IMBUE_DURATION_MS - IMBUE_MAX_STEP_MS);
  });

  it("avisa a 30 min do fim (uma vez) e ao acabar; acabou = sem efeito nem condição", () => {
    const t = sys();
    t.s.load("p1", { imbue: { effect: "thorns", tier: 3, leftMs: IMBUE_WARN_MS + 1000 } });
    t.fighting.add("p1");
    t.run(2000);
    expect(t.notices()).toEqual(["Seu encantamento Espinhos III acaba em 30 min de combate."]);
    t.run(IMBUE_WARN_MS - 5000);
    expect(t.notices()).toHaveLength(1);
    t.run(10_000);
    expect(t.notices().at(-1)).toBe("Seu encantamento Espinhos III acabou. A Dona Marta faz outro.");
    expect(t.sent.every((x) => x.to === "p1")).toBe(true);
    expect(t.s.bonus("p1")).toBeUndefined();
    expect(t.s.condition("p1")).toBeUndefined();
  });

  it("entrar com menos de 30 min não repete o aviso", () => {
    const t = sys();
    t.s.load("p1", { imbue: { effect: "thorns", tier: 1, leftMs: 10 * 60_000 } });
    t.fighting.add("p1");
    t.run(5000);
    expect(t.notices()).toEqual([]);
  });

  it("condição da faixa: minutos restantes (arredondado para cima), tier e efeito; sem remainingMs", () => {
    const t = sys();
    t.s.set("p1", "pierce", 2);
    expect(t.s.condition("p1")).toEqual({ id: "imbued", value: 600, value2: 2, effect: "pierce" });
    t.fighting.add("p1");
    t.run(1000);
    expect(t.s.condition("p1")!.value).toBe(600);
    t.run(59_000);
    expect(t.s.condition("p1")!.value).toBe(599);
    expect(t.s.condition("p2")).toBeUndefined();
  });

  it("comprar de novo troca o efeito e volta às 10 h (não soma)", () => {
    const t = sys();
    t.s.set("p1", "lifesteal", 1);
    t.fighting.add("p1");
    t.run(3000);
    t.s.set("p1", "haste", 3);
    expect(t.s.get("p1")).toEqual({ effect: "haste", tier: 3, leftMs: IMBUE_DURATION_MS });
    expect(t.s.bonus("p1")).toEqual({ effect: "haste", value: 0.15 });
  });
});

describe("encantamento ligado ao combate real (CombatSystem.inPveCombat)", () => {
  /** Mundo do testkit com o encantamento descontando pelo combate de verdade. */
  function setup(over: Parameters<typeof def>[0] = {}) {
    const w = world({
      grid: openGrid(30, 30), spawns: [{ defId: "m", x: 10, y: 10, count: 1, radius: 0 }],
      defs: () => def({ aggroRange: 0, hp: 1_000_000, armor: 0, damage: [0, 0], ...over }), spawn: { x: 25, y: 25 },
    });
    w.mm.spawnAll();
    const imbue = new ImbuementSystem({ inPveCombat: (id, now) => w.combat.inPveCombat(id, now), send: () => {} });
    w.combat.hooks = { imbuement: (p) => imbue.bonus(p.id), canAttackPlayer: () => null };
    imbue.tick(w.now());
    const run = (ms: number) => w.run(ms, () => imbue.tick(w.now()));
    return { ...w, m: [...w.mm.all()][0]!, imbue, run };
  }

  it("caçando monstro o tempo corre", () => {
    const w = setup();
    const p = w.add(player("k", 11, 10, { hp: 500, maxHp: 500 }));
    w.imbue.set("k", "lifesteal", 1);
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS * 5);
    const spent = IMBUE_DURATION_MS - w.imbue.get("k")!.leftMs;
    expect(spent).toBeGreaterThan(PLAYER_ATTACK_MS * 4);
    expect(spent).toBeLessThanOrEqual(PLAYER_ATTACK_MS * 5);
  });

  it("no boneco de treino não gasta", () => {
    const w = setup({ invulnerable: true });
    const p = w.add(player("k", 11, 10, { hp: 500, maxHp: 500 }));
    w.imbue.set("k", "haste", 2);
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS * 5);
    expect(w.combat.inCombat("k", w.now())).toBe(true);
    expect(w.imbue.get("k")!.leftMs).toBe(IMBUE_DURATION_MS);
  });

  it("no PvP não gasta (nem de quem bate nem de quem apanha)", () => {
    const w = setup();
    const a = w.add(player("a", 20, 20, { hp: 5000, maxHp: 5000 }));
    w.add(player("b", 21, 20, { hp: 5000, maxHp: 5000 }));
    w.imbue.set("a", "pierce", 1);
    w.imbue.set("b", "thorns", 1);
    w.combat.onAttack(a, { targetId: "b" });
    w.run(PLAYER_ATTACK_MS * 5);
    expect(w.combat.inCombat("b", w.now())).toBe(true);
    expect(w.imbue.get("a")!.leftMs).toBe(IMBUE_DURATION_MS);
    expect(w.imbue.get("b")!.leftMs).toBe(IMBUE_DURATION_MS);
  });

  it("apanhando de monstro (sem bater) também gasta", () => {
    const w = setup({ aggroRange: 5, damage: [1, 1] });
    w.add(player("v", 11, 10, { hp: 5000, maxHp: 5000 }));
    w.imbue.set("v", "thorns", 1);
    w.run(PLAYER_ATTACK_MS * 5);
    expect(w.imbue.get("v")!.leftMs).toBeLessThan(IMBUE_DURATION_MS);
  });
});
