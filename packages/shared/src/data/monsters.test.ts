/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CALL_HELP_ID } from "./monsterAbilities.ts";
import {
  BOSS_ROOT_SLOW_PCT, BOSS_SLOW_MULT, ELEMENT_WEAKNESS, ELITE, ELITE_CHANCE, HELP_RADIUS, MONSTERS, OWN_ELEMENT_TAKEN, bossCondition, canBeElite,
  damageTakenMult, eliteName, monsterAbilitySpell, monsterDamageMult, monsterNatures, monsterResistances, summonScaled, type MonsterNature,
} from "./monsters.ts";
import { SPELLS } from "./spells.ts";

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

  it("Lobo Espiritual escala com o level do druida: lv 20 = catálogo; lv 46 = vida 830 e dano ×2,5 (GD-05, ciclo 15)", () => {
    // Ciclo 15: 25 de vida por level (era 15) e bônus de dano 1,5 (era 0,75). Antes: lv 46 vida 570 e dano [25, 46];
    // lv 100 vida 1.380 e dano [46, 86].
    const wolf = MONSTERS.summoned_wolf!;
    expect(wolf).toMatchObject({ level: 20, hp: 180, damage: [14, 26] });
    expect(summonScaled(wolf, 20)).toBe(wolf);   // no level base devolve o próprio catálogo (sem cópia)
    expect(summonScaled(wolf, 5)).toBe(wolf);    // abaixo do base nada muda
    const lv46 = summonScaled(wolf, 46);
    expect(lv46.hp).toBe(830);                    // 180 + 25 × 26
    expect(lv46.damage).toEqual([35, 65]);        // [14, 26] × 2,5 arredondado
    expect(summonScaled(wolf, 33).hp).toBe(505);  // linear no meio do caminho
    const lv100 = summonScaled(wolf, 100);
    expect(lv100.hp).toBe(2180);                  // 180 + 25 × 80
    expect(lv100.damage).toEqual([79, 146]);      // × (1 + 1,5 × 80/26) ≈ 5,6
    expect(wolf.hp).toBe(180);                    // o catálogo não é alterado
    // Um monstro lv 1 escalado pelo nível do invocador: ganhos lineares, inteiros
    const d = summonScaled(MONSTERS.rat!, 27);
    expect(d.hp).toBe(MONSTERS.rat!.hp + 25 * 26);
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
    expect(damageTakenMult(MONSTERS.dragon!, "energy")).toBe(1);
    expect(damageTakenMult(MONSTERS.frost_dragon!, "ice")).toBe(0.5);
    expect(damageTakenMult(MONSTERS.frost_dragon!, "energy")).toBe(1);
    expect(monsterResistances(MONSTERS.rat!)).toEqual([]);
  });

  it("fraquezas (ciclo 15): morto-vivo +25% de sagrado, bicho de fogo +15% de gelo, bicho de gelo +15% de fogo", () => {
    expect(ELEMENT_WEAKNESS).toEqual({ undead: { kind: "holy", mult: 1.25 }, fire: { kind: "ice", mult: 1.15 }, ice: { kind: "fire", mult: 1.15 } });
    // Antes do ciclo 15 o dragão tomava gelo normal (1) e o de gelo, fogo normal.
    expect(damageTakenMult(MONSTERS.dragon!, "ice")).toBe(1.15);
    expect(damageTakenMult(MONSTERS.frost_dragon!, "fire")).toBe(1.15);
    expect(damageTakenMult(MONSTERS.skeleton!, "holy")).toBe(1.25);
    expect(damageTakenMult(MONSTERS.dragon!, "holy")).toBe(1);
    expect(damageTakenMult(MONSTERS.skeleton!, "physical")).toBe(1);
    // Crânio Flamejante: morto-vivo e de fogo (resiste a fogo, fraco a gelo e a sagrado).
    expect(monsterResistances(MONSTERS.flame_skull!)).toEqual([{ kind: "fire", mult: 0.5 }, { kind: "ice", mult: 1.15 }, { kind: "holy", mult: 1.25 }]);
    expect(monsterResistances(MONSTERS.frost_dragon!)).toEqual([{ kind: "ice", mult: 0.5 }, { kind: "fire", mult: 1.15 }]);
    // Ruptura Elemental tira a resistência, mas a fraqueza fica: 1,25 × 1,15.
    expect(damageTakenMult(MONSTERS.skeleton!, "holy", 15)).toBeCloseTo(1.4375, 10);
    expect(damageTakenMult(MONSTERS.dragon!, "fire", 15)).toBeCloseTo(1.15, 10);
    // O `resist` do monstro sobrepõe a fraqueza.
    const custom = { damageKind: "fire", undead: true, resist: { holy: 1, ice: 0.8 } } as const;
    expect(damageTakenMult(custom, "holy")).toBe(1);
    expect(damageTakenMult(custom, "ice")).toBe(0.8);
  });

  it("mortos-vivos, bichos de fogo e de gelo do jogo (lista travada: mudou de propósito, atualize aqui)", () => {
    const by = (n: MonsterNature) => Object.values(MONSTERS).filter((m) => monsterNatures(m).includes(n)).map((m) => m.id).sort();
    // Mortos-vivos por dado (`undead`): esqueletos, fantasmas/espectros, liches, crânios, lanternas assombradas e o Olho
    // Maligno do Cemitério. O Necromante (humano que ergue os mortos) e o Ferumbras (feiticeiro) não são. Ciclo 20: o
    // Piloto Fantasma da Montadora.
    expect(by("undead")).toEqual([
      "bonelord", "flame_skull", "frame_descartado", "ghost", "iluminador_rebelde", "mt_piloto_fantasma", "red_lantern", "skeleton",
      "swamp_lich",
    ]);
    // Fogo/gelo = o elemento do ataque (o mesmo critério da resistência). Ciclo 19: os 7 bichos de fogo da Siderúrgica.
    // Ciclo 20 (Montadora): Robô Soldador e Monstro da Estufa (fogo), Sapão do Lava-Rápido (gelo).
    expect(by("fire")).toEqual([
      "coracao_brasa", "demodras", "demon", "dragon", "dragon_lord", "flame_skull", "flame_spirit", "forjador_rubro", "fornalha_primordial",
      "golem_convertedor", "gosma_aco_liquido", "gosma_gusa", "hellhound", "iluminador_rebelde", "lair_flame", "magma_elemental",
      "minotaur_mage", "mt_monstro_estufa", "mt_robo_soldador", "orshabaal", "salamandra_cadinho", "slag_slime",
    ]);
    expect(by("ice")).toEqual(["frost_dragon", "ice_witch", "kappa", "lair_kraken", "mt_sapao", "winter_wolf", "yeti"]);
    expect(MONSTERS.necromancer!.undead).toBeUndefined();
    expect(MONSTERS.ferumbras!.undead).toBeUndefined();
  });

  it("nenhum monstro é fraco ao próprio elemento nem a físico; todo morto-vivo é fraco a sagrado", () => {
    for (const m of Object.values(MONSTERS)) {
      const weak = monsterResistances(m).filter((r) => r.mult > 1).map((r) => r.kind);
      expect(weak, m.id).not.toContain(m.damageKind);
      expect(weak, m.id).not.toContain("physical");
      if (m.undead) expect(damageTakenMult(m, "holy"), m.id).toBe(1.25);
      for (const r of monsterResistances(m)) expect(r.mult, `${m.id}/${r.kind}`).toBeLessThanOrEqual(1.25);
    }
  });

  it("chefes (ciclo 15): raiz vira lentidão de 30%, lentidão pela metade; o resto passa igual", () => {
    expect([BOSS_ROOT_SLOW_PCT, BOSS_SLOW_MULT]).toEqual([30, 0.5]);
    expect(bossCondition("rooted", undefined)).toEqual({ id: "slow", value: 30 });
    expect(bossCondition("slow", 50)).toEqual({ id: "slow", value: 25 }); // Fúria da Natureza, Flecha Paralisante
    expect(bossCondition("slow", 40)).toEqual({ id: "slow", value: 20 }); // Chuva de Gelo, Nevasca
    expect(bossCondition("burn", 30)).toEqual({ id: "burn", value: 30 });
    expect(bossCondition("exposed", 15)).toEqual({ id: "exposed", value: 15 });
    // Raízes da Terra (lv 100) seguem a melhor lentidão contra chefe: nenhuma lentidão de magia pela metade chega a 30%.
    const slows = Object.values(SPELLS).filter((s) => s.condition?.id === "slow").map((s) => bossCondition("slow", s.condition!.value).value!);
    expect(slows.length).toBeGreaterThan(0);
    expect(Math.max(...slows)).toBeLessThan(bossCondition(SPELLS.earth_roots!.condition!.id, undefined).value!);
  });

  it("o Dragão de Gelo usa o sprite próprio (não o dragão verde tingido)", () => {
    expect(MONSTERS.frost_dragon!.sprite.url).toBe("monsters/FrostDragon.png");
    expect(MONSTERS.frost_dragon!.sprite.tint).toBeUndefined();
  });
});

