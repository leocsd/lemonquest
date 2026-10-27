import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CHARACTERS_PER_ACCOUNT, type AccountSession } from "@lemonquest/shared";
import crypto from "node:crypto";
import { getCharacterByName, getSessionRow, initDb, saveCharacter } from "./db.ts";
import {
  CHAR_CREATE_MAX_PER_HOUR, CREATE_MAX_PER_HOUR, LOGIN_LOCK_MS, LOGIN_MAX_FAILS, SESSION_IDLE_MS, claimOnline, consumeToken,
  handleCreateCharacter, handleLogin, handleLogout, handlePlay, handleResume, normalizeAccount, normalizeName, onlineOwner,
  releaseOnline, resetAuthState,
} from "./auth.ts";

function okSession(r: AccountSession): Extract<AccountSession, { ok: true }> {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.error}`);
  return r;
}

const create = async (account: string, password = "segredo1", ip?: string, now?: () => number) =>
  handleLogin({ account, password, create: true }, { ip, now });

describe("auth: contas", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetAuthState();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("valida nomes de personagem (NFC, alfabeto latino e dígitos, espaços simples)", () => {
    for (const name of ["ab", "a".repeat(21), "123", "12 34", "Leo!", "", "  ", "Лео", "Λεων", "Leo_X", "Le​o"]) {
      expect(normalizeName(name), name).toBeNull();
    }
    expect(normalizeName("  José  da Silva ")).toBe("José da Silva");
    expect(normalizeName("José")).toBe("José"); // NFD → NFC
    expect(normalizeName("Leo123")).toBe("Leo123");
    expect(normalizeName("V1R4 L4T4")).toBe("V1R4 L4T4");
  });

  it("nomes NOVOS: recusa sósias (fullwidth, small caps, ligaduras) e aceita acentos comuns", async () => {
    const a = okSession(await create("contaSosia"));
    for (const name of ["Ｌｅｏ", "ʟeonardo", "Leonardᴏ", "Raﬁq"]) {
      expect(normalizeName(name), name).not.toBeNull(); // nomes antigos assim continuam válidos para busca
      expect(handleCreateCharacter({ session: a.session, name, vocation: "knight" }), name).toEqual({ ok: false, error: "invalid_name" });
    }
    expect(okSession(handleCreateCharacter({ session: a.session, name: "Ção Ñúñez", vocation: "knight" })).characters).toHaveLength(1);
  });

  it("nome de admin livre: só contas de LEMONQUEST_ADMIN_ACCOUNTS criam (também variantes com acento)", async () => {
    vi.stubEnv("LEMONQUEST_ADMINS", "Leonardo, Ana Maria");
    vi.stubEnv("LEMONQUEST_ADMIN_ACCOUNTS", "Dono");
    try {
      const intruso = okSession(await create("intruso"));
      for (const name of ["leonardo", "Leonardó", "ANA MARIA"]) {
        expect(handleCreateCharacter({ session: intruso.session, name, vocation: "knight" }), name).toEqual({ ok: false, error: "name_taken" });
      }
      expect(getCharacterByName("Leonardo")).toBeUndefined();
      const dono = okSession(await create("dono"));
      expect(okSession(handleCreateCharacter({ session: dono.session, name: "Leonardo", vocation: "knight" })).characters).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("personagem novo ganha o kit inicial: arma da vocação equipada, 3 poções de vida e 5 carnes", async () => {
    const a = okSession(await create("contaKit"));
    const weapons = { knight: "short_sword", paladin: "short_bow", sorcerer: "apprentice_wand", druid: "twig_rod" } as const;
    for (const [voc, name] of [["knight", "Kit Um"], ["paladin", "Kit Dois"], ["sorcerer", "Kit Tres"], ["druid", "Kit Quatro"]] as const) {
      okSession(handleCreateCharacter({ session: a.session, name, vocation: voc }));
      const d = getCharacterByName(name)!.data as { equipment?: { weapon?: { defId: string } }; backpack?: ({ defId: string; count: number } | null)[]; outfit?: string };
      expect(d.equipment?.weapon?.defId, voc).toBe(weapons[voc]);
      expect(d.backpack?.map((it) => it && `${it.defId}×${it.count}`)).toEqual(["health_potion×3", "meat×5"]);
      expect(d.outfit).toBeTruthy();
    }
  });

  it("valida nomes de conta (3–20, letras latinas/dígitos/._-)", () => {
    for (const n of ["ab", "a".repeat(21), "leo!", "Лео", "le@o", "", "a​bc"]) expect(normalizeAccount(n), n).toBeNull();
    expect(normalizeAccount(" leo.silva_99 ")).toBe("leo.silva_99");
    expect(normalizeAccount("Time  Azul-2")).toBe("Time Azul-2");
    expect(normalizeAccount("José")).toBe("José");
  });

  it("criar conta, duplicada, inexistente, senha fraca, senha errada, login", async () => {
    expect(await handleLogin({ account: "leo", password: "segredo1" })).toEqual({ ok: false, error: "no_account" });
    expect(await create("leo", "abc")).toMatchObject({ ok: false, error: "weak_password" });
    expect(await handleLogin({ account: "le!", password: "segredo1", create: true })).toEqual({ ok: false, error: "invalid_account" });
    const a = okSession(await create("Leo.1"));
    expect(a).toMatchObject({ account: "Leo.1", characters: [] });
    expect(a.session).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(await create("leo.1")).toEqual({ ok: false, error: "account_taken" });
    expect(await handleLogin({ account: "leo.1", password: "errada" })).toEqual({ ok: false, error: "wrong_password" });
    const b = okSession(await handleLogin({ account: "LEO.1", password: "segredo1" }));
    expect(b.account).toBe("Leo.1");
    expect(b.session).not.toBe(a.session);
  });

  it("personagens: cria até o máximo; nome único entre TODAS as contas; vocação/nome validados", async () => {
    const a = okSession(await create("contaA"));
    const b = okSession(await create("contaB"));
    const names = ["Leo", "Ana", "Bia", "Caio", "Davi", "Eva"];
    for (let i = 0; i < MAX_CHARACTERS_PER_ACCOUNT; i++) {
      const r = okSession(handleCreateCharacter({ session: a.session, name: names[i]!, vocation: "knight" }));
      expect(r.characters).toHaveLength(i + 1);
      expect(r.session).toBe(a.session);
    }
    expect(handleCreateCharacter({ session: a.session, name: names[MAX_CHARACTERS_PER_ACCOUNT]!, vocation: "druid" }))
      .toEqual({ ok: false, error: "too_many_characters" });
    expect(handleCreateCharacter({ session: b.session, name: "LEO", vocation: "druid" })).toEqual({ ok: false, error: "name_taken" });
    expect(handleCreateCharacter({ session: b.session, name: "Leo!", vocation: "druid" })).toEqual({ ok: false, error: "invalid_name" });
    expect(handleCreateCharacter({ session: b.session, name: "Zeca", vocation: "pirata" as any })).toEqual({ ok: false, error: "invalid_request" });
    expect(handleCreateCharacter({ session: b.session, name: "Zeca", vocation: "druid", sex: "x" as any })).toEqual({ ok: false, error: "invalid_request" });
    expect(handleCreateCharacter({ session: "lixo", name: "Zeca", vocation: "druid" })).toEqual({ ok: false, error: "invalid_session" });
    const list = okSession(await handleLogin({ account: "contaA", password: "segredo1" }));
    expect(list.characters.map((c) => c.name)).toEqual(names.slice(0, MAX_CHARACTERS_PER_ACCOUNT));
    expect(list.characters[0]).toEqual({ name: "Leo", vocation: "knight", level: 1, outfit: "cavaleiro", addons: 0, sex: "m" });
  });

  it("tentativas de criar personagem limitadas por conta/hora", async () => {
    let t = 1_000_000;
    const now = () => t;
    const a = okSession(await create("spam", "segredo1", "1.1.1.1", now));
    const b = okSession(await create("outra", "segredo1", "1.1.1.1", now));
    handleCreateCharacter({ session: b.session, name: "Ocupado", vocation: "druid" }, { now });
    for (let i = 0; i < CHAR_CREATE_MAX_PER_HOUR; i++) {
      expect(handleCreateCharacter({ session: a.session, name: "Ocupado", vocation: "druid" }, { now })).toMatchObject({ error: "name_taken" });
    }
    expect(handleCreateCharacter({ session: a.session, name: "Livre", vocation: "druid" }, { now })).toMatchObject({ error: "too_many_attempts" });
    t += 3600_001; // passou 1 h: a cota zera (a sessão continua válida; entrar de novo abre outra)
    const a2 = okSession(await handleLogin({ account: "spam", password: "segredo1" }, { ip: "1.1.1.1", now }));
    expect(handleCreateCharacter({ session: a2.session, name: "Livre", vocation: "druid" }, { now })).toMatchObject({ ok: true });
  });

  it("play: token de uso único só para personagem da própria conta; carrega aviso de senha fraca", async () => {
    const a = okSession(await create("contaA"));
    const b = okSession(await create("contaB"));
    handleCreateCharacter({ session: a.session, name: "Leo", vocation: "sorcerer" });
    handleCreateCharacter({ session: b.session, name: "Bia", vocation: "paladin" });
    expect(handlePlay({ session: a.session, name: "Bia" })).toEqual({ ok: false, error: "no_character" });
    expect(handlePlay({ session: "x", name: "Leo" })).toEqual({ ok: false, error: "invalid_session" });
    const p = handlePlay({ session: a.session, name: "leo" });
    expect(p).toMatchObject({ ok: true, name: "Leo", vocation: "sorcerer" });
    if (!p.ok) return;
    expect(consumeToken(p.token)).toEqual({ name: "Leo", key: "leo", weakPassword: false });
    expect(() => consumeToken(p.token)).toThrow();
    expect(() => consumeToken("lixo")).toThrow();
    const p2 = handlePlay({ session: a.session, name: "Leo" });
    if (!p2.ok) throw new Error();
    expect(() => consumeToken(p2.token, Date.now() + 61_000)).toThrow();
  });

  it("sessão: expira após SESSION_IDLE_MS (30 dias) sem uso (uso renova); logout invalida", async () => {
    expect(SESSION_IDLE_MS).toBe(30 * 24 * 3600_000);
    let t = 10_000_000;
    const now = () => t;
    const a = okSession(await create("conta", "segredo1", "1.1.1.1", now));
    t += SESSION_IDLE_MS - 1000;
    expect(handleResume({ session: a.session }, { now })).toMatchObject({ ok: true, account: "conta" }); // renova
    t += SESSION_IDLE_MS - 1000;
    expect(handleCreateCharacter({ session: a.session, name: "Leo", vocation: "knight" }, { now })).toMatchObject({ ok: true });
    t += SESSION_IDLE_MS + 1;
    expect(handlePlay({ session: a.session, name: "Leo" }, { now })).toEqual({ ok: false, error: "invalid_session" });
    const b = okSession(await handleLogin({ account: "conta", password: "segredo1" }, { now }));
    expect(handleLogout({ session: b.session })).toEqual({ ok: true });
    expect(handleResume({ session: b.session }, { now })).toEqual({ ok: false, error: "invalid_session" });
  });

  it("sessão sobrevive a reinício do servidor (só o hash do token vai para o banco), expira e logout valem depois", async () => {
    let t = 10_000_000;
    const now = () => t;
    const a = okSession(await create("conta", "segredo1", "1.1.1.1", now));
    const b = okSession(await handleLogin({ account: "conta", password: "segredo1" }, { now }));
    // O banco guarda o hash do token, nunca o token em claro.
    const sha = (x: string) => crypto.createHash("sha256").update(x).digest("hex");
    for (const x of [a.session, b.session]) {
      expect(getSessionRow(sha(x))).toBeDefined();
      expect(getSessionRow(x)).toBeUndefined();
    }
    // "Reinício": a memória some, o banco fica.
    resetAuthState();
    expect(handleResume({ session: a.session }, { now })).toMatchObject({ ok: true, account: "conta" });
    // Logout depois do reinício também vale.
    expect(handleLogout({ session: b.session })).toEqual({ ok: true });
    resetAuthState();
    expect(handleResume({ session: b.session }, { now })).toEqual({ ok: false, error: "invalid_session" });
    // A expiração por inatividade continua valendo, mesmo recarregada do banco.
    t += SESSION_IDLE_MS + 1;
    resetAuthState();
    expect(handleResume({ session: a.session }, { now })).toEqual({ ok: false, error: "invalid_session" });
    // Token desconhecido segue recusado.
    expect(handleResume({ session: "x".repeat(43) }, { now })).toEqual({ ok: false, error: "invalid_session" });
  });

  it("sessão: a renovação por uso persiste (reinício depois de uso recente não derruba)", async () => {
    let t = 10_000_000;
    const now = () => t;
    const a = okSession(await create("conta", "segredo1", "1.1.1.1", now));
    t += SESSION_IDLE_MS - 1000;
    expect(handleResume({ session: a.session }, { now })).toMatchObject({ ok: true }); // renova e grava
    t += SESSION_IDLE_MS - 1000;
    resetAuthState(); // reinício: sem a renovação gravada, a sessão já teria vencido
    expect(handleResume({ session: a.session }, { now })).toMatchObject({ ok: true });
  });

  it("sessão: mais de 8 por conta derruba a mais antiga, também no banco", async () => {
    let t = 10_000_000;
    const now = () => t++;
    const first = okSession(await create("conta", "segredo1", "1.1.1.1", now));
    for (let i = 0; i < 8; i++) okSession(await handleLogin({ account: "conta", password: "segredo1" }, { now }));
    resetAuthState();
    expect(handleResume({ session: first.session }, { now })).toEqual({ ok: false, error: "invalid_session" });
  });

  it("resumo traz treino offline e online", async () => {
    const a = okSession(await create("conta"));
    handleCreateCharacter({ session: a.session, name: "Leo", vocation: "druid" });
    const rec = getCharacterByName("Leo")!;
    saveCharacter({ ...rec, level: 8, data: { offlineTraining: { skill: "magic", sinceMs: 1234, statueId: "s1" } } });
    claimOnline("Leo", "sid");
    expect(okSession(handleResume({ session: a.session })).characters).toEqual([
      { name: "Leo", vocation: "druid", level: 8, outfit: "druida", addons: 0, sex: "m", training: { skill: "magic", sinceMs: 1234 }, online: true },
    ]);
  });

  it("brute force: 5 falhas → bloqueio (por conta e por IP) que expira", async () => {
    let t = 1_000_000;
    const now = () => t;
    await create("Leo", "segredo1", "1.1.1.1", now);
    for (let i = 0; i < LOGIN_MAX_FAILS; i++) {
      expect(await handleLogin({ account: "Leo", password: "errada" + i }, { ip: "6.6.6.6", now })).toMatchObject({ error: "wrong_password" });
    }
    // Bloqueado mesmo com a senha certa, de outro IP (por conta) e para outra conta a partir do IP atacante.
    expect(await handleLogin({ account: "Leo", password: "segredo1" }, { ip: "6.6.6.6", now })).toMatchObject({ error: "too_many_attempts" });
    expect(await handleLogin({ account: "Leo", password: "segredo1" }, { ip: "2.2.2.2", now })).toMatchObject({ error: "too_many_attempts" });
    expect(await create("Outro", "x".repeat(8), "6.6.6.6", now)).toMatchObject({ error: "too_many_attempts", retryAfterSec: LOGIN_LOCK_MS / 1000 });
    t += LOGIN_LOCK_MS + 1;
    expect(await handleLogin({ account: "Leo", password: "segredo1" }, { ip: "6.6.6.6", now })).toMatchObject({ ok: true });
  });

  it("varredura de contas inexistentes também bloqueia o IP", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILS; i++) {
      expect(await handleLogin({ account: `nada${i}`, password: "segredo1" }, { ip: "7.7.7.7" })).toMatchObject({ error: "no_account" });
    }
    expect(await handleLogin({ account: "nada9", password: "segredo1" }, { ip: "7.7.7.7" })).toMatchObject({ error: "too_many_attempts" });
  });

  it("rajada paralela não passa do limite", async () => {
    await create("Leo");
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => handleLogin({ account: "Leo", password: "x" + i }, { ip: "9.9.9.9" })));
    expect(rs.filter((r) => !r.ok && r.error === "wrong_password").length).toBeLessThanOrEqual(LOGIN_MAX_FAILS);
  });

  it("criação de contas: 3 por IP por hora", async () => {
    let t = 5_000_000;
    const now = () => t;
    const names = ["Aaa", "Bbb", "Ccc", "Ddd"];
    for (let i = 0; i < CREATE_MAX_PER_HOUR; i++) {
      expect(await create(names[i]!, "segredo1", "3.3.3.3", now)).toMatchObject({ ok: true });
    }
    expect(await create("Ddd", "segredo1", "3.3.3.3", now)).toMatchObject({ error: "too_many_attempts" });
    expect(await create("Ddd", "segredo1", "4.4.4.4", now)).toMatchObject({ ok: true });
    t += 3600_001;
    expect(await create("Eee", "segredo1", "3.3.3.3", now)).toMatchObject({ ok: true });
  });

  it("online: só o dono atual libera o nome", () => {
    expect(claimOnline("Leo", "s1")).toBeUndefined();
    expect(claimOnline("LEO", "s2")).toBe("s1");
    expect(releaseOnline("leo", "s1")).toBe(false);
    expect(onlineOwner("Leo")).toBe("s2");
    expect(releaseOnline("Leo", "s2")).toBe(true);
    expect(onlineOwner("Leo")).toBeUndefined();
  });
});
