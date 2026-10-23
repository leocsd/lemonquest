// Loot (M4): ao matar um monstro rola a tabela (chances independentes), o ouro e a raridade/bônus dos
// equipáveis; entrega ao jogador online que mais causou dano. S2C.Loot para ele; S2C.Feed para drops épicos/lendários e chefes.
import {
  ELITE, RARITIES, RARITY_LABEL, S2C, eliteName, isEquipable, rollInt,
  type FeedMsg, type ItemDef, type ItemInstance, type LootMsg, type MonsterDef, type NoticeMsg, type Rarity, type StatId,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { PARTY_LOOT_PRIORITY_MS, type GroundReserve } from "./ground.ts";
import { GOLD_ID, makeItem, newUid, type InventorySystem, type ItemDefs } from "./inventory.ts";
import { KILL_CREDIT_RANGE, cheb, type Monster } from "./monsters.ts";

/** Chances de raridade para equipáveis (soma 1). */
export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 0.7, uncommon: 0.2, rare: 0.075, epic: 0.022, legendary: 0.003 };
/** Quantidade de bônus por raridade. */
export const RARITY_BONUS_COUNT: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3 };
/** Lendário: bônus mais fortes. */
export const LEGENDARY_BONUS_MULT = 1.5;

/** Rola a raridade. Chefes: um nível acima (mínimo incomum). */
export function rollRarity(rng: () => number, boss = false): Rarity {
  const r = rng();
  let acc = 0;
  let idx = RARITIES.length - 1;
  for (let i = 0; i < RARITIES.length; i++) {
    acc += RARITY_WEIGHTS[RARITIES[i]!];
    if (r < acc) { idx = i; break; }
  }
  if (boss) idx = Math.min(RARITIES.length - 1, idx + 1);
  return RARITIES[idx]!;
}

/** Atributos que um bônus pode dar, conforme o tipo do item. */
export function bonusPool(d: ItemDef): StatId[] {
  switch (d.kind) {
    case "weapon": {
      const t = d.weaponType;
      const skill: StatId = t === "bow" ? "distance" : t === "wand" || t === "rod" ? "magic" : "melee";
      return ["attack", "crit", skill];
    }
    case "shield": return ["armor", "hpMax", "manaMax", "hpRegen", "manaRegen", "shield"];
    case "helmet": case "armor": case "legs": return ["armor", "hpMax", "manaMax", "hpRegen", "manaRegen"];
    case "boots": return ["armor", "hpMax", "manaMax", "hpRegen", "manaRegen", "speed"];
    case "ring": case "amulet": return ["hpMax", "manaMax", "magic", "melee", "distance", "shield", "speed", "crit", "hpRegen", "manaRegen"];
    default: return [];
  }
}

/** Valor base de um bônus para um item de level `lv` (antes da variação ±25%). */
export function bonusBase(stat: StatId, lv: number): number {
  const L = Math.max(1, lv);
  switch (stat) {
    case "attack": return 1 + Math.floor(L / 8);
    case "armor": return 1 + Math.floor(L / 12);
    case "hpMax": case "manaMax": return 10 + L * 2;
    case "speed": return 2 + Math.floor(L / 15);
    case "crit": return 1 + Math.floor(L / 20);
    default: return 1 + Math.floor(L / 15); // skills e regen
  }
}

/** Rola os bônus (atributos distintos) de um equipável de raridade `rarity`. */
export function rollBonuses(d: ItemDef, rarity: Rarity, rng: () => number): ItemInstance["bonuses"] {
  const pool = [...bonusPool(d)];
  const n = Math.min(pool.length, RARITY_BONUS_COUNT[rarity] ?? 0);
  const out: ItemInstance["bonuses"] = [];
  for (let i = 0; i < n; i++) {
    const stat = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    const mult = (0.75 + rng() * 0.5) * (rarity === "legendary" ? LEGENDARY_BONUS_MULT : 1);
    out.push({ stat, value: Math.max(1, Math.round(bonusBase(stat, d.level ?? 1) * mult)) });
  }
  return out;
}

/** Cria a instância de um item (equipáveis rolam raridade/bônus; `rarity` força a raridade). */
export function createItem(d: ItemDef, count: number, rng: () => number, o: { boss?: boolean; rarity?: Rarity } = {}): ItemInstance {
  if (!isEquipable(d)) return makeItem(d.id, count);
  const rarity = o.rarity ?? rollRarity(rng, o.boss);
  return makeItem(d.id, 1, rarity, rollBonuses(d, rarity, rng));
}

