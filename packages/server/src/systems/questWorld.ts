// Quests de mundo no estilo Tibia (dados em shared/data/questWorld.ts):
// - Baús de quest: clicar ao lado → confere alcance e level → QuestSystem.claimChest (uma vez por grupo e personagem).
//   A trava dos covis (`needBoss`: abate do chefe registrado no personagem) é conferida lá, depois do "vazio".
// - Alavanca de grupo (Aniquilação): com jogadores em pelo menos `minPlayers` placas (todos com o level mínimo, e quem puxa
//   também numa placa) e a sala vazia, puxar a alavanca solta os monstros na sala (quantidade pelo tamanho do grupo, `leverMonsters`) e leva os
//   jogadores aos destinos das suas placas. Monstros da sala somem se ela ficar vazia.
//   Cada personagem entra 1× por dia de jogo (troca às 6h, o mesmo relógio das recompensas diárias): sem isso a sala
//   virava fazenda de demônios sob demanda.
import {
  QUEST_OBJECT_RANGE, S2C, leverMonsters, monsterDef, questChestDef, questChestGroup, questLeverDef,
  type FeedMsg, type NoticeMsg, type QuestChestDef, type QuestLeverSpot, type QuestObjectSpot, type UseQuestObjectMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { bountyDay } from "./bounties.ts";
import type { Monster, MonsterManager } from "./monsters.ts";
import { cheb } from "./monsters.ts";

/** Sala de alavanca sem nenhum jogador por este tempo → os monstros que sobraram somem. */
export const LEVER_ROOM_EMPTY_MS = 30_000;

export interface QuestWorldOptions {
  objects: QuestObjectSpot[];
  levers: QuestLeverSpot[];
  quests: { claimChest(p: PlayerState, chest: QuestChestDef): boolean };
  monsters: Pick<MonsterManager, "spawnQuest" | "despawn" | "get">;
  players: () => Iterable<PlayerState>;
  /** Teleporta e avisa o cliente (S2C.Teleported). */
  teleport: (p: PlayerState, x: number, y: number) => void;
  send: (sessionId: string, type: string, msg: unknown) => void;
  broadcast?: (type: string, msg: unknown) => void;
  now?: () => number;
  /**
   * Dia de jogo (`bountyDay`) da última entrada do personagem pela alavanca, persistido em `CharacterData.leverDay`.
   * Ausente = guarda só em memória (testes); a regra de 1 entrada por dia vale do mesmo jeito.
   */
  getLeverDay?: (id: string) => string | undefined;
  setLeverDay?: (id: string, day: string) => void;
}

interface LeverRun { monsterIds: string[]; emptySince: number }

export class QuestWorldSystem {
  private readonly runs = new Map<string, LeverRun>();
  private readonly now: () => number;
  private readonly leverDays = new Map<string, string>();
  private readonly getLeverDay: (id: string) => string | undefined;
  private readonly setLeverDay: (id: string, day: string) => void;

  constructor(private readonly o: QuestWorldOptions) {
    this.now = o.now ?? Date.now;
    this.getLeverDay = o.getLeverDay ?? ((id) => this.leverDays.get(id));
    this.setLeverDay = o.setLeverDay ?? ((id, day) => { this.leverDays.set(id, day); });
  }

  /** Tiles de baús/alavancas (bloqueados; a IA e o drop de itens não usam). */
  isObjectTile(x: number, y: number): boolean {
    return this.o.objects.some((s) => s.x === x && s.y === y);
  }

  onUse(p: PlayerState, msg: UseQuestObjectMsg): void {
    if (!msg || typeof msg !== "object" || p.hp <= 0) return;
    const kind = msg.kind === "lever" ? "lever" : msg.kind === "chest" ? "chest" : null;
    const spot = kind && this.o.objects.find((s) => s.kind === kind && s.id === String(msg.id));
    if (!spot) return;
    if (cheb(p.x, p.y, spot.x, spot.y) > QUEST_OBJECT_RANGE) return this.notice(p, "Chegue mais perto.", "warn");
    if (spot.kind === "chest") return this.openChest(p, spot.id);
    this.pullLever(p, spot.id);
  }

  private openChest(p: PlayerState, id: string): void {
    const def = questChestDef(id);
    const group = def && questChestGroup(def.group);
    if (!def || !group) return;
    if (p.level < group.minLevel) return this.notice(p, `Você precisa ser level ${group.minLevel} para abrir este baú.`, "warn");
    this.o.quests.claimChest(p, def);
  }

  private inRoom(r: QuestLeverSpot["room"], x: number, y: number): boolean {
    return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  }

  private pullLever(p: PlayerState, id: string): void {
    const def = questLeverDef(id);
    const spot = this.o.levers.find((l) => l.id === id);
    if (!def || !spot) return;
    const players = [...this.o.players()].filter((q) => q.hp > 0);
    if (players.some((q) => this.inRoom(spot.room, q.x, q.y))) return this.notice(p, "Já há um grupo lá dentro. Espere eles saírem.", "warn");
    // Cada um vai para o destino da SUA placa (placas vazias ficam sem ninguém).
    const onPlates = spot.plates.map((t, i) => ({ q: players.find((q) => q.x === t.x && q.y === t.y), dest: spot.dests[i]! }))
      .filter((e): e is { q: PlayerState; dest: { x: number; y: number } } => !!e.q);
    const max = Math.min(def.players, spot.plates.length);
    if (onPlates.length < def.minPlayers || onPlates.length > max) {
      return this.notice(p, `A alavanca não se mexe: de ${def.minPlayers} a ${max} aventureiros, um em cada placa.`, "warn");
    }
    const group = onPlates.map((e) => e.q);
    // Quem puxa está no grupo (na placa ao lado da alavanca): ninguém é levado para a sala sem querer.
    if (!group.includes(p)) return this.notice(p, "Suba numa placa para puxar a alavanca.", "warn");
    const weak = group.find((q) => q.level < def.minLevel);
    if (weak) return this.notice(p, `A alavanca não se mexe: todos precisam ser level ${def.minLevel} ou mais (${weak.name} não é).`, "warn");
    const now = this.now();
    const today = bountyDay(now);
    const been = group.filter((q) => this.getLeverDay(q.id) === today).map((q) => q.name);
    if (been.length) {
      const who = been.length === 1 ? `${been[0]} já entrou` : `${been.slice(0, -1).join(", ")} e ${been.at(-1)} já entraram`;
      return this.notice(p, `A alavanca não se mexe: ${who} em "${def.name}" hoje. Cada aventureiro entra uma vez por dia; a alavanca volta às 6h.`, "warn");
    }
    // Sobras de uma tentativa anterior somem; monstros novos nascem nas posições do mapa.
    this.clear(id);
    const ids: string[] = [];
    leverMonsters(def, group.length).forEach((mid, i) => {
      const md = monsterDef(mid), at = spot.spawns[i % Math.max(1, spot.spawns.length)];
      if (!md || !at) return;
      const m = this.o.monsters.spawnQuest(md, at.x, at.y, { leverId: id, bounds: spot.room }, now);
      if (m) ids.push(m.s.id);
    });
    this.runs.set(id, { monsterIds: ids, emptySince: 0 });
    for (const q of group) this.setLeverDay(q.id, today);
    for (const e of onPlates) this.o.teleport(e.q, e.dest.x, e.dest.y);
    for (const q of group) this.notice(q, `${def.name} começou! Derrote os demônios e alcance o tesouro.`, "warn");
    this.o.broadcast?.(S2C.Feed, { text: `⚔️ ${group.map((q) => q.name).join(", ")} puxaram a alavanca de "${def.name}"!`, kind: "info" } satisfies FeedMsg);
  }

  /** Remove os monstros que sobraram na sala da alavanca. */
  private clear(id: string): void {
    const run = this.runs.get(id);
    if (!run) return;
    for (const mid of run.monsterIds) { const m: Monster | undefined = this.o.monsters.get(mid); if (m) this.o.monsters.despawn(m); }
    this.runs.delete(id);
  }

  /** Sala vazia por LEVER_ROOM_EMPTY_MS → limpa; todos os monstros mortos → esquece a tentativa. */
  tick(now = this.now()): void {
    for (const [id, run] of this.runs) {
      const spot = this.o.levers.find((l) => l.id === id);
      if (!spot) { this.runs.delete(id); continue; }
      run.monsterIds = run.monsterIds.filter((mid) => this.o.monsters.get(mid));
      if (!run.monsterIds.length) { this.runs.delete(id); continue; }
      const occupied = [...this.o.players()].some((q) => q.hp > 0 && this.inRoom(spot.room, q.x, q.y));
      if (occupied) { run.emptySince = 0; continue; }
      if (!run.emptySince) run.emptySince = now;
      else if (now - run.emptySince >= LEVER_ROOM_EMPTY_MS) this.clear(id);
    }
  }

  /** Monstros vivos da alavanca (testes e /status). */
  alive(id: string): number { return this.runs.get(id)?.monsterIds.filter((mid) => this.o.monsters.get(mid)).length ?? 0; }

  private notice(p: PlayerState, text: string, kind: NoticeMsg["kind"]): void {
    this.o.send(p.id, S2C.Notice, { text, kind } satisfies NoticeMsg);
  }
}
