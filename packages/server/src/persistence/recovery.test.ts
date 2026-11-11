import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AccountSession } from "@lemonquest/shared";
import { closeDb, getCharacterByName, getResetCode, initDb, listDeletedCharacters, saveCharacter } from "./db.ts";
import {
  DELETE_MAX_PER_HOUR, LOGIN_MAX_FAILS, RESET_CODE_TTL_MS, authRouter, claimOnline, createResetCode, handleCreateCharacter,
  handleDeleteCharacter, handleLogin, handlePlay, handleResetPassword, handleResume, normalizeResetCode, releaseOnline, resetAuthState,
  consumeToken, setSessionKicker,
} from "./auth.ts";
import { runAdminCli } from "./admincli.ts";

function ok(r: AccountSession): Extract<AccountSession, { ok: true }> {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.error}`);
  return r;
}

beforeEach(() => {
  initDb(":memory:");
  resetAuthState();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

const newAccount = async (account = "leo", password = "segredo1", ip?: string) => ok(await handleLogin({ account, password, create: true }, { ip }));

describe("recuperação de senha: código", () => {
  it("gera 8 caracteres legíveis; só o hash (scrypt + salt) fica no banco; conta inexistente → null", async () => {
    const a = await newAccount("Leo.Silva");
    const r = (await createResetCode("leo.silva", "teste", 1000))!;
    expect(r.account).toBe("Leo.Silva");
    expect(r.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(r.expiresAt).toBe(1000 + RESET_CODE_TTL_MS);
    const row = getResetCode(1)!;
    expect(row.code_hash).toMatch(/^[0-9a-f]{128}$/);
    expect(row.code_hash).not.toContain(r.code);
    expect(row.code_salt).toMatch(/^[0-9a-f]{32}$/);
    expect(row.created_by).toBe("teste");
    expect(await createResetCode("ninguem", "teste")).toBeNull();
    expect(a.ok).toBe(true);
  });

  it("normaliza o que a pessoa digita (minúsculas, hífen, espaços)", () => {
    expect(normalizeResetCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeResetCode("ab cd ef gh")).toBe("ABCDEFGH");
    expect(normalizeResetCode(undefined)).toBe("");
  });

  it("ciclo: código errado → erro; certo → troca a senha, entra e derruba sessões antigas; uso único", async () => {
    const before = await newAccount();
    const { code } = (await createResetCode("leo", "admin Ana"))!;
    expect(await handleResetPassword({ account: "leo", code: "AAAAAAAA", password: "novasenha" })).toEqual({ ok: false, error: "invalid_code" });
    expect(await handleResetPassword({ account: "leo", code, password: "123" })).toMatchObject({ ok: false, error: "weak_password" });
    const s = ok(await handleResetPassword({ account: "LEO", code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`, password: "novasenha" }));
    expect(s.account).toBe("leo");
    expect(getResetCode(1)).toBeUndefined();
    expect(handleResume({ session: before.session })).toEqual({ ok: false, error: "invalid_session" });
    expect(ok(handleResume({ session: s.session })).account).toBe("leo");
    // Login: senha nova entra, antiga não.
    expect(await handleLogin({ account: "leo", password: "segredo1" })).toEqual({ ok: false, error: "wrong_password" });
    ok(await handleLogin({ account: "leo", password: "novasenha" }));
    // Mesmo código de novo: não vale mais.
    expect(await handleResetPassword({ account: "leo", code, password: "outrasenha" })).toEqual({ ok: false, error: "invalid_code" });
  });

  it("troca de senha derruba o token de entrada pendente e o personagem da conta que está no mundo", async () => {
    const a = await newAccount();
    ok(handleCreateCharacter({ session: a.session, name: "Leo", vocation: "knight" }));
    ok(handleCreateCharacter({ session: a.session, name: "Lia", vocation: "druid" }));
    claimOnline("Leo", "sess-leo");
    const play = handlePlay({ session: a.session, name: "Lia" });
    if (!play.ok) throw new Error("play falhou");
    const kicked: string[] = [];
    setSessionKicker((sid) => kicked.push(sid));
    try {
      const { code } = (await createResetCode("leo", "admin"))!;
      ok(await handleResetPassword({ account: "leo", code, password: "novasenha" }));
      expect(kicked).toEqual(["sess-leo"]);
      expect(() => consumeToken(play.token)).toThrow();
    } finally {
      setSessionKicker(null);
    }
  });

  it("expira em 24 h (e é apagado); código novo substitui o anterior", async () => {
    await newAccount();
    const t0 = 5_000_000;
    const first = (await createResetCode("leo", "x", t0))!;
    const second = (await createResetCode("leo", "x", t0))!;
    if (first.code !== second.code) {
      expect(await handleResetPassword({ account: "leo", code: first.code, password: "novasenha" }, { now: () => t0 })).toMatchObject({ error: "invalid_code" });
    }
    expect(await handleResetPassword({ account: "leo", code: second.code, password: "novasenha" }, { now: () => t0 + RESET_CODE_TTL_MS })).toMatchObject({ error: "invalid_code" });
    expect(getResetCode(1)).toBeUndefined();
    const third = (await createResetCode("leo", "x", t0))!;
    ok(await handleResetPassword({ account: "leo", code: third.code, password: "novasenha" }, { now: () => t0 + RESET_CODE_TTL_MS - 1 }));
  });

  it("conta sem código / inexistente → mesmo erro (não revela nada)", async () => {
    await newAccount();
    expect(await handleResetPassword({ account: "leo", code: "ABCDEFGH", password: "novasenha" })).toEqual({ ok: false, error: "invalid_code" });
    expect(await handleResetPassword({ account: "naoexiste", code: "ABCDEFGH", password: "novasenha" })).toEqual({ ok: false, error: "invalid_code" });
    expect(await handleResetPassword({ account: "l!", code: "ABCDEFGH", password: "novasenha" })).toEqual({ ok: false, error: "invalid_account" });
    expect(await handleResetPassword({ account: "leo" } as any)).toEqual({ ok: false, error: "invalid_request" });
  });

  it("limite: 5 erros por IP (ou por conta) → bloqueio, mesmo com o código certo", async () => {
    await newAccount("leo");
    await newAccount("ana", "segredo1", "9.9.9.9");
    const { code } = (await createResetCode("leo", "x"))!;
    const ip = "1.2.3.4";
    for (let i = 0; i < LOGIN_MAX_FAILS; i++) {
      expect(await handleResetPassword({ account: i % 2 ? "leo" : "ana", code: "ZZZZZZZZ", password: "novasenha" }, { ip })).toMatchObject({ error: "invalid_code" });
    }
    const r = await handleResetPassword({ account: "leo", code, password: "novasenha" }, { ip });
    expect(r).toMatchObject({ ok: false, error: "too_many_attempts" });
    expect((r as any).message).toMatch(/Muitas tentativas/);
    // Outro IP ainda pode (a conta leo só teve 2 erros).
    ok(await handleResetPassword({ account: "leo", code, password: "novasenha" }, { ip: "5.6.7.8" }));
  });
});

