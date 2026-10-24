import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_KICKED, S2C } from "@lemonquest/shared";
import { ADMIN_COMMANDS, MAX_KICK_REASON_BYTES, clipBytes, handleAdminCommand, helpLines, isAdmin, muteRemaining, type AdminContext } from "./admin.ts";
import { handleChat } from "./chat.ts";
import { WorldRoom } from "../rooms/WorldRoom.ts";
import { createAccountWithCharacter, getCharacterByName, initDb } from "../persistence/db.ts";
import { resetAuthState, type AuthData } from "../persistence/auth.ts";
import type { CharacterRecord } from "../persistence/types.ts";

const PROD = { NODE_ENV: "production", LEMONQUEST_ADMINS: "Leo, Ana Maria" };

function player(id: string, name: string, x = 10, y = 10, level = 5): any {
  return { id, name, x, y, level };
}

/** Contexto falso: 3 jogadores online (Leo é admin), registros em memória. */
function fakeCtx(env: Record<string, string | undefined> = PROD) {
  const ps = [player("a", "Leo"), player("b", "Bia", 20, 20, 12), player("c", "Ana Maria", 30, 30, 40), player("d", "Ana", 5, 5, 2)];
  const recs = new Map<string, CharacterRecord>(ps.map((p) => [p.id, { id: 1, accountId: 1, name: p.name, vocation: "knight", level: p.level, xp: 0, x: p.x, y: p.y, dir: 4, data: {} }]));
  const offline: CharacterRecord = { id: 9, accountId: 9, name: "Caio", vocation: "druid", level: 3, xp: 0, x: 1, y: 1, dir: 4, data: {} };
  const sent: Array<[string, string, any]> = [];
  const lines: string[] = [];
  const ctx: AdminContext & { [k: string]: any } = {
    send: (id, type, msg) => sent.push([id, type, msg]),
    broadcast: vi.fn(),
    players: () => ps,
    record: (id) => recs.get(id),
    findOffline: (n) => (n.toLowerCase() === "caio" ? offline : undefined),
    saveOffline: vi.fn(),
    kick: vi.fn(),
    teleportNear: vi.fn(() => true),
    resetCode: vi.fn(async (account: string) => (account === "conta.leo" ? { code: "ABCDEFGH", account: "conta.leo", expiresAt: 0 } : null)),
    env,
    now: () => 1_000_000,
    log: (l) => lines.push(l),
  };
  const replies = () => sent.filter(([id, t]) => id === "a" && t === S2C.Notice).map(([, , m]) => m.text as string);
  return { ps, recs, offline, sent, lines, ctx, replies };
}

describe("admin: quem pode", () => {
  it("admin = nome em LEMONQUEST_ADMINS (normalizado), vale em produção e sem LEMONQUEST_DEV_COMMANDS", () => {
    expect(isAdmin("leo", PROD)).toBe(true);
    expect(isAdmin("ANA MARIA", PROD)).toBe(true);
    expect(isAdmin("Ana", PROD)).toBe(false);
    expect(isAdmin("Leo", { NODE_ENV: "production" })).toBe(false);
    expect(isAdmin("Leo", { LEMONQUEST_ADMINS: "Leo", LEMONQUEST_DEV_COMMANDS: "0" })).toBe(true);
  });

  it("não admin: comando de admin não é tratado (o chat responde 'Comando desconhecido.')", () => {
    const t = fakeCtx();
    const bia = t.ps[1];
    expect(handleAdminCommand(bia, "/kick Leo", t.ctx)).toBe(false);
    expect(t.ctx.kick).not.toHaveBeenCalled();
    const sent: any[] = [];
    const client = { sessionId: "b", send: (type: string, m: any) => sent.push([type, m]) } as any;
    const room = { broadcast: vi.fn() } as any;
    handleChat(room, client, bia, { text: "/online", channel: "global" }, { command: (p, text) => handleAdminCommand(p, text, t.ctx) });
    expect(sent).toEqual([[S2C.Notice, { text: "Comando desconhecido. Digite /ajuda para ver os comandos.", kind: "warn" }]]);
    expect(room.broadcast).not.toHaveBeenCalled();
  });

  it("admin: texto que não é comando de admin passa adiante (false)", () => {
    const t = fakeCtx();
    expect(handleAdminCommand(t.ps[0], "/level 50", t.ctx)).toBe(false);
    expect(handleAdminCommand(t.ps[0], "/xyz", t.ctx)).toBe(false);
  });
});

