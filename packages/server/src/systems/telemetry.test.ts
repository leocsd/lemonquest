import { describe, expect, it } from "vitest";
import type { MonsterAbility } from "@lemonquest/shared";
import { ConditionSystem } from "./conditions.ts";
import { MonsterAbilitySystem } from "./monsterAbilities.ts";
import { PlayTelemetry, SUMMARY_MIN_MS, causeLabel, deathReport, skillReport, summarizePlay, vocationReport } from "./telemetry.ts";
import { def, openGrid, player, world } from "./testkit.ts";

const H = 3_600_000;

describe("telemetria de progressão", () => {
  it("conta o tempo no level em que foi jogado e troca de balde ao subir", () => {
    let now = 0;
    const t = new PlayTelemetry(() => now);
    t.onJoin("a", 5, undefined);
    now = 10 * 60_000;
    t.onLevel("a", 6);
    now = 25 * 60_000;
    const d = t.serialize("a", 6)!;
    expect(d.ms).toBe(25 * 60_000);
    expect(d.byLevel["5"]!.ms).toBe(10 * 60_000);
    expect(d.byLevel["6"]!.ms).toBe(15 * 60_000);
  });

  it("serialize com level diferente (comando /level) fecha o tempo no level anterior", () => {
    let now = 0;
    const t = new PlayTelemetry(() => now);
    t.onJoin("a", 10, undefined);
    now = 60_000;
    const d = t.serialize("a", 3)!; // desceu por comando de dev
    expect(d.byLevel["10"]!.ms).toBe(60_000);
    expect(d.byLevel["3"]).toBeUndefined();
    now = 120_000;
    expect(t.serialize("a", 3)!.byLevel["3"]!.ms).toBe(60_000);
  });

  it("mortes, ouro ganho e gasto caem no level atual; valores negativos ou zero são ignorados", () => {
    const t = new PlayTelemetry(() => 0);
    t.onJoin("a", 20, undefined);
    t.onDeath("a"); t.onDeath("a");
    t.onGold("a", 150); t.onGold("a", 0); t.onGold("a", -5);
    t.onSpend("a", 40); t.onSpend("a", -1);
    const b = t.serialize("a", 20)!.byLevel["20"]!;
    expect(b).toEqual({ ms: 0, deaths: 2, goldIn: 150, goldOut: 40 });
  });

  it("continua a partir do que estava salvo e devolve cópia (não compartilha o objeto)", () => {
    let now = 0;
    const t = new PlayTelemetry(() => now);
    const saved = { ms: 5000, byLevel: { "8": { ms: 5000, deaths: 1, goldIn: 10, goldOut: 0 } } };
    t.onJoin("a", 8, saved);
    now = 1000;
    const d = t.serialize("a", 8)!;
    expect(d.ms).toBe(6000);
    expect(d.byLevel["8"]!.ms).toBe(6000);
    expect(saved.byLevel["8"]!.ms).toBe(5000); // o salvo não foi alterado
    d.byLevel["8"]!.deaths = 99;
    expect(t.serialize("a", 8)!.byLevel["8"]!.deaths).toBe(1);
  });

  it("ignora jogador desconhecido e esquece ao sair", () => {
    const t = new PlayTelemetry(() => 0);
    t.onDeath("x"); t.onGold("x", 5);
    expect(t.serialize("x", 1)).toBeUndefined();
    t.onJoin("a", 1, undefined);
    t.removePlayer("a");
    expect(t.serialize("a", 1)).toBeUndefined();
  });

  it("resumo por faixa: horas por level, mortes e ouro líquido por hora; faixa com pouco tempo fica de fora", () => {
    const a = { ms: 0, byLevel: { "10": { ms: H, deaths: 2, goldIn: 5000, goldOut: 1000 }, "11": { ms: H, deaths: 0, goldIn: 3000, goldOut: 0 } } };
    const b = { ms: 0, byLevel: { "12": { ms: 2 * H, deaths: 2, goldIn: 0, goldOut: 8000 }, "50": { ms: SUMMARY_MIN_MS - 1, deaths: 9, goldIn: 0, goldOut: 0 } } };
    const lines = summarizePlay([a, undefined, b]);
    expect(lines).toHaveLength(1);
    // Faixa 10–19: 4 h em 3 levels = 1,33 h/level; 4 mortes / 4 h = 1,0; ouro (8000 − 9000) / 4 h = −250.
    expect(lines[0]).toContain("10–19: 1.33 h/level · 1.0 mortes/h · −250 ouro/h");
    expect(lines[0]).not.toContain("40–59");
  });

  it("resumo sem dados avisa", () => {
    expect(summarizePlay([])[0]).toContain("ainda sem 10 min");
  });
});

