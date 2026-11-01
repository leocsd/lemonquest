// Estagiário no servidor: cura, ataque, turno, liga/desliga da rota, pausas, gravação e caminhada da rota.
import { describe, expect, it, vi } from "vitest";
import {
  BUSCA_TILES, PAUSA_MANUAL_MS, POCAO_ALARME_MIN, TURNO_AVISO_MS, PONTO_TRAVADO_MS, ROTAS_MAX, S2C, TICK_MS, TURNO_MAX_MS, estagiarioPadrao,
  type EstagiarioConfig, type EstagiarioEstadoMsg, type MonsterDef, type PontoRota, type QuickPotionKind, type SpellGroup,
  type Vocation,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { EstagiarioSystem } from "./estagiario.ts";
import { FightModeSystem } from "./fightmode.ts";
import { MovementSystem } from "./movement.ts";
import { def, grid, openGrid, player, world } from "./testkit.ts";

type Chamada = [string, ...unknown[]];

interface SetupOpts {
  ratos?: { x: number; y: number }[];
  vocation?: Vocation;
  saved?: { config?: unknown; turno?: { ms: number; em: number } };
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
}

/**
 * Mundo 40×40 (PZ no canto 0..4), ratos selvagens onde pedido, o jogador "p" em (10,10) e falsos simples para magias,
 * poções, luta e acompanhante que registram as chamadas.
 */
function setup(o: SetupOpts = {}) {
  const defs: Record<string, MonsterDef> = { rato: def({ id: "rato", hp: 30, aggroRange: 0, stationary: true, respawnMs: 999_999 }) };
  const grade = openGrid(40, 40);
  const bloqueados = new Set((o.paredes ?? []).map((t) => `${t.x},${t.y}`));
  const gradeAndar = grid(Array.from({ length: 40 }, (_, y) => Array.from({ length: 40 }, (_, x) => (bloqueados.has(`${x},${y}`) ? "#" : ".")).join("")));
  const w = world({
    grid: grade, defs: (id) => defs[id],
    spawns: (o.ratos ?? []).map((r) => ({ defId: "rato", x: r.x, y: r.y, count: 1, radius: 0 })),
    safeZones: [{ x0: 0, y0: 0, x1: 4, y1: 4 }],
  });
  w.mm.spawnAll();
  const p = w.add(player("p", 10, 10, { vocation: o.vocation ?? "knight", level: 20, hp: 150, maxHp: 150, mana: 100, maxMana: 100, bot: false, ...o.over }));
  w.mm.playerList = [...w.players.values()];
  let clock = 10_000;
  const calls: Chamada[] = [];
  const prontas = new Set<string>();
  const spells = {
    ready: (_p: PlayerState, id: string) => prontas.has(id),
    cast: (_p: PlayerState, id: string, targetId?: string, opts?: { silent?: boolean }) => { calls.push(["cast", id, targetId, opts]); return { ok: true }; },
  };
  const pot = { pronta: true, qtd: { hp: 5, mana: 5 } as Record<QuickPotionKind, number> };
  const potions = {
    potionReady: () => pot.pronta,
    usePotion: (_p: PlayerState, kind: QuickPotionKind, opts?: { silent?: boolean }) => { calls.push(["pocao", kind, opts]); return true; },
    countPotions: (_p: PlayerState, kind: QuickPotionKind) => pot.qtd[kind],
  };
  const luta = { alvo: "" };
  const fight = {
    nearestTarget: (_p: PlayerState, reach: number, ignorar?: (id: string) => boolean) => {
      calls.push(["busca", reach]);
      return luta.alvo && !ignorar?.(luta.alvo) ? luta.alvo : "";
    },
    forceChase: (id: string, on: boolean) => { calls.push(["chase", id, on]); },
    resume: (id: string) => { calls.push(["resume", id]); },
  };
  /** Donos com acompanhante no mundo (o teste pode tirar um, como o Coliseu faz ao sair). */
  const acompanhantes = new Set<string>();
  const companions = {
    spawnCompanion: (pl: PlayerState) => { calls.push(["spawn", pl.id]); acompanhantes.add(pl.id); return {}; },
    despawnCompanion: (id: string) => { calls.push(["despawn", id]); acompanhantes.delete(id); },
    companionOf: (id: string) => (acompanhantes.has(id) ? {} : undefined),
  };
  const npc = { aberto: false };
  const sent: { to: string; type: string; msg: any }[] = [];
  const mv = new MovementSystem(gradeAndar, { now: () => clock });
  mv.setExtraBlocker((x, y) => w.mm.isMonsterAt(x, y));
  mv.addPlayer(p);
  // Como no WorldRoom: o ataque automático do jogador (F8) consulta os monstros que o Estagiário largou.
  const real: FightModeSystem | null = o.lutaReal
    ? new FightModeSystem({ movement: mv, monsters: w.mm, attackRange: () => 1, now: () => clock, ignorado: (pid, mid): boolean => sys.ignorado(pid, mid) })
    : null;
  const sys = new EstagiarioSystem({
    spells, potions, fight: real ?? fight, monsters: w.mm,
    movement: o.andar ? mv : { isIdle: () => true, pathFor: () => null, follow: () => "ok" },
    companions, npcOpen: () => npc.aberto, spellGroups: () => o.groups ?? [],
    players: () => w.players.values(), send: (to, type, msg) => sent.push({ to, type, msg }),
    now: () => clock,
  });
  sys.load(p, o.saved as never);
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
  const of = (k: string) => calls.filter((c) => c[0] === k);
  const indice = (): number => (sys as any).st.get("p").indice;
  return { ...w, p, sys, mv, calls, of, prontas, pot, luta, npc, sent, estados, notices, tick, visitados, indice, acompanhantes, now: () => clock };
}

/** Config com a rota "Ratos" de 3 pontos (10,10) → (15,10) → (20,10). */
const comRota = (extra: Partial<EstagiarioConfig> = {}): EstagiarioConfig => ({
  ...estagiarioPadrao("knight"),
  rotas: [{ nome: "Ratos", pontos: [{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 20, y: 10 }] }],
  ...extra,
});

describe("Estagiário: carregar e salvar", () => {
  it("sem dado salvo: config padrão da vocação, turno cheio, nada ligado; saved não grava nada", () => {
    const w = setup({ vocation: "druid" });
    const e = w.sys.estado(w.p);
    expect(e.config).toEqual(estagiarioPadrao("druid"));
    expect(e).toMatchObject({ cura: false, ataque: false, rota: null, pausa: "", gravando: false, pontosGravados: 0, turnoMs: TURNO_MAX_MS });
    expect(w.sys.saved(w.p)).toBeUndefined();
  });

  it("só o que difere do padrão é gravado: config mudada e turno gasto voltam no próximo load (sanitizados)", () => {
    const w = setup();
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), reservaMana: 55 } });
    expect(w.sys.saved(w.p)).toEqual({ config: { ...estagiarioPadrao("knight"), reservaMana: 55 } });

    const w2 = setup({ saved: { config: { ...estagiarioPadrao("knight"), reservaMana: 999 }, turno: { ms: 60_000, em: 10_000 } } });
    expect(w2.sys.estado(w2.p).config.reservaMana).toBe(90); // sanitizado ao carregar
    expect(w2.sys.estado(w2.p).turnoMs).toBe(60_000);
    expect(w2.sys.saved(w2.p)).toEqual({ config: { ...estagiarioPadrao("knight"), reservaMana: 90 }, turno: { ms: 60_000, em: 10_000 } });
  });
});

