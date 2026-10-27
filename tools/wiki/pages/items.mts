// Seção Itens da wiki: itens/index.html (uma tabela por categoria) e uma página por item (ficha, onde cai, onde comprar,
// quem compra, missões e baús que dão, para que serve e refino). Preços pelas mesmas contas do servidor
// (systems/npcs.ts): a loja cobra o `price` da entrada ou o valor do item (model.soldBy); o NPC paga npcBuyPrice
// (30 % do valor × multiplicador da raridade). Rótulos de atributo e de tipo iguais aos do balão do jogo
// (client/src/ui/items/itemInfo.ts), para o jogador achar na wiki a mesma palavra que vê no jogo.
import {
  ABYSS_ITEM_IDS, BOUNTY_NPC, CASINO_MATERIAL_POOL, CASINO_TICKET_PRICE, CHALLENGES, CHALLENGE_BONUS_PRIZE, FOOD_MAX_MS,
  FOOD_TICK_MS, HEALTH_POTION_CD_MS, IMBUEMENTS, IMBUEMENT_TIERS, MANA_POTION_CD_MS, MONSTERS, NPC_BUY_RATIO, QUEST_CHESTS,
  QUEST_CHEST_GROUPS, RARITIES, RARITY_LABEL, RARITY_PRICE_MULT, REFINE_ATTACK_PER_LEVEL, REFINE_ARMOR_PER_LEVEL, REFINE_EXTRA,
  REFINE_EXTRA_FROM, REFINE_FAIL_CHANCE, REFINE_MATERIAL, REFINE_MATERIAL_COUNT, REFINE_MAX, REFINE_NPC, REFINE_TIERS,
  REFINE_TIER_LEVEL, REQUEST_BANDS, REQUEST_NPC, SELL_ALL_KEEPS_FROM, findQuestObjects, imbuementName, isExclusiveItem,
  maxStackOf, npcBuyPrice, potionForLevel, refineBlock, refineCost, refineExpectedExtra, refineExpectedGold, refineMaterials,
  refineTier,
  type EquipSlot, type ItemDef, type ItemKind, type QuestChestDef, type QuestChestGroupDef, type StatId, type WeaponType,
} from "../../../packages/shared/src/index.ts";
import {
  creatureIcon, duration, esc, fmt, itemIcon, itemLink, kindBadge, kindName, link, monsterLink, npcIcon, npcLink, pct,
  questLink, slug, table, vocList, vocName, zoneLink, type SearchEntry, type WikiPage,
} from "../html.mts";
import type { WikiModel } from "../model.mts";
import { MECHANICS } from "./mechanics.mts";

/** Profundidade de todas as páginas da seção (itens/…). */
const D = 1;

// ---------------------------------------------------------------------------------------------------------------------
// Rótulos (os do balão do jogo)
// ---------------------------------------------------------------------------------------------------------------------

const STAT_LABEL: Record<StatId, string> = {
  attack: "Ataque", armor: "Armadura", hpMax: "Vida máx.", manaMax: "Mana máx.",
  magic: "Magic Level", melee: "Corpo a corpo", distance: "Distância", shield: "Escudo",
  speed: "Velocidade", crit: "Crítico", hpRegen: "Regen. de vida", manaRegen: "Regen. de mana",
};
const STAT_ORDER: StatId[] = ["attack", "armor", "hpMax", "manaMax", "magic", "melee", "distance", "shield", "speed", "crit", "hpRegen", "manaRegen"];
const PERCENT_STATS = new Set<StatId>(["speed", "crit"]);
/** Versão curta para a linha da tabela do índice ("Atq 42 · +60 vida · ML +2"). */
const STAT_SHORT: Record<StatId, string> = {
  attack: "Atq", armor: "Arm", hpMax: "vida", manaMax: "mana", magic: "ML", melee: "Corpo", distance: "Dist.", shield: "Escudo",
  speed: "Vel.", crit: "Crít.", hpRegen: "Regen. vida", manaRegen: "Regen. mana",
};
const SLOT_LABEL: Record<EquipSlot, string> = {
  helmet: "Elmo", amulet: "Amuleto", armor: "Armadura", weapon: "Arma", shield: "Escudo", legs: "Calças", ring: "Anel", boots: "Botas",
};
const KIND_LABEL: Record<ItemKind, string> = {
  weapon: "Arma", shield: "Escudo", helmet: "Elmo", armor: "Armadura", legs: "Calças", boots: "Botas", ring: "Anel", amulet: "Amuleto",
  potion: "Poção", material: "Material", key: "Chave", quest: "Item de missão", food: "Comida",
};
const WEAPON_LABEL: Record<WeaponType, string> = { sword: "Espada", axe: "Machado", club: "Clava", bow: "Arco", wand: "Varinha", rod: "Cajado" };
const WEAPON_PLURAL: Record<WeaponType, string> = { sword: "Espadas", axe: "Machados", club: "Clavas", bow: "Arcos", wand: "Varinhas", rod: "Cajados" };
const WEAPON_ORDER: WeaponType[] = ["sword", "axe", "club", "bow", "wand", "rod"];

/** Categorias do índice, na ordem da página (âncora = `id`). */
const CATEGORIES: { id: string; title: string; kinds: ItemKind[] }[] = [
  { id: "armas", title: "Armas", kinds: ["weapon"] },
  { id: "escudos", title: "Escudos", kinds: ["shield"] },
  { id: "elmos", title: "Elmos", kinds: ["helmet"] },
  { id: "armaduras", title: "Armaduras", kinds: ["armor"] },
  { id: "pernas", title: "Pernas", kinds: ["legs"] },
  { id: "botas", title: "Botas", kinds: ["boots"] },
  { id: "aneis", title: "Anéis", kinds: ["ring"] },
  { id: "amuletos", title: "Amuletos", kinds: ["amulet"] },
  { id: "pocoes", title: "Poções", kinds: ["potion"] },
  { id: "comidas", title: "Comidas", kinds: ["food"] },
  { id: "materiais", title: "Materiais", kinds: ["material"] },
  { id: "outros", title: "Itens de missão e outros", kinds: ["quest", "key"] },
];
/** A Moeda de Ouro é "material" nos dados (empilha até 1 milhão), mas é a moeda: fica com os itens especiais. */
const catOf = (d: ItemDef) => (d.id === "gold_coin" ? CATEGORIES[CATEGORIES.length - 1]! : CATEGORIES.find((c) => c.kinds.includes(d.kind)) ?? CATEGORIES[CATEGORIES.length - 1]!);

// ---------------------------------------------------------------------------------------------------------------------
// Fontes que só o servidor sorteia (a wiki não importa o servidor: o estado Colyseus exige os decorators dele).
// Espelho dos números de server/systems/quests.ts (rollChest, chestEligible, chestPotion, chestFallbackGem) e
// server/systems/fishing.ts (rollFish, FISHER_CHEST_EVERY). Mudou lá, mude aqui.
// ---------------------------------------------------------------------------------------------------------------------

