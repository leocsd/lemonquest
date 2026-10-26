import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Vocation } from "@lemonquest/shared";
import { closeDb, createAccount, createCharacter, initDb, saveCharacter } from "./db.ts";
import { runAdminCli } from "./admincli.ts";
import type { CharacterData } from "./types.ts";

const H = 3_600_000;

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
