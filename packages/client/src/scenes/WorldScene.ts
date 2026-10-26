// Cena do mundo: ponte Colyseus → Phaser (jogadores, criaturas, chão), ponteiro/teclado, alvo e efeitos.
import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  C2S, DROP_RANGE, EMOTES, MONSTERS, S2C, TILE_SIZE, NPC_RANGE,
  eliteName, monsterAbilitySpell, spellDef, spellsFor, type AttackMsg, type LookGroundMsg, type MonsterTelegraphMsg, type CombatEvent, type ChatMessage, type CombatMsg, type EmoteMsg, type FishCastMsg, type ConditionsMsg, type SkillUpMsg, type SpellCastMsg, type SpellDef, type CreatureDiedMsg, type DiedMsg, type Dir, type LevelUpMsg,
  type GroundItemView, type MonsterView, type LootMsg, type MoveMsg, type NpcOpenMsg, type NpcSayMsg, type PlayerView, type TurnMsg, type WalkToMsg, type XpGainMsg,
} from "@lemonquest/shared";
import { session } from "../session.ts";
import { Actor, createCharacterAnims, SPEECH_COLOR_PARTY, type ActorDeps } from "../game/actor.ts";
import { CombatFx, KIND_COLOR } from "../game/combatFx.ts";
import { allCreatureSheets, creatureColor, creatureVisual, ELITE_GLYPH, levelDifficulty, sheetTrim } from "../game/creatures.ts";
import { Butterflies } from "../game/ambient.ts";
import { FXTEST, startFxTest } from "../game/fxtest.ts";
import { LootFx } from "../game/lootFx.ts";
import { LightField } from "../game/lighting.ts";
import { worldClock } from "../game/daynight.ts";
import { GroundItems } from "../game/ground.ts";
import { beginGroundPress, cancelDrag } from "../ui/items/dnd.ts";
import { moveGroundItem, pickupItem, setGroundBridge } from "../ui/items/ground.ts";
import { NpcManager, allNpcSheets } from "../game/npcs.ts";
import { STATUE_RANGE, StatueIndex } from "../game/statues.ts";
import { QUEST_OBJECT_RANGE, QuestObjectIndex, useQuestObject } from "../game/questObjects.ts";
import { ChestLabels } from "../game/chestLabels.ts";
import { onTabReturn, settleActors } from "../game/tabReturn.ts";
import { KeyboardInput } from "../game/input.ts";
import { applyTextRes, onTextResChange, sceneTexts } from "../game/textRes.ts";
import { PixelCamera } from "../game/pixelCamera.ts";
import { Predictor } from "../game/predictor.ts";
import { sfx, type SfxName } from "../game/sfx.ts";
import { SpellEffects } from "../game/spellFx.ts";
import { ADDON_SHEET_LIST, ALL_SHEETS, outfitLook } from "../game/sprites.ts";
import { closeCtxMenu, openCtxMenu, openOutfit, type CtxMenuItem } from "../ui/outfit/outfit.ts";
import { lookCreature, lookNpc, lookPlayer, lookQuestObject, type LookContent } from "../game/lookInfo.ts";
import { expectLookItem, showLook } from "../ui/look/look.ts";
import { amLeader, isPartyMember, partyAction, partyStore } from "../ui/party/party.ts";
import { TEX, createFxTextures } from "../game/textures.ts";
import { MAP_KEY, buildWorldMap, preloadWorldMap, type WorldMap } from "../game/worldMap.ts";
import { loading } from "../ui/loading.ts";
import { openNpc } from "../ui/npc/npc.ts";
import { openStatue } from "../ui/training/training.ts";
import { showDeath, showLevelBanner } from "../ui/combat/combatUi.ts";
import { setConditions } from "../ui/hud/conditions.ts";
import { SKILL_LABELS } from "../ui/hud/SkillsWindow.tsx";
import { pushToast } from "../ui/toasts.ts";
import { playersStore, selectMe } from "../ui/hud/world.ts";
import { followPlayer } from "../ui/hud/FightMode.tsx";
import { inventoryStore } from "../ui/items/inventory.ts";
import { inventoryCounter, questStore } from "../ui/quests/quests.ts";
import { guideTarget } from "../ui/hud/guide.ts";
import { getHudInsets } from "../ui/hud/layout.ts";
import { GuideArrow } from "../game/guide.ts";
import { FishBobbers } from "../game/fishing.ts";
import { requestTrade } from "../ui/trade/trade.ts";
import { reducedMotion } from "../ui/a11y/a11y.ts";
import { spellCooldownLeft } from "../ui/hud/castbar.ts";
import { BATTLE_RANGE, chebyshev, hpPct, setBattleEntries, clearBattleEntries, type BattleEntry } from "../ui/hud/battle.ts";
import { getTarget, setTarget, subscribeTarget, toggleTarget, type Target } from "../ui/hud/target.ts";

/** Último estado autoritativo conhecido de cada jogador/criatura (para detectar mudanças e checar ocupação). */
interface Known { x: number; y: number; dir: number; stepMs: number }
interface CreatureInfo { defId: string; name: string; level: number; boss: boolean; hp: number; maxHp: number; elite?: boolean }

const DEPTH_ABOVE = 1_000_000;
const DEPTH_FX_TOP = 2_000_000;

/** Terrenos (propriedade `terrain` do tileset) que soltam poeira / respingos ao pisar. Grama/pedra: nada. */
const DUSTY = new Set(["road", "dirt", "sand"]);
const SPLASHY = new Set(["mud", "swamp"]);

/** Criaturas mais longe que isto (tiles) do jogador ficam escondidas (não destruídas). */
const CULL_TILES = 25;
/**
 * O servidor manda combate/magias/mortes para a sala inteira: efeitos visuais de terceiros só a até
 * esta distância (tiles, Chebyshev) do jogador — um pouco além da meia-largura da tela (~17 linhas visíveis).
 */
const FX_VIEW_TILES = 16;
/** Sons de terceiros: volume cheio até SFX_FULL_TILES, cai linearmente e some em SFX_MAX_TILES. */
const SFX_FULL_TILES = 3;
const SFX_MAX_TILES = 10;
/** Janela do duplo clique num item do chão (ms). */
const GROUND_DBL_MS = 350;
/** Janela para o segundo botão do "olhar" (os dois botões juntos raramente chegam a mais de ~60 ms um do outro). */
const CHORD_MS = 120;
/** Testes E2E (Playwright): expõe window.__lq (ver installE2EProbe). */
const E2E_PROBE = typeof location !== "undefined" && new URLSearchParams(location.search).has("e2e");
const PROJECTILE_MS = 180;
const BATTLE_PUBLISH_MS = 200;

export class WorldScene extends Phaser.Scene {
  private world!: WorldMap;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private pcam!: PixelCamera;

  private room: Room | null = null;
  private myId = "";
  private actors = new Map<string, Actor>();
  private known = new Map<string, Known>();
  /** Roupa/addons já aplicados por jogador ("outfit|addons"). */
  private lookSig = new Map<string, string>();
  private creatures = new Map<string, Actor>();
  private creatureKnown = new Map<string, Known>();
  private creatureInfo = new Map<string, CreatureInfo>();
  private dying = new Set<string>();
  /** Última posição de criaturas já removidas (para números de dano que chegam depois). */
  private gone = new Map<string, { x: number; y: number; at: number }>();
  private predictor!: Predictor;
  private input_!: KeyboardInput;
  private moveSeq = 0;
  /** Último PlayerView.bump visto do próprio jogador (passo recusado pelo servidor). */
  private lastBump = 0;
  private myLevel = 1;
  private myMaxHp = 1;

  private fx!: CombatFx;
  private spells!: SpellEffects;
  private npcs!: NpcManager;
  private chestLabels!: ChestLabels;
  private loot!: LootFx;
  private ground!: GroundItems;
  /** Item do chão clicado de longe: pega ao chegar ao lado (cancelado por movimento manual). */
  /** Ação num item do chão longe (pegar / mover): anda até ele e executa ao chegar ao lado. */
  private pendingGround: { id: string; until: number; run: () => void } | null = null;
  private lastGroundClick = { id: "", at: 0 };
  /** Último clique com efeito desfazível (mirar): o "olhar" com os dois botões desfaz o que o primeiro botão fez. */
  private lastClick: { at: number; undo?: () => void } = { at: 0 };
  /** Clique simples num item do chão: anda só depois da janela do duplo clique (duplo clique = pegar sem sair do lugar). */
  private groundWalkTimer = 0;
  /** Ação de um botão esperando para ver se o outro chega ("olhar" com os dois botões). */
  private chordTimer = 0;
  private butterflies!: Butterflies;
  private guide!: GuideArrow;
  private bobbers!: FishBobbers;
  /** Escuridão do ciclo dia/noite + luzes dinâmicas (game/lighting.ts). */
  private lightField!: LightField;
  /** NPC clicado de longe: abre ao chegar (cancelado por movimento manual). */
  private pendingNpc: { id: string; until: number; statue?: boolean; questObj?: boolean } | null = null;
  private statues!: StatueIndex;
  /** Baús e alavancas de quest (clique = andar até o lado e usar). */
  private questObjs!: QuestObjectIndex;
  private myVocation = "";
  private unlockedUpTo = 0;
  private hover!: Phaser.GameObjects.Image;
  private targetMark!: Phaser.GameObjects.Image;
  private targetFill!: Phaser.GameObjects.Image;
  /** Quadrado verde no jogador que está sendo seguido (como no Tibia). */
  private followMark!: Phaser.GameObjects.Image;
  private curTarget = "";
  private targetSentAt = -1e9;
  private battleAcc = 0;
  private battleSig = "";
  private goneAcc = 0;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private splash!: Phaser.GameObjects.Particles.ParticleEmitter;
  private disposers: (() => void)[] = [];
  /** onChange por entidade (coleção:id → desligador): solto no onRemove, senão acumulam a cada respawn/item visto. */
  private entityOffs = new Map<string, () => void>();

  constructor() { super("world"); }