const CHEST = {
  gold: [15, 40] as const, potion: 0.65, potionCount: [2, 5] as const, manaMage: 0.6, manaOther: 0.3,
  food: 0.5, foodCount: [2, 4] as const, gear: 0.15, gearSpan: 12,
};
/** Poção do baú pela faixa de level de quem abre: [de, até] (até null = sem teto). */
const CHEST_POTIONS: Record<string, [number, number | null]> = {
  health_potion: [1, 14], mana_potion: [1, 14], health_potion_medium: [15, 29], mana_potion_medium: [15, 29],
  health_potion_large: [30, null], mana_potion_large: [30, null],
};
/** Gema no lugar do equipamento quando não há peça possível. */
const CHEST_GEMS: Record<string, [number, number | null]> = { gem_green: [1, 34], gem_yellow: [35, 59], gem_purple: [60, null] };
/** Peixe sorteado quando morde (o resto da fatia é truta). */
const FISH: Record<string, number> = { golden_fish: 0.04, salmon: 0.26, trout: 0.7 };
const FISHER_CHEST_EVERY = 25;
const FISH_ROD = "fishing_rod";
const BOUNTY_CHEST = "bounty_chest";
const GOLD = "gold_coin";

// ---------------------------------------------------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------------------------------------------------

const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : "0");
const statsOf = (d: ItemDef) => STAT_ORDER.filter((s) => d.stats?.[s]).map((s) => [s, d.stats![s]!] as const);

/** Valor do atributo como no balão: ataque/armadura sem sinal; o resto com sinal e "%" quando é porcentagem. */
const statValue = (s: StatId, v: number) => (s === "attack" || s === "armor" ? fmt(v) : `${signed(v)}${PERCENT_STATS.has(s) ? "%" : ""}`);

/** "Atq 42 · +60 vida · ML +2 · Vel. +8%" (+ elemento da arma quando não é físico). */
function statShort(d: ItemDef): string {
  const parts = statsOf(d).map(([s, v]) => {
    if (s === "attack" || s === "armor") return `${STAT_SHORT[s]} ${fmt(v)}`;
    if (s === "hpMax" || s === "manaMax") return `${signed(v)} ${STAT_SHORT[s]}`;
    return `${STAT_SHORT[s]} ${statValue(s, v)}`;
  });
  if (d.slot === "weapon" && d.damageKind && d.damageKind !== "physical") parts.push(kindName[d.damageKind].toLowerCase());
  return parts.join(" · ");
}

function kindText(d: ItemDef): string {
  if (d.slot) return `${d.weaponType ? `${WEAPON_LABEL[d.weaponType]} · ` : ""}${SLOT_LABEL[d.slot]}${d.twoHanded ? " · duas mãos" : ""}`;
  return KIND_LABEL[d.kind];
}

/** "+60 de vida e +120 de mana" (`sign` = false: "60 de vida e 120 de mana", depois de "Recupera"). */
function potionEffect(d: ItemDef, sign = true): string {
  const p: string[] = [];
  if (d.use?.heal) p.push(`${sign ? "+" : ""}${fmt(d.use.heal)} de vida`);
  if (d.use?.mana) p.push(`${sign ? "+" : ""}${fmt(d.use.mana)} de mana`);
  return p.join(" e ");
}

/** "+3 de vida e +1 de mana" por tick de comida. */
function foodRates(f: { hpPerTick: number; manaPerTick: number }, short = false): string {
  const r: string[] = [];
  if (f.hpPerTick) r.push(short ? `+${fmt(f.hpPerTick)} vida` : `+${fmt(f.hpPerTick)} de vida`);
  if (f.manaPerTick) r.push(short ? `+${fmt(f.manaPerTick)} mana` : `+${fmt(f.manaPerTick)} de mana`);
  return r.join(short ? " · " : " e ");
}

