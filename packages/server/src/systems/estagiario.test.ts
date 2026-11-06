// Estagiário no servidor: cura, ataque, turno, liga/desliga da rota, pausas, gravação e caminhada da rota.
import { describe, expect, it, vi } from "vitest";
import {
  BUSCA_TILES, DIARIO_MAX, Dir, ESPERAR_MAX_MS, ESPERAR_TILES, PAUSA_MANUAL_MS, POCAO_ALARME_MIN, RECUO_MAX_TILES, SEGUIR_SUMIU_MS, TURNO_AVISO_MS, STAMINA_BAIXA_MS, PONTO_TRAVADO_MS, ROTAS_MAX, S2C, TICK_MS, TURNO_MAX_MS,
  estagiarioPadrao,
  type EstagiarioConfig, type EstagiarioDiarioMsg, type EstagiarioEstadoMsg, type MonsterDef, type PontoRota, type QuickPotionKind, type SpellGroup,
  type Vocation,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { CARENCIA_LOGIN_MS, DIARIO_CURA_OFF_MS, DIARIO_ESPERA_MS, EstagiarioSystem } from "./estagiario.ts";
/** Busca com alvo vivo a cada 400 ms (BUSCA_MS do sistema): um tick de folga. */
const BUSCA_MS_TESTE = 450;
import { FightModeSystem } from "./fightmode.ts";
import { MovementSystem } from "./movement.ts";
import { def, grid, openGrid, player, world } from "./testkit.ts";

type Chamada = [string, ...unknown[]];

interface SetupOpts {
  ratos?: { x: number; y: number }[];
  vocation?: Vocation;
  saved?: { config?: unknown; turno?: { ms: number; em: number }; ligado?: unknown };
  /** v3: os testes das regras valem no modo avançado (o padrão do jogo é o simples); "simples" testa a política. */
  modo?: "simples" | "avancado";
  over?: Partial<PlayerState>;
  groups?: SpellGroup[];
  /** Movimento real (MovementSystem na mesma grade) para a caminhada da rota; sem ele, um falso parado. */
  andar?: boolean;
  /** Portais emulados ("x,y" → destino), conferidos depois do movimento como o PortalSystem. */
  portais?: Record<string, { x: number; y: number }>;
  /** Busca de alvo e perseguição do FightModeSystem real (corpo a corpo); sem ele, a busca falsa de `luta.alvo`. */
  lutaReal?: boolean;
  /** Tiles bloqueados só para andar (como água ou cerca: a visão passa, o caminho não). */
  paredes?: { x: number; y: number }[];
  /** Bonecos de treino (invulneráveis) onde pedido. */
  bonecos?: { x: number; y: number }[];
  /** Ids no mesmo grupo (party) do jogador "p". */
  grupo?: string[];
  /** Tiles de portal de verdade ("x,y"), para a gravação (PortalSystem.isPortalTile). */
  portalTiles?: string[];
  /** Ajustes no def do rato (v2: rato que anda e bate, para o recuo). */
  bicho?: Partial<MonsterDef>;
  /** Alcance do ataque básico do jogador (v2: manter distância só acima de 1). */
  alcance?: number;
  /** Ids de jogadores no grupo do "p" que contam como aliados para a cura em grupo. */
  aliados?: string[];
}

/**
 * Mundo 40×40 (PZ no canto 0..4), ratos selvagens onde pedido, o jogador "p" em (10,10) e falsos simples para magias,
 * poções, luta e acompanhante que registram as chamadas.
 */
function setup(o: SetupOpts = {}) {
  const defs: Record<string, MonsterDef> = {
    rato: def({ id: "rato", hp: 30, aggroRange: 0, stationary: true, respawnMs: 999_999, ...o.bicho }),
    boneco: def({ id: "boneco", hp: 30, aggroRange: 0, stationary: true, invulnerable: true, respawnMs: 999_999 }),
  };
  const grade = openGrid(40, 40);
  const bloqueados = new Set((o.paredes ?? []).map((t) => `${t.x},${t.y}`));
  const gradeAndar = grid(Array.from({ length: 40 }, (_, y) => Array.from({ length: 40 }, (_, x) => (bloqueados.has(`${x},${y}`) ? "#" : ".")).join("")));
  const w = world({
    grid: grade, defs: (id) => defs[id],
    spawns: [
      ...(o.ratos ?? []).map((r) => ({ defId: "rato", x: r.x, y: r.y, count: 1, radius: 0 })),
      ...(o.bonecos ?? []).map((r) => ({ defId: "boneco", x: r.x, y: r.y, count: 1, radius: 0 })),
    ],
    safeZones: [{ x0: 0, y0: 0, x1: 4, y1: 4 }],
  });
  w.mm.spawnAll();
  const p = w.add(player("p", 10, 10, { vocation: o.vocation ?? "knight", level: 20, hp: 150, maxHp: 150, mana: 100, maxMana: 100, bot: false, ...o.over }));
  w.mm.playerList = [...w.players.values()];
  let clock = 10_000;
  const calls: Chamada[] = [];
  const prontas = new Set<string>();
  /** Magias que o SpellSystem recusa ao conjurar (alvo fora de alcance, sem linha de visão...). */
  const falham = new Set<string>();
  /** Direção do jogador em cada conjuração (a onda sai para `p.dir`). */
  const dirs: Dir[] = [];
  const spells = {
    ready: (_p: PlayerState, id: string) => prontas.has(id),
    cast: (pl: PlayerState, id: string, targetId?: string, opts?: { silent?: boolean }) => {
      calls.push(["cast", id, targetId, opts]); dirs.push(pl.dir); return { ok: !falham.has(id) };
    },
  };
  /** `bebivel`: o level/vocação deixa beber (InventorySystem.canDrink); `bebe`: o usePotion consegue; `cura`: quanto a de vida recupera (0 = nada muda). */
  const pot = {
    pronta: true, bebe: true, cura: 0, qtd: { hp: 5, mana: 5 } as Record<QuickPotionKind, number>, bebivel: { hp: true, mana: true } as Record<QuickPotionKind, boolean>,
    cobertas: [] as (number | undefined)[],
  };
  const potions = {
    potionReady: () => pot.pronta,
    usePotion: (pl: PlayerState, kind: QuickPotionKind, opts?: { silent?: boolean; cobrir?: number }) => {
      calls.push(["pocao", kind, { silent: opts?.silent }]); pot.cobertas.push(opts?.cobrir);
      if (pot.bebe && pot.cura && kind === "hp") pl.hp = Math.min(pl.maxHp, pl.hp + pot.cura);
      return pot.bebe;
    },
    countPotions: (_p: PlayerState, kind: QuickPotionKind) => pot.qtd[kind],
    canDrink: (_p: PlayerState, kind: QuickPotionKind) => pot.bebivel[kind] && pot.qtd[kind] > 0,
    // v3 (modo simples): a poção bebível recupera `pot.cura` de vida (ou 100, se o teste não disse) e 100 de mana.
    potionAmount: (_p: PlayerState, kind: QuickPotionKind) => (pot.bebivel[kind] && pot.qtd[kind] > 0 ? (kind === "hp" ? pot.cura || 100 : 100) : 0),
  };
  const luta = { alvo: "" };
  const fight = {
    nearestTarget: (_p: PlayerState, reach: number, ignorar?: (id: string) => boolean) => {
      calls.push(["busca", reach]);
      return luta.alvo && !ignorar?.(luta.alvo) ? luta.alvo : "";
    },
    forceChase: (id: string, on: boolean, parar?: number) => { calls.push(parar !== undefined && parar > 1 ? ["chase", id, on, parar] : ["chase", id, on]); },
    resume: (id: string) => { calls.push(["resume", id]); },
    // v3 (caçar com amigo): o seguir do FightMode, como o real (followId no jogador).
    follow: (pl: PlayerState, id: string) => { if (pl.followId !== id) { pl.followId = id; calls.push(["follow", id]); } },
    cancelFollow: (pl: PlayerState) => { if (pl.followId) { pl.followId = ""; calls.push(["unfollow"]); } },
  };
  /** Donos com acompanhante no mundo (o teste pode tirar um, como o Coliseu faz ao sair). */
  const acompanhantes = new Set<string>();
  const companions = {
    spawnCompanion: (pl: PlayerState) => { calls.push(["spawn", pl.id]); acompanhantes.add(pl.id); return {}; },
    despawnCompanion: (id: string) => { calls.push(["despawn", id]); acompanhantes.delete(id); },
    companionOf: (id: string) => (acompanhantes.has(id) ? {} : undefined),
  };
  const npc = { aberto: false };
  /** Movimento falso: `livre` = o jogador está parado (sem tecla, clique nem passo em curso). */
  const mov = { livre: true };
  /** v2: combate (null = sem gancho, vale "tem alvo"), invocações vivas, comida restante e o que foi comido. */
  const combate = { em: null as boolean | null };
  const invoc = { n: 0 };
  const comida = { restante: Infinity, comeu: 0 };
  /** Condições ativas do jogador (o buff só é reconjurado quando a dele acabou). */
  const conds = new Set<string>();
  const conditions = { has: (_id: string, c: string) => conds.has(c) };
  const sent: { to: string; type: string; msg: any }[] = [];
  const mv = new MovementSystem(gradeAndar, { now: () => clock });
  mv.setExtraBlocker((x, y) => w.mm.isMonsterAt(x, y));
  mv.addPlayer(p);
  // Como no WorldRoom: o ataque automático do jogador (F8) consulta os monstros que o Estagiário largou.
  const real: FightModeSystem | null = o.lutaReal
    ? new FightModeSystem({ movement: mv, monsters: w.mm, attackRange: () => 1, now: () => clock, getPlayer: (id) => w.players.get(id), send: (to, type, msg) => sent.push({ to, type, msg }), ignorado: (pid, mid): boolean => sys.ignorado(pid, mid), botMira: (pid): boolean => sys.mirando(pid) })
    : null;
  const sys = new EstagiarioSystem({
    spells, potions, conditions, fight: real ?? fight, monsters: w.mm,
    movement: o.andar ? mv : { isIdle: () => mov.livre, pathFor: () => null, follow: () => "ok" },
    companions, npcOpen: () => npc.aberto, spellGroups: () => o.groups ?? [],
    players: () => w.players.values(), send: (to, type, msg) => sent.push({ to, type, msg }),
    sameParty: (a, b) => (a === "p" && (o.grupo ?? []).includes(b)) || (b === "p" && (o.grupo ?? []).includes(a)),
    isPortalTile: (x, y) => (o.portalTiles ?? []).includes(`${x},${y}`),
    inCombat: () => combate.em ?? !!w.mm.wild(p.targetId),
    invocacoes: () => invoc.n,
    alimentadoMs: () => comida.restante,
    comer: () => { comida.comeu++; calls.push(["comer"]); return true; },
    aliados: () => (o.aliados ?? []).map((id) => w.players.get(id)).filter((q): q is PlayerState => !!q),
    attackRange: () => o.alcance ?? 1,
    now: () => clock,
  });
  sys.load(p, { ...o.saved, config: { ...(o.saved?.config as object | undefined), modo: o.modo ?? "avancado" } } as never);
  /** Tiles por onde o jogador passou (a cada tick). */
  const visitados = new Set<string>();
  const tick = (ms = TICK_MS) => {
    const end = clock + ms;
    while (clock < end) {
      clock += TICK_MS;
      sys.tick(clock);
      real?.tick(clock, w.players.values());
      mv.tick(clock, w.players.values());
      const dest = o.portais?.[`${p.x},${p.y}`];
      if (dest) mv.teleport(p, dest.x, dest.y);
      visitados.add(`${p.x},${p.y}`);
    }
  };
  const estados = () => sent.filter((s) => s.type === S2C.EstagiarioEstado).map((s) => s.msg as EstagiarioEstadoMsg);
  const notices = () => sent.filter((s) => s.type === S2C.Notice).map((s) => s.msg.text as string);
  /** Mensagens do diário enviadas (v3). */
  const diarios = () => sent.filter((s) => s.type === S2C.EstagiarioDiario).map((s) => s.msg as EstagiarioDiarioMsg);
  const of = (k: string) => calls.filter((c) => c[0] === k);
  const indice = (): number => (sys as any).st.get("p").indice;
  const st = (): any => (sys as any).st.get("p");
  return { ...w, p, sys, mv, calls, of, prontas, falham, dirs, conds, pot, luta, npc, mov, combate, invoc, comida, sent, estados, notices, diarios, tick, visitados, indice, st, acompanhantes, now: () => clock };
}

/** Config (modo avançado: as listas valem) com a rota "Ratos" de 3 pontos (10,10) → (15,10) → (20,10). */
const comRota = (extra: Partial<EstagiarioConfig> = {}): EstagiarioConfig => ({
  ...estagiarioPadrao("knight"),
  modo: "avancado",
  rotas: [{ nome: "Ratos", pontos: [{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 20, y: 10 }] }],
  ...extra,
});

describe("Estagiário: carregar e salvar", () => {
  it("sem dado salvo: config padrão da vocação (modo simples, equilibrado), turno cheio, nada ligado; saved não grava nada", () => {
    const w = setup({ vocation: "druid", modo: "simples" });
    const e = w.sys.estado(w.p);
    expect(e.config).toEqual(estagiarioPadrao("druid"));
    expect(e).toMatchObject({ cura: false, ataque: false, rota: null, pausa: "", gravando: false, pontosGravados: 0, turnoMs: TURNO_MAX_MS });
    expect(w.sys.saved(w.p)).toBeUndefined();
  });

  it("só o que difere do padrão é gravado (v3: compacto, com o modo): config mudada e turno gasto voltam no próximo load (sanitizados)", () => {
    const w = setup();
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), reservaMana: 55 } });
    expect(w.sys.saved(w.p)).toEqual({ config: { reservaMana: 55, modo: "simples" } });

    const w2 = setup({ saved: { config: { ...estagiarioPadrao("knight"), reservaMana: 999 }, turno: { ms: 60_000, em: 10_000 } } });
    expect(w2.sys.estado(w2.p).config.reservaMana).toBe(90); // sanitizado ao carregar
    expect(w2.sys.estado(w2.p).turnoMs).toBe(60_000);
    expect(w2.sys.saved(w2.p)).toEqual({ config: { reservaMana: 90, modo: "avancado" }, turno: { ms: 60_000, em: 10_000 } });
    // O preset vai pelo nome; os deslizadores próprios vão com os números.
    w2.sys.onConfig(w2.p, { config: { ...estagiarioPadrao("knight"), preset: "seguro" } });
    expect(w2.sys.saved(w2.p)!.config).toEqual({ preset: "seguro", modo: "simples" });
    w2.sys.onConfig(w2.p, { config: { ...estagiarioPadrao("knight"), preset: null, perfil: { emergencia: 33, conforto: 66, reserva: 11 } } });
    expect(w2.sys.saved(w2.p)!.config).toEqual({ preset: null, perfil: { emergencia: 33, conforto: 66, reserva: 11 }, modo: "simples" });
  });
});

