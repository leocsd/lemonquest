// Missões e recompensas diárias (servidor = autoridade). Dados em shared/data/quests.ts.
// - Progresso por personagem em rec.data.quests (QuestSaveData), sem tabela nova.
// - Ganchos: abate (lista de jogadores com crédito), posição (explorar), falar com NPC, onda do coliseu vencida.
// - Coletar/entregar contam a mochila na hora (o cliente também conta, para mostrar o progresso).
// - Aceitar/entregar exigem a janela do NPC aberta (NpcSystem fecha ao sair do alcance).
// - Recompensas diárias: 3 por dia (troca às 06:00 de Brasília), geradas por dia + faixa de level (bounties.ts) e
//   gravadas com o id do monstro (a lista do dia não muda se as faixas mudarem).
// - Baú de Recompensa: usar sorteia poções/comida/ouro e às vezes um equipamento incomum+ da faixa do personagem.
// - Baús de quest do mapa (estilo Tibia, shared/data/questWorld.ts): um por grupo, uma vez por personagem; o pedido
//   chega por systems/questWorld.ts (que confere alcance e level). Os dos covis pedem o abate do chefe registrado
//   aqui mesmo (`slain`, gravado em rec.data.quests), com o crédito do passo "boss".
import {
  BOUNTIES_PER_DAY, BOUNTY_CHEST_ID, BOUNTY_NPC, ITEMS, MAX_TRACKED_QUESTS, MONSTERS, NPCS, QUEST_LIST, RARITIES, S2C, applyXpStage,
  CHEST_LOCK_BOSSES, bountyBand, bountyTitle, chestLockReason, isEquipable, isExclusiveItem, questAvailable, questChestGroup, questDef, questReady, rollInt,
  type BountyStatus, type BountyView, type FeedMsg, type ItemDef, type ItemInstance, type LootMsg, type NoticeMsg,
  type QuestActionMsg, type QuestChestDef, type QuestCompleteMsg, type QuestDef, type QuestReward, type QuestsMsg, type Rarity, type Vocation,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { QuestSaveData } from "../persistence/types.ts";
import { bountyDay, clampBand, generateBounties, nextBountyReset, restoreBounties, type BountyDef } from "./bounties.ts";
import { makeItem, newUid, type ItemDefs } from "./inventory.ts";
import { createItem, rollRarity } from "./loot.ts";

export interface ZoneRect { name: string; x0: number; y0: number; x1: number; y1: number }

/** O que o sistema precisa do inventário (InventorySystem implementa). */
export interface QuestInventory {
  defs: ItemDefs;
  countItem(id: string, defId: string): number;
  removeItems(p: PlayerState, defId: string, count: number): boolean;
  addItem(p: PlayerState, item: ItemInstance): number;
  addGold(p: PlayerState, n: number): void;
}

export interface QuestOptions {
  inventory: QuestInventory;
  getPlayer: (id: string) => PlayerState | undefined;
  send: (sessionId: string, type: string, msg: unknown) => void;
  /** CombatSystem.gainXp (level up incluso). */
  gainXp: (p: PlayerState, amount: number) => void;
  /** NPC com a janela aberta para o jogador ("" = nenhum). */
  npcOpen: (id: string) => string;
  /** Zonas do mapa (objetos "zone"), para os passos de explorar. */
  zones: ZoneRect[];
  /** O que não coube na mochila cai no chão (protegido). false = perdido. */
  placeLoot?: (p: PlayerState, item: ItemInstance) => boolean;
  broadcast?: (type: string, msg: unknown) => void;
  /** Desbloqueio de recompensa (roupa/addon/título): o sistema de conquistas liga aqui. Padrão: nada. */
  onUnlock?: (playerId: string, unlockId: string) => void;
  /** Missão concluída (conquistas: contador "quests"). Recompensas diárias: bounty = true. */
  onComplete?: (playerId: string, id: string, bounty: boolean) => void;
  now?: () => number;
  rng?: () => number;
  quests?: QuestDef[];
}

interface Bounty { day: string; band: number; s: { st: BountyStatus; n: number }[]; defs: BountyDef[] }
interface Entry {
  active: Map<string, number[]>;
  done: Set<string>;
  tracked: string[];
  bounty: Bounty | null;
  /** Grupos de baús de quest já abertos. */
  chests: Set<string>;
  /** Chefes que destrancam baús (`needBoss`, covis) já derrotados, com o crédito do passo "boss" (onKill). */
  slain: Set<string>;
  tx: number; ty: number;
}

/** Intervalo da verificação da troca diária (jogadores online na virada das 6h). */
export const BOUNTY_CHECK_MS = 30_000;

export class QuestSystem {
  private readonly st = new Map<string, Entry>();
  private readonly dirty = new Set<string>();
  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly defs: Map<string, QuestDef>;
  private readonly list: QuestDef[];
  private nextBountyCheck = 0;

  constructor(private readonly o: QuestOptions) {
    this.now = o.now ?? Date.now;
    this.rng = o.rng ?? Math.random;
    this.list = o.quests ?? QUEST_LIST;
    this.defs = new Map(this.list.map((d) => [d.id, d]));
  }

  private def(id: string): QuestDef | undefined { return this.defs.get(id) ?? (this.o.quests ? undefined : questDef(id)); }

  // --- ciclo de vida ----------------------------------------------------------------------------

  load(p: PlayerState, data: QuestSaveData | undefined): void {
    const e: Entry = { active: new Map(), done: new Set(), tracked: [], bounty: null, chests: new Set(), slain: new Set(), tx: p.x, ty: p.y };
    for (const id of data?.done ?? []) if (this.def(id)) e.done.add(id);
    for (const g of data?.chests ?? []) if (questChestGroup(g)) e.chests.add(g);
    for (const b of data?.slain ?? []) if (CHEST_LOCK_BOSSES.has(b)) e.slain.add(b);
    for (const [id, prog] of Object.entries(data?.active ?? {})) {
      const d = this.def(id);
      if (!d || e.done.has(id) || !Array.isArray(prog)) continue;
      e.active.set(id, d.steps.map((s, i) => Math.max(0, Math.min(s.count, Math.floor(Number(prog[i]) || 0)))));
    }
    e.tracked = (data?.tracked ?? []).filter((id) => e.active.has(id)).slice(0, MAX_TRACKED_QUESTS);
    const b = data?.bounty;
    if (b && typeof b.day === "string" && Array.isArray(b.s)) {
      // Progresso por posição, mas a lista vem do que foi gravado (id do monstro), não de um novo sorteio: mudar
      // BOUNTY_BANDS não troca o alvo de uma recompensa já aceita (ciclo 14).
      const band = clampBand(b.band);
      const defs = restoreBounties(b.day, band, b.s);
      e.bounty = {
        day: b.day, band, defs,
        s: defs.map((d, i) => {
          const x = b.s[i];
          const st: BountyStatus = x?.st === "active" || x?.st === "done" ? x.st : "open";
          return { st, n: Math.max(0, Math.min(d.count, Math.floor(Number(x?.n) || 0))) };
        }),
      };
    }
    this.st.set(p.id, e);
    this.ensureDay(p, e);
    this.dirty.add(p.id);
  }

  serialize(id: string): QuestSaveData | undefined {
    const e = this.st.get(id);
    if (!e) return undefined;
    const out: QuestSaveData = {};
    if (e.active.size) out.active = Object.fromEntries([...e.active].map(([k, v]) => [k, [...v]]));
    if (e.done.size) out.done = [...e.done];
    if (e.tracked.length) out.tracked = [...e.tracked];
    if (e.bounty) {
      const b = e.bounty;
      out.bounty = { day: b.day, band: b.band, s: b.s.map((x, i) => ({ st: x.st, n: x.n, m: b.defs[i]!.monster, c: b.defs[i]!.count })) };
    }
    if (e.chests.size) out.chests = [...e.chests];
    if (e.slain.size) out.slain = [...e.slain];
    return out;
  }

  removePlayer(id: string): void { this.st.delete(id); this.dirty.delete(id); }

  /** Mensagem de estado (S2C.Quests). */
  stateMsg(id: string): QuestsMsg | undefined {
    const e = this.st.get(id);
    if (!e) return undefined;
    const now = this.now();
    // XP já com o estágio do level (a entrega aplica applyXpStage): o cartão mostrava a XP cheia, até 8× a real no lv 100.
    const level = this.o.getPlayer(id)?.level ?? 1;
    const list: BountyView[] = e.bounty
      ? e.bounty.defs.map((d, i) => ({ monster: d.monster, count: d.count, progress: e.bounty!.s[i]!.n, status: e.bounty!.s[i]!.st, xp: applyXpStage(d.xp, level), gold: d.gold }))
      : [];
    return {
      active: [...e.active].map(([qid, progress]) => ({ id: qid, progress: [...progress] })),
      done: [...e.done],
      tracked: [...e.tracked],
      bounties: { day: e.bounty?.day ?? bountyDay(now), resetsAt: nextBountyReset(now), list },
      chests: [...e.chests],
    };
  }

  /** Reenvio completo (entrada/reconexão). */
  resend(id: string): void {
    const m = this.stateMsg(id);
    if (m) this.o.send(id, S2C.Quests, m);
  }

  /** Por tick: explorar, troca diária e envio do estado de quem mudou. */
  tick(now: number, players: Iterable<PlayerState>): void {
    const checkDay = now >= this.nextBountyCheck;
    if (checkDay) this.nextBountyCheck = now + BOUNTY_CHECK_MS;
    for (const p of players) {
      const e = this.st.get(p.id);
      if (!e) continue;
      if (e.tx !== p.x || e.ty !== p.y) { e.tx = p.x; e.ty = p.y; this.onPosition(p, e); }
      if (checkDay && this.ensureDay(p, e)) this.dirty.add(p.id);
    }
    this.flush();
  }

  flush(): void {
    for (const id of this.dirty) this.resend(id);
    this.dirty.clear();
  }

  // --- ganchos -----------------------------------------------------------------------------------

  /**
   * Monstro morto: crédito para cada jogador da lista (quem causou dano; o sistema de grupo pode ampliar). A sala manda
   * a mesma lista do passo "boss" (WorldRoom.questCredit: vazia no Coliseu, em invocação e em ajudante de monstro); é ela
   * que registra o abate dos chefes que destrancam baús de covil.
   */
  onKill(monsterId: string, playerIds: Iterable<string>): void {
    const lockBoss = CHEST_LOCK_BOSSES.has(monsterId);
    for (const pid of new Set(playerIds)) {
      const e = this.st.get(pid);
      if (!e) continue;
      if (lockBoss) e.slain.add(monsterId);
      for (const [qid, prog] of e.active) {
        const d = this.def(qid);
        d?.steps.forEach((s, i) => {
          if ((s.kind === "kill" || s.kind === "boss") && s.target === monsterId && prog[i]! < s.count) { prog[i]!++; this.dirty.add(pid); }
        });
      }
      const b = e.bounty;
      b?.defs.forEach((d, i) => {
        const x = b.s[i]!;
        if (d.monster === monsterId && x.st === "active" && x.n < d.count) {
          x.n++;
          this.dirty.add(pid);
          if (x.n === d.count) this.notice(pid, `Recompensa cumprida: ${bountyTitle(d)}. Volte ao Quadro de Recompensas.`, "good");
        }
      });
    }
  }

  /** Onda `wave` do coliseu vencida pelo jogador. */
  onArenaWave(playerId: string, wave: number): void {
    const e = this.st.get(playerId);
    if (!e) return;
    for (const [qid, prog] of e.active) {
      this.def(qid)?.steps.forEach((s, i) => {
        if (s.kind === "arena" && wave > prog[i]!) { prog[i] = Math.min(s.count, wave); this.dirty.add(playerId); }
      });
    }
  }

  /** Falou com um NPC (janela aberta): passos "falar com" e "entregar a". */
  onTalk(p: PlayerState, npcId: string): void {
    const e = this.st.get(p.id);
    if (!e) return;
    for (const [qid, prog] of e.active) {
      const d = this.def(qid);
      d?.steps.forEach((s, i) => {
        if (prog[i]! >= s.count) return;
        if (s.kind === "talk" && s.target === npcId) {
          prog[i] = s.count;
          this.dirty.add(p.id);
          this.notice(p.id, `${d.name}: ${s.label} ✓`, "good");
        } else if (s.kind === "deliver" && s.npc === npcId && this.o.inventory.countItem(p.id, s.target) >= s.count) {
          if (!this.o.inventory.removeItems(p, s.target, s.count)) return;
          prog[i] = s.count;
          this.dirty.add(p.id);
          this.notice(p.id, `${d.name}: ${s.label} entregue ✓`, "good");
        }
      });
    }
  }

  private onPosition(p: PlayerState, e: Entry): void {
    for (const [qid, prog] of e.active) {
      const d = this.def(qid);
      d?.steps.forEach((s, i) => {
        if (s.kind !== "explore" || prog[i]! >= s.count) return;
        const inside = s.area
          ? p.x >= s.area.x && p.y >= s.area.y && p.x < s.area.x + s.area.w && p.y < s.area.y + s.area.h
          : this.o.zones.some((z) => z.name === s.target && p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1);
        if (!inside) return;
        prog[i] = s.count;
        this.dirty.add(p.id);
        this.notice(p.id, `${d.name}: ${s.label} ✓`, "good");
      });
    }
  }

  // --- ações do jogador (C2S.Quest) ------------------------------------------------------------------

  onAction(p: PlayerState, msg: QuestActionMsg): void {
    if (!msg || typeof msg !== "object" || p.hp <= 0) return;
    const e = this.st.get(p.id);
    if (!e) return;
    switch (msg.action) {
      case "accept": return this.accept(p, e, String(msg.questId));
      case "turnIn": { this.turnIn(p, e, String(msg.questId)); return; }
      case "abandon": {
        const d = this.def(String(msg.questId));
        if (!d || !e.active.delete(d.id)) return;
        e.tracked = e.tracked.filter((x) => x !== d.id);
        this.dirty.add(p.id);
        this.notice(p.id, `Missão abandonada: ${d.name}.`, "info");
        return;
      }
      case "track": {
        const id = String(msg.questId);
        if (!e.active.has(id)) return;
        if (msg.on) {
          if (e.tracked.includes(id)) return;
          if (e.tracked.length >= MAX_TRACKED_QUESTS) e.tracked.shift();
          e.tracked.push(id);
        } else e.tracked = e.tracked.filter((x) => x !== id);
        this.dirty.add(p.id);
        return;
      }
      case "bountyAccept": return this.bountyAccept(p, e, msg.index);
      case "bountyTurnIn": return this.bountyTurnIn(p, e, msg.index);
    }
  }

  private accept(p: PlayerState, e: Entry, id: string): void {
    const d = this.def(id);
    if (!d || this.o.npcOpen(p.id) !== d.giver) return;
    if (!questAvailable(d, p.level, (x) => e.active.has(x), (x) => e.done.has(x))) {
      if (p.level < d.minLevel) this.notice(p.id, `Você precisa ser level ${d.minLevel}.`, "warn");
      return;
    }
    e.active.set(d.id, d.steps.map(() => 0));
    if (e.tracked.length < MAX_TRACKED_QUESTS) e.tracked.push(d.id);
    this.dirty.add(p.id);
    this.notice(p.id, `Missão aceita: ${d.name}`, "good");
  }

  /** Pronta para entregar? (conta a mochila). */
  isReady(id: string, questId: string): boolean {
    const e = this.st.get(id);
    const d = this.def(questId);
    const prog = e?.active.get(questId);
    return !!d && !!prog && questReady(d, prog, (it) => this.o.inventory.countItem(id, it));
  }

  private turnIn(p: PlayerState, e: Entry, id: string, force = false): boolean {
    const d = this.def(id);
    if (!d || !e.active.has(d.id)) return false;
    if (!force && this.o.npcOpen(p.id) !== d.giver) return false;
    if (!force && !this.isReady(p.id, d.id)) { this.notice(p.id, "A missão ainda não está completa.", "warn"); return false; }
    // Entregas ao próprio NPC: consome os itens (tudo antes de recompensar).
    if (!force) {
      for (const s of d.steps) if (s.kind === "deliver" && !s.npc && !this.o.inventory.removeItems(p, s.target, s.count)) return false;
    }
    e.active.delete(d.id);
    e.done.add(d.id);
    e.tracked = e.tracked.filter((x) => x !== d.id);
    this.dirty.add(p.id);
    const items = this.grant(p, d.rewards);
    if (d.rewards.unlock) this.o.onUnlock?.(p.id, d.rewards.unlock);
    this.o.onComplete?.(p.id, d.id, false);
    this.o.send(p.id, S2C.QuestComplete, { name: d.name, xp: d.rewards.xp, gold: d.rewards.gold, items } satisfies QuestCompleteMsg);
    if (d.rewards.unlock || d.steps.some((s) => s.kind === "boss")) {
      this.o.broadcast?.(S2C.Feed, { text: `📜 ${p.name} concluiu a missão "${d.name}"!`, kind: "info" } satisfies FeedMsg);
    }
    return true;
  }

  /** Dá XP, ouro e itens (equipáveis: incomum, ou `rarity`). O que não couber cai no chão. */
  private grant(p: PlayerState, r: QuestReward, extra: ItemInstance[] = [], rarity: Rarity = "uncommon"): { itemId: string; count: number }[] {
    if (r.gold > 0) this.o.inventory.addGold(p, r.gold);
    const inst: ItemInstance[] = [...extra];
    for (const it of r.items ?? []) {
      const def = this.o.inventory.defs(it.itemId);
      if (!def) continue;
      if (isEquipable(def)) for (let i = 0; i < it.count; i++) inst.push(createItem(def, 1, this.rng, { rarity }));
      else inst.push(makeItem(def.id, it.count));
    }
    this.give(p, inst);
    if (r.xp > 0) this.o.gainXp(p, r.xp);
    return inst.map((i) => ({ itemId: i.defId, count: i.count }));
  }

  private give(p: PlayerState, items: ItemInstance[]): void {
    let fell = 0, lost = 0;
    for (const it of items) {
      const left = this.o.inventory.addItem(p, it);
      if (left <= 0) continue;
      // uid novo: a parte que coube pode estar na mochila com o uid original (addItem com pilha maior que maxStack).
      const rest = { ...it, uid: newUid(), count: left, bonuses: it.bonuses.map((b) => ({ ...b })) };
      if (this.o.placeLoot?.(p, rest)) fell++; else lost++;
    }
    if (fell) this.notice(p.id, `Mochila cheia: ${fell === 1 ? "1 item caiu" : `${fell} itens caíram`} no chão.`, "warn");
    if (lost) this.notice(p.id, `Mochila cheia: ${lost === 1 ? "1 item perdido" : `${lost} itens perdidos`}.`, "warn");
  }

  // --- recompensas diárias ---------------------------------------------------------------------------

  /** Troca de dia: novas recompensas (faixa de level travada no dia). true = mudou. */
  private ensureDay(p: PlayerState, e: Entry): boolean {
    const day = bountyDay(this.now());
    if (e.bounty?.day === day) return false;
    const band = bountyBand(p.level);
    const defs = generateBounties(day, band);
    e.bounty = { day, band, defs, s: defs.map(() => ({ st: "open", n: 0 })) };
    return true;
  }

  private bountyAt(p: PlayerState, e: Entry, index: unknown): { d: BountyDef; x: { st: BountyStatus; n: number } } | null {
    if (this.o.npcOpen(p.id) !== BOUNTY_NPC) return null;
    if (this.ensureDay(p, e)) { this.dirty.add(p.id); return null; } // virou o dia com a janela aberta: lista nova
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= BOUNTIES_PER_DAY) return null;
    const d = e.bounty?.defs[index as number];
    const x = e.bounty?.s[index as number];
    return d && x ? { d, x } : null;
  }

  private bountyAccept(p: PlayerState, e: Entry, index: unknown): void {
    const b = this.bountyAt(p, e, index);
    if (!b || b.x.st !== "open") return;
    b.x.st = "active";
    this.dirty.add(p.id);
    this.notice(p.id, `Recompensa aceita: ${bountyTitle(b.d)}`, "good");
  }

  private bountyTurnIn(p: PlayerState, e: Entry, index: unknown): void {
    const b = this.bountyAt(p, e, index);
    if (!b || b.x.st !== "active") return;
    if (b.x.n < b.d.count) { this.notice(p.id, "Essa recompensa ainda não foi cumprida.", "warn"); return; }
    b.x.st = "done";
    this.dirty.add(p.id);
    // A XP da diária é "a XP dos próprios abates", então segue o mesmo estágio de XP da caça (#51): sem isto, no lv 100
    // três diárias davam ~6 levels por dia contra ~1 h por level caçando. Missões da cadeia continuam cheias.
    const xp = applyXpStage(b.d.xp, p.level);
    const items = this.grant(p, { xp, gold: b.d.gold }, [makeItem(BOUNTY_CHEST_ID, 1)]);
    this.o.onComplete?.(p.id, b.d.monster, true);
    this.o.send(p.id, S2C.QuestComplete, { name: bountyTitle(b.d), xp, gold: b.d.gold, items, bounty: true } satisfies QuestCompleteMsg);
  }

  // --- Baú de Recompensa ------------------------------------------------------------------------------

  /** Abre um baú (o item já foi consumido pelo inventário). */
  openChest(p: PlayerState): void {
    const roll = rollChest(p.level, p.vocation, this.rng);
    if (roll.gold > 0) this.o.inventory.addGold(p, roll.gold);
    this.give(p, roll.items);
    this.o.send(p.id, S2C.Loot, { x: p.x, y: p.y, monsterName: "Baú de Recompensa", items: roll.items, gold: roll.gold } satisfies LootMsg);
  }

  // --- Baús de quest do mapa (estilo Tibia) ------------------------------------------------------------

  /** Missão concluída? (portas de missão) */
  isDone(id: string, questId: string): boolean { return !!this.st.get(id)?.done.has(questId); }

  /** Grupo de baús já aberto por este personagem? */
  chestDone(id: string, group: string): boolean { return !!this.st.get(id)?.chests.has(group); }

  /** Abate registrado de um chefe que destranca baú (covis)? */
  bossSlain(id: string, bossId: string): boolean { return !!this.st.get(id)?.slain.has(bossId); }

  /**
   * Abre um baú de quest (alcance e level já conferidos por quem chama). Grupo já aberto → "vazio". Grupo com trava
   * (`needBoss`, covis): só abre com o abate do chefe registrado neste personagem (`slain`); a prova na mochila não conta.
   * Equipamentos saem raros. true = recompensa entregue.
   */
  claimChest(p: PlayerState, chest: QuestChestDef): boolean {
    const e = this.st.get(p.id);
    const group = questChestGroup(chest.group);
    if (!e || !group) return false;
    if (e.chests.has(group.id)) { this.notice(p.id, "O baú está vazio.", "info"); return false; }
    const locked = chestLockReason(group, (boss) => e.slain.has(boss));
    if (locked) { this.notice(p.id, locked, "warn"); return false; }
    e.chests.add(group.id);
    this.dirty.add(p.id);
    const items = this.grant(p, { xp: 0, gold: chest.gold ?? 0, items: chest.items }, [], "rare");
    if (chest.unlock) this.o.onUnlock?.(p.id, chest.unlock);
    this.o.onComplete?.(p.id, `chest:${group.id}`, false);
    const names = items.map((i) => `${i.count > 1 ? `${i.count}x ` : ""}${this.o.inventory.defs(i.itemId)?.name ?? i.itemId}`);
    if (chest.gold) names.push(`${chest.gold} de ouro`);
    this.notice(p.id, `Você encontrou: ${names.join(", ")}.`, "good");
    this.o.send(p.id, S2C.QuestComplete, { name: group.name, xp: 0, gold: chest.gold ?? 0, items } satisfies QuestCompleteMsg);
    this.o.broadcast?.(S2C.Feed, { text: `🗝️ ${p.name} concluiu a quest "${group.name}"!`, kind: "info" } satisfies FeedMsg);
    return true;
  }

  // --- comandos de dev ----------------------------------------------------------------------------------

  /** /quest reset <id|all|bounties> · /quest complete <id> · /quest list */
  devCommand(p: PlayerState, args: string[]): string {
    const e = this.st.get(p.id);
    if (!e) return "Sem estado de missões.";
    const [sub, id = ""] = args;
    if (sub === "list") return this.list.map((d) => `${d.id}${e.done.has(d.id) ? " ✓" : e.active.has(d.id) ? " …" : ""}`).join(", ");
    if (sub === "reset") {
      if (id === "bounties") { e.bounty = null; this.ensureDay(p, e); this.dirty.add(p.id); return "Recompensas diárias reiniciadas."; }
      if (id === "chests") { e.chests.clear(); this.dirty.add(p.id); return "Baús de quest reiniciados."; }
      if (id === "all") { e.active.clear(); e.done.clear(); e.tracked = []; this.dirty.add(p.id); return "Todas as missões reiniciadas."; }
      const d = this.def(id);
      if (!d) return `Missão desconhecida: ${id || "?"}`;
      e.active.delete(d.id); e.done.delete(d.id); e.tracked = e.tracked.filter((x) => x !== d.id);
      this.dirty.add(p.id);
      return `Missão reiniciada: ${d.name}.`;
    }
    if (sub === "complete") {
      const d = this.def(id);
      if (!d) return `Missão desconhecida: ${id || "?"}`;
      if (e.done.has(d.id)) return `${d.name} já foi concluída.`;
      e.active.set(d.id, d.steps.map((s) => s.count));
      this.turnIn(p, e, d.id, true);
      return `Missão concluída: ${d.name}.`;
    }
    return "Uso: /quest list · /quest reset <id|all|bounties|chests> · /quest complete <id>";
  }

  private notice(id: string, text: string, kind: NoticeMsg["kind"]): void {
    this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg);
  }
}

