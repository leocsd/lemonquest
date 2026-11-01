// Estagiário no servidor: cura, ataque, turno, liga/desliga da rota e pausas (a caminhada da rota é a Task 5).
import { describe, expect, it } from "vitest";
import {
  BUSCA_TILES, PAUSA_MANUAL_MS, S2C, TICK_MS, TURNO_MAX_MS, estagiarioPadrao,
  type EstagiarioConfig, type EstagiarioEstadoMsg, type MonsterDef, type QuickPotionKind, type SpellGroup, type Vocation,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { EstagiarioSystem } from "./estagiario.ts";
import { def, openGrid, player, world } from "./testkit.ts";

type Chamada = [string, ...unknown[]];

interface SetupOpts {
  ratos?: { x: number; y: number }[];
  vocation?: Vocation;
  saved?: { config?: unknown; turno?: { ms: number; em: number } };
  over?: Partial<PlayerState>;
  groups?: SpellGroup[];
}

/**
 * Mundo 40×40 (PZ no canto 0..4), ratos selvagens onde pedido, o jogador "p" em (10,10) e falsos simples para magias,
 * poções, luta e acompanhante que registram as chamadas.
 */
function setup(o: SetupOpts = {}) {
  const defs: Record<string, MonsterDef> = { rato: def({ id: "rato", hp: 30, aggroRange: 0 }) };
  const w = world({
    grid: openGrid(40, 40), defs: (id) => defs[id],
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
    nearestTarget: (_p: PlayerState, reach: number) => { calls.push(["busca", reach]); return luta.alvo; },
    forceChase: (id: string, on: boolean) => { calls.push(["chase", id, on]); },
    resume: (id: string) => { calls.push(["resume", id]); },
  };
  const companions = {
    spawnCompanion: (pl: PlayerState) => { calls.push(["spawn", pl.id]); return {}; },
    despawnCompanion: (id: string) => { calls.push(["despawn", id]); },
  };
  const npc = { aberto: false };
  const sent: { to: string; type: string; msg: any }[] = [];
  const sys = new EstagiarioSystem({
    spells, potions, fight, monsters: w.mm,
    movement: { isIdle: () => true, pathFor: () => null, follow: () => "ok" },
    companions, npcOpen: () => npc.aberto, spellGroups: () => o.groups ?? [],
    players: () => w.players.values(), send: (to, type, msg) => sent.push({ to, type, msg }),
    now: () => clock,
  });
  sys.load(p, o.saved as never);
  const tick = (ms = TICK_MS) => {
    const end = clock + ms;
    while (clock < end) { clock += TICK_MS; sys.tick(clock); }
  };
  const estados = () => sent.filter((s) => s.type === S2C.EstagiarioEstado).map((s) => s.msg as EstagiarioEstadoMsg);
  const notices = () => sent.filter((s) => s.type === S2C.Notice).map((s) => s.msg.text as string);
  const of = (k: string) => calls.filter((c) => c[0] === k);
  return { ...w, p, sys, calls, of, prontas, pot, luta, npc, sent, estados, notices, tick, now: () => clock };
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
    const w = setup({ over: { mana: 30 } });
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

  it("sem alvo: busca o monstro mais próximo a BUSCA_TILES e retoma a perseguição", () => {
    const w = setup({ ratos: [{ x: 14, y: 10 }] });
    const rato = [...w.mm.all()][0]!;
    w.luta.alvo = rato.s.id;
    w.sys.onToggle(w.p, { ataque: true });
    w.tick();
    expect(w.of("busca")).toEqual([["busca", BUSCA_TILES]]);
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

  it("onDied desliga só a rota; desligarTudo desliga tudo, sem alarme", () => {
    const w = setup({ saved: { config: comRota() } });
    w.sys.onToggle(w.p, { cura: true, ataque: true });
    w.sys.onToggle(w.p, { rota: "Ratos" });
    w.sys.onDied(w.p);
    expect(w.p.bot).toBe(false);
    expect(w.sys.estado(w.p)).toMatchObject({ rota: null, cura: true, ataque: true });

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
    const w = setup({ saved: { config: comRota() }, over: { mana: 30 } });
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

describe("Estagiário: alarmes e gravação (ganchos)", () => {
  it("alarme respeita o liga/desliga; 'morte' sempre sai", () => {
    const w = setup({ saved: { config: { ...estagiarioPadrao("knight"), alarmes: { jogador: false, morte: false } } } });
    w.sys.alarme(w.p, "jogador", "Fulano chegou");
    w.sys.alarme(w.p, "morte", "Você morreu");
    w.sys.alarme(w.p, "pocao", "Poções acabando");
    expect(w.sent.filter((s) => s.type === S2C.EstagiarioAlarme).map((s) => s.msg)).toEqual([
      { tipo: "morte", texto: "Você morreu" }, { tipo: "pocao", texto: "Poções acabando" },
    ]);
  });

  it("onGravar responde o estado sem gravar (a gravação é da Task 5)", () => {
    const w = setup();
    w.sys.onGravar(w.p, { acao: "iniciar" });
    expect(w.estados().at(-1)).toMatchObject({ gravando: false, pontosGravados: 0 });
  });
});