/** "lv 15–29" / "lv 30+". */
const lvRange = ([a, b]: readonly [number, number | null]) => (b === null ? `lv ${a}+` : a === b ? `lv ${a}` : `lv ${a}–${b}`);
const qty = (min: number, max: number) => (min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`);
const gold = (n: number) => `${fmt(n)} de ouro`;
/** "do +4 e do +5" / "do +3 ao +5": as tentativas que pedem o material extra do refino. */
const refineSpan = (a: number, b: number) => (a === b ? `do +${a}` : b === a + 1 ? `do +${a} e do +${b}` : `do +${a} ao +${b}`);
const tag = (text: string, title = "") => `<span class="tag"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</span>`;
/** "cavaleiros e paladinos" (frases como "só … podem beber"). */
const VOC_PLURAL: Record<string, string> = { knight: "cavaleiros", paladin: "paladinos", sorcerer: "feiticeiros", druid: "druidas" };
const vocPlural = (v: readonly string[]) => v.map((x) => VOC_PLURAL[x] ?? x).join(", ").replace(/, ([^,]*)$/, " e $1");

/** Link para a página de mecânica (`slug` de MECHANICS, `hash` = âncora dela); sem a página, só o texto. */
const mech = (s: string, text: string, hash = "") => (MECHANICS.some((x) => x.slug === s) ? link(`mecanicas/${s}.html${hash ? `#${hash}` : ""}`, text, D) : esc(text));

/** Tabela de 2 colunas (ficha, `.wt.kv` do wiki.css): chave na 1ª célula, valor em HTML cru. */
function kv(rows: [string, string][]): string {
  return `<div class="table-wrap"><table class="wt kv"><tbody>\n${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join("\n")}\n</tbody></table></div>`;
}

/** Junta faixas de level contíguas: [[1,9],[10,17]] → [[1,17]]. */
function mergeRanges(r: [number, number | null][]): [number, number | null][] {
  const out: [number, number | null][] = [];
  for (const x of [...r].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && last[1] !== null && x[0] <= last[1] + 1) last[1] = x[1] === null ? null : Math.max(last[1], x[1]);
    else out.push([x[0], x[1]]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Fontes e usos cruzados (montados uma vez por execução)
// ---------------------------------------------------------------------------------------------------------------------

interface ChestSource { chest: QuestChestDef; group: QuestChestGroupDef; count: number; groupSize: number }
interface ImbueUse { name: string; minLevel: number; count: number; gold: number }

function crossIndex(m: WikiModel) {
  const push = <T,>(map: Map<string, T[]>, k: string, v: T) => { const l = map.get(k); if (l) l.push(v); else map.set(k, [v]); };

  // Baús de missão do mapa (quest_chest): onde fica cada um (para a zona) e o que cada um dá.
  const chestSpot = new Map(findQuestObjects(m.mapJson).filter((s) => s.kind === "chest").map((s) => [s.id, s]));
  const groupSize = new Map<string, number>();
  for (const c of Object.values(QUEST_CHESTS)) groupSize.set(c.group, (groupSize.get(c.group) ?? 0) + 1);
  const chests = new Map<string, ChestSource[]>();
  for (const c of Object.values(QUEST_CHESTS)) {
    const group = QUEST_CHEST_GROUPS[c.group];
    if (!group) continue;
    for (const it of c.items ?? []) push(chests, it.itemId, { chest: c, group, count: it.count, groupSize: groupSize.get(c.group) ?? 1 });
  }

  // Missões que pedem o item (passo "deliver").
  const deliver = new Map<string, { questId: string; count: number; npc: string }[]>();
  for (const q of m.quests) for (const s of q.steps) if (s.kind === "deliver") push(deliver, s.target, { questId: q.id, count: s.count, npc: s.npc ?? q.giver });

  // Encantamento: material principal e extra de cada tier.
  const imbue = new Map<string, ImbueUse[]>();
  for (const def of Object.values(IMBUEMENTS)) {
    for (const t of IMBUEMENT_TIERS) {
      const td = def.tiers[t];
      const base = { name: imbuementName(def.effect, t), minLevel: td.minLevel, gold: td.goldPrice };
      push(imbue, td.materialId, { ...base, count: td.materialCount });
      if (td.extra) push(imbue, td.extra.materialId, { ...base, count: td.extra.count });
    }
  }

  // Encomenda semanal: faixas de level em que o material pode ser pedido.
  const request = new Map<string, [number, number | null][]>();
  REQUEST_BANDS.forEach((b, i) => {
    const next = REQUEST_BANDS[i + 1];
    for (const id of b.materials) push(request, id, [b.minLevel, next ? next.minLevel - 1 : null]);
  });
  for (const [k, v] of request) request.set(k, mergeRanges(v));

  // Desafios da semana: prêmio em poção da faixa do level (potionForLevel).
  const challengeKinds = new Set([...CHALLENGES.map((c) => c.prize.potion?.kind), CHALLENGE_BONUS_PRIZE.potion?.kind].filter((k): k is "heal" | "mana" => !!k));
  const challenge = new Map<string, [number, number | null]>();
  for (const kind of challengeKinds) {
    for (let lv = 1; lv <= 300; lv++) {
      const id = potionForLevel(kind, lv);
      const r = challenge.get(id);
      if (!r) challenge.set(id, [lv, lv]);
      else r[1] = lv;
    }
  }
  for (const r of challenge.values()) if (r[1] === 300) r[1] = null;

  // Baú de Recompensa: equipamento vendido por NPC ou derrubado por monstro comum, fora os exclusivos (chestEligible).
  const sold = new Set(m.npcs.flatMap((n) => (n.shop?.sells ?? []).map((s) => s.itemId)));
  const mob = new Set(m.monsters.filter((x) => !x.boss).flatMap((x) => (x.loot ?? []).map((l) => l.itemId)));
  const bountyGear = (d: ItemDef) => !!d.slot && (sold.has(d.id) || mob.has(d.id)) && !isExclusiveItem(d);

  return { chests, chestSpot, deliver, imbue, request, challenge, bountyGear };
}
type Cross = ReturnType<typeof crossIndex>;

// ---------------------------------------------------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------------------------------------------------

export function render(m: WikiModel): WikiPage[] {
  const x = crossIndex(m);
  const abyss = new Set(ABYSS_ITEM_IDS);
  const casinoNpcs = m.npcs.filter((n) => n.casino);
  const imbueNpc = m.npcs.find((n) => n.imbuement);

  const zoneOfNpc = (id: string) => { const z = m.npcPos(id)?.zone; return z ? zoneLink(z, D) : "—"; };
  const buyPrice = (d: ItemDef) => (m.boughtBy(d.id).length ? npcBuyPrice(d.value) : 0);
  const minShop = (d: ItemDef) => { const s = m.soldBy(d.id); return s.length ? Math.min(...s.map((e) => e.price)) : undefined; };

  /** Outras fontes, curtas (célula do índice quando não há loja): missão, baú de missão, Baú de Recompensa, pesca, cassino. */
  function sourceHints(d: ItemDef): string[] {
    if (d.id === BOUNTY_CHEST) return [npcLink(BOUNTY_NPC, D), `<span class="muted">pesca</span>`, `<span class="muted">invasão</span>`];
    const out: string[] = [];
    const rw = m.rewardOf(d.id);
    if (rw.length) out.push(`<span class="muted">missão:</span> ${questLink(rw[0]!.questId, D)}${rw.length > 1 ? ` <small class="muted">+${rw.length - 1}</small>` : ""}`);
    const ch = x.chests.get(d.id) ?? [];
    const groups = [...new Set(ch.map((c) => c.group.name))];
    if (groups.length) out.push(`<span class="muted">baú:</span> ${esc(groups[0]!)}${groups.length > 1 ? ` <small class="muted">+${groups.length - 1}</small>` : ""}`);
    if (Object.hasOwn(FISH, d.id)) out.push(`<span class="muted">pesca</span>`);
    if (x.bountyGear(d) || Object.hasOwn(CHEST_POTIONS, d.id) || d.kind === "food" || Object.hasOwn(CHEST_GEMS, d.id)) out.push(itemLink(BOUNTY_CHEST, D));
    if ((CASINO_MATERIAL_POOL as readonly string[]).includes(d.id)) out.push(`<span class="muted">cassino</span>`);
    return out;
  }

  /** "Rato (25 %), Lobo (10 %) +3". */
  function dropCell(d: ItemDef): string {
    if (d.id === GOLD) return `<span class="muted">quase toda criatura</span>`;
    const dr = m.droppedBy(d.id);
    if (!dr.length) return "—";
    const top = dr.slice(0, 2).map((s) => `${monsterLink(s.monsterId, D)} <small>(${pct(s.chance, 2)})</small>`).join(", ");
    return `${top}${dr.length > 2 ? ` <small class="muted">+${dr.length - 2}</small>` : ""}`;
  }

  /** NPCs que vendem (nomes repetidos, como os 4 Vendedores do Coliseu, uma vez só); sem loja, as outras fontes. */
  function shopCell(d: ItemDef): string {
    const s = m.soldBy(d.id);
    if (!s.length) { const h = sourceHints(d); return h.length ? h.slice(0, 2).join(", ") : "—"; }
    const seen = new Set<string>();
    const names = s.filter((e) => { const n = m.npcs.find((x) => x.id === e.npcId)?.name ?? e.npcId; if (seen.has(n)) return false; seen.add(n); return true; });
    return `${names.slice(0, 2).map((e) => npcLink(e.npcId, D)).join(", ")}${names.length > 2 ? ` <small class="muted">+${names.length - 2}</small>` : ""}`;
  }

  /** Para que serve um material (célula curta do índice). */
  function useTags(d: ItemDef): string {
    const t: string[] = [];
    if (x.deliver.has(d.id)) t.push("Missão");
    if (REFINE_TIERS.some((tier) => REFINE_MATERIAL[tier] === d.id || REFINE_EXTRA[tier] === d.id)) t.push("Refino");
    if (x.imbue.has(d.id)) t.push("Encantamento");
    if (x.request.has(d.id)) t.push("Encomenda");
    if (d.id === FISH_ROD) t.push("Pesca");
    return t.length ? esc(t.join(" · ")) : "—";
  }

  const nameCell = (d: ItemDef) => `${itemLink(d.id, D)}${d.unique ? ` ${tag("único", "Prêmio de um lugar só")}` : abyss.has(d.id) ? ` ${tag("abissal", "Tier 8")}` : ""}`;
  const priceCell = (d: ItemDef): string | number => minShop(d) ?? "—";
  const sellCell = (d: ItemDef): string | number => (d.id === GOLD ? "—" : buyPrice(d) || "—");

  // --- índice --------------------------------------------------------------------------------------------------------
  const byLevel = (a: ItemDef, b: ItemDef) => (a.level ?? 1) - (b.level ?? 1) || a.value - b.value || a.name.localeCompare(b.name, "pt-BR");
  const byValue = (a: ItemDef, b: ItemDef) => a.value - b.value || a.name.localeCompare(b.name, "pt-BR");
  const byName = (a: ItemDef, b: ItemDef) => a.name.localeCompare(b.name, "pt-BR");

  const EQUIP_HEAD = ["", "Nome", "Lv", "Vocações", "Atributos", "Loja", "NPC paga", "Onde cai", "Onde compra"];
  const equipRow = (d: ItemDef): (string | number)[] => [
    itemIcon(d, 32), nameCell(d), d.level ?? 1, esc(vocList(d.vocations)), esc(statShort(d)) || "—", priceCell(d), sellCell(d), dropCell(d), shopCell(d),
  ];

  function categoryTable(cat: (typeof CATEGORIES)[number], list: ItemDef[]): string {
    if (cat.id === "armas") {
      return WEAPON_ORDER.map((wt) => {
        const ws = list.filter((d) => d.weaponType === wt).sort(byLevel);
        if (!ws.length) return "";
        const vocs = [...new Set(ws.flatMap((d) => d.vocations ?? []))];
        return `<h3 id="armas-${slug(wt)}">${esc(WEAPON_PLURAL[wt])} <small class="muted">${esc(vocs.map((v) => vocName[v]).join(", "))}</small></h3>\n${table(EQUIP_HEAD, ws.map(equipRow), { sortable: true })}`;
      }).join("\n") + (() => {
        const rest = list.filter((d) => !d.weaponType || !WEAPON_ORDER.includes(d.weaponType)).sort(byLevel);
        return rest.length ? `\n<h3>Outras armas</h3>\n${table(EQUIP_HEAD, rest.map(equipRow), { sortable: true })}` : "";
      })();
    }
    if (cat.kinds.some((k) => ["shield", "helmet", "armor", "legs", "boots", "ring", "amulet"].includes(k))) {
      return table(EQUIP_HEAD, [...list].sort(byLevel).map(equipRow), { sortable: true });
    }
    if (cat.id === "pocoes") {
      return table(["", "Nome", "Lv", "Vocações", "Efeito", "Loja", "NPC paga", "Onde cai", "Onde compra"], [...list].sort(byLevel).map((d) => [
        itemIcon(d, 32), nameCell(d), d.level ?? 1, esc(vocList(d.vocations)), esc(potionEffect(d)), priceCell(d), sellCell(d), dropCell(d), shopCell(d),
      ]), { sortable: true });
    }
    if (cat.id === "comidas") {
      return table(["", "Nome", "Lv", "Regeneração", "Duração", "Loja", "NPC paga", "Onde cai", "Onde compra"], [...list].sort(byLevel).map((d) => {
        const f = d.use?.food;
        return [
          itemIcon(d, 32), nameCell(d), d.level ?? 1, f ? `${esc(foodRates(f, true))} <small class="muted">/ ${fmt(FOOD_TICK_MS / 1000)} s</small>` : "—",
          f ? `<span data-sort="${f.durationMs}">${esc(duration(f.durationMs))}</span>` : "—", priceCell(d), sellCell(d), dropCell(d), shopCell(d),
        ];
      }), { sortable: true });
    }
    if (cat.id === "materiais") {
      return table(["", "Nome", "Loja", "NPC paga", "Usado em", "Onde cai", "Onde compra"], [...list].sort(byValue).map((d) => [
        itemIcon(d, 32), nameCell(d), priceCell(d), sellCell(d), useTags(d), dropCell(d), shopCell(d),
      ]), { sortable: true });
    }
    return table(["", "Nome", "Tipo", "Onde cai", "Outras fontes"], [...list].sort(byName).map((d) => {
      const h = sourceHints(d);
      return [itemIcon(d, 32), nameCell(d), esc(KIND_LABEL[d.kind]), dropCell(d), h.length ? h.join(", ") : "—"];
    }), { sortable: true });
  }

  const groups = CATEGORIES.map((c) => ({ cat: c, list: m.items.filter((d) => catOf(d) === c) })).filter((g) => g.list.length);
  const rarityMults = RARITIES.slice(1).map((r) => `×${fmt(RARITY_PRICE_MULT[r])} ${RARITY_LABEL[r].toLowerCase()}`).join(", ");
  const indexBody = [
    `<h1>Itens</h1>`,
    `<p class="lead">Os ${fmt(m.items.length)} itens do jogo, por categoria. Clique no nome para ver a ficha completa: quem derruba e com que chance, quem vende e quem compra, as missões e os baús que dão, para que serve e quanto custa refinar.</p>`,
    `<p class="facts"><b>Loja:</b> o NPC vende pelo valor do item; as encomendas especiais (${tag("1/semana")}) têm preço próprio e só uma por personagem por semana · `
      + `<b>NPC paga:</b> ${fmt(NPC_BUY_RATIO * 100)} % do valor por um item comum (${esc(rarityMults)}) · `
      + `<b>Equipamento</b> cai com raridade: de incomum para cima vem com bônus aleatórios.</p>`,
    `<nav class="toc" aria-label="Categorias">${groups.map((g) => `<a href="#${g.cat.id}">${esc(g.cat.title)} <small>${g.list.length}</small></a>`).join(" ")}</nav>`,
    ...groups.map((g) => `<h2 id="${g.cat.id}">${esc(g.cat.title)} <small class="muted">${g.list.length}</small></h2>\n${categoryTable(g.cat, g.list)}`),
  ].join("\n");

  const pages: WikiPage[] = [{
    path: "itens/index.html", title: "Itens", body: indexBody,
    search: [
      { title: "Itens", kind: "Seção", text: "lista de itens equipamentos armas armaduras poções comidas materiais loja preço" },
      ...groups.map((g) => ({ title: `${g.cat.title} (itens)`, kind: "Categoria", text: g.cat.kinds.map((k) => KIND_LABEL[k]).join(" "), href: `itens/index.html#${g.cat.id}` })),
    ],
  }];

  // --- uma página por item -------------------------------------------------------------------------------------------
  const seen = new Map<string, string>();
  for (const d of m.items) {
    const path = `itens/${slug(d.id)}.html`;
    if (seen.has(path)) throw new Error(`wiki/itens: ${d.id} e ${seen.get(path)} viram o mesmo arquivo ${path}`);
    seen.set(path, d.id);
    pages.push(itemPage(m, x, d, { abyss, casinoNpcs, imbueNpc, zoneOfNpc, buyPrice, minShop }));
  }
  return pages;
}