describe("telemetria do ciclo 12: abates, XP, dano e resistência", () => {
  it("conta no level atual e sobrevive ao save; save antigo sem os campos vale 0", () => {
    let now = 0;
    const t = new PlayTelemetry(() => now);
    t.onJoin("a", 90, { ms: 0, byLevel: { "90": { ms: 1000, deaths: 1, goldIn: 5, goldOut: 0 } } });
    t.onKill("a"); t.onKill("a");
    t.onXp("a", 8000.7);
    t.onDamage("a", 300, 100);
    t.onDamage("a", 0, 0);
    now = 60_000;
    const d = t.serialize("a", 90)!;
    expect(d.byLevel["90"]).toMatchObject({ deaths: 1, goldIn: 5, kills: 2, xp: 8000, dmg: 300, resisted: 100 });
  });

  it("relatório por vocação e faixa: XP/h, abates/h, dano/h, % resistido e mortes/h; amostra pequena fica de fora", () => {
    const lv = (ms: number, x: Partial<Record<"kills" | "xp" | "dmg" | "resisted" | "deaths", number>>) => ({ ms, goldIn: 0, goldOut: 0, deaths: 0, ...x });
    const lines = vocationReport([
      { vocation: "sorcerer", play: { ms: 2 * H, byLevel: { "100": lv(H, { kills: 60, xp: 600_000, dmg: 300_000, resisted: 100_000, deaths: 2 }), "101": lv(H, { kills: 40, xp: 400_000, dmg: 100_000, resisted: 0 }) } } },
      { vocation: "knight", play: { ms: SUMMARY_MIN_MS - 1, byLevel: { "100": lv(SUMMARY_MIN_MS - 1, { kills: 5 }) } } },
      { vocation: "druid", play: undefined },
    ]);
    expect(lines).toHaveLength(1);
    for (const part of ["sorcerer 100+", "2.0 h (1 pers.)", "500.0 mil XP/h", "50 abates/h", "200.0 mil dano/h", "20% resistido", "1.0 mortes/h"]) {
      expect(lines[0]).toContain(part);
    }
    expect(vocationReport([])).toEqual(["Ainda sem 10 min jogados com a telemetria nova em nenhuma vocação/faixa."]);
  });
});

/**
 * Mundo de teste com um monstro "dummy" em (10,10) e a vítima "v" (lv 5, 30 de vida) ao lado; o gancho de morte liga a
 * telemetria como o WorldRoom deve ligar. `deaths()` = o `deathsBy` gravado no level 5.
 */
function deathWorld(over: Parameters<typeof def>[0] = {}) {
  const w = world({
    grid: openGrid(30, 30), spawns: [{ defId: "dummy", x: 10, y: 10, count: 1, radius: 0 }],
    defs: () => def({ aggroRange: 5, ...over }), spawn: { x: 25, y: 25 },
  });
  w.mm.spawnAll();
  const m = [...w.mm.all()][0]!;
  const t = new PlayTelemetry(() => w.now());
  w.combat.hooks = { onPlayerDied: (p, _name, key) => t.onDeath(p.id, key) };
  const victim = w.add(player("v", 11, 10, { name: "Ana", level: 5, hp: 30, maxHp: 300 }));
  t.onJoin("v", 5, undefined);
  const deaths = () => t.serialize("v", 5)!.byLevel["5"]?.deathsBy;
  return { ...w, m, victim, deaths };
}