export interface LootRoll { items: ItemInstance[]; gold: number }

/** Rola o loot de um abate. Moedas de ouro da tabela vão para o ouro. `goldMult` multiplica o ouro rolado (elite). */
export function rollLoot(def: MonsterDef, rng: () => number, defs: ItemDefs, chanceMult = 1, goldMult = 1): LootRoll {
  let gold = def.gold ? Math.round(rollInt(def.gold[0], def.gold[1], rng) * goldMult) : 0;
  const items: ItemInstance[] = [];
  for (const e of def.loot ?? []) {
    if (!(rng() < Math.min(1, e.chance * chanceMult))) continue;
    const count = rollInt(e.min ?? 1, e.max ?? e.min ?? 1, rng);
    if (count <= 0) continue;
    if (e.itemId === GOLD_ID) { gold += count; continue; }
    const d = defs(e.itemId);
    if (!d) continue;
    if (isEquipable(d)) for (let i = 0; i < count; i++) items.push(createItem(d, 1, rng, { boss: !!def.boss }));
    else items.push(makeItem(d.id, count));
  }
  return { items, gold: Math.max(0, gold) };
}

export interface LootOptions {
  inventory: InventorySystem;
  getPlayer: (id: string) => PlayerState | undefined;
  send: (sessionId: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  rng?: () => number;
  /** Relógio (o mesmo do chão): a reserva do loot de grupo é contada nele. Ausente = Date.now. */
  now?: () => number;
  /** Multiplicador da chance de cada item do loot (evento com bônus). Ausente = 1. */
  lootMult?: () => number;
  /** Itens no chão (systems/ground.ts): o que não coube cai no tile de quem matou (sem dono). */
  ground?: {
    placeLoot: (p: PlayerState, item: ItemInstance) => boolean;
    /**
     * Loot de grupo: no tile do monstro (ou o livre mais perto), reservado ao grupo por PARTY_LOOT_PRIORITY_MS.
     * Retorna o id (undefined = não coube).
     */
    placeNear?: (item: ItemInstance, x: number, y: number, reserve?: GroundReserve) => string | undefined;
  };
  /**
   * Grupo (party id) de quem matou `m` quando há outro membro por perto do monstro: o loot cai no chão para o grupo.
   * Ausente/undefined = sozinho (direto na mochila).
   */
  partyIdOf?: (p: PlayerState, m: Monster) => string | undefined;
}



export const FEED_RARITIES: Rarity[] = ["epic", "legendary"];

export class LootSystem {
  private readonly rng: () => number;

  constructor(private readonly o: LootOptions) {
    this.rng = o.rng ?? Math.random;
  }

  /**
   * Dono do loot: quem mais causou dano entre os que estão perto do monstro (KILL_CREDIT_RANGE). Se ninguém que bateu
   * está perto, fica com quem deu o último golpe (ou, sem ele online, quem mais bateu).
   */
  topDamager(m: Monster): PlayerState | undefined {
    const getPlayer = this.o.getPlayer;
    const near = [...m.damageBy].filter(([id]) => {
      const p = getPlayer(id);
      return !!p && cheb(p.x, p.y, m.s.x, m.s.y) <= KILL_CREDIT_RANGE;
    });
    if (!near.length) {
      const last = m.lastCreditId ? getPlayer(m.lastCreditId) : undefined;
      if (last) return last;
    }
    const pool = near.length ? near : [...m.damageBy];
    let best: PlayerState | undefined, bestDmg = 0;
    for (const [id, dmg] of pool) {
      const p = getPlayer(id);
      if (p && dmg > bestDmg) { best = p; bestDmg = dmg; }
    }
    return best;
  }