describe("Estagiário: configuração", () => {
  it("onConfig sanitiza (magia de outra vocação sai; grupo do jogador fica), troca e responde o estado", () => {
    const groups = [{ id: "fam:my:1", name: "Meu", spells: ["spin_strike"] }];
    const w = setup({ groups });
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), modo: "avancado", ataque: [
      { minBichos: 1, raio: 1, magia: "fireball" }, { minBichos: 2, raio: 9, magia: "fam:my:1" },
    ] } as EstagiarioConfig });
    const e = w.estados().at(-1)!;
    expect(e.config.ataque).toEqual([{ minBichos: 2, raio: 4, magia: "fam:my:1" }]);
    expect(w.sys.estado(w.p).config.ataque).toEqual(e.config.ataque);
  });

  it("lixo não quebra nem apaga a configuração", () => {
    const w = setup();
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), modo: "avancado", reservaMana: 10 } });
    for (const lixo of [undefined, null, "lixo", 7, { config: "x" }, { config: [1, 2] }]) w.sys.onConfig(w.p, lixo as never);
    expect(w.sys.estado(w.p).config.reservaMana).toBe(10);
  });

  it("Aplicar sem mexer nas rotas não reposiciona a rota rodando; mudar as rotas reposiciona", () => {
    const w = setup({ saved: { config: comRota() }, over: { x: 19, y: 11 } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.indice()).toBe(2);
    w.st().indice = 0; // a caminhada seguiu para o próximo ponto do circuito
    w.sys.onConfig(w.p, { config: { ...comRota(), reservaMana: 50 } });
    expect(w.indice()).toBe(0);
    w.sys.onConfig(w.p, { config: { ...comRota(), rotas: [{ nome: "Ratos", pontos: [{ x: 10, y: 10 }, { x: 20, y: 11 }] }] } });
    expect(w.indice()).toBe(1);
  });

  it("rota apagada da configuração enquanto roda: a rota desliga", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.p.bot).toBe(true);
    w.sys.onConfig(w.p, { config: { ...comRota(), rotas: [] } });
    expect(w.p.bot).toBe(false);
    expect(w.sys.estado(w.p).rota).toBeNull();
  });
});

describe("Estagiário: liga e desliga", () => {
  it("cura e ataque ligam e desligam; toda mudança responde o estado", () => {
    const w = setup();
    w.sys.onToggle(w.p, { cura: true });
    expect(w.estados().at(-1)).toMatchObject({ cura: true, ataque: false });
    w.sys.onToggle(w.p, { ataque: true });
    expect(w.estados().at(-1)).toMatchObject({ cura: true, ataque: true });
    w.sys.onToggle(w.p, { cura: false, ataque: false });
    expect(w.estados().at(-1)).toMatchObject({ cura: false, ataque: false });
    expect(w.estados()).toHaveLength(3);
    for (const lixo of [undefined, "x", { cura: "sim", rota: 5 }]) w.sys.onToggle(w.p, lixo as never);
    expect(w.sys.estado(w.p)).toMatchObject({ cura: false, ataque: false, rota: null });
  });

  it("ligar a rota: 🤖, ataque ligado enquanto roda, perseguição forçada, acompanhante, índice do ponto mais próximo", () => {
    const w = setup({ saved: { config: comRota() }, over: { x: 19, y: 11 } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.p.bot).toBe(true);
    expect(w.estados().at(-1)).toMatchObject({ rota: "Ratos", ataque: true, pausa: "" });
    expect(w.of("chase")).toEqual([["chase", "p", true]]);
    expect(w.of("spawn")).toEqual([["spawn", "p"]]);
    expect((w.sys as any).st.get("p").indice).toBe(2);

    w.sys.onToggle(w.p, { rota: null });
    expect(w.p.bot).toBe(false);
    expect(w.of("chase").at(-1)).toEqual(["chase", "p", false]);
    expect(w.of("despawn")).toEqual([["despawn", "p"]]);
    expect(w.estados().at(-1)).toMatchObject({ rota: null, ataque: false }); // volta ao que o jogador escolheu
  });

  it("com o ataque escolhido pelo jogador, desligar a rota mantém o ataque", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { ataque: true });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sys.onToggle(w.p, { rota: null });
    expect(w.sys.estado(w.p).ataque).toBe(true);
  });

  it("longe demais do caminho gravado (mais que o alcance do A*): não liga, com aviso", () => {
    const w = setup({ saved: { config: { ...estagiarioPadrao("knight"), rotas: [{ nome: "Longe", pontos: [{ x: 60, y: 60 }, { x: 70, y: 60 }] }] } } });
    w.sys.onToggle(w.p, { rota: "Longe" });
    expect(w.p.bot).toBe(false);
    expect(w.sys.estado(w.p).rota).toBeNull();
    expect(w.notices().at(-1)).toBe("Você está longe demais da rota: chegue perto do caminho gravado.");
  });

  it("rota inexistente, na PZ ou sem turno: não liga (com aviso)", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Outra" });
    expect(w.p.bot).toBe(false);
    expect(w.estados().at(-1)!.rota).toBeNull();

    w.p.x = 2; w.p.y = 2; // PZ
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.p.bot).toBe(false);
    expect(w.notices().at(-1)).toBe("Saia da zona de proteção para ligar a rota.");

    const w2 = setup({ saved: { config: comRota(), turno: { ms: 0, em: 10_000 } } });
    w2.sys.onToggle(w2.p, { rota: "Ratos" });
    expect(w2.p.bot).toBe(false);
    expect(w2.notices().at(-1)).toBe("A stamina do Estagiário acabou. Ela recarrega com ele parado ou com você offline.");
    expect(w2.of("spawn")).toEqual([]);
  });
});

describe("Estagiário: cura", () => {
  it("canais (v3): a poção e a magia de cura saem no MESMO tick, silenciosas; sem poção pronta ou bebível, só a magia; a de mana espera a de vida", () => {
    const w = setup({ over: { hp: 30, mana: 10 } }); // vida 20%, mana 10%: todas as regras valem
    w.sys.onToggle(w.p, { cura: true });
    w.prontas.add("light_heal");
    w.tick();
    // Canal de poção: a primeira regra de poção que vale (vida); canal de magia: a Cura. Os dois juntos.
    expect(w.calls.filter((c) => c[0] === "pocao" || c[0] === "cast")).toEqual([["pocao", "hp", { silent: true }], ["cast", "light_heal", undefined, { silent: true }]]);

    w.calls.length = 0;
    w.pot.pronta = false; // recarga da poção: só a magia
    w.tick();
    expect(w.calls).toEqual([["cast", "light_heal", undefined, { silent: true }]]);

    w.calls.length = 0;
    w.pot.pronta = true; w.pot.qtd.hp = 0; // sem poção de vida: a de mana (regra seguinte do canal) e a magia
    w.tick();
    expect(w.calls).toEqual([["pocao", "mana", { silent: true }], ["cast", "light_heal", undefined, { silent: true }]]);
  });

  it("vida boa e mana baixa: poção de mana; desligada, morto ou nada pronto: nada", () => {
    const w = setup({ over: { mana: 20 } }); // 20% < 25% (poção de mana recomendada do cavaleiro)
    w.sys.onToggle(w.p, { cura: true });
    w.tick();
    expect(w.calls).toEqual([["pocao", "mana", { silent: true }]]);

    w.calls.length = 0;
    w.pot.pronta = false;
    w.tick();
    expect(w.calls).toEqual([]);

    w.pot.pronta = true;
    w.sys.onToggle(w.p, { cura: false });
    w.tick();
    expect(w.calls).toEqual([]);

    w.sys.onToggle(w.p, { cura: true });
    w.p.hp = 0;
    w.tick();
    expect(w.calls).toEqual([]);
  });
});

describe("Estagiário: cura que não trava", () => {
  it("poção que o level/vocação não deixa beber não trava a cura: vai a magia, e o buff não fica bloqueado", () => {
    const w = setup({ over: { hp: 30 }, saved: { config: { ...estagiarioPadrao("knight"), buffs: [{ magia: "swift_feet", quando: "sempre" }] } } });
    w.sys.onToggle(w.p, { cura: true, buffs: true });
    w.pot.bebivel.hp = false; // só Poção Grande (lv 30) na mochila
    w.prontas.add("swift_feet");
    w.tick();
    // Nada de cura pronto (a poção não serve): o buff sai no mesmo tick em vez de esperar para sempre.
    expect(w.of("pocao")).toEqual([]);
    expect(w.of("cast").map((c) => c[1])).toEqual(["swift_feet"]);
    w.calls.length = 0;
    w.prontas.add("light_heal");
    w.tick();
    expect(w.of("pocao")).toEqual([]);
    expect(w.of("cast").map((c) => c[1])).toEqual(["light_heal"]);
  });

  it("ação de cura que falha (poção recusada, magia recusada) tenta a regra seguinte no mesmo tick", () => {
    const w = setup({ over: { hp: 30 } }); // vida 20%: poção, Limpar Feridas e Cura valem
    w.sys.onToggle(w.p, { cura: true });
    w.pot.bebe = false;
    w.prontas.add("wound_cleansing").add("light_heal");
    w.falham.add("wound_cleansing");
    w.tick();
    expect(w.calls.filter((c) => c[0] === "pocao" || c[0] === "cast").map((c) => c[1])).toEqual(["hp", "wound_cleansing", "light_heal"]);
  });
});

describe("Estagiário: buffs", () => {
  const comBuffs = (buffs: EstagiarioConfig["buffs"], extra: Partial<EstagiarioConfig> = {}): EstagiarioConfig =>
    ({ ...estagiarioPadrao("knight"), modo: "avancado", cura: [], ataque: [], buffs, ...extra });

  it("liga e desliga; conjura o buff que falta (silencioso), não com a condição ativa; desligado ou morto: nada", () => {
    const w = setup({ saved: { config: comBuffs([{ magia: "swift_feet", quando: "sempre" }]) } });
    w.prontas.add("swift_feet");
    w.tick();
    expect(w.of("cast")).toEqual([]); // desligado
    w.sys.onToggle(w.p, { buffs: true });
    expect(w.estados().at(-1)).toMatchObject({ buffs: true, cura: false, ataque: false });
    w.tick();
    expect(w.of("cast")).toEqual([["cast", "swift_feet", undefined, { silent: true }]]);

    w.calls.length = 0;
    w.conds.add("haste"); // pegou: não reconjura
    w.tick(1000);
    expect(w.of("cast")).toEqual([]);
    w.conds.delete("haste"); // acabou: reconjura
    w.tick();
    expect(w.of("cast")).toHaveLength(1);

    w.calls.length = 0;
    w.p.hp = 0;
    w.tick();
    expect(w.of("cast")).toEqual([]);
    w.p.hp = 150;
    w.sys.onToggle(w.p, { buffs: false });
    w.tick();
    expect(w.of("cast")).toEqual([]);
  });

  it("'só em combate': só com um monstro vivo de alvo; o de fora de combate vale sempre", () => {
    const w = setup({ ratos: [{ x: 11, y: 10 }], saved: { config: comBuffs([{ magia: "iron_skin", quando: "combate" }, { magia: "swift_feet", quando: "sempre" }]) } });
    w.prontas.add("iron_skin");
    w.sys.onToggle(w.p, { buffs: true });
    w.tick();
    expect(w.of("cast")).toEqual([]); // sem alvo: Pele de Ferro espera; Pés Ligeiros não está pronto
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.tick();
    expect(w.of("cast")).toEqual([["cast", "iron_skin", undefined, { silent: true }]]);
  });

  it("uma ação por tick: com cura no tick, o buff espera o próximo", () => {
    const w = setup({ over: { hp: 30 }, saved: { config: comBuffs([{ magia: "swift_feet", quando: "sempre" }], { cura: [{ quando: "vida", abaixoDe: 50, acao: { magia: "light_heal" } }] }) } });
    w.prontas.add("light_heal").add("swift_feet");
    w.sys.onToggle(w.p, { cura: true, buffs: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["light_heal"]);
    w.calls.length = 0;
    w.p.hp = 150; // curado: o buff sai
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["swift_feet"]);
  });

  it("v2: a reserva do ataque não segura os buffs; a mana mínima da regra é a única exigência além da mana da própria magia", () => {
    // Feiticeiro com 6 % de mana (bem abaixo da reserva do ataque de 30 %): o Pés Ligeiros sai assim mesmo.
    const w = setup({
      vocation: "sorcerer", over: { mana: 60, maxMana: 1000 },
      saved: { config: { ...comBuffs([{ magia: "swift_feet", quando: "sempre" }, { magia: "mana_shield", quando: "sempre" }]), reservaMana: 30 } },
    });
    w.prontas.add("swift_feet");
    w.sys.onToggle(w.p, { buffs: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["swift_feet"]);
    w.calls.length = 0;
    w.conds.add("haste");
    w.prontas.add("mana_shield");
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["mana_shield"]);
    // Mana mínima da regra: exigência do jogador (40 % < 50 % espera; 50 % sai).
    w.calls.length = 0;
    w.conds.delete("haste");
    w.sys.onConfig(w.p, { config: comBuffs([{ magia: "swift_feet", quando: "sempre", manaMin: 50 }]) });
    w.p.mana = 400;
    w.tick();
    expect(w.of("cast")).toEqual([]);
    w.p.mana = 500;
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["swift_feet"]);
  });

  it("com a rota rodando ficam ligados (o estado mostra); desligar a rota volta ao escolhido; desligarTudo para de agir mas guarda o interruptor", () => {
    const w = setup({ saved: { config: comRota({ buffs: [{ magia: "swift_feet", quando: "sempre" }] }) } });
    w.prontas.add("swift_feet");
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.estados().at(-1)).toMatchObject({ rota: "Ratos", buffs: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toContain("swift_feet");
    w.sys.onToggle(w.p, { rota: null });
    expect(w.estados().at(-1)).toMatchObject({ buffs: false });

    w.sys.onToggle(w.p, { buffs: true });
    w.sys.desligarTudo(w.p);
    // v3: o interruptor fica (vai no save e volta com o jogador), mas nada age até reconectar.
    expect(w.sys.estado(w.p).buffs).toBe(true);
    expect(w.sys.saved(w.p)).toMatchObject({ ligado: { buffs: true } });
    w.calls.length = 0;
    w.tick();
    expect(w.of("cast")).toEqual([]);
  });
});