describe("admin: comandos", () => {
  it("/kick: nome com espaço (mais longo vence), motivo opcional, log [admin]", () => {
    const t = fakeCtx();
    const leo = t.ps[0];
    expect(handleAdminCommand(leo, "/kick ana maria spam no chat", t.ctx)).toBe(true);
    expect(t.ctx.kick).toHaveBeenLastCalledWith("c", "spam no chat");
    expect(handleAdminCommand(leo, "/kick Ana", t.ctx)).toBe(true);
    expect(t.ctx.kick).toHaveBeenLastCalledWith("d", "");
    expect(t.lines).toEqual(["[admin] Leo: /kick Ana Maria (motivo: spam no chat)", "[admin] Leo: /kick Ana"]);
    handleAdminCommand(leo, "/kick Fulano", t.ctx);
    handleAdminCommand(leo, "/kick", t.ctx);
    expect(t.ctx.kick).toHaveBeenCalledTimes(2);
    expect(t.replies().slice(-2)).toEqual(["Ninguém online com esse nome: Fulano", "Uso: /kick <nome> [motivo]"]);
    // Respostas vão SÓ para o admin, e também para o log do chat.
    expect(t.sent.every(([id, , m]) => id === "a" && m.log === true)).toBe(true);
  });

  it("/kick: motivo cortado para caber no frame de fechamento (bytes UTF-8)", () => {
    const t = fakeCtx();
    handleAdminCommand(t.ps[0], `/kick Bia ${"ção".repeat(80)}`, t.ctx);
    const reason = (t.ctx.kick as any).mock.calls[0][1] as string;
    expect(Buffer.byteLength(reason)).toBeLessThanOrEqual(MAX_KICK_REASON_BYTES);
    expect(reason.startsWith("çãoção")).toBe(true);
    expect(clipBytes("abc", 2)).toBe("ab");
  });

  it("/mute e /unmute: online (aviso ao alvo) e offline (salva o registro)", () => {
    const t = fakeCtx();
    const leo = t.ps[0];
    handleAdminCommand(leo, "/mute Bia 10", t.ctx);
    expect(t.recs.get("b")!.data.muted).toEqual({ until: 1_000_000 + 600_000, by: "Leo" });
    expect(t.sent.find(([id]) => id === "b")![2]).toMatchObject({ text: "Você foi silenciado por 10 min.", kind: "warn" });
    expect(muteRemaining(t.recs.get("b"), 1_000_000)).toBe(600_000);
    expect(muteRemaining(t.recs.get("b"), 1_000_000 + 600_000)).toBe(0);
    expect(t.recs.get("b")!.data.muted).toBeUndefined(); // vencido → limpo

    handleAdminCommand(leo, "/mute Ana Maria 90", t.ctx);
    expect(t.recs.get("c")!.data.muted?.until).toBe(1_000_000 + 90 * 60_000);
    handleAdminCommand(leo, "/unmute ana maria", t.ctx);
    expect(t.recs.get("c")!.data.muted).toBeUndefined();

    handleAdminCommand(leo, "/mute Caio 5", t.ctx);
    expect(t.offline.data.muted?.until).toBe(1_000_000 + 300_000);
    expect(t.ctx.saveOffline).toHaveBeenCalledWith(t.offline);
    handleAdminCommand(leo, "/unmute Caio", t.ctx);
    expect(t.offline.data.muted).toBeUndefined();
    expect(t.ctx.saveOffline).toHaveBeenCalledTimes(2);

    handleAdminCommand(leo, "/mute Bia", t.ctx);
    handleAdminCommand(leo, "/mute Bia 0", t.ctx);
    handleAdminCommand(leo, "/mute Ninguem 5", t.ctx);
    expect(t.replies().slice(-3)).toEqual([
      expect.stringMatching(/^Uso: \/mute/), expect.stringMatching(/^Uso: \/mute/), "Personagem não encontrado: Ninguem",
    ]);
    expect(t.lines).toContain("[admin] Leo: /mute Caio 5 min (offline)");
  });

  it("/anuncio: banner + linha no feed para todos", () => {
    const t = fakeCtx();
    handleAdminCommand(t.ps[0], "/anuncio  Servidor reinicia em 5 min ", t.ctx);
    expect(t.ctx.broadcast).toHaveBeenCalledWith(S2C.Announce, { text: "Servidor reinicia em 5 min", from: "Leo" });
    expect(t.ctx.broadcast).toHaveBeenCalledWith(S2C.Feed, { text: "📢 Servidor reinicia em 5 min", kind: "info" });
    expect(t.lines).toEqual(["[admin] Leo: /anuncio Servidor reinicia em 5 min"]);
    handleAdminCommand(t.ps[0], "/anuncio", t.ctx);
    expect(t.ctx.broadcast).toHaveBeenCalledTimes(2);
  });

  it("/online: lista ordenada com level", () => {
    const t = fakeCtx();
    handleAdminCommand(t.ps[0], "/online", t.ctx);
    expect(t.replies()).toEqual(["Online (4): Ana (2), Ana Maria (40), Bia (12), Leo (5)"]);
  });

  it("/resetsenha: código só para o admin; conta inexistente avisa", async () => {
    const t = fakeCtx();
    handleAdminCommand(t.ps[0], "/resetsenha conta.leo", t.ctx);
    handleAdminCommand(t.ps[0], "/resetsenha nada", t.ctx);
    await vi.waitFor(() => expect(t.replies()).toHaveLength(2));
    expect(t.ctx.resetCode).toHaveBeenCalledWith("conta.leo", "admin Leo");
    expect(t.replies()[0]).toContain("ABCD-EFGH");
    expect(t.replies()[1]).toBe("Conta não encontrada: nada");
    expect(t.sent.every(([id]) => id === "a")).toBe(true);
    expect(t.lines.join("\n")).not.toContain("ABCD"); // o código não vai para o log
  });

  it("/tp <nome>: teleporta para perto; /tp x y fica com o comando de dev quando ligado", () => {
    const t = fakeCtx();
    const leo = t.ps[0];
    handleAdminCommand(leo, "/tp ana maria", t.ctx);
    expect(t.ctx.teleportNear).toHaveBeenCalledWith(leo, t.ps[2]);
    expect(t.lines).toEqual(["[admin] Leo: /tp Ana Maria (30,30)"]);
    t.ctx.devTp = () => true;
    expect(handleAdminCommand(leo, "/tp 10 12", t.ctx)).toBe(false);
    t.ctx.devTp = () => false;
    expect(handleAdminCommand(leo, "/tp 10 12", t.ctx)).toBe(true);
    expect(t.replies().at(-1)).toBe("Ninguém online com esse nome: 10 12");
    (t.ctx.teleportNear as any).mockReturnValueOnce(false);
    handleAdminCommand(leo, "/tp Bia", t.ctx);
    expect(t.replies().at(-1)).toBe("Sem espaço livre perto de Bia.");
  });
});

