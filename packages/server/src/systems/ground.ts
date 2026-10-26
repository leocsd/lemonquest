// Itens no chão (estilo Tibia): largar da mochila/equipamento num tile (≤ 3 tiles, linha livre) ou no próprio,
// mover de um tile para outro (arrastar no mundo), pegar de volta (alcance 1), sumir com o tempo (10/20 min) e receber
// loot (o que não coube na mochila e o loot de grupo). O que está no chão é de qualquer um, com uma exceção curta: o loot
// de um abate em grupo fica reservado ao grupo por PARTY_LOOT_PRIORITY_MS (`owner` = id do grupo); depois vira sem dono
// como o resto. Estado sincronizado: state.groundItems (sem bônus); a instância completa fica aqui. Persistência (`store`, opcional): grava a lista inteira (com debounce) quando algo muda e no desligamento;
// no boot, `restore()` recarrega descartando o que já expirou (o relógio do decay é o de parede: o tempo com o
// servidor desligado também conta).
import {
  DROP_RANGE, RARITY_LABEL, S2C, lineOfSight,
  type ChatMessage, type DiscardItemMsg, type DropFrom, type DropItemMsg, type ItemInstance, type LookGroundMsg, type LookItemMsg, type MoveGroundItemMsg, type NoticeMsg, type PickupItemMsg,
  type Rarity,
} from "@lemonquest/shared";
import { GroundItemState, type PlayerState } from "../state.ts";
import { PerSecond } from "../persistence/ratelimit.ts";
import { GOLD_ID, maxStackOf, newUid, sanitizeItem, type InventorySystem } from "./inventory.ts";

/** Distância máxima (Chebyshev) para largar num tile que não seja o próprio. */
export { DROP_RANGE };
/** Distância máxima (Chebyshev) para "olhar" um item do chão (o que cabe na tela). */
export const LOOK_RANGE = 12;
/** Distância máxima (Chebyshev) para pegar. */
export const PICKUP_RANGE = 1;
export const MAX_PER_TILE = 15;
export const MAX_GROUND_ITEMS = 2000;
/** Tempo no chão até sumir. */
export const DECAY_MS: Record<Rarity, number> = {
  common: 10 * 60_000, uncommon: 10 * 60_000, rare: 20 * 60_000, epic: 20 * 60_000, legendary: 20 * 60_000,
};
/** Mensagens por segundo (largar + pegar, cada um). Excesso descartado em silêncio. */
export const GROUND_RATE = 10;
const SWEEP_MS = 1000;
const LOG_RARITIES: Rarity[] = ["epic", "legendary"];
/** Com o chão lotado, estes só saem depois de todos os comuns/incomuns; são também os que ganham linha no chat do grupo. */
const PROTECTED_RARITIES: Rarity[] = ["rare", "epic", "legendary"];
/**
 * Loot de abate em grupo (GD-21): por este tempo só membros do grupo pegam/movem o item; depois fica sem dono como o
 * resto do chão (fidelidade ao Tibia). Curto de propósito: é só para o grupo não perder o raro para quem passa correndo.
 */
export const PARTY_LOOT_PRIORITY_MS = 15_000;

export const GROUND_MSG = {
  tileFull: "Não cabe mais nada aqui.",
  itemFar: "O item está longe demais.",
  throwFar: "Você não alcança esse lugar daqui.",
  full: "Mochila cheia.",
} as const;
/** Aviso a quem é de fora do grupo e tenta pegar/mover loot ainda reservado. */
export const partyLootMsg = (secs: number): string => `Esse item é do grupo por mais ${secs} s.`;

/** Reserva do loot de grupo: `owner` = id do grupo; só membros pegam/movem até `ownerUntil`. */
export interface GroundReserve { owner: string; ownerUntil: number }

export interface GroundEntry {
  state: GroundItemState;
  item: ItemInstance;
  expiresAt: number;
  /** Quando a parte mais antiga da pilha caiu: o prazo nunca passa de createdAt + MAX_LIFE_MULT × DECAY_MS. */
  createdAt: number;
  /** Grupo que abateu (loot de grupo). Depois de `ownerUntil` fica só como procedência (linha no chat ao pegar raro+). */
  owner?: string;
  ownerUntil?: number;
}

