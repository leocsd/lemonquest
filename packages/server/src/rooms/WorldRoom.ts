import { e2eMode } from "../e2e.ts";
import { CloseCode, ErrorCode, Room, ServerError, type Client, type Deferred, type RoomException, type RoomMethodName } from "@colyseus/core";
import {
  C2S, CLOSE_KICKED, CYCLE_START_MS, attackSkillOf, WEEKLY_EVENTS, WaterGrid, type ChallengeActionMsg, type FishMsg, type TradeMsg, wrapCycle, CLOSE_REPLACED, CLOSE_TRAINING, S2C, SKILLS, TICK_MS, baseStats,
  type ArenaActionMsg, type AttackMsg, type CastMsg, type ChatSendMsg, type DiscardItemMsg, type ItemInstance, type DropItemMsg, type FeedMsg, type FightModeMsg, type FollowMsg, type JoinOptions,
  type MoveItemMsg, type MoveMsg, type NoticeMsg, type PartyActionMsg, type NpcInteractMsg, type NpcTradeMsg, type PickupItemMsg, type QuickPotionMsg, type SetOutfitMsg, type SetTitleMsg, type TurnMsg,
  type TrainingResultMsg, type TrainOfflineMsg, type TrainOpenMsg, type UseItemMsg, type WalkToMsg,
  type QuestActionMsg, type UseQuestObjectMsg, doorBlockReason, findObjects, findQuestLevers, findQuestObjects, questDef,
  PARTY_SHARE_RANGE, RED_SKULL_DEATH_XP_MULT, RED_SKULL_GOLD_DROP, type TravelMsg, sanitizeHotkeys, sanitizeSpellGroups, backpackCapacity, type LookGroundMsg, type MoveGroundItemMsg, type HotkeysMsg, type SetHotkeysMsg, type Vocation, zoneAt, HOTKEYS_VERSION, defaultHotkeys,
  npcDef, objectTile, type WorkLinkMsg, OUTFIT_TONE_PRICE, toneDef, type BuyOutfitToneMsg, type OutfitTonesMsg, type MaterialRequestActionMsg, type RefineMsg, type SortContainerMsg, type ExcursionActionMsg, type SocialActionMsg, buildWorldIndex, excursionDestinations, type WorldIndex,
} from "@lemonquest/shared";
import { PlayerState, WorldState } from "../state.ts";
import { loadMap, type LoadedMap } from "../world/map.ts";
import { MovementSystem } from "../systems/movement.ts";
import { ExplorationSystem } from "../systems/exploration.ts";
import { PortalSystem } from "../systems/portals.ts";
import { MonsterManager, parseSafeZones, parseSpawns } from "../systems/monsters.ts";
import { CombatSystem, attackProfile, playerArmor } from "../systems/combat.ts";
import { RegenSystem } from "../systems/regen.ts";
import { handleChat, clearChatState, type ChatHooks } from "../systems/chat.ts";
import { SocialSystem } from "../systems/social.ts";
import { statusLines } from "../systems/status.ts";
import { TradeSystem } from "../systems/trade.ts";
import { EventSystem } from "../systems/events.ts";
import { ClickUpSystem } from "../systems/clickup.ts";
import { rollWeek } from "../systems/weekly.ts";
import { grantLoginBonus } from "../systems/loginBonus.ts";
import { ChallengeSystem } from "../systems/challenges.ts";
import { MaterialRequestSystem } from "../systems/materialRequest.ts";
import { RefineSystem } from "../systems/refine.ts";
import { ExcursionSystem } from "../systems/excursions.ts";
import { InvasionSystem, parseInvasion } from "../systems/invasion.ts";
import { FishingSystem } from "../systems/fishing.ts";
import { FoodSystem } from "../systems/food.ts";
import { ImbuementSystem } from "../systems/imbuement.ts";
import { isFirstLogin, welcomeFeed } from "../systems/welcome.ts";
import { ConditionSystem } from "../systems/conditions.ts";
import { SkillSystem } from "../systems/skills.ts";
import { TrainingSystem, parseStatues } from "../systems/training.ts";
import { SummonSystem } from "../systems/summons.ts";
import { SpellSystem } from "../systems/spells.ts";
import { GOLD_ID, InventorySystem, makeItem } from "../systems/inventory.ts";
import { PvpSystem, pzLockSeconds } from "../systems/pvp.ts";
import { MonsterAbilitySystem } from "../systems/monsterAbilities.ts";
import { LootSystem } from "../systems/loot.ts";
import { GroundSystem } from "../systems/ground.ts";
import { NpcSystem, parseNpcs } from "../systems/npcs.ts";
import { ArenaSystem, parseArenas } from "../systems/arena.ts";
import { QuestSystem, type ZoneRect } from "../systems/quests.ts";
import { QuestWorldSystem, leverDayOf, setLeverDayOf } from "../systems/questWorld.ts";
import { killCredit, type Monster } from "../systems/monsters.ts";
import { FightModeSystem, stanceDealt, stanceTaken } from "../systems/fightmode.ts";
import { handleDevCommand, isDevAdmin } from "../systems/devcommands.ts";
import { HELP_COMMANDS, handleAdminCommand, helpLines, muteRemaining } from "../systems/admin.ts";
import { addWorkTasks, grantUnlock } from "../systems/achievements.ts";
import { applySetOutfit, loadOutfit } from "../systems/outfit.ts";
import { AchievementSystem, setActiveAchievements } from "../systems/achievements.ts";
import { PartySystem } from "../systems/party.ts";
import { ErrorLog, runSafe, runSteps } from "../systems/safe.ts";
import { PlayTelemetry, summarizePlay } from "../systems/telemetry.ts";
import { crownWeek, type ChampionHost } from "../systems/weeklyChampion.ts";
import { crownArenaWeek } from "../systems/arenaChampion.ts";
import { claimOnline, consumeToken, createResetCode, releaseOnline, type AuthData } from "../persistence/auth.ts";
import {
  addAccountTone, getAccountTones, getCharacterByName, getKv, listRankingRows, nameKey, loadGroundRows, replaceGroundRows, saveCharacter, setKv, transaction,
} from "../persistence/db.ts";
import { PerSecond } from "../persistence/ratelimit.ts";
import type { CharacterRecord } from "../persistence/types.ts";
import { isValidStart, nearestFreeTile, reachableFrom } from "../world/tiles.ts";

export const AUTOSAVE_MS = 15_000;
/** Intervalo de sincronização do relógio do mundo (ciclo dia/noite). */
export const WORLD_TIME_SYNC_MS = 5_000;
/**
 * Segundos que um jogador que caiu (Wi-Fi) continua no mundo esperando a reconexão automática do SDK.
 * Só no modo E2E dá para encurtar (LEMONQUEST_RECONNECT_S): personagens de testes anteriores somem logo em vez de
 * ficarem 20 s no mundo competindo pelos monstros do teste seguinte. Em produção é sempre 20.
 */
export const RECONNECT_S = e2eMode() && Number(process.env.LEMONQUEST_RECONNECT_S) > 0 ? Number(process.env.LEMONQUEST_RECONNECT_S) : 20;
/** Fechamento da sessão antiga quando o mesmo personagem entra em outro lugar: CLOSE_REPLACED (shared). */
export const REPLACED_REASON = "Sua conta entrou em outro lugar";
/** Motivo padrão do /kick sem motivo (vai no frame de fechamento). */
export const KICK_DEFAULT_REASON = "Expulso por um administrador";
/** Limite global por cliente (Colyseus 0.18: excedeu → desconecta o cliente com WITH_ERROR). */
export const MAX_MESSAGES_PER_SECOND = 60;
/** Limites por tipo de mensagem (excesso descartado em silêncio). */
export const MESSAGE_LIMITS: Partial<Record<string, number>> = {
  [C2S.WalkTo]: 5, [C2S.NpcInteract]: 5, [C2S.Arena]: 5, [C2S.Cast]: 10, [C2S.MoveItem]: 20, [C2S.TrainOpen]: 5, [C2S.TrainOffline]: 2, [C2S.SetOutfit]: 2, [C2S.BuyOutfitTone]: 2, [C2S.SetTitle]: 2, [C2S.AchievementsRequest]: 2, [C2S.Party]: 5, [C2S.Quest]: 10, [C2S.Trade]: 10, [C2S.Fish]: 3, [C2S.Challenge]: 5, [C2S.MaterialRequest]: 5, [C2S.Follow]: 5, [C2S.Travel]: 2, [C2S.UseQuestObject]: 4, [C2S.SetHotkeys]: 5, [C2S.LookGround]: 5, [C2S.Refine]: 4, [C2S.AgendaRequest]: 2, [C2S.SortContainer]: 1, [C2S.Excursion]: 3, [C2S.Social]: 3,
  // Chat inclui comandos (/convidar...) e palavras mágicas, que não passam pelo limite de fala do chat.ts.
  [C2S.Chat]: 6,
  // Ações de inventário/loja: cada uma é validada, mas gera mensagem de inventário e gravação; sem limite próprio só
  // valia o teto global (60/s). MoveGroundItem já era limitado por dentro (GroundSystem, 10/s); aqui fica explícito (#48).
  [C2S.NpcTrade]: 10, [C2S.UseItem]: 10, [C2S.QuickPotion]: 5, [C2S.DropItem]: 5, [C2S.PickupItem]: 5, [C2S.DiscardItem]: 5,
  [C2S.MoveGroundItem]: 10, [C2S.FightMode]: 5,
  // Vínculo do ClickUp: cada pedido é uma ida ao ClickUp (e há limite próprio de tentativas no ClickUpSystem).
  [C2S.WorkLink]: 1, [C2S.WorkUnlink]: 1,
};
/** Intervalo mínimo entre gravações "jogador + chão" depois de largar/pegar item (ver saveTransfers). */
export const TRANSFER_SAVE_MS = 1000;
const DEV = process.env.NODE_ENV !== "production";
/** Log de desempenho do tick: dev = a cada 60 s; produção = a cada 5 min e só se algum tick passou de 30 ms. */
const PERF_LOG_MS = DEV ? 60_000 : 5 * 60_000;
const PERF_PROD_MIN_MAX_MS = 30;
/** Level a partir do qual o level up entra no feed global. */
const FEED_LEVEL_MIN = 10;

/** A instância única do mundo (criada no boot). Uma segunda instância é recusada no onCreate. */
let liveWorld: WorldRoom | null = null;
export const currentWorld = (): WorldRoom | null => liveWorld;

