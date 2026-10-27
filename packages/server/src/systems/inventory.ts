// Inventário (M4): equipamento (8 slots), mochila (backpackCapacity(level, vocação): 24–30 no lv 1 até 48–60), ouro e
// depot (DEPOT_SIZE, só com o NPC aberto). A mochila se organiza sozinha (organizeItems em cada flush): a posição dos
// itens nela não é escolha do jogador — mover para dentro dela empilha/ocupa o primeiro vazio, seja qual for o slot.
// Valida equipar (slot, vocação, level, duas mãos), empilha/divide, usa poções (cooldown compartilhado),
// calcula os atributos do equipamento e envia S2C.Inventory/S2C.Depot (uma vez por tick, em flush()).
import { randomBytes } from "node:crypto";
import {
  BACKPACK_MAX, BACKPACK_SIZE, DEFAULT_MAX_STACK, DEPOT_SIZE, EQUIP_SLOTS, backpackCapacity, backpackRoom, maxStackOf, RARITIES, S2C, baseStats, itemDef,
  instanceStats, levelNeeded, pickQuickPotion, refineLevel,
  type DepotMsg, type DiscardItemMsg, type DropFrom, type PickupTo, type EquipSlot, type InventoryMsg, type ItemDef, type ItemInstance,
  type ItemKind, type ItemLocation, type MoveItemMsg, type NoticeMsg, type QuickPotionMsg, type Rarity, type SkillId,
  type SortContainerMsg, type StatId, type Stats, type UseItemMsg, type Vocation,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { CharacterData } from "../persistence/types.ts";

export const GOLD_ID = "gold_coin";
export const STAT_IDS: StatId[] = ["attack", "armor", "hpMax", "manaMax", "magic", "melee", "distance", "shield", "speed", "crit", "hpRegen", "manaRegen"];

export type ItemDefs = (id: string) => ItemDef | undefined;

export interface Inventory {
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  backpack: (ItemInstance | null)[];
  depot: (ItemInstance | null)[];
  gold: number;
}

export const MSG = {
  vocation: "Sua vocação não pode usar isso.",
  level: (lv: number) => `Você precisa ser level ${lv} para usar isso.`,
  full: "Mochila cheia.",
  depotFull: "Depot cheio.",
  slot: "Esse item não vai nesse lugar.",
  depotClosed: "Fale com o guarda-volumes para usar o depot.",
  cooldown: "Aguarde para usar outra poção.",
  notUsable: "Esse item não pode ser usado.",
  noHp: "Você não tem poção de vida.",
  noMana: "Você não tem poção de mana.",
  satisfied: "Você está satisfeito.",
  foodCooldown: "Aguarde para comer de novo.",
} as const;

/** Id curto e aleatório de instância. */
export function newUid(): string {
  return randomBytes(6).toString("base64url");
}

// A conta de pilha e de espaço vive no shared (o cliente usa a mesma para o "Máx" da loja).
export { DEFAULT_MAX_STACK, maxStackOf };

export function makeItem(defId: string, count = 1, rarity: Rarity = "common", bonuses: ItemInstance["bonuses"] = []): ItemInstance {
  return { uid: newUid(), defId, count: Math.max(1, Math.floor(count)), rarity, bonuses: bonuses.map((b) => ({ ...b })) };
}

/** Arma inicial de cada vocação (tier 1, level 1). */
export const STARTER_WEAPON: Record<Vocation, string> = {
  knight: "short_sword", paladin: "short_bow", sorcerer: "apprentice_wand", druid: "twig_rod",
};

/** Kit do personagem NOVO (só na criação): arma da vocação equipada + 3 poções de vida + 5 carnes na mochila. */
export function starterKit(vocation: Vocation): Pick<CharacterData, "equipment" | "backpack"> {
  return {
    equipment: { weapon: makeItem(STARTER_WEAPON[vocation]) },
    backpack: [makeItem("health_potion", 3), makeItem("meat", 5)],
  };
}

export function emptyInventory(): Inventory {
  return { equipment: {}, backpack: Array(BACKPACK_SIZE).fill(null), depot: Array(DEPOT_SIZE).fill(null), gold: 0 };
}

/**
 * Valida/normaliza um item vindo do banco. undefined = descartar. `clampStack: false` (chão) não corta a pilha no
 * maxStack: o ouro da caveira vermelha cai como uma pilha só, que pode passar de 1 milhão.
 */
export function sanitizeItem(raw: unknown, defs: ItemDefs, o: { clampStack?: boolean } = {}): ItemInstance | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.defId !== "string") return undefined;
  const d = defs(r.defId);
  if (!d) return undefined;
  const max = o.clampStack === false ? Number.MAX_SAFE_INTEGER : maxStackOf(d);
  const count = Number.isFinite(r.count) ? Math.max(1, Math.min(max, Math.floor(r.count as number))) : 1;
  const rarity = RARITIES.includes(r.rarity as Rarity) ? (r.rarity as Rarity) : "common";
  const bonuses = Array.isArray(r.bonuses)
    ? (r.bonuses as { stat: unknown; value: unknown }[])
      .filter((b) => b && STAT_IDS.includes(b.stat as StatId) && Number.isFinite(b.value))
      .slice(0, 3).map((b) => ({ stat: b.stat as StatId, value: Math.round(b.value as number) }))
    : [];
  // Refino (ciclo 16): só 1..5 em item refinável; qualquer outra coisa vira +0 (o campo nem aparece).
  const refine = refineLevel(d, r.refine);
  return { uid: typeof r.uid === "string" && r.uid ? r.uid : newUid(), defId: d.id, count, rarity, bonuses, ...(refine ? { refine } : {}) };
}

