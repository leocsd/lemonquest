import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BOUNTY_CHEST_ID, MONSTERS, PLAYER_ATTACK_MS, RAID_BOSSES, isRaidBossOk, RAID_BASE_HP, RAID_HP_PER_LEVEL, RAID_MIN_ENGAGED_MS, RAID_SLICE_MS, S2C, eventDef, raidBossOfWeek,
  raidDamageMult, toActive, weekId,
  type ItemInstance,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { InvasionLayout } from "./invasion.ts";
import { RAID_LEVER, RaidSystem } from "./raid.ts";
import { openGrid, player, world } from "./testkit.ts";

const MIN = 60_000;
const VILA = { x0: 30, y0: 30, x1: 49, y1: 49 };
const LAYOUT: InvasionLayout = { vila: VILA, points: [{ name: "invasion_n", x: 40, y: 15, goal: { x: 40, y: 29 } }] };
const EV = eventDef("raide_de_sexta")!;

function setup() {
  const w = world({ grid: openGrid(90, 70), spawns: [], safeZones: [VILA], eliteChance: 0 });
  const got: { name: string; defId: string; count: number }[] = [];
  const wins: string[] = [];
  const raid = new RaidSystem({
    layout: LAYOUT, monsters: w.mm,
    players: () => w.players.values(), getPlayer: (id) => w.players.get(id),
    send: (to, type, msg) => w.sent.push({ to, type, msg }),
    broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }),
    inventory: { addItem: (p: PlayerState, it: ItemInstance) => { got.push({ name: p.name, defId: it.defId, count: it.count }); return 0; } },
    onVictory: (p) => wins.push(p.name),
    now: w.now,
  });
  w.combat.hooks = { onDealt: (pid, dealt, _r, m) => raid.onDamage(pid, m, dealt), onHealOther: (h, t, n) => raid.onHealOther(h, t, n) };
  const ev = (minutes = 45, from = w.now()) => toActive(EV, from + minutes * MIN);
  const step = (ms: number) => w.run(ms, () => raid.tick(w.now()));
  const feeds = () => w.sent.filter((s) => s.type === S2C.Feed).map((s) => s.msg.text as string);
  return { w, raid, got, wins, ev, step, feeds };
}

describe("dados do raide", () => {
  it("evento da sexta 16h na Agenda, com raide; chefe da semana em rodízio", () => {
    expect([EV.day, EV.hour, EV.durationMin, EV.raid]).toEqual([5, 16, 45, true]);
    expect(raidBossOfWeek("2026-W45")).not.toBe(raidBossOfWeek("2026-W46"));
    expect(raidBossOfWeek("2026-W46")).toBe(raidBossOfWeek("2026-W48"));
  });

  it("chefes de raide: existem, são chefes, os ajudantes existem e nenhum tem spawn no mapa (só o evento)", () => {
    const map = readFileSync(new URL("../../../../assets/maps/world.json", import.meta.url), "utf8");
    for (const id of RAID_BOSSES) {
      expect(isRaidBossOk(id), id).toBe(true);
      for (const a of MONSTERS[id]!.abilities ?? []) if (a.summon) expect(MONSTERS[a.summon.monsterId], a.summon.monsterId).toBeDefined();
      expect(map.includes(`"value":"${id}"`), `${id} sem spawn de mapa`).toBe(false);
    }
  });

  it("dano acompanha o menor level (lv 15 → ×0,25; lv 60 → ×1; lv 150 → ×2)", () => {
    expect([raidDamageMult(15), raidDamageMult(60), raidDamageMult(150), raidDamageMult(NaN)]).toEqual([0.25, 1, 2, 1]);
  });
});