// ---------------------------------------------------------------------------
// Sorteio do baú
// ---------------------------------------------------------------------------

export const CHEST_POTION_CHANCE = 0.65;
export const CHEST_FOOD_CHANCE = 0.5;
export const CHEST_GEAR_CHANCE = 0.15;
/**
 * Equipamento do baú: level entre (L − GEAR_SPAN) e L. Acima do último tier (lv 70 + span) a janela desce até o tier mais
 * alto que o personagem pode usar, senão o baú ficava sem equipamento.
 */
export const CHEST_GEAR_SPAN = 12;

const MAGES: Vocation[] = ["sorcerer", "druid"];

export function chestPotion(level: number, mana: boolean): string {
  const tier = level >= 30 ? "_large" : level >= 15 ? "_medium" : "";
  return (mana ? "mana_potion" : "health_potion") + tier;
}

let chestEligibleIds: Set<string> | null = null;

/**
 * Equipáveis que o baú pode dar: os que se conseguem sem chefe nem missão (vendidos por algum NPC ou derrubados por
 * monstro comum). Ficam fora os prêmios só de missão, os itens só dos baús de quest do mapa e os únicos de chefe.
 * Antes o filtro era valor ≤ 15 mil, o que zerava o baú a partir do lv ~58 (tiers 6 e 7 valem mais que isso).
 * Ciclo 16: também os itens únicos e o tier 8 (`isExclusiveItem`), que caem do Tengu e do Samurai Rubros.
 */