/** Prazo (e "nascimento") de um item que muda de tile: viaja com ele, assim como a reserva do grupo. */
export interface GroundStamp { expiresAt: number; createdAt: number; owner?: string; ownerUntil?: number }

/** Juntar pilhas estende o prazo até, no máximo, este múltiplo do tempo normal contado de quando a mais antiga caiu. */
export const MAX_LIFE_MULT = 2;

/** Coleção sincronizada (MapSchema no jogo, Map nos testes). */
export interface GroundCollection {
  set(k: string, v: GroundItemState): unknown;
  delete(k: string): unknown;
  get(k: string): GroundItemState | undefined;
}

export interface GroundRecord {
  x: number; y: number; item: ItemInstance; expiresAt: number; createdAt?: number | null;
  /** Reserva do grupo (colunas `owner`/`owner_until`); null/ausente = sem dono. */
  owner?: string | null; ownerUntil?: number | null;
}
/** Armazenamento dos itens do chão (o jogo usa o SQLite; os testes, um array). */
export interface GroundStore {
  load(): GroundRecord[];
  save(rows: GroundRecord[]): void;
}
/** Intervalo mínimo entre gravações. */
export const SAVE_DEBOUNCE_MS = 5000;

export interface GroundOptions {
  store?: GroundStore;
  inventory: InventorySystem;
  collection: GroundCollection;
  /** Tile onde um item pode ficar (andável, sem NPC/portal...). */
  canHold: (x: number, y: number) => boolean;
  /** A linha de visão passa por este tile? (grade de colisão). */
  seeThrough: (x: number, y: number) => boolean;
  send: (sessionId: string, type: string, msg: unknown) => void;
  now?: () => number;
  log?: (msg: string) => void;
  /** Conquistas: o jogador largou / pegou um item. */
  onDropped?: (p: PlayerState) => void;
  onPickedUp?: (p: PlayerState) => void;
  /**
   * Ids dos membros do grupo de `p` (incluindo ele): recebem a linha no chat do grupo quando um membro pega um raro+
   * que veio de abate em grupo. Ausente = sem a linha (a reserva em si usa `p.partyId`, que o PartySystem mantém).
   */
  partyMembers?: (p: PlayerState) => string[];
}

export const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const isInt = (n: unknown): n is number => Number.isInteger(n);
const tileKey = (x: number, y: number) => `${x},${y}`;

/** Linha livre para arremessar (mesma regra da linha de visão de combate/magias: `lineOfSight` do shared). */
export const lineClear = lineOfSight;

export class GroundSystem {
  private readonly entries = new Map<string, GroundEntry>(); // ordem de inserção = mais antigo primeiro
  private readonly tiles = new Map<string, string[]>();       // tile → ids (último = topo)
  private readonly limiter: PerSecond;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private nextSweep = 0;
  private seq = 0;
  private dirty = false;
  private lastSave = 0;

  constructor(private readonly o: GroundOptions) {
    this.now = o.now ?? Date.now;
    this.log = o.log ?? ((m) => console.log(m));
    this.limiter = new PerSecond(this.now);
  }

  get size(): number { return this.entries.size; }
  get(id: string): GroundEntry | undefined { return this.entries.get(id); }
  /** Ids no tile (último = topo). */
  at(x: number, y: number): readonly string[] { return this.tiles.get(tileKey(x, y)) ?? []; }
  all(): IterableIterator<GroundEntry> { return this.entries.values(); }

  // --- mensagens ----------------------------------------------------------------------

  /** C2S.DropItem */
  onDrop(p: PlayerState, msg: DropItemMsg): void {
    if (!msg || typeof msg !== "object" || p.hp <= 0) return;
    if (!this.limiter.allow(`${p.id}:drop`, GROUND_RATE)) return;
    if (msg.count !== undefined && msg.count !== null && (!isInt(msg.count) || msg.count < 1)) return;
    this.dropFrom(p, msg.from, isInt(msg.x) ? msg.x : p.x, isInt(msg.y) ? msg.y : p.y, msg.count ?? undefined);
  }

  /** C2S.DiscardItem (compatibilidade): larga a pilha inteira da mochila no próprio tile. */
  onDiscard(p: PlayerState, msg: DiscardItemMsg): void {
    if (!msg || typeof msg !== "object" || p.hp <= 0) return;
    if (!this.limiter.allow(`${p.id}:drop`, GROUND_RATE)) return;
    this.dropFrom(p, { where: "backpack", index: msg.index }, p.x, p.y);
  }