describe("Estagiário: ataque", () => {
  const regras = (magia: string, minBichos = 2, raio = 1) => ({ ...estagiarioPadrao("knight"), modo: "avancado" as const, ataque: [{ minBichos, raio, magia }] });

  it("sem alvo: busca o monstro mais próximo a BUSCA_TILES; só o ataque ligado retoma a perseguição assim que o jogador fica parado", () => {
    const w = setup({ ratos: [{ x: 14, y: 10 }] });
    const rato = [...w.mm.all()][0]!;
    w.luta.alvo = rato.s.id;
    w.mov.livre = false; // andando à mão: retomar agora cancelaria a pausa de 1,5 s que o Move acabou de pôr na perseguição
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("busca")).toEqual([["busca", BUSCA_TILES]]);
    expect(w.p.targetId).toBe(rato.s.id);
    expect(w.of("resume")).toEqual([]);
    w.tick(500);
    expect(w.of("resume")).toEqual([]);
    w.mov.livre = true; // parou: a perseguição retoma já (era o "delay para seguir o bicho na primeira vez que o vê")
    w.tick();
    expect(w.of("resume")).toEqual([["resume", "p"]]);
    w.tick(1000);
    expect(w.of("resume")).toHaveLength(1); // uma vez por alvo novo
  });

  it("busca a cada 100 ms sem alvo e a cada 400 ms com alvo (procurando um mais perto)", () => {
    const w = setup({ ratos: [{ x: 14, y: 10 }] });
    w.sys.onToggle(w.p, { ataque: true });
    w.tick(1000);
    expect(w.of("busca").length).toBeGreaterThanOrEqual(9);
    w.calls.length = 0;
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.tick(1000);
    expect(w.of("busca").length).toBeLessThanOrEqual(3);
  });

  it("alvo novo com a rota rodando retoma a perseguição; com a rota pausada (manual), não", () => {
    const w = setup({ ratos: [{ x: 14, y: 10 }], saved: { config: comRota() } });
    const rato = [...w.mm.all()][0]!;
    w.luta.alvo = rato.s.id;
    w.sys.onToggle(w.p, { ataque: true, rota: "Ratos" });
    w.sys.manual("p");
    w.mov.livre = false;
    w.tick(1000);
    expect(w.p.targetId).toBe(rato.s.id);
    expect(w.of("resume")).toEqual([]); // rota pausada e o jogador andando: não retoma
    w.mov.livre = true;
    w.tick();
    expect(w.of("resume")).toEqual([["resume", "p"]]); // parou: o Ataque é escolha dele, a perseguição retoma
    w.calls.length = 0;

    w.tick(PAUSA_MANUAL_MS);
    expect(w.sys.estado(w.p).pausa).toBe("");
    w.p.targetId = ""; // o alvo morreu/sumiu: o próximo é escolhido com a rota rodando
    w.tick(500);
    expect(w.p.targetId).toBe(rato.s.id);
    expect(w.of("resume")).toEqual([["resume", "p"]]);
  });

  it("conta os bichos no raio: com o mínimo, conjura no alvo (silenciosa); abaixo, não", () => {
    const w = setup({ ratos: [{ x: 11, y: 10 }, { x: 11, y: 11 }, { x: 13, y: 10 }], saved: { config: regras("spin_strike") } });
    const [a, b] = [...w.mm.all()];
    w.p.targetId = a!.s.id;
    w.prontas.add("spin_strike");
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("cast")).toEqual([["cast", "spin_strike", a!.s.id, { silent: true }]]);

    w.calls.length = 0;
    w.mm.kill(b!); // sobra um a 1 tile
    w.tick();
    expect(w.of("cast")).toEqual([]);
  });

  it("reserva de mana: abaixo dela não conjura", () => {
    const w = setup({ ratos: [{ x: 11, y: 10 }], saved: { config: { ...regras("spin_strike", 1), reservaMana: 30 } }, over: { mana: 20 } });
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.prontas.add("spin_strike");
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("cast")).toEqual([]);
    w.p.mana = 40;
    w.tick();
    expect(w.of("cast")).toHaveLength(1);
  });

  it("família e grupo resolvem a primeira magia pronta no level", () => {
    const w = setup({
      ratos: [{ x: 11, y: 10 }], groups: [{ id: "fam:my:1", name: "G", spells: ["front_sweep", "spin_strike"] }],
      saved: { config: { ...estagiarioPadrao("knight"), ataque: [{ minBichos: 1, raio: 1, magia: "fam:knight:area" }] } },
    });
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.prontas.add("spin_strike").add("whirlwind"); // whirlwind é level 35: o jogador (20) não tem
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["spin_strike"]);

    w.calls.length = 0;
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), modo: "avancado", ataque: [{ minBichos: 1, raio: 1, magia: "fam:my:1" }] } });
    w.prontas.add("front_sweep");
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["front_sweep"]);
  });

  it("onda: vira para o alvo antes de conjurar e conta os bichos nos tiles da onda, não em volta", () => {
    const onda = { ...estagiarioPadrao("sorcerer"), ataque: [{ minBichos: 2, raio: 4, magia: "energy_wave" }] };
    // Dois ratos a leste (o alvo e o vizinho): a onda para o leste pega os dois.
    const w = setup({ vocation: "sorcerer", ratos: [{ x: 12, y: 10 }, { x: 13, y: 10 }], saved: { config: onda }, over: { dir: Dir.N } });
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.prontas.add("energy_wave");
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["energy_wave"]);
    expect(w.dirs).toEqual([Dir.E]); // o último passo era para o norte; a onda saiu para o alvo

    // Alvo sozinho a leste e dois ratos ao norte (no quadrado do raio, fora da onda para o alvo): não conjura.
    const w2 = setup({ vocation: "sorcerer", ratos: [{ x: 13, y: 10 }, { x: 10, y: 8 }, { x: 11, y: 8 }], saved: { config: onda } });
    w2.p.targetId = [...w2.mm.all()][0]!.s.id;
    w2.prontas.add("energy_wave");
    w2.sys.onToggle(w2.p, { ataque: true });
    w2.tick();
    expect(w2.of("cast")).toEqual([]);
  });

  it("área no alvo conta em volta do alvo; bonecos de treino e monstros na PZ não contam", () => {
    const explosao = { ...estagiarioPadrao("sorcerer"), ataque: [{ minBichos: 3, raio: 1, magia: "fire_burst" }] };
    const w = setup({ vocation: "sorcerer", ratos: [{ x: 16, y: 10 }, { x: 16, y: 11 }, { x: 17, y: 10 }], saved: { config: explosao } });
    w.p.targetId = [...w.mm.all()][0]!.s.id; // longe do jogador, com dois vizinhos
    w.prontas.add("fire_burst");
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["fire_burst"]);

    const giro = { ...estagiarioPadrao("knight"), ataque: [{ minBichos: 2, raio: 1, magia: "spin_strike" }] };
    const w2 = setup({ ratos: [{ x: 6, y: 5 }, { x: 4, y: 4 }], bonecos: [{ x: 6, y: 6 }], over: { x: 5, y: 5 }, saved: { config: giro } });
    w2.p.targetId = [...w2.mm.all()][0]!.s.id;
    w2.prontas.add("spin_strike");
    w2.sys.onToggle(w2.p, { ataque: true });
    w2.tick();
    expect(w2.of("cast")).toEqual([]); // só o rato fora da PZ conta: 1 < 2
  });

  it("rota pausada à mão: só escolhe alvo novo se o jogador ligou o Ataque", () => {
    const w = setup({ ratos: [{ x: 14, y: 10 }], saved: { config: comRota() } });
    const rato = [...w.mm.all()][0]!;
    w.luta.alvo = rato.s.id;
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sys.manual("p");
    w.tick(1000);
    expect(w.p.targetId).toBe(""); // o ataque só estava ligado pela rota: o jogador está no controle
    w.sys.onToggle(w.p, { ataque: true });
    w.tick(500);
    expect(w.p.targetId).toBe(rato.s.id);
    expect(w.of("resume")).toEqual([["resume", "p"]]); // o jogador está parado: a perseguição (escolha dele) retoma já
  });

  it("alvo jogador (mirado à mão): não busca nem conjura; desligado: nada", () => {
    const w = setup({ ratos: [{ x: 11, y: 10 }], saved: { config: regras("spin_strike", 1) } });
    w.add(player("q", 11, 11));
    w.p.targetId = "q";
    w.prontas.add("spin_strike");
    w.luta.alvo = [...w.mm.all()][0]!.s.id;
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.calls).toEqual([]);
    expect(w.p.targetId).toBe("q");

    w.p.targetId = "";
    w.sys.onToggle(w.p, { ataque: false });
    w.tick();
    expect(w.calls).toEqual([]);
  });
});

describe("Estagiário: turno", () => {
  it("rota rodando gasta a stamina em tempo real; estado a cada 10 s; desligada recarrega 1/4", () => {
    // Pontos no tile do jogador: parado sem travar (um ponto travado mudaria o motivo e mandaria estado a mais).
    const w = setup({ saved: { config: comRota({ rotas: [{ nome: "Ratos", pontos: [{ x: 10, y: 10 }, { x: 10, y: 10 }] }] }) } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    const antes = w.estados().length;
    w.tick(25_000);
    expect(w.sys.estado(w.p).turnoMs).toBe(TURNO_MAX_MS - 25_000);
    expect(w.estados().length - antes).toBe(2);

    w.sys.onToggle(w.p, { rota: null });
    w.tick(40_000);
    expect(w.sys.estado(w.p).turnoMs).toBe(TURNO_MAX_MS - 25_000 + 10_000);
  });

  it("o turno chega a 0: a rota desliga com aviso", () => {
    const w = setup({ saved: { config: comRota(), turno: { ms: 1000, em: 10_000 } } });
    w.sys.onToggle(w.p, { cura: true });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick(1000);
    expect(w.p.bot).toBe(false);
    expect(w.sys.estado(w.p)).toMatchObject({ rota: null, cura: true, turnoMs: 0 });
    expect(w.notices()).toContain("A stamina do Estagiário acabou. Ela recarrega com ele parado ou com você offline.");
    expect(w.of("despawn")).toEqual([["despawn", "p"]]);
  });
});

describe("Estagiário: zona de proteção, morte e desconexão", () => {
  it("entrar na PZ com a rota rodando desliga a rota", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick();
    expect(w.p.bot).toBe(true);
    w.p.x = 3; w.p.y = 3;
    w.tick();
    expect(w.p.bot).toBe(false);
    expect(w.sys.estado(w.p).rota).toBeNull();
  });

  it("onDied desliga só a rota (e avisa a morte); desligarTudo desliga a rota e para de agir, sem alarme; reconectou volta depois da carência", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { cura: true, ataque: true });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sys.onDied(w.p);
    expect(w.p.bot).toBe(false);
    expect(w.sys.estado(w.p)).toMatchObject({ rota: null, cura: true, ataque: true });
    expect(w.sent.filter((s) => s.type === S2C.EstagiarioAlarme).map((s) => s.msg.tipo)).toEqual(["morte"]);
    w.sent.length = 0;

    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sys.desligarTudo(w.p);
    expect(w.p.bot).toBe(false);
    // v3: cura e ataque ficam como estavam (voltam com o jogador); só a rota desliga.
    expect(w.sys.estado(w.p)).toMatchObject({ rota: null, cura: true, ataque: true });
    expect(w.sent.filter((s) => s.type === S2C.EstagiarioAlarme)).toEqual([]);
    w.p.hp = 30;
    w.calls.length = 0;
    w.tick(1000);
    expect(w.of("pocao")).toEqual([]); // caído: nada age
    w.sys.reconectou(w.p);
    w.tick(CARENCIA_LOGIN_MS - TICK_MS);
    expect(w.of("pocao")).toEqual([]); // ainda na carência
    w.tick(TICK_MS);
    expect(w.of("pocao")).toHaveLength(1);
  });

  it("v3: o que estava ligado volta no load (só os true vão no save) depois de CARENCIA_LOGIN_MS; ligar algo à mão zera a carência", () => {
    const w = setup({ over: { hp: 30 }, saved: { ligado: { cura: true, ataque: "sim" } }, modo: "simples" });
    expect(w.sys.estado(w.p)).toMatchObject({ cura: true, ataque: false, buffs: false });
    expect(w.sys.saved(w.p)).toEqual({ ligado: { cura: true } });
    w.tick(CARENCIA_LOGIN_MS - TICK_MS);
    expect(w.of("pocao")).toEqual([]);
    w.tick(TICK_MS);
    expect(w.of("pocao")).toHaveLength(1);

    const w2 = setup({ over: { hp: 30 }, saved: { ligado: { cura: true } }, modo: "simples" });
    w2.sys.onToggle(w2.p, { ataque: true });
    w2.tick();
    expect(w2.of("pocao")).toHaveLength(1);
    expect(w2.sys.saved(w2.p)).toEqual({ ligado: { cura: true, ataque: true } });
    w2.sys.onToggle(w2.p, { cura: false, ataque: false });
    expect(w2.sys.saved(w2.p)).toBeUndefined();
  });

  it("v3: a rota liga a Cura (o estado mostra e a poção sai); desligar a rota volta ao escolhido, que é o que vai no save", () => {
    const w = setup({ over: { hp: 30 }, saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.estados().at(-1)).toMatchObject({ rota: "Ratos", cura: true });
    w.tick();
    expect(w.of("pocao")).toEqual([["pocao", "hp", { silent: true }]]);
    w.sys.onToggle(w.p, { rota: null });
    expect(w.estados().at(-1)).toMatchObject({ rota: null, cura: false });
    expect(w.sys.saved(w.p)?.ligado).toBeUndefined();
  });

  it("removePlayer esquece o jogador (o tick o ignora)", () => {
    const w = setup({ over: { hp: 30 } });
    w.sys.onToggle(w.p, { cura: true });
    w.sys.removePlayer("p");
    w.tick();
    expect(w.calls).toEqual([]);
  });
});