// ---------------------------------------------------------------- sala real (mapa real)
const rooms: any[] = [];
function makeRoom(): any {
  const r = new WorldRoom() as any;
  r["__init"]();
  r.onCreate({});
  rooms.push(r);
  return r;
}
function fakeClient(r: any, sessionId: string) {
  const c = { sessionId, send: vi.fn(), leave: vi.fn() } as any;
  r.clients.push(c);
  return c;
}
const auth = (name: string): AuthData => ({ name, key: name.toLowerCase(), weakPassword: false });
const notices = (c: any) => c.send.mock.calls.filter((x: any[]) => x[0] === S2C.Notice).map((x: any[]) => x[1].text as string);

describe("admin: na sala (produção, sem comandos de dev)", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetAuthState();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEMONQUEST_DEV_COMMANDS", "1"); // mesmo ligado, produção desliga os de dev
    vi.stubEnv("LEMONQUEST_ADMINS", "Leo");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const n of ["Leo", "Bia"]) createAccountWithCharacter(n, "h", "s", "knight");
  });
  afterEach(() => {
    while (rooms.length) { const r = rooms.pop(); r.clock.clear(); clearInterval(r._simulationInterval); r.onDispose(); }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function setup() {
    const r = makeRoom();
    const cl = fakeClient(r, "l1"), cb = fakeClient(r, "b1");
    r.onJoin(cl, {}, auth("Leo"));
    r.onJoin(cb, {}, auth("Bia"));
    const say = (c: any, text: string) => handleChat(r, c, r.state.players.get(c.sessionId), { text, channel: "global" }, r.chatHooks);
    return { r, cl, cb, say };
  }

  it("admin usa /online em produção; /level (dev) é desconhecido; não admin não usa nada", () => {
    const { cl, cb, say } = setup();
    say(cl, "/online");
    say(cl, "/level 99");
    say(cb, "/online");
    expect(notices(cl)).toEqual(["Online (2): Bia (1), Leo (1)", "Comando desconhecido. Digite /ajuda para ver os comandos."]);
    expect(notices(cb)).toEqual(["Comando desconhecido. Digite /ajuda para ver os comandos."]);
  });

  it("/kick fecha com CLOSE_KICKED + motivo; sem reconexão automática", () => {
    const { r, cl, cb, say } = setup();
    say(cl, "/kick Bia chega de spam");
    expect(cb.leave).toHaveBeenCalledWith(CLOSE_KICKED, "chega de spam");
    say(cl, "/kick Bia");
    expect(cb.leave).toHaveBeenLastCalledWith(CLOSE_KICKED, "Expulso por um administrador");
    r.onDrop(cb, CLOSE_KICKED);
    expect(r.reconnecting.has("b1")).toBe(false);
    r.onLeave(cb, CLOSE_KICKED);
    expect(r.state.players.has("b1")).toBe(false);
  });

  it("/mute: bloqueia o chat (aviso), magia/comandos seguem; persiste após relog; /unmute libera", () => {
    const { r, cl, cb, say } = setup();
    const broadcast = vi.spyOn(r, "broadcast").mockImplementation(() => true);
    say(cl, "/mute Bia 30");
    say(cb, "oi gente");
    expect(broadcast).not.toHaveBeenCalledWith(S2C.Chat, expect.anything());
    expect(notices(cb)).toEqual(["Você foi silenciado por 30 min.", "Você está silenciado (mais 30 min)."]);

    r.onLeave(cb, 4000); // salva
    expect(getCharacterByName("Bia")!.data.muted).toMatchObject({ by: "Leo" });
    const cb2 = fakeClient(r, "b2");
    r.onJoin(cb2, {}, auth("Bia"));
    handleChat(r, cb2, r.state.players.get("b2"), { text: "voltei", channel: "global" }, r.chatHooks);
    expect(notices(cb2)).toEqual([expect.stringMatching(/^Você está silenciado/)]);

    say(cl, "/unmute Bia");
    handleChat(r, cb2, r.state.players.get("b2"), { text: "obrigado", channel: "global" }, r.chatHooks);
    expect(broadcast).toHaveBeenCalledWith(S2C.Chat, expect.objectContaining({ from: "Bia", text: "obrigado" }));
    r.onLeave(cb2, 4000);
    expect(getCharacterByName("Bia")!.data.muted).toBeUndefined();
  });

  it("/mute de personagem offline grava direto no banco", () => {
    createAccountWithCharacter("Caio", "h", "s", "druid");
    const { cl, say } = setup();
    say(cl, "/mute caio 15");
    expect(getCharacterByName("Caio")!.data.muted?.by).toBe("Leo");
    say(cl, "/unmute Caio");
    expect(getCharacterByName("Caio")!.data.muted).toBeUndefined();
  });

  it("/tp <nome>: admin vai para um tile vizinho livre do alvo", () => {
    const { r, cl, say } = setup();
    const bia = r.state.players.get("b1"), leo = r.state.players.get("l1");
    const sp = r.spawnPoint;
    r.movement.teleport(bia, sp.x, sp.y);
    r.movement.teleport(leo, sp.x, sp.y);
    say(cl, "/tp Bia");
    expect(Math.max(Math.abs(leo.x - bia.x), Math.abs(leo.y - bia.y))).toBeGreaterThanOrEqual(1);
    expect(Math.max(Math.abs(leo.x - bia.x), Math.abs(leo.y - bia.y))).toBeLessThanOrEqual(2);
    expect(cl.send).toHaveBeenCalledWith(S2C.Teleported, { x: leo.x, y: leo.y });
  });

  it("/anuncio chega a todos (banner + feed)", () => {
    const { r, cl, say } = setup();
    const broadcast = vi.spyOn(r, "broadcast").mockImplementation(() => true);
    say(cl, "/anuncio Evento no coliseu às 18h");
    expect(broadcast).toHaveBeenCalledWith(S2C.Announce, { text: "Evento no coliseu às 18h", from: "Leo" });
    expect(broadcast).toHaveBeenCalledWith(S2C.Feed, expect.objectContaining({ kind: "info" }));
  });
});