  /** C2S.PickupItem */
  onPickup(p: PlayerState, msg: PickupItemMsg): void {
    if (!msg || typeof msg !== "object" || typeof msg.groundId !== "string" || p.hp <= 0) return;
    if (!this.limiter.allow(`${p.id}:pickup`, GROUND_RATE)) return;
    const e = this.entries.get(msg.groundId);
    if (!e) return; // já pegaram / sumiu: silencioso
    if (cheb(p.x, p.y, e.state.x, e.state.y) > PICKUP_RANGE) return;
    if (!this.mayTake(p, e)) return;
    const to = msg.to && typeof msg.to === "object" ? msg.to : undefined;
    const n = e.item.count;
    const left = this.o.inventory.placePickup(p, e.item, to);
    if (left >= n) return this.warn(p, GROUND_MSG.full);
    if (left > 0) {
      // Parte coube: o resto continua no chão (uid novo para não repetir o que entrou na mochila).
      e.item = { ...e.item, uid: newUid(), count: left, bonuses: e.item.bonuses.map((b) => ({ ...b })) };
      e.state.count = left;
      this.dirty = true;
      this.warn(p, GROUND_MSG.full);
    } else {
      this.remove(e.state.id);
    }
    this.o.onPickedUp?.(p);
    if (LOG_RARITIES.includes(e.item.rarity)) this.log(`[ground] ${p.name} pegou ${e.item.defId} (${e.item.rarity}) em ${e.state.x},${e.state.y}`);
    // Raro+ do loot do grupo pego por um membro: o grupo fica sabendo quem levou (GD-21), mesmo depois da reserva.
    if (e.owner && p.partyId === e.owner && PROTECTED_RARITIES.includes(e.item.rarity)) {
      const name = this.o.inventory.defs(e.item.defId)?.name ?? e.item.defId;
      const chat: ChatMessage = { from: "", text: `${p.name} pegou ${name} (${RARITY_LABEL[e.item.rarity]})`, channel: "party", ts: this.now() };
      for (const id of this.o.partyMembers?.(p) ?? []) this.o.send(id, S2C.Chat, chat);
    }
  }

  /**
   * Loot reservado ao grupo: quem é de fora não pega nem move até `ownerUntil` (aviso com os segundos que faltam).
   * Membro é quem está no grupo AGORA (`p.partyId`): quem saiu do grupo perde a prioridade junto.
   */
  private mayTake(p: PlayerState, e: GroundEntry): boolean {
    const until = e.ownerUntil ?? 0;
    const now = this.now();
    if (!e.owner || until <= now || p.partyId === e.owner) return true;
    this.warn(p, partyLootMsg(Math.max(1, Math.ceil((until - now) / 1000))));
    return false;
  }

  // --- API ----------------------------------------------------------------------------