function withConditions(w: ReturnType<typeof deathWorld>) {
  const c = new ConditionSystem({ monsters: w.mm, combat: w.combat, getPlayer: (id) => w.players.get(id), players: () => w.players.values(), send: () => {} });
  /** Avança em passos de 2 s (intervalo do dano contínuo) até a vítima morrer (voltar com a vida cheia). */
  const tickUntilDeath = () => { for (let i = 0; i < 10 && w.victim.hp !== w.victim.maxHp; i++) { w.setClock(w.now() + 2000); c.tick(w.now()); } };
  return { c, tickUntilDeath };
}

describe("causa da morte (ciclo 15): killerKey → deathsBy", () => {
  it("golpe do monstro: id do monstro", () => {
    const w = deathWorld({ damage: [40, 40] });
    w.run(2500);
    expect(w.deaths()).toEqual({ dummy: 1 });
  });

  it("habilidade do monstro: monstro/habilidade", () => {
    const stomp: MonsterAbility = {
      id: "stomp", name: "Pisão", shape: "area_self", radius: 1, cooldownMs: 5000, windupMs: 800,
      damage: { min: 40, max: 40, kind: "physical" }, fx: "physical",
    };
    const w = deathWorld({ damage: [0, 0], abilities: [stomp] });
    const abil = new MonsterAbilitySystem({
      grid: openGrid(30, 30), monsters: w.mm, combat: w.combat, conditions: { apply: () => {} },
      players: () => w.players.values(), broadcast: () => {}, rng: () => 0,
    });
    w.run(15_000, () => abil.tick(w.now()));
    expect(w.deaths()).toEqual({ "dummy/stomp": 1 });
  });

  it("dano contínuo: condição@monstro (fixado ao aplicar, vale mesmo com o monstro já morto)", () => {
    const w = deathWorld({ aggroRange: 0 });
    const { c, tickUntilDeath } = withConditions(w);
    c.apply("v", "burn", 20_000, 20, w.m.s.id, w.now());
    w.combat.damageMonster(w.m, "", 1e6, "physical", w.now());
    expect(w.mm.get(w.m.s.id)).toBeUndefined();
    tickUntilDeath();
    expect(w.deaths()).toEqual({ "burn@dummy": 1 });
  });

  it("condição aplicada por jogador conta como pvp; sem dono conhecido, só a condição", () => {
    const a = deathWorld({ aggroRange: 0 });
    a.add(player("k", 12, 10, { name: "Bia" }));
    const ca = withConditions(a);
    ca.c.apply("v", "poison", 20_000, 20, "k", a.now());
    ca.tickUntilDeath();
    expect(a.deaths()).toEqual({ pvp: 1 });

    const b = deathWorld({ aggroRange: 0 });
    const cb = withConditions(b);
    cb.c.apply("v", "energy", 20_000, 20, "", b.now());
    cb.tickUntilDeath();
    expect(b.deaths()).toEqual({ energy: 1 });
  });

  it("golpe de jogador (ataque ou magia via hitPlayer) = pvp; dano sem causa informada = ?", () => {
    const w = deathWorld({ aggroRange: 0 });
    const k = w.add(player("k", 12, 10, { name: "Bia" }));
    w.combat.hitPlayer(k, w.victim, 1000, "fire", w.now());
    w.victim.hp = 30;
    w.combat.damagePlayer(w.victim, "", 1000, "physical", w.now());
    expect(w.deaths()).toEqual({ pvp: 1, "?": 1 });
  });

  it("deathsBy sobrevive ao save, é copiado (o salvo não muda) e save antigo sem o campo continua lendo", () => {
    const t = new PlayTelemetry(() => 0);
    const saved = { ms: 0, byLevel: { "70": { ms: 0, deaths: 3, goldIn: 0, goldOut: 0, deathsBy: { dragon: 1 } }, "69": { ms: 0, deaths: 2, goldIn: 0, goldOut: 0 } } };
    t.onJoin("a", 70, saved);
    t.onDeath("a", "dragon"); t.onDeath("a", "pvp"); t.onDeath("a");
    const d = t.serialize("a", 70)!;
    expect(d.byLevel["70"]).toMatchObject({ deaths: 6, deathsBy: { dragon: 2, pvp: 1 } });
    expect(saved.byLevel["70"]!.deathsBy).toEqual({ dragon: 1 });
    d.byLevel["70"]!.deathsBy!.dragon = 99;
    expect(t.serialize("a", 70)!.byLevel["70"]!.deathsBy!.dragon).toBe(2);
    expect(d.byLevel["69"]!.deathsBy).toBeUndefined();
  });
});