export function chestEligible(id: string): boolean {
  if (!chestEligibleIds) {
    const sold = new Set(Object.values(NPCS).flatMap((n) => (n.shop?.sells ?? []).map((s) => s.itemId)));
    const mob = new Set(Object.values(MONSTERS).filter((m) => !m.boss).flatMap((m) => (m.loot ?? []).map((l) => l.itemId)));
    chestEligibleIds = new Set([...sold, ...mob].filter((i) => { const d = ITEMS[i]; return !d || !isExclusiveItem(d); }));
  }
  return chestEligibleIds.has(id);
}

/** Equipáveis que o personagem poderia usar, de level (L − span) a L (ou do tier mais alto que alcança a L). */
export function chestGearPool(level: number, vocation: Vocation, items: ItemDef[] = Object.values(ITEMS)): ItemDef[] {
  const usable = items.filter((d) => isEquipable(d) && chestEligible(d.id) && (d.level ?? 1) <= level
    && (!d.vocations || d.vocations.includes(vocation)));
  if (!usable.length) return [];
  // O piso desce até o tier mais alto de ARMA/ARMADURA alcançado: medido por todos os itens, um anel ou amuleto de
  // level alto (Anel do Gelo Eterno, lv 68) subia o piso e o baú do lv 63–69 só dava acessório.
  const core = usable.filter((d) => d.slot === "weapon" || d.slot === "armor");
  const top = Math.max(...(core.length ? core : usable).map((d) => d.level ?? 1));
  const floor = Math.min(Math.max(1, level - CHEST_GEAR_SPAN), top);
  return usable.filter((d) => (d.level ?? 1) >= floor);
}

