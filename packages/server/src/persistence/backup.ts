// Backups da base: `VACUUM INTO data/backups/lemonquest-YYYYMMDD-HH.db` a cada hora (e um no boot).
// Rotação: todos das últimas 48 h + o mais recente de cada dia por 14 dias.
// Cópia externa opcional (LEMONQUEST_BACKUP_COPY_DIR: outro disco / pasta de rede): após cada backup, o arquivo novo
// é copiado para lá, com rotação própria (o mais recente de cada dia, por 14 dias). Falhas só são logadas.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, backupTo } from "./db.ts";

export const BACKUP_HOURLY_KEEP_H = 48;
export const BACKUP_DAILY_KEEP_D = 14;
const NAME_RE = /^lemonquest-(\d{4})(\d{2})(\d{2})-(\d{2})\.db$/;
const pad = (n: number) => String(n).padStart(2, "0");

export const backupDir = (): string => process.env.LEMONQUEST_BACKUP_DIR || path.join(DATA_DIR, "backups");
/** Pasta da cópia externa (vazio = desligada). */
export const backupCopyDir = (): string | null => process.env.LEMONQUEST_BACKUP_COPY_DIR?.trim() || null;
export const BACKUP_COPY_KEEP_D = 14;

/** Nome do backup da hora de `d` (hora local). */
export function backupFileName(d: Date): string {
  return `lemonquest-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}.db`;
}

/** Hora (local) codificada no nome, ou null se não for um backup nosso. */
export function parseBackupName(name: string): Date | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lógica pura da rotação: devolve os nomes a apagar.
 * Mantém tudo das últimas `hourlyH` horas; entre isso e `dailyD` dias, só o mais recente de cada dia; o resto sai.
 * Arquivos com nome fora do padrão são ignorados (nunca apagados).
 */
export function selectBackupsToDelete(
  names: string[], now: Date, hourlyH = BACKUP_HOURLY_KEEP_H, dailyD = BACKUP_DAILY_KEEP_D,
): string[] {
  const hourlyCut = now.getTime() - hourlyH * 3600_000;
  const dailyCut = now.getTime() - dailyD * 86400_000;
  const del: string[] = [];
  const newestOfDay = new Map<string, { name: string; t: number }>();
  for (const name of names) {
    const d = parseBackupName(name);
    if (!d) continue;
    const t = d.getTime();
    if (t >= hourlyCut) continue;
    if (t < dailyCut) { del.push(name); continue; }
    const day = NAME_RE.exec(name)!.slice(1, 4).join(""); // YYYYMMDD (independe do tamanho do prefixo)
    const cur = newestOfDay.get(day);
    if (!cur) newestOfDay.set(day, { name, t });
    else if (t > cur.t) { del.push(cur.name); newestOfDay.set(day, { name, t }); }
    else del.push(name);
  }
  return del.sort();
}

/**
 * Copia `file` para `copyDir` e roda a rotação de lá (1 por dia, `keepDays` dias). Nunca lança: devolve true/false.
 * A pasta NÃO é criada: se não existir (disco/compartilhamento desmontado), é falha — nada é gravado no disco local
 * por engano no lugar do ponto de montagem. A cópia vai para um `.partial` e é renomeada no fim (nunca fica meia).
 */
