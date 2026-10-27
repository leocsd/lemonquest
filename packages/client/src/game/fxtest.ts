// Harness de desenvolvimento (?fxtest, só em modo dev): cria criaturas falsas e dispara eventos de combate
// a cada segundo para validar visualmente barras de HP, números, projéteis, mortes e level-up sem servidor.
import {
  DIR_DELTA, ITEMS, MONSTERS, NPCS, RARITIES, SPELLS, spellDef, spellMana, type ItemInstance, type Rarity,
  type CombatEvent, type ConditionId, type DamageKind, type MonsterView, type PlayerView, type SpellCastMsg, type SpellDef, type SpellFx,
} from "@lemonquest/shared";
import type { WorldScene } from "../scenes/WorldScene.ts";
import { handleCastResult, setCastTransport } from "../ui/hud/castbar.ts";
import { playersStore } from "../ui/hud/world.ts";
import { subscribeTarget } from "../ui/hud/target.ts";
import { hideDeath } from "../ui/combat/combatUi.ts";
import { setItemTransport } from "../ui/items/net.ts";

export const FXTEST = import.meta.env.DEV && new URLSearchParams(location.search).has("fxtest");

const ME = "fxme";
const KINDS: DamageKind[] = ["fire", "ice", "energy", "earth", "holy", "death"];
const pick = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0];
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