export class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = 32;
  autoDispose = false;
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  state = new WorldState();

  private map!: LoadedMap;
  private movement!: MovementSystem;
  private exploration!: ExplorationSystem;
  private portals!: PortalSystem;
  private monsters!: MonsterManager;
  private combat!: CombatSystem;
  private regen!: RegenSystem;
  private conditions!: ConditionSystem;
  private food!: FoodSystem;
  private imbue!: ImbuementSystem;
  private skills!: SkillSystem;
  private summons!: SummonSystem;
  private spells!: SpellSystem;
  private monsterAbilities!: MonsterAbilitySystem;
  private inventory!: InventorySystem;
  private loot!: LootSystem;
  private ground!: GroundSystem;
  private npcs!: NpcSystem;
  private fight!: FightModeSystem;
  private pvp!: PvpSystem;
  private arena!: ArenaSystem;
  private training!: TrainingSystem;
  private quests!: QuestSystem;
  private questWorld!: QuestWorldSystem;
  private ach!: AchievementSystem;
  private party!: PartySystem;
  private social!: SocialSystem;
  private excursions!: ExcursionSystem;
  /** Índice do mundo (ciclo 17): zonas, spawns, portais; montado uma vez (~15 ms) e usado por mural e invasão. */
  private worldIndex!: WorldIndex;
  private trade!: TradeSystem;
  private events!: EventSystem;
  private invasion!: InvasionSystem;
  private clickup!: ClickUpSystem;
  private fishing!: FishingSystem;
  private weeklyAt = 0;
  private challenges!: ChallengeSystem;
  private materialRequest!: MaterialRequestSystem;
  private refine!: RefineSystem;
  private perf = { n: 0, sum: 0, max: 0, since: Date.now() };
  /** Duração do autosave (todos os jogadores) desde o último log de desempenho. */
  private savePerf = { n: 0, sum: 0, max: 0 };
  /** Tempo jogado, mortes e ouro por level (gravado em CharacterData.play; resumo no /status). */
  private readonly telemetry = new PlayTelemetry();
  /** Últimos ~30 s de ticks (para o /status) e contadores desde o boot. */
  private readonly tickRing = new Float32Array(600);
  private tickRingN = 0;
  private readonly bootAt = Date.now();
  private peakOnline = 0;
  private joins = 0;
  private records = new Map<string, CharacterRecord>(); // sessionId -> registro
  /** sessionId -> nome (dono do "online"), gravado logo no início do onJoin. */
  private names = new Map<string, string>();
  /** Reconexões pendentes (onDrop), para cancelar se o personagem entrar de novo por outro lugar. */
  private reconnecting = new Map<string, Deferred<Client>>();
  /**
   * Saiu de propósito (room.leave) logo depois de lutar: o personagem fica no mundo RECONNECT_S segundos, como numa queda
   * de conexão (pode morrer). Sem isso um cliente modificado escapava da morte saindo no último instante.
   */
  private lingering = new Map<string, { clear(): void; tick?(dt: number): void }>();
  /** Sessões derrubadas por /kick (o onLeave que vem depois não as deixa no mundo). */
  private kicked = new Set<string>();
  private throttle = new PerSecond();
  readonly errors = new ErrorLog();
  private reachable!: Uint8Array;
  /** Ganchos do chat (magias, comandos de admin/dev, mute) — públicos para os testes. */
  chatHooks: ChatHooks = {};
  private steps: ReadonlyArray<readonly [string, () => void]> = [];
  private tickNow = 0;
  private shuttingDown = false;
  /** Ataque automático desligado enquanto o jogador está fora do teclado (queda/permanência): id → preferência salva. */
  private readonly autoPaused = new Map<string, boolean>();
  /** Jogadores que largaram/pegaram item do chão neste tick (ver saveTransfers). */
  private readonly transferred = new Set<string>();
  private lastTransferSave = 0;
  /** Salvamento de um registro (trocável nos testes para simular falha). */
  persist: (rec: CharacterRecord) => void = saveCharacter;

  /**
   * Autenticação ANTES da reserva de vaga/criação de sala: no 0.18 o matchmaker chama o onAuth ESTÁTICO em
   * joinOrCreate/join/create/joinById e entrega o retorno ao onJoin como `auth` (client.auth).
   * Token: options.token (o cliente manda nas opções) ou o header Authorization.
   */
  static async onAuth(token: string, options: JoinOptions | undefined): Promise<AuthData> {
    const t = typeof options?.token === "string" && options.token ? options.token : token;
    try {
      return consumeToken(String(t ?? ""));
    } catch (e) {
      throw new ServerError(ErrorCode.AUTH_FAILED, (e as Error).message);
    }
  }

  onCreate() {
    if (liveWorld && liveWorld !== this) {
      // joinOrCreate só tenta criar com o mundo cheio (sala travada em maxClients): nunca abre um 2º shard.
      throw new ServerError(ErrorCode.MATCHMAKE_UNHANDLED, "O mundo está cheio.");
    }
    liveWorld = this;
    this.map = loadMap("world");
    this.worldIndex = buildWorldIndex(this.map.tiled);
    this.exploration = new ExplorationSystem(this.map.tiled.width, this.map.tiled.height);
    this.movement = new MovementSystem(this.map.grid, { spawn: this.map.spawn, groundSpeed: this.map.groundSpeed });
    this.portals = new PortalSystem(
      this.map.tiled, this.movement, (id, msg) => this.clients.getById(id)?.send(S2C.Teleported, msg), Date.now,
      (x, y, self) => this.isFreeTile(x, y, self.id),
      // Portas de quest (level/missão/baú): o estado das missões só existe depois do QuestSystem (criado abaixo).
      (p, req) => doorBlockReason(req, p.level, (q) => this.quests.isDone(p.id, q), (g) => this.quests.chestDone(p.id, g), (q) => questDef(q)?.name ?? q),
      (p, text) => this.clients.getById(p.id)?.send(S2C.Notice, { text, kind: "warn" } satisfies NoticeMsg),
    );
    const send = (id: string, type: string, msg: unknown) => this.clients.getById(id)?.send(type, msg);
    const broadcast = (type: string, msg: unknown) => this.broadcast(type, msg);
    const getPlayer = (id: string) => this.state.players.get(id);

    this.party = new PartySystem({ getPlayer, players: () => this.state.players.values(), send });
    this.monsters = new MonsterManager({
      grid: this.map.grid,
      groundSpeed: this.map.groundSpeed,
      spawns: parseSpawns(this.map.tiled),
      safeZones: parseSafeZones(this.map.tiled),
      isPortalTile: (x, y) => this.portals.isPortalTile(x, y),
      collection: this.state.monsters,
      players: () => this.state.players.values(),
      getPlayer,
      notice: (text, kind) => this.broadcast(S2C.Notice, { text, kind }),
      bossRespawn: {
        load: (id) => Number(getKv(`boss.respawnAt.${id}`) ?? 0) || undefined,
        save: (id, at) => setKv(`boss.respawnAt.${id}`, String(at ?? 0)),
      },
      errors: this.errors,
    });
    this.combat = new CombatSystem({
      monsters: this.monsters,
      players: () => this.state.players.values(),
      getPlayer,
      teleport: (p, x, y) => this.movement.teleport(p, x, y),
      spawn: this.map.spawn,
      send,
      broadcast,
    });
    this.inventory = new InventorySystem({
      send,
      depotOpen: (id) => this.npcs.depotOpen(id),
      heal: (p, n) => this.combat.healPlayer(p, p.id, n),
      restoreMana: (p, n) => this.combat.restoreMana(p, n),
      eat: (p, f, now) => {
        const ok = this.food.eat(p, f, now);
        if (ok) this.ach?.event(p.id, "eat");
        return ok;
      },
      onGold: (p, n) => { this.ach?.event(p.id, "gold", { n }); this.telemetry.onGold(p.id, n); },
      onSpend: (p, n) => this.telemetry.onSpend(p.id, n),
      onStatsChanged: (p) => this.conditions.refreshPlayer(p.id),
      openChest: (p) => this.quests.openChest(p),
    });
    this.food = new FoodSystem({
      heal: (p, n) => this.combat.healPlayer(p, p.id, n),
      restoreMana: (p, n) => this.combat.restoreMana(p, n),
    });
    // Encantamento (ciclo 16): 10 h que só correm em combate contra monstro.
    this.imbue = new ImbuementSystem({ inPveCombat: (id, now) => this.combat.inPveCombat(id, now), send });
    this.npcs = new NpcSystem({
      npcs: parseNpcs(this.map.tiled), inventory: this.inventory, imbue: this.imbue,
      players: () => this.state.players.values(), getPlayer, send, broadcast,
      blocked: (p, npcId) => (this.arena && !this.arena.canUseShop(p, npcId) ? "A loja do Coliseu só atende na pausa depois das ondas de chefe (5, 10, 15...)." : null),
      travel: (p, x, y) => {
        const to = nearestFreeTile(x, y, (tx, ty) => this.isFreeTile(tx, ty, p.id)) || { x, y };
        this.fight.cancelFollow(p);
        p.targetId = "";
        this.movement.teleport(p, to.x, to.y);
        send(p.id, S2C.Teleported, to);
      },
      travelBlocked: (p) => {
        const now = Date.now();
        // Bloqueio de PZ (atacou um jogador): viajar seria fugir do revide.
        const lock = this.pvp.pzLockRemaining(p.id, now);
        if (lock > 0) return `Você atacou um jogador há pouco e não pode viajar ainda (mais ${pzLockSeconds(lock)} s).`;
        return this.combat.inCombat(p.id, now) ? "Você está em combate. Espere um pouco para viajar." : null;
      },
    });
    this.movement.setExtraBlocker((x, y) => this.monsters.isMonsterAt(x, y) || this.npcs.isNpcAt(x, y));
    this.pvp = new PvpSystem({
      inPz: (x, y) => this.monsters.inPz(x, y),
      inArena: (id) => !!this.arena?.inMatch(id),
      sameParty: (a, b) => this.party.sameParty(a, b),
      send,
    });
    this.movement.setStepGuard((p, x, y) => this.pvp.blocksStep(p, x, y));
    // Itens no chão (persistidos no SQLite: sobrevivem a reinícios; o que expirou nesse meio-tempo some).
    this.ground = new GroundSystem({
      store: {
        load: () => loadGroundRows().flatMap((r) => {
          try {
            // owner/ownerUntil: reserva de 15 s do loot de grupo (GroundSystem decide se ainda vale; grupos vivem em memória).
            return [{ x: r.x, y: r.y, item: JSON.parse(r.item) as ItemInstance, expiresAt: r.expiresAt, createdAt: r.createdAt, owner: r.owner ?? undefined, ownerUntil: r.ownerUntil ?? undefined }];
          } catch { return []; }
        }),
        save: (rows) => replaceGroundRows(rows.map((r) => ({
          x: r.x, y: r.y, item: JSON.stringify(r.item), expiresAt: r.expiresAt, createdAt: r.createdAt ?? null, owner: r.owner ?? null, ownerUntil: r.ownerUntil ?? null,
        }))),
      },
      inventory: this.inventory, collection: this.state.groundItems, send,
      partyMembers: (p) => this.party.membersOf(p.id), // linha no chat do grupo quando um membro pega raro+ do loot de grupo
      onDropped: (p) => { this.transferred.add(p.id); this.ach?.event(p.id, "drop"); },
      onPickedUp: (p) => { this.transferred.add(p.id); this.ach?.event(p.id, "pickup"); },
      canHold: (x, y) => this.map.grid.isWalkable(x, y) && !this.npcs.isNpcAt(x, y) && !this.portals.isPortalTile(x, y),
      seeThrough: (x, y) => this.map.grid.isWalkable(x, y),
    });
    console.log(`[world] itens no chão restaurados: ${this.ground.restore()}`);
    // A virada da semana pode ter acontecido com o servidor desligado: coroa (ou revoga) no boot.
    runSafe("weeklyChampion.boot", () => this.crownWeek(new Date()), this.errors);
    this.quests = new QuestSystem({
      inventory: this.inventory, getPlayer, send, broadcast,
      gainXp: (p, n) => this.combat.gainXp(p, n, p.x, p.y),
      npcOpen: (id) => this.npcs.openFor(id),
      zones: parseZones(this.map.tiled),
      placeLoot: (p, it) => this.placeReward(p, it),
      onUnlock: (id, unlockId) => this.onUnlock(id, unlockId),
      // Recompensa do Quadro conta para o desafio semanal "Quadro da semana" (ciclo 18); missão, para as conquistas.
      onComplete: (id, _q, bounty) => this.ach?.event(id, bounty ? "bounty" : "quest"),
    });
    this.questWorld = new QuestWorldSystem({
      objects: findQuestObjects(this.map.tiled), levers: findQuestLevers(this.map.tiled),
      quests: this.quests, monsters: this.monsters, players: () => this.state.players.values(),
      teleport: (p, x, y) => {
        const to = nearestFreeTile(x, y, (tx, ty) => this.isFreeTile(tx, ty, p.id)) || { x, y };
        this.fight.cancelFollow(p);
        this.movement.teleport(p, to.x, to.y);
        send(p.id, S2C.Teleported, to);
      },
      // Entrada da Aniquilação 1×/dia: vai junto com o personagem (autosave), como o recorde do Coliseu.
      // Um dia por alavanca (ciclo 20): o Crash Test não gasta a entrada do dia na Aniquilação.
      getLeverDay: (id, leverId) => leverDayOf(this.records.get(id)?.data, leverId),
      setLeverDay: (id, day, leverId) => { const rec = this.records.get(id); if (rec) setLeverDayOf(rec.data, leverId, day); },
      send, broadcast,
    });
    this.loot = new LootSystem({
      inventory: this.inventory, getPlayer, send, broadcast, ground: this.ground, lootMult: () => this.events?.lootMult() ?? 1,
      partyIdOf: (p, m) => this.partyLootId(p, m.s.x, m.s.y),
      // Ouro e comuns do abate em grupo divididos entre quem participou (mesma regra da XP compartilhada); raro+ vai ao chão.
      lootSharers: (p, m) => this.party.lootSharers(p.id, m.damageBy, m.s.x, m.s.y).filter((s) => !this.lingering.has(s.id)),
    });
    this.regen = new RegenSystem({
      inCombat: (id, now) => this.combat.inCombat(id, now),
      inPz: (x, y) => this.monsters.inPz(x, y),
      bonus: (id) => ({ hp: this.inventory.stat(id, "hpRegen"), mana: this.inventory.stat(id, "manaRegen") }),
    });
    this.skills = new SkillSystem(send);
    this.conditions = new ConditionSystem({
      monsters: this.monsters, combat: this.combat, send,
      getPlayer, players: () => this.state.players.values(),
      speedBonus: (id) => this.inventory.stat(id, "speed"),
      extra: (p, now) => [this.food.condition(p.id, now), this.imbue.condition(p.id)],
    });
    this.summons = new SummonSystem({ monsters: this.monsters, combat: this.combat, getPlayer });
    this.spells = new SpellSystem({
      grid: this.map.grid, monsters: this.monsters, combat: this.combat, conditions: this.conditions,
      summons: this.summons, skills: this.skills,
      players: () => this.state.players.values(), getPlayer,
      teleport: (p, x, y) => this.movement.teleport(p, x, y),
      send, broadcast,
      magicBonus: (p) => this.inventory.stat(p.id, "magic"),
      // Potência das magias de cavaleiro/paladino (spellPower): skill da arma + bônus de skill do equipamento.
      weaponSkillBonus: (p) => this.inventory.stat(p.id, attackSkillOf(p.vocation)),
      dealtMult: (p) => this.dealtMult(p),
      // Investida não para em NPC nem em portal (cair num portal teleportava o cavaleiro sem querer).
      isBlocked: (x, y) => this.npcs.isNpcAt(x, y) || this.portals.isPortalTile(x, y),
      isAlly: (a, b) => this.party.sameParty(a.id, b.id),
      areaHitsPlayer: (a, b) => !this.pvp.canAttack(a, b) && (b.id === a.targetId || this.pvp.justified(a, b)),
    });
    this.monsterAbilities = new MonsterAbilitySystem({
      grid: this.map.grid, monsters: this.monsters, combat: this.combat, conditions: this.conditions,
      players: () => this.state.players.values(), broadcast,
    });
    this.training = new TrainingSystem({
      statues: parseStatues(this.map.tiled), skills: this.skills,
      inCombat: (id, now) => this.combat.inCombat(id, now), send,
      isFree: (x, y, selfId) => this.isFreeTile(x, y, selfId),
    });
    this.fight = new FightModeSystem({
      movement: this.movement, monsters: this.monsters,
      attackRange: (p) => this.combat.attackOf(p).range,
      getPlayer, send,
    });
    this.combat.hooks = {
      xpMult: () => this.events?.xpMult() ?? 1,
      damageTakenPct: (id) => this.conditions.damageTakenPct(id),
      manaShield: (id) => this.conditions.manaShield(id),
      onAutoAttack: (p) => {
        if (p.vocation === "knight") this.skills.addTries(p, "melee", 1);
        else if (p.vocation === "paladin") this.skills.addTries(p, "distance", 1);
      },
      hasShield: (p) => !!this.inventory.get(p.id)?.equipment.shield,
      onShieldTry: (p) => this.skills.addTries(p, "shield", 1),
      onPlayerDied: (p, killer, killerKey) => {
        this.telemetry.onDeath(p.id, killerKey);
        this.conditions.clear(p.id);
        this.summons.despawnOwner(p.id);
        this.loot.feed(`💀 ${p.name} foi derrotado por ${killer}`, "death");
        this.ach?.event(p.id, "death");
      },
      armor: (p) => playerArmor(p) + this.inventory.stat(p.id, "armor"),
      attack: (p) => attackProfile(p, this.inventory.weaponDef(p.id), (s) => this.inventory.stat(p.id, s)),
      dealtMult: (p) => this.dealtMult(p),
      // Ruptura Elemental: a condição vive no ConditionSystem (criado depois; só é lido durante o tick).
      exposedPct: (id) => this.conditions?.value(id, "exposed") ?? 0,
      imbuement: (p) => this.imbue.bonus(p.id),
      takenMult: stanceTaken,
      onLevelUp: (p) => {
        this.telemetry.onLevel(p.id, p.level);
        this.inventory.applyStats(p, true);
        const slots = this.inventory.fitBackpack(p);
        if (slots > 0) {
          const total = backpackCapacity(p.level, p.vocation), id = p.id;
          this.combat.later(() => this.clients.getById(id)?.send(S2C.Notice, { text: `Sua mochila cresceu: agora tem ${total} espaços.`, kind: "good" } satisfies NoticeMsg));
        }
        if (p.level >= FEED_LEVEL_MIN) {
          const text = `⭐ ${p.name} chegou ao level ${p.level}!`;
          this.combat.later(() => this.broadcast(S2C.Feed, { text, kind: "level" } satisfies FeedMsg));
        }
      },
      onMonsterKilled: (m) => {
        this.quests.onKill(m.def.id, this.questCredit(m));
        for (const pid of this.partyKillCredit(m)) this.ach?.event(pid, "party_kill");
        this.combat.later(() => this.loot.onKill(m));
      },
      onKillCredit: (pid, m) => {
        this.ach?.event(pid, "kill", { defId: m.def.id, boss: !!m.def.boss });
        this.telemetry.onKill(pid);
      },
      onXp: (p, n) => this.telemetry.onXp(p.id, n),
      onDealt: (pid, dealt, resisted, m) => { this.telemetry.onDamage(pid, dealt, resisted); this.invasion?.onDamage(pid, m, dealt); },
      onHealOther: (healer, target, healed) => this.invasion?.onHealOther(healer, target, healed),
      onPlayerDamaged: (p, sourceId, dealt) => this.invasion?.onPlayerDamaged(p, sourceId, dealt),
      interceptDeath: (p) => this.arena.interceptDeath(p),
      canAttackPlayer: (a, b) => this.pvp.canAttack(a, b),
      onPlayerHit: (a, b, now) => this.pvp.onHit(a, b, now),
      onDying: (p, killer, now) => {
        if (killer) this.pvp.onKill(killer, p, now);
        // A morte devolve a vida na hora (renasce no templo): troca aberta e "seguir" não podem sobreviver a ela
        // (os sistemas não chegam a ver hp ≤ 0). Quem seguia o morto também para.
        this.trade.cancel(p.id, "Troca cancelada.");
        this.fight.cancelFollow(p);
        for (const o of this.state.players.values()) if (o.followId === p.id) this.fight.cancelFollow(o);
        // Caveira vermelha: metade do ouro cai no chão onde morreu (ou ao lado). Só sai da conta se coube no chão, e
        // grava personagem + chão juntos (saveTransfers), como largar um item.
        // Invariante: placeNear ANTES de spendGold. lost = floor(ouro × RED_SKULL_GOLD_DROP) ≤ ouro, e nada roda entre as
        // duas chamadas, então spendGold não falha: o ouro nunca é criado no chão sem sair da conta. (Descontar antes e
        // devolver com addGold contaria como ouro ganho nas conquistas.)
        if (p.skull === "red") {
          const lost = Math.floor(this.inventory.gold(p.id) * RED_SKULL_GOLD_DROP);
          if (lost > 0 && this.ground.placeNear(makeItem(GOLD_ID, lost), p.x, p.y) && this.inventory.spendGold(p, lost)) this.transferred.add(p.id);
        }
        // Morrer tira a caveira branca (a vermelha fica) e tira do grupo.
        this.pvp.onDeath(p, now);
        this.party.leave(p.id);
      },
      deathXpMult: (p) => (p.skull === "red" ? RED_SKULL_DEATH_XP_MULT : 1),
      xpShares: (m, shares, now) => this.party.shareXp(shares, m.s.x, m.s.y, now),
      onActivity: (id, now) => this.party.markActive(id, now),
    };
    this.arena = new ArenaSystem({
      layout: parseArenas(this.map.tiled),
      master: () => this.npcs.spot("arena_master"),
      fallbackExit: this.map.spawn,
      monsters: this.monsters, combat: this.combat,
      players: () => this.state.players.values(), getPlayer,
      teleport: (p, x, y) => this.movement.teleport(p, x, y),
      isFree: (x, y, self) => this.isFreeTile(x, y, self),
      addGold: (p, n) => this.inventory.addGold(p, n),
      loadServerBest: () => Number(getKv("arena.serverBest") ?? 0),
      saveServerBest: (n) => setKv("arena.serverBest", String(n)),
      getKv, setKv,
      getBest: (id) => this.records.get(id)?.data.arenaBest ?? 0,
      setBest: (id, n) => { const rec = this.records.get(id); if (rec) rec.data.arenaBest = n; },
      onWaveCleared: (p, wave) => { this.ach?.event(p.id, "arena", { wave }); this.quests.onArenaWave(p.id, wave); },
      onEnter: (p) => this.npcs.close(p.id),
      onExit: (p) => {
        this.npcs.close(p.id);
        this.summons.despawnOwner(p.id);
        this.conditions.clear(p.id);
      },
      closeNpc: (id) => this.npcs.close(id, "arena_shop_"),
      partyMates: (id) => this.party.membersOf(id).filter((m) => m !== id),
      isPartyLeader: (id) => this.party.partyFor(id)?.leaderId === id,
      send, broadcast,
    });
    this.ach = new AchievementSystem({
      record: (id) => this.records.get(id), getPlayer, players: () => this.state.players.values(), send, broadcast,
      explorePct: (id) => this.exploration.percent(id, this.reachable),
      equippedCount: (id) => this.inventory.equippedCount(id),
    });
    setActiveAchievements(this.ach);
    // Invasão da Vila (ciclo 18): ondas pelo relógio do evento; pontos, placar e prêmios pendentes no kv (sobrevivem a reinício).
    this.invasion = new InvasionSystem({
      layout: parseInvasion(this.map.tiled), monsters: this.monsters,
      players: () => this.state.players.values(), getPlayer, send, broadcast,
      inventory: this.inventory, placeLoot: (p, it) => this.placeReward(p, it),
      onDefended: (p) => this.ach.event(p.id, "invasion"),
      save: (id) => this.save(id),
      store: { get: () => getKv("invasao.v1"), set: (v) => setKv("invasao.v1", v) },
      away: (id) => this.lingering.has(id),
    });
    this.monsters.spawnAll();
    console.log(`[lemonquest] ${this.monsters.size} monstros em ${parseSpawns(this.map.tiled).length} spawns, ${this.npcs.list.length} NPCs`);

    // Alcançabilidade a partir do spawn (inclui portais) — valida a posição salva no onJoin.
    this.reachable = reachableFrom(this.map.grid, this.map.spawn, (x, y) => this.portals.destination(x, y));
    let nReach = 0;
    for (const v of this.reachable) nReach += v;
    console.log(`[lemonquest] ${nReach} tiles alcançáveis a partir do spawn`);

    // Comandos com "/": de ADMIN (LEMONQUEST_ADMINS, também em produção) e de DEV (só com LEMONQUEST_DEV_COMMANDS=1,
    // fora de produção). Quem não pode → "Comando desconhecido." (chat.ts).
    const help = (p: PlayerState, text: string) => {
      if (!(HELP_COMMANDS as readonly string[]).includes(text.trim().split(/\s+/)[0]!.toLowerCase())) return false;
      for (const line of helpLines(p.name)) send(p.id, S2C.Notice, { text: line, kind: "info", log: true } satisfies NoticeMsg);
      return true;
    };
    const water = WaterGrid.fromTiled(this.map.tiled);
    this.fishing = new FishingSystem({
      getPlayer, send, broadcast, isWater: (x, y) => water.isWater(x, y), inventory: this.inventory,
      caught: (id) => this.records.get(id)?.data.ach?.stats?.fish ?? 0,
      onCatch: (p) => this.ach.event(p.id, "fish"),
      inArena: (id) => this.arena.inMatch(id),
      placeLoot: (p, it) => this.placeReward(p, it), // Baú do Pescador com a mochila cheia vai para o chão
    });
    this.challenges = new ChallengeSystem({
      getPlayer, record: (id) => this.records.get(id), send, inventory: this.inventory, placeLoot: (p, it) => this.placeReward(p, it),
      gainXp: (p, n) => this.combat.gainXp(p, n, p.x, p.y), save: (id) => this.save(id),
    });
    // Refino +1..+5 no Mestre Brás (ciclo 16): sem estado próprio, só a ação.
    this.refine = new RefineSystem({ inventory: this.inventory, send, npcOpen: (id) => this.npcs.openFor(id), save: (id) => this.save(id) });
    this.materialRequest = new MaterialRequestSystem({
      record: (id) => this.records.get(id), send, inventory: this.inventory, save: (id) => this.save(id),
      npcOpen: (id) => this.npcs.openFor(id),
    });
    this.events = new EventSystem({ broadcast, send, onStart: (ev) => { if (ev.boss) this.monsters.callBoss(ev.boss); this.invasion.start(ev); }, onEnd: (ev) => this.invasion.end(ev), store: { get: () => getKv("event.manual"), set: (v) => setKv("event.manual", v) }, bonusStore: { get: () => getKv("event.bonus"), set: (v) => setKv("event.bonus", v) } });
    this.clickup = this.createClickUp();
    this.trade = new TradeSystem({
      getPlayer: (id) => this.state.players.get(id), send, inventory: this.inventory,
      // Troca concluída: os dois são gravados JUNTOS (uma transação no saveTransfers do tick), nunca um sem o outro.
      inArena: (id) => this.arena.inMatch(id), save: (id) => this.transferred.add(id),
    });
    // Mesma regra do banner de zona do cliente (a menor zona que contém o tile).
    const socialZones = parseZones(this.map.tiled).map((z) => ({ name: z.name, x: z.x0, y: z.y0, w: z.x1 - z.x0 + 1, h: z.y1 - z.y0 + 1 }));
    this.social = new SocialSystem({
      players: () => this.state.players.values(),
      record: (id) => this.records.get(id),
      send, broadcast,
      exists: (name) => [...this.state.players.values()].find((q) => nameKey(q.name) === nameKey(name))?.name ?? getCharacterByName(name)?.name,
      muted: (pl) => muteRemaining(this.records.get(pl.id)),
      zoneAt: (x, y) => zoneAt(socialZones, x, y),
      away: (id) => this.lingering.has(id),
      inPz: (x, y) => this.monsters.inPz(x, y),
      sameParty: (a, b) => this.party.sameParty(a, b),
    });
    // Mural de Excursões (ciclo 18): só escolhas (destino, faixa, horário, vagas), persistido no kv.
    this.excursions = new ExcursionSystem({
      players: () => this.state.players.values(), send, broadcast,
      npcOpen: (id) => this.npcs.openFor(id),
      destinations: excursionDestinations(this.worldIndex),
      partyMembers: (id) => this.party.membersOf(id),
      invite: (p, id) => this.party.tryInvite(p, id),
      onDeparted: (id) => this.ach.event(id, "excursion"),
      feed: (text) => this.loot.feed(text, "info"),
      getKv, setKv, report: (w, e) => this.errors.report(w, e),
    });
    const command = (p: PlayerState, text: string) => help(p, text) || this.social.command(p, text) || this.party.command(p, text) || handleAdminCommand(p, text, {
      send, broadcast,
      players: () => this.state.players.values(),
      record: (id) => this.records.get(id),
      findOffline: (name) => getCharacterByName(name),
      saveOffline: (rec) => this.persist(rec),
      kick: (id, reason) => this.kick(id, reason),
      teleportNear: (admin, target) => this.teleportNear(admin, target),
      resetCode: (account, by) => createResetCode(account, by),
      devTp: (pl) => isDevAdmin(pl.name),
      status: () => [...this.statusLines(), this.clickup.statusLine()],
      work: { link: (name, uid) => this.clickup.link(name, uid), list: () => this.clickup.linkList() },
      events: {
        ids: () => WEEKLY_EVENTS.map((e) => e.id),
        start: (id, min) => { const a = this.events.start(id, min); return a ? `${a.name} iniciado por ${min} min (XP ×${a.xpMult}, loot ×${a.lootMult}).` : null; },
        stop: () => this.events.stop(),
        status: () => this.events.statusLines(),
      },
      grantUnlock: (rec, id, online) => (online ? this.ach.grantTo(online, rec, id, true) : grantUnlock(rec, id)),
    }) || handleDevCommand(p, text, {
      inventory: this.inventory, send,
      teleport: (pl, x, y) => this.movement.teleport(pl, x, y),
      isWalkable: (x, y) => this.map.grid.isWalkable(x, y) && !this.npcs.isNpcAt(x, y),
      setMagicLevel: (pl, n) => this.skills.setLevel(pl, "magic", n),
      quest: (pl, args) => this.quests.devCommand(pl, args),
    });
    const muted = (p: PlayerState) => muteRemaining(this.records.get(p.id));
    this.chatHooks = {
      castWords: (pl, text) => this.spells.castWords(pl, text), command, muted,
      partyChat: (pl, text) => this.party.chat(pl, text),
    };
    this.on<MoveMsg>(C2S.Move, (p, m) => { this.fight.pause(p.id); if (m?.dir != null) this.fight.cancelFollow(p); this.movement.onMove(p, m); });
    this.on<WalkToMsg>(C2S.WalkTo, (p, m) => {
      // `stop` (clique que virou "olhar") só larga o caminho: não pausa a luta nem cancela o seguir.
      if (m?.stop !== true) { this.fight.pause(p.id); this.fight.cancelFollow(p); }
      this.movement.onWalkTo(p, m);
    });
    this.on<TurnMsg>(C2S.Turn, (p, m) => this.movement.onTurn(p, m));
    this.on<AttackMsg>(C2S.Attack, (p, m) => { this.combat.onAttack(p, m); if (p.targetId) this.fight.cancelFollow(p); });
    this.on<FollowMsg>(C2S.Follow, (p, m) => this.fight.onFollow(p, m));
    this.on<ChatSendMsg>(C2S.Chat, (p, m, c) =>
      handleChat(this, c, p, m, this.chatHooks));
    this.on<CastMsg>(C2S.Cast, (p, m) => this.spells.onCast(p, m));
    this.on<SetHotkeysMsg>(C2S.SetHotkeys, (p, m) => this.setHotkeys(p, m));
    this.on<MoveItemMsg>(C2S.MoveItem, (p, m) => this.inventory.onMoveItem(p, m));
    this.on<UseItemMsg>(C2S.UseItem, (p, m) => this.inventory.onUseItem(p, m));
    this.on<QuickPotionMsg>(C2S.QuickPotion, (p, m) => this.inventory.onQuickPotion(p, m));
    this.on<DiscardItemMsg>(C2S.DiscardItem, (p, m) => this.ground.onDiscard(p, m));
    this.on<DropItemMsg>(C2S.DropItem, (p, m) => this.ground.onDrop(p, m));
    this.on<PickupItemMsg>(C2S.PickupItem, (p, m) => this.ground.onPickup(p, m));
    this.on<MoveGroundItemMsg>(C2S.MoveGroundItem, (p, m) => this.ground.onMoveGround(p, m));
    this.on<LookGroundMsg>(C2S.LookGround, (p, m) => this.ground.onLook(p, m));
    this.on<NpcInteractMsg>(C2S.NpcInteract, (p, m) => {
      this.npcs.onInteract(p, m);
      if (m?.npcId && this.npcs.openFor(p.id) === m.npcId) this.quests.onTalk(p, m.npcId);
      if (m?.npcId === "arena_master" && this.npcs.openFor(p.id) === "arena_master") this.arena.openLobbies(p);
      // Quadro da obra (ClickUp): barras de sprint e aba "Na obra" nos NPCs com workBoard.
      if (m?.npcId && this.npcs.openFor(p.id) === m.npcId && npcDef(m.npcId)?.workBoard) send(p.id, S2C.Work, this.clickup.workMsg(m.npcId, p.name));
    });
    this.on<ArenaActionMsg>(C2S.Arena, (p, m) => this.arena.onAction(p, m));
    this.on<NpcTradeMsg>(C2S.NpcTrade, (p, m) => this.npcs.onTrade(p, m));
    this.on<TravelMsg>(C2S.Travel, (p, m) => this.npcs.onTravel(p, m));
    this.on<QuestActionMsg>(C2S.Quest, (p, m) => this.quests.onAction(p, m));
    this.on<UseQuestObjectMsg>(C2S.UseQuestObject, (p, m) => this.questWorld.onUse(p, m));
    this.on<FightModeMsg>(C2S.FightMode, (p, m) => this.fight.onFightMode(p, m));
    this.on<TrainOpenMsg>(C2S.TrainOpen, (p, m) => this.training.onOpen(p, m));
    this.on<TrainOfflineMsg>(C2S.TrainOffline, (p, m, c) => this.startOfflineTraining(p, m, c));
    this.on<PartyActionMsg>(C2S.Party, (p, m) => this.party.onAction(p, m));
    this.on<TradeMsg>(C2S.Trade, (p, m) => this.trade.onMessage(p, m));
    this.on<FishMsg>(C2S.Fish, (p, m) => this.fishing.onMessage(p, m));
    this.on<ChallengeActionMsg>(C2S.Challenge, (p, m) => this.challenges.onMessage(p, m));
    this.on<MaterialRequestActionMsg>(C2S.MaterialRequest, (p, m) => this.materialRequest.onMessage(p, m));
    this.on<RefineMsg>(C2S.Refine, (p, m) => this.refine.onRefine(p, m));
    this.on(C2S.AgendaRequest, (p) => this.events.sendAgenda(p.id));
    this.on<SortContainerMsg>(C2S.SortContainer, (p, m) => this.inventory.onSortContainer(p, m));
    this.on<ExcursionActionMsg>(C2S.Excursion, (p, m) => this.excursions.onMessage(p, m));
    this.on<SocialActionMsg>(C2S.Social, (p, m) => this.social.onAction(p, m));
    this.on<SetOutfitMsg>(C2S.SetOutfit, (p, m) => {
      const rec = this.records.get(p.id);
      applySetOutfit(p, rec, m, rec ? getAccountTones(rec.accountId) : []);
    });
    this.on<BuyOutfitToneMsg>(C2S.BuyOutfitTone, (p, m, c) => {
      const rec = this.records.get(p.id);
      const tone = rec && m && typeof m.toneId === "string" ? toneDef(m.toneId) : undefined;
      if (!rec || !tone) return;
      const unlocked = getAccountTones(rec.accountId);
      if (unlocked.includes(tone.id)) return c.send(S2C.Notice, { text: "Você já tem esse tom.", kind: "warn" } satisfies NoticeMsg);
      if (!this.inventory.spendGold(p, OUTFIT_TONE_PRICE)) return c.send(S2C.Notice, { text: "Ouro insuficiente.", kind: "warn" } satisfies NoticeMsg);
      // Tom (conta) e ouro (personagem) no mesmo commit: uma queda antes do autosave não deixa o tom de graça (#56).
      const list = transaction(() => { const l = addAccountTone(rec.accountId, tone.id); this.save(p.id); return l; });
      c.send(S2C.OutfitTones, { unlocked: list } satisfies OutfitTonesMsg);
      c.send(S2C.Notice, { text: `Você comprou o tom ${tone.name} por ${OUTFIT_TONE_PRICE} de ouro.`, kind: "good" } satisfies NoticeMsg);
    });
    this.on<SetTitleMsg>(C2S.SetTitle, (p, m) => { this.ach.onSetTitle(p, m); });
    // ClickUp: o próprio jogador vincula com o token pessoal (conferido fora do tick e descartado na hora).
    this.on<WorkLinkMsg>(C2S.WorkLink, (p, m) => this.clickup.requestLink(p.id, p.name, m && typeof m === "object" ? m.token : undefined));
    this.on<unknown>(C2S.WorkUnlink, (p) => this.clickup.unlink(p.id, p.name));
    this.on<unknown>(C2S.AchievementsRequest, (p) => { this.ach.sendState(p.id); });

    const players = () => this.state.players.values();
    this.steps = [
      ["pvp", () => this.pvp.tick(this.tickNow, players())],
      ["fight", () => this.fight.tick(this.tickNow, [...players()].filter((p) => !this.lingering.has(p.id)))],
      ["movement", () => this.movement.tick(this.tickNow, players())],
      ["portals", () => { for (const p of players()) this.portals.check(p); }],
      ["exploration", () => { for (const p of players()) this.exploration.onPosition(p.id, p.x, p.y); }],
      ["achievements", () => this.ach.tick(this.tickNow)],
      ["monsters", () => this.monsters.tick(this.tickNow)],
      ["monsterAbilities", () => this.monsterAbilities.tick(this.tickNow)],
      ["invasion", () => this.invasion.tick(this.tickNow)],
      ["combat", () => this.combat.tick(this.tickNow)],
      ["conditions", () => this.conditions.tick(this.tickNow)],
      ["regen", () => this.regen.tick(this.tickNow, players())],
      ["arena", () => this.arena.tick(this.tickNow)],
      ["food", () => this.food.tick(this.tickNow, players())],
      ["social", () => this.social.tick(this.tickNow)],
      ["excursions", () => this.excursions.tick(this.tickNow)],
      ["imbue", () => this.imbue.tick(this.tickNow)],
      ["npcs", () => this.npcs.tick(this.tickNow)],
      ["quests", () => this.quests.tick(this.tickNow, players())],
      ["questWorld", () => this.questWorld.tick(this.tickNow)],
      ["party", () => this.party.sync(this.tickNow)],
      ["trade", () => this.trade.tick()],
      ["fishing", () => this.fishing.tick()],
      ["challenges", () => this.challenges.tick(this.tickNow, players())],
      ["events", () => this.events.tick(this.tickNow)],
      ["clickup", () => this.clickup.tick(this.tickNow)],
      // Virada da semana com o jogador online: renova a linha de base (no máximo 1×/min).
      ["weekly", () => {
        if (this.tickNow - this.weeklyAt < 60_000) return;
        this.weeklyAt = this.tickNow;
        const now = new Date(this.tickNow);
        this.crownWeek(now); // antes de renovar as bases: a coroação lê o ganho da semana que acabou
        for (const rec of this.records.values()) rollWeek(rec, now);
      }],
      ["conditions.sync", () => this.conditions.sync(this.tickNow)],
      ["combat.flush", () => this.combat.flush()],
      ["ground", () => this.ground.tick(this.tickNow)],
      ["inventory.flush", () => this.inventory.flush()],
      ["transfers", () => this.saveTransfers()],
    ];

    this.setSimulationInterval(() => this.tick(), TICK_MS);
    this.clock.setInterval(() => this.saveAll(), AUTOSAVE_MS);
    // ClickUp: a leitura (rede) sai daqui, fora do tick; o resultado é aplicado no passo "clickup" do tick.
    if (this.clickup.enabled) this.clock.setInterval(() => runSafe("clickup.poll", () => this.clickup.maybePoll(), this.errors), 30_000);
    // Ciclo dia/noite: todos veem a mesma hora (o cliente extrapola entre as atualizações).
    this.cycleOriginMs = Date.now() - CYCLE_START_MS;
    this.updateWorldTime();
    this.clock.setInterval(() => this.updateWorldTime(), WORLD_TIME_SYNC_MS);
  }

  private cycleOriginMs = 0;
  private updateWorldTime() {
    this.state.worldTimeMs = Math.floor(wrapCycle(Date.now() - this.cycleOriginMs));
  }

  /** Passos do tick (testes podem trocar para verificar o isolamento). */
  setSteps(steps: ReadonlyArray<readonly [string, () => void]>) { this.steps = steps; }

  /** Tick da simulação: cada sistema isolado (um que lança não impede os outros; log 1×/10 s por sistema). */
  tick() {
    const t0 = performance.now();
    this.tickNow = Date.now();
    runSteps(this.steps, this.errors);
    this.trackPerf(performance.now() - t0, this.tickNow);
  }

  private trackPerf(ms: number, now: number) {
    const s = this.perf;
    s.n++; s.sum += ms; if (ms > s.max) s.max = ms;
    this.tickRing[this.tickRingN++ % this.tickRing.length] = ms;
    if (now - s.since < PERF_LOG_MS) return;
    const sv = this.savePerf;
    if (DEV || s.max > PERF_PROD_MIN_MAX_MS || sv.max > PERF_PROD_MIN_MAX_MS) {
      const save = sv.n ? ` · autosave média ${(sv.sum / sv.n).toFixed(1)} ms, máx ${sv.max.toFixed(1)} ms` : "";
      console.log(`[tick] ${s.n} ticks: média ${(s.sum / s.n).toFixed(3)} ms, máx ${s.max.toFixed(2)} ms — ${this.monsters.size} monstros, ${this.state.players.size} jogadores${save}`);
    }
    this.perf = { n: 0, sum: 0, max: 0, since: now };
    this.savePerf = { n: 0, sum: 0, max: 0 };
  }

  /** ClickUp dinâmico (systems/clickup.ts): sem LEMONQUEST_CLICKUP_TOKEN fica desligado. */
  private createClickUp(): ClickUpSystem {
    // Pontos de entrega do "Chegou!" (objetos do mapa chegou_drop*); sem eles, ao lado do Julião na Oficina.
    const layer = this.map.tiled.layers.find((l) => l.type === "objectgroup" && l.name === "objects");
    const LABEL: Record<string, string> = { chegou_drop: "na Estação Central da Malha", chegou_drop_oficina: "no Pátio de Encomendas" };
    const drops = (layer?.objects ?? []).filter((o) => o.name?.startsWith("chegou_drop")).map((o) => ({
      ...objectTile(o, this.map.tiled.tilewidth),
      label: String(o.properties?.find((pr) => pr.name === "label")?.value ?? LABEL[o.name!] ?? "no Pátio de Encomendas"),
    }));
    if (!drops.length) {
      const j = parseNpcs(this.map.tiled).find((n) => n.id === "juliao");
      if (j) drops.push({ x: j.x, y: j.y + 1, label: "na Oficina, perto do Julião" });
    }
    let turn = 0;
    // Registro em memória primeiro (online, caindo/reconectando ou no meio do login): gravar o do banco nesse caso seria
    // sobrescrito pelo autosave e o crédito se perderia.
    const inMemory = (name: string) => {
      for (const [sid, rec] of this.records) if (nameKey(rec.name) === nameKey(name)) return { sid, rec };
      return null;
    };
    return ClickUpSystem.fromEnv({
      getKv, setKv,
      feed: (text) => this.loot.feed(text, "info"),
      dropBox: (items) => {
        if (!drops.length) return null;
        const d = drops[turn++ % drops.length]!;
        let placed = 0;
        for (const it of items) if (this.ground.placeNear(makeItem(it.defId, it.count), d.x, d.y)) placed++;
        return placed ? d.label : null;
      },
      startEvent: (ev) => !!this.events.startBonus(ev),
      credit: (name, n) => {
        const mem = inMemory(name);
        if (mem) {
          if (this.state.players.has(mem.sid)) this.ach.event(mem.sid, "work", { n });
          else addWorkTasks(mem.rec, n); // ainda entrando: o load das conquistas avalia
          return true;
        }
        const rec = getCharacterByName(name);
        if (!rec) return false;
        addWorkTasks(rec, n);
        saveCharacter(rec);
        return true;
      },
      linkResult: (sid, ok, text) => {
        const c = this.clients.getById(sid);
        if (!c) return;
        c.send(S2C.Notice, { text, kind: ok ? "good" : "warn", log: true } satisfies NoticeMsg);
        const pl = this.state.players.get(sid), npc = this.npcs.openFor(sid);
        if (pl && npc && npcDef(npc)?.workBoard) c.send(S2C.Work, this.clickup.workMsg(npc, pl.name));
      },
    });
  }

  /** Campeão da semana: título rotativo para os líderes das categorias semanais (systems/weeklyChampion.ts). */
  private crownWeek(now: Date): void {
    const online = (name: string) => {
      for (const [sid, rec] of this.records) if (nameKey(rec.name) === nameKey(name)) return { sid, rec, p: this.state.players.get(sid) };
      return null;
    };
    const host: ChampionHost = {
      getKv, setKv,
      rows: () => listRankingRows(),
      record: (name) => online(name)?.rec ?? getCharacterByName(name),
      grant: (rec, id) => {
        const o = online(rec.name);
        if (o?.p) this.ach.grantTo(o.p, rec, id, true);
        else { grantUnlock(rec, id); saveCharacter(rec); }
      },
      revoke: (rec) => {
        const o = online(rec.name);
        if (o?.p) { o.p.title = rec.data.ach?.title ? o.p.title : ""; this.ach.sendState(o.sid); }
        else saveCharacter(rec);
      },
      save: (rec) => saveCharacter(rec),
      announce: (text) => this.loot.feed(text, "info"),
    };
    crownWeek(host, now);
    // Coliseu (ciclo 16): o melhor tempo das 70 ondas na semana que acabou leva o título rotativo "Campeão do Coliseu".
    // Isolado: uma falha aqui (banco) não pode impedir a virada das bases semanais (rollWeek) que vem depois.
    runSafe("arenaChampion", () => crownArenaWeek(host, now), this.errors);
  }

  /** Linhas do /status (admin). */
  statusLines(): string[] {
    const n = Math.min(this.tickRingN, this.tickRing.length);
    let sum = 0, max = 0;
    for (let i = 0; i < n; i++) { sum += this.tickRing[i]!; if (this.tickRing[i]! > max) max = this.tickRing[i]!; }
    const mem = process.memoryUsage();
    const sv = this.savePerf;
    const lines = statusLines({
      uptimeMs: Date.now() - this.bootAt, online: this.state.players.size, peakOnline: this.peakOnline, joins: this.joins,
      monsters: this.monsters.size, pendingRespawns: this.monsters.pendingRespawns, groundItems: this.ground.size,
      tickAvgMs: n ? sum / n : 0, tickMaxMs: max, tickBudgetMs: TICK_MS,
      rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), errors: this.errors.total,
      ...(sv.n ? { saveAvgMs: sv.sum / sv.n, saveMaxMs: sv.max } : {}),
    });
    // Progressão medida: o que está salvo de todos os personagens, com os online substituídos pela contagem viva.
    try {
      const live = new Map<string, CharacterRecord["data"]["play"]>();
      for (const [sid, rec] of this.records) live.set(rec.name, this.telemetry.serialize(sid, this.state.players.get(sid)?.level ?? rec.level) ?? rec.data.play);
      lines.push(...summarizePlay(listRankingRows().map((r) => (live.has(r.name) ? live.get(r.name) : r.data.play))));
    } catch (e) {
      this.errors.report("status.play", e);
    }
    return lines;
  }

  /** Erros em onMessage/onJoin/onLeave/clock/tick (o Colyseus embrulha tudo com isto): loga e segue. */
  onUncaughtException(err: RoomException, method: RoomMethodName) {
    const cause = (err as Error & { cause?: unknown }).cause ?? err;
    this.errors.report(`room.${method}`, cause);
  }

  onJoin(client: Client, _options: JoinOptions, auth: AuthData) {
    if (!auth?.name) throw new ServerError(ErrorCode.AUTH_FAILED, "sem autenticação");
    const sid = client.sessionId;
    this.names.set(sid, auth.name);
    // Mesmo personagem já no mundo (aba antiga, sessão "presa" após queda): salva e derruba a antiga (estilo Tibia).
    const prev = claimOnline(auth.name, sid);
    if (prev) this.replaceSession(prev);
    const rec = getCharacterByName(auth.name); // lido DEPOIS de salvar a sessão antiga
    if (!rec) throw new ServerError(ErrorCode.AUTH_FAILED, "Personagem não encontrado");
    // Personagem criado agora (nunca entrou: x/y nulos até a 1ª gravação). Lido antes de qualquer save, que grava x/y.
    const firstLogin = isFirstLogin(rec);

    const p = new PlayerState();
    p.id = sid;
    p.name = rec.name;
    p.vocation = rec.vocation;
    p.level = rec.level;
    p.xp = rec.xp;
    const stats = baseStats(rec.vocation, rec.level);
    p.maxHp = stats.maxHp;
    p.maxMana = stats.maxMana;
    // Inventário antes de limitar vida/mana: o equipamento soma ao máximo.
    this.inventory.load(p, rec.data);
    p.hp = rec.data.hp ?? Number.MAX_SAFE_INTEGER;
    p.mana = rec.data.mana ?? Number.MAX_SAFE_INTEGER;
    this.inventory.applyStats(p);
    // Saiu/caiu no meio de uma partida do coliseu: volta na saída do coliseu.
    const start = this.arena.loginPosition(rec.x, rec.y)
      ?? (this.validStart(rec.x, rec.y) ? { x: rec.x!, y: rec.y! } : this.map.spawn);
    p.x = start.x;
    p.y = start.y;
    p.dir = rec.dir;
    const look = loadOutfit(rec);
    p.outfit = look.outfit;
    p.addons = look.addons;
    p.sex = look.sex;
    const unlockedTones = getAccountTones(rec.accountId);
    p.tone = rec.data.tone && unlockedTones.includes(rec.data.tone) ? rec.data.tone : "";
    this.skills.load(p, rec.data.skills);
    // Treino offline pendente: aplica o progresso, cura tudo e coloca o jogador ao lado da estátua.
    const trained = rec.data.offlineTraining ? this.returnFromTraining(p, rec) : null;
    this.fight.load(p, rec.data.stance, rec.data.chase, rec.data.auto);
    this.pvp.load(p, rec.data.pvpKills, rec.data.pvpWhiteUntil, rec.data.pvpPzLockUntil);
    p.blessed = !!rec.data.blessed;
    this.imbue.load(p.id, rec.data);
    this.npcs.loadLimitedBuy(p.id, rec.data.limitedBuyWeek);
    this.food.load(p.id, rec.data, Date.now());
    this.quests.load(p, rec.data.quests);
    rollWeek(rec, new Date());
    this.records.set(sid, rec);
    this.state.players.set(sid, p);
    this.conditions.refreshPlayer(p.id); // velocidade do equipamento
    this.ach.load(p, rec);
    { const st = this.ach.state(sid); if (st) client.send(S2C.Achievements, st); }
    client.send(S2C.OutfitTones, { unlocked: unlockedTones } satisfies OutfitTonesMsg);
    if (trained) this.ach.event(p.id, "offline", { minutes: trained.minutes });
    this.movement.addPlayer(p);
    client.send(S2C.Explored, this.exploration.addPlayer(sid, rec, p.x, p.y));
    const inv = this.inventory.inventoryMsg(p.id);
    if (inv) client.send(S2C.Inventory, inv);
    if (trained) client.send(S2C.TrainingResult, trained);
    const barRebuilt = this.upgradeHotkeys(rec, p.vocation);
    client.send(S2C.Hotkeys, this.hotkeysMsg(rec, p.vocation));
    if (auth.weakPassword) {
      client.send(S2C.Notice, {
        text: "Sua senha é curta (menos de 6 caracteres). Considere uma senha mais forte.", kind: "warn",
      } satisfies NoticeMsg);
    }
    console.log(`[world] ${rec.name} entrou (${this.state.players.size} online)`);
    this.telemetry.onJoin(sid, p.level, rec.data.play);
    this.events.sendTo(sid);
    // Avisos de entrada (amigos online e bônus de login) saem ~3 s depois: o chat e os avisos do cliente só passam a
    // escutar depois da entrada, então o que sai na hora se perde.
    this.clock.setTimeout(() => {
      const pl = this.state.players.get(sid);
      if (!pl) return;
      this.social.onJoin(pl);
      this.invasion.onJoin(pl); // baú pendente de invasão (estava offline no fim) + estado da invasão em andamento
      if (firstLogin) {
        const w = welcomeFeed(pl.name, pl.vocation);
        this.broadcast(S2C.Feed, w.all);
        this.clients.getById(sid)?.send(S2C.Feed, w.you); // linha pessoal: Capitão Rodrigo (!) e a Agenda no trilho
      }
      if (barRebuilt) {
        this.clients.getById(sid)?.send(S2C.Notice, {
          text: "Sua barra de magias foi reorganizada com as famílias ◆ (uma tecla para magias parecidas). Ajuste no H.",
          kind: "info", log: true,
        } satisfies NoticeMsg);
      }
      // Bônus de dias seguidos. Desligado nos testes (E2E e unitários contam ouro/itens do kit inicial): LEMONQUEST_LOGIN_BONUS=0.
      if (!e2eMode() && process.env.LEMONQUEST_LOGIN_BONUS !== "0") {
        const r = this.records.get(sid);
        // Gravado na hora: uma queda antes do autosave repetia o prêmio no próximo login (#56).
        if (r && grantLoginBonus({ send: (id, type, msg) => this.clients.getById(id)?.send(type, msg), inventory: this.inventory }, pl, r).fresh) {
          runSafe("loginBonus.save", () => this.save(sid), this.errors);
        }
      }
    }, 3000);
    this.joins++;
    this.peakOnline = Math.max(this.peakOnline, this.state.players.size);
  }

  /** Aplica e limpa o treino offline do registro (chamado no onJoin, antes de o jogador entrar no mundo). */
  private returnFromTraining(p: PlayerState, rec: CharacterRecord): TrainingResultMsg | null {
    const t = rec.data.offlineTraining;
    delete rec.data.offlineTraining;
    if (!t || !SKILLS.includes(t.skill)) return null;
    const result = this.training.applyOffline(p, t, Date.now());
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    const tile = this.training.returnTile(t.statueId, p.id);
    if (tile) { p.x = tile.x; p.y = tile.y; }
    else if (!this.validStart(p.x, p.y)) { p.x = this.map.spawn.x; p.y = this.map.spawn.y; }
    return result;
  }

  /** C2S.TrainOffline: valida, grava o treino, salva e desconecta com CLOSE_TRAINING. */
  private startOfflineTraining(p: PlayerState, m: TrainOfflineMsg, c: Client) {
    const rec = this.records.get(p.id);
    if (!rec) return;
    const t = this.training.begin(p, m, Date.now());
    if (!t) return;
    rec.data.offlineTraining = t;
    // Salva já (síncrono): se falhar, o jogador continua online e o treino não vale.
    try {
      this.save(p.id);
    } catch (e) {
      delete rec.data.offlineTraining;
      this.errors.report("save (treino offline)", e);
      c.send(S2C.Notice, { text: "Não foi possível salvar. Tente de novo.", kind: "warn" } satisfies NoticeMsg);
      return;
    }
    console.log(`[world] ${p.name} foi treinar ${t.skill} offline`);
    c.leave(CLOSE_TRAINING, "Treinando offline");
  }

  /** A posição salva serve? (andável, alcançável do spawn, sem portal/NPC/monstro). */
  validStart(x: number | null, y: number | null): boolean {
    return isValidStart(x, y, {
      grid: this.map.grid, reachable: this.reachable,
      isPortal: (tx, ty) => this.portals.isPortalTile(tx, ty),
      isNpc: (tx, ty) => this.npcs.isNpcAt(tx, ty),
      isMonster: (tx, ty) => this.monsters.isMonsterAt(tx, ty),
    });
  }

  get spawnPoint() { return this.map.spawn; }

  /**
   * Membros do grupo de `playerId` (incluindo ele) vivos a até `range` tiles de (x,y); sem grupo, só ele (se perto).
   * Para quests/bounties creditarem abates ao grupo.
   */
  partyMembersNear(playerId: string, x: number, y: number, range: number): PlayerState[] {
    return this.party.partyMembersNear(playerId, x, y, range);
  }

  /** Tile livre para chegar por portal (andável, sem monstro/NPC/portal/outro jogador). */
  private isFreeTile(x: number, y: number, selfId: string): boolean {
    if (!this.map.grid.isWalkable(x, y) || this.monsters.isMonsterAt(x, y) || this.npcs.isNpcAt(x, y) || this.portals.isPortalTile(x, y)) return false;
    for (const o of this.state.players.values()) if (o.id !== selfId && o.x === x && o.y === y) return false;
    return true;
  }

  /** Derruba a sessão antiga do mesmo personagem: salva + limpa já (síncrono), cancela reconexão pendente, fecha o socket. */
  private replaceSession(oldSid: string) {
    const old = this.clients.getById(oldSid);
    console.log(`[world] ${this.names.get(oldSid) ?? "?"} entrou em outro lugar — derrubando a sessão antiga`);
    this.lingering.get(oldSid)?.clear();
    this.lingering.delete(oldSid);
    this.cleanupSession(oldSid);
    const pending = this.reconnecting.get(oldSid);
    if (pending) { this.reconnecting.delete(oldSid); pending.reject(new Error("replaced")); }
    if (old) {
      try { old.leave(CLOSE_REPLACED, REPLACED_REASON); } catch (e) { this.errors.report("replaceSession.leave", e); }
    }
  }

  /** /kick: fecha a sessão com CLOSE_KICKED + motivo (sem reconexão automática; onLeave salva e limpa). */
  kick(sessionId: string, reason: string) {
    // Caído esperando reconexão: o kick tem de valer também (senão o SDK reconecta e o jogador segue no mundo).
    const pending = this.reconnecting.get(sessionId);
    if (pending) {
      this.reconnecting.delete(sessionId);
      try { pending.reject(new Error("kicked")); } catch (e) { this.errors.report("kick.reconnect", e); }
    }
    this.kicked.add(sessionId); // onLeave depois da reconexão recusada não deixa no mundo
    // Ficou no mundo depois de sair em combate: o kick tira já.
    const linger = this.lingering.get(sessionId);
    if (linger) { linger.clear(); this.endLinger(sessionId, true); return; }
    const c = this.clients.getById(sessionId);
    if (!c) return;
    try { c.leave(CLOSE_KICKED, reason || KICK_DEFAULT_REASON); } catch (e) { this.errors.report("kick.leave", e); }
  }

  /**
   * Grupo de quem matou, para o loot no chão: só com outro membro vivo e no teclado (não em permanência/linger) a até
   * PARTY_SHARE_RANGE do monstro em (x,y) — a régua da XP compartilhada. Grupo "de nome" com todo mundo longe = sozinho:
   * o loot vai direto para a mochila.
   */
  private partyLootId(p: PlayerState, x: number, y: number): string | undefined {
    const party = this.party?.partyFor(p.id);
    if (!party || party.members.length < 2) return undefined;
    const near = this.partyMembersNear(p.id, x, y, PARTY_SHARE_RANGE).some((m) => m.id !== p.id && !this.lingering.has(m.id));
    return near ? party.id : undefined;
  }

  /** Recompensa (baú de quest, desafio) que não coube na mochila: vai ao chão e grava personagem + chão juntos. */
  private placeReward(p: PlayerState, item: ItemInstance): boolean {
    const ok = this.ground.placeLoot(p, item);
    if (ok) this.transferred.add(p.id);
    return ok;
  }

  /** Multiplicador do dano causado: postura × Fúria (condição "berserk", +value%). */
  private dealtMult(p: PlayerState): number {
    return stanceDealt(p) * (1 + this.conditions.value(p.id, "berserk") / 100);
  }

  /**
   * C2S.SetHotkeys: guarda os atalhos (e os grupos de magia, se vieram) válidos no personagem (salvos no próximo save).
   * Os grupos vêm antes: atalho de grupo que não existe mais sai.
   */
  private setHotkeys(p: PlayerState, m: SetHotkeysMsg) {
    const rec = this.records.get(p.id);
    if (!rec || !m || typeof m !== "object") return;
    if (m.groups !== undefined) rec.data.spellGroups = sanitizeSpellGroups(m.groups, p.vocation);
    rec.data.hotkeys = sanitizeHotkeys(m.list, p.vocation, rec.data.spellGroups ?? []);
    rec.data.hotkeysVersion = HOTKEYS_VERSION;
    // Confirma o que foi salvo: o cliente descobre se alguma edição se perdeu.
    this.clients.getById(p.id)?.send(S2C.Hotkeys, this.hotkeysMsg(rec, p.vocation));
  }

  /**
   * Barra de uma versão anterior (ou nunca configurada): vira a recomendada (famílias de magia), uma vez. Retorna true
   * se trocou uma barra que o jogador já usava (personagem novo, sem barra e sem XP, não recebe aviso).
   */
  private upgradeHotkeys(rec: CharacterRecord, vocation: Vocation): boolean {
    if ((rec.data.hotkeysVersion ?? 0) >= HOTKEYS_VERSION) return false;
    const used = !!rec.data.hotkeys || rec.xp > 0;
    rec.data.hotkeys = defaultHotkeys(vocation);
    rec.data.hotkeysVersion = HOTKEYS_VERSION;
    return used;
  }

  /**
   * Atalhos e grupos salvos, limpos de novo (magia renomeada/removida numa atualização); list null = nunca configurou.
   */
  private hotkeysMsg(rec: CharacterRecord, vocation: Vocation): HotkeysMsg {
    const groups = sanitizeSpellGroups(rec.data.spellGroups, vocation);
    return { list: rec.data.hotkeys ? sanitizeHotkeys(rec.data.hotkeys, vocation, groups) : null, groups };
  }

  /** /tp <nome>: leva o admin para um tile livre ao redor do alvo (raio 1, depois 2). */
  teleportNear(admin: PlayerState, target: PlayerState): boolean {
    for (let r = 1; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = target.x + dx, y = target.y + dy;
          if (!this.isFreeTile(x, y, admin.id)) continue;
          this.movement.teleport(admin, x, y);
          this.clients.getById(admin.id)?.send(S2C.Teleported, { x, y });
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Queda sem consentimento (Wi-Fi, aba suspensa): o jogador fica parado no mundo por RECONNECT_S segundos
   * enquanto o SDK reconecta sozinho. Sem reconexão → o Colyseus chama onLeave (limpeza real).
   */
  onDrop(client: Client, code?: number) {
    const sid = client.sessionId;
    if (this.shuttingDown || !this.records.has(sid) || code === CloseCode.WITH_ERROR || code === CLOSE_REPLACED || code === CLOSE_TRAINING || code === CLOSE_KICKED) return; // → onLeave
    const p = this.state.players.get(sid);
    if (p) { this.movement.teleport(p, p.x, p.y); this.pauseAuto(p); } // para de andar e de escolher alvos sozinho
    console.log(`[world] ${p?.name ?? sid} caiu (código ${code}); aguardando reconexão por ${RECONNECT_S} s`);
    const r = this.allowReconnection(client, RECONNECT_S);
    this.reconnecting.set(sid, r);
    r.then(() => {}, () => {}).finally(() => { if (this.reconnecting.get(sid) === r) this.reconnecting.delete(sid); });
  }

  onReconnect(client: Client) {
    const sid = client.sessionId;
    this.reconnecting.delete(sid);
    this.resumeAuto(sid);
    // O que foi enviado durante a queda se perdeu: reenvia o estado que não está no schema.
    const explored = this.exploration.message(sid);
    if (explored) client.send(S2C.Explored, explored);
    const inv = this.inventory.inventoryMsg(sid);
    if (inv) client.send(S2C.Inventory, inv);
    this.conditions.refreshPlayer(sid);
    this.arena.resend(sid);
    this.quests.resend(sid);
    { const rec = this.records.get(sid), p = this.state.players.get(sid); if (rec && p) client.send(S2C.Hotkeys, this.hotkeysMsg(rec, p.vocation)); }
    this.ach.sendState(sid);
    this.party.resend(sid);
    this.trade.resend(sid);
    this.events.sendTo(sid); // evento que começou/terminou durante a queda (#55)
    this.excursions.resend(sid);
    this.social.resendOnline(sid);
    this.invasion.sendTo(sid);
    this.challenges.forget(sid); // a próxima passada do tick reenvia o estado dos desafios (ponto no trilho)
    console.log(`[world] ${this.names.get(sid) ?? sid} reconectou`);
  }

  onLeave(client: Client, code?: number) {
    const sid = client.sessionId;
    const name = this.names.get(sid);
    const kicked = this.kicked.delete(sid) || code === CLOSE_KICKED || code === CLOSE_TRAINING;
    const ms = kicked ? 0 : this.lingerMs(sid, code === CloseCode.CONSENTED);
    if (ms > 0) {
      const p = this.state.players.get(sid);
      if (p) {
        this.movement.teleport(p, p.x, p.y); // para de andar (como na queda): não chega à zona de proteção sozinho
        // Sem ninguém no teclado não ataca nem segue (senão renovava o bloqueio de PZ e podia matar alguém sozinho).
        p.targetId = "";
        p.followId = "";
        this.pauseAuto(p);
        // Sem ninguém no teclado a troca não vai concluir: fecha já, em vez de prender o parceiro até a permanência acabar (#55).
        this.trade.cancel(sid, `${p.name} saiu do jogo; troca cancelada.`);
      }
      console.log(`[world] ${name ?? sid} saiu em combate; fica no mundo por ${Math.ceil(ms / 1000)} s`);
      this.lingering.set(sid, this.clock.setTimeout(() => this.endLinger(sid), ms));
      return;
    }
    this.cleanupSession(sid);
    if (name) console.log(`[world] ${name} saiu (código ${code}; ${this.state.players.size} online)`);
  }

  /**
   * Quanto tempo o personagem fica no mundo ao sair (0 = sai na hora). Só vivo e fora de partida do Coliseu (lá sair
   * já é desistir sem penalidade). Saída voluntária em combate recente: RECONNECT_S. Bloqueio de PZ (atacou um
   * jogador): até o bloqueio acabar, também depois de uma queda sem reconexão (fechar a aba não livra do revide).
   */
  private lingerMs(sid: string, consented: boolean): number {
    const p = this.state.players.get(sid);
    if (this.shuttingDown || !p || p.hp <= 0 || this.arena.inMatch(sid)) return 0;
    const now = Date.now();
    const combat = consented && this.combat.inCombat(sid, now) ? RECONNECT_S * 1000 : 0;
    // Já dentro da PZ (carroça, portal): o bloqueio não tem mais o que impedir.
    const lock = this.monsters.inPz(p.x, p.y) ? 0 : this.pvp.pzLockRemaining(sid, now);
    return Math.max(combat, lock);
  }

  /** Sem ninguém no teclado o ataque automático não escolhe alvos (renovaria o combate e o bloqueio de PZ sozinho). */
  private pauseAuto(p: PlayerState): void {
    if (!this.autoPaused.has(p.id)) this.autoPaused.set(p.id, p.auto);
    p.auto = false;
  }

  /** Voltou (reconexão): o ataque automático volta como estava. */
  private resumeAuto(sid: string): void {
    const was = this.autoPaused.get(sid);
    if (was === undefined) return;
    this.autoPaused.delete(sid);
    const p = this.state.players.get(sid);
    if (p) p.auto = was;
  }

  /** Fim da permanência após sair em combate (ou cancelamento: relogin/kick). */
  private endLinger(sid: string, force = false) {
    if (!this.lingering.delete(sid)) return;
    // Levou um golpe de PvP de volta no meio e o bloqueio foi renovado: fica até ele acabar.
    const more = force ? 0 : this.lingerMs(sid, false);
    if (more > 0) { this.lingering.set(sid, this.clock.setTimeout(() => this.endLinger(sid), more)); return; }
    const name = this.names.get(sid);
    this.cleanupSession(sid);
    if (name) console.log(`[world] ${name} saiu (após o combate; ${this.state.players.size} online)`);
  }

  /** Salva e remove a sessão de todos os sistemas. Limpeza e liberação do nome SEMPRE rodam, mesmo se salvar falhar. */
  cleanupSession(sid: string) {
    try {
      // Coliseu antes de salvar: quem estava numa partida volta para a saída (e é salvo lá), sem penalidade.
      runSafe("saída/arena", () => this.arena.removePlayer(sid), this.errors);
      if (this.transferred.size) {
        // Transferência ainda não gravada (troca/chão neste tick): quem sai grava JUNTO com os outros envolvidos e o
        // chão, numa transação (senão a troca podia ficar gravada só de um lado se o processo caísse logo depois).
        const ids = new Set([sid, ...this.transferred]);
        this.transferred.clear();
        transaction(() => {
          for (const id of ids) runSafe("save (saída)", () => this.save(id), this.errors);
          this.ground.flush();
        });
      } else this.save(sid);
    } catch (e) {
      this.errors.report("save (saída)", e);
    } finally {
      const name = this.names.get(sid);
      if (name) runSafe("releaseOnline", () => releaseOnline(name, sid), this.errors);
      const steps: [string, () => void][] = [
        ["movement", () => this.movement.removePlayer(sid)],
        ["summons", () => this.summons.despawnOwner(sid)],
        ["combat", () => this.combat.removePlayer(sid)],
        ["conditions", () => this.conditions.removePlayer(sid)],
        ["spells", () => this.spells.removePlayer(sid)],
        ["skills", () => this.skills.removePlayer(sid)],
        ["regen", () => this.regen.removePlayer(sid)],
        ["food", () => this.food.removePlayer(sid)],
        ["imbue", () => this.imbue.removePlayer(sid)],
        ["invasion", () => this.invasion.removePlayer(sid)],
        ["exploration", () => this.exploration.removePlayer(sid)],
        ["inventory", () => this.inventory.removePlayer(sid)],
        ["ground", () => this.ground.removePlayer(sid)],
        ["npcs", () => this.npcs.removePlayer(sid)],
        ["quests", () => this.quests.removePlayer(sid)],
        ["fight", () => this.fight.removePlayer(sid)],
        ["pvp", () => this.pvp.removePlayer(sid)],
        ["chat", () => clearChatState(sid)],
        ["achievements", () => this.ach.removePlayer(sid)],
        ["trade", () => this.trade.removePlayer(sid)],
        ["fishing", () => this.fishing.removePlayer(sid)],
        ["party", () => this.party.removePlayer(sid)],
        ["social", () => { const pl = this.state.players.get(sid); if (pl) this.social.onLeave(pl); }],
        ["telemetry", () => this.telemetry.removePlayer(sid)],
      ];
      for (const [k, fn] of steps) runSafe(`saída/${k}`, fn, this.errors);
      this.throttle.clearPrefix(`${sid}:`);
      this.state.players.delete(sid);
      this.records.delete(sid);
      this.autoPaused.delete(sid);
      this.names.delete(sid);
      this.kicked.delete(sid);
    }
  }

  /** Desligamento gracioso (Colyseus chama no gracefullyShutdown): salva todos antes de desconectar. */
  onBeforeShutdown() {
    this.shuttingDown = true;
    const n = this.saveAll();
    this.ground.flush();
    this.excursions?.flushNow(); // mural coalescido (1×/s): grava o último segundo
    console.log(`[world] desligando: ${n} personagem(ns) salvo(s)`);
    super.onBeforeShutdown();
  }

  onDispose() {
    this.saveAll();
    this.ground.flush();
    this.excursions?.flushNow();
    if (liveWorld === this) { liveWorld = null; setActiveAchievements(null); }
  }

  /** Registra um handler: só para quem tem personagem; aplica o limite por tipo (excesso descartado). */
  private on<T>(type: string, fn: (p: PlayerState, m: T, c: Client) => void) {
    const limit = MESSAGE_LIMITS[type];
    this.onMessage(type, (c: Client, m: T) => {
      const p = this.state.players.get(c.sessionId);
      if (!p) return;
      if (limit !== undefined && !this.throttle.allow(`${c.sessionId}:${type}`, limit)) return;
      fn(p, m, c);
    });
  }

  private save(sessionId: string) {
    const p = this.state.players.get(sessionId);
    const rec = this.records.get(sessionId);
    if (!p || !rec) return;
    rec.level = p.level;
    rec.xp = p.xp;
    rec.data.hp = p.hp;
    rec.data.mana = p.mana;
    rec.x = p.x;
    rec.y = p.y;
    rec.dir = p.dir;
    rec.data.skills = this.skills.serialize(sessionId) ?? rec.data.skills;
    rec.data.explored = this.exploration.serialize(sessionId) ?? rec.data.explored;
    if (rec.data.explored) rec.data.exploredW = this.exploration.mapWidth;
    Object.assign(rec.data, this.inventory.serialize(sessionId) ?? {});
    const fed = this.food.serialize(sessionId, Date.now());
    if (fed) rec.data.fed = fed; else delete rec.data.fed;
    rec.data.stance = p.stance;
    rec.data.chase = p.chase;
    rec.data.auto = this.autoPaused.get(p.id) ?? p.auto; // pausa da queda/permanência não apaga a preferência
    rec.data.pvpKills = this.pvp.savedKills(p.id);
    const white = this.pvp.savedWhiteUntil(p.id);
    if (white) rec.data.pvpWhiteUntil = white; else delete rec.data.pvpWhiteUntil;
    const lock = this.pvp.savedPzLockUntil(p.id);
    if (lock) rec.data.pvpPzLockUntil = lock; else delete rec.data.pvpPzLockUntil;
    rec.data.blessed = p.blessed;
    this.imbue.saveTo(sessionId, rec.data);
    const limitedBuyWeek = this.npcs.savedLimitedBuy(p.id);
    if (limitedBuyWeek) rec.data.limitedBuyWeek = limitedBuyWeek; else delete rec.data.limitedBuyWeek;
    rec.data.outfit = p.outfit;
    rec.data.addons = p.addons;
    rec.data.tone = p.tone;
    rec.data.sex = p.sex;
    const quests = this.quests.serialize(sessionId);
    if (quests) rec.data.quests = quests;
    rec.data.play = this.telemetry.serialize(sessionId, p.level) ?? rec.data.play;
    this.persist(rec);
  }

  /**
   * Quem recebe crédito de missão por um abate: jogadores online que causaram dano (monstros selvagens; nem
   * invocações nem ondas do coliseu) + membros do grupo vivos a até PARTY_SHARE_RANGE tiles do monstro.
   */
  questCredit(m: Monster): string[] {
    if (m.s.ownerId || m.arenaId || m.minionOf) return [];
    const out = new Set<string>();
    // Mesma regra da XP/loot (killCredit): quem bateu e foi para longe não conta.
    for (const [id] of killCredit(m, (pid) => this.state.players.get(pid))) {
      out.add(id);
      // Grupo: membros vivos perto do monstro também recebem o crédito.
      for (const mate of this.partyMembersNear(id, m.s.x, m.s.y, PARTY_SHARE_RANGE)) out.add(mate.id);
    }
    return [...out];
  }

  /**
   * Conquista "abate em grupo": quem deu dano + membros vivos do mesmo grupo perto do monstro (o curandeiro conta),
   * desde que pelo menos 2 membros do MESMO grupo tenham participado. Jogadores sem grupo nunca contam.
   */
  partyKillCredit(m: Monster): string[] {
    if (m.s.ownerId || m.minionOf) return [];
    const byParty = new Map<object, Set<string>>();
    for (const [id] of killCredit(m, (pid) => this.state.players.get(pid))) {
      const party = this.party.partyFor(id);
      if (!party) continue;
      let set = byParty.get(party);
      if (!set) byParty.set(party, (set = new Set()));
      set.add(id);
      for (const mate of this.partyMembersNear(id, m.s.x, m.s.y, PARTY_SHARE_RANGE)) set.add(mate.id);
    }
    const out: string[] = [];
    for (const set of byParty.values()) if (set.size >= 2) out.push(...set);
    return out;
  }

  /** Desbloqueio vindo de missão (roupa/addon/título): sistema de conquistas. */
  onUnlock(playerId: string, unlockId: string): void { this.ach?.grant(playerId, unlockId); }

  /**
   * Item passou da mochila para o chão (ou o contrário) neste tick: grava os jogadores envolvidos e o chão JUNTOS, numa
   * transação. Sem isso o chão (5 s) e o personagem (15 s) eram gravados em momentos diferentes e uma queda brusca do
   * processo nesse intervalo duplicava ou sumia com o item. No máximo 1×/TRANSFER_SAVE_MS: regravar o chão custa
   * ~1–7 ms (100–2000 itens) e não pode rodar a cada tick com gente arrumando a mochila.
   */
  saveTransfers(): void {
    if (!this.transferred.size || this.tickNow - this.lastTransferSave < TRANSFER_SAVE_MS) return;
    this.lastTransferSave = this.tickNow;
    const ids = [...this.transferred];
    this.transferred.clear();
    transaction(() => {
      for (const id of ids) runSafe("transfer.save", () => this.save(id), this.errors);
      this.ground.flush(this.tickNow);
    });
  }

  /** Salva todos (autosave / desligamento). Um registro com erro não impede os outros. */
  saveAll(): number {
    const t0 = performance.now();
    let n = 0;
    // Uma transação para todos: um commit/fsync em vez de um por jogador (#56). Um registro com erro não desfaz os
    // outros (runSafe engole a exceção dentro da transação).
    transaction(() => { for (const id of [...this.records.keys()]) if (runSafe("autosave", () => this.save(id), this.errors)) n++; });
    const ms = performance.now() - t0;
    const s = this.savePerf;
    s.n++; s.sum += ms; if (ms > s.max) s.max = ms;
    return n;
  }
}

/** Zonas nomeadas do mapa (objetos "zone"), em tiles inclusivos. */
export function parseZones(map: import("@lemonquest/shared").TiledMap): ZoneRect[] {
  const t = map.tilewidth;
  return findObjects(map, "zone").map((o) => ({
    name: o.name,
    x0: Math.floor(o.x / t), y0: Math.floor(o.y / t),
    x1: Math.floor((o.x + Math.max(1, o.width) - 1) / t), y1: Math.floor((o.y + Math.max(1, o.height) - 1) / t),
  }));
}