export async function copyBackupOffsite(file: string, copyDir: string | null = backupCopyDir(), now = new Date(), keepDays = BACKUP_COPY_KEEP_D): Promise<boolean> {
  if (!copyDir) return false;
  const name = path.basename(file);
  const dest = path.join(copyDir, name);
  const tmp = `${dest}.partial`;
  try {
    const st = await fs.promises.stat(copyDir).catch(() => null);
    if (!st?.isDirectory()) throw new Error(`pasta indisponível: ${copyDir}`);
    const t0 = performance.now();
    await fs.promises.copyFile(file, tmp);
    await fs.promises.rename(tmp, dest);
    console.log(`[backup] cópia externa: ${dest} (${(performance.now() - t0).toFixed(0)} ms)`);
    backupState.copyOkAt = now.getTime();
  } catch (e) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    console.error(`[backup] cópia externa falhou (${copyDir}):`, (e as Error).message ?? e);
    backupState.copyError = String((e as Error).message ?? e).slice(0, 120);
    backupState.copyErrorAt = now.getTime();
    return false;
  }
  try {
    // hourlyH = -1: nenhum arquivo cai na faixa "horária" (nem o da hora atual) — todos seguem a regra diária
    // (o mais recente de cada dia), por keepDays dias.
    const del = selectBackupsToDelete(await fs.promises.readdir(copyDir), now, -1, keepDays);
    for (const n of del) await fs.promises.rm(path.join(copyDir, n), { force: true });
  } catch (e) {
    console.error("[backup] rotação da cópia externa falhou:", (e as Error).message ?? e);
  }
  return true;
}

/**
 * Último resultado dos backups (o /status mostra): antes a falha era só uma linha no console, que some no rodízio do
 * `docker logs` — backup parado por dias (disco cheio, NAS desmontado) só se descobria na hora de restaurar.
 */
export const backupState: { okAt?: number; error?: string; errorAt?: number; copyOkAt?: number; copyError?: string; copyErrorAt?: number } = {};

/** Linha do /status: o último backup bom e a última falha (se for mais nova que ele). */
export function backupStatusLine(now = Date.now(), copyDir: string | null = backupCopyDir()): string {
  const ago = (t: number) => { const m = Math.max(0, Math.round((now - t) / 60_000)); return m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`; };
  const s = backupState;
  let line = s.okAt ? `Backup: último ${ago(s.okAt)}` : "Backup: nenhum desde que o servidor subiu";
  if (s.errorAt && (!s.okAt || s.errorAt > s.okAt)) line += ` · ⚠ FALHOU ${ago(s.errorAt)}: ${s.error}`;
  else if (s.okAt && now - s.okAt > 2 * 3_600_000) line += " · ⚠ atrasado (era para ser de hora em hora)";
  if (copyDir) {
    if (s.copyErrorAt && (!s.copyOkAt || s.copyErrorAt > s.copyOkAt)) line += ` · ⚠ cópia externa FALHOU ${ago(s.copyErrorAt)}: ${s.copyError}`;
    else line += s.copyOkAt ? ` · cópia externa ${ago(s.copyOkAt)}` : " · cópia externa: nenhuma ainda";
  }
  return line;
}

/** Faz o backup da hora atual e roda a rotação. Nunca lança (loga). Com LEMONQUEST_BACKUP_COPY_DIR, copia em seguida (assíncrono). */
export function runBackup(dir = backupDir(), now = new Date(), copyDir: string | null = backupCopyDir()): string | null {
  const file = path.join(dir, backupFileName(now));
  try {
    const t0 = performance.now();
    backupTo(file);
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`[backup] ${file} (${kb} KB, ${(performance.now() - t0).toFixed(0)} ms)`);
    backupState.okAt = now.getTime();
  } catch (e) {
    console.error("[backup] falhou:", e);
    backupState.error = String((e as Error)?.message ?? e).slice(0, 120);
    backupState.errorAt = now.getTime();
    return null;
  }
  try {
    for (const name of selectBackupsToDelete(fs.readdirSync(dir), now)) fs.rmSync(path.join(dir, name), { force: true });
  } catch (e) {
    console.error("[backup] rotação falhou:", e);
  }
  if (copyDir) void copyBackupOffsite(file, copyDir, now);
  return file;
}

/** Backup no boot + um por hora (checado a cada minuto, robusto a suspensão/ajuste de relógio). */
export function startBackups(dir = backupDir()): () => void {
  let last = backupFileName(new Date());
  runBackup(dir);
  const timer = setInterval(() => {
    const now = new Date();
    const name = backupFileName(now);
    if (name === last) return;
    last = name;
    runBackup(dir, now);
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
