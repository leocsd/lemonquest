/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CALL_HELP_ID } from "./monsterAbilities.ts";
import {
  ELITE, ELITE_CHANCE, HELP_RADIUS, MONSTERS, OWN_ELEMENT_TAKEN, canBeElite, damageTakenMult, eliteName, monsterAbilitySpell, monsterDamageMult,
  monsterResistances, summonScaled,
} from "./monsters.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const world = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8"));

function spawnIds(): string[] {
  const layer = world.layers.find((l: any) => l.name === "objects");
  const ids = new Set<string>();
  for (const o of layer.objects) {
    const p = (o.properties ?? []).find((q: any) => q.name === "monster");
    if (p) ids.add(p.value);
  }
  return [...ids];
}

describe("MONSTERS", () => {
  it("define todo monstro usado nos spawns do mapa", () => {
    const ids = spawnIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(MONSTERS[id], id).toBeDefined();
  });

  it("sprites existem em disco", () => {
    for (const d of Object.values(MONSTERS)) {
      expect(existsSync(root + "assets/" + d.sprite.url), d.id).toBe(true);
      if (d.sprite.layout === "custom") expect(d.sprite.walk, d.id).toBeDefined();
    }
  });

  it("frames cabem no PNG (largura e altura múltiplas do frame; frames da caminhada existem)", () => {
    for (const d of Object.values(MONSTERS)) {
      const png = readFileSync(root + "assets/" + d.sprite.url);
      const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
      const { frameWidth: fw, frameHeight: fh } = d.sprite;
      expect(w % fw, `${d.id}: largura ${w} / ${fw}`).toBe(0);
      expect(h % fh, `${d.id}: altura ${h} / ${fh}`).toBe(0);
      const total = (w / fw) * (h / fh);
      for (const f of Object.values(d.sprite.walk ?? {}).flat()) expect(f, d.id).toBeLessThan(total);
    }
    // Samurai Rubro: tira 576x48 de 6 frames 96x48 (em 12 de 48 cada frame mostrava meio samurai).
    const s = MONSTERS.abyss_samurai!.sprite;
    expect([s.frameWidth, s.frameHeight, s.walk!.down]).toEqual([96, 48, [0, 1, 2, 3, 4, 5]]);
  });

  it("campos sensatos", () => {
    for (const [key, d] of Object.entries(MONSTERS)) {
      if (d.invulnerable) { expect(d.stationary, key).toBe(true); expect(d.xp, key).toBe(0); continue; } // boneco de treino
      if (key.startsWith("summoned_")) { expect(d.hp).toBeGreaterThan(0); continue; } // invocações: xp 0, sem respawn
      expect(d.id).toBe(key);
      expect(d.hp).toBeGreaterThan(0);
      expect(d.xp).toBeGreaterThan(0);
      expect(d.damage[0]).toBeLessThanOrEqual(d.damage[1]);
      expect(d.attackRange).toBeGreaterThanOrEqual(1);
      expect(d.stepMs).toBeGreaterThanOrEqual(200);
      expect(d.stepMs).toBeLessThanOrEqual(900);
      expect(d.respawnMs).toBeGreaterThan(0);
    }
  });

  it("xp por hp cresce (aprox.) com o level", () => {
    const list = Object.values(MONSTERS).filter((d) => !d.boss && !d.invulnerable && !d.id.startsWith("summoned_")).sort((a, b) => a.level - b.level);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      expect(cur.xp / cur.hp, `${prev.id} -> ${cur.id}`).toBeGreaterThanOrEqual((prev.xp / prev.hp) * 0.9);
    }
  });

  it("bosses respawnam em ~2h", () => {
    for (const d of Object.values(MONSTERS).filter((m) => m.boss)) expect(d.respawnMs).toBeGreaterThanOrEqual(3_600_000);
  });
});