describe("Estagiário: pausas", () => {
  it("movimento manual pausa a rota por PAUSA_MANUAL_MS (renovada); pausado não gasta turno; cura segue", () => {
    const w = setup({ saved: { config: comRota() }, over: { mana: 20 } });
    w.sys.onToggle(w.p, { cura: true, rota: "Ratos" });
    w.sys.manual("p");
    expect(w.estados().at(-1)!.pausa).toBe("manual");
    const turno = w.sys.estado(w.p).turnoMs;
    w.tick(5000);
    w.sys.manual("p"); // renova
    w.tick(9000);
    expect(w.sys.estado(w.p).pausa).toBe("manual");
    expect(w.sys.estado(w.p).turnoMs).toBeGreaterThanOrEqual(turno); // não gastou (recarregou um pouco)
    expect(w.of("pocao").length).toBeGreaterThan(0);
    w.tick(PAUSA_MANUAL_MS - 9000 + TICK_MS);
    expect(w.sys.estado(w.p).pausa).toBe("");
    expect(w.estados().at(-1)!.pausa).toBe("");
  });

  it("sem a rota, o movimento manual não pausa nada", () => {
    const w = setup();
    w.sys.manual("p");
    expect(w.sys.estado(w.p).pausa).toBe("");
  });

  it("janela de NPC aberta pausa; fechou, volta", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.npc.aberto = true;
    w.tick();
    expect(w.estados().at(-1)!.pausa).toBe("npc");
    const turno = w.sys.estado(w.p).turnoMs;
    w.tick(5000);
    expect(w.sys.estado(w.p).turnoMs).toBeGreaterThanOrEqual(turno);
    w.npc.aberto = false;
    w.tick();
    expect(w.estados().at(-1)!.pausa).toBe("");
  });
});

describe("Estagiário: alarmes", () => {
  it("alarme respeita o liga/desliga; 'morte' sempre sai", () => {
    const w = setup({ saved: { config: { ...estagiarioPadrao("knight"), alarmes: { jogador: false, morte: false } } } });
    w.sys.alarme(w.p, "jogador", "Fulano chegou");
    w.sys.alarme(w.p, "morte", "Você morreu");
    w.sys.alarme(w.p, "pocao", "Poções acabando");
    expect(w.sent.filter((s) => s.type === S2C.EstagiarioAlarme).map((s) => s.msg)).toEqual([
      { tipo: "morte", texto: "Você morreu" }, { tipo: "pocao", texto: "Poções acabando" },
    ]);
  });
});

describe("Estagiário: gravação de rota", () => {
  /** Anda tile a tile (como os ticks veem o jogador) até (x, y) em linha reta. */
  const andarAte = (w: ReturnType<typeof setup>, x: number, y: number) => {
    while (w.p.x !== x || w.p.y !== y) {
      w.p.x += Math.sign(x - w.p.x);
      w.p.y += Math.sign(y - w.p.y);
      w.tick();
    }
  };

  it("iniciar grava um ponto por mudança de direção e por portal; parar com nome salva a rota (nome limpo)", () => {
    const w = setup({ portalTiles: ["13,13"] });
    w.sys.onGravar(w.p, { acao: "iniciar" });
    expect(w.estados().at(-1)).toMatchObject({ gravando: true, pontosGravados: 1 });
    w.tick();
    andarAte(w, 13, 10);
    andarAte(w, 13, 12);
    // Pisou no portal (13,13), ao sul, e o mesmo tick já o levou a (30,30): o tick só vê (13,12) → (30,30).
    w.p.dir = Dir.S;
    w.p.x = 30; w.p.y = 30;
    w.tick();
    andarAte(w, 31, 30);
    expect(w.sys.estado(w.p)).toMatchObject({ gravando: true, pontosGravados: 4 });
    w.sys.onGravar(w.p, { acao: "parar", nome: "  Caça\u0000 dos   ratos  " });
    const pontos: PontoRota[] = [
      { x: 10, y: 10 }, { x: 13, y: 10 }, { x: 13, y: 13, portal: true }, { x: 30, y: 30 }, { x: 31, y: 30 },
    ];
    expect(w.estados().at(-1)).toMatchObject({ gravando: false, pontosGravados: 0 });
    expect(w.sys.estado(w.p).config.rotas).toEqual([{ nome: "Caça dos ratos", pontos }]);
  });

  it("teleporte sem portal (Investida, /tp, viagem de NPC) não vira ponto de portal", () => {
    const w = setup({ portalTiles: ["20,20"] });
    w.sys.onGravar(w.p, { acao: "iniciar" });
    w.tick();
    andarAte(w, 12, 10);
    w.p.dir = Dir.E;
    w.p.x = 15; // Investida: 3 tiles de uma vez, sem portal
    w.tick();
    w.sys.onGravar(w.p, { acao: "parar", nome: "Sem portal" });
    const r = w.sys.estado(w.p).config.rotas[0]!;
    expect(r.pontos).toEqual([{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 15, y: 10 }]);
  });

  it("salvar uma rota que termina longe do começo avisa que ela volta andando até o início", () => {
    const w = setup();
    w.sys.onGravar(w.p, { acao: "iniciar" });
    w.tick();
    andarAte(w, 20, 10);
    w.sys.onGravar(w.p, { acao: "parar", nome: "Ida" });
    expect(w.sys.estado(w.p).config.rotas).toHaveLength(1);
    expect(w.notices().at(-1)).toBe("A rota termina a 10 tiles do começo: no fim, o Estagiário volta andando até o primeiro ponto.");
    // Terminando perto do começo: sem aviso.
    const w2 = setup();
    w2.sys.onGravar(w2.p, { acao: "iniciar" });
    w2.tick();
    andarAte(w2, 20, 10);
    andarAte(w2, 14, 10);
    w2.sys.onGravar(w2.p, { acao: "parar", nome: "Volta" });
    expect(w2.notices()).toEqual([]);
  });

  it("iniciar de novo durante a gravação é ignorado (com aviso), sem perder os pontos", () => {
    const w = setup();
    w.sys.onGravar(w.p, { acao: "iniciar" });
    w.tick();
    andarAte(w, 13, 10);
    andarAte(w, 13, 12);
    const antes = w.sys.estado(w.p).pontosGravados;
    expect(antes).toBe(2);
    w.sys.onGravar(w.p, { acao: "iniciar" });
    expect(w.notices().at(-1)).toBe("Já está gravando.");
    expect(w.sys.estado(w.p).pontosGravados).toBe(antes);
  });

  it("ligar a rota durante a gravação é recusado (com aviso)", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onGravar(w.p, { acao: "iniciar" });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.p.bot).toBe(false);
    expect(w.sys.estado(w.p)).toMatchObject({ rota: null, gravando: true });
    expect(w.notices().at(-1)).toBe("Pare a gravação antes de ligar a rota.");
    expect(w.of("spawn")).toEqual([]);
  });

  it("recusa iniciar com a rota rodando", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sys.onGravar(w.p, { acao: "iniciar" });
    expect(w.sys.estado(w.p).gravando).toBe(false);
    expect(w.notices().at(-1)).toBe("Desligue a rota para gravar outra.");
  });

  it("mesmo nome (sem diferença de maiúsculas) substitui; cheio com nome novo avisa e continua gravando", () => {
    const cheio = { ...estagiarioPadrao("knight"), rotas: Array.from({ length: ROTAS_MAX }, (_, i) => ({ nome: `R${i}`, pontos: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })) };
    const w = setup({ saved: { config: cheio } });
    w.sys.onGravar(w.p, { acao: "iniciar" });
    w.tick();
    andarAte(w, 12, 10);
    w.sys.onGravar(w.p, { acao: "parar", nome: "Nova" });
    expect(w.notices().at(-1)).toBe(`Já há ${ROTAS_MAX} rotas: apague uma antes.`);
    expect(w.sys.estado(w.p)).toMatchObject({ gravando: true });
    expect(w.sys.estado(w.p).config.rotas.map((r) => r.nome)).toEqual(["R0", "R1", "R2", "R3", "R4"]);

    w.sys.onGravar(w.p, { acao: "parar", nome: "r2" });
    const rotas = w.sys.estado(w.p).config.rotas;
    expect(rotas.map((r) => r.nome)).toEqual(["R0", "R1", "r2", "R3", "R4"]);
    expect(rotas[2]!.pontos).toEqual([{ x: 10, y: 10 }, { x: 12, y: 10 }]);
    expect(w.sys.estado(w.p).gravando).toBe(false);
  });

  it("nome vazio ou menos de 2 pontos: não salva (continua gravando); descartar só larga a gravação", () => {
    const w = setup();
    w.sys.onGravar(w.p, { acao: "iniciar" });
    w.tick();
    w.sys.onGravar(w.p, { acao: "parar", nome: "Parado" });
    expect(w.notices().at(-1)).toBe("Ande um pouco antes de salvar a rota.");
    andarAte(w, 12, 10);
    w.sys.onGravar(w.p, { acao: "parar", nome: "   " });
    expect(w.notices().at(-1)).toBe("Dê um nome à rota.");
    expect(w.sys.estado(w.p)).toMatchObject({ gravando: true });
    expect(w.sys.estado(w.p).config.rotas).toEqual([]);

    w.sys.onGravar(w.p, { acao: "descartar" });
    expect(w.estados().at(-1)).toMatchObject({ gravando: false, pontosGravados: 0 });
    expect(w.sys.estado(w.p).config.rotas).toEqual([]);
    for (const lixo of [undefined, "x", { acao: "voar" }, { acao: "parar", nome: 7 }]) w.sys.onGravar(w.p, lixo as never);
    expect(w.sys.estado(w.p).config.rotas).toEqual([]);
  });

  it("morrer ou desconectar larga a gravação (o teleporte da morte não vira portal)", () => {
    const w = setup();
    w.sys.onGravar(w.p, { acao: "iniciar" });
    w.sys.onDied(w.p);
    expect(w.sys.estado(w.p).gravando).toBe(false);
    w.sys.onGravar(w.p, { acao: "iniciar" });
    w.sys.desligarTudo(w.p);
    expect(w.sys.estado(w.p).gravando).toBe(false);
  });
});