/** Baú sem equipamento possível para o personagem: uma gema da faixa no lugar. */
export function chestFallbackGem(level: number): string {
  return level >= 60 ? "gem_purple" : level >= 35 ? "gem_yellow" : "gem_green";
}

/** Raridade do equipamento do baú: no mínimo incomum. */
export function chestRarity(rng: () => number): Rarity {
  const r = rollRarity(rng);
  return RARITIES.indexOf(r) < 1 ? "uncommon" : r;
}

export function rollChest(level: number, vocation: Vocation, rng: () => number): { gold: number; items: ItemInstance[] } {
  const L = Math.max(1, level);
  const gold = Math.round(rollInt(15, 40, rng) * (1 + L / 5));
  const items: ItemInstance[] = [];
  if (rng() < CHEST_POTION_CHANCE) {
    const mana = rng() < (MAGES.includes(vocation) ? 0.6 : 0.3);
    items.push(makeItem(chestPotion(L, mana), rollInt(2, 5, rng)));
  }
  if (rng() < CHEST_FOOD_CHANCE) {
    const foods = Object.values(ITEMS).filter((d) => d.kind === "food" && (d.level ?? 1) <= L);
    if (foods.length) items.push(makeItem(foods[Math.floor(rng() * foods.length)]!.id, rollInt(2, 4, rng)));
  }
  if (rng() < CHEST_GEAR_CHANCE) {
    const pool = chestGearPool(L, vocation);
    if (pool.length) {
      const d = pool[Math.floor(rng() * pool.length)]!;
      items.push(createItem(d, 1, rng, { rarity: chestRarity(rng) }));
    } else items.push(makeItem(chestFallbackGem(L), 1));
  }
  return { gold, items };
}