interface Ctx {
  abyss: Set<string>;
  casinoNpcs: WikiModel["npcs"];
  imbueNpc: WikiModel["npcs"][number] | undefined;
  zoneOfNpc(id: string): string;
  buyPrice(d: ItemDef): number;
  minShop(d: ItemDef): number | undefined;
}

function itemPage(m: WikiModel, x: Cross, d: ItemDef, c: Ctx): WikiPage {
  const cat = catOf(d);
  const parts: string[] = [];
  const drops = m.droppedBy(d.id);
  const shops = m.soldBy(d.id);
  const buyers = m.boughtBy(d.id);
  const rewards = m.rewardOf(d.id);
  const chests = x.chests.get(d.id) ?? [];
  const tier = refineTier(d);

  // --- cabeçalho -----------------------------------------------------------------------------------------------------
  const tags: string[] = [esc(kindText(d))];
  if (d.level && d.level > 1) tags.push(`level ${fmt(d.level)}+`);
  if ((d.slot || d.kind === "potion") && d.vocations?.length && d.vocations.length < 4) tags.push(esc(vocList(d.vocations)));
  if (d.unique) tags.push(tag("único", "Prêmio de um lugar só: fora das lojas e do Baú de Recompensa"));
  if (c.abyss.has(d.id)) tags.push(tag("abissal", "Tier 8: fora das lojas e do Baú de Recompensa"));
  parts.push(`<div class="page-head">${itemIcon(d, 64)}<div><h1>${esc(d.name)}</h1>${d.description ? `<p class="lead">${esc(d.description)}</p>` : ""}<p class="facts">${tags.join(" · ")}</p></div></div>`);

  // --- ficha ---------------------------------------------------------------------------------------------------------
  const rows: [string, string][] = [["Tipo", esc(kindText(d))]];
  if (d.slot || d.use?.heal || d.use?.mana || d.use?.food || d.level) rows.push(["Level mínimo", d.level && d.level > 1 ? fmt(d.level) : "Qualquer"]);
  if (d.slot || d.kind === "potion") rows.push(["Vocações", esc(vocList(d.vocations))]);
  for (const [s, v] of statsOf(d)) rows.push([STAT_LABEL[s], statValue(s, v)]);
  if (d.slot === "weapon") {
    if (d.range) rows.push(["Alcance", d.range <= 1 ? "1 (corpo a corpo)" : `${fmt(d.range)} tiles`]);
    if (d.damageKind) rows.push(["Elemento", kindBadge(d.damageKind)]);
    rows.push(["Duas mãos", d.twoHanded ? "Sim (não deixa usar escudo)" : "Não"]);
  }
  if (d.use && (d.use.heal || d.use.mana)) {
    rows.push(["Efeito", `Recupera ${esc(potionEffect(d, false))}`]);
    rows.push(["Recarga", esc(duration(d.use.cooldownMs))]);
  }
  const f = d.use?.food;
  if (f) {
    const ticks = f.durationMs / FOOD_TICK_MS;
    rows.push(["Regeneração", `${esc(foodRates(f))} a cada ${fmt(FOOD_TICK_MS / 1000)} s`]);
    rows.push(["Duração", esc(duration(f.durationMs))]);
    rows.push(["Total", esc(foodRates({ hpPerTick: f.hpPerTick * ticks, manaPerTick: f.manaPerTick * ticks }))]);
  }
  rows.push(["Empilhável", d.stackable ? (maxStackOf(d) > 1 ? `Sim, até ${fmt(maxStackOf(d))} por espaço` : "Não (um por espaço)") : "Não"]);
  if (d.id !== GOLD) {
    rows.push(["Valor base", d.value > 0 ? gold(d.value) : "Sem valor"]);
    const min = c.minShop(d);
    if (min !== undefined) rows.push(["Preço na loja", min === Math.max(...shops.map((s) => s.price)) ? gold(min) : `a partir de ${gold(min)}`]);
    rows.push(["NPC paga", buyers.length && c.buyPrice(d) ? `${gold(c.buyPrice(d))}${d.slot ? " (comum)" : ""}` : "Nenhum NPC compra"]);
  }
  if (d.unique) rows.push(["Único", "Sim: só um lugar dá, e fica fora das lojas e do Baú de Recompensa"]);
  if (c.abyss.has(d.id)) rows.push(["Tier", "8 (Abissal): fora das lojas e do Baú de Recompensa"]);
  if (d.slot) rows.push(["Refino", tier ? `Sim, tier ${tier} (<a href="#refino">custos abaixo</a>)` : `Não. ${esc(refineBlock(d) ?? "")}`]);
  parts.push(`<h2>Ficha</h2>\n${kv(rows)}`);

  // --- uso (poção e comida) ------------------------------------------------------------------------------------------
  if (d.use && (d.use.heal || d.use.mana)) {
    const who = d.vocations?.length && d.vocations.length < 4 ? `Só ${vocPlural(d.vocations)} podem beber.` : "Qualquer vocação pode beber.";
    const keys = [d.use.heal ? "Q (vida)" : "", d.use.mana ? "E (mana)" : ""].filter(Boolean).join(" e ");
    parts.push(`<h2>Uso</h2>
<p>${esc(who)} ${d.level && d.level > 1 ? `Pede level ${fmt(d.level)} para beber e para comprar. ` : ""}A recarga é uma só para todas as poções: beber uma de vida bloqueia qualquer poção por ${esc(duration(HEALTH_POTION_CD_MS))}; uma de mana, por ${esc(duration(MANA_POTION_CD_MS))}.</p>
<p>${d.use.heal && d.use.mana ? "As teclas" : "A tecla"} ${esc(keys)} ${d.use.heal && d.use.mana ? "bebem" : "bebe"} a poção da mochila que mais recupera entre as que o seu level e a sua vocação permitem. Veja também ${mech("cura-e-pocoes", "Cura e poções", "pocoes")}.</p>`);
  }
  if (f) {
    parts.push(`<h2>Uso</h2>
<p>Comer deixa o personagem alimentado: ${esc(foodRates(f))} a cada ${fmt(FOOD_TICK_MS / 1000)} s por ${esc(duration(f.durationMs))}, sem cura instantânea${d.level && d.level > 1 ? `; pede level ${fmt(d.level)} para comer e para comprar` : ""}. Comer de novo soma o tempo até ${esc(duration(FOOD_MAX_MS))}, e a regeneração vira a média das comidas pelo tempo de cada uma. Veja também ${mech("cura-e-pocoes", "Cura e poções", "comida")}.</p>`);
  }

  // --- onde conseguir ------------------------------------------------------------------------------------------------
  let sources = 0;
  if (d.id === GOLD) {
    const golds = m.monsters.filter((mo) => mo.gold && mo.gold[1] > 0).sort((a, b) => b.gold![1] - a.gold![1] || a.level - b.level);
    sources += golds.length;
    parts.push(`<h2>Onde cai</h2>
<p>É a moeda do jogo. Quase toda criatura deixa ouro ao morrer; em grupo, o ouro é dividido em partes iguais entre quem participou.</p>
${table(["", "Criatura", "Level", "Ouro por abate"], golds.map((mo) => [
      creatureIcon(mo, 32), `${monsterLink(mo.id, D)}${mo.boss ? ' <span class="tag boss">chefe</span>' : ""}`, mo.level,
      `<span data-sort="${(mo.gold![0] + mo.gold![1]) / 2}">${esc(qty(mo.gold![0], mo.gold![1]))}</span>`,
    ]), { sortable: true })}`);
  }

  if (drops.length) {
    sources += drops.length;
    parts.push(`<h2>Onde cai</h2>\n${table(["", "Criatura", "Level", "Chance", "Quantidade"], drops.map((s) => {
      const mo = MONSTERS[s.monsterId];
      return [
        mo ? creatureIcon(mo, 32) : "", `${monsterLink(s.monsterId, D)}${mo?.boss ? ' <span class="tag boss">chefe</span>' : ""}`, mo?.level ?? 0,
        `<span data-sort="${s.chance}">${esc(pct(s.chance, 2))}</span>`, `<span data-sort="${s.max}">${esc(qty(s.min, s.max))}</span>`,
      ];
    }), { sortable: true })}${d.slot ? `<p class="muted"><small>Equipamento sai com raridade sorteada; chefe dá um nível de raridade acima (no mínimo incomum).</small></p>` : ""}`);
  }

  if (shops.length) {
    sources += shops.length;
    // Nomes repetidos na mesma zona e preço (os 4 Vendedores do Coliseu) numa linha só.
    const grouped = new Map<string, { npcId: string; price: number; limited?: boolean; n: number }>();
    for (const s of shops) {
      const name = m.npcs.find((n) => n.id === s.npcId)?.name ?? s.npcId;
      const key = `${name}|${m.npcPos(s.npcId)?.zone ?? ""}|${s.price}|${s.limited ? 1 : 0}`;
      const g = grouped.get(key);
      if (g) g.n++;
      else grouped.set(key, { ...s, n: 1 });
    }
    const needLv = d.use && d.level && d.level > 1 ? d.level : 0;
    parts.push(`<h2>Onde comprar</h2>\n${table(["", "NPC", "Zona", "Preço", "Observação"], [...grouped.values()].map((s) => {
      const npc = m.npcs.find((n) => n.id === s.npcId);
      const obs = [s.limited ? `${tag("1/semana")} encomenda especial: uma por personagem por semana` : "", needLv ? `vende só a partir do level ${fmt(needLv)}` : ""].filter(Boolean).join("; ");
      return [npc ? npcIcon(npc.sprite, npc.name, 32) : "", `${npcLink(s.npcId, D)}${s.n > 1 ? ` <small class="muted">(×${s.n})</small>` : ""}`, c.zoneOfNpc(s.npcId), s.price, obs || "—"];
    }), { sortable: true })}`);
  }

  if (rewards.length) {
    sources += rewards.length;
    parts.push(`<h2>Recompensa de missão</h2>\n${table(["Missão", "Level", "Dada por", "Quantidade"], rewards.map((r) => {
      const q = m.quests.find((qq) => qq.id === r.questId);
      return [questLink(r.questId, D), q?.minLevel ?? 0, q ? npcLink(q.giver, D) : "—", r.count];
    }), { sortable: true })}`);
  }

  if (chests.length) {
    sources += chests.length;
    parts.push(`<h2>Baús de missão</h2>
<p>Cada personagem abre um baú por grupo, uma vez só; nos grupos de vários baús, abrir um esvazia os outros (é uma escolha).</p>
${table(["Baú", "Onde", "Level", "Quantidade", "Junto vem", "Escolha"], [...new Set(chests.map((s) => s.group.id))].map((gid) => chests.filter((s) => s.group.id === gid)).map((list) => {
      // Uma linha por grupo: nos covis o material vem em todos os baús e o que muda é o equipamento escolhido.
      const g = list[0]!.group;
      const spot = x.chestSpot.get(list[0]!.chest.id);
      const zone = spot ? m.zoneOf(spot.x, spot.y) : "";
      const counts = list.map((s) => s.count), golds = list.map((s) => s.chest.gold ?? 0);
      const others = list.map((s) => (s.chest.items ?? []).filter((i) => i.itemId !== d.id));
      const key = (i: { itemId: string; count: number }) => `${i.itemId}:${i.count}`;
      const common = others[0]!.filter((i) => others.every((o) => o.some((j) => key(j) === key(i))));
      const varied = [...new Set(others.flat().filter((i) => !common.some((j) => key(j) === key(i))).map((i) => i.itemId))];
      const goldText = Math.max(...golds) ? (Math.min(...golds) === Math.max(...golds) ? gold(golds[0]!) : `${qty(Math.min(...golds), Math.max(...golds))} de ouro`) : "";
      const along = [
        goldText, ...common.map((i) => `${fmt(i.count)}× ${itemLink(i.itemId, D)}`),
        varied.length ? `${varied.length > 1 ? "um destes: " : ""}${varied.map((id) => itemLink(id, D)).join(", ")}` : "",
      ].filter(Boolean).join(", ");
      const lock = g.needBoss ? ` <small>(depois de derrotar ${monsterLink(g.needBoss, D)})</small>` : "";
      const size = list[0]!.groupSize;
      return [
        `${esc(g.name)}${lock}`, zone ? zoneLink(zone, D) : esc(g.where), g.minLevel,
        `<span data-sort="${Math.max(...counts)}">${esc(qty(Math.min(...counts), Math.max(...counts)))}</span>`, along || "—",
        size <= 1 ? "—" : list.length === size ? `vem em qualquer um dos ${size} baús` : `1 de ${size} baús`,
      ];
    }), { sortable: true })}`);
  }

  // Fontes do servidor (Baú de Recompensa, pesca, cassino) e dos Desafios da semana.
  const other: string[] = [];
  const bounty = itemLink(BOUNTY_CHEST, D);
  if (x.bountyGear(d)) {
    other.push(`<li>${bounty}: ${pct(CHEST.gear)} de chance de equipamento por baú, uma peça que a vocação de quem abre usa, de até ${CHEST.gearSpan} levels abaixo do personagem (incomum ou melhor). Esta pode sair a partir do level ${fmt(d.level ?? 1)}${d.vocations?.length && d.vocations.length < 4 ? `, só para ${esc(vocPlural(d.vocations))}` : ""}.</li>`);
  }
  if (Object.hasOwn(CHEST_POTIONS, d.id)) {
    other.push(`<li>${bounty}: ${pct(CHEST.potion)} de chance de ${CHEST.potionCount[0]} a ${CHEST.potionCount[1]} poções da faixa do level; esta sai para quem abre no ${esc(lvRange(CHEST_POTIONS[d.id]!))}. Feiticeiros e druidas tiram mana ${pct(CHEST.manaMage)} das vezes; as outras vocações, ${pct(CHEST.manaOther)}.</li>`);
  }
  if (d.kind === "food") {
    other.push(`<li>${bounty}: ${pct(CHEST.food)} de chance de ${CHEST.foodCount[0]} a ${CHEST.foodCount[1]} unidades de uma comida sorteada entre as que o level já come${d.level && d.level > 1 ? ` (esta, do level ${fmt(d.level)} em diante)` : ""}.</li>`);
  }
  if (Object.hasOwn(CHEST_GEMS, d.id)) {
    other.push(`<li>${bounty}: vem no lugar do equipamento quando não há peça possível para o personagem (${esc(lvRange(CHEST_GEMS[d.id]!))}).</li>`);
  }
  const ch = x.challenge.get(d.id);
  if (ch) other.push(`<li>${mech("desafios", "Desafios da semana")}: o prêmio em poção vem na maior faixa que o level já bebe; esta, no ${esc(lvRange(ch))}.</li>`);
  if (Object.hasOwn(FISH, d.id)) {
    other.push(`<li>Pesca: com a ${itemLink(FISH_ROD, D)} na mochila, clique com o botão direito na água. Quando o peixe morde, ${pct(FISH[d.id]!)} das vezes é ${esc(d.name)}.</li>`);
  }
  if ((CASINO_MATERIAL_POOL as readonly string[]).includes(d.id)) {
    other.push(`<li>Ficha de cassino (${c.casinoNpcs.map((n) => npcLink(n.id, D)).join(", ") || "cassino"}, ${gold(CASINO_TICKET_PRICE)}): um dos ${CASINO_MATERIAL_POOL.length} materiais que a ficha pode dar.</li>`);
  }
  if (other.length) {
    sources += other.length;
    parts.push(`<h2>Outras fontes</h2>\n<ul>\n${other.join("\n")}\n</ul>`);
  }
  if (d.id === BOUNTY_CHEST) sources++;
  if (!sources) parts.push(`<h2>Onde conseguir</h2>\n<p class="note">Fonte: baú/evento (não catalogada).</p>`);

  // --- Baú de Recompensa (o próprio) ---------------------------------------------------------------------------------
  if (d.id === BOUNTY_CHEST) {
    const lv50 = [Math.round(CHEST.gold[0] * (1 + 50 / 5)), Math.round(CHEST.gold[1] * (1 + 50 / 5))] as const;
    const pot = (ids: string[]) => ids.map((id) => `${itemLink(id, D)} (${esc(lvRange(CHEST_POTIONS[id]!))})`).join(", ");
    const gems = Object.entries(CHEST_GEMS).map(([id, r]) => `${itemLink(id, D)} (${esc(lvRange(r))})`).join(", ");
    parts.push(`<h2>O que vem no baú</h2>
<p>Use o baú (clique direito) para abrir. O prêmio é sorteado na hora, pelo level e pela vocação de quem abre:</p>
<ul>
<li><b>Ouro:</b> ${CHEST.gold[0]} a ${CHEST.gold[1]} × (1 + level ÷ 5). No level 50, de ${fmt(lv50[0])} a ${fmt(lv50[1])}.</li>
<li><b>Poção</b> (${pct(CHEST.potion)}): ${CHEST.potionCount[0]} a ${CHEST.potionCount[1]} da faixa do level: ${pot(["health_potion", "health_potion_medium", "health_potion_large"])} ou as de mana da mesma faixa. Feiticeiros e druidas tiram mana ${pct(CHEST.manaMage)} das vezes; as outras vocações, ${pct(CHEST.manaOther)}.</li>
<li><b>Comida</b> (${pct(CHEST.food)}): ${CHEST.foodCount[0]} a ${CHEST.foodCount[1]} de uma comida sorteada entre as que o level já come.</li>
<li><b>Equipamento</b> (${pct(CHEST.gear)}): uma peça que a vocação usa, de até ${CHEST.gearSpan} levels abaixo do personagem, incomum ou melhor. Só entram peças vendidas em loja ou derrubadas por criatura comum: prêmios de missão e de baú, itens só de chefe, itens únicos e o tier 8 ficam de fora. Sem peça possível, vem uma gema: ${gems}.</li>
</ul>
<h2>Como conseguir</h2>
<ul>
<li>${npcLink(BOUNTY_NPC, D)}: cada recompensa entregue dá um baú (${mech("recompensas", "Quadro de Recompensas")}).</li>
<li>Pesca: a cada ${FISHER_CHEST_EVERY} peixes pescados, o Baú do Pescador.</li>
<li>Invasão (${mech("eventos", "Eventos da semana", "invasao")}): quem ajuda a defender a Vila ganha baús pelos pontos.</li>
</ul>`);
  }

  // --- quem compra ---------------------------------------------------------------------------------------------------
  if (buyers.length && c.buyPrice(d) > 0 && d.id !== GOLD) {
    const price = c.buyPrice(d);
    let html = `<h2>Quem compra</h2>\n<p>Pagam <b>${gold(price)}</b> por ${d.slot ? "um item comum" : "unidade"} (${fmt(NPC_BUY_RATIO * 100)} % do valor).</p>\n`;
    html += table(["", "NPC", "Zona"], buyers.map((b) => {
      const npc = m.npcs.find((n) => n.id === b.npcId);
      return [npc ? npcIcon(npc.sprite, npc.name, 32) : "", npcLink(b.npcId, D), c.zoneOfNpc(b.npcId)];
    }), { sortable: true });
    if (d.slot) {
      html += `\n<h3>Por raridade</h3>\n${table(["Raridade", "Multiplicador", "NPC paga"], RARITIES.map((r) => [
        esc(RARITY_LABEL[r]), `×${fmt(RARITY_PRICE_MULT[r])}`, npcBuyPrice(d.value, r),
      ]))}\n<p class="muted"><small>O “Vender tudo” deixa na mochila os itens ${esc(RARITY_LABEL[SELL_ALL_KEEPS_FROM].toLowerCase())}s ou melhores e os refinados: esses só se vendem um a um.</small></p>`;
    }
    parts.push(html);
  }

  // --- para que serve ------------------------------------------------------------------------------------------------
  const uses: string[] = [];
  const deliver = x.deliver.get(d.id) ?? [];
  if (deliver.length) {
    uses.push(`<h3>Missões que pedem</h3>\n${table(["Missão", "Level", "Quantidade", "Entregar a"], deliver.map((u) => [
      questLink(u.questId, D), m.quests.find((q) => q.id === u.questId)?.minLevel ?? 0, u.count, npcLink(u.npc, D),
    ]), { sortable: true })}`);
  }
  const refineUses = REFINE_TIERS.flatMap((t) => [
    REFINE_MATERIAL[t] === d.id ? `<li>Refino: ${fmt(REFINE_MATERIAL_COUNT)} por tentativa (do +1 ao +${REFINE_MAX}) em itens de tier ${t} (level ${fmt(REFINE_TIER_LEVEL[t])}+), no ${npcLink(REFINE_NPC, D)}.</li>` : "",
    REFINE_EXTRA[t] === d.id ? `<li>Refino: material extra das tentativas ${refineSpan(REFINE_EXTRA_FROM, REFINE_MAX)} em itens de tier ${t} (level ${fmt(REFINE_TIER_LEVEL[t])}+), no ${npcLink(REFINE_NPC, D)}.</li>` : "",
  ]).filter(Boolean);
  if (refineUses.length) uses.push(`<h3>${mech("refino", "Refino")}</h3>\n<ul>\n${refineUses.join("\n")}\n</ul>`);
  const imb = x.imbue.get(d.id) ?? [];
  if (imb.length) {
    uses.push(`<h3>Encantamento</h3>\n<p>Comprado com ${c.imbueNpc ? npcLink(c.imbueNpc.id, D) : "a encantadora"}: ouro e materiais, um efeito ativo por personagem (${mech("encantamento", "Encantamento")}).</p>\n${table(["Encantamento", "Level", "Quantidade", "Ouro"], imb.map((u) => [
      esc(u.name), u.minLevel || 1, u.count, u.gold,
    ]), { sortable: true })}`);
  }
  const req = x.request.get(d.id);
  if (req) uses.push(`<h3>Encomenda semanal</h3>\n<p>O ${npcLink(REQUEST_NPC, D)} pode pedir este material na encomenda da semana (troca por ouro) para personagens no ${esc(req.map(lvRange).join(" e no "))}.</p>`);
  if (d.id === FISH_ROD) uses.push(`<h3>Pesca</h3>\n<p>Com a vara na mochila, clique com o botão direito num tile de água perto da margem e espere sem se mexer. O peixe que morde é ${Object.entries(FISH).map(([id, p]) => `${itemLink(id, D)} (${esc(pct(p))})`).join(", ")}; a cada ${FISHER_CHEST_EVERY} peixes vem um ${itemLink(BOUNTY_CHEST, D)}.</p>`);
  if (uses.length) parts.push(`<h2>Para que serve</h2>\n${uses.join("\n")}`);

  // --- refino --------------------------------------------------------------------------------------------------------
  if (tier) {
    const isWeapon = d.slot === "weapon";
    const stat: StatId = isWeapon ? "attack" : "armor";
    const per = isWeapon ? REFINE_ATTACK_PER_LEVEL : REFINE_ARMOR_PER_LEVEL;
    const base = d.stats?.[stat] ?? 0;
    const refineRows: (string | number)[][] = [];
    for (let n = 1; n <= REFINE_MAX; n++) {
      const cost = refineCost(d, n);
      if (!cost) continue;
      refineRows.push([
        `<span data-sort="${n}">+${n}</span>`, cost.gold,
        refineMaterials(cost).map((mt) => `${fmt(mt.count)}× ${itemLink(mt.materialId, D)}`).join(" + "),
        `<span data-sort="${cost.failChance}">${esc(pct(cost.failChance))}</span>`,
        `${esc(STAT_LABEL[stat])} ${fmt(base + n * per)} <small class="muted">(+${fmt(n * per)})</small>`,
      ]);
    }
    const gems = REFINE_FAIL_CHANCE.slice(0, REFINE_MAX).reduce((s, fc) => s + REFINE_MATERIAL_COUNT / (1 - fc), 0);
    const extra = REFINE_EXTRA[tier];
    parts.push(`<h2 id="refino">Refino</h2>
<p>Tier ${tier}. Refine no ${npcLink(REFINE_NPC, D)} (${mech("refino", "como funciona o refino")}): cada tentativa cobra ouro e materiais e pode falhar; a falha não destrói nem rebaixa o item, só consome o custo. ${isWeapon ? "Arma" : "Esta peça"} ganha +${per} de ${esc(STAT_LABEL[stat].toLowerCase())} por nível.</p>
${table(["Nível", "Ouro por tentativa", "Materiais por tentativa", "Chance de falha", "Com o refino"], refineRows)}
<p class="muted"><small>Em média, do +0 ao +${REFINE_MAX} (falhas incluídas): ~${fmt(Math.round(refineExpectedGold(tier)))} de ouro e ~${fmt(Math.round(gems * 10) / 10)}× ${itemLink(REFINE_MATERIAL[tier], D)}${extra ? `, mais ~${fmt(Math.round(refineExpectedExtra() * 10) / 10)}× ${itemLink(extra, D)}` : ""}.</small></p>`);
  }

  const search: SearchEntry[] = [{
    title: d.name, kind: "Item",
    text: [
      kindText(d), d.slot || d.kind === "potion" ? vocList(d.vocations) : "",
      ...drops.slice(0, 10).map((s) => MONSTERS[s.monsterId]?.name ?? s.monsterId),
      ...[...new Set(shops.map((s) => m.npcs.find((n) => n.id === s.npcId)?.name ?? s.npcId))],
      ...rewards.map((r) => m.quests.find((q) => q.id === r.questId)?.name ?? ""),
      ...[...new Set(chests.map((s) => s.group.name))],
    ].filter(Boolean).join(" "),
  }];

  return {
    path: `itens/${slug(d.id)}.html`, title: d.name, body: parts.join("\n"), search,
    nav: `${link("itens/index.html", "Itens", D)} › ${link(`itens/index.html#${cat.id}`, cat.title, D)} › ${esc(d.name)}`,
  };
}