describe("admin + dev fora de produção", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetAuthState();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LEMONQUEST_DEV_COMMANDS", "1");
    vi.stubEnv("LEMONQUEST_ADMINS", "Leo");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createAccountWithCharacter("Leo", "h", "s", "knight");
  });
  afterEach(() => {
    while (rooms.length) { const r = rooms.pop(); r.clock.clear(); clearInterval(r._simulationInterval); r.onDispose(); }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("comandos de dev continuam (/level, /tp x y) junto com os de admin", () => {
    const r = makeRoom();
    const cl = fakeClient(r, "l1");
    r.onJoin(cl, {}, auth("Leo"));
    const leo = r.state.players.get("l1");
    const say = (text: string) => handleChat(r, cl, leo, { text, channel: "global" }, r.chatHooks);
    say("/level 20");
    expect(leo.level).toBe(20);
    const sp = r.spawnPoint;
    say(`/tp ${sp.x} ${sp.y}`);
    expect(notices(cl)).toContain(`Teleportado para ${sp.x},${sp.y}.`);
    say("/online");
    expect(notices(cl)).toContain("Online (1): Leo (20)");
  });
});

describe("/status", () => {
  it("admin vê as linhas do servidor; jogador comum não tem o comando", () => {
    const { ctx, replies, ps } = fakeCtx();
    ctx.status = () => ["linha 1", "linha 2"];
    expect(handleAdminCommand(ps[0], "/status", ctx)).toBe(true);
    expect(replies()).toEqual(["linha 1", "linha 2"]);
    expect(handleAdminCommand(ps[1], "/status", ctx)).toBe(false);
  });
});