describe("chefes de covil (ciclo 16)", () => {
  // [id, level, vida (tabela do plano), prova, sprite do pack sem uso]
  const LAIRS = [
    ["lair_mole_king", 28, 4500, "mole_king_claw", "Boss/GiantRacoon/"],
    ["lair_kraken", 54, 11000, "kraken_eye", "Boss/SquidGreen/"],
    ["lair_flame", 82, 22000, "ancestral_heart", "Boss/GiantFlam/"],
    ["lair_shogun", 125, 45000, "shogun_seal", "Boss/GiantBlueSamurai/"],
  ] as const;

  it("level, vida e sprite da tabela; chefe que deixa a prova a 100%; respawn de 2 a 4 h", () => {
    for (const [id, level, hp, proof, sprite] of LAIRS) {
      const d = MONSTERS[id]!;
      expect([d.level, d.hp, d.boss], id).toEqual([level, hp, true]);
      expect(d.sprite.url, id).toContain(sprite);
      expect(d.loot!.find((l) => l.itemId === proof)?.chance, id).toBe(1);
      expect(d.respawnMs, id).toBeGreaterThanOrEqual(7_200_000);
      expect(d.respawnMs, id).toBeLessThanOrEqual(14_400_000);
      expect(d.abilities?.some((a) => a.summon), `${id} invoca ajudantes`).toBe(true);
    }
    // Tiras largas: Squid 304x79 = 4 de 76x79; Samurai 576x48 = 6 de 96x48 (meio samurai se cortasse em 48).
    expect([MONSTERS.lair_kraken!.sprite.frameWidth, MONSTERS.lair_kraken!.sprite.frameHeight]).toEqual([76, 79]);
    expect([MONSTERS.lair_shogun!.sprite.frameWidth, MONSTERS.lair_shogun!.sprite.frameHeight]).toEqual([96, 48]);
  });

  it("XP por vida, dano máximo e ouro por vida entre os dos chefes vizinhos de level (±10%)", () => {
    const others = Object.values(MONSTERS).filter((m) => m.boss && !m.id.startsWith("lair_"));
    for (const [id] of LAIRS) {
      const d = MONSTERS[id]!;
      const below = others.filter((m) => m.level <= d.level).sort((a, b) => b.level - a.level)[0]!;
      const above = others.filter((m) => m.level >= d.level).sort((a, b) => a.level - b.level)[0]!;
      const within = (f: (m: typeof d) => number, what: string) => {
        const lo = Math.min(f(below), f(above)) * 0.9, hi = Math.max(f(below), f(above)) * 1.1;
        expect(f(d), `${id} ${what} (vizinhos ${below.id} e ${above.id})`).toBeGreaterThanOrEqual(lo);
        expect(f(d), `${id} ${what} (vizinhos ${below.id} e ${above.id})`).toBeLessThanOrEqual(hi);
      };
      within((m) => m.xp / m.hp, "xp/vida");
      within((m) => m.damage[1], "dano máximo");
      within((m) => m.gold![1] / m.hp, "ouro/vida");
    }
  });
});

