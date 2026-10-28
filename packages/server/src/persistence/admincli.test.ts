import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Vocation } from "@lemonquest/shared";
import { closeDb, createAccount, createCharacter, getCharacterByName, initDb, saveCharacter } from "./db.ts";
import { runAdminCli } from "./admincli.ts";
import { handleLogin, handleResetPassword, resetAuthState } from "./auth.ts";
import type { CharacterData } from "./types.ts";

const H = 3_600_000;

describe("CLI: npm run admin -- create-account", () => {
  it("cria a conta sem senha e imprime um código de recuperação que define a senha; recusa nome inválido ou repetido", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-cli-acc-"));
    const file = path.join(dir, "lq.db");
    try {
      const out: string[] = [], err: string[] = [];
      const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
      expect(await runAdminCli(["create-account", "gabi"], io, file)).toBe(0);
      expect(err).toEqual([]);
      expect(out[0]).toBe("Conta criada: gabi (sem senha ainda).");
      const code = /Código de recuperação: ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(out[1]!)?.[1];
      expect(code).toBeTruthy();
      // Nenhuma senha entra; o código define uma e aí a conta abre.
      initDb(file);
      resetAuthState();
      expect(await handleLogin({ account: "gabi", password: "qualquer1" })).toMatchObject({ ok: false, error: "wrong_password" });
      expect(await handleResetPassword({ account: "gabi", code: code!, password: "senhaNova1" })).toMatchObject({ ok: true });
      expect(await handleLogin({ account: "gabi", password: "senhaNova1" })).toMatchObject({ ok: true });
      closeDb();
      expect(await runAdminCli(["create-account", "gabi"], io, file)).toBe(3);
      expect(await runAdminCli(["create-account", "x"], io, file)).toBe(1);
    } finally {
      closeDb();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("CLI: npm run admin -- create-character", () => {
  it("cria o personagem na conta (vocação oculta inclusive) com kit inicial, sexo e roupa padrão; recusa conta, nome e vocação inválidos", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-cli-create-"));
    const file = path.join(dir, "lq.db");
    try {
      initDb(file);
      const acc = createAccount("gabi", "x", "y");
      closeDb();
      const run = async (args: string[]) => {
        const out: string[] = [], err: string[] = [];
        const code = await runAdminCli(["create-character", ...args], { out: (l) => out.push(l), err: (l) => err.push(l) }, file);
        return { code, out, err };
      };
      const ok = await run(["gabi", "Fada Gabi", "fairy", "f"]);
      expect(ok.err).toEqual([]);
      expect(ok.code).toBe(0);
      expect(ok.out[0]).toBe("Personagem criado: Fada Gabi (fairy, f) na conta gabi.");
      initDb(file);
      const rec = getCharacterByName("Fada Gabi")!;
      expect(rec).toMatchObject({ accountId: acc.id, vocation: "fairy", level: 1 });
      expect(rec.data).toMatchObject({ sex: "f", outfit: "fada", addons: 3 }); // já nasce com asas e varinha
      const kit = rec.data as { equipment?: { weapon?: { defId: string } }; backpack?: ({ defId: string; count: number } | null)[] };
      expect(kit.equipment?.weapon?.defId).toBe("twig_rod"); // a Fada usa a arma do druida
      expect(kit.backpack?.map((i) => i && [i.defId, i.count])).toEqual([["health_potion", 3], ["meat", 5]]);
      closeDb();
      // Erros: conta inexistente (2), nome inválido/ocupado, vocação e sexo inválidos (1/3), argumentos faltando.
      expect((await run(["ninguem", "Outra", "druid"])).code).toBe(2);
      expect((await run(["gabi", "Fada Gabi", "druid"])).code).toBe(3);
      expect((await run(["gabi", "x", "druid"])).code).toBe(1);
      expect((await run(["gabi", "Zeca", "pirata"])).code).toBe(1);
      expect((await run(["gabi", "Zeca", "knight", "x"])).code).toBe(1);
      expect((await run(["gabi", "Zeca"])).code).toBe(1);
      // A vocação é aceita em qualquer caixa; o sexo ausente vale "m".
      const k = await run(["gabi", "Zeca", "Knight"]);
      expect(k.code).toBe(0);
      initDb(file);
      expect(getCharacterByName("Zeca")!.data).toMatchObject({ sex: "m", outfit: "cavaleiro", addons: 0 });
      expect(getCharacterByName("Zeca")!.vocation).toBe("knight");
    } finally {
      closeDb();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("CLI: npm run admin -- telemetria", () => {
  it("lê os personagens salvos (só leitura): progressão, vocação, skills reais e causas de morte", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-cli-tel-"));
    const file = path.join(dir, "lq.db");
    try {
      initDb(file);
      const acc = createAccount("Conta Teste", "x", "y");
      const add = (name: string, vocation: Vocation, level: number, data: Partial<CharacterData>) => {
        const c = createCharacter(acc.id, name, vocation, data);
        saveCharacter({ ...c, level });
      };
      add("Kai", "knight", 65, {
        skills: { melee: { level: 60, tries: 0 }, shield: { level: 55, tries: 0 }, magic: { level: 4, tries: 0 } },
        play: { ms: H, byLevel: { "65": { ms: H, deaths: 3, goldIn: 0, goldOut: 0, kills: 100, xp: 50_000, deathsBy: { goblin_king: 2 } } } },
      });
      add("Lia", "knight", 70, {
        skills: { melee: { level: 70, tries: 0 }, shield: { level: 61, tries: 0 }, magic: { level: 6, tries: 0 } },
        play: { ms: 0, byLevel: { "70": { ms: 0, deaths: 1, goldIn: 0, goldOut: 0, deathsBy: { "burn@goblin_king": 1 } } } },
      });
      add("Mel", "sorcerer", 100, { skills: { magic: { level: 48, tries: 0 }, shield: { level: 20, tries: 0 } } });
      closeDb();

      const out: string[] = [], err: string[] = [];
      expect(await runAdminCli(["telemetria"], { out: (l) => out.push(l), err: (l) => err.push(l) }, file)).toBe(0);
      expect(err).toEqual([]);
      const text = out.join("\n");
      expect(text).toContain("knight   60–79     1.0 h (1 pers.)"); // relatório por vocação (já existia; Lia sem tempo fica de fora)
      const skills = out.indexOf(out.find((l) => l.startsWith("Skills treinadas"))!);
      const deaths = out.indexOf(out.find((l) => l.startsWith("Causas de morte"))!);
      expect(out.slice(skills + 1, deaths)).toEqual([
        "  knight   60–79     2 pers. · ML 5.0 [4–6] · arma 65.0 [60–70] · escudo 58.0 [55–61]",
        "  sorcerer 100+      1 pers. · ML 48.0 [48–48] · escudo 20.0 [20–20]",
      ]);
      expect(out.slice(deaths + 1)).toEqual([
        "  60–79      4 mortes · Rei Goblin 2 · queimadura (Rei Goblin) 1 · sem causa 1",
      ]);
    } finally {
      closeDb();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