describe("/ajuda", () => {
  it("jogador vê os comandos de grupo e o F1; só admin vê a lista de admin", () => {
    const player = helpLines("Bia", PROD), admin = helpLines("Leo", PROD);
    expect(player.join(" ")).toContain("/convidar");
    expect(player.join(" ")).toContain("F1");
    // A barra tem 10 teclas (1–0) desde o ciclo 8; o texto antigo "1–8" não pode voltar.
    expect(player.join(" ")).toContain("1–0");
    expect(player.join(" ")).not.toContain("1–8");
    expect(player.join(" ")).not.toContain("/kick");
    for (const c of ADMIN_COMMANDS) expect(admin.join(" ")).toContain(c);
  });
});

describe("admin: /vincular (ClickUp)", () => {
  it("vincula por apelido (online ou offline, nome com espaço), desvincula e lista", () => {
    const t = fakeCtx();
    const links = new Map<string, { name: string; since: number }>();
    t.ctx.work = {
      link: (name, uid) => { for (const [k, v] of links) if (v.name === name) links.delete(k); if (uid) links.set(uid, { name, since: 0 }); },
      list: () => [...links],
    };
    const leo = t.ps[0];
    handleAdminCommand(leo, "/vincular Ana Maria pedrão", t.ctx);
    expect(links.get("43024221")?.name).toBe("Ana Maria");
    handleAdminCommand(leo, "/vincular caio Lucas P.", t.ctx);
    expect(links.get("118037728")?.name).toBe("Caio");
    handleAdminCommand(leo, "/vincular Ana Maria nenhum", t.ctx);
    expect([...links.keys()]).toEqual(["118037728"]);
    handleAdminCommand(leo, "/vincular Ninguem pedrao", t.ctx);
    expect(t.replies().at(-1)).toContain("não encontrado");
    handleAdminCommand(leo, "/vincular", t.ctx);
    expect(t.replies().some((r) => r.includes("Caio ↔ Lucas P."))).toBe(true);
    expect(t.lines.some((l) => l.includes("/vincular Ana Maria 43024221"))).toBe(true);
  });
});

describe("admin: /vincular troca de dono", () => {
  it("avisa quando o usuário do ClickUp sai de outro personagem; id longo demais não vale", () => {
    const t = fakeCtx();
    const links = new Map<string, { name: string; since: number }>();
    t.ctx.work = {
      link: (name, uid) => { for (const [k, v] of links) if (v.name === name) links.delete(k); if (uid) links.set(uid, { name, since: 0 }); },
      list: () => [...links],
    };
    const leo = t.ps[0];
    handleAdminCommand(leo, "/vincular Caio pedrao", t.ctx);
    handleAdminCommand(leo, "/vincular Bia pedrao", t.ctx);
    expect(links.get("43024221")?.name).toBe("Bia");
    expect(t.replies().some((r) => r.includes("estava vinculado a Caio"))).toBe(true);
    handleAdminCommand(leo, "/vincular Bia 1234567890123", t.ctx);
    expect(t.replies().at(-1)).toContain("não encontrado");
  });
});