describe("POST /api/reset-password (HTTP)", () => {
  it("troca a senha pela API; depois o login normal funciona", async () => {
    await newAccount("conta.http");
    const { code } = (await createResetCode("conta.http", "x"))!;
    const app = express();
    app.use(express.json());
    app.use("/api", authRouter);
    const server = http.createServer(app);
    await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
    const port = (server.address() as any).port as number;
    const post = (p: string, body: unknown) => fetch(`http://127.0.0.1:${port}/api/${p}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    try {
      const bad = await post("reset-password", { account: "conta.http", code: "XXXXXXXX", password: "nova123" });
      expect(bad).toEqual({ status: 200, body: { ok: false, error: "invalid_code" } });
      const good = await post("reset-password", { account: "conta.http", code, password: "nova123" });
      expect(good.status).toBe(200);
      expect(good.body).toMatchObject({ ok: true, account: "conta.http", characters: [] });
      const login = await post("login", { account: "conta.http", password: "nova123" });
      expect(login.body).toMatchObject({ ok: true, account: "conta.http" });
    } finally {
      await new Promise((res) => server.close(res));
    }
  });
});

describe("excluir personagem", () => {
  async function setup() {
    const a = await newAccount("leo");
    for (const name of ["Leo", "Bia"]) ok(handleCreateCharacter({ session: a.session, name, vocation: "knight" }));
    const b = await newAccount("outra", "segredo2", "8.8.8.8");
    ok(handleCreateCharacter({ session: b.session, name: "Caio", vocation: "druid" }));
    return { a: a.session, b: b.session };
  }

  it("exclui com a senha: arquiva a linha inteira, some da lista e o nome fica livre", async () => {
    const { a, b } = await setup();
    const rec = getCharacterByName("Bia")!;
    rec.level = 17; rec.data.gold = 1234;
    saveCharacter(rec);
    const r = ok(await handleDeleteCharacter({ session: a, name: "bia", password: "segredo1" }));
    expect(r.characters.map((c) => c.name)).toEqual(["Leo"]);
    expect(getCharacterByName("Bia")).toBeUndefined();
    const [arch] = listDeletedCharacters();
    expect(arch).toMatchObject({ name: "Bia", account_name: "leo", level: 17, vocation: "knight", char_id: rec.id });
    expect(JSON.parse(arch!.data).gold).toBe(1234);
    expect(arch!.deleted_at).toBeGreaterThan(0);
    // Nome livre: outra conta cria "Bia".
    expect(ok(handleCreateCharacter({ session: b, name: "Bia", vocation: "paladin" })).characters.map((c) => c.name)).toEqual(["Caio", "Bia"]);
  });

  it("senha errada, sessão inválida, personagem de outra conta → recusa sem apagar", async () => {
    const { a } = await setup();
    expect(await handleDeleteCharacter({ session: a, name: "Bia", password: "errada" })).toEqual({ ok: false, error: "wrong_password" });
    expect(await handleDeleteCharacter({ session: "lixo", name: "Bia", password: "segredo1" })).toEqual({ ok: false, error: "invalid_session" });
    expect(await handleDeleteCharacter({ session: a, name: "Caio", password: "segredo1" })).toEqual({ ok: false, error: "no_character" });
    expect(await handleDeleteCharacter({ session: a, name: "Bia" } as any)).toEqual({ ok: false, error: "invalid_request" });
    expect(getCharacterByName("Bia")).toBeDefined();
    expect(getCharacterByName("Caio")).toBeDefined();
    expect(listDeletedCharacters()).toEqual([]);
  });

  it("recusa com o personagem online ou em treino offline", async () => {
    const { a } = await setup();
    claimOnline("Bia", "sess1");
    expect(await handleDeleteCharacter({ session: a, name: "Bia", password: "segredo1" })).toMatchObject({ ok: false, error: "character_online" });
    releaseOnline("Bia", "sess1");
    const rec = getCharacterByName("Bia")!;
    rec.data.offlineTraining = { skill: "melee", sinceMs: 1 };
    saveCharacter(rec);
    expect(await handleDeleteCharacter({ session: a, name: "Bia", password: "segredo1" })).toMatchObject({ ok: false, error: "character_training" });
    expect(getCharacterByName("Bia")).toBeDefined();
  });

  it("entrou no jogo durante a checagem da senha → recusa", async () => {
    const { a } = await setup();
    const p = handleDeleteCharacter({ session: a, name: "Bia", password: "segredo1" });
    claimOnline("Bia", "sess2"); // roda antes do scrypt terminar
    expect(await p).toMatchObject({ ok: false, error: "character_online" });
    expect(getCharacterByName("Bia")).toBeDefined();
  });

  it("token de /play pendente do excluído deixa de valer", async () => {
    const { a } = await setup();
    const play = handlePlay({ session: a, name: "Bia" });
    expect(play.ok).toBe(true);
    ok(await handleDeleteCharacter({ session: a, name: "Bia", password: "segredo1" }));
    const { consumeToken } = await import("./auth.ts");
    expect(() => consumeToken((play as any).token)).toThrow();
  });

  it("limite por conta: DELETE_MAX_PER_HOUR tentativas por hora", async () => {
    const { a } = await setup();
    let t = 1_000_000;
    const now = () => t;
    for (let i = 0; i < DELETE_MAX_PER_HOUR; i++) {
      // nomes inexistentes (não gastam o limitador de senha)
      expect(await handleDeleteCharacter({ session: a, name: `Xx${i}`, password: "segredo1" }, { now })).toMatchObject({ error: "no_character" });
      t += 1000;
    }
    expect(await handleDeleteCharacter({ session: a, name: "Bia", password: "segredo1" }, { now })).toMatchObject({ error: "too_many_attempts" });
  });
});

describe("CLI: npm run admin -- reset-password <conta>", () => {
  it("gera o código na base de LEMONQUEST_DB; o código funciona no /api/reset-password", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-cli-"));
    const file = path.join(dir, "lq.db");
    try {
      initDb(file);
      await newAccount("Time Azul");
      closeDb();

      const out: string[] = [], err: string[] = [];
      const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
      expect(await runAdminCli(["reset-password", "time", "azul"], io, file)).toBe(0);
      const m = /Código de recuperação: ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(out.join("\n"));
      expect(m).not.toBeNull();
      expect(out[0]).toBe("Conta: Time Azul");

      expect(await runAdminCli(["reset-password", "naoexiste"], io, file)).toBe(2);
      expect(err.at(-1)).toBe("Conta não encontrada: naoexiste");
      expect(await runAdminCli(["reset-password"], io, file)).toBe(1);
      expect(await runAdminCli(["xyz"], io, file)).toBe(1);
      expect(await runAdminCli([], io, file)).toBe(1);
      expect(await runAdminCli(["deleted"], io, file)).toBe(0);
      expect(out.at(-1)).toBe("Nenhum personagem excluído.");
      // telemetria: só leitura; sem dados ainda, diz que não há amostra (relatório completo em admincli.test.ts).
      expect(await runAdminCli(["telemetria"], io, file)).toBe(0);
      expect(out.join("\n")).toMatch(/Ainda sem 10 min jogados/);
      expect(out.at(-1)).toBe("  Nenhuma morte registrada.");

      initDb(file);
      ok(await handleResetPassword({ account: "time azul", code: m![1]!, password: "senhanova" }));
      ok(await handleLogin({ account: "Time Azul", password: "senhanova" }));
    } finally {
      closeDb();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
