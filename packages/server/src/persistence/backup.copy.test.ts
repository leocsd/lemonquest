import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupFileName, backupState, backupStatusLine, copyBackupOffsite, runBackup } from "./backup.ts";
import { closeDb, initDb } from "./db.ts";

let tmp = "";
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lq-bkcopy-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  closeDb();
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h);
function fakeBackup(dir: string, when: Date, content = "x"): string {
  const f = path.join(dir, backupFileName(when));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}

describe("cópia externa do backup (LEMONQUEST_BACKUP_COPY_DIR)", () => {
  it("sem pasta configurada: não faz nada", async () => {
    const f = fakeBackup(path.join(tmp, "local"), at(2026, 10, 12, 9));
    expect(await copyBackupOffsite(f, null)).toBe(false);
  });

  it("pasta indisponível: loga, devolve false, não lança e NÃO cria a pasta", async () => {
    const f = fakeBackup(path.join(tmp, "local"), at(2026, 10, 12, 9));
    const missing = path.join(tmp, "montagem", "rede");
    expect(await copyBackupOffsite(f, missing)).toBe(false);
    expect(fs.existsSync(missing)).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("cópia externa falhou"), expect.stringContaining("indisponível"));
  });

  it("copia o arquivo (sem sobrar .partial)", async () => {
    const now = at(2026, 10, 12, 9);
    const f = fakeBackup(path.join(tmp, "local"), now, "conteudo-do-banco");
    const dest = path.join(tmp, "copia");
    fs.mkdirSync(dest);
    expect(await copyBackupOffsite(f, dest, now)).toBe(true);
    expect(fs.readFileSync(path.join(dest, backupFileName(now)), "utf8")).toBe("conteudo-do-banco");
    expect(fs.readdirSync(dest)).toEqual([backupFileName(now)]);
  });

  it("rotação própria: o mais recente de cada dia, por 14 dias; arquivos estranhos ficam", async () => {
    const dest = path.join(tmp, "copia");
    const now = at(2026, 10, 20, 15);
    fakeBackup(dest, at(2026, 10, 20, 9));   // mesmo dia, mais antigo → sai
    fakeBackup(dest, at(2026, 10, 19, 8));   // sai (19/10 tem um mais novo)
    fakeBackup(dest, at(2026, 10, 19, 23));  // fica
    fakeBackup(dest, at(2026, 10, 7, 12));   // 13 dias → fica
    fakeBackup(dest, at(2026, 10, 5, 12));   // 15 dias → sai
    fs.writeFileSync(path.join(dest, "LEIA-ME.txt"), "não mexer");
    const f = fakeBackup(path.join(tmp, "local"), now);
    expect(await copyBackupOffsite(f, dest, now)).toBe(true);
    expect(fs.readdirSync(dest).sort()).toEqual([
      "LEIA-ME.txt", backupFileName(at(2026, 10, 7, 12)), backupFileName(at(2026, 10, 19, 23)), backupFileName(now),
    ].sort());
  });

  it("falha na cópia (origem sumiu): false, sem .partial, sem lançar", async () => {
    const dest = path.join(tmp, "copia");
    fs.mkdirSync(dest);
    expect(await copyBackupOffsite(path.join(tmp, "nao-existe.db"), dest)).toBe(false);
    expect(fs.readdirSync(dest)).toEqual([]);
  });

  it("runBackup copia o backup novo para a pasta externa", async () => {
    initDb(path.join(tmp, "lq.db"));
    const local = path.join(tmp, "backups");
    const dest = path.join(tmp, "copia");
    fs.mkdirSync(dest);
    const now = new Date();
    const file = runBackup(local, now, dest);
    expect(file).toBe(path.join(local, backupFileName(now)));
    await vi.waitFor(() => expect(fs.existsSync(path.join(dest, backupFileName(now)))).toBe(true));
    expect(fs.statSync(path.join(dest, backupFileName(now))).size).toBe(fs.statSync(file!).size);
  });

  it("runBackup com a pasta externa indisponível: o backup local sai normalmente", async () => {
    initDb(path.join(tmp, "lq.db"));
    const local = path.join(tmp, "backups");
    const now = new Date();
    expect(runBackup(local, now, path.join(tmp, "sem-disco"))).toBe(path.join(local, backupFileName(now)));
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(expect.stringContaining("cópia externa falhou"), expect.anything()));
    expect(fs.existsSync(path.join(local, backupFileName(now)))).toBe(true);
  });
});

describe("estado dos backups no /status", () => {
  beforeEach(() => { for (const k of Object.keys(backupState)) delete (backupState as Record<string, unknown>)[k]; });

  it("falha do backup e da cópia externa aparecem; o próximo bom limpa o aviso", async () => {
    const t = Date.now();
    expect(backupStatusLine(t, null)).toBe("Backup: nenhum desde que o servidor subiu");
    initDb(path.join(tmp, "lq.db"));
    // Pasta de backup impossível (um arquivo no caminho): o backup lança e fica registrado.
    fs.writeFileSync(path.join(tmp, "arquivo"), "x");
    expect(runBackup(path.join(tmp, "arquivo", "b"), new Date(t), null)).toBeNull();
    expect(backupStatusLine(t + 60_000, null)).toMatch(/FALHOU há 1 min/);
    expect(runBackup(path.join(tmp, "b"), new Date(t + 120_000), null)).not.toBeNull();
    expect(backupStatusLine(t + 180_000, null)).toBe("Backup: último há 1 min");
    expect(backupStatusLine(t + 3 * 3_600_000, null)).toMatch(/atrasado/);
    const f = fakeBackup(path.join(tmp, "local"), new Date(t));
    await copyBackupOffsite(f, path.join(tmp, "sem-disco"), new Date(t + 120_000));
    expect(backupStatusLine(t + 180_000, path.join(tmp, "sem-disco"))).toMatch(/cópia externa FALHOU/);
  });
});