describe("Estagiário: rodar a rota", () => {
  const rota = (pontos: PontoRota[]): EstagiarioConfig => ({ ...estagiarioPadrao("knight"), rotas: [{ nome: "R", pontos }] });

  it("anda de ponto em ponto pelo caminho e volta ao primeiro (circuito)", () => {
    const w = setup({ andar: true, saved: { config: rota([{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 14 }]) } });
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(8000);
    expect(w.visitados.has("15,10")).toBe(true);
    expect(w.visitados.has("15,14")).toBe(true);
    w.visitados.clear();
    w.tick(8000);
    expect(w.visitados.has("10,10")).toBe(true); // circuito: voltou ao primeiro
  });

  it("ponto de portal: pisa nele, o teleporte leva ao ponto seguinte e a rota continua dali", () => {
    const w = setup({
      andar: true, portais: { "13,10": { x: 30, y: 30 } },
      saved: { config: rota([{ x: 10, y: 10 }, { x: 13, y: 10, portal: true }, { x: 30, y: 30 }, { x: 33, y: 30 }]) },
    });
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(4000);
    expect(w.visitados.has("30,30")).toBe(true);
    expect(w.visitados.has("33,30")).toBe(true);
  });

  it("ponto inalcançável (fora do mapa, sem caminho): pula para o próximo depois de PONTO_TRAVADO_MS", () => {
    const w = setup({ andar: true, saved: { config: rota([{ x: 10, y: 10 }, { x: 500, y: 500 }, { x: 14, y: 10 }]) } });
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(PONTO_TRAVADO_MS - 500);
    expect([w.p.x, w.p.y]).toEqual([10, 10]);
    expect(w.indice()).toBe(1);
    w.tick(1000);
    expect(w.indice()).toBe(2);
    w.tick(2000);
    expect(w.visitados.has("14,10")).toBe(true);
  });

  it("ponto ocupado (um monstro parado em cima): chegar ao lado já conta, sem esperar o ponto travado", () => {
    // O rato parado no ponto (15,10) ocupa o tile: o caminho chega ao lado e não chega mais perto.
    const w = setup({ andar: true, ratos: [{ x: 15, y: 10 }], saved: { config: rota([{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 14, y: 35 }]) } });
    w.sys.onToggle(w.p, { rota: "R" }); // a busca falsa nunca acha alvo: só a caminhada conta
    w.tick(500);
    expect(w.indice()).toBe(1);
    w.tick(2000);
    expect(w.visitados.has("14,10")).toBe(true); // ao lado do ponto
    expect(w.indice()).toBe(2); // e já seguiu para o próximo
  });

  it("5 pontos travados seguidos: desliga a rota com aviso", () => {
    // Pontos dentro de uma parede (sem caminho), perto do jogador.
    const pts = [{ x: 20, y: 20 }, { x: 21, y: 20 }, { x: 22, y: 20 }, { x: 23, y: 20 }, { x: 24, y: 20 }, { x: 25, y: 20 }];
    const w = setup({ andar: true, paredes: pts, saved: { config: rota(pts) } });
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(4 * PONTO_TRAVADO_MS + 1000);
    expect(w.sys.estado(w.p).rota).toBe("R");
    expect(w.sys.estado(w.p).motivo).toBe("ponto travado, pulando");
    w.tick(PONTO_TRAVADO_MS);
    expect(w.sys.estado(w.p).rota).toBeNull();
    expect(w.p.bot).toBe(false);
    expect(w.notices().at(-1)).toBe("O Estagiário não consegue seguir a rota (5 pontos travados seguidos): rota desligada.");
  });

  it("portal trancado pulado: pula também o trecho do outro lado (até depois do próximo portal)", () => {
    // A porta em (13,10) devolve o jogador (requisito não cumprido): o outro lado (30,30)…(34,30) é inalcançável.
    const w = setup({
      andar: true, portais: { "13,10": { x: 12, y: 10 } },
      saved: { config: rota([
        { x: 10, y: 10 }, { x: 13, y: 10, portal: true }, { x: 30, y: 30 }, { x: 33, y: 30 }, { x: 34, y: 30, portal: true },
        { x: 12, y: 14 }, { x: 10, y: 14 },
      ]) },
    });
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(PONTO_TRAVADO_MS - 500);
    expect(w.indice()).toBe(1);
    w.tick(1500);
    expect(w.indice()).toBe(5); // nada de 10 s em (30,30) e mais 10 s em (33,30)…
    w.tick(2000);
    expect(w.visitados.has("12,14")).toBe(true);
  });

  it("portal trancado sem outro portal na rota: o resto é do outro lado, volta ao primeiro ponto", () => {
    const w = setup({
      andar: true, portais: { "13,10": { x: 12, y: 10 } },
      saved: { config: rota([{ x: 10, y: 30 }, { x: 10, y: 10 }, { x: 13, y: 10, portal: true }, { x: 30, y: 30 }, { x: 33, y: 30 }]) },
      over: { x: 10, y: 10 },
    });
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(1000);
    expect(w.indice()).toBe(2);
    w.tick(PONTO_TRAVADO_MS + 500);
    expect(w.indice()).toBe(0);
  });

  it("com o ataque automático (F8) ligado, o monstro largado também não é mirado de novo: a rota segue", () => {
    const cerca = [];
    for (let x = 13; x <= 15; x++) for (let y = 9; y <= 11; y++) if (x !== 14 || y !== 10) cerca.push({ x, y });
    const w = setup({
      andar: true, lutaReal: true, ratos: [{ x: 14, y: 10 }], paredes: cerca, over: { auto: true, chase: true },
      saved: { config: rota([{ x: 10, y: 10 }, { x: 10, y: 20 }]) },
    });
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(PONTO_TRAVADO_MS + 500);
    expect(w.p.targetId).toBe("");
    w.tick(3000);
    expect(w.visitados.has("10,20")).toBe(true);
    expect(w.p.targetId).toBe("");
    expect(w.sys.ignorado("p", [...w.mm.all()][0]!.s.id)).toBe(true);
    expect(w.sys.ignorado("outro", [...w.mm.all()][0]!.s.id)).toBe(false); // sem rota/estado: nada ignorado
  });

  it("alvo à vista mas inalcançável (atrás de água/cerca): larga o alvo em PONTO_TRAVADO_MS e a rota segue", () => {
    // Rato em (14,10) cercado por tiles que só bloqueiam o andar: a busca real o vê (linha de visão), a perseguição não chega.
    const cerca = [];
    for (let x = 13; x <= 15; x++) for (let y = 9; y <= 11; y++) if (x !== 14 || y !== 10) cerca.push({ x, y });
    const w = setup({
      andar: true, lutaReal: true, ratos: [{ x: 14, y: 10 }], paredes: cerca,
      saved: { config: rota([{ x: 10, y: 10 }, { x: 10, y: 20 }]) },
    });
    const rato = [...w.mm.all()][0]!;
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(5000);
    expect(w.p.targetId).toBe(rato.s.id);
    expect([w.p.x, w.p.y]).toEqual([10, 10]); // preso: nem a perseguição nem a rota andam
    w.tick(PONTO_TRAVADO_MS - 5000 + 500);
    expect(w.p.targetId).toBe("");
    w.tick(3000);
    expect(w.visitados.has("10,20")).toBe(true); // a rota seguiu
    expect(w.p.targetId).toBe(""); // e não voltou a mirar o mesmo rato
  });

  it("dois alvos inalcançáveis se alternando como o mais perto: o relógio não zera, os dois são ignorados", () => {
    const w = setup({ ratos: [{ x: 15, y: 10 }, { x: 10, y: 15 }], saved: { config: comRota() } });
    const [a, b] = [...w.mm.all()];
    w.luta.alvo = a!.s.id;
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick(500);
    expect(w.p.targetId).toBe(a!.s.id);
    // A cada 2 s o outro fica 1 tile mais perto (e vira o alvo); nenhum dos dois perde vida.
    for (let i = 0; i < 6 && w.p.targetId; i++) {
      const [novo, velho] = i % 2 === 0 ? [b!, a!] : [a!, b!];
      w.mm.place(velho, velho === a ? 15 : 10, velho === a ? 10 : 15);
      w.mm.place(novo, novo === a ? 14 : 10, novo === a ? 10 : 14);
      w.luta.alvo = novo.s.id;
      w.tick(2000);
    }
    expect(w.p.targetId).toBe("");
    expect(w.sys.ignorado("p", a!.s.id)).toBe(true);
    expect(w.sys.ignorado("p", b!.s.id)).toBe(true);
    expect(w.sys.estado(w.p).motivo).toBe("alvo inalcançável (ignorado 30 s)");
  });

  it("alvo que está apanhando (vida caindo) não é largado, mesmo sem chegar mais perto", () => {
    const w = setup({ andar: true, ratos: [{ x: 25, y: 25 }], saved: { config: rota([{ x: 10, y: 10 }, { x: 15, y: 10 }]) } });
    const rato = [...w.mm.all()][0]!;
    rato.s.hp = 1000;
    w.luta.alvo = rato.s.id;
    w.sys.onToggle(w.p, { rota: "R" });
    for (let i = 0; i < 30; i++) { rato.s.hp -= 1; w.tick(500); } // 15 s apanhando de longe
    expect(w.p.targetId).toBe(rato.s.id);
    expect([w.p.x, w.p.y]).toEqual([10, 10]);
  });

  it("com alvo vivo não anda; ao matar, retoma pelo ponto mais próximo", () => {
    const w = setup({ andar: true, ratos: [{ x: 25, y: 25 }], saved: { config: rota([{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 20, y: 10 }]) } });
    const rato = [...w.mm.all()][0]!;
    w.luta.alvo = rato.s.id;
    w.sys.onToggle(w.p, { rota: "R" });
    w.tick(2000);
    expect(w.p.targetId).toBe(rato.s.id);
    expect([w.p.x, w.p.y]).toEqual([10, 10]); // a perseguição (forceChase, falsa aqui) é que aproximaria
    w.mv.teleport(w.p, 19, 12); // a perseguição levou até lá
    w.luta.alvo = "";
    w.mm.kill(rato);
    w.tick();
    expect(w.indice()).toBe(2);
    w.tick(2000);
    expect(w.visitados.has("20,10")).toBe(true);
  });

  it("pausa manual: não anda; ao sair da pausa, retoma pelo ponto mais próximo", () => {
    const w = setup({ andar: true, saved: { config: rota([{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 20, y: 10 }]) } });
    w.sys.onToggle(w.p, { rota: "R" });
    w.sys.manual("p");
    w.tick(PAUSA_MANUAL_MS - 1000);
    expect([w.p.x, w.p.y]).toEqual([10, 10]);
    w.mv.teleport(w.p, 21, 12); // o jogador andou à mão até perto do último ponto
    w.tick(1000 + TICK_MS);
    expect(w.sys.estado(w.p).pausa).toBe("");
    expect(w.indice()).toBe(2);
    w.tick(1500);
    expect(w.visitados.has("20,10")).toBe(true);
  });
});

describe("Estagiário: cenário com os sistemas reais", () => {
  it("rota ligada: passa pelo ponto, o ataque automático mata o rato, o turno gasta; manual pausa; desligar tira o bot", () => {
    const grade = openGrid(30, 10);
    const w = world({
      grid: grade, defs: () => def({ id: "rato", hp: 10, armor: 0, aggroRange: 0, stationary: true, respawnMs: 999_999 }),
      // Rato a 12 tiles de (10,2) e a mais de 12 de todo o caminho antes dele: só é visto depois de passar pelo ponto.
      spawns: [{ defId: "rato", x: 22, y: 6, count: 1, radius: 0 }],
    });
    w.mm.spawnAll();
    const rato = [...w.mm.all()][0]!;
    const p = w.add(player("p", 3, 2, { vocation: "knight", level: 20, hp: 150, maxHp: 150, mana: 100, maxMana: 100, bot: false, chase: false }));
    w.mm.playerList = [...w.players.values()];
    const mv = new MovementSystem(grade, { now: () => w.now() });
    mv.setExtraBlocker((x, y) => w.mm.isMonsterAt(x, y));
    mv.addPlayer(p);
    const fight = new FightModeSystem({ movement: mv, monsters: w.mm, attackRange: (q) => w.combat.attackOf(q).range, now: () => w.now() });
    // Cura e ataque "falsos mas reais": a mesma interface, sem magia pronta nem poção (o rato morre no ataque automático).
    const sys = new EstagiarioSystem({
      spells: { ready: () => false, cast: () => ({ ok: false }) },
      potions: { potionReady: () => false, usePotion: () => false, countPotions: () => 0, canDrink: () => false },
      conditions: { has: () => false },
      fight, monsters: w.mm, movement: mv,
      companions: { spawnCompanion: () => ({}), despawnCompanion: () => {}, companionOf: () => ({}) },
      npcOpen: () => false, spellGroups: () => [], players: () => w.players.values(), send: () => {}, now: () => w.now(),
    });
    sys.load(p, { config: { ...estagiarioPadrao("knight"), rotas: [{ nome: "Ratos", pontos: [{ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 6 }] }] } });
    const visitados = new Set<string>();
    let passouEm = -1, mirouEm = -1;
    const passo = () => {
      sys.tick(w.now());
      if (p.targetId && mirouEm < 0) mirouEm = w.now();
      fight.tick(w.now(), w.players.values());
      mv.tick(w.now(), w.players.values());
      visitados.add(`${p.x},${p.y}`);
      if (p.x === 10 && p.y === 2 && passouEm < 0) passouEm = w.now();
    };
    sys.onToggle(p, { cura: true, rota: "Ratos" });
    expect(p.bot).toBe(true);
    const turno = sys.estado(p).turnoMs;
    let ms = 0;
    while (ms < 20_000 && !(visitados.has("10,2") && !w.mm.wild(rato.s.id))) { w.run(TICK_MS, passo); ms += TICK_MS; }
    expect(visitados.has("10,2")).toBe(true);
    expect(mirouEm).toBeGreaterThan(passouEm); // passou pelo ponto e só então viu o rato
    expect(passouEm).toBeGreaterThan(0);
    expect(w.mm.wild(rato.s.id)).toBeUndefined();
    expect(sys.estado(p).turnoMs).toBeLessThan(turno);
    expect(p.bot).toBe(true);

    sys.manual(p.id);
    const onde = [p.x, p.y];
    w.run(PAUSA_MANUAL_MS - 200, passo);
    expect([p.x, p.y]).toEqual(onde);
    sys.onToggle(p, { rota: null });
    expect(p.bot).toBe(false);
  });
});