  preload() {
    this.trackLoading();
    preloadWorldMap(this);
    for (const s of [...ALL_SHEETS, ...ADDON_SHEET_LIST, ...allCreatureSheets(), ...allNpcSheets()]) {
      this.load.spritesheet(s.key, `${import.meta.env.BASE_URL}${s.url}`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    }
    CombatFx.preload(this);
    LootFx.preload(this);
  }

  /** Alimenta a tela de carregamento com o progresso REAL do loader (mapa, tilesets, sprites, efeitos). */
  private trackLoading() {
    const sheetKeys = new Set([...ALL_SHEETS, ...ADDON_SHEET_LIST, ...allCreatureSheets(), ...allNpcSheets()].map((s) => s.key));
    const labelFor = (key: string) =>
      key === MAP_KEY || key.startsWith("tileset:") ? "Carregando mapa…" : sheetKeys.has(key) ? "Carregando personagens…" : "Carregando efeitos…";
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => loading.report("files", v));
    this.load.on(Phaser.Loader.Events.FILE_PROGRESS, (file: Phaser.Loader.File) => loading.report("files", 0, labelFor(file.key)));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn("[load] falhou:", file.key, file.url);
      // Só o mapa e os tilesets são indispensáveis; sprites opcionais ausentes são tolerados.
      if (file.key === MAP_KEY || file.key.startsWith("tileset:")) loading.fail();
    });
  }

  create() {
    createFxTextures(this);
    createCharacterAnims(this, [...ALL_SHEETS, ...allCreatureSheets(), ...allNpcSheets().filter((s) => this.textures.exists(s.key))]);
    CombatFx.createAnims(this);
    LootFx.createAnims(this);
    // Fonte pixel dos números flutuantes (a CSS é carregada pelo styles.css; garante antes do 1º uso).
    void document.fonts?.load('600 16px "Pixelify Sans"');
    this.input.mouse?.disableContextMenu();
    // Grupo: nomes verdes + escudinho nos membros.
    const offParty = partyStore.subscribe(() => this.refreshPartyCues());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offParty);
    // Voltou para a aba: quem acumulou passos com a aba escondida vai direto ao tile (sem correr a fila acelerado).
    const offTab = onTabReturn(() => settleActors(this.actors.values(), this.creatures.values()));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offTab);

    // Duas "camadas" de render: mundo (câmera principal, com zoom) e UI (nomes nítidos, zoom 1).
    this.worldLayer = this.add.layer().setDepth(0);
    this.uiLayer = this.add.layer().setDepth(1);
    this.world = buildWorldMap(this);
    this.world.below.forEach((l, i) => this.worldLayer.add(l.setDepth(i - 100))); // abaixo de hover/alvo (5, 6) e atores (>=26)
    this.world.above.forEach((l, i) => this.worldLayer.add(l.setDepth(DEPTH_ABOVE + i)));

    const main = this.cameras.main;
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, "ui");
    this.uiLayer.cameraFilter |= main.id;
    this.worldLayer.cameraFilter |= this.uiCam.id;

    // Camada de luz: só a câmera de UI a desenha (zoom 1), entre o mundo e os nomes/barras.
    const lightLayer = this.add.layer().setDepth(0.5);
    lightLayer.cameraFilter |= main.id;
    this.pcam = new PixelCamera(main, this.world.widthPx, this.world.heightPx);
    this.lightField = new LightField(this, lightLayer, this.pcam, this.world.tiled, {
      me: () => { const a = this.actors.get(this.myId); return a ? { x: a.bodyX, y: a.bodyY, tileX: a.tileX, tileY: a.tileY } : null; },
      others: () => this.otherBodies(),
    });
    this.pcam.jumpTo((this.world.spawn.x + 0.5) * TILE_SIZE, (this.world.spawn.y + 0.5) * TILE_SIZE);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    this.createFx();
    this.fx = new CombatFx(this, this.worldLayer, this.uiLayer, this.pcam);
    this.fx.onImpact = (ev) => this.applyHit(ev as CombatEvent);
    this.spells = new SpellEffects(this, this.worldLayer, this.fx, this.pcam, {
      actor: (id) => this.findActor(id),
      myId: () => this.myId,
      shake: (ms, i) => { if (!reducedMotion()) this.cameras.main.shake(ms, i); },
    });
    this.predictor = new Predictor({
      grid: this.world.grid,
      spawn: this.world.spawn,
      groundSpeed: this.world.groundSpeed,
      isOccupied: (x, y) => this.isOccupiedByOther(x, y),
    });
    this.input_ = new KeyboardInput({
      onDir: (d) => this.onInputDir(d),
      onTurn: (d) => this.onInputTurn(d),
    });
    this.npcs = new NpcManager(this, () => this.actorDeps(), this.uiLayer);
    this.npcs.addFromMap(this.world.tiled);
    this.statues = new StatueIndex(this.world.tiled);
    this.questObjs = new QuestObjectIndex(this.world.tiled);
    this.chestLabels = new ChestLabels(this, this.uiLayer, this.questObjs.list);
    this.loot = new LootFx(this, this.worldLayer, this.uiLayer, this.fx, () => {
      const me = this.actors.get(this.myId);
      return me ? { x: me.bodyX, y: me.bodyY, headY: me.headY } : null;
    });
    this.ground = new GroundItems(this, this.worldLayer, this.uiLayer);
    setGroundBridge({
      tileAt: (cx, cy) => {
        const r = this.game.canvas.getBoundingClientRect();
        const wp = this.cameras.main.getWorldPoint(cx - r.left, cy - r.top);
        const x = Math.floor(wp.x / TILE_SIZE), y = Math.floor(wp.y / TILE_SIZE);
        return x >= 0 && y >= 0 && x < this.world.grid.width && y < this.world.grid.height ? { x, y } : null;
      },
      myTile: () => { const k = this.known.get(this.myId); return k ? { x: k.x, y: k.y } : null; },
      moveGround: (id, x, y, count) => this.moveGround(id, x, y, count),
    });
    this.disposers.push(() => setGroundBridge(null));
    const homes = [this.world.spawn, ...["herbalist", "shop"].map((id) => this.npcs.tileOf(id)).filter((t): t is { x: number; y: number } => !!t)];
    this.butterflies = new Butterflies(this, this.worldLayer, homes);
    this.guide = new GuideArrow(this, this.uiLayer);
    this.bobbers = new FishBobbers(this, this.uiLayer);
    this.setupPointer();
    this.disposers.push(subscribeTarget((t) => this.onStoreTarget(t)));
    // Janela foi para um monitor com outra escala: textos existentes na nova resolução (os novos já nascem nela).
    this.disposers.push(onTextResChange((r) => applyTextRes(this, r)));

    this.disposers.push(session.onRoom((room) => this.bindRoom(room)));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    if (FXTEST) {
      // ?at=x,y põe o personagem de teste noutro lugar do mapa (ex.: cavernas) para checar iluminação.
      const at = /^(\d+),(\d+)$/.exec(new URLSearchParams(location.search).get("at") ?? "");
      startFxTest(this, at ? { x: Number(at[1]), y: Number(at[2]) } : this.world.spawn, (x, y) => this.world.grid.isWalkable(x, y));
    }
    if (E2E_PROBE) this.installE2EProbe();

    // Mapa montado: avisa a tela de carregamento depois do 1º frame realmente desenhado.
    loading.report("create", 1, "Preparando o mundo…");
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => requestAnimationFrame(() => loading.mapReady()));
  }

  // --- rede -----------------------------------------------------------------

  private bindRoom(room: Room) {
    if (this.room === room) return;
    this.unbindRoom();
    this.room = room;
    this.myId = room.sessionId;
    // Estado do servidor não tem tipos no cliente: espelha PlayerView/MonsterView (shared/types.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $ = Callbacks.get(room as any) as any;
    const offAdd = $.onAdd("players", (p: PlayerView, id: string) => {
      this.addPlayer(id, p);
      this.trackEntity(`p:${id}`, $.onChange(p, () => this.onPlayerChange(id, p)));
    });
    const offRemove = $.onRemove("players", (_p: PlayerView, id: string) => { this.untrackEntity(`p:${id}`); this.removePlayer(id); });
    this.disposers.push(offAdd, offRemove);

    try {
      const mAdd = $.onAdd("monsters", (m: MonsterView, id: string) => {
        this.addMonster(id, m);
        this.trackEntity(`m:${id}`, $.onChange(m, () => this.onMonsterChange(id, m)));
      });
      const mRemove = $.onRemove("monsters", (_m: MonsterView, id: string) => { this.untrackEntity(`m:${id}`); this.removeMonster(id); });
      this.disposers.push(mAdd, mRemove);
    } catch (e) {
      console.warn("[combate] state.monsters indisponível", e);
    }

    try {
      this.ground.beginSync();
      const gAdd = $.onAdd("groundItems", (g: GroundItemView, id: string) => {
        this.ground.add(id, g);
        this.trackEntity(`g:${id}`, $.onChange(g, () => this.ground.change(id, g)));
      });
      const gRemove = $.onRemove("groundItems", (_g: GroundItemView, id: string) => { this.untrackEntity(`g:${id}`); this.ground.remove(id); });
      this.disposers.push(gAdd, gRemove);
    } catch (e) {
      console.warn("[chão] state.groundItems indisponível", e);
    }

    try {
      // Relógio do mundo (ciclo dia/noite): o estado traz worldTimeMs; o cliente extrapola.
      this.disposers.push($.listen("worldTimeMs", (v: number) => worldClock.setServerTime(v)));
    } catch (e) {
      console.warn("[dia/noite] state.worldTimeMs indisponível", e);
    }

    const msg = <T>(type: string, fn: (m: T) => void) => {
      const off = room.onMessage(type, fn) as unknown;
      if (typeof off === "function") this.disposers.push(off as () => void);
    };
    msg<CombatMsg>(S2C.Combat, (m) => this.onCombat(m.events));
    msg<XpGainMsg>(S2C.XpGain, (m) => this.onXpGain(m.amount));
    msg<LevelUpMsg>(S2C.LevelUp, (m) => this.onLevelUp(m.level));
    msg<SpellCastMsg>(S2C.SpellCast, (m) => this.onSpellCast(m));
    msg<MonsterTelegraphMsg>(S2C.MonsterTelegraph, (m) => this.onTelegraph(m));
    msg<ConditionsMsg>(S2C.Conditions, (m) => this.onConditions(m));
    msg<SkillUpMsg>(S2C.SkillUp, (m) => this.onSkillUp(m));
    msg<ChatMessage>(S2C.Chat, (m) => this.onChatBubble(m));
    msg<FishCastMsg>(S2C.FishCast, (m) => this.bobbers.cast(m));
    msg<EmoteMsg>(S2C.Emote, (m) => { const e = EMOTES.find((x) => x.id === m.emote); if (e) this.actors.get(m.id)?.emote(e.glyph, e.color); });
    msg<NpcSayMsg>(S2C.NpcSay, (m) => this.npcs.say(m.npcId, m.text));
    msg<NpcOpenMsg>(S2C.NpcOpen, (m) => this.npcs.say(m.npcId, m.greeting));
    msg<LootMsg>(S2C.Loot, (m) => this.onLoot(m));
    msg<DiedMsg>(S2C.Died, (m) => this.onDied(m.killerName, m.lostXp, m));
    msg<CreatureDiedMsg>(S2C.CreatureDied, (m) => this.onCreatureDied(m));
    room.onLeave(() => { if (this.room === room) this.unbindRoom(); });
  }

  /** Fala do canal geral (amarelo) ou do grupo (azul) aparece sobre a cabeça de quem falou (estilo Tibia). */
  private onChatBubble(m: ChatMessage) {
    if (m.channel !== "global" && m.channel !== "party") return;
    for (const a of this.actors.values()) if (a.name === m.from) { a.speak(m.text, m.channel === "party" ? SPEECH_COLOR_PARTY : undefined); return; }
  }

  /** Guarda o onChange de uma entidade (troca o anterior, se o mesmo id reaparecer). */
  private trackEntity(key: string, off: unknown) {
    this.entityOffs.get(key)?.();
    if (typeof off === "function") this.entityOffs.set(key, off as () => void);
    else this.entityOffs.delete(key);
  }

  private untrackEntity(key: string) {
    this.entityOffs.get(key)?.();
    this.entityOffs.delete(key);
  }

  private unbindRoom() {
    for (const off of this.entityOffs.values()) off();
    this.entityOffs.clear();
    for (const a of this.actors.values()) a.destroy();
    for (const a of this.creatures.values()) a.destroy();
    this.actors.clear();
    this.known.clear();
    this.lookSig.clear();
    this.creatures.clear();
    this.creatureKnown.clear();
    this.creatureInfo.clear();
    this.dying.clear();
    this.gone.clear();
    this.battleSig = "";
    this.ground?.clear();
    this.pendingGround = null;
    clearBattleEntries("monsters");
    this.room = null;
  }

  /** Corpos dos outros jogadores (para a luz pessoal deles). */
  private *otherBodies() {
    for (const [id, a] of this.actors) if (id !== this.myId) yield { x: a.bodyX, y: a.bodyY };
  }

  private actorDeps(): ActorDeps {
    return { scene: this, worldLayer: this.worldLayer, uiLayer: this.uiLayer, snap: this.pcam.snap, onStepStart: (x, y) => this.footstep(x, y) };
  }

  addPlayer(id: string, p: PlayerView) {
    if (this.actors.has(id)) return;
    const isMe = id === this.myId;
    const actor = new Actor(this.actorDeps(), outfitLook(p.outfit, p.addons, p.vocation, p.tone), p.name, isMe, p.x, p.y, p.dir, { hpName: true });
    this.lookSig.set(id, `${p.outfit}|${p.addons}|${p.tone}`);
    actor.setTitle(p.title ?? "");
    actor.setSkull(p.skull ?? "");
    actor.setHp(p.hp, p.maxHp, true);
    this.actors.set(id, actor);
    if (isPartyMember(id)) actor.setParty(true);
    this.known.set(id, { x: p.x, y: p.y, dir: p.dir, stepMs: p.stepMs });
    if (isMe) {
      this.predictor.level = p.level;
      this.predictor.speedPct = p.speedPct ?? 100;
      this.predictor.reset(p.x, p.y, p.dir);
      this.pcam.jumpTo((p.x + 0.5) * TILE_SIZE, (p.y + 0.5) * TILE_SIZE);
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => requestAnimationFrame(() => loading.worldReady()));
      this.setMyStats(p.level, p.maxHp);
      this.myVocation = p.vocation;
      this.unlockedUpTo = p.level;
      if (p.targetId) this.onServerTarget(p.targetId);
    }
  }

  private removePlayer(id: string) {
    this.actors.get(id)?.destroy();
    this.actors.delete(id);
    this.known.delete(id);
    this.lookSig.delete(id);
  }

  onPlayerChange(id: string, p: PlayerView) {
    const actor = this.actors.get(id);
    const k = this.known.get(id);
    if (!actor || !k) return;
    actor.setHp(p.hp, p.maxHp);
    actor.setTitle(p.title ?? "");
    actor.setSkull(p.skull ?? "");
    const sig = `${p.outfit}|${p.addons}|${p.tone}`;
    if (this.lookSig.get(id) !== sig) { this.lookSig.set(id, sig); actor.setLook(outfitLook(p.outfit, p.addons, p.vocation, p.tone)); }
    const moved = p.x !== k.x || p.y !== k.y;
    const turned = p.dir !== k.dir;
    k.x = p.x; k.y = p.y; k.dir = p.dir; k.stepMs = p.stepMs;

    if (id === this.myId) {
      this.predictor.level = p.level;
      this.predictor.speedPct = p.speedPct ?? 100;
      this.setMyStats(p.level, p.maxHp);
      this.onServerTarget(p.targetId ?? "");
      const bumped = (p.bump ?? 0) !== this.lastBump;
      this.lastBump = p.bump ?? 0;
      if (moved) {
        const now = performance.now();
        const r = this.predictor.onServerPos(p.x, p.y, p.stepMs, now);
        // Passo do servidor (clique, perseguição) também pelo relógio, a partir da chegada: emenda no fim do anterior em
        // vez do catch-up. A cadência do servidor é exata, então a variação da chegada (tick + patch, ±50 ms) só atrasa
        // o primeiro passo; com o catch-up o boneco alternava parada e tranco a cada tile.
        if (r.kind === "external") this.moveVisual(id, actor, p.x, p.y, r.ms, p.dir, now);
        else if (r.kind === "diverged") actor.correctTo(p.x, p.y);
      }
      // Passo recusado (monstro entrou no tile, bloqueio de PvP): corrige já, sem esperar o tempo-limite.
      if (bumped && this.predictor.onRefused(p.x, p.y, performance.now())) actor.correctTo(p.x, p.y);
      return; // sem mudar de tile, a direção local é a da predição
    }

    if (moved) this.moveVisual(id, actor, p.x, p.y, p.stepMs, p.dir);
    else if (turned) actor.face(p.dir);
  }

  /** Último SpellCast "charge" por conjurador (para transformar o salto do servidor em deslize). */
  private chargeAt = new Map<string, number>();
  private recentCharge(id: string) { return performance.now() - (this.chargeAt.get(id) ?? -1e9) < 500; }

  /**
   * Movimento visual: saltos de 2+ tiles junto de uma investida viram um deslize de ~120 ms. `at` = passo no relógio
   * (Segment.at), só para o próprio jogador.
   */
  private moveVisual(id: string, actor: Actor, x: number, y: number, ms: number, dir: Dir, at?: number) {
    const far = Math.max(Math.abs(x - actor.tileX), Math.abs(y - actor.tileY)) >= 2;
    if (!far) { actor.stepTo(x, y, ms, dir, at); return; }
    const apply = () => {
      // O ator pode ter saído (logout logo após o teleporte) ou sido recriado nesses 40 ms.
      if (this.actors.get(id) !== actor) return;
      if (this.recentCharge(id)) actor.dashTo(x, y, 120, dir);
      else actor.stepTo(x, y, ms, dir);
    };
    if (this.recentCharge(id)) apply(); else this.time.delayedCall(40, apply);
  }

  private setMyStats(level: number, maxHp: number) {
    this.myMaxHp = maxHp;
    if (level !== this.myLevel) {
      this.myLevel = level;
      this.recolorCreatures();
    }
  }

  // --- criaturas ------------------------------------------------------------

  addMonster(id: string, m: MonsterView) {
    if (this.creatures.has(id)) return;
    const v = creatureVisual(m.defId);
    const elite = !!m.elite;
    const name = elite ? eliteName(v.name) : v.name;
    // Elite: "★" antes do nome (a cor fica com a dificuldade — ver creatureColor).
    const actor = new Actor(
      this.actorDeps(), v.look, (v.boss ? "☠ " : "") + (elite ? `${ELITE_GLYPH} ` : "") + name, false, m.x, m.y, m.dir,
      { scale: v.scale, fontSize: v.boss ? 12 : 10, nameColor: creatureColor(v.level, this.myLevel, v.boss, elite), trim: sheetTrim(this, v.look.sheet) },
    );
    actor.setHp(m.hp, m.maxHp, true);
    this.creatures.set(id, actor);
    this.creatureKnown.set(id, { x: m.x, y: m.y, dir: m.dir, stepMs: m.stepMs });
    this.creatureInfo.set(id, { defId: m.defId, name, level: v.level, boss: v.boss, hp: m.hp, maxHp: m.maxHp, elite });
  }

  onMonsterChange(id: string, m: MonsterView) {
    const actor = this.creatures.get(id);
    const k = this.creatureKnown.get(id);
    const info = this.creatureInfo.get(id);
    if (!actor || !k) return;
    if (info) { info.hp = m.hp; info.maxHp = m.maxHp; }
    actor.setHp(m.hp, m.maxHp);
    const moved = m.x !== k.x || m.y !== k.y;
    const turned = m.dir !== k.dir;
    k.x = m.x; k.y = m.y; k.dir = m.dir; k.stepMs = m.stepMs;
    if (moved) actor.stepTo(m.x, m.y, m.stepMs, m.dir);
    else if (turned) actor.face(m.dir);
  }

  removeMonster(id: string) {
    const a = this.creatures.get(id);
    if (a) this.gone.set(id, { x: a.bodyX, y: a.bodyY, at: performance.now() });
    a?.destroy();
    this.creatures.delete(id);
    this.creatureKnown.delete(id);
    this.creatureInfo.delete(id);
    this.dying.delete(id);
    if (this.curTarget === id) { this.curTarget = ""; setTarget(null); }
  }

  private recolorCreatures() {
    for (const [id, a] of this.creatures) {
      const i = this.creatureInfo.get(id);
      if (i) a.setName(a.label.text, creatureColor(i.level, this.myLevel, i.boss, i.elite));
    }
  }

  private findActor(id: string): Actor | undefined {
    return this.creatures.get(id) ?? this.actors.get(id);
  }

  private isOccupiedByOther(x: number, y: number): boolean {
    for (const [id, k] of this.known) if (id !== this.myId && k.x === x && k.y === y) return true;
    // Monstros bloqueiam o movimento (posição autoritativa).
    for (const k of this.creatureKnown.values()) if (k.x === x && k.y === y) return true;
    return this.npcs.isNpcTile(x, y);
  }

  // --- alvo -----------------------------------------------------------------

  /** Store (clique / battle list / Esc) → servidor. */
  private onStoreTarget(t: Target | null) {
    const id = t?.id ?? "";
    if (id === this.curTarget) return;
    this.curTarget = id;
    this.targetSentAt = performance.now();
    this.room?.send(C2S.Attack, { targetId: t ? id : null } satisfies AttackMsg);
  }

  /** Servidor → store (ex.: alvo morreu e o servidor zerou o targetId). */
  private onServerTarget(id: string) {
    if (id === this.curTarget) return;
    // Patch atrasado (o servidor ainda não processou o nosso "attack"): ignora.
    if (this.room && performance.now() - this.targetSentAt < 500) return;
    this.curTarget = id;
    if (!id) setTarget(null);
    else setTarget({ id, kind: this.creatures.has(id) ? "monster" : "player" });
  }

  private creatureAtPointer(ptr: Phaser.Input.Pointer): string | null {
    const wp = this.worldPoint(ptr);
    let best: string | null = null, bestY = -Infinity;
    for (const [id, a] of this.creatures) {
      if (a.culled || a.ghosted) continue;
      const h = this.creatureHeight(a);
      const halfW = Math.max(TILE_SIZE / 2, (h * a.scale) / 2 * 0.6);
      const bottom = a.ry + TILE_SIZE, top = bottom - Math.max(TILE_SIZE, h * a.scale * 0.8);
      if (Math.abs(wp.x - a.bodyX) <= halfW && wp.y >= top && wp.y <= bottom && a.ry > bestY) { best = id; bestY = a.ry; }
    }
    return best;
  }

  private creatureHeight(a: Actor) { return a.sprite.frame.realHeight; }

  // --- entrada --------------------------------------------------------------

  private onInputDir(d: Dir | null) {
    if (!this.room) return;
    if (d !== null) { this.pendingNpc = null; this.pendingGround = null; window.clearTimeout(this.groundWalkTimer); window.clearTimeout(this.chordTimer); }
    // Mesma ordem do servidor: primeiro recupera um passo que já era devido com a intenção antiga.
    this.stepLocal();
    // Onde a predição está: se já deu o próximo passo da direção antiga, o servidor o completa antes de mudar.
    const at = { x: this.predictor.x, y: this.predictor.y };
    if (d === null) this.predictor.release();
    else this.predictor.press(d);
    this.room.send(C2S.Move, { dir: d, seq: ++this.moveSeq, at } satisfies MoveMsg);
    this.stepLocal(); // sem esperar o próximo frame: zero atraso percebido
  }

  private onInputTurn(d: Dir) {
    if (!this.room) return;
    this.room.send(C2S.Turn, { dir: d } satisfies TurnMsg);
    const now = performance.now();
    if (this.predictor.isFree(now)) {
      this.predictor.dir = d;
      this.actors.get(this.myId)?.face(d);
    }
  }

  private setupPointer() {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (ptr: Phaser.Input.Pointer) => {
      if (!this.room && !FXTEST) return;
      const left = ptr.leftButtonDown(), right = ptr.rightButtonDown();
      if (!left && !right) return;
      // Olhar (como no Tibia): os dois botões juntos, ou Shift + clique esquerdo.
      const sev = ptr.event as MouseEvent;
      if ((left && right) || (left && sev?.shiftKey)) {
        if (left && right) this.undoFirstButton();
        this.look(ptr);
        return;
      }
      // Um botão só: o que ele fizer pode ser desfeito se o outro chegar logo depois (vira "olhar").
      this.lastClick = { at: 0 };
      // Clique (esquerdo ou direito) numa criatura = atacar / soltar o alvo.
      const cid = this.creatureAtPointer(ptr);
      if (cid) {
        toggleTarget({ id: cid, kind: "monster" });
        this.lastClick = { at: performance.now(), undo: () => toggleTarget({ id: cid, kind: "monster" }) };
        return;
      }
      const nid = this.npcAtPointer(ptr);
      if (nid) { this.afterChord(() => this.clickNpc(nid)); return; }
      const sid = this.statueAtPointer(ptr);
      if (sid) { this.afterChord(() => this.clickStatue(sid)); return; }
      const qid = this.questObjAtPointer(ptr);
      if (qid) { this.afterChord(() => this.clickQuestObj(qid)); return; }
      if (!this.room && !FXTEST) return;
      const t = this.pointerTile(ptr);
      if (!t) return;
      // Botão direito no próprio personagem: menu (Trocar roupa / pegar item do chão / sair do grupo).
      const me = this.actors.get(this.myId);
      if (right && me && t.x === me.tileX && t.y === me.tileY) {
        const ev = ptr.event as MouseEvent;
        const gidHere = this.ground?.topAt(t.x, t.y);
        openCtxMenu(ev?.clientX ?? ptr.x, ev?.clientY ?? ptr.y, [
          { label: "Trocar roupa", run: openOutfit },
          ...(gidHere ? [{ label: "Pegar item do chão", run: () => this.pickupGround(gidHere) }] : []),
          ...(partyStore.get() ? [{ label: "Sair do grupo", run: () => partyAction({ action: "leave" }) }] : []),
        ]);
        return;
      }
      // Botão direito em outro jogador: grupo (convidar / expulsar / passar liderança) e troca de itens.
      const other = right ? this.playerAtTile(t.x, t.y) : null;
      if (other) {
        const ev = ptr.event as MouseEvent;
        const following = selectMe(playersStore.get())?.followId === other;
        const attacking = getTarget()?.id === other;
        const items = [
          { label: attacking ? "Parar de atacar" : "Atacar", run: () => toggleTarget({ id: other, kind: "player" }) },
          { label: following ? "Parar de seguir" : "Seguir", run: () => followPlayer(following ? null : other) },
          ...this.partyMenu(other), { label: "Trocar itens", run: () => requestTrade(other) },
        ];
        if (items.length) openCtxMenu(ev?.clientX ?? ptr.x, ev?.clientY ?? ptr.y, items);
        return;
      }
      // Botão direito na água: pescar (precisa da Vara de Pesca; o servidor avisa se faltar algo).
      if (right && this.world.water.isWater(t.x, t.y)) {
        const ev = ptr.event as MouseEvent;
        // Abre na hora, como os outros menus: o menu não faz nada sozinho e o "olhar" (esquerdo logo depois) o fecha.
        openCtxMenu(ev?.clientX ?? ptr.x, ev?.clientY ?? ptr.y, [{ label: "Pescar", run: () => this.room?.send(C2S.Fish, { x: t.x, y: t.y }) }]);
        return;
      }
      if (!this.room) return;
      // Item no chão: direito / Ctrl+clique / duplo clique = pegar; arrastar até a mochila = pegar; clique = andar.
      const gid = this.ground.topAt(t.x, t.y);
      if (gid) {
        const ev = ptr.event as MouseEvent;
        const now = performance.now();
        const dbl = left && this.lastGroundClick.id === gid && now - this.lastGroundClick.at < GROUND_DBL_MS;
        this.lastGroundClick = { id: left ? gid : "", at: now };
        window.clearTimeout(this.groundWalkTimer);
        if (right || ev?.ctrlKey || dbl) { this.afterChord(() => this.pickupGround(gid)); return; }
        const inst = this.ground.instanceOf(gid);
        if (inst && Number.isFinite(ev?.clientX)) {
          beginGroundPress(ev.clientX, ev.clientY, gid, inst, () => {
            this.groundWalkTimer = window.setTimeout(() => this.walkToTile(t.x, t.y), GROUND_DBL_MS);
          });
          // Olhar com o esquerdo primeiro: nem arrasto nem a caminhada do soltar.
          this.lastClick = { at: performance.now(), undo: () => { cancelDrag(); window.clearTimeout(this.groundWalkTimer); } };
          return;
        }
      }
      if (!left) return;
      this.walkToTile(t.x, t.y);
      // Andar sai na hora (sem atraso no clique mais comum); se virar "olhar", para onde estiver.
      this.lastClick = { at: performance.now(), undo: () => this.stopWalk() };
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.hover.setVisible(false));
  }

  /**
   * Ação de um botão que não dá para desfazer depois (pegar item, abrir NPC/baú/estátua): espera CHORD_MS para ver se o
   * outro botão chega (aí vira "olhar" e a ação é descartada).
   */
  private afterChord(run: () => void) {
    window.clearTimeout(this.chordTimer);
    this.chordTimer = window.setTimeout(run, CHORD_MS);
    this.lastClick = { at: performance.now(), undo: () => window.clearTimeout(this.chordTimer) };
  }

  /** Cancela um clique para andar: o servidor larga o caminho e termina só o passo em andamento. */
  private stopWalk() {
    const me = this.actors.get(this.myId);
    if (!me || !this.room) return;
    this.pendingNpc = null;
    this.pendingGround = null;
    this.room.send(C2S.WalkTo, { x: me.tileX, y: me.tileY, stop: true } satisfies WalkToMsg);
  }

  /** O segundo botão chegou logo depois do primeiro: desfaz o que o primeiro fez (alvo, menu de contexto, ação adiada). */
  private undoFirstButton() {
    if (performance.now() - this.lastClick.at < 600) this.lastClick.undo?.();
    this.lastClick = { at: 0 };
    closeCtxMenu();
  }

  /** "Olhar" o que está sob o mouse: criatura, jogador, NPC, baú/alavanca, item do chão. */
  private look(ptr: Phaser.Input.Pointer) {
    const ev = ptr.event as MouseEvent;
    const x = Number.isFinite(ev?.clientX) ? ev.clientX : ptr.x, y = Number.isFinite(ev?.clientY) ? ev.clientY : ptr.y;
    const show = (c: LookContent | null) => { if (c) showLook({ ...c, x, y }); };
    const cid = this.creatureAtPointer(ptr);
    const info = cid ? this.creatureInfo.get(cid) : undefined;
    if (info) return show(lookCreature(info, this.myLevel));
    const nid = this.npcAtPointer(ptr);
    if (nid) return show(lookNpc(nid));
    const qid = this.questObjAtPointer(ptr);
    const q = qid ? this.questObjs.get(qid) : undefined;
    if (q) return show(lookQuestObject(q.kind, q.id));
    const t = this.pointerTile(ptr);
    if (!t) return;
    const me = this.actors.get(this.myId);
    const pid = me && t.x === me.tileX && t.y === me.tileY ? this.myId : this.playerAtTile(t.x, t.y);
    const snap = pid ? playersStore.get().get(pid) : undefined;
    if (pid && snap) return show(lookPlayer(snap, { me: pid === this.myId, party: pid !== this.myId && isPartyMember(pid) }));
    const gid = this.ground?.topAt(t.x, t.y);
    if (gid && this.room) {
      expectLookItem(gid, x, y);
      this.room.send(C2S.LookGround, { groundId: gid } satisfies LookGroundMsg);
    }
  }

  /** Outro jogador (não eu) parado no tile. */
  private playerAtTile(x: number, y: number): string | null {
    for (const [id, a] of this.actors) if (id !== this.myId && a.tileX === x && a.tileY === y) return id;
    return null;
  }

  /** Itens do menu de contexto de outro jogador (grupo). */
  private partyMenu(id: string): CtxMenuItem[] {
    const inParty = !!partyStore.get();
    const leader = amLeader();
    if (isPartyMember(id, true)) {
      return leader ? [
        { label: "Passar liderança", run: () => partyAction({ action: "lead", targetId: id }) },
        { label: "Expulsar do grupo", run: () => partyAction({ action: "kick", targetId: id }) },
      ] : [];
    }
    if (inParty && !leader) return [];
    return [{ label: "Convidar para o grupo", run: () => partyAction({ action: "invite", targetId: id }) }];
  }

  /** Escudinho/nome verde nos membros do meu grupo. */
  private refreshPartyCues() {
    for (const [id, a] of this.actors) a.setParty(isPartyMember(id));
  }

  /** Clique para andar até um tile (cancela NPC/pegar pendentes). */
  private walkToTile(x: number, y: number) {
    if (!this.room) return;
    this.pendingNpc = null;
    this.pendingGround = null;
    this.room.send(C2S.WalkTo, { x, y } satisfies WalkToMsg);
    // O servidor zera a intenção de teclado ao receber walkTo; espelhamos aqui.
    this.predictor.clearIntent();
    this.input_.forgetIntent();
    this.showMarker(x, y);
  }

  /** Pegar item do chão: ao lado (ou em cima) = já; longe = anda até ficar ao lado e pega ao chegar. */
  private pickupGround(id: string) {
    const g = this.ground.get(id);
    const me = this.actors.get(this.myId);
    if (!g || !me || !this.room) return;
    this.pendingNpc = null;
    if (chebyshev(me.tileX, me.tileY, g.x, g.y) <= 1 && !me.isMoving) { this.pendingGround = null; pickupItem(id); return; }
    // Destino: o próprio tile (se livre) ou o vizinho livre mais perto.
    const onTile = this.world.grid.isWalkable(g.x, g.y) && !this.isOccupiedByOther(g.x, g.y);
    const near = this.freeNeighbor(g, me);
    const dOn = Math.hypot(g.x - me.tileX, g.y - me.tileY);
    const best = near && (!onTile || Math.hypot(near.x - me.tileX, near.y - me.tileY) < dOn) ? near : onTile ? { x: g.x, y: g.y } : null;
    if (best) this.walkForGround(id, best, () => pickupItem(id));
  }

  /**
   * Mover item do chão para (x,y): item e destino ao alcance = já; senão anda até o item (pelo lado mais perto do
   * destino) e move ao chegar. O servidor valida alcance, linha livre e tile.
   */
  private moveGround(id: string, x: number, y: number, count?: number) {
    const g = this.ground.get(id);
    const me = this.actors.get(this.myId);
    if (!g || !me || !this.room) return;
    this.pendingNpc = null;
    const run = () => moveGroundItem(id, x, y, count);
    if (!me.isMoving && chebyshev(me.tileX, me.tileY, g.x, g.y) <= DROP_RANGE && chebyshev(me.tileX, me.tileY, x, y) <= DROP_RANGE) {
      this.pendingGround = null;
      run();
      return;
    }
    // O item e os vizinhos livres; vale o mais perto do destino (empate: o mais perto de quem anda).
    let best: { x: number; y: number } | null = null, bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const tx = g.x + dx, ty = g.y + dy;
      if (!this.world.grid.isWalkable(tx, ty) || this.isOccupiedByOther(tx, ty)) continue;
      const d = chebyshev(tx, ty, x, y) * 100 + Math.hypot(tx - me.tileX, ty - me.tileY);
      if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
    }
    if (best) this.walkForGround(id, best, run);
  }

  /** Anda até `to` e executa `run` quando estiver parado ao lado do item `id` (desiste em 20 s ou se o item sumir). */
  private walkForGround(id: string, to: { x: number; y: number }, run: () => void) {
    if (!this.room) return;
    this.room.send(C2S.WalkTo, { x: to.x, y: to.y } satisfies WalkToMsg);
    this.predictor.clearIntent();
    this.input_.forgetIntent();
    this.showMarker(to.x, to.y);
    this.pendingGround = { id, until: performance.now() + 20_000, run };
  }

  private checkPendingGround() {
    const p = this.pendingGround;
    if (!p) return;
    const g = this.ground.get(p.id);
    const me = this.actors.get(this.myId);
    if (!g || !me || performance.now() > p.until) { this.pendingGround = null; return; }
    if (!me.isMoving && chebyshev(me.tileX, me.tileY, g.x, g.y) <= 1) { this.pendingGround = null; p.run(); }
  }

  private npcAtPointer(ptr: Phaser.Input.Pointer): string | null {
    const wp = this.worldPoint(ptr);
    return this.npcs.atPoint(wp.x, wp.y);
  }

  private statueAtPointer(ptr: Phaser.Input.Pointer): string | null {
    const wp = this.worldPoint(ptr);
    return this.statues.atPoint(wp.x, wp.y);
  }

  private questObjAtPointer(ptr: Phaser.Input.Pointer): string | null {
    const wp = this.worldPoint(ptr);
    return this.questObjs.atPoint(wp.x, wp.y);
  }

  /** Clique num baú/alavanca de quest: ao lado = usa; longe = anda até o tile vizinho mais próximo e usa ao chegar. */
  private clickQuestObj(key: string) {
    const me = this.actors.get(this.myId);
    const s = this.questObjs.get(key);
    if (!s || !this.room || !me) return;
    if (chebyshev(me.tileX, me.tileY, s.x, s.y) <= QUEST_OBJECT_RANGE) { this.pendingNpc = null; useQuestObject(s); return; }
    const best = this.freeNeighbor(s, me);
    if (!best) return;
    this.room.send(C2S.WalkTo, { x: best.x, y: best.y } satisfies WalkToMsg);
    this.predictor.clearIntent();
    this.input_.forgetIntent();
    this.showMarker(best.x, best.y);
    this.pendingNpc = { id: key, until: performance.now() + 20_000, questObj: true };
  }

  /** Tile andável e livre ao redor da pegada da estátua, o mais perto do jogador. */
  private freeStatueNeighbor(id: string, me: Actor): { x: number; y: number } | null {
    const t = this.statues.tileOf(id);
    if (!t) return null;
    let best: { x: number; y: number } | null = null, bestD = Infinity;
    for (let y = t.y - 2; y <= t.y + 1; y++) for (let x = t.x - 1; x <= t.x + 2; x++) {
      if (this.statues.distance(id, x, y) !== 1) continue;
      if (!this.world.grid.isWalkable(x, y) || this.isOccupiedByOther(x, y)) continue;
      const d = Math.hypot(x - me.tileX, y - me.tileY);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    return best;
  }

  /** Tile andável e livre ao lado de (t), o mais perto do jogador (null = nenhum). */
  private freeNeighbor(t: { x: number; y: number }, me: Actor): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null, bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = t.x + dx, y = t.y + dy;
      if (!this.world.grid.isWalkable(x, y) || this.isOccupiedByOther(x, y)) continue;
      const d = Math.hypot(x - me.tileX, y - me.tileY) + (dx && dy ? 0.5 : 0);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    return best;
  }

  /** Clique numa estátua de treino: ao lado = pede a escolha de skill; longe = anda até ficar ao lado e pede. */
  private clickStatue(id: string) {
    const me = this.actors.get(this.myId);
    const t = this.statues.tileOf(id);
    if (!t || !this.room || !me) return;
    if (this.statues.distance(id, me.tileX, me.tileY) <= STATUE_RANGE) { this.pendingNpc = null; openStatue(id); return; }
    const best = this.freeStatueNeighbor(id, me);
    if (!best) return;
    this.room.send(C2S.WalkTo, { x: best.x, y: best.y } satisfies WalkToMsg);
    this.predictor.clearIntent();
    this.input_.forgetIntent();
    this.showMarker(best.x, best.y);
    this.pendingNpc = { id, until: performance.now() + 20_000, statue: true };
  }

  /** Clique num NPC: perto = abre; longe = anda até o tile vizinho mais próximo e abre ao chegar. Nunca ataca. */
  private clickNpc(id: string) {
    const me = this.actors.get(this.myId);
    const t = this.npcs.tileOf(id);
    if (!t) return;
    if (!me) { openNpc(id); return; }
    if (chebyshev(me.tileX, me.tileY, t.x, t.y) <= NPC_RANGE) { this.pendingNpc = null; openNpc(id); return; }
    if (!this.room) return;
    let best: { x: number; y: number } | null = null, bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = t.x + dx, y = t.y + dy;
      if (!this.world.grid.isWalkable(x, y) || this.isOccupiedByOther(x, y)) continue;
      const d = Math.hypot(x - me.tileX, y - me.tileY) + (dx && dy ? 0.5 : 0);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    if (!best) return;
    this.room.send(C2S.WalkTo, { x: best.x, y: best.y } satisfies WalkToMsg);
    this.predictor.clearIntent();
    this.input_.forgetIntent();
    this.showMarker(best.x, best.y);
    this.pendingNpc = { id, until: performance.now() + 20_000 };
  }

  /** Abre o NPC pendente ao chegar perto (ou desiste por tempo). */
  private checkPendingNpc() {
    const p = this.pendingNpc;
    if (!p) return;
    const me = this.actors.get(this.myId);
    if (p.questObj) {
      const s = this.questObjs.get(p.id);
      if (!me || !s || performance.now() > p.until) { this.pendingNpc = null; return; }
      if (!me.isMoving && chebyshev(me.tileX, me.tileY, s.x, s.y) <= QUEST_OBJECT_RANGE) { this.pendingNpc = null; useQuestObject(s); }
      return;
    }
    const t = p.statue ? this.statues.tileOf(p.id) : this.npcs.tileOf(p.id);
    if (!me || !t || performance.now() > p.until) { this.pendingNpc = null; return; }
    if (p.statue) {
      if (!me.isMoving && this.statues.distance(p.id, me.tileX, me.tileY) <= STATUE_RANGE) { this.pendingNpc = null; openStatue(p.id); }
      return;
    }
    if (!me.isMoving && chebyshev(me.tileX, me.tileY, t.x, t.y) <= NPC_RANGE) { this.pendingNpc = null; openNpc(p.id); }
  }

  /**
   * Sonda dos testes E2E (só com ?e2e na URL): leitura do estado já sincronizado e conversão tile → pixel da página,
   * para o Playwright clicar/arrastar no mundo como um jogador. Não envia nada ao servidor.
   */
  private installE2EProbe() {
    const canvasRect = () => this.game.canvas.getBoundingClientRect();
    let lastScroll = "", stableFrames = 0;
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
      const c = this.cameras.main, sig = `${c.scrollX.toFixed(2)},${c.scrollY.toFixed(2)}`;
      stableFrames = sig === lastScroll ? stableFrames + 1 : 0;
      lastScroll = sig;
    });
    (window as unknown as Record<string, unknown>).__lq = {
      myId: () => this.myId,
      me: () => {
        const a = this.actors.get(this.myId), k = this.known.get(this.myId);
        return a && k ? { x: k.x, y: k.y, tileX: a.tileX, tileY: a.tileY, moving: a.isMoving } : null;
      },
      /** Snapshot completo do jogador local (level, hp, outfit, skills…). */
      meState: () => selectMe(playersStore.get()),
      inventory: () => inventoryStore.get(),
      /**
       * Jogador parado, câmera parada há alguns frames E centrada nele: coordenadas de tela confiáveis. Sem a última
       * condição, logo após um /tp o estado já mudou, o ator ainda não saltou (40 ms) e a câmera ainda nem começou a
       * seguir: `stableFrames` continua alto e o clique cairia fora da tela (foi o que derrubou o CI no ciclo 8).
       */
      settled: () => {
        const a = this.actors.get(this.myId);
        return !!a && stableFrames >= 3 && !a.isMoving && this.pcam.isCenteredOn(a.rx + TILE_SIZE / 2, a.ry + TILE_SIZE / 2);
      },
      players: () => [...this.known].map(([id, k]) => ({ id, x: k.x, y: k.y })),
      /** Reconciliações da predição do próprio jogador (diagnóstico de lag) e a espera atual pela confirmação. */
      predStats: () => ({ ...this.predictor.stats, timeoutMs: this.predictor.confirmTimeoutMs }),
      monsters: () => [...this.creatureKnown].filter(([id]) => !this.dying.has(id))
        .map(([id, k]) => ({ id, x: k.x, y: k.y, ...this.creatureInfo.get(id) })),
      ground: () => this.ground?.all() ?? [],
      /** Seta-guia do novato (null = escondida). */
      guide: () => this.guide?.shown ?? null,
      /** Água (pesca) e quantas boias estão na tela. */
      isWater: (x: number, y: number) => this.world.water.isWater(x, y),
      bobbers: () => this.bobbers?.count ?? 0,
      /** Falas visíveis sobre a cabeça dos jogadores (balões do chat). */
      speech: () => [...this.actors.values()].flatMap((a) => a.speechLines().map((l) => ({ from: a.name, ...l }))),
      target: () => this.curTarget,
      spellCd: (id: string) => spellCooldownLeft(id),
      textResolutions: () => sceneTexts(this).reduce<Record<string, number>>((acc, t) => { acc[t.style.resolution] = (acc[t.style.resolution] ?? 0) + 1; return acc; }, {}),
      walkable: (x: number, y: number) => this.world.grid.isWalkable(x, y),
      statues: () => this.statues.list.map((s) => ({ id: s.id, x: s.x, y: s.y })),
      npcTile: (id: string) => this.npcs.tileOf(id),
      /** Marcador de missão sobre o NPC ("available" | "progress" | "ready" | null). */
      npcMarker: (id: string) => this.npcs.markerOf(id),
      /** Centro do tile (x,y) em coordenadas de página (px CSS). */
      tileToClient: (x: number, y: number, fy = 0.5) => {
        const r = canvasRect();
        return { x: r.left + this.pcam.toScreenX((x + 0.5) * TILE_SIZE), y: r.top + this.pcam.toScreenY((y + fy) * TILE_SIZE) };
      },
    };
  }

  private pointerTile(ptr: Phaser.Input.Pointer): { x: number; y: number } | null {
    const wp = this.worldPoint(ptr);
    const x = Math.floor(wp.x / TILE_SIZE), y = Math.floor(wp.y / TILE_SIZE);
    if (x < 0 || y < 0 || x >= this.world.grid.width || y >= this.world.grid.height) return null;
    return { x, y };
  }

  // --- frame ----------------------------------------------------------------

  update(time: number, delta: number) {
    const dt = Math.min(delta, 100);
    // Um relógio só no quadro: a predição inicia o passo e o ator o desenha no mesmo instante (Segment.at). `time` é o
    // timestamp do requestAnimationFrame (mesma origem do performance.now, alinhado ao vsync): lido no meio do callback,
    // o performance.now variava ~1 ms por quadro e o passo andava ±6% de um quadro para o outro.
    const now = time;
    this.stepLocal(now);
    this.checkStalePrediction(now);

    for (const a of this.actors.values()) a.update(dt, now);

    const me = this.actors.get(this.myId);
    if (me) this.pcam.follow(me.rx + TILE_SIZE / 2, me.ry + TILE_SIZE / 2, dt);

    // Criaturas: culling por distância ao jogador; só as visíveis fazem trabalho de render.
    const mtx = me ? me.rx / TILE_SIZE : 0, mty = me ? me.ry / TILE_SIZE : 0;
    for (const a of this.creatures.values()) {
      a.update(dt, now);
      a.setCulled(!!me && Math.max(Math.abs(a.rx / TILE_SIZE - mtx), Math.abs(a.ry / TILE_SIZE - mty)) > CULL_TILES);
    }

    // Nomes + barras na câmera de UI (zoom 1), presos ao pixel de tela.
    const zoom = this.pcam.zoom;
    for (const a of this.actors.values()) a.placeUi(this.pcam.toScreenX(a.headX), this.pcam.toScreenY(a.headY), zoom, dt);
    for (const a of this.creatures.values()) a.placeUi(this.pcam.toScreenX(a.headX), this.pcam.toScreenY(a.headY), zoom, dt);

    this.npcs.update(dt, me);
    this.npcs.placeUi(zoom, dt, (wx) => this.pcam.toScreenX(wx), (wy) => this.pcam.toScreenY(wy));
    this.chestLabels.placeUi((wx) => this.pcam.toScreenX(wx), (wy) => this.pcam.toScreenY(wy), this.scale.width, this.scale.height);
    this.updateGuide(me, dt);
    this.bobbers.update((wx) => this.pcam.toScreenX(wx), (wy) => this.pcam.toScreenY(wy));
    this.checkPendingNpc();
    this.checkPendingGround();
    this.ground.update(dt, me ? { tx: me.tileX, ty: me.tileY } : null, (wx, wy) => ({ x: this.pcam.toScreenX(wx), y: this.pcam.toScreenY(wy) }), zoom);
    this.butterflies.update(time, me ? me.rx : this.world.spawn.x * TILE_SIZE, me ? me.ry : this.world.spawn.y * TILE_SIZE);
    this.loot.update(dt);
    this.fx.update(dt);
    this.spells.update(dt, time);
    this.lightField.update(dt, time);
    this.updateHover();
    this.updateTargetMark(time);

    this.battleAcc += dt;
    if (this.battleAcc >= BATTLE_PUBLISH_MS) { this.battleAcc = 0; this.publishBattle(); }
    this.goneAcc += dt;
    if (this.goneAcc > 2000) {
      this.goneAcc = 0;
      const now = performance.now();
      for (const [id, g] of this.gone) if (now - g.at > 2500) this.gone.delete(id);
      if (this.dying.size > 200) this.dying.clear();
    }
  }

  /** Seta-guia da primeira missão (só personagem novo): aponta o Capitão ou a floresta, conforme o andamento. */
  private updateGuide(me: Actor | undefined, dt: number) {
    const inset = getHudInsets();
    const area = { w: this.scale.width, h: this.scale.height, right: inset.right, bottom: inset.bottom };
    const st = selectMe(playersStore.get());
    const target = me && st ? guideTarget(st.level, questStore.get(), inventoryCounter()) : null;
    const tile = target ? (target.kind === "npc" ? this.npcs.tileOf(target.id) : target) : null;
    if (!me || !target || !tile) { this.guide.update(dt, null, area); return; }
    const dist = Math.max(Math.abs(me.tileX - tile.x), Math.abs(me.tileY - tile.y));
    // Perto do destino a seta já cumpriu o papel (e o "!" do NPC aparece sobre ele).
    if (dist <= 2) { this.guide.update(dt, null, area); return; }
    this.guide.update(dt, { sx: this.pcam.toScreenX((tile.x + 0.5) * TILE_SIZE), sy: this.pcam.toScreenY(tile.y * TILE_SIZE), dist, label: target.label }, area);
  }

  /** Avança a predição local (pode iniciar um passo). */
  private stepLocal(now = performance.now()) {
    const me = this.actors.get(this.myId);
    if (!me || !this.room) return;
    const ev = this.predictor.update(now);
    if (!ev) return;
    if (ev.kind === "step") me.stepTo(ev.x, ev.y, ev.ms, ev.dir, ev.at);
    else me.face(ev.dir);
  }

  private checkStalePrediction(now: number) {
    const me = this.actors.get(this.myId);
    const k = this.known.get(this.myId);
    if (!me || !k) return;
    if (this.predictor.checkStale(k.x, k.y, now)) me.correctTo(k.x, k.y);
  }

  /** Criaturas a até 10 tiles → battle list (só republica se mudou). */
  private publishBattle() {
    const me = this.actors.get(this.myId);
    if (!me) return;
    const list: BattleEntry[] = [];
    let sig = `${this.myLevel};`; // level do jogador muda a cor/dificuldade das criaturas
    for (const [id, i] of this.creatureInfo) {
      const k = this.creatureKnown.get(id);
      if (!k || this.dying.has(id)) continue;
      const d = chebyshev(k.x, k.y, me.tileX, me.tileY);
      if (d > BATTLE_RANGE) continue;
      const pct = hpPct(i.hp, i.maxHp);
      list.push({
        id, name: i.name, hpPct: pct, kind: "monster", distance: d,
        color: creatureColor(i.level, this.myLevel, i.boss, i.elite), difficulty: levelDifficulty(i.level, this.myLevel, i.boss),
        elite: i.elite, pack: !!MONSTERS[i.defId]?.pack,
      });
      sig += `${id}:${pct}:${d};`;
    }
    if (sig === this.battleSig) return;
    this.battleSig = sig;
    list.sort((a, b) => a.distance - b.distance);
    setBattleEntries("monsters", list);
  }

  // --- combate ----------------------------------------------------------------

  onCombat(events: CombatEvent[]) {
    for (const ev of events) {
      const src = this.findActor(ev.sourceId), tgt = this.findActor(ev.targetId);
      if (ev.ranged && src && tgt && ev.sourceId !== ev.targetId) {
        const r = this.fxReach([ev.sourceId, ev.targetId]);
        if (!r.show) continue; // longe da tela: só cosmético (HP vem pelo estado)
        this.fx.projectile(ev.kind, src.bodyX, src.bodyY - 2, tgt.bodyX, tgt.bodyY, PROJECTILE_MS, ev);
        this.sfxAt(ev.kind === "fire" ? "fire" : "shoot", r.gain, { volume: 0.7 });
      } else {
        this.applyHit(ev);
      }
    }
  }

  /** Efeito visual/sonoro de um acontecimento de combate (no impacto, para projéteis). */
  private applyHit(ev: CombatEvent) {
    const tgt = this.findActor(ev.targetId);
    const src = this.findActor(ev.sourceId);
    let wx: number, wy: number;
    if (tgt) { wx = tgt.bodyX; wy = tgt.bodyY; }
    else {
      const g = this.gone.get(ev.targetId);
      if (!g) return;
      wx = g.x; wy = g.y;
    }
    const toMe = ev.targetId === this.myId;
    const fromMe = ev.sourceId === this.myId;
    const textY = wy - 4;
    const r = this.fxReach([ev.sourceId, ev.targetId], { x: wx / TILE_SIZE, y: wy / TILE_SIZE });
    if (!r.show) return;

    if (ev.miss) {
      this.fx.floatText(wx, textY, "errou", 0xb5b9c6, { size: 11, life: 650, rise: 8 });
      this.fx.puff(wx, wy + 2);
      this.sfxAt("miss", r.gain, { volume: 0.6 });
      return;
    }
    if (ev.kind === "mana") {
      if (ev.sourceId === ev.targetId) {
        // Poção de mana (auto-alvo): recuperou mana (número azul positivo).
        this.fx.floatText(wx, textY, `+${ev.amount}`, KIND_COLOR.mana, { size: ev.crit ? 20 : 15 });
        this.fx.hit("mana", wx, wy, false, 0);
        if (toMe) sfx.play("heal", { volume: 0.7, rate: 1.25 });
        return;
      }
      // Escudo de Mana: o dano saiu da mana (número azul negativo).
      this.fx.floatText(wx, textY, `-${ev.amount}`, KIND_COLOR.mana, { size: 14 });
      return;
    }
    if (ev.kind === "heal") {
      this.fx.floatText(wx, textY, `+${ev.amount}`, KIND_COLOR[ev.kind], { size: ev.crit ? 20 : 15 });
      this.fx.hit(ev.kind, wx, wy, false, 0);
      if (toMe || fromMe) sfx.play("heal", { volume: 0.8 });
      return;
    }

    const color = ev.kind === "physical" && toMe ? 0xff6b5e : KIND_COLOR[ev.kind];
    this.fx.floatText(wx, textY, ev.crit ? `${ev.amount}!` : `${ev.amount}`, color, { crit: !!ev.crit });

    let ang = 0;
    if (tgt) {
      tgt.flash(80);
      if (src && src !== tgt) {
        const dx = tgt.bodyX - src.bodyX, dy = tgt.bodyY - src.bodyY;
        tgt.nudge(dx, dy, 2);
        ang = Math.atan2(dy, dx);
      }
      if (ev.crit) tgt.hitStop(50);
    }
    this.fx.hit(ev.kind, wx, wy, !!ev.ranged, ang);

    if (toMe && (ev.crit || ev.amount > this.myMaxHp * 0.2) && !reducedMotion()) this.cameras.main.shake(140, 0.004);
    this.sfxAt(ev.crit ? "crit" : toMe ? "hurt" : "hit", r.gain, { volume: ev.crit ? 1 : 0.85 });
  }

  /**
   * Alcance de um efeito de terceiros: desenhar? com que volume? Nunca filtra o que envolve o jogador
   * local ou o grupo dele. `at` = posição (tiles) do acontecimento quando os atores já não existem.
   */
  private fxReach(ids: string[], at?: { x: number; y: number }): { show: boolean; gain: number } {
    const me = this.actors.get(this.myId);
    if (!me || ids.some((id) => id && (id === this.myId || isPartyMember(id)))) return { show: true, gain: 1 };
    let d = Infinity;
    for (const id of ids) {
      const a = id ? this.findActor(id) : undefined;
      if (a) d = Math.min(d, chebyshev(a.tileX, a.tileY, me.tileX, me.tileY));
    }
    if (at) d = Math.min(d, Math.max(Math.abs(at.x - me.tileX), Math.abs(at.y - me.tileY)));
    if (d > FX_VIEW_TILES) return { show: false, gain: 0 };
    const gain = d <= SFX_FULL_TILES ? 1 : Math.max(0, 1 - (d - SFX_FULL_TILES) / (SFX_MAX_TILES - SFX_FULL_TILES));
    return { show: true, gain };
  }

  /** sfx.play com volume escalado pela distância (gain 0 = não toca). */
  private sfxAt(name: SfxName, gain: number, opts: { volume?: number; rate?: number } = {}) {
    if (gain <= 0) return;
    sfx.play(name, { ...opts, volume: (opts.volume ?? 1) * gain });
  }

  onXpGain(amount: number) {
    const me = this.actors.get(this.myId);
    if (!me) return;
    this.fx.floatText(me.bodyX, me.headY + 2, `+${amount} XP`, 0xffd447, { size: 14, life: 1200, rise: 16, dx: 0 });
    sfx.play("xp", { volume: 0.7 });
  }

  onLevelUp(level: number) {
    const me = this.actors.get(this.myId);
    if (me) this.fx.levelUp(me.root, me.bodyX, me.ry + TILE_SIZE - 2);
    const from = this.unlockedUpTo;
    this.unlockedUpTo = Math.max(from, level);
    const fresh = this.myVocation
      ? spellsFor(this.myVocation as never).filter((s) => s.level > from && s.level <= level).map((s) => s.name)
      : [];
    showLevelBanner(level, fresh);
    sfx.play("levelup", { volume: 1 });
  }

  // --- magias, condições e skills ----------------------------------------------

  onSpellCast(m: SpellCastMsg, override?: SpellDef) {
    // Habilidade de monstro: mesmo desenho das magias (o grito vai no lugar das palavras mágicas).
    override ??= monsterAbilitySpell(m.spellId);
    if ((override ?? spellDef(m.spellId))?.fx === "charge") this.chargeAt.set(m.casterId, performance.now());
    const r = this.fxReach([m.casterId, m.targetId ?? ""], { x: m.x, y: m.y });
    if (r.show) this.spells.cast(m, override, r.gain);
  }

  /** Aviso no chão de uma habilidade de monstro (área/onda que vai cair). */
  onTelegraph(m: MonsterTelegraphMsg) {
    const at = m.tiles.length >= 2 ? { x: m.tiles[0]!, y: m.tiles[1]! } : undefined;
    if (this.fxReach([m.casterId], at).show) this.spells.telegraph(m.tiles, m.ms, m.fx);
  }

  onConditions(m: ConditionsMsg) {
    const now = Date.now();
    setConditions(m.list.map((c) => ({
      id: c.id,
      until: c.remainingMs != null && c.remainingMs > 0 ? now + c.remainingMs : undefined,
      detail: c.id === "fed" ? `+${c.value ?? 0} vida/+${c.value2 ?? 0} mana a cada 2 s` : undefined,
    })));
    this.spells.setSelfConditions(m.list.map((c) => c.id));
  }

  onSkillUp(m: SkillUpMsg) {
    pushToast({ text: `Você avançou para ${SKILL_LABELS[m.skill] ?? m.skill} ${m.level}`, kind: "good" });
    this.spells.sparkle(this.myId);
    sfx.play("skillup", { volume: 0.8 });
  }

  onDied(killerName: string, lostXp: number, bless: Pick<DiedMsg, "blessingUsed" | "savedXp"> = {}) {
    showDeath({ killerName, lostXp, blessingUsed: bless.blessingUsed, savedXp: bless.savedXp });
    sfx.play("died", { volume: 0.9 });
  }

  onCreatureDied(m: CreatureDiedMsg) {
    if (this.dying.has(m.id)) return;
    this.dying.add(m.id);
    const wasTarget = this.curTarget === m.id;
    if (wasTarget) { this.curTarget = ""; setTarget(null); }
    const a = this.creatures.get(m.id);
    // Longe: o corpo some (estado) mas sem cadáver nem som.
    const r = wasTarget ? { show: true, gain: 1 } : this.fxReach([m.id], { x: m.x, y: m.y });
    if (!r.show) { a?.ghost(); return; }
    if (a) {
      const f = a.frameInfo;
      const depth = a.root.depth;
      const fx = Math.round(a.rx) + TILE_SIZE / 2, fy = Math.round(a.ry) + TILE_SIZE + f.dy;
      a.ghost();
      this.fx.corpse(f.key, f.frame, f.tint, fx, fy, a.scale, depth);
    } else {
      const v = creatureVisual(m.defId);
      const dy = (v.look.sheet.frameHeight - sheetTrim(this, v.look.sheet).bottom) * v.scale;
      this.fx.corpse(v.look.sheet.key, v.look.sheet.idle.down, v.look.tint, m.x * TILE_SIZE + TILE_SIZE / 2, (m.y + 1) * TILE_SIZE + dy, v.scale, 10 + (m.y + 1) * TILE_SIZE);
    }
    this.sfxAt("death", r.gain, { volume: 0.8 });
  }

  // --- efeitos --------------------------------------------------------------

  private createFx() {
    this.hover = this.add.image(0, 0, TEX.hover).setOrigin(0, 0).setAlpha(0.18).setVisible(false);
    this.worldLayer.add(this.hover.setDepth(5));
    this.targetMark = this.add.image(0, 0, TEX.hover).setOrigin(0, 0).setTint(0xff3b30).setVisible(false);
    this.worldLayer.add(this.targetMark.setDepth(6));
    this.targetFill = this.add.image(0, 0, TEX.px).setOrigin(0, 0).setTint(0xff3b30).setDisplaySize(TILE_SIZE, TILE_SIZE).setVisible(false);
    this.worldLayer.add(this.targetFill.setDepth(5.5));
    this.followMark = this.add.image(0, 0, TEX.hover).setOrigin(0, 0).setTint(0x4fe36a).setVisible(false);
    this.worldLayer.add(this.followMark.setDepth(6));

    this.dust = this.add.particles(0, 0, TEX.px, {
      emitting: false,
      lifespan: { min: 220, max: 380 },
      speedX: { min: -10, max: 10 },
      speedY: { min: -9, max: -2 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xd8cdb4, 0xbfb397, 0xeee6d0],
      gravityY: 12,
      quantity: 1,
    });
    this.worldLayer.add(this.dust.setDepth(DEPTH_ABOVE - 1));

    // Respingo escuro de lama: gotas sobem e caem rápido, bem perto do pé.
    this.splash = this.add.particles(0, 0, TEX.px, {
      emitting: false,
      lifespan: { min: 180, max: 300 },
      speedX: { min: -14, max: 14 },
      speedY: { min: -22, max: -10 },
      alpha: { start: 0.8, end: 0 },
      tint: [0x3b2f22, 0x4a3b2a, 0x2f3a28],
      gravityY: 90,
      quantity: 1,
    });
    this.worldLayer.add(this.splash.setDepth(DEPTH_ABOVE - 1));
  }

  /** Partícula de passo conforme o terreno do tile de origem (px = canto do tile). */
  private footstep(px: number, py: number) {
    const terrain = this.world.groundSpeed.terrainAt(Math.round(px / TILE_SIZE), Math.round(py / TILE_SIZE));
    if (!terrain) return;
    const x = px + TILE_SIZE / 2, y = py + TILE_SIZE - 1;
    if (DUSTY.has(terrain)) this.dust.explode(3, x, y);
    else if (SPLASHY.has(terrain)) this.splash.explode(terrain === "mud" ? 4 : 2, x, y);
  }

  private showMarker(x: number, y: number) {
    const m = this.add.image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, TEX.marker).setAlpha(0.9).setTint(0xfff2a8);
    this.worldLayer.add(m.setDepth(DEPTH_FX_TOP));
    this.tweens.add({ targets: m, alpha: 0, scale: 0.6, duration: 650, ease: "Quad.easeIn", onComplete: () => m.destroy() });
  }

  /** Ponto do ponteiro no mundo (vetor reaproveitado: o hover roda a cada frame; quem chama usa na hora). */
  private readonly wpTmp = new Phaser.Math.Vector2();
  private worldPoint(ptr: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(ptr.x, ptr.y, this.wpTmp);
  }

  /** Cursor do canvas, só escrito quando muda (o hover roda a cada frame). */
  private cursor = "";
  private setCursor(c: string) {
    if (c === this.cursor) return;
    this.cursor = c;
    this.game.canvas.style.cursor = c;
  }

  private updateHover() {
    const ptr = this.input.activePointer;
    this.ground.showLabel(null);
    if (!ptr || !this.input.isOver) { this.hover.setVisible(false); return; }
    const cid = this.creatureAtPointer(ptr);
    const c = cid ? this.creatures.get(cid) : undefined;
    if (c) {
      this.setCursor("");
      // Sobre uma criatura: quadrado branco no tile dela.
      this.hover.setPosition(this.pcam.snap(c.rx), this.pcam.snap(c.ry)).setAlpha(0.7).setVisible(true);
      return;
    }
    const nid = this.npcAtPointer(ptr);
    const nt = nid ? this.npcs.tileOf(nid) : null;
    this.setCursor(nt ? "pointer" : "");
    if (nt) { this.hover.setPosition(nt.x * TILE_SIZE, nt.y * TILE_SIZE).setAlpha(0.7).setVisible(true); return; }
    const sid = this.statueAtPointer(ptr);
    const st = sid ? this.statues.tileOf(sid) : null;
    this.setCursor(st ? "pointer" : "");
    if (st) { this.hover.setPosition(st.x * TILE_SIZE, st.y * TILE_SIZE).setAlpha(0.7).setVisible(true); return; }
    const qid = this.questObjAtPointer(ptr);
    const qo = qid ? this.questObjs.get(qid) : undefined;
    if (qo) { this.setCursor("pointer"); this.hover.setPosition(qo.x * TILE_SIZE, qo.y * TILE_SIZE).setAlpha(0.7).setVisible(true); return; }
    const t = this.pointerTile(ptr);
    if (!t) { this.hover.setVisible(false); return; }
    const gid = this.ground.topAt(t.x, t.y);
    if (gid) {
      // Item no chão: cursor de mão + nome (cor da raridade) acima do tile.
      this.setCursor("pointer");
      this.ground.showLabel(gid, this.pcam.toScreenX((t.x + 0.5) * TILE_SIZE), this.pcam.toScreenY(t.y * TILE_SIZE) - 2);
      this.hover.setPosition(t.x * TILE_SIZE, t.y * TILE_SIZE).setAlpha(0.45).setVisible(true);
      return;
    }
    this.hover.setPosition(t.x * TILE_SIZE, t.y * TILE_SIZE).setAlpha(0.18).setVisible(true);
  }

  /** Quadrado vermelho de 1px (pulsando) no tile do alvo. */
  private updateTargetMark(time: number) {
    // Seguindo alguém (e não atacando essa pessoa): quadrado verde nela.
    const followId = selectMe(playersStore.get())?.followId ?? "";
    const f = followId && followId !== getTarget()?.id ? this.actors.get(followId) : undefined;
    if (f && !f.ghosted && !f.culled) this.followMark.setPosition(this.pcam.snap(f.rx), this.pcam.snap(f.ry)).setVisible(true);
    else this.followMark.setVisible(false);
    const t = getTarget();
    const a = t ? this.findActor(t.id) : undefined;
    if (!a || a.ghosted || a.culled) { this.targetMark.setVisible(false); this.targetFill.setVisible(false); return; }
    const pulse = 0.5 + 0.5 * Math.sin(time / 120);
    this.targetFill.setPosition(this.pcam.snap(a.rx), this.pcam.snap(a.ry)).setAlpha(0.1 + 0.1 * pulse).setVisible(true);
    this.targetMark
      .setPosition(this.pcam.snap(a.rx), this.pcam.snap(a.ry))
      .setAlpha(0.8 + 0.2 * pulse)
      .setVisible(true);
  }

  private onResize(size: Phaser.Structs.Size) {
    this.cameras.main.setSize(size.width, size.height);
    this.uiCam.setSize(size.width, size.height);
    this.pcam.fit();
    const me = this.actors.get(this.myId);
    if (me) this.pcam.jumpTo(me.rx + TILE_SIZE / 2, me.ry + TILE_SIZE / 2);
  }

  onLoot(m: LootMsg) { this.loot.drop(m); }
  addNpc(id: string, x: number, y: number) { this.npcs.add(id, x, y); }
  npcSay(id: string, text: string) { this.npcs.say(id, text); }

  /** Para o harness ?fxtest: define quem é o jogador local. */
  setLocalId(id: string) { this.myId = id; session.myId = id; }

  private teardown() {
    window.clearTimeout(this.groundWalkTimer);
    window.clearTimeout(this.chordTimer);
    for (const d of this.disposers) d();
    this.disposers = [];
    this.input_?.destroy();
    this.fx?.destroy();
    this.spells?.destroy();
    this.npcs?.destroy();
    this.loot?.destroy();
    this.ground?.destroy();
    this.butterflies?.destroy();
    this.guide?.destroy();
    this.bobbers?.destroy();
    this.lightField?.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.unbindRoom();
  }
}