  /**
   * Coloca um item no chão em (x,y). Empilha em cima de uma pilha igual. Retorna o id (ou undefined se o tile está
   * cheio/inválido). `stamp` = prazo e "nascimento" do item que chega (padrão: caiu agora, prazo agora + DECAY_MS).
   * Ao empilhar, a pilha fica com o prazo MAIS TARDE dos dois (o que acabou de cair não some junto com uma pilha velha),
   * limitado a MAX_LIFE_MULT × DECAY_MS desde a parte mais antiga: juntar/mover pilhas nunca deixa nada eterno.
   * Só empilha com o mesmo dono (ou ambos sem reserva): o ouro do grupo não entra numa pilha livre nem o contrário;
   * pilhas do mesmo grupo somam e a reserva fica com o prazo mais tarde.
   */
  place(item: ItemInstance, x: number, y: number, stamp?: GroundStamp): string | undefined {
    if (!this.o.canHold(x, y) || item.count < 1) return undefined;
    const now = this.now();
    const ids = this.at(x, y);
    const d = this.o.inventory.defs(item.defId);
    if (!d) return undefined;
    const decay = DECAY_MS[item.rarity] ?? DECAY_MS.common;
    const until = stamp?.expiresAt ?? now + decay;
    const created = stamp?.createdAt ?? now;
    // Reserva ainda válida do que chega (a procedência expirada viaja junto, mas não pesa no empilhamento).
    const reserve = stamp?.owner && (stamp.ownerUntil ?? 0) > now ? stamp.owner : undefined;
    // Empilha no topo se for o mesmo item empilhável.
    const topId = ids[ids.length - 1];
    const top = topId ? this.entries.get(topId) : undefined;
    if (top && d.stackable
      && top.item.defId === item.defId && top.item.rarity === item.rarity && top.item.count + item.count <= maxStackOf(d)
      && this.reservedFor(top, now) === reserve) {
      top.item.count += item.count;
      top.state.count = top.item.count;
      top.createdAt = Math.min(top.createdAt, created);
      top.expiresAt = Math.min(Math.max(top.expiresAt, until), top.createdAt + MAX_LIFE_MULT * decay);
      if (reserve) top.ownerUntil = Math.max(top.ownerUntil ?? 0, stamp!.ownerUntil!);
      this.dirty = true;
      return top.state.id;
    }
    if (ids.length >= MAX_PER_TILE) return undefined;
    while (this.entries.size >= MAX_GROUND_ITEMS) {
      const victim = this.evictionVictim();
      if (victim === undefined) break;
      this.remove(victim);
    }
    const s = new GroundItemState();
    s.id = `g${(++this.seq).toString(36)}`;
    s.defId = item.defId;
    s.count = item.count;
    s.rarity = item.rarity;
    s.x = x;
    s.y = y;
    const e: GroundEntry = { state: s, item, expiresAt: until, createdAt: created };
    if (stamp?.owner) { e.owner = stamp.owner; e.ownerUntil = stamp.ownerUntil; }
    this.entries.set(s.id, e);
    const k = tileKey(x, y);
    const list = this.tiles.get(k);
    if (list) list.push(s.id); else this.tiles.set(k, [s.id]);
    this.o.collection.set(s.id, s);
    this.dirty = true;
    return s.id;
  }

  /** Loot que não coube: no tile de quem matou (ou vizinho). */
  placeLoot(p: PlayerState, item: ItemInstance): boolean {
    return !!this.placeNear(item, p.x, p.y);
  }