describe("Siderúrgica (ciclo 19)", () => {
  // [id, level, vida, XP, chefe, trecho do sprite, dano final (depois de MONSTER_DAMAGE_TIERS)]: docs/regioes/siderurgica.md §3.1–3.2.
  const SID = [
    ["caracol_ferrugem", 12, 160, 70, false, "Monster/Mollusc/Mollusc.png", [8, 18]],
    ["guaxinim_carvao", 15, 165, 90, false, "Monster/GoldRacoon/", [10, 22]],
    ["morcego_chamine", 19, 190, 116, false, "Monster/YellowsBat/", [13, 28]],
    ["serpente_correia", 27, 330, 275, false, "Monster/Snake2/", [31, 64]],
    ["gosma_gusa", 31, 400, 380, false, "monsters/GusaSlime.png", [35, 70]],
    ["coruja_fuligem", 35, 430, 460, false, "Monster/Owl2/", [39, 78]],
    ["contramestre_fuligem", 36, 6500, 6500, true, "Character/NinjaBomb/", [90, 168]],
    ["salamandra_cadinho", 43, 680, 900, false, "Monster/Axolot/", [60, 120]],
    ["golem_escoria", 53, 1150, 1650, false, "monsters/SlagGolem.png", [93, 177]],
    ["cavaleiro_aco_fundido", 64, 1700, 2800, false, "Character/KnightGold/", [117, 222]],
    ["coracao_brasa", 67, 1300, 2200, false, "Monster/HeartRed/", [93, 180]],
    ["golem_convertedor", 76, 21000, 24000, true, "monsters/ConverterGolem.png", [224, 416]],
    ["rex_ferro", 88, 3600, 7000, false, "Monster/Grey Trex/SpriteSheet.png", [173, 328]],
    ["forjador_rubro", 104, 5200, 11200, false, "Character/NinjaFire/", [230, 434]],
    ["gosma_aco_liquido", 114, 7000, 15800, false, "monsters/SteelSlime.png", [255, 493]],
    ["fornalha_primordial", 118, 55000, 72000, true, "Boss/GiantBamboo2/Walk.png", [366, 680]],
  ] as const;
  // [chefe, prova, ajudante invocado, respawn]
  const BOSSES = [
    ["contramestre_fuligem", "apito_contramestre", "guaxinim_carvao", 7_200_000],
    ["golem_convertedor", "nucleo_convertedor", "golem_escoria", 10_800_000],
    ["fornalha_primordial", "coracao_fornalha", "gosma_aco_liquido", 14_400_000],
  ] as const;

  it("tabela travada: level, vida, XP, chefe, sprite e dano final", () => {
    for (const [id, level, hp, xp, boss, sprite, damage] of SID) {
      const d = MONSTERS[id]!;
      expect(d, id).toBeDefined();
      expect([d.level, d.hp, d.xp, !!d.boss], id).toEqual([level, hp, xp, boss]);
      expect(d.sprite.url, id).toContain(sprite);
      expect(d.damage, id).toEqual(damage);
    }
    // Tiras de chefe 744x62 = 12 frames de 62x62; o resto é grid4 de 16x16 (inclusive os personagens 64x112).
    for (const id of ["golem_convertedor", "fornalha_primordial"]) {
      const s = MONSTERS[id]!.sprite;
      expect([s.layout, s.frameWidth, s.frameHeight, s.walk!.down.length], id).toEqual(["custom", 62, 62, 12]);
    }
    // Recolors de tools/monsters/recolor.mjs: sprite próprio, sem tinta por cima.
    for (const id of ["gosma_gusa", "golem_escoria", "golem_convertedor", "gosma_aco_liquido"]) expect(MONSTERS[id]!.sprite.tint, id).toBeUndefined();
  });

  it("chefes: prova a 100%, invocam um monstro da região, respawn de 2 a 4 h", () => {
    for (const [id, proof, helper, respawn] of BOSSES) {
      const d = MONSTERS[id]!;
      expect(d.loot!.find((l) => l.itemId === proof)?.chance, id).toBe(1);
      expect(d.abilities!.find((a) => a.summon)?.summon?.monsterId, id).toBe(helper);
      expect(d.respawnMs, id).toBe(respawn);
    }
    // A Fornalha se cura a 30% da vida (Reacender).
    expect(MONSTERS.fornalha_primordial!.abilities!.find((a) => a.heal)?.heal).toEqual({ pct: 0.05, belowHpPct: 0.3 });
  });

  it("chefes: XP por vida, dano máximo e ouro por vida entre os chefes vizinhos de level (±10%, regra dos covis)", () => {
    for (const [id] of BOSSES) {
      const d = MONSTERS[id]!;
      const others = Object.values(MONSTERS).filter((m) => m.boss && m.id !== id);
      const below = others.filter((m) => m.level <= d.level).sort((a, b) => b.level - a.level)[0]!;
      const above = others.filter((m) => m.level >= d.level).sort((a, b) => a.level - b.level)[0]!;
      const within = (f: (m: typeof d) => number, what: string) => {
        const lo = Math.min(f(below), f(above)) * 0.9, hi = Math.max(f(below), f(above)) * 1.1;
        expect(f(d), `${id} ${what} (vizinhos ${below.id} e ${above.id})`).toBeGreaterThanOrEqual(lo);
        expect(f(d), `${id} ${what} (vizinhos ${below.id} e ${above.id})`).toBeLessThanOrEqual(hi);
      };
      within((m) => m.xp / m.hp, "xp/vida");
      within((m) => m.damage[1], "dano máximo");
      within((m) => m.gold![1] / m.hp, "ouro/vida");
    }
  });

  it("bandos, fuga e cura: guaxinins fogem a 20%, gosmas de gusa em bando, Coração de Brasa cura primeiro", () => {
    expect(MONSTERS.guaxinim_carvao!.pack?.family).toBe("guaxinim");
    expect(MONSTERS.guaxinim_carvao!.fleeAtHpPct).toBe(0.2);
    expect(MONSTERS.gosma_gusa!.pack?.family).toBe("gusa");
    const heal = MONSTERS.coracao_brasa!.abilities![0]!;
    expect(heal.id).toBe("heal_allies");
    expect(heal.healAllies!.pct).toBeGreaterThan(0);
    // Bicho de fogo da usina: resiste a fogo e é fraco a gelo ("choque térmico").
    expect([damageTakenMult(MONSTERS.gosma_gusa!, "fire"), damageTakenMult(MONSTERS.gosma_gusa!, "ice")]).toEqual([0.5, 1.15]);
  });
});