describe("RaidSystem", () => {
  it("o evento convoca o chefe da semana no ponto do norte, com a vida-base, e avisa todo mundo", () => {
    const { w, raid, ev, feeds } = setup();
    expect(raid.start(ev())).toBe(true);
    const boss = raid.boss!;
    expect(boss.def.id).toBe(raidBossOfWeek(weekId(new Date(w.now()))));
    expect([boss.s.x, boss.s.y, boss.s.maxHp, boss.questLever]).toEqual([40, 15, RAID_BASE_HP, RAID_LEVER]);
    expect(feeds().some((t) => t.includes("chegou ao norte da Vila"))).toBe(true);
    // Mesma ocorrência não começa duas vezes.
    expect(raid.start(ev())).toBe(false);
  });

  it("quem bate se engaja: a vida sobe com a soma dos levels (e não desce) e o dano segue o menor level", () => {
    const { w, raid, ev, step } = setup();
    raid.start(ev());
    const boss = raid.boss!;
    boss.def = { ...boss.def, aggroRange: 0 }; // parado: o teste mede só a escala
    const a = w.add(player("a", 41, 15, { level: 100, hp: 99_999, maxHp: 99_999 }));
    const b = w.add(player("b", 39, 15, { level: 20, hp: 99_999, maxHp: 99_999 }));
    w.combat.onAttack(a, { targetId: boss.s.id });
    w.combat.onAttack(b, { targetId: boss.s.id });
    step(PLAYER_ATTACK_MS + 1100);
    expect(boss.s.maxHp).toBe(RAID_BASE_HP + RAID_HP_PER_LEVEL * 120);
    expect(boss.dmgMult).toBe(raidDamageMult(20));
    // Os dois param de bater e o tempo passa: a vida máxima fica, o dano volta ao padrão.
    a.targetId = ""; b.targetId = "";
    step(3 * RAID_SLICE_MS);
    expect(boss.s.maxHp).toBe(RAID_BASE_HP + RAID_HP_PER_LEVEL * 120);
    expect(boss.dmgMult).toBe(1);
  });

  it("vitória: quem lutou 1 minuto ganha 2 baús e a conquista; quem mal bateu não ganha", () => {
    const { w, raid, got, wins, ev, step, feeds } = setup();
    raid.start(ev());
    const boss = raid.boss!;
    boss.def = { ...boss.def, aggroRange: 0, abilities: [] };
    const a = w.add(player("a", 41, 15, { level: 80, hp: 99_999, maxHp: 99_999 }));
    w.combat.onAttack(a, { targetId: boss.s.id });
    step(RAID_MIN_ENGAGED_MS + RAID_SLICE_MS);
    const late = w.add(player("late", 39, 15, { level: 80, hp: 99_999, maxHp: 99_999 }));
    w.combat.onAttack(late, { targetId: boss.s.id });
    step(PLAYER_ATTACK_MS + 100);
    boss.s.hp = 1; // derruba no próximo golpe
    step(2 * PLAYER_ATTACK_MS + 1100);
    expect(w.mm.get(boss.s.id)).toBeUndefined();
    expect(raid.active).toBe(false);
    expect(got).toEqual([{ name: "a", defId: BOUNTY_CHEST_ID, count: 2 }]);
    expect(wins).toEqual(["a"]);
    expect(feeds().some((t) => t.startsWith("⚔ Raide vencido!"))).toBe(true);
  });

  it("fim do evento com o chefe vivo: ele vai embora com os ajudantes e quem lutou leva 1 baú", () => {
    const { w, raid, got, wins, ev, step, feeds } = setup();
    const e = ev();
    raid.start(e);
    const boss = raid.boss!;
    boss.def = { ...boss.def, aggroRange: 0, abilities: [] };
    const a = w.add(player("a", 41, 15, { level: 80, hp: 99_999, maxHp: 99_999 }));
    w.combat.onAttack(a, { targetId: boss.s.id });
    step(RAID_MIN_ENGAGED_MS + RAID_SLICE_MS);
    raid.end(e);
    expect([...w.mm.all()].filter((m) => m.questLever === RAID_LEVER)).toHaveLength(0);
    expect(got).toEqual([{ name: "a", defId: BOUNTY_CHEST_ID, count: 1 }]);
    expect(wins).toEqual([]);
    expect(feeds().some((t) => t.includes("foi embora"))).toBe(true);
    // Não volta na mesma ocorrência.
    expect(raid.start(e)).toBe(false);
  });

  it("o chefe só percebe quem está perto (não mira quem caça do outro lado do mapa)", () => {
    const { w, raid, ev } = setup();
    raid.start(ev());
    const boss = raid.boss!;
    const longe = w.add(player("longe", 85, 65));
    const perto = w.add(player("perto", 44, 15));
    expect(w.mm.allowedFor(boss, longe.id)).toBe(false);
    expect(w.mm.allowedFor(boss, perto.id)).toBe(true);
  });

  it("evento prorrogado (/evento durante o raide): o fim com o horário novo encerra o raide", () => {
    const { w, raid, ev, feeds } = setup();
    const e = ev();
    raid.start(e);
    const longer = ev(75);
    raid.end(longer); // sem o extend: fim de outra ocorrência, ignorado
    expect(raid.boss).toBeDefined();
    raid.extend(e, longer);
    raid.end(longer);
    expect([...w.mm.all()].filter((m) => m.questLever === RAID_LEVER)).toHaveLength(0);
    expect(feeds().some((t) => t.includes("foi embora"))).toBe(true);
    expect(raid.start(longer)).toBe(false);
  });

  it("evento sem raide e mapa sem o ponto: nada nasce", () => {
    const { raid, w } = setup();
    expect(raid.start(toActive(eventDef("sextou")!, w.now() + MIN))).toBe(false);
    const empty = new RaidSystem({
      layout: null, monsters: w.mm, players: () => [], getPlayer: () => undefined, send: () => {}, broadcast: () => {},
      inventory: { addItem: () => 0 },
    });
    expect(empty.start(toActive(EV, w.now() + MIN))).toBe(false);
  });
});