  /** Chamado na morte de um monstro selvagem (antes de removê-lo). */
  onKill(m: Monster): void {
    if (m.s.ownerId || m.arenaId || m.minionOf) return; // invocação / onda do coliseu / ajudante de monstro: sem loot
    const p = this.topDamager(m);
    if (!p) return;
    const { x, y } = m.s;
    const def = m.def;
    if (def.boss) this.feed(`☠️ ${p.name} derrotou ${def.name}!`, "boss");
    // Elite: chance de cada item ×2 e ouro ×2 (ELITE).
    const roll = rollLoot(def, this.rng, this.o.inventory.defs, (this.o.lootMult?.() ?? 1) * (m.elite ? ELITE.loot : 1), m.elite ? ELITE.gold : 1);
    const monsterName = m.elite ? eliteName(def) : def.name;
    const party = this.o.partyIdOf?.(p, m);
    if (party && this.o.ground?.placeNear) return this.dropForParty(p, m, roll.items, roll.gold, party);
    if (roll.gold > 0) this.o.inventory.addGold(p, roll.gold);
    const got: ItemInstance[] = [];
    let lost = 0, fell = 0;
    for (const it of roll.items) {
      const n = it.count;
      const left = this.o.inventory.addItem(p, it);
      if (left < n) got.push({ ...it, count: n - left });
      if (left > 0) {
        const rest = left === n ? it : { ...it, uid: newUid(), count: left, bonuses: it.bonuses.map((b) => ({ ...b })) };
        if (this.o.ground?.placeLoot(p, rest)) fell++; else lost++;
      }
      const d = this.o.inventory.defs(it.defId);
      if (d && FEED_RARITIES.includes(it.rarity) && left < n) {
        this.feed(`🔥 ${p.name} dropou ${d.name} (${RARITY_LABEL[it.rarity]})`, "drop", it.rarity);
      }
    }
    if (fell > 0) this.o.send(p.id, S2C.Notice, { text: `Mochila cheia: ${fell === 1 ? "1 item caiu" : `${fell} itens caíram`} no chão.`, kind: "warn" } satisfies NoticeMsg);
    if (lost > 0) this.o.send(p.id, S2C.Notice, { text: `Mochila cheia: ${lost === 1 ? "1 item perdido" : `${lost} itens perdidos`}.`, kind: "warn" } satisfies NoticeMsg);
    if (got.length || roll.gold > 0 || lost > 0 || fell > 0) {
      const msg: LootMsg = { x, y, monsterName, items: got, gold: roll.gold };
      if (lost > 0) msg.lostFull = lost;
      if (fell > 0) msg.fellToGround = fell;
      this.o.send(p.id, S2C.Loot, msg);
    }
  }

  /**
   * Em grupo, o loot (itens e ouro) cai no chão onde o monstro morreu, reservado ao grupo por PARTY_LOOT_PRIORITY_MS
   * (GD-21: quem passa correndo não leva o raro do grupo); depois fica sem dono como o resto do chão.
   * O que não couber no chão vai para a mochila de quem matou.
   */
  private dropForParty(p: PlayerState, m: Monster, items: ItemInstance[], gold: number, partyId: string): void {
    const { x, y } = m.s;
    const all = gold > 0 ? [...items, makeItem(GOLD_ID, gold)] : items;
    const onGround: ItemInstance[] = [];
    let groundGold = 0;
    const reserve: GroundReserve = { owner: partyId, ownerUntil: (this.o.now ?? Date.now)() + PARTY_LOOT_PRIORITY_MS };
    for (const it of all) {
      if (this.o.ground!.placeNear!(it, x, y, reserve)) {
        if (it.defId === GOLD_ID) groundGold += it.count; else onGround.push(it);
        continue;
      }
      // Chão cheio em volta: vai para quem matou (ou se perde, com a mochila cheia).
      if (it.defId === GOLD_ID) this.o.inventory.addGold(p, it.count);
      else if (this.o.inventory.addItem(p, it) > 0) this.o.send(p.id, S2C.Notice, { text: "Mochila cheia: um item do loot se perdeu.", kind: "warn" } satisfies NoticeMsg);
    }
    for (const it of items) {
      const d = this.o.inventory.defs(it.defId);
      if (d && FEED_RARITIES.includes(it.rarity)) this.feed(`🔥 ${p.name} dropou ${d.name} (${RARITY_LABEL[it.rarity]})`, "drop", it.rarity);
    }
    if (onGround.length || groundGold > 0) {
      this.o.send(p.id, S2C.Loot, { x, y, monsterName: m.elite ? eliteName(m.def) : m.def.name, items: onGround, gold: groundGold, onGround: true } satisfies LootMsg);
    }
  }

  feed(text: string, kind: FeedMsg["kind"], rarity?: Rarity): void {
    const msg: FeedMsg = rarity ? { text, kind, rarity } : { text, kind };
    this.o.broadcast(S2C.Feed, msg);
  }
}