describe("Estagiário: configuração", () => {
  it("onConfig sanitiza (magia de outra vocação sai; grupo do jogador fica), troca e responde o estado", () => {
    const groups = [{ id: "fam:my:1", name: "Meu", spells: ["spin_strike"] }];
    const w = setup({ groups });
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), ataque: [
      { minBichos: 1, raio: 1, magia: "fireball" }, { minBichos: 2, raio: 9, magia: "fam:my:1" },
    ] } as EstagiarioConfig });
    const e = w.estados().at(-1)!;
    expect(e.config.ataque).toEqual([{ minBichos: 2, raio: 4, magia: "fam:my:1" }]);
    expect(w.sys.estado(w.p).config.ataque).toEqual(e.config.ataque);
  });

  it("lixo não quebra nem apaga a configuração", () => {
    const w = setup();
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), reservaMana: 10 } });
    for (const lixo of [undefined, null, "lixo", 7, { config: "x" }, { config: [1, 2] }]) w.sys.onConfig(w.p, lixo as never);
    expect(w.sys.estado(w.p).config.reservaMana).toBe(10);
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
    expect(w2.notices().at(-1)).toBe("O turno do Estagiário acabou por hoje.");
    expect(w2.of("spawn")).toEqual([]);
  });
});

describe("Estagiário: cura", () => {
  it("poção de vida abaixo de 35%, depois a magia de cura quando a poção não está pronta; uma ação por tick, silenciosa", () => {
    const w = setup({ over: { hp: 30, mana: 10 } }); // vida 20%, mana 10%: todas as regras valem
    w.sys.onToggle(w.p, { cura: true });
    w.prontas.add("light_heal");
    w.tick();
    expect(w.calls.filter((c) => c[0] === "pocao" || c[0] === "cast")).toEqual([["pocao", "hp", { silent: true }]]);

    w.calls.length = 0;
    w.pot.pronta = false; // recarga da poção: vai a magia
    w.tick();
    expect(w.calls).toEqual([["cast", "light_heal", undefined, { silent: true }]]);

    w.calls.length = 0;
    w.pot.pronta = true; w.pot.qtd.hp = 0; // sem poção de vida: a magia
    w.tick();
    expect(w.calls).toEqual([["cast", "light_heal", undefined, { silent: true }]]);
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

describe("Estagiário: ataque", () => {
  const regras = (magia: string, minBichos = 2, raio = 1) => ({ ...estagiarioPadrao("knight"), ataque: [{ minBichos, raio, magia }] });

  it("sem alvo: busca o monstro mais próximo a BUSCA_TILES; só o ataque ligado não retoma a perseguição", () => {
    const w = setup({ ratos: [{ x: 14, y: 10 }] });
    const rato = [...w.mm.all()][0]!;
    w.luta.alvo = rato.s.id;
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("busca")).toEqual([["busca", BUSCA_TILES]]);
    expect(w.p.targetId).toBe(rato.s.id);
    // O jogador está jogando à mão: retomar cancelaria a pausa de 1,5 s que o Move/WalkTo acabou de pôr na perseguição.
    expect(w.of("resume")).toEqual([]);
  });

  it("alvo novo com a rota rodando retoma a perseguição; com a rota pausada (manual), não", () => {
    const w = setup({ ratos: [{ x: 14, y: 10 }], saved: { config: comRota() } });
    const rato = [...w.mm.all()][0]!;
    w.luta.alvo = rato.s.id;
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sys.manual("p");
    w.tick(1000);
    expect(w.p.targetId).toBe(rato.s.id);
    expect(w.of("resume")).toEqual([]);

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
    w.sys.onConfig(w.p, { config: { ...estagiarioPadrao("knight"), ataque: [{ minBichos: 1, raio: 1, magia: "fam:my:1" }] } });
    w.prontas.add("front_sweep");
    w.tick();
    expect(w.of("cast").map((c) => c[1])).toEqual(["front_sweep"]);
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
  it("rota rodando gasta o turno em tempo real; estado a cada 10 s; desligada recarrega 1/12", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    const antes = w.estados().length;
    w.tick(25_000);
    expect(w.sys.estado(w.p).turnoMs).toBe(TURNO_MAX_MS - 25_000);
    expect(w.estados().length - antes).toBe(2);

    w.sys.onToggle(w.p, { rota: null });
    w.tick(120_000);
    expect(w.sys.estado(w.p).turnoMs).toBe(TURNO_MAX_MS - 25_000 + 10_000);
  });

  it("o turno chega a 0: a rota desliga com aviso", () => {
    const w = setup({ saved: { config: comRota(), turno: { ms: 1000, em: 10_000 } } });
    w.sys.onToggle(w.p, { cura: true });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick(1000);
    expect(w.p.bot).toBe(false);
    expect(w.sys.estado(w.p)).toMatchObject({ rota: null, cura: true, turnoMs: 0 });
    expect(w.notices()).toContain("O turno do Estagiário acabou por hoje.");
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

  it("onDied desliga só a rota (e avisa a morte); desligarTudo desliga tudo, sem alarme", () => {
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
    expect(w.sys.estado(w.p)).toMatchObject({ rota: null, cura: false, ataque: false });
    expect(w.sent.filter((s) => s.type === S2C.EstagiarioAlarme)).toEqual([]);
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
    const w = setup();
    w.sys.onGravar(w.p, { acao: "iniciar" });
    expect(w.estados().at(-1)).toMatchObject({ gravando: true, pontosGravados: 1 });
    w.tick();
    andarAte(w, 13, 10);
    andarAte(w, 13, 12);
    w.p.x = 30; w.p.y = 30; // atravessou um portal pisado em (13,12)
    w.tick();
    andarAte(w, 31, 30);
    expect(w.sys.estado(w.p)).toMatchObject({ gravando: true, pontosGravados: 4 });
    w.sys.onGravar(w.p, { acao: "parar", nome: "  Caça\u0000 dos   ratos  " });
    const pontos: PontoRota[] = [
      { x: 10, y: 10 }, { x: 13, y: 10 }, { x: 13, y: 12, portal: true }, { x: 30, y: 30 }, { x: 31, y: 30 },
    ];
    expect(w.estados().at(-1)).toMatchObject({ gravando: false, pontosGravados: 0 });
    expect(w.sys.estado(w.p).config.rotas).toEqual([{ nome: "Caça dos ratos", pontos }]);
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

  it("ponto ocupado (chega ao lado e não progride): também pula", () => {
    // O rato parado no ponto (15,10) ocupa o tile: o caminho chega ao lado e não chega mais perto.
    const w = setup({ andar: true, ratos: [{ x: 15, y: 10 }], saved: { config: rota([{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 14, y: 35 }]) } });
    w.sys.onToggle(w.p, { rota: "R" }); // a busca falsa nunca acha alvo: só a caminhada conta
    w.tick(3000);
    expect(w.indice()).toBe(1);
    expect([w.p.x, w.p.y]).toEqual([14, 10]); // ao lado do ponto, sem chegar
    w.tick(PONTO_TRAVADO_MS);
    expect(w.indice()).toBe(2); // pulou para o próximo (ainda andando até ele, longe)
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
      potions: { potionReady: () => false, usePotion: () => false, countPotions: () => 0 },
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
    q.x = 30; w.tick(100); // saiu
    q.x = 12; w.tick(100);
    expect(alarmes(w, "jogador")).toHaveLength(2);
    q.x = 30; w.tick(100);
    q.x = 12; q.hp = 0; w.tick(100); // morto não conta
    expect(alarmes(w, "jogador")).toHaveLength(2);
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
    w.tick(100);
    expect(alarmes(w, "turno")).toEqual([]);
    w.tick(300);
    expect(alarmes(w, "turno")).toEqual(["Estagiário: faltam 5 min de turno."]);
    w.tick(500);
    expect(alarmes(w, "turno")).toHaveLength(1);
    // Desliga, o turno recarrega acima de 5 min, liga de novo: avisa outra vez ao cruzar.
    w.sys.onToggle(w.p, { rota: null });
    (w.sys as any).st.get("p").turno = { ms: TURNO_AVISO_MS + 100, em: w.now() };
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.tick(300);
    expect(alarmes(w, "turno")).toHaveLength(2);
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
    turno: { setup: { saved: { turno: { ms: TURNO_AVISO_MS - 1, em: 10_000 } } }, dispara: (w) => { w.tick(100); } },
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
    w.tick();
    expect(all).not.toHaveBeenCalled();
    expect(w.of("cast")).toEqual([]);
    w.prontas.add("spin_strike");
    w.tick();
    expect(all).toHaveBeenCalledTimes(1); // dois raios iguais: uma varredura só
    expect(w.of("cast")).toHaveLength(1);
  });
});