describe("Estagiário: alarmes (só com a rota rodando)", () => {
  type W = ReturnType<typeof setup>;
  /** Setup com a rota "Ratos" ligada; as poções começam cheias (nada avisa até o teste mexer). */
  const rodando = (extra: Partial<EstagiarioConfig> = {}, o: SetupOpts = {}) => {
    const w = setup(o);
    w.pot.qtd = { hp: 50, mana: 50 };
    w.sys.onConfig(w.p, { config: comRota(extra) });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sent.length = 0;
    return w;
  };
  const alarmes = (w: W, tipo: string) =>
    w.sent.filter((s) => s.type === S2C.EstagiarioAlarme && s.msg.tipo === tipo).map((s) => s.msg.texto as string);
  const outro = (w: W, x = 12, y = 10) => w.add(player("q", x, y, { name: "Quim", hp: 100, maxHp: 100 }));

  it("pocao: avisa uma vez por tipo da cura abaixo do mínimo, só dos tipos usados nas regras, e rearma ao voltar a 10", () => {
    const w = rodando({ cura: [{ quando: "vida", abaixoDe: 35, acao: { pocao: "hp" } }] });
    w.pot.qtd.hp = POCAO_ALARME_MIN - 1;
    w.pot.qtd.mana = 0; // mana não está nas regras: não conta
    w.tick(200);
    expect(alarmes(w, "pocao")).toEqual(["Estagiário: poções acabando (9 de vida)."]);
    w.pot.qtd.hp = 3; w.tick(200);
    expect(alarmes(w, "pocao")).toHaveLength(1); // ainda baixo: não repete
    w.pot.qtd.hp = 9; w.tick(200); // entre o mínimo e 10 continua "avisado"
    w.pot.qtd.hp = POCAO_ALARME_MIN; w.tick(200); // voltou: rearma
    w.pot.qtd.hp = 2; w.tick(200);
    expect(alarmes(w, "pocao")).toHaveLength(2);
  });

  it("pocao: poção de mana nas regras usa o texto de mana", () => {
    const w = rodando({ cura: [{ quando: "mana", abaixoDe: 40, acao: { pocao: "mana" } }] });
    w.pot.qtd.mana = 4;
    w.tick(100);
    expect(alarmes(w, "pocao")).toEqual(["Estagiário: poções acabando (4 de mana)."]);
  });

  it("vidaBaixa: avisa abaixo de vidaAlarme% uma vez e rearma só a partir de vidaAlarme + 10%", () => {
    const w = rodando({ vidaAlarme: 25 }); // 150 de vida: 25% = 37,5
    w.p.hp = 37; w.tick(100);
    expect(alarmes(w, "vidaBaixa")).toEqual(["Estagiário: vida baixa (25%)."]);
    w.p.hp = 30; w.tick(100);
    w.p.hp = 50; w.tick(100); // 33%: ainda abaixo de 35%
    w.p.hp = 36; w.tick(100);
    expect(alarmes(w, "vidaBaixa")).toHaveLength(1);
    w.p.hp = 53; w.tick(100); // 35,3%: rearmou
    w.p.hp = 20; w.tick(100);
    expect(alarmes(w, "vidaBaixa")).toHaveLength(2);
  });

  it("jogador: avisa quando outro jogador vivo entra no alcance e rearma quando ele sai", () => {
    const w = rodando();
    const q = outro(w, 10 + BUSCA_TILES + 1);
    w.tick(100);
    expect(alarmes(w, "jogador")).toEqual([]); // longe
    q.x = 10 + BUSCA_TILES; w.tick(100);
    expect(alarmes(w, "jogador")).toEqual(["Estagiário: Quim está por perto."]);
    w.tick(100);
    expect(alarmes(w, "jogador")).toHaveLength(1);
    q.x = 30; w.tick(100); // saiu...
    q.x = 12; w.tick(100); // ...e voltou logo: o mesmo jogador indo e vindo na borda não toca de novo
    expect(alarmes(w, "jogador")).toHaveLength(1);
    q.x = 30; w.tick(60_000); // fora por 60 s: rearma
    q.x = 12; w.tick(100);
    expect(alarmes(w, "jogador")).toHaveLength(2);
    q.x = 30; w.tick(60_000);
    q.x = 12; q.hp = 0; w.tick(100); // morto não conta
    expect(alarmes(w, "jogador")).toHaveLength(2);
  });

  it("jogador: quem é do seu grupo não dispara o alarme", () => {
    const w = rodando({}, { grupo: ["q"] });
    outro(w);
    w.tick(100);
    expect(alarmes(w, "jogador")).toEqual([]);
  });

  it("atacado: avisa com o nome do atacante e só de novo 10 s depois", () => {
    const w = rodando();
    const q = outro(w);
    w.sys.onAtacado(w.p, q);
    w.sys.onAtacado(w.p, q);
    expect(alarmes(w, "atacado")).toEqual(["Estagiário: Quim está te atacando!"]);
    w.tick(9_000);
    w.sys.onAtacado(w.p, q);
    expect(alarmes(w, "atacado")).toHaveLength(1);
    w.tick(1_100);
    w.sys.onAtacado(w.p, q);
    expect(alarmes(w, "atacado")).toHaveLength(2);
  });

  it("privada: um alarme por mensagem", () => {
    const w = rodando();
    const q = outro(w);
    w.sys.onPrivada(w.p, q);
    w.sys.onPrivada(w.p, q);
    expect(alarmes(w, "privada")).toEqual(["Estagiário: mensagem de Quim.", "Estagiário: mensagem de Quim."]);
  });

  it("turno: avisa ao cruzar 5 min restantes, uma vez; rearma quando o turno volta acima", () => {
    const w = rodando({}, { saved: { turno: { ms: TURNO_AVISO_MS + 200, em: 10_000 } } });
    const faltam = () => alarmes(w, "turno").filter((t) => t.includes("faltam"));
    w.tick(100);
    expect(faltam()).toEqual([]);
    w.tick(300);
    expect(faltam()).toEqual(["Estagiário: faltam 5 min de stamina."]);
    w.tick(500);
    expect(faltam()).toHaveLength(1);
    // Desliga, o turno recarrega acima de 5 min, liga de novo: avisa outra vez ao cruzar.
    w.sys.onToggle(w.p, { rota: null });
    (w.sys as any).st.get("p").turno = { ms: TURNO_AVISO_MS + 100, em: w.now() };
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick(300);
    expect(faltam()).toHaveLength(2);
  });

  it("stamina baixa: avisa uma vez ao cair abaixo de 2 h; o XP de abate rodando cai junto; à mão, cheio", () => {
    const w = rodando({}, { saved: { turno: { ms: STAMINA_BAIXA_MS + 200, em: 10_000 } } });
    expect(w.sys.xpMult(w.p)).toBe(1);
    w.tick(100);
    expect(alarmes(w, "turno")).toEqual([]);
    w.tick(300);
    expect(alarmes(w, "turno")).toEqual(["Estagiário: stamina baixa (menos de 2 h). O XP da caça dele cai até zerar quando ela acabar."]);
    (w.sys as any).st.get("p").turno = { ms: STAMINA_BAIXA_MS / 4, em: w.now() };
    expect(w.sys.xpMult(w.p)).toBeCloseTo(0.25, 2);
    w.sys.onToggle(w.p, { rota: null });
    expect(w.sys.xpMult(w.p)).toBe(1); // caçando à mão: XP cheio
  });

  it("mochila: avisa uma vez e só de novo 60 s depois", () => {
    const w = rodando();
    w.sys.onMochilaCheia(w.p);
    w.sys.onMochilaCheia(w.p);
    expect(alarmes(w, "mochila")).toEqual(["Estagiário: mochila cheia — o loot está ficando no chão."]);
    w.tick(59_000);
    w.sys.onMochilaCheia(w.p);
    expect(alarmes(w, "mochila")).toHaveLength(1);
    w.tick(1_100);
    w.sys.onMochilaCheia(w.p);
    expect(alarmes(w, "mochila")).toHaveLength(2);
  });

  it("morte: com a rota rodando avisa sempre (mesmo com o alarme desligado); sem a rota não avisa", () => {
    const w = rodando({ alarmes: { morte: false } });
    w.sys.onDied(w.p);
    expect(alarmes(w, "morte")).toEqual(["Estagiário: você morreu. A rota foi desligada."]);
    const w2 = setup();
    w2.sys.onDied(w2.p);
    expect(alarmes(w2, "morte")).toEqual([]);
  });

  // Um gatilho por tipo (sem a morte, que tem teste próprio), para provar o liga/desliga e a rota parada de uma vez.
  const gatilhos: Record<string, { setup?: SetupOpts; dispara: (w: W) => void }> = {
    pocao: { dispara: (w) => { w.pot.qtd.hp = 1; w.tick(100); } },
    vidaBaixa: { dispara: (w) => { w.p.hp = 10; w.tick(100); } },
    jogador: { dispara: (w) => { outro(w); w.tick(100); } },
    atacado: { dispara: (w) => w.sys.onAtacado(w.p, outro(w)) },
    privada: { dispara: (w) => w.sys.onPrivada(w.p, outro(w)) },
    turno: { setup: { saved: { turno: { ms: STAMINA_BAIXA_MS - 1, em: 10_000 } } }, dispara: (w) => { w.tick(100); } },
    mochila: { dispara: (w) => w.sys.onMochilaCheia(w.p) },
  };

  for (const [tipo, g] of Object.entries(gatilhos)) {
    it(`${tipo}: não avisa com o alarme desligado, nem com a rota desligada ou pausada`, () => {
      const desligado = rodando({ alarmes: { [tipo]: false } }, g.setup);
      g.dispara(desligado);
      expect(alarmes(desligado, tipo)).toEqual([]);

      const parada = setup(g.setup);
      parada.pot.qtd = { hp: 50, mana: 50 };
      g.dispara(parada);
      expect(alarmes(parada, tipo)).toEqual([]);

      const pausada = rodando({}, g.setup);
      pausada.sys.manual("p"); // movimento manual pausa a rota
      pausada.tick(100);
      pausada.sent.length = 0;
      g.dispara(pausada);
      expect(alarmes(pausada, tipo)).toEqual([]);

      const ligada = rodando({}, g.setup);
      g.dispara(ligada);
      expect(alarmes(ligada, tipo)).toHaveLength(1);
    });
  }
});

describe("Estagiário: motivo e ponto no estado", () => {
  it("sem nada ligado: motivo vazio e sem ponto; rota rodando: ponto atual e o motivo de não agir", () => {
    const w = setup({ ratos: [{ x: 25, y: 25 }], saved: { config: comRota() }, over: { x: 19, y: 11 } });
    expect(w.sys.estado(w.p)).toMatchObject({ motivo: "", ponto: null });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick();
    expect(w.sys.estado(w.p)).toMatchObject({ motivo: "sem alvo por perto", ponto: { i: 2, n: 3 } });
    w.sys.manual("p");
    expect(w.sys.estado(w.p).motivo).toBe("pausado: você está jogando");
    w.tick(PAUSA_MANUAL_MS + TICK_MS);
    w.npc.aberto = true;
    w.tick();
    expect(w.sys.estado(w.p).motivo).toBe("pausado: conversa com NPC");
    w.npc.aberto = false;
    w.tick();
    w.add(player("q", 12, 12));
    w.p.targetId = "q";
    w.tick();
    expect(w.sys.estado(w.p).motivo).toBe("mirando um jogador");
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.p.mana = 5; // abaixo da reserva do cavaleiro (20%)
    w.tick();
    expect(w.sys.estado(w.p).motivo).toBe("reserva de mana");
  });

  it("o motivo mudou: manda o estado (no máximo um por segundo)", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick(100);
    expect(w.estados().at(-1)!.motivo).toBe("sem alvo por perto");
    const antes = w.estados().length;
    w.add(player("q", 12, 12));
    w.p.targetId = "q";
    w.tick(1000);
    expect(w.estados().length).toBe(antes + 1);
    expect(w.estados().at(-1)!.motivo).toBe("mirando um jogador");
    w.tick(3000);
    expect(w.estados().length).toBe(antes + 1); // nada mudou
  });
});

describe("Estagiário: Coliseu, acompanhante e pausas (revisão final)", () => {
  it("desligarRota pública (entrada/saída do Coliseu): desliga a rota, tira o 🤖 e o acompanhante, avisa e manda o estado", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sent.length = 0;
    w.sys.desligarRota(w.p, "O Estagiário não entra no Coliseu: a rota foi desligada.");
    expect(w.p.bot).toBe(false);
    expect(w.of("chase").at(-1)).toEqual(["chase", "p", false]);
    expect(w.of("despawn")).toEqual([["despawn", "p"]]);
    expect(w.estados().at(-1)).toMatchObject({ rota: null });
    expect(w.notices()).toEqual(["O Estagiário não entra no Coliseu: a rota foi desligada."]);
    // Sem rota ligada: nada (nem estado, nem aviso).
    w.sent.length = 0;
    w.sys.desligarRota(w.p, "x");
    expect(w.sent).toEqual([]);
  });

  it("acompanhante sumiu com a rota ligada (pausada ou não): o tick o põe de volta", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.of("spawn")).toHaveLength(1);
    w.tick();
    expect(w.of("spawn")).toHaveLength(1); // já existe: não chama de novo
    w.acompanhantes.delete("p");
    w.tick();
    expect(w.of("spawn")).toHaveLength(2);
    w.sys.manual("p");
    w.acompanhantes.delete("p");
    w.tick();
    expect(w.of("spawn")).toHaveLength(3);
    w.sys.onToggle(w.p, { rota: null });
    w.tick();
    expect(w.of("spawn")).toHaveLength(3); // rota desligada: não volta
  });

  it("pausa longa no mesmo alvo: ao voltar, o alvo válido não é largado no primeiro tick", () => {
    const w = setup({ ratos: [{ x: 25, y: 25 }], saved: { config: comRota() } });
    const rato = [...w.mm.all()][0]!;
    w.luta.alvo = rato.s.id;
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick(500);
    expect(w.p.targetId).toBe(rato.s.id);
    for (let i = 0; i < 3; i++) { w.sys.manual("p"); w.tick(5000); } // 15 s pausada (> PONTO_TRAVADO_MS)
    w.tick(PAUSA_MANUAL_MS);
    expect(w.sys.estado(w.p).pausa).toBe("");
    w.tick(500);
    expect(w.p.targetId).toBe(rato.s.id);
  });

  it("pausa (manual ou NPC) desliga a perseguição forçada e a volta religa; trocar de rota na pausa também religa", () => {
    const w = setup({ saved: { config: { ...comRota(), rotas: [...comRota().rotas, { nome: "Outra", pontos: [{ x: 10, y: 10 }, { x: 12, y: 10 }] }] } } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.calls.length = 0;
    w.sys.manual("p");
    expect(w.of("chase")).toEqual([["chase", "p", false]]);
    w.sys.manual("p"); // renovar não repete
    expect(w.of("chase")).toEqual([["chase", "p", false]]);
    w.tick(PAUSA_MANUAL_MS + TICK_MS);
    expect(w.of("chase")).toEqual([["chase", "p", false], ["chase", "p", true]]);

    w.calls.length = 0;
    w.npc.aberto = true;
    w.tick();
    expect(w.of("chase")).toEqual([["chase", "p", false]]);
    w.npc.aberto = false;
    w.tick();
    expect(w.of("chase")).toEqual([["chase", "p", false], ["chase", "p", true]]);

    w.calls.length = 0;
    w.sys.manual("p");
    w.sys.onToggle(w.p, { rota: "Outra" });
    expect(w.of("chase")).toEqual([["chase", "p", false], ["chase", "p", true]]);
    expect(w.sys.estado(w.p).pausa).toBe("");
  });

  it("ataque: sem magia pronta (ou abaixo da reserva) não varre os monstros", () => {
    const w = setup({ ratos: [{ x: 11, y: 10 }, { x: 11, y: 11 }], saved: { config: { ...estagiarioPadrao("knight"), ataque: [{ minBichos: 1, raio: 1, magia: "spin_strike" }, { minBichos: 2, raio: 1, magia: "spin_strike" }] } } });
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.sys.onToggle(w.p, { ataque: true });
    const all = vi.spyOn(w.mm, "all");
    const at = vi.spyOn(w.mm, "monsterAt");
    w.tick();
    expect(at).not.toHaveBeenCalled();
    expect(w.of("cast")).toEqual([]);
    w.prontas.add("spin_strike");
    w.tick();
    expect(all).not.toHaveBeenCalled(); // conta pelos tiles, sem varrer todos os monstros
    expect(at).toHaveBeenCalledTimes(9); // dois raios iguais: uma contagem só (3×3)
    expect(w.of("cast")).toHaveLength(1);
  });
});