function loadArray(raw: unknown, size: number, defs: ItemDefs): (ItemInstance | null)[] {
  const out: (ItemInstance | null)[] = Array(size).fill(null);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < Math.min(size, raw.length); i++) out[i] = sanitizeItem(raw[i], defs) ?? null;
  return out;
}

/**
 * Mochila do tamanho da capacidade do level e da vocação: completa com espaços vazios; acima dela só tira espaços
 * VAZIOS do fim (level menor por comando de dev, ou mochila salva maior): item nenhum some.
 */
export function fitBackpack(inv: Pick<Inventory, "backpack">, level: number, vocation: Vocation): void {
  const cap = backpackCapacity(level, vocation);
  while (inv.backpack.length < cap) inv.backpack.push(null);
  while (inv.backpack.length > cap && inv.backpack[inv.backpack.length - 1] === null) inv.backpack.pop();
}

/** Ordem das categorias no "Organizar": equipamento na ordem do corpo, depois consumíveis, materiais e o resto. */
const ORGANIZE_KIND_ORDER: readonly ItemKind[] = ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "potion", "food", "material", "key", "quest"];

/** Mesma pilha para o "Organizar": mesmo item, raridade, refino e bônus (nada de raridade/refino se perde ao juntar). */
const stackKey = (it: ItemInstance): string =>
  `${it.defId}|${it.rarity}|${it.refine ?? 0}|${it.bonuses.map((b) => `${b.stat}:${b.value}`).join(",")}`;

/**
 * "Organizar" (C2S.SortContainer): junta as pilhas iguais até o máximo da pilha e ordena por categoria, nome, raridade
 * (melhor primeiro), refino e quantidade; os vazios vão para o fim. Puro: devolve um array novo do mesmo tamanho com
 * cópias; a pilha que sobra de cada junção guarda o uid, a raridade, os bônus e o refino dela.
 */
export function organizeItems(items: readonly (ItemInstance | null)[], defs: ItemDefs): (ItemInstance | null)[] {
  const kept: ItemInstance[] = [];
  const open = new Map<string, ItemInstance[]>(); // pilhas com espaço, por chave
  for (const raw of items) {
    if (!raw) continue;
    const it: ItemInstance = { ...raw, bonuses: raw.bonuses.map((b) => ({ ...b })) };
    const d = defs(it.defId);
    if (d?.stackable) {
      const max = maxStackOf(d);
      const key = stackKey(it);
      for (const s of open.get(key) ?? []) {
        if (it.count <= 0) break;
        const mv = Math.min(it.count, max - s.count);
        s.count += mv;
        it.count -= mv;
      }
      if (it.count <= 0) continue;
      open.set(key, [...(open.get(key) ?? []), it].filter((s) => s.count < max));
    }
    kept.push(it);
  }
  const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<Rarity, number>;
  const kindRank = (it: ItemInstance) => { const k = defs(it.defId)?.kind; const i = k ? ORGANIZE_KIND_ORDER.indexOf(k) : -1; return i < 0 ? ORGANIZE_KIND_ORDER.length : i; };
  kept.sort((a, b) =>
    kindRank(a) - kindRank(b)
    || (defs(a.defId)?.name ?? a.defId).localeCompare(defs(b.defId)?.name ?? b.defId, "pt-BR")
    || RANK[b.rarity] - RANK[a.rarity]
    || (b.refine ?? 0) - (a.refine ?? 0)
    || b.count - a.count);
  return [...kept, ...Array<null>(Math.max(0, items.length - kept.length)).fill(null)];
}

/** Soma dos atributos dos itens equipados (cada um por instanceStats: definição + bônus + refino). */
export function totalStats(inv: Inventory, defs: ItemDefs): Stats {
  const out: Stats = {};
  for (const it of Object.values(inv.equipment)) {
    if (!it) continue;
    for (const [k, v] of Object.entries(instanceStats(defs(it.defId), it))) out[k as StatId] = (out[k as StatId] ?? 0) + (v as number);
  }
  return out;
}

/** Skill da arma (regra em shared/formulas.ts; reexportada para os sistemas do servidor). */
export { weaponSkill } from "@lemonquest/shared";