describe("Montadora (ciclo 20)", () => {
  // [id, level, vida, XP, chefe, sprite, dano final (depois de MONSTER_DAMAGE_TIERS)]: docs/regioes/montadora.md §3.1.
  const MT = [
    ["mt_calota", 12, 130, 58, false, "Monster/Larva2/Larva2.png", [9, 20]],
    ["mt_serpente_fiacao", 16, 170, 96, false, "Monster/Snake/Snake.png", [12, 26]],
    ["mt_polvo_graxa", 30, 390, 350, false, "Monster/Octopus2/", [34, 67]],
    ["mt_estampador", 36, 540, 590, false, "Monster/KappaRed/", [43, 88]],
    ["mt_lagartixa_faisca", 42, 620, 800, false, "monsters/MtSparkLizard.png", [57, 114]],
    ["mt_robo_soldador", 52, 1050, 1540, false, "Character/RobotCamouflage/", [78, 150]],
    ["mt_mariposa_tinta", 64, 1350, 2230, false, "Monster/Butterfly/", [93, 180]],
    ["mt_robo_pintor", 70, 1900, 3330, false, "monsters/MtRobotPainter.png", [112, 216]],
    ["mt_robo_montador", 84, 3100, 5900, false, "monsters/MtRobotAssembler.png", [160, 304]],
    ["mt_duble", 92, 4300, 8800, false, "Character/NinjaMasked/", [192, 368]],
    ["mt_tengu_cromado", 104, 5600, 12100, false, "Boss/TenguBlue/Walk.png", [238, 459]],
    ["mt_piloto_fantasma", 108, 6000, 13100, false, "Character/Tengu2/", [247, 476]],
    ["mt_sapao", 26, 4200, 3200, true, "Boss/GiantFrog/Idle40x40.png", [45, 98]],
    ["mt_monstro_estufa", 74, 21000, 23000, true, "monsters/MtPaintBlob.png", [224, 416]],
    ["mt_prototipo", 120, 70000, 92000, true, "monsters/MtPrototype.png", [391, 697]],
  ] as const;
  // [chefe, prova, ajudante invocado, respawn]
  const BOSSES = [
    ["mt_sapao", "mt_coroa_espuma", "runaway_drum", 7_200_000],
    ["mt_monstro_estufa", "mt_brasa_estufa", "mt_mariposa_tinta", 10_800_000],
    ["mt_prototipo", "mt_chave_prototipo", "mt_robo_montador", 14_400_000],
  ] as const;

  it("tabela travada: level, vida, XP, chefe, sprite e dano final; 12 comuns + 3 chefes, ninguém foge", () => {
    for (const [id, level, hp, xp, boss, sprite, damage] of MT) {
      const d = MONSTERS[id]!;
      expect(d, id).toBeDefined();
      expect([d.level, d.hp, d.xp, !!d.boss, d.fleeAtHpPct], id).toEqual([level, hp, xp, boss, 0]);
      expect(d.sprite.url, id).toContain(sprite);
      expect(d.damage, id).toEqual(damage);
    }
    const mt = Object.values(MONSTERS).filter((m) => m.id.startsWith("mt_"));
    expect(mt.map((m) => m.id).sort()).toEqual(MT.map(([id]) => id).sort());
    expect([mt.filter((m) => !m.boss).length, mt.filter((m) => m.boss).length]).toEqual([12, 3]);
  });

  it("sprites: recolors sem tinta, tiras dos chefes com o frame real do PNG e nenhum sprite repetido de outro monstro", () => {
    for (const id of ["mt_lagartixa_faisca", "mt_robo_pintor", "mt_robo_montador", "mt_monstro_estufa", "mt_prototipo"]) {
      expect(MONSTERS[id]!.sprite.tint, id).toBeUndefined();
    }
    // GiantSlime2 310x52 = 5 de 62x52; GiantRedSamurai 576x48 = 6 de 96x48; TenguBlue 820x82 = 10 de 82; GiantFrog 200x40 = 5 de 40.
    const strips: [string, number, number, number][] = [
      ["mt_monstro_estufa", 62, 52, 5], ["mt_prototipo", 96, 48, 6], ["mt_tengu_cromado", 82, 82, 10], ["mt_sapao", 40, 40, 5],
    ];
    for (const [id, fw, fh, n] of strips) {
      const s = MONSTERS[id]!.sprite;
      expect([s.layout, s.frameWidth, s.frameHeight, s.walk!.down.length], id).toEqual(["custom", fw, fh, n]);
    }
    for (const [id] of MT) {
      const url = MONSTERS[id]!.sprite.url;
      const others = Object.values(MONSTERS).filter((m) => m.id !== id && m.sprite.url === url).map((m) => m.id);
      expect(others, `${id}: ${url}`).toEqual([]);
    }
  });

  it("chefes: prova a 100%, invocam um monstro da região, respawn de 2 a 4 h", () => {
    for (const [id, proof, helper, respawn] of BOSSES) {
      const d = MONSTERS[id]!;
      expect(d.loot!.find((l) => l.itemId === proof)?.chance, id).toBe(1);
      expect(d.abilities!.find((a) => a.summon)?.summon?.monsterId, id).toBe(helper);
      expect(MONSTERS[helper], helper).toBeDefined();
      expect(d.respawnMs, id).toBe(respawn);
    }
  });

  it("chefes: XP por vida, dano máximo e ouro por vida entre os chefes vizinhos de level (±10%, regra dos covis)", () => {
    for (const [id] of BOSSES) {
      const d = MONSTERS[id]!;
      const others = Object.values(MONSTERS).filter((m) => m.boss && m.id !== id);
      const below = others.filter((m) => m.level <= d.level).sort((a, b) => b.level - a.level)[0]!;
      const above = others.filter((m) => m.level >= d.level).sort((a, b) => a.level - b.level)[0]!;
      const within = (f: (m: typeof d) => number, what: string) => {
        const lo = Math.min(f(below), f(above)) * 0.9, hi = Math.max(f(below), f(above)) * 1.1;
        expect(f(d), `${id} ${what} (vizinhos ${below.id} e ${above.id})`).toBeGreaterThanOrEqual(lo);
        expect(f(d), `${id} ${what} (vizinhos ${below.id} e ${above.id})`).toBeLessThanOrEqual(hi);
      };
      within((m) => m.xp / m.hp, "xp/vida");
      within((m) => m.damage[1], "dano máximo");
      within((m) => m.gold![1] / m.hp, "ouro/vida");
    }
  });

  it("bando da lagartixa, Robô Pintor cura os aliados primeiro, Piloto Fantasma morto-vivo", () => {
    expect(MONSTERS.mt_lagartixa_faisca!.pack).toEqual({ family: "faisca", shout: "Faíscas, curto-circuito!" });
    const heal = MONSTERS.mt_robo_pintor!.abilities![0]!;
    expect(heal.id).toBe("heal_allies");
    expect(heal.healAllies).toEqual({ pct: 0.12, radius: 4, belowHpPct: 0.7 });
    expect(MONSTERS.mt_piloto_fantasma!.undead).toBe(true);
    expect(damageTakenMult(MONSTERS.mt_piloto_fantasma!, "holy")).toBe(1.25);
    // Sapão é bicho de gelo (fraco a fogo); Robô Soldador e Monstro da Estufa, de fogo (fracos a gelo).
    expect(damageTakenMult(MONSTERS.mt_sapao!, "fire")).toBe(1.15);
    expect(damageTakenMult(MONSTERS.mt_robo_soldador!, "ice")).toBe(1.15);
  });

  it("a Gosma Azul do Lava-Rápido é o runaway_drum da Oficina, sem mudança", () => {
    expect(MONSTERS.runaway_drum).toMatchObject({ name: "Gosma Azul", level: 10, hp: 120, xp: 52 });
  });
});