describe("Estagiário v2: cura (poção que cobre a falta, aliado), comer", () => {
  it("a poção pede a menor que cobre o que falta (vida ou mana)", () => {
    const w = setup({ over: { hp: 30, maxHp: 500, mana: 10, maxMana: 300 } });
    w.sys.onToggle(w.p, { cura: true });
    w.tick();
    expect(w.of("pocao")).toEqual([["pocao", "hp", { silent: true }]]);
    expect(w.pot.cobertas).toEqual([470]);
    w.p.hp = 500;
    w.tick(2000);
    expect(w.pot.cobertas.at(-1)).toBe(290);
  });

  it("regra 'aliado': colega de grupo a até o raio da magia abaixo do limiar → cura em grupo; longe ou com vida boa, nada", () => {
    const cura = [{ quando: "aliado" as const, abaixoDe: 50, acao: { magia: "group_heal" } }];
    const w = setup({ vocation: "druid", aliados: ["q"], saved: { config: { ...estagiarioPadrao("druid"), cura } } });
    const q = w.add(player("q", 12, 10, { hp: 40, maxHp: 100 }));
    w.prontas.add("group_heal");
    w.sys.onToggle(w.p, { cura: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["group_heal"]);
    w.calls.length = 0;
    q.hp = 90;
    w.tick();
    expect(w.of("cast")).toEqual([]);
    q.hp = 40; q.x = 20; // fora dos 4 tiles da Cura em Grupo
    w.tick();
    expect(w.of("cast")).toEqual([]);
    // Fora do grupo não conta.
    const w2 = setup({ vocation: "druid", saved: { config: { ...estagiarioPadrao("druid"), cura } } });
    w2.add(player("q", 12, 10, { hp: 40, maxHp: 100 }));
    w2.prontas.add("group_heal");
    w2.sys.onToggle(w2.p, { cura: true });
    w2.tick();
    expect(w2.of("cast")).toEqual([]);
  });

  it("comer sozinho: com a Cura ligada e o alimentado acabando, come (uma tentativa a cada 2 s); desligado ou satisfeito, não", () => {
    const w = setup();
    w.comida.restante = 30_000;
    w.tick(1000);
    expect(w.comida.comeu).toBe(0); // cura desligada
    w.sys.onToggle(w.p, { cura: true });
    w.tick(1000);
    expect(w.comida.comeu).toBe(1);
    w.tick(3000);
    expect(w.comida.comeu).toBe(2); // uma por COMER_INTERVALO_MS, não por tick
    w.comida.restante = 10 * 60_000;
    w.tick(5000);
    expect(w.comida.comeu).toBe(2);
    w.comida.restante = 0;
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), modo: "avancado", comer: false } });
    w.tick(5000);
    expect(w.comida.comeu).toBe(2);
  });
});

describe("Estagiário v2: buffs (combate real, fora de combate, invocação) e motivo", () => {
  it("'em combate' pela condição de combate (deu/levou dano), não por ter alvo; 'fora de combate' é o contrário", () => {
    const w = setup({ ratos: [{ x: 11, y: 10 }], saved: { config: { ...estagiarioPadrao("knight"), cura: [], buffs: [{ magia: "iron_skin", quando: "combate" }, { magia: "swift_feet", quando: "fora" }] } } });
    w.prontas.add("iron_skin").add("swift_feet");
    w.sys.onToggle(w.p, { buffs: true });
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.combate.em = false; // mirando, mas ninguém bateu ainda
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["swift_feet"]);
    w.calls.length = 0;
    w.conds.add("haste");
    w.combate.em = true;
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["iron_skin"]);
  });

  it("invocação: conjura quando o druida não tem invocação viva; com uma viva, espera", () => {
    const w = setup({ vocation: "druid", ratos: [{ x: 11, y: 10 }], saved: { config: { ...estagiarioPadrao("druid"), cura: [], buffs: [{ magia: "summon_wolf", quando: "combate" }] } } });
    w.prontas.add("summon_wolf");
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.sys.onToggle(w.p, { buffs: true });
    w.invoc.n = 1;
    w.tick();
    expect(w.of("cast")).toEqual([]);
    w.invoc.n = 0;
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["summon_wolf"]);
  });

  it("motivo 'sem mana para o buff' quando o buff pronto espera a mana mínima da regra", () => {
    const w = setup({ ratos: [{ x: 11, y: 10 }], over: { mana: 60 }, saved: { config: { ...estagiarioPadrao("knight"), buffs: [{ magia: "swift_feet", quando: "sempre", manaMin: 80 }] } } });
    w.prontas.add("swift_feet");
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.sys.onToggle(w.p, { ataque: true, buffs: true });
    w.tick();
    expect(w.of("cast")).toEqual([]);
    expect(w.sys.estado(w.p).motivo).toBe("sem mana para o buff");
    w.p.mana = 90;
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["swift_feet"]);
  });
});

describe("Estagiário v2: ataque com alcance, mana mínima e vida do alvo", () => {
  const regras = (ataque: EstagiarioConfig["ataque"]) => ({ ...estagiarioPadrao("knight"), modo: "avancado" as const, ataque });

  it("magia de alvo só conta como pronta com o alvo no alcance: longe, sai a Investida (4) no lugar do Golpe Brutal (1); mais longe, nada e o motivo explica", () => {
    const w = setup({ ratos: [{ x: 13, y: 10 }], saved: { config: regras([{ minBichos: 1, raio: 1, magia: "brutal_strike" }, { minBichos: 1, raio: 1, magia: "charge" }]) }, over: { level: 30 } });
    w.p.targetId = [...w.mm.all()][0]!.s.id; // a 3 tiles
    w.prontas.add("brutal_strike").add("charge");
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["charge"]);
    w.calls.length = 0;
    w.p.x = 7; // a 6 tiles: nenhuma alcança
    w.tick();
    expect(w.of("cast")).toEqual([]);
    expect(w.sys.estado(w.p).motivo).toBe("alvo fora do alcance");
    w.p.x = 12; // ao lado: o Golpe Brutal (primeira regra) sai
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["brutal_strike"]);
  });

  it("mana mínima da regra substitui a reserva geral (para baixo também); vida mínima do alvo pula a regra", () => {
    const w = setup({ ratos: [{ x: 11, y: 10 }], over: { mana: 15 }, saved: { config: regras([{ minBichos: 1, raio: 1, magia: "spin_strike", manaMin: 10 }]) } });
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.prontas.add("spin_strike");
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["spin_strike"]); // 15 % < reserva 20 %, mas a regra pede 10 %
    expect(w.sys.estado(w.p).motivo).toBe("");

    const w2 = setup({ ratos: [{ x: 11, y: 10 }], saved: { config: regras([{ minBichos: 1, raio: 1, magia: "spin_strike", vidaAlvoMin: 50 }, { minBichos: 1, raio: 1, magia: "charge" }]) } });
    const rato = [...w2.mm.all()][0]!;
    rato.s.hp = 10; // 33 % de 30
    w2.p.targetId = rato.s.id;
    w2.prontas.add("spin_strike").add("charge");
    w2.sys.onToggle(w2.p, { ataque: true });
    w2.tick();
    expect(w2.of("cast").map((c) => c[1])).toEqual(["charge"]);
  });
});