describe("relatórios do admin telemetria (ciclo 15)", () => {
  it("nome legível da causa: monstro, habilidade, condição e pvp", () => {
    expect(causeLabel("goblin_king")).toBe("Rei Goblin");
    expect(causeLabel("goblin_king/stomp")).toBe("Rei Goblin: Pisão do Rei");
    expect(causeLabel("burn@goblin_king")).toBe("queimadura (Rei Goblin)");
    expect(causeLabel("poison")).toBe("veneno");
    expect(causeLabel("pvp")).toBe("PvP");
    expect(causeLabel("?")).toBe("desconhecida");
    expect(causeLabel("monstro_removido/x")).toBe("monstro_removido: x"); // id que saiu do jogo: mostra a chave
  });

  it("causas por faixa: soma os levels da faixa, top N, resto em \"outras\" e mortes antigas como \"sem causa\"", () => {
    const lv = (deaths: number, deathsBy?: Record<string, number>) => ({ ms: 0, deaths, goldIn: 0, goldOut: 0, ...(deathsBy ? { deathsBy } : {}) });
    const lines = deathReport([
      { ms: 0, byLevel: { "62": lv(5, { goblin_king: 2, pvp: 1 }), "75": lv(4, { goblin_king: 1, "goblin_king/stomp": 2, "burn@goblin_king": 1 }) } },
      { ms: 0, byLevel: { "10": lv(1) } },
      undefined,
    ], 2);
    expect(lines).toEqual([
      "1–19       1 mortes · sem causa 1",
      "60–79      9 mortes · Rei Goblin 3 · Rei Goblin: Pisão do Rei 2 · outras 2 · sem causa 2",
    ]);
    expect(deathReport([])).toEqual(["Nenhuma morte registrada."]);
  });

  it("skills reais por vocação × faixa: média [mín–máx] de ML, arma (cavaleiro melee, paladino distância) e escudo", () => {
    const lines = skillReport([
      { vocation: "knight", level: 65, skills: { melee: { level: 60 }, shield: { level: 55 }, magic: { level: 4 } } },
      { vocation: "knight", level: 70, skills: { melee: { level: 70 }, shield: { level: 61 }, magic: { level: 6 } } },
      { vocation: "paladin", level: 30, skills: { distance: { level: 45 }, magic: { level: 12 } } },
      { vocation: "sorcerer", level: 100, skills: { magic: { level: 48 }, shield: { level: 20 } } },
      { vocation: "druid", level: 5 }, // nunca treinou: valores iniciais
    ]);
    expect(lines).toEqual([
      "knight   60–79     2 pers. · ML 5.0 [4–6] · arma 65.0 [60–70] · escudo 58.0 [55–61]",
      "paladin  20–39     1 pers. · ML 12.0 [12–12] · arma 45.0 [45–45] · escudo 10.0 [10–10]",
      "sorcerer 100+      1 pers. · ML 48.0 [48–48] · escudo 20.0 [20–20]",
      "druid    1–19      1 pers. · ML 0.0 [0–0] · escudo 10.0 [10–10]",
    ]);
    expect(skillReport([])).toEqual(["Nenhum personagem salvo."]);
  });
});