export function startFxTest(scene: WorldScene, spawn: { x: number; y: number }, walkable: (x: number, y: number) => boolean) {
  const me: PlayerView = {
    id: ME, name: "QA Combate", vocation: (new URLSearchParams(location.search).get("voc") ?? "sorcerer") as PlayerView["vocation"], level: 8, x: spawn.x, y: spawn.y, dir: 4, stepMs: 280, seq: 0,
    hp: 160, maxHp: 200, mana: 80, maxMana: 100, xp: 400, targetId: "",
    magicLevel: 2, skillMelee: 18, skillDistance: 10, skillShield: 16, magicPct: 30, meleePct: 40, distancePct: 0, shieldPct: 10, speedPct: 100, stance: "balanced", chase: false,
    outfit: new URLSearchParams(location.search).get("outfit") ?? "", addons: Number(new URLSearchParams(location.search).get("addons") ?? 0), title: "",
    sex: new URLSearchParams(location.search).get("sex") === "f" ? "f" : "m",
  };
  (window as unknown as Record<string, unknown>).__scene = scene;
  scene.setLocalId(ME);
  scene.addPlayer(ME, me);
  const publish = () => {
    const { stepMs: _s, seq: _q, ...snap } = me;
    playersStore.set(new Map([[ME, snap]]));
  };
  publish();
  // Troca de roupa (janela O): o "servidor" falso aplica direto.
  setItemTransport((type, m) => {
    if (type !== "setOutfit") return;
    const o = m as { outfit: string; addons: number; sex?: "m" | "f" };
    me.outfit = o.outfit; me.addons = o.addons; me.sex = o.sex ?? me.sex;
    scene.onPlayerChange(ME, me);
    publish();
  });
  // O "servidor" falso ecoa o alvo escolhido pelo jogador.
  const offTarget = subscribeTarget((t) => { me.targetId = t?.id ?? ""; });
  scene.events.once("shutdown", offTarget);

  // Anel de criaturas ao redor do spawn (uma de cada def + um defId desconhecido).
  const defs = [...Object.keys(MONSTERS), "def_inexistente"];
  const tiles: { x: number; y: number }[] = [];
  for (let r = 2; r <= 7 && tiles.length < defs.length * 2; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx + dy) % 2 !== 0) continue;
      if (walkable(spawn.x + dx, spawn.y + dy)) tiles.push({ x: spawn.x + dx, y: spawn.y + dy });
    }
  }
  const mons = new Map<string, MonsterView>();
  const home = new Map<string, { x: number; y: number }>();
  defs.forEach((defId, i) => {
    const t = tiles[i * 2 % Math.max(1, tiles.length)];
    if (!t) return;
    const hp = MONSTERS[defId]?.hp ?? 50;
    const m: MonsterView = { id: `m${i}`, defId, x: t.x, y: t.y, dir: 4, stepMs: 300, hp, maxHp: hp, targetId: "", ownerId: "" };
    mons.set(m.id, m);
    home.set(m.id, t);
    scene.addMonster(m.id, m);
  });

  const alive = () => [...mons.values()].filter((m) => m.hp > 0);
  const hitMonster = (m: MonsterView, ev: Partial<CombatEvent>) => {
    const amount = ev.miss ? 0 : (ev.amount ?? rnd(3, 40));
    scene.onCombat([{ sourceId: ME, targetId: m.id, amount, kind: "physical", ...ev }]);
    if (!ev.miss) {
      const delay = ev.ranged ? 200 : 0;
      setTimeout(() => {
        m.hp = Math.max(0, m.hp - amount);
        scene.onMonsterChange(m.id, m);
        if (m.hp <= 0) kill(m);
      }, delay);
    }
  };
  const kill = (m: MonsterView) => {
    scene.onCreatureDied({ id: m.id, x: m.x, y: m.y, defId: m.defId });
    scene.onXpGain(MONSTERS[m.defId]?.xp ?? 10);
    setTimeout(() => scene.removeMonster(m.id), 120);
    setTimeout(() => {
      m.hp = m.maxHp; m.x = home.get(m.id)!.x; m.y = home.get(m.id)!.y;
      scene.addMonster(m.id, m);
    }, 3000);
  };
  const hurtMe = (m: MonsterView, amount: number, extra: Partial<CombatEvent> = {}) => {
    scene.onCombat([{ sourceId: m.id, targetId: ME, amount, kind: "physical", ...extra }]);
    setTimeout(() => {
      me.hp = Math.max(20, me.hp - amount);
      scene.onPlayerChange(ME, me); publish();
    }, extra.ranged ? 200 : 0);
  };

  let step = 0;
  const actions: (() => void)[] = [
    () => { const m = pick(alive()); if (m) hitMonster(m, { amount: rnd(4, 30) }); },
    () => { const m = pick(alive()); if (m) hitMonster(m, { amount: rnd(10, 40), ranged: true }); },
    () => { const m = pick(alive()); if (m) hitMonster(m, { amount: rnd(40, 90), crit: true, kind: "fire", ranged: true }); },
    () => { const m = pick(alive()); if (m) hurtMe(m, rnd(5, 25)); },
    () => { const m = pick(alive()); if (m) hitMonster(m, { miss: true }); },
    () => { const m = pick(alive()); if (m) hitMonster(m, { kind: pick(KINDS), amount: rnd(15, 60), ranged: Math.random() < 0.5 }); },
    () => scene.onCombat([{ sourceId: ME, targetId: ME, amount: 35, kind: "mana" }]),
    () => scene.onCombat([{ sourceId: "m0", targetId: ME, amount: 12, kind: "mana" }]),
    () => { me.hp = Math.min(me.maxHp, me.hp + 40); scene.onCombat([{ sourceId: ME, targetId: ME, amount: 40, kind: "heal" }]); scene.onPlayerChange(ME, me); publish(); },
    () => { const m = pick(alive()); if (m) hurtMe(m, rnd(45, 60), { crit: true, ranged: true, kind: "physical" }); },
    () => { const m = pick(alive()); if (m) hitMonster(m, { amount: rnd(5, 20) }); },
    () => { const m = pick(alive()); if (m) { m.hp = Math.min(m.hp, 1); scene.onMonsterChange(m.id, m); hitMonster(m, { amount: 5, crit: true }); } },
  ];
  // --- magias: servidor falso + ciclo por todos os tipos de fx -----------------------------------
  const params = new URLSearchParams(location.search);
  const quiet = params.has("fxquiet");
  const synth = (id: string, target: SpellDef["target"], fx: SpellFx, extra: Partial<SpellDef> = {}): SpellDef => ({
    id, name: id, words: id.replace(/_/g, " "), vocations: ["sorcerer"], level: 1, mana: 10, cooldownMs: 2000, target, fx,
    radius: 2, length: 5, width: 3, range: 7, description: "Magia de teste.", ...extra,
  });
  // Cobre todas as combinações (alvo, fx) que o catálogo real não cobre.
  const extras: SpellDef[] = [
    synth("t_fire_target", "target", "fire"), synth("t_ice_target", "target", "ice"), synth("t_energy_target", "target", "energy"),
    synth("t_earth_target", "target", "earth"), synth("t_holy_target", "target", "holy"), synth("t_death_target", "target", "death"),
    synth("t_fire_area", "area_self", "fire"), synth("t_ice_area", "area_target", "ice"), synth("t_energy_area", "area_self", "energy"),
    synth("t_earth_area", "area_self", "earth"), synth("t_holy_area", "area_self", "holy"), synth("t_death_area", "area_self", "death"),
    synth("t_ice_wave", "wave", "ice"), synth("t_fire_wave", "wave", "fire"), synth("t_energy_wave", "wave", "energy"), synth("t_death_wave", "wave", "death"),
    synth("t_summon", "self", "summon"), synth("t_root", "target", "root"), synth("t_taunt", "area_self", "taunt"),
    synth("t_party_heal", "party", "heal"), synth("t_buff", "self", "buff"), synth("t_charge", "target", "charge", { dash: true }),
  ];
  const allSpells = [...Object.values(SPELLS), ...extras];
  const defOf = (id: string) => spellDef(id) ?? extras.find((e) => e.id === id);
  const tilesAround = (cx: number, cy: number, r: number) => {
    const out: number[] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dy) <= r + 0.3 && walkable(cx + dx, cy + dy)) out.push(cx + dx, cy + dy);
    return out;
  };
  const buildCast = (def: SpellDef): SpellCastMsg => {
    const tm = me.targetId ? mons.get(me.targetId) : undefined;
    const t = tm ?? alive()[0];
    const tx = t?.x ?? me.x + 3, ty = t?.y ?? me.y;
    const dir = me.dir;
    const base: SpellCastMsg = { spellId: def.id, casterId: ME, x: me.x, y: me.y, dir };
    switch (def.target) {
      case "target": return { ...base, targetId: t?.id, x: tx, y: ty };
      case "area_target": return { ...base, targetId: t?.id, x: tx, y: ty, tiles: tilesAround(tx, ty, def.radius ?? 2) };
      case "area_self": return { ...base, tiles: tilesAround(me.x, me.y, def.radius ?? 2) };
      case "party": return { ...base, tiles: [me.x, me.y] };
      case "wave": {
        const d = DIR_DELTA[dir as keyof typeof DIR_DELTA] ?? { dx: 1, dy: 0 };
        const tiles: number[] = [];
        const L = def.length ?? 5, W = def.width ?? 3;
        for (let i = 1; i <= L; i++) {
          const half = Math.floor((W * i) / L / 2 + 0.5);
          for (let o = -half; o <= half; o++) {
            const x = me.x + d.dx * i + (d.dx === 0 ? o : 0), y = me.y + d.dy * i + (d.dy === 0 ? o : 0);
            if (walkable(x, y)) tiles.push(x, y);
          }
        }
        return { ...base, tiles };
      }
      default: return base;
    }
  };
  const fire = (def: SpellDef) => scene.onSpellCast(buildCast(def), def);
  // Servidor falso do cast: valida mana, aplica custo e responde com CastResult.
  setCastTransport((m) => {
    const def = defOf(m.spellId);
    if (!def) return;
    setTimeout(() => {
      const cost = spellMana(def, me.level);
      if (me.mana < cost) { handleCastResult({ spellId: def.id, ok: false, reason: "mana" }); return; }
      if (def.target === "target" && !m.targetId) { handleCastResult({ spellId: def.id, ok: false, reason: "target" }); return; }
      me.mana -= cost; scene.onPlayerChange(ME, me); publish();
      fire(def);
      handleCastResult({ spellId: def.id, ok: true, cooldownMs: def.cooldownMs, globalMs: 1000 });
    }, 60);
  });
  const manaTimer = window.setInterval(() => { if (me.mana < me.maxMana) { me.mana = Math.min(me.maxMana, me.mana + 3); publish(); } }, 1000);
  const pinned = params.get("fxspell");
  let spellIdx = 0;
  const spellTimer = window.setInterval(() => {
    if (params.has("fxhold")) return;
    const def = pinned ? defOf(pinned) : allSpells[spellIdx++ % allSpells.length];
    if (def) fire(def);
  }, 2600);
  const condSets: ConditionId[][] = [["haste"], ["manashield", "regen"], ["protect", "rooted"], ["taunted", "haste", "burn"], []];
  let condIdx = 0;
  const applyConds = (ids: ConditionId[]) => scene.onConditions({ list: ids.map((id) => ({ id, remainingMs: 9000 + Math.random() * 20000 })) });
  const condTimer = window.setInterval(() => applyConds(condSets[condIdx++ % condSets.length]), 8000);
  const fxApi = {
    cast: (id: string) => { const d = defOf(id); if (d) fire(d); },
    conds: applyConds,
    skillUp: () => scene.onSkillUp({ skill: "magic", level: 3 }),
    pause: (on: boolean) => { scene.time.timeScale = on ? 0.0001 : 1; scene.anims.globalTimeScale = on ? 0.0001 : 1; scene.tweens.timeScale = on ? 0.0001 : 1; },
    scale: (k: number) => { scene.time.timeScale = k; scene.anims.globalTimeScale = k; scene.tweens.timeScale = k; },
    ids: () => allSpells.map((s) => s.id),
  };
  (window as unknown as Record<string, unknown>).__fx = fxApi;
  scene.events.once("shutdown", () => { window.clearInterval(spellTimer); window.clearInterval(condTimer); window.clearInterval(manaTimer); });

  // --- NPCs falsos, falas e loot ------------------------------------------------------------------
  const free: { x: number; y: number }[] = [];
  for (let r = 2; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === r && walkable(spawn.x + dx, spawn.y + dy)) free.push({ x: spawn.x + dx, y: spawn.y + dy });
  }
  const fakeNpcIds = [...Object.keys(NPCS).slice(0, 3), "npc_sem_def"];
  fakeNpcIds.forEach((id, i) => {
    const t = free[(i * 7 + 3) % Math.max(1, free.length)];
    if (t) scene.addNpc(`fx_${id}`, t.x, t.y);
  });
  // ids "fx_*" não existem no catálogo: usa o sheet genérico; os reais entram pelo mapa.
  const sayLines = ["Bem-vindo, viajante! Dê uma olhada nas mercadorias.", "Cuidado com os goblins ao norte...", "Hmm.", "Tenho poções frescas, feitas hoje de manhã. Venha ver!"];
  let sayIdx = 0;
  const sayTimer = window.setInterval(() => {
    const ids = [...fakeNpcIds.map((i) => `fx_${i}`), ...Object.keys(NPCS)];
    scene.npcSay(ids[sayIdx % ids.length], sayLines[sayIdx % sayLines.length]);
    sayIdx++;
  }, 2500);
  const itemIds = Object.keys(ITEMS).filter((id) => id !== "gold");
  let uid = 0, lootIdx = 0;
  const mkItem = (rarity: Rarity): ItemInstance => ({ uid: `fx${uid++}`, defId: itemIds[(Math.random() * itemIds.length) | 0] ?? "health_potion", count: 1, rarity, bonuses: [] });
  const lootTimer = window.setInterval(() => {
    if (params.has("fxhold")) return;
    const t = free[(lootIdx * 5) % Math.max(1, free.length)] ?? { x: me.x + 2, y: me.y };
    const r = RARITIES[lootIdx % RARITIES.length];
    const items = lootIdx % 3 === 2 ? [mkItem(r), mkItem("common"), mkItem("uncommon")] : [mkItem(r)];
    scene.onLoot({ x: t.x, y: t.y, monsterName: "Teste", items, gold: lootIdx % 2 === 0 ? rnd(5, 900) : 0 });
    lootIdx++;
  }, 4500);
  scene.events.once("shutdown", () => { window.clearInterval(sayTimer); window.clearInterval(lootTimer); });
  (fxApi as Record<string, unknown>).loot = (rarity: Rarity = "epic") => scene.onLoot({ x: me.x + 2, y: me.y, monsterName: "Teste", items: [mkItem(rarity)], gold: 120 });

  const timer = window.setInterval(() => {
    if (quiet) return;
    step++;
    actions[step % actions.length]();
    if (step % 18 === 0) {
      me.level++; me.maxHp += 15; me.hp = me.maxHp;
      scene.onPlayerChange(ME, me); scene.onLevelUp(me.level); publish();
    }
    if (step % 50 === 0) { scene.onDied("Rato", 123); setTimeout(hideDeath, 4000); }
  }, 1000);
  scene.events.once("shutdown", () => window.clearInterval(timer));
}