describe("ciclo 8: dano por level, respawn, elites e bandos", () => {
  it("dano por level já aplicado aos dados (ataque básico e habilidades, chefes inclusive)", () => {
    // Números dos dados antes da transformação → depois.
    expect(MONSTERS.rat!.damage).toEqual([1, 4]); // lv 1: ×1
    expect(MONSTERS.skeleton!.damage).toEqual([28, 59]); // lv 24: [20, 42] × 1,4
    expect(MONSTERS.orc_warrior!.damage).toEqual([60, 120]); // lv 42: [40, 80] × 1,5
    expect(MONSTERS.dragon!.damage).toEqual([112, 224]); // lv 70: [70, 140] × 1,6
    expect(MONSTERS.dragon!.abilities![0]!.damage).toMatchObject({ min: 144, max: 272 }); // sopro [90, 170] × 1,6
    expect(MONSTERS.demon!.damage).toEqual([221, 425]); // lv 100: [130, 250] × 1,7
    expect(MONSTERS.orshabaal!.damage).toEqual([374, 680]); // chefe lv 120: [220, 400] × 1,7
    expect(MONSTERS.summoned_wolf!.damage).toEqual([14, 26]); // invocação do druida: fora
    expect(monsterDamageMult(MONSTERS.summoned_wolf!)).toBe(1);
    expect(monsterDamageMult(MONSTERS.training_dummy!)).toBe(1);
    expect([19, 20, 39, 40, 69, 70, 99, 100].map((level) => monsterDamageMult({ level, xp: 1 }))).toEqual([1, 1.4, 1.4, 1.5, 1.5, 1.6, 1.6, 1.7]);
  });

  it("Lobo Espiritual escala com o level do druida: lv 20 = catálogo; lv 46 = vida 570 e dano ×1,75 (GD-05)", () => {
    const wolf = MONSTERS.summoned_wolf!;
    expect(wolf).toMatchObject({ level: 20, hp: 180, damage: [14, 26] });
    expect(summonScaled(wolf, 20)).toBe(wolf);   // no level base devolve o próprio catálogo (sem cópia)
    expect(summonScaled(wolf, 5)).toBe(wolf);    // abaixo do base nada muda
    const lv46 = summonScaled(wolf, 46);
    expect(lv46.hp).toBe(570);                    // 180 + 15 × 26
    expect(lv46.damage).toEqual([25, 46]);        // [14, 26] × 1,75 arredondado
    expect(summonScaled(wolf, 33).hp).toBe(375);  // linear no meio do caminho
    expect(wolf.hp).toBe(180);                    // o catálogo não é alterado
    // Um monstro lv 1 escalado pelo nível do invocador: ganhos lineares, inteiros
    const d = summonScaled(MONSTERS.rat!, 27);
    expect(d.hp).toBe(MONSTERS.rat!.hp + 15 * 26);
    expect(d.damage.every(Number.isInteger)).toBe(true);
  });

  it("habilidades seguem ≤ 2× o dano máximo do ataque básico depois da escala", () => {
    for (const m of Object.values(MONSTERS)) for (const a of m.abilities ?? []) {
      if (a.damage) expect(a.damage.max, `${m.id}/${a.id}`).toBeLessThanOrEqual(2 * m.damage[1]);
    }
  });

  it("respawn dos comuns ×0,7; chefes e boneco iguais", () => {
    expect(MONSTERS.rat!.respawnMs).toBe(14_000); // 20 s
    expect(MONSTERS.demon!.respawnMs).toBe(105_000); // 150 s
    expect(MONSTERS.goblin_king!.respawnMs).toBe(7_200_000);
    expect(MONSTERS.training_dummy!.respawnMs).toBe(5000);
  });

  it("elite: só comum de level ≥ 10 (nunca chefe, invocação ou boneco)", () => {
    expect(ELITE).toEqual({ hp: 2.5, dmg: 1.3, xp: 3, gold: 2, loot: 2 });
    expect(ELITE_CHANCE).toBe(0.05);
    expect(canBeElite(MONSTERS.wolf!)).toBe(false); // lv 8
    expect(canBeElite(MONSTERS.snake!)).toBe(true); // lv 12
    expect(canBeElite(MONSTERS.goblin_king!)).toBe(false);
    expect(canBeElite(MONSTERS.summoned_wolf!)).toBe(false);
    expect(canBeElite(MONSTERS.training_dummy!)).toBe(false);
    expect(eliteName("Dragão")).toBe("Elite Dragão");
  });

  it("bandos e fuga: famílias, grito do reforço e fujões a 20%", () => {
    const fam = (id: string) => MONSTERS[id]!.pack?.family;
    expect(["wolf", "winter_wolf"].map(fam)).toEqual(["wolf", "wolf"]);
    expect(["orc_warrior", "orc_shaman"].map(fam)).toEqual(["orc", "orc"]);
    expect(["minotaur", "minotaur_mage"].map(fam)).toEqual(["minotaur", "minotaur"]);
    expect(["pirate_marauder", "pirate_corsair", "pirate_buccaneer"].map(fam)).toEqual(["pirate", "pirate", "pirate"]);
    expect(["sibang", "kongra", "merlkin"].map(fam)).toEqual(["ape", "ape", "ape"]);
    expect([fam("barbarian"), fam("goblin")]).toEqual(["barbarian", "goblin"]);
    for (const id of ["goblin", "pirate_marauder", "pirate_corsair", "pirate_buccaneer", "sibang", "merlkin"]) expect(MONSTERS[id]!.fleeAtHpPct, id).toBe(0.2);
    for (const m of Object.values(MONSTERS)) if (m.pack) expect(m.boss, m.id).toBeFalsy();
    const shout = monsterAbilitySpell(`m:orc_warrior:${CALL_HELP_ID}`);
    expect(shout).toMatchObject({ words: "Orcs, ao ataque!", fx: "taunt", radius: HELP_RADIUS });
    expect(monsterAbilitySpell(`m:rat:${CALL_HELP_ID}`)).toBeUndefined(); // sem bando, sem grito
  });

  it("conjuradores curam os aliados (heal_allies primeiro na lista)", () => {
    for (const id of ["orc_shaman", "minotaur_mage", "necromancer", "ice_witch", "merlkin"]) {
      const a = MONSTERS[id]!.abilities![0]!;
      expect(a.id, id).toBe("heal_allies");
      expect(a.healAllies!.pct, id).toBeGreaterThan(0);
      expect(a.fx).toBe("heal");
    }
  });
});