describe("Estagiário v2: manter distância", () => {
  it("a perseguição forçada para à distância da opção (limitada ao alcance da arma); o cavaleiro (0) fica colado", () => {
    const w = setup({ vocation: "paladin", alcance: 6, saved: { config: { ...comRota(), distancia: 3 } } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.of("chase")).toEqual([["chase", "p", true, 3]]);
    w.calls.length = 0;
    w.sys.onConfig(w.p, { config: { ...comRota(), distancia: 4 } });
    w.tick();
    expect(w.of("chase")).toEqual([["chase", "p", true, 4]]); // mudou: reenvia uma vez
    w.tick(1000);
    expect(w.of("chase")).toHaveLength(1);
    // Arma corpo a corpo: a opção não vale (colado).
    const w2 = setup({ vocation: "paladin", alcance: 1, saved: { config: { ...comRota(), distancia: 3 } } });
    w2.sys.onToggle(w2.p, { rota: "Ratos" });
    expect(w2.of("chase")).toEqual([["chase", "p", true]]);
    const w3 = setup({ saved: { config: comRota() } });
    w3.sys.onToggle(w3.p, { rota: "Ratos" });
    expect(w3.of("chase")).toEqual([["chase", "p", true]]);
  });

  it("com um monstro corpo a corpo encostado, recua um passo para longe dele mantendo o alvo no alcance; sem a opção ou monstro à distância, fica", () => {
    const base = { vocation: "paladin" as const, alcance: 6, andar: true, bicho: { stationary: false } };
    const w = setup({ ...base, ratos: [{ x: 11, y: 10 }], saved: { config: { ...estagiarioPadrao("paladin"), distancia: 3, rotas: comRota().rotas } } });
    w.p.targetId = [...w.mm.all()][0]!.s.id;
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick(1000);
    expect(w.p.x).toBeLessThan(10); // deu pelo menos um passo para oeste (longe do rato a leste)
    expect(w.p.y).toBe(10);
    expect(w.sys.estado(w.p).motivo).toBe("mantendo distância");
    // Sem a opção: fica onde está.
    const w2 = setup({ ...base, ratos: [{ x: 11, y: 10 }], saved: { config: { ...estagiarioPadrao("paladin"), distancia: 0, rotas: comRota().rotas } } });
    w2.p.targetId = [...w2.mm.all()][0]!.s.id;
    w2.sys.onToggle(w2.p, { rota: "Ratos" });
    w2.tick(1000);
    expect([w2.p.x, w2.p.y]).toEqual([10, 10]);
    // Monstro que ataca à distância encostado: recuar não adianta.
    const w3 = setup({ ...base, bicho: { stationary: false, attackRange: 5 }, ratos: [{ x: 11, y: 10 }], saved: { config: { ...estagiarioPadrao("paladin"), rotas: comRota().rotas } } });
    w3.p.targetId = [...w3.mm.all()][0]!.s.id;
    w3.sys.onToggle(w3.p, { rota: "Ratos" });
    w3.tick(1000);
    expect([w3.p.x, w3.p.y]).toEqual([10, 10]);
  });

  it("não recua a mais de RECUO_MAX_TILES da rota nem na pausa manual", () => {
    const w = setup({ vocation: "paladin", alcance: 6, andar: true, bicho: { stationary: false }, ratos: [{ x: 11, y: 10 }], saved: { config: { ...estagiarioPadrao("paladin"), rotas: comRota().rotas } } });
    const rato = [...w.mm.all()][0]!;
    w.p.targetId = rato.s.id;
    w.sys.onToggle(w.p, { rota: "Ratos" });
    // O rato "acompanha" (pelo índice de posição do servidor): a cada passo do jogador, volta a encostar. Menos de 10 s no
    // total, senão o alvo parado sem perder vida conta como inalcançável e é largado (alvoTravado).
    for (let i = 0; i < 25; i++) { w.tick(300); w.mm.place(rato, w.p.x + 1, w.p.y); }
    expect(10 - w.p.x).toBeLessThanOrEqual(RECUO_MAX_TILES);
    expect(10 - w.p.x).toBeGreaterThanOrEqual(RECUO_MAX_TILES - 1);
    const x = w.p.x;
    w.sys.manual("p");
    w.mm.place(rato, w.p.x + 1, w.p.y);
    w.tick(1000);
    expect(w.p.x).toBe(x);
  });
});

describe("Estagiário: manter distância sem travar (2026-11-06)", () => {
  it("lutas emendadas não prendem o recuo: segue fugindo ao longo da rota, bem além de 6 tiles de onde a luta começou", () => {
    // Dono: "tem hora que o char para de correr do bicho". Antes o limite contava da origem da luta (que as lutas
    // emendadas mantinham) e, depois de ~6 passos, o personagem parava e apanhava. Agora conta da rota (x 10..20).
    const w = setup({ vocation: "paladin", alcance: 6, andar: true, bicho: { stationary: false }, ratos: [{ x: 9, y: 10 }], saved: { config: { ...estagiarioPadrao("paladin"), distancia: 4, rotas: comRota().rotas } } });
    const rato = [...w.mm.all()][0]!;
    w.p.targetId = rato.s.id;
    w.sys.onToggle(w.p, { rota: "Ratos" });
    for (let i = 0; i < 25; i++) { w.tick(300); w.mm.place(rato, w.p.x - 1, w.p.y); }
    expect(w.p.x - 10).toBeGreaterThan(6); // passou do limite antigo
    expect(w.p.x).toBeLessThanOrEqual(20 + RECUO_MAX_TILES); // e nunca longe da rota
  });
});

describe("Estagiário v3: diário de decisões", () => {
  it("poção com o ganho e o interruptor; 'esperando' com os motivos no máximo a cada DIARIO_ESPERA_MS; uma mensagem por tick", () => {
    const w = setup({ over: { hp: 30 } }); // vida 20 %: poção < 50 %, Limpar Feridas e Cura < 35 %
    w.pot.cura = 50;
    w.sys.onToggle(w.p, { cura: true });
    w.tick();
    expect(w.diarios()).toHaveLength(1);
    expect(w.diarios()[0]!.itens.map((i) => [i.canal, i.texto])).toEqual([["interruptor", "Cura ligada"], ["pocao", "vida 20% → poção de vida, +50"]]);

    w.sent.length = 0;
    w.p.hp = 30;
    w.pot.pronta = false; // nada pronto: as magias não estão em `prontas`
    w.tick();
    const esperas = () => w.diarios().flatMap((d) => d.itens).filter((i) => i.texto.includes("esperando")).map((i) => i.texto);
    expect(esperas()).toEqual(["vida 20%: esperando (poção de vida em recarga; Limpar Feridas em recarga; Cura em recarga)"]);
    w.tick();
    expect(esperas()).toHaveLength(1); // mesma espera, sem repetir a cada tick
    w.tick(DIARIO_ESPERA_MS);
    expect(esperas()).toHaveLength(2);

    // Sem poção que dê para beber, o motivo é outro.
    w.sent.length = 0;
    w.pot.bebivel.hp = false;
    w.tick(DIARIO_ESPERA_MS);
    expect(esperas().at(-1)).toBe("vida 20%: esperando (nenhuma poção de vida que você possa beber; Limpar Feridas em recarga; Cura em recarga)");
  });

  it("Cura desligada com a vida abaixo de uma regra: avisa a cada DIARIO_CURA_OFF_MS; ligada, não", () => {
    const w = setup({ over: { hp: 30 } });
    w.tick();
    const avisos = () => w.sys.diario("p").filter((i) => i.texto.includes("Cura está desligada"));
    expect(avisos().map((i) => [i.canal, i.texto])).toEqual([["aviso", "vida 20%: a Cura está desligada"]]);
    w.tick(DIARIO_CURA_OFF_MS / 2);
    expect(avisos()).toHaveLength(1);
    w.tick(DIARIO_CURA_OFF_MS);
    expect(avisos()).toHaveLength(2);
    w.p.hp = 150; // vida cheia: nenhuma regra vale, nada a avisar
    w.tick(DIARIO_CURA_OFF_MS);
    expect(avisos()).toHaveLength(2);
  });

  it("guarda só as últimas DIARIO_MAX linhas; ao reconectar vai inteiro ('tudo')", () => {
    const w = setup({ over: { hp: 30 } });
    w.sys.onToggle(w.p, { cura: true });
    w.tick(TICK_MS * (DIARIO_MAX + 10)); // uma poção por tick (a falsa não cura)
    expect(w.sys.diario("p")).toHaveLength(DIARIO_MAX);
    expect(w.sys.diario("p")[0]!.texto).toBe("vida 20% → poção de vida"); // a linha do interruptor já saiu
    w.sent.length = 0;
    w.sys.desligarTudo(w.p);
    w.sys.reconectou(w.p);
    w.tick();
    expect(w.diarios()).toHaveLength(1);
    expect(w.diarios()[0]).toMatchObject({ tudo: true });
    expect(w.diarios()[0]!.itens).toHaveLength(DIARIO_MAX);
  });

  it("rota ligada/pausada/desligada (com o motivo), buff, comida e alarme entram no diário", () => {
    const w = setup({ saved: { config: comRota({ buffs: [{ magia: "swift_feet", quando: "sempre" }] }) } });
    w.prontas.add("swift_feet");
    w.comida.restante = 1000;
    w.pot.qtd = { hp: 20, mana: 20 }; // acima do mínimo do alarme de poção (ele também entraria no diário)
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick();
    w.sys.manual("p");
    w.sys.alarme(w.p, "mochila", "Estagiário: mochila cheia — o loot está ficando no chão.");
    w.sys.onToggle(w.p, { rota: null });
    w.tick();
    expect(w.sys.diario("p").map((i) => `${i.canal}: ${i.texto}`)).toEqual([
      'rota: rota "Ratos" ligada',
      "comer: comeu: o alimentado estava acabando",
      "buff: Pés Ligeiros conjurado",
      "rota: rota pausada: você se mexeu",
      "aviso: mochila cheia — o loot está ficando no chão.",
      'rota: rota "Ratos" desligada',
    ]);
    // Motivos automáticos: o turno acabou.
    const w2 = setup({ saved: { config: comRota(), turno: { ms: TICK_MS, em: 10_000 } } });
    w2.sys.onToggle(w2.p, { rota: "Ratos" });
    w2.tick(TICK_MS * 3);
    expect(w2.sys.diario("p").map((i) => i.texto)).toContain('rota "Ratos" desligada: o turno acabou');
  });
});

describe("Estagiário v3: caçar com amigo (seguir um colega do grupo)", () => {
  /** Um colega "q" a 2 tiles do "p", no grupo (ou não), vivo. */
  const comColega = (o: Parameters<typeof setup>[0] = {}, grupo = true) => {
    const w = setup({ ...o, grupo: grupo ? ["q", ...(o.grupo ?? [])] : o.grupo });
    w.pot.qtd = { hp: 20, mana: 20 }; // acima do mínimo do alarme de poção (não é ele que está em teste)
    const q = w.add(player("q", 12, 10, { vocation: "druid", level: 20, hp: 150, maxHp: 150, mana: 100, maxMana: 100, name: "Quico" }));
    w.mm.playerList = [...w.players.values()];
    w.mv.addPlayer(q);
    return { ...w, q };
  };

  it("só colega do grupo, vivo e a até SEGUIR_MAX_TILES; liga crachá, acompanhante e perseguição forçada; o estado mostra quem", () => {
    const w = comColega({}, false);
    w.sys.onToggle(w.p, { seguir: "q" });
    expect(w.p.bot).toBe(false);
    expect(w.notices().at(-1)).toContain("grupo");
    const w2 = comColega();
    w2.q.hp = 0;
    w2.sys.onToggle(w2.p, { seguir: "q" });
    expect(w2.p.bot).toBe(false);
    w2.q.hp = 150;
    w2.q.x = 30;
    w2.sys.onToggle(w2.p, { seguir: "q" });
    expect(w2.p.bot).toBe(false);
    expect(w2.notices().at(-1)).toContain("Chegue perto");
    w2.q.x = 12;
    w2.sys.onToggle(w2.p, { seguir: "q" });
    expect(w2.p.bot).toBe(true);
    expect(w2.of("spawn")).toHaveLength(1);
    expect(w2.of("chase").at(-1)).toEqual(["chase", "p", true]);
    expect(w2.estados().at(-1)).toMatchObject({ seguindo: { id: "q", nome: "Quico" }, rota: null, cura: true, ataque: true, buffs: true });
    expect(w2.sys.diario("p").map((i) => i.texto)).toContain("seguindo Quico");
    // Seguir a si mesmo ou alguém que não existe: nada.
    w2.sys.onToggle(w2.p, { seguir: "p" });
    w2.sys.onToggle(w2.p, { seguir: "ninguem" });
    expect(w2.estados().at(-1)!.seguindo).toEqual({ id: "q", nome: "Quico" });
  });

  it("sem alvo anda atrás do colega (follow); com alvo a perseguição manda (cancela o follow) e o alvo do colega vem primeiro", () => {
    const w = comColega({ ratos: [{ x: 14, y: 10 }, { x: 18, y: 10 }] });
    const [perto, longe] = [...w.mm.all()].sort((a, b) => a.s.x - b.s.x);
    w.sys.onToggle(w.p, { seguir: "q" });
    w.tick();
    expect(w.of("follow")).toEqual([["follow", "q"]]);
    expect(w.p.followId).toBe("q");
    // O colega mira o rato mais longe: o seguidor vai nele, não no mais perto.
    w.q.targetId = longe!.s.id;
    w.luta.alvo = perto!.s.id;
    w.tick(BUSCA_MS_TESTE);
    expect(w.p.targetId).toBe(longe!.s.id);
    expect(w.of("unfollow")).toHaveLength(1);
    expect(w.p.followId).toBe("");
    // Rato morto: volta a seguir.
    longe!.s.hp = 0; w.q.targetId = ""; w.luta.alvo = "";
    w.tick(1000);
    expect(w.p.followId).toBe("q");
  });

  it("com o ataque automático (F8) ligado, o alvo do colega não é trocado pelo bicho mais perto (os dois não disputam o alvo)", () => {
    const w = comColega({ andar: true, lutaReal: true, ratos: [{ x: 14, y: 10 }, { x: 18, y: 10 }], over: { auto: true, chase: true } });
    const [perto, longe] = [...w.mm.all()].sort((a, b) => a.s.x - b.s.x);
    w.q.targetId = longe!.s.id;
    w.sys.onToggle(w.p, { seguir: "q" });
    // A cada tick: o alvo nunca é o rato mais perto (antes o F8 trocava para ele e o Estagiário voltava ao do colega).
    const alvos = new Set<string>();
    for (let ms = 0; ms < 3000; ms += TICK_MS) { w.tick(); if (w.p.targetId) alvos.add(w.p.targetId); }
    expect([...alvos]).toEqual([longe!.s.id]);
    // Desligou o seguir: o ataque automático do jogador volta a escolher (sem alvo, o mais perto de onde ele está).
    w.sys.onToggle(w.p, { seguir: null });
    expect(w.sys.mirando("p")).toBe(false);
    w.p.targetId = "";
    const maisPerto = [perto!, longe!].sort((a, b) => Math.abs(a.s.x - w.p.x) - Math.abs(b.s.x - w.p.x))[0]!;
    w.tick(1000);
    expect(w.p.targetId).toBe(maisPerto.s.id);
  });

  it("desliga com alarme 'colega' quando ele morre, sai do grupo ou sai do jogo; longe não desliga; o seguir gasta turno", () => {
    const alarmes = (w: ReturnType<typeof comColega>) => w.sent.filter((s) => s.type === S2C.EstagiarioAlarme).map((s) => s.msg.tipo);
    const w = comColega();
    w.sys.onToggle(w.p, { seguir: "q" });
    const t0 = w.sys.estado(w.p).turnoMs;
    w.tick(2000);
    expect(w.sys.estado(w.p).turnoMs).toBeLessThan(t0);
    w.q.hp = 0;
    w.tick();
    expect(w.sys.estado(w.p).seguindo).toBeNull();
    expect(w.p.bot).toBe(false);
    expect(alarmes(w)).toEqual(["colega"]);
    expect(w.sys.diario("p").map((i) => i.texto)).toContain("parou de seguir Quico: Quico morreu");

    const w2 = comColega();
    w2.sys.onToggle(w2.p, { seguir: "q" });
    w2.q.x = 30; // longe (o movimento falso não anda): procura, avisa uma vez depois de SEGUIR_SUMIU_MS e não desliga
    w2.tick(SEGUIR_SUMIU_MS - TICK_MS);
    expect(w2.sys.estado(w2.p).motivo).toBe("procurando Quico");
    expect(alarmes(w2)).toEqual([]);
    w2.tick(SEGUIR_SUMIU_MS * 3);
    expect(w2.sys.estado(w2.p).seguindo).toEqual({ id: "q", nome: "Quico" });
    expect(alarmes(w2)).toEqual(["colega"]);
    w2.q.x = 12; // voltou: retoma o follow sozinho
    w2.tick();
    expect(w2.p.followId).toBe("q");
    expect(w2.sys.estado(w2.p).motivo).not.toBe("procurando Quico");
    expect(w2.sys.diario("p").map((i) => i.texto)).toContain("reencontrou Quico");

    const w3 = comColega();
    w3.sys.onToggle(w3.p, { seguir: "q" });
    w3.players.delete("q"); // saiu do jogo
    w3.tick();
    expect(w3.sys.estado(w3.p).seguindo).toBeNull();
  });

  it("perdeu o colega de vista (correu para longe): vai aonde o viu por último, sem o aviso do follow, e retoma ao reencontrá-lo", () => {
    const w = comColega({ andar: true, lutaReal: true });
    w.sys.onToggle(w.p, { seguir: "q" });
    w.tick(500);
    // Some de uma vez para longe (como um passo grande): visto por último em (12,10)… depois em (24,10), a 14 do seguidor.
    w.q.x = 24; w.tick();
    expect(w.st().colegaVisto).toEqual({ x: 24, y: 10 });
    w.q.x = 39; w.tick();
    expect(w.sys.estado(w.p).motivo).toBe("procurando Quico");
    expect(w.p.followId).toBe("");
    w.tick(6000);
    // Andou até onde o viu (24,10): ali o reencontra (a 15 de 39) e volta ao follow, sem "Você parou de seguir".
    expect(w.p.x).toBeGreaterThanOrEqual(24);
    expect(w.p.followId).toBe("q");
    expect(w.notices().filter((n) => n.includes("parou de seguir"))).toEqual([]);
    expect(w.sys.estado(w.p).seguindo).not.toBeNull();
  });

  it("o colega pegou um portal: o seguidor vai ao portal, pisa nele e retoma o follow do outro lado", () => {
    const w = comColega({ andar: true, lutaReal: true, portalTiles: ["14,10"], portais: { "14,10": { x: 36, y: 30 } } });
    w.sys.onToggle(w.p, { seguir: "q" });
    w.tick(300);
    // O colega dá um passo para leste no portal (14,10) e sai em (36,31): o tick o vê saltar de (13,10).
    w.q.x = 13; w.q.dir = Dir.E; w.tick();
    w.q.x = 36; w.q.y = 31; w.tick();
    expect(w.st().colegaVisto).toEqual({ x: 14, y: 10 });
    w.tick(3000);
    expect(Math.max(Math.abs(w.p.x - 36), Math.abs(w.p.y - 31))).toBeLessThanOrEqual(2);
    expect(w.p.followId).toBe("q");
  });

  it("um ou outro: ligar a rota para de seguir e vice-versa; morrer e a queda param de seguir; gravar não começa seguindo", () => {
    const w = comColega({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { seguir: "q" });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    expect(w.sys.estado(w.p)).toMatchObject({ rota: "Ratos", seguindo: null });
    w.sys.onToggle(w.p, { seguir: "q" });
    expect(w.sys.estado(w.p)).toMatchObject({ rota: null, seguindo: { id: "q" } });
    w.sys.onGravar(w.p, { acao: "iniciar" });
    expect(w.sys.estado(w.p).gravando).toBe(false);
    w.sys.onDied(w.p);
    expect(w.sys.estado(w.p).seguindo).toBeNull();
    w.sys.onToggle(w.p, { seguir: "q" });
    w.sys.desligarTudo(w.p);
    expect(w.sys.estado(w.p).seguindo).toBeNull();
    expect(w.p.bot).toBe(false);
  });

  it("o líder com rota espera o seguidor longe (motivo 'esperando'), volta quando ele chega e desiste depois de ESPERAR_MAX_MS", () => {
    const w = comColega({ saved: { config: comRota() }, andar: true });
    w.sys.load(w.q, { config: { modo: "avancado" } } as never);
    w.sys.onToggle(w.q, { seguir: "p" });
    expect(w.sys.estado(w.q).seguindo).toEqual({ id: "p", nome: w.p.name });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.q.x = 10 + ESPERAR_TILES + 2; w.q.y = 20; // longe do líder
    const x0 = w.p.x;
    w.tick(2000);
    expect(w.p.x).toBe(x0); // não andou
    expect(w.sys.estado(w.p).motivo).toBe("esperando Quico");
    w.q.x = w.p.x + 2; w.q.y = w.p.y; // chegou
    w.tick(2000);
    expect(w.p.x).not.toBe(x0);
    expect(w.sys.estado(w.p).motivo).not.toContain("esperando");
    // Preso a 12 tiles (dentro do alcance do seguir, longe demais para a rota): depois de ESPERAR_MAX_MS a rota segue.
    // (O passo que já estava em curso termina antes de medir.)
    w.q.x = w.p.x + 12; w.q.y = w.p.y;
    w.tick(500);
    const x1 = w.p.x;
    w.tick(ESPERAR_MAX_MS - 2000);
    expect(w.p.x).toBe(x1);
    // Voltou a andar: passa por mais de um tile (a posição no fim é caótica — a rota é um circuito curto).
    w.visitados.clear();
    w.tick(3000);
    expect(w.visitados.size).toBeGreaterThan(1);
    expect(w.sys.diario("p").map((i) => i.texto)).toContain("cansou de esperar Quico: segue a rota");
  });
});