export interface InventoryOptions {
  send: (sessionId: string, type: string, msg: unknown) => void;
  defs?: ItemDefs;
  now?: () => number;
  /** O jogador está com o depot aberto e perto do NPC? */
  depotOpen?: (id: string) => boolean;
  /** Cura de poção (CombatSystem.healPlayer → evento "heal"). */
  heal?: (p: PlayerState, amount: number) => void;
  /** Mana de poção (CombatSystem.restoreMana → evento "mana"). */
  restoreMana?: (p: PlayerState, amount: number) => void;
  /** Comida: concede/estende "alimentado". Retorna false se não pôde comer (teto de tempo) → não consome. */
  eat?: (p: PlayerState, food: NonNullable<NonNullable<ItemDef["use"]>["food"]>, now: number) => boolean;
  /** Equipamento mudou (velocidade etc.). */
  onStatsChanged?: (p: PlayerState) => void;
  /** Baú (use.chest): o item já foi consumido; sorteia e entrega a recompensa (systems/quests.ts). */
  openChest?: (p: PlayerState, defId: string) => void;
  /** Ouro recebido (conquistas, telemetria). */
  onGold?: (p: PlayerState, n: number) => void;
  /** Ouro gasto com sucesso (telemetria). */
  onSpend?: (p: PlayerState, n: number) => void;
}

const isInt = (n: unknown): n is number => Number.isInteger(n);

export class InventorySystem {
  private readonly inv = new Map<string, Inventory>();
  private readonly statCache = new Map<string, Stats>();
  private readonly potionCdUntil = new Map<string, number>();
  private readonly foodCdUntil = new Map<string, number>();
  private readonly dirty = new Set<string>();
  private readonly depotDirty = new Set<string>();
  private readonly players = new Map<string, PlayerState>();
  readonly defs: ItemDefs;
  private readonly now: () => number;

  constructor(private readonly o: InventoryOptions) {
    this.defs = o.defs ?? itemDef;
    this.now = o.now ?? Date.now;
  }

  // --- ciclo de vida ------------------------------------------------------------

  /** Carrega do registro salvo e aplica os atributos (maxHp/maxMana). Marca para envio. */
  load(p: PlayerState, data: CharacterData = {}): Inventory {
    const inv = emptyInventory();
    const eq = data.equipment;
    if (eq && typeof eq === "object") {
      for (const slot of EQUIP_SLOTS) {
        const it = sanitizeItem((eq as Record<string, unknown>)[slot], this.defs);
        if (it && this.defs(it.defId)?.slot === slot) inv.equipment[slot] = it;
      }
    }
    inv.backpack = loadArray(data.backpack, BACKPACK_MAX, this.defs);
    fitBackpack(inv, p.level, p.vocation);
    inv.depot = loadArray(data.depot, DEPOT_SIZE, this.defs);
    inv.gold = Number.isFinite(data.gold) ? Math.max(0, Math.floor(data.gold!)) : 0;
    this.inv.set(p.id, inv);
    this.players.set(p.id, p);
    this.statCache.set(p.id, totalStats(inv, this.defs));
    this.dirty.add(p.id);
    return inv;
  }