describe("resistência elemental", () => {
  it("todo bicho de elemento resiste ao próprio; físico nunca muda; dragões de fogo e de gelo resistem cada um ao seu", () => {
    for (const m of Object.values(MONSTERS)) {
      expect(damageTakenMult(m, "physical"), m.id).toBe(1);
      if (m.damageKind !== "physical") expect(damageTakenMult(m, m.damageKind), m.id).toBe(OWN_ELEMENT_TAKEN);
    }
    expect(damageTakenMult(MONSTERS.dragon!, "fire")).toBe(0.5);
    expect(damageTakenMult(MONSTERS.dragon!, "ice")).toBe(1);
    expect(damageTakenMult(MONSTERS.frost_dragon!, "ice")).toBe(0.5);
    expect(damageTakenMult(MONSTERS.frost_dragon!, "fire")).toBe(1);
    expect(monsterResistances(MONSTERS.frost_dragon!)).toEqual([{ kind: "ice", mult: 0.5 }]);
    expect(monsterResistances(MONSTERS.rat!)).toEqual([]);
  });

  it("o Dragão de Gelo usa o sprite próprio (não o dragão verde tingido)", () => {
    expect(MONSTERS.frost_dragon!.sprite.url).toBe("monsters/FrostDragon.png");
    expect(MONSTERS.frost_dragon!.sprite.tint).toBeUndefined();
  });
});