  /**
   * Coloca em (x,y) ou no tile livre mais perto (até 2 de distância). Retorna o id (undefined = não coube).
   * `reserve`: loot de grupo, reservado ao grupo até `ownerUntil`.
   */
  placeNear(item: ItemInstance, x: number, y: number, reserve?: GroundReserve): string | undefined {
    const now = this.now();
    const decay = DECAY_MS[item.rarity] ?? DECAY_MS.common;
    const stamp: GroundStamp | undefined = reserve ? { expiresAt: now + decay, createdAt: now, ...reserve } : undefined;
    for (let r = 0; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const id = this.place(item, x + dx, y + dy, stamp);
        if (id) return id;
      }
    }
    return undefined;
  }

  /** Grupo com reserva ainda válida sobre a pilha (undefined = livre). */
  private reservedFor(e: GroundEntry, now: number): string | undefined {
    return e.owner && (e.ownerUntil ?? 0) > now ? e.owner : undefined;
  }

  /** C2S.LookGround: manda a instância completa (com bônus) de um item do chão à vista (até LOOK_RANGE tiles). */
  onLook(p: PlayerState, msg: LookGroundMsg): void {
    if (!msg || typeof msg !== "object" || typeof msg.groundId !== "string") return;
    const e = this.entries.get(msg.groundId);
    if (!e || cheb(p.x, p.y, e.state.x, e.state.y) > LOOK_RANGE) return;
    this.o.send(p.id, S2C.LookItem, { groundId: msg.groundId, item: e.item } satisfies LookItemMsg);
  }

  /**
   * C2S.MoveGroundItem: arrasta um item do chão para outro tile. O item tem de estar a até DROP_RANGE do jogador com
   * linha livre, e o destino segue a regra de largar (alcance, linha livre, tile que segura item). O tempo até sumir não
   * reinicia: o item leva o próprio prazo e "nascimento"; fundindo com uma pilha vale a regra de `place` (teto de 2×).
   */
  onMoveGround(p: PlayerState, msg: MoveGroundItemMsg): void {
    if (!msg || typeof msg !== "object" || typeof msg.groundId !== "string" || p.hp <= 0) return;
    if (!isInt(msg.x) || !isInt(msg.y)) return;
    if (msg.count !== undefined && msg.count !== null && (!isInt(msg.count) || msg.count < 1)) return;
    if (!this.limiter.allow(`${p.id}:drop`, GROUND_RATE)) return;
    const e = this.entries.get(msg.groundId);
    if (!e) return;
    const { x: sx, y: sy } = e.state;
    if (cheb(p.x, p.y, sx, sy) > DROP_RANGE || !lineClear(p.x, p.y, sx, sy, this.o.seeThrough)) return this.warn(p, GROUND_MSG.itemFar);
    if (msg.x === sx && msg.y === sy) return;
    if (!this.mayTake(p, e)) return;
    if (cheb(p.x, p.y, msg.x, msg.y) > DROP_RANGE || !lineClear(p.x, p.y, msg.x, msg.y, this.o.seeThrough)) return this.warn(p, GROUND_MSG.throwFar);
    if (!this.o.canHold(msg.x, msg.y)) return;
    const n = Math.min(msg.count ?? e.item.count, e.item.count);
    if (!this.fits(msg.x, msg.y, e.item.defId, e.item.rarity, n)) return this.warn(p, GROUND_MSG.tileFull);
    const whole = n >= e.item.count;
    const moving: ItemInstance = whole ? e.item : { ...e.item, uid: newUid(), count: n, bonuses: e.item.bonuses.map((b) => ({ ...b })) };
    const stamp: GroundStamp = { expiresAt: e.expiresAt, createdAt: e.createdAt };
    if (e.owner) { stamp.owner = e.owner; stamp.ownerUntil = e.ownerUntil; }
    if (whole) this.remove(e.state.id);
    const id = this.place(moving, msg.x, msg.y, stamp);
    if (!id) {
      // Não deveria acontecer (checado acima): devolve ao tile de origem.
      if (whole) this.place(moving, sx, sy, stamp);
      return this.warn(p, GROUND_MSG.tileFull);
    }
    if (!whole) { e.item.count -= n; e.state.count = e.item.count; }
    this.dirty = true;
  }

  remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    const k = tileKey(e.state.x, e.state.y);
    const list = this.tiles.get(k);
    if (list) {
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.tiles.delete(k);
    }
    this.o.collection.delete(id);
    this.dirty = true;
  }

  /** Some com o que passou do tempo (varre 1×/s). */
  tick(now = this.now()): void {
    if (now < this.nextSweep) return;
    this.nextSweep = now + SWEEP_MS;
    for (const [id, e] of this.entries) if (e.expiresAt <= now) this.remove(id);
    if (this.dirty && now - this.lastSave >= SAVE_DEBOUNCE_MS) this.flush(now);
  }

  /** Grava o chão agora, se mudou desde a última gravação (debounce na varredura / desligamento). */
  flush(now = this.now()): void {
    const store = this.o.store;
    if (!store || !this.dirty) return;
    this.dirty = false;
    this.lastSave = now;
    try {
      store.save([...this.entries.values()].map((e) => ({
        x: e.state.x, y: e.state.y, item: e.item, expiresAt: e.expiresAt, createdAt: e.createdAt,
        owner: e.owner ?? null, ownerUntil: e.ownerUntil ?? null,
      })));
    } catch (err) {
      this.dirty = true; // tenta de novo na próxima varredura
      this.log(`[ground] falha ao gravar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Recarrega do `store` (boot): descarta expirados, definições desconhecidas e tiles inválidos. Retorna quantos voltaram. */
  restore(now = this.now()): number {
    const store = this.o.store;
    if (!store) return 0;
    let rows: GroundRecord[];
    try { rows = store.load(); } catch (err) {
      this.log(`[ground] falha ao carregar: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
    let n = 0;
    for (const r of rows) {
      // Mesma limpeza do personagem ao carregar (raridade, bônus, refino); definição desconhecida sai. A pilha não é
      // cortada no maxStack: o ouro da caveira vermelha cai inteiro numa pilha só (pode passar de 1 milhão).
      const item = sanitizeItem(r.item, this.o.inventory.defs, { clampStack: false });
      if (r.expiresAt <= now || !item || !this.o.canHold(r.x, r.y)) continue;
      if (this.at(r.x, r.y).length >= MAX_PER_TILE || this.entries.size >= MAX_GROUND_ITEMS) continue;
      const s = new GroundItemState();
      s.id = `g${(++this.seq).toString(36)}`;
      s.defId = item.defId;
      s.count = item.count;
      s.rarity = item.rarity;
      s.x = r.x;
      s.y = r.y;
      // Registro de antes do createdAt: estima pelo prazo (caiu DECAY_MS antes de vencer).
      const createdAt = typeof r.createdAt === "number" ? r.createdAt : r.expiresAt - (DECAY_MS[item.rarity] ?? DECAY_MS.common);
      const e: GroundEntry = { state: s, item, expiresAt: r.expiresAt, createdAt };
      // Reserva do grupo só volta se ainda vale: grupos vivem em memória e os ids recomeçam a cada boot, então uma
      // procedência antiga poderia bater com um grupo novo e gerar linha de chat errada.
      if (typeof r.owner === "string" && r.owner && typeof r.ownerUntil === "number" && r.ownerUntil > now) {
        e.owner = r.owner; e.ownerUntil = r.ownerUntil;
      }
      this.entries.set(s.id, e);
      const k = tileKey(r.x, r.y);
      const list = this.tiles.get(k);
      if (list) list.push(s.id); else this.tiles.set(k, [s.id]);
      this.o.collection.set(s.id, s);
      n++;
    }
    this.dirty = n !== rows.length; // descartou algo: regrava a lista limpa
    return n;
  }

  removePlayer(id: string): void { this.limiter.clearPrefix(`${id}:`); }

  /** Chão lotado (MAX_GROUND_ITEMS): sai o comum/incomum mais antigo; só sem nenhum deles, o mais antigo de todos. */
  private evictionVictim(): string | undefined {
    let oldest: string | undefined;
    for (const [id, e] of this.entries) {
      oldest ??= id;
      if (!PROTECTED_RARITIES.includes(e.item.rarity)) return id;
    }
    return oldest;
  }

  // --- internos -----------------------------------------------------------------------

  /** Tile onde o item cai: o pedido se válido (alcance, linha livre, pode ficar), senão o do jogador. */
  dropTile(p: PlayerState, x: number, y: number): { x: number; y: number } {
    if (cheb(p.x, p.y, x, y) <= DROP_RANGE && this.o.canHold(x, y) && lineClear(p.x, p.y, x, y, this.o.seeThrough)) return { x, y };
    return { x: p.x, y: p.y };
  }

  private dropFrom(p: PlayerState, from: DropFrom, x: number, y: number, count?: number): void {
    if (!from || typeof from !== "object" || (from.where !== "backpack" && from.where !== "equip")) return;
    const it = this.o.inventory.peekAt(p.id, from);
    if (!it || it.defId === GOLD_ID) return;
    const n = count === undefined ? it.count : count;
    if (n > it.count) return;
    const t = this.dropTile(p, x, y);
    if (!this.o.canHold(t.x, t.y)) return this.warn(p, GROUND_MSG.tileFull);
    if (!this.fits(t.x, t.y, it.defId, it.rarity, n)) return this.warn(p, GROUND_MSG.tileFull);
    const taken = this.o.inventory.takeForDrop(p, from, n);
    if (!taken) return;
    const id = this.place(taken, t.x, t.y);
    if (!id) {
      // Não deveria acontecer (checado acima): devolve para não perder nada.
      this.o.inventory.placePickup(p, taken);
      return this.warn(p, GROUND_MSG.tileFull);
    }
    this.o.onDropped?.(p);
    if (LOG_RARITIES.includes(taken.rarity)) {
      const name = this.o.inventory.defs(taken.defId)?.name ?? taken.defId;
      this.log(`[ground] ${p.name} largou ${name} (${RARITY_LABEL[taken.rarity]}) em ${t.x},${t.y}`);
    }
  }

  /** Cabe no tile? (empilha no topo ou há vaga). */
  private fits(x: number, y: number, defId: string, rarity: Rarity, n: number): boolean {
    const ids = this.at(x, y);
    if (ids.length < MAX_PER_TILE) return true;
    const top = this.entries.get(ids[ids.length - 1]!);
    const d = this.o.inventory.defs(defId);
    const now = this.now();
    return !!top && !!d?.stackable
      && top.item.defId === defId && top.item.rarity === rarity && top.item.count + n <= maxStackOf(d);
  }

  private warn(p: PlayerState, text: string): void {
    this.o.send(p.id, S2C.Notice, { text, kind: "warn" } satisfies NoticeMsg);
  }
}