  serialize(id: string): Pick<CharacterData, "equipment" | "backpack" | "depot" | "gold"> | undefined {
    const inv = this.inv.get(id);
    if (!inv) return undefined;
    const clone = (it: ItemInstance | null | undefined) => (it ? { ...it, bonuses: it.bonuses.map((b) => ({ ...b })) } : null);
    const equipment: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(inv.equipment)) if (v) equipment[k] = clone(v);
    return { equipment, backpack: inv.backpack.map(clone), depot: inv.depot.map(clone), gold: inv.gold };
  }

  removePlayer(id: string): void {
    this.inv.delete(id);
    this.statCache.delete(id);
    this.potionCdUntil.delete(id);
    this.foodCdUntil.delete(id);
    this.dirty.delete(id);
    this.depotDirty.delete(id);
    this.players.delete(id);
  }

  get(id: string): Inventory | undefined { return this.inv.get(id); }

  // --- atributos -----------------------------------------------------------------

  stats(id: string): Stats { return this.statCache.get(id) ?? {}; }
  stat(id: string, s: StatId): number { return this.stats(id)[s] ?? 0; }

  /** Arma equipada (definição) — undefined = desarmado. */
  weaponDef(id: string): ItemDef | undefined {
    const w = this.inv.get(id)?.equipment.weapon;
    return w ? this.defs(w.defId) : undefined;
  }

  /** maxHp/maxMana = baseStats + bônus. `fill` = enche vida/mana (level up); senão só limita ao novo máximo. */
  /**
   * Ajusta a mochila à capacidade do level e da vocação (cresce no level up; só encolhe espaços vazios do fim, nunca
   * some item). Retorna quantos espaços ganhou (0 = nada mudou ou encolheu).
   */
  fitBackpack(p: PlayerState): number {
    const inv = this.inv.get(p.id);
    if (!inv) return 0;
    const before = inv.backpack.length;
    fitBackpack(inv, p.level, p.vocation);
    if (inv.backpack.length !== before) this.dirty.add(p.id);
    return Math.max(0, inv.backpack.length - before);
  }

  applyStats(p: PlayerState, fill = false): void {
    const b = baseStats(p.vocation, p.level);
    p.maxHp = Math.max(1, b.maxHp + this.stat(p.id, "hpMax"));
    p.maxMana = Math.max(0, b.maxMana + this.stat(p.id, "manaMax"));
    if (fill) { p.hp = p.maxHp; p.mana = p.maxMana; }
    else { p.hp = Math.min(p.hp, p.maxHp); p.mana = Math.min(p.mana, p.maxMana); }
  }

  private equipmentChanged(p: PlayerState): void {
    const inv = this.inv.get(p.id);
    if (!inv) return;
    this.statCache.set(p.id, totalStats(inv, this.defs));
    this.applyStats(p);
    this.o.onStatsChanged?.(p);
  }

  // --- operações básicas (loot, loja, comandos) ---------------------------------------

  /** Quantas unidades de `defId` cabem na mochila (pilhas existentes + slots vazios). */
  roomFor(id: string, defId: string, arr: "backpack" | "depot" = "backpack"): number {
    const inv = this.inv.get(id);
    const d = this.defs(defId);
    if (!inv || !d) return 0;
    return backpackRoom(inv[arr], d);
  }

  /** Coloca o item na mochila (empilha primeiro). Ouro vira contador. Retorna quantas unidades NÃO couberam. */
  addItem(p: PlayerState, item: ItemInstance): number {
    const inv = this.inv.get(p.id);
    const d = this.defs(item.defId);
    if (!inv || !d) return item.count;
    if (d.id === GOLD_ID) { this.addGold(p, item.count); return 0; }
    let left = item.count;
    const max = maxStackOf(d);
    if (d.stackable) {
      for (const it of inv.backpack) {
        if (!it || it.defId !== d.id || it.count >= max) continue;
        const mv = Math.min(left, max - it.count);
        it.count += mv;
        left -= mv;
        if (left <= 0) break;
      }
    }
    let first = true;
    for (let i = 0; i < inv.backpack.length && left > 0; i++) {
      if (inv.backpack[i]) continue;
      const n = Math.min(left, max);
      inv.backpack[i] = first && n === item.count ? item : { ...item, uid: first ? item.uid : newUid(), count: n, bonuses: item.bonuses.map((b) => ({ ...b })) };
      first = false;
      left -= n;
    }
    if (left < item.count) this.dirty.add(p.id);
    return left;
  }

  addGold(p: PlayerState, n: number): void {
    const inv = this.inv.get(p.id);
    if (!inv || !(n > 0)) return;
    inv.gold = Math.min(Number.MAX_SAFE_INTEGER, inv.gold + Math.floor(n));
    this.dirty.add(p.id);
    this.o.onGold?.(p, Math.floor(n));
  }

  /** Quantos espaços de equipamento estão ocupados (conquistas). */
  equippedCount(id: string): number {
    return Object.keys(this.inv.get(id)?.equipment ?? {}).length;
  }

  gold(id: string): number { return this.inv.get(id)?.gold ?? 0; }

  spendGold(p: PlayerState, n: number): boolean {
    const inv = this.inv.get(p.id);
    if (!inv || n < 0 || inv.gold < n) return false;
    inv.gold -= n;
    this.dirty.add(p.id);
    if (n > 0) this.o.onSpend?.(p, n);
    return true;
  }

  /** Quantas unidades de `defId` há na mochila. */
  countItem(id: string, defId: string): number {
    const inv = this.inv.get(id);
    let n = 0;
    for (const it of inv?.backpack ?? []) if (it && it.defId === defId) n += it.count;
    return n;
  }

  /** Remove `count` unidades de `defId` da mochila (de várias pilhas). Tudo ou nada. */
  removeItems(p: PlayerState, defId: string, count: number): boolean {
    const inv = this.inv.get(p.id);
    if (!inv || !isInt(count) || count < 1 || this.countItem(p.id, defId) < count) return false;
    let left = count;
    for (let i = inv.backpack.length - 1; i >= 0 && left > 0; i--) {
      const it = inv.backpack[i];
      if (!it || it.defId !== defId) continue;
      const n = Math.min(left, it.count);
      it.count -= n;
      left -= n;
      if (it.count <= 0) inv.backpack[i] = null;
    }
    this.dirty.add(p.id);
    return true;
  }

  /** Remove `count` unidades do slot da mochila. Retorna o que saiu (ou undefined). */
  takeFromBackpack(p: PlayerState, index: number, count: number): ItemInstance | undefined {
    const inv = this.inv.get(p.id);
    if (!inv || !isInt(index) || index < 0 || index >= inv.backpack.length) return undefined;
    const it = inv.backpack[index];
    if (!it || !isInt(count) || count < 1 || count > it.count) return undefined;
    it.count -= count;
    if (it.count <= 0) inv.backpack[index] = null;
    this.dirty.add(p.id);
    return { ...it, count };
  }

  // --- troca entre jogadores (systems/trade.ts) ------------------------------------------

  /** Item da mochila pelo uid (sem remover). */
  findByUid(id: string, uid: string): ItemInstance | undefined {
    return this.inv.get(id)?.backpack.find((it) => it?.uid === uid) ?? undefined;
  }

  /**
   * Troca atômica: `a` entrega `give.a` (+ `gold.a`) e recebe `give.b` (+ `gold.b`), e vice-versa. Tudo ou nada:
   * "gone" = alguma oferta não vale mais (item sumiu/mudou, ouro insuficiente); "full" = não cabe na mochila de
   * alguém; nos dois casos nada muda. Itens do equipamento não entram (só mochila). Ouro trocado não conta como ganho.
   */
  swap(a: PlayerState, offerA: { items: { uid: string; count: number }[]; gold: number }, b: PlayerState, offerB: { items: { uid: string; count: number }[]; gold: number }): "ok" | "gone" | "full" {
    const ia = this.inv.get(a.id), ib = this.inv.get(b.id);
    if (!ia || !ib) return "gone";
    const valid = (inv: Inventory, o: { items: { uid: string; count: number }[]; gold: number }) =>
      isInt(o.gold) && o.gold >= 0 && o.gold <= inv.gold &&
      new Set(o.items.map((x) => x.uid)).size === o.items.length &&
      o.items.every((x) => { const it = inv.backpack.find((y) => y?.uid === x.uid); return !!it && isInt(x.count) && x.count >= 1 && x.count <= it.count && it.defId !== GOLD_ID; });
    if (!valid(ia, offerA) || !valid(ib, offerB)) return "gone";
    const snap = (inv: Inventory) => ({ backpack: inv.backpack.map((it) => (it ? { ...it, bonuses: it.bonuses.map((x) => ({ ...x })) } : null)), gold: inv.gold });
    const sa = snap(ia), sb = snap(ib);
    const restore = (inv: Inventory, s: ReturnType<typeof snap>) => { inv.backpack.splice(0, inv.backpack.length, ...s.backpack); inv.gold = s.gold; };
    const take = (inv: Inventory, items: { uid: string; count: number }[]): ItemInstance[] =>
      items.map((x) => {
        const i = inv.backpack.findIndex((y) => y?.uid === x.uid);
        const it = inv.backpack[i]!;
        it.count -= x.count;
        const out = { ...it, count: x.count, bonuses: it.bonuses.map((q) => ({ ...q })) };
        if (it.count <= 0) { inv.backpack[i] = null; out.uid = it.uid; } else out.uid = newUid();
        return out;
      });
    const outA = take(ia, offerA.items), outB = take(ib, offerB.items);
    ia.gold += offerB.gold - offerA.gold;
    ib.gold += offerA.gold - offerB.gold;
    let left = 0;
    for (const it of outB) left += this.addItem(a, it);
    for (const it of outA) left += this.addItem(b, it);
    if (left > 0) { restore(ia, sa); restore(ib, sb); return "full"; }
    this.dirty.add(a.id); this.dirty.add(b.id);
    return "ok";
  }

  // --- chão (systems/ground.ts) ---------------------------------------------------------

  /** Item em `from` (mochila/equipamento), sem remover. */
  peekAt(id: string, from: DropFrom): ItemInstance | undefined {
    const inv = this.inv.get(id);
    if (!inv || !from || typeof from !== "object") return undefined;
    if (from.where === "backpack") return isInt(from.index) && from.index >= 0 && from.index < inv.backpack.length ? inv.backpack[from.index] ?? undefined : undefined;
    if (from.where === "equip") return EQUIP_SLOTS.includes(from.slot) ? inv.equipment[from.slot] : undefined;
    return undefined;
  }

  /** O item em `at` mudou no lugar (refino, systems/refine.ts): reenvia o inventário e, se equipado, recalcula os atributos. */
  itemChanged(p: PlayerState, at: DropFrom): void {
    this.dirty.add(p.id);
    if (at.where === "equip") this.equipmentChanged(p);
  }

  /**
   * Remove `count` unidades de `from` para largar no chão. Pilha inteira = a própria instância;
   * parte = cópia com uid novo. Equipamento sai inteiro (e recalcula atributos).
   */
  takeForDrop(p: PlayerState, from: DropFrom, count?: number): ItemInstance | undefined {
    const inv = this.inv.get(p.id);
    const it = this.peekAt(p.id, from);
    if (!inv || !it) return undefined;
    const n = count === undefined ? it.count : count;
    if (!isInt(n) || n < 1 || n > it.count) return undefined;
    if (from.where === "equip") {
      delete inv.equipment[from.slot];
      this.dirty.add(p.id);
      this.equipmentChanged(p);
      return it;
    }
    const idx = (from as { index: number }).index;
    this.dirty.add(p.id);
    if (n === it.count) { inv.backpack[idx] = null; return it; }
    it.count -= n;
    return { ...it, uid: newUid(), count: n, bonuses: it.bonuses.map((b) => ({ ...b })) };
  }

  /**
   * Coloca um item vindo do chão: num slot de equipamento livre se foi pedido e dá; senão como addItem (a mochila se
   * organiza sozinha, então o quadrado em que foi solto não importa). Ouro vira contador. Retorna quantas unidades NÃO
   * couberam.
   */
  placePickup(p: PlayerState, item: ItemInstance, to?: PickupTo): number {
    const inv = this.inv.get(p.id);
    const d = this.defs(item.defId);
    if (!inv || !d) return item.count;
    if (d.id === GOLD_ID) { this.addGold(p, item.count); return 0; }
    if (to?.where === "equip" && EQUIP_SLOTS.includes(to.slot) && item.count === 1 && !inv.equipment[to.slot]) {
      const conflict = (to.slot === "weapon" && d.twoHanded && inv.equipment.shield)
        || (to.slot === "shield" && inv.equipment.weapon && this.defs(inv.equipment.weapon.defId)?.twoHanded);
      if (!this.canEquip(p, d, to.slot) && !conflict) {
        inv.equipment[to.slot] = item;
        this.dirty.add(p.id);
        this.equipmentChanged(p);
        return 0;
      }
    }
    return this.addItem(p, item);
  }

  // --- mensagens ----------------------------------------------------------------------

  /** C2S.MoveItem */
  onMoveItem(p: PlayerState, msg: MoveItemMsg): void {
    const inv = this.inv.get(p.id);
    if (!inv || !msg || typeof msg !== "object") return;
    const { from, to } = msg;
    if (!this.validLoc(inv, from) || !this.validLoc(inv, to)) return;
    if (msg.count !== undefined && msg.count !== null && (!isInt(msg.count) || msg.count < 1)) return;
    if ((from.where === "depot" || to.where === "depot") && !this.o.depotOpen?.(p.id)) return this.warn(p, MSG.depotClosed);
    if (p.hp <= 0) return;

    if (from.where === "equip") {
      if (to.where === "equip") return;
      return this.unequip(p, inv, from.slot, this.arr(inv, to.where), to.index);
    }
    if (to.where === "equip") return this.equip(p, inv, this.arr(inv, from.where), from.index, to.slot);
    this.moveContainer(p, inv, from, to, msg.count ?? undefined);
  }

  /** C2S.SortContainer: "Organizar" o depot aberto (junta pilhas iguais e ordena; nenhum item muda). */
  onSortContainer(p: PlayerState, msg: SortContainerMsg): void {
    const inv = this.inv.get(p.id);
    if (!inv || !msg || typeof msg !== "object" || msg.where !== "depot" || p.hp <= 0) return;
    if (!this.o.depotOpen?.(p.id)) return this.warn(p, MSG.depotClosed);
    const sorted = organizeItems(inv.depot, this.defs);
    for (let i = 0; i < inv.depot.length; i++) inv.depot[i] = sorted[i] ?? null;
    this.touched(p, inv, inv.depot);
  }

  /** C2S.UseItem */
  onUseItem(p: PlayerState, msg: UseItemMsg): void {
    const inv = this.inv.get(p.id);
    if (!inv || !msg || !isInt(msg.index) || msg.index < 0 || msg.index >= inv.backpack.length) return;
    this.useAt(p, inv, msg.index);
  }

  /** C2S.QuickPotion: a melhor poção de vida/mana que o level permite (regra em shared/itemRules.ts; o cliente mostra a mesma). */
  onQuickPotion(p: PlayerState, msg: QuickPotionMsg): void {
    const inv = this.inv.get(p.id);
    if (!inv || !msg || (msg.kind !== "hp" && msg.kind !== "mana")) return;
    const { index, needLevel } = pickQuickPotion(inv.backpack, msg.kind, p.level, this.defs, p.vocation);
    if (index < 0) return this.warn(p, needLevel ? MSG.level(needLevel) : msg.kind === "hp" ? MSG.noHp : MSG.noMana);
    this.useAt(p, inv, index);
  }

  /** C2S.DiscardItem: destrói o item do slot da mochila. */
  onDiscard(p: PlayerState, msg: DiscardItemMsg): void {
    const inv = this.inv.get(p.id);
    if (!inv || !msg || !isInt(msg.index) || msg.index < 0 || msg.index >= inv.backpack.length) return;
    if (!inv.backpack[msg.index]) return;
    inv.backpack[msg.index] = null;
    this.dirty.add(p.id);
  }

  /** Envia Inventory (e Depot, se aberto) a quem mudou neste tick. */
  flush(): void {
    for (const id of this.dirty) {
      this.organizeBackpack(id);
      const msg = this.inventoryMsg(id);
      if (msg) this.o.send(id, S2C.Inventory, msg);
    }
    this.dirty.clear();
    for (const id of this.depotDirty) {
      const inv = this.inv.get(id);
      if (inv && this.o.depotOpen?.(id)) this.o.send(id, S2C.Depot, { items: inv.depot } satisfies DepotMsg);
    }
    this.depotDirty.clear();
  }

  /**
   * A mochila se organiza sozinha (dono, 2026-10-27): a cada envio junta as pilhas iguais e ordena como o "Organizar" do
   * depot. Só aqui, no flush — dentro de um mesmo tick os índices que o cliente mandou continuam valendo (addItem e as
   * operações só preenchem vazios/pilhas, nunca deslocam o que já está lá).
   */
  private organizeBackpack(id: string): void {
    const inv = this.inv.get(id);
    if (!inv) return;
    const sorted = organizeItems(inv.backpack, this.defs);
    for (let i = 0; i < inv.backpack.length; i++) inv.backpack[i] = sorted[i] ?? null;
  }

  markDirty(id: string): void { this.dirty.add(id); }
  /** Força o envio do depot (abertura). */
  sendDepot(id: string): void { this.depotDirty.add(id); }

  inventoryMsg(id: string): InventoryMsg | undefined {
    const inv = this.inv.get(id);
    if (!inv) return undefined;
    const used = inv.backpack.filter(Boolean).length;
    return { equipment: inv.equipment, backpack: inv.backpack, gold: inv.gold, stats: this.stats(id), cap: { used, max: inv.backpack.length } };
  }

  // --- internos -----------------------------------------------------------------------

  private info(p: PlayerState, text: string): void {
    this.o.send(p.id, S2C.Notice, { text, kind: "info" } satisfies NoticeMsg);
  }

  private warn(p: PlayerState, text: string): void {
    this.o.send(p.id, S2C.Notice, { text, kind: "warn" } satisfies NoticeMsg);
  }

  /** Posição válida PARA ESTE inventário (a mochila tem o tamanho da capacidade do level do dono). */
  private validLoc(inv: Inventory, l: ItemLocation | undefined): l is ItemLocation {
    if (!l || typeof l !== "object") return false;
    if (l.where === "equip") return EQUIP_SLOTS.includes(l.slot);
    if (l.where === "backpack") return isInt(l.index) && l.index >= 0 && l.index < inv.backpack.length;
    if (l.where === "depot") return isInt(l.index) && l.index >= 0 && l.index < DEPOT_SIZE;
    return false;
  }

  private arr(inv: Inventory, where: "backpack" | "depot") { return where === "depot" ? inv.depot : inv.backpack; }

  private touched(p: PlayerState, inv: Inventory, ...arrs: (ItemInstance | null)[][]): void {
    this.dirty.add(p.id);
    if (arrs.includes(inv.depot)) this.depotDirty.add(p.id);
  }

  /** Motivo de não poder equipar (undefined = pode). */
  canEquip(p: PlayerState, d: ItemDef | undefined, slot: EquipSlot): string | undefined {
    if (!d || !d.slot || d.slot !== slot) return MSG.slot;
    if (d.vocations?.length && !d.vocations.includes(p.vocation)) return MSG.vocation;
    if ((d.level ?? 0) > p.level) return MSG.level(d.level!);
    return undefined;
  }

  private equip(p: PlayerState, inv: Inventory, src: (ItemInstance | null)[], si: number, slot: EquipSlot): void {
    const it = src[si];
    if (!it) return;
    const d = this.defs(it.defId);
    const err = this.canEquip(p, d, slot);
    if (err) return this.warn(p, err);
    // Itens que precisam sair: o do slot e o que conflita (duas mãos ↔ escudo).
    const prev = inv.equipment[slot];
    const extraSlot: EquipSlot | undefined =
      slot === "weapon" && d!.twoHanded && inv.equipment.shield ? "shield"
      : slot === "shield" && inv.equipment.weapon && this.defs(inv.equipment.weapon.defId)?.twoHanded ? "weapon"
      : undefined;
    const whole = it.count === 1;
    // O slot de origem fica livre se o item sai inteiro; o anterior volta para lá.
    const needBackpack = (prev && !whole ? 1 : 0) + (extraSlot ? 1 : 0);
    const free = inv.backpack.filter((x) => !x).length + (src === inv.backpack && whole && !prev ? 1 : 0);
    if (needBackpack > free) return this.warn(p, MSG.full);

    const moving = whole ? it : { ...it, uid: newUid(), count: 1 };
    if (whole) src[si] = null; else it.count -= 1;
    inv.equipment[slot] = moving;
    const put = (x: ItemInstance) => { const i = inv.backpack.indexOf(null); inv.backpack[i] = x; };
    if (prev) { if (whole) src[si] = prev; else put(prev); }
    if (extraSlot) { const x = inv.equipment[extraSlot]!; delete inv.equipment[extraSlot]; put(x); }
    this.touched(p, inv, src);
    this.equipmentChanged(p);
  }

  private unequip(p: PlayerState, inv: Inventory, slot: EquipSlot, dst: (ItemInstance | null)[], di: number): void {
    const it = inv.equipment[slot];
    if (!it) return;
    const occ = dst[di];
    if (occ) {
      // Troca se o item de destino pode ir para este slot; senão usa o primeiro espaço livre.
      const od = this.defs(occ.defId);
      const swapOk = occ.count === 1 && !this.canEquip(p, od, slot)
        && !(slot === "weapon" && od?.twoHanded && inv.equipment.shield);
      if (swapOk) {
        dst[di] = it;
        inv.equipment[slot] = occ;
        this.touched(p, inv, dst);
        this.equipmentChanged(p);
        return;
      }
      di = dst.indexOf(null);
      if (di < 0) return this.warn(p, dst === inv.depot ? MSG.depotFull : MSG.full);
    }
    dst[di] = it;
    delete inv.equipment[slot];
    this.touched(p, inv, dst);
    this.equipmentChanged(p);
  }

  private moveContainer(p: PlayerState, inv: Inventory, from: ItemLocation & { index: number }, to: ItemLocation & { index: number }, count?: number): void {
    const src = this.arr(inv, from.where as "backpack" | "depot");
    const dst = this.arr(inv, to.where as "backpack" | "depot");
    const si = from.index, di = to.index;
    const it = src[si];
    if (!it || (src === dst && si === di)) return;
    const n = count === undefined ? it.count : Math.min(count, it.count);
    const d = this.defs(it.defId);
    if (dst === inv.backpack) {
      // Dentro da mochila não há o que mover (ela se organiza sozinha; dividir pilha seria juntado de volta no flush).
      if (src === dst) return;
      // Depot → mochila, solto em qualquer quadrado: entra na pilha igual com espaço ou no primeiro vazio (dono, 2026-10-27).
      if (!d) return;
      const moved = this.spill(src, si, dst, n, d);
      if (moved < n) this.warn(p, MSG.full);
      if (moved > 0) this.touched(p, inv, src, dst);
      return;
    }
    const target = dst[di];
    if (!target) {
      if (n === it.count) { dst[di] = it; src[si] = null; }
      else { dst[di] = { ...it, uid: newUid(), count: n, bonuses: it.bonuses.map((b) => ({ ...b })) }; it.count -= n; }
    } else if (d?.stackable && target.defId === it.defId && target.rarity === it.rarity) {
      const mv = Math.max(0, Math.min(n, maxStackOf(d) - target.count));
      target.count += mv;
      it.count -= mv;
      if (it.count <= 0) src[si] = null;
      // Entre mochila e depot (o clique rápido aponta a primeira pilha igual, shared/itemRules.ts stackTarget), o que
      // não coube nela vai para as outras pilhas iguais e os espaços vazios do destino; "cheio" só se algo ficou de fora.
      const spilled = src !== dst && n > mv ? this.spill(src, si, dst, n - mv, d) : 0;
      if (src !== dst && mv + spilled < n) this.warn(p, dst === inv.depot ? MSG.depotFull : MSG.full);
      if (mv + spilled <= 0) return;
    } else if (n === it.count) {
      dst[di] = it;
      src[si] = target;
    } else {
      return; // dividir em cima de outro item: ignora
    }
    this.touched(p, inv, src, dst);
  }

  /**
   * Põe até `count` unidades da pilha `src[si]` em `dst`: primeiro nas pilhas iguais (item e raridade) com espaço,
   * depois nos espaços vazios (o resto inteiro vai como a própria instância; parte, como cópia com uid novo).
   * Retorna quantas unidades moveu.
   */
  private spill(src: (ItemInstance | null)[], si: number, dst: (ItemInstance | null)[], count: number, d: ItemDef): number {
    const it = src[si];
    if (!it) return 0;
    const max = maxStackOf(d);
    let left = count;
    for (const s of dst) {
      if (left <= 0) break;
      if (!s || s === it || s.defId !== it.defId || s.rarity !== it.rarity || s.count >= max) continue;
      const mv = Math.min(left, max - s.count);
      s.count += mv;
      it.count -= mv;
      left -= mv;
    }
    for (let i = 0; i < dst.length && left > 0; i++) {
      if (dst[i]) continue;
      const mv = Math.min(left, max);
      if (mv === it.count) { dst[i] = it; src[si] = null; }
      else { dst[i] = { ...it, uid: newUid(), count: mv, bonuses: it.bonuses.map((b) => ({ ...b })) }; it.count -= mv; }
      left -= mv;
    }
    if (it.count <= 0 && src[si] === it) src[si] = null;
    return count - left;
  }

  private useAt(p: PlayerState, inv: Inventory, index: number): void {
    const it = inv.backpack[index];
    if (!it || p.hp <= 0) return;
    const def = this.defs(it.defId);
    const use = def?.use;
    if (!use) return this.warn(p, MSG.notUsable);
    // Level do item vale para usar, não só para equipar: a Poção de Vida Grande (lv 30) curava 450 no lv 1.
    const need = levelNeeded(def, p.level);
    if (need) return this.warn(p, MSG.level(need));
    // Poções por vocação (as fortes, como no Tibia): um mago não bebe a Poção de Vida Enorme do cavaleiro.
    if (def?.vocations?.length && !def.vocations.includes(p.vocation)) return this.warn(p, MSG.vocation);
    const now = this.now();
    if (use.chest) {
      if (!this.o.openChest) return this.warn(p, MSG.notUsable);
      if (now < (this.foodCdUntil.get(p.id) ?? 0)) return;
      this.foodCdUntil.set(p.id, now + Math.max(0, use.cooldownMs ?? 0));
      it.count -= 1;
      if (it.count <= 0) inv.backpack[index] = null;
      this.dirty.add(p.id);
      this.o.openChest(p, it.defId);
      return;
    }
    if (use.food) {
      if (now < (this.foodCdUntil.get(p.id) ?? 0)) return this.warn(p, MSG.foodCooldown);
      if (!this.o.eat?.(p, use.food, now)) return this.info(p, MSG.satisfied);
      this.foodCdUntil.set(p.id, now + Math.max(0, use.cooldownMs ?? 0));
      it.count -= 1;
      if (it.count <= 0) inv.backpack[index] = null;
      this.dirty.add(p.id);
      return;
    }
    if (now < (this.potionCdUntil.get(p.id) ?? 0)) return this.warn(p, MSG.cooldown);
    this.potionCdUntil.set(p.id, now + Math.max(0, use.cooldownMs ?? 0));
    if ((use.heal ?? 0) > 0) this.o.heal?.(p, use.heal!);
    if ((use.mana ?? 0) > 0) this.o.restoreMana?.(p, use.mana!);
    it.count -= 1;
    if (it.count <= 0) inv.backpack[index] = null;
    this.dirty.add(p.id);
  }
}
