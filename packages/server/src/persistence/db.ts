import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ROOT_DIR } from "../paths.ts";
import { defaultOutfit, type Vocation } from "@lemonquest/shared";
import type { CharacterData, CharacterRecord } from "./types.ts";

/** Pasta padrão de dados (base + backups). */
export const DATA_DIR = path.join(ROOT_DIR, "data");

/** Chave de unicidade/lookup do nome: NFC + minúsculas (case-insensitive inclusive para acentos: "ÁNA" = "ána"). */
export const nameKey = (name: string): string => name.normalize("NFC").toLowerCase();

/** Preenche `name_key` em uma tabela; colisões (dados antigos) ganham sufixo `#id` e são logadas. */
function backfillNameKey(d: DatabaseSync, table: "accounts" | "characters") {
  const rows = d.prepare(`SELECT id, name FROM ${table} ORDER BY id`).all() as { id: number; name: string }[];
  const seen = new Map<string, number>();
  const upd = d.prepare(`UPDATE ${table} SET name_key = ? WHERE id = ?`);
  for (const r of rows) {
    let k = nameKey(r.name);
    const prev = seen.get(k);
    if (prev !== undefined) {
      console.warn(`[db] ${table}: "${r.name}" (id ${r.id}) colide com id ${prev} na chave "${k}" — mantido, mas inacessível por login até ser renomeado`);
      k = `${k}#${r.id}`;
    }
    seen.set(k, r.id);
    upd.run(k, r.id);
  }
}

type Migration = string | ((d: DatabaseSync) => void);

/** Migrações incrementais: índice i leva a base da versão i para i+1 (PRAGMA user_version). */
const MIGRATIONS: Migration[] = [
  `CREATE TABLE accounts (
     id INTEGER PRIMARY KEY,
     name TEXT UNIQUE COLLATE NOCASE NOT NULL,
     pass_hash TEXT NOT NULL,
     salt TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE characters (
     id INTEGER PRIMARY KEY,
     account_id INTEGER UNIQUE NOT NULL REFERENCES accounts(id),
     name TEXT UNIQUE COLLATE NOCASE NOT NULL,
     vocation TEXT NOT NULL,
     level INTEGER NOT NULL DEFAULT 1,
     xp INTEGER NOT NULL DEFAULT 0,
     x INTEGER,
     y INTEGER,
     dir INTEGER NOT NULL DEFAULT 4,
     data TEXT NOT NULL DEFAULT '{}',
     updated_at INTEGER NOT NULL
   );`,
  // v2: name_key (NFC + minúsculas) único — unicidade case-insensitive que funciona com acentos.
  (d) => {
    d.exec("ALTER TABLE accounts ADD COLUMN name_key TEXT");
    d.exec("ALTER TABLE characters ADD COLUMN name_key TEXT");
    backfillNameKey(d, "accounts");
    backfillNameKey(d, "characters");
    d.exec("CREATE UNIQUE INDEX accounts_name_key ON accounts(name_key)");
    d.exec("CREATE UNIQUE INDEX characters_name_key ON characters(name_key)");
  },
  // v3: contas com VÁRIOS personagens — characters.account_id deixa de ser UNIQUE. O SQLite não remove uma
  // restrição UNIQUE de coluna: recria a tabela (mesmos ids, dados e name_key) dentro da transação da migração.
  // Contas existentes continuam iguais: o nome da conta = nome do seu (único) personagem.
  (d) => {
    d.exec(`CREATE TABLE characters_v3 (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      name TEXT UNIQUE COLLATE NOCASE NOT NULL,
      name_key TEXT NOT NULL,
      vocation TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      x INTEGER,
      y INTEGER,
      dir INTEGER NOT NULL DEFAULT 4,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    )`);
    d.exec(`INSERT INTO characters_v3 (id, account_id, name, name_key, vocation, level, xp, x, y, dir, data, updated_at)
      SELECT id, account_id, name, COALESCE(name_key, lower(name) || '#' || id), vocation, level, xp, x, y, dir,
             COALESCE(data, '{}'), updated_at
      FROM characters`);
    const before = (d.prepare("SELECT COUNT(*) AS n FROM characters").get() as { n: number }).n;
    const after = (d.prepare("SELECT COUNT(*) AS n FROM characters_v3").get() as { n: number }).n;
    if (before !== after) throw new Error(`migração v3: ${before} personagens na origem, ${after} copiados`);
    d.exec("DROP TABLE characters");
    d.exec("ALTER TABLE characters_v3 RENAME TO characters");
    d.exec("CREATE UNIQUE INDEX characters_name_key ON characters(name_key)");
    d.exec("CREATE INDEX characters_account ON characters(account_id)");
  },
  // v4: códigos de recuperação de senha (hash scrypt, uso único, 1 por conta) e arquivo de personagens excluídos
  // (cópia integral da linha no momento da exclusão: um admin consegue restaurar à mão).
  `CREATE TABLE password_resets (
     account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     code_hash TEXT NOT NULL,
     code_salt TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     created_by TEXT NOT NULL
   );
   CREATE TABLE deleted_characters (
     id INTEGER PRIMARY KEY,
     char_id INTEGER NOT NULL,
     account_id INTEGER NOT NULL,
     account_name TEXT NOT NULL,
     name TEXT NOT NULL,
     vocation TEXT NOT NULL,
     level INTEGER NOT NULL,
     xp INTEGER NOT NULL,
     x INTEGER,
     y INTEGER,
     dir INTEGER NOT NULL,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     deleted_at INTEGER NOT NULL
   );
   CREATE INDEX deleted_characters_name ON deleted_characters(name);`,
  // v5: estado do mundo que sobrevive a reinícios — pares chave/valor (recorde do Coliseu...) e itens no chão.
  `CREATE TABLE kv (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE ground_items (
     seq INTEGER PRIMARY KEY,          -- ordem de inserção (o último de cada tile é o topo da pilha)
     x INTEGER NOT NULL,
     y INTEGER NOT NULL,
     item TEXT NOT NULL,               -- ItemInstance em JSON
     expires_at INTEGER NOT NULL,      -- epoch ms
     owner TEXT,                       -- loot de grupo (ciclo 9): id do grupo com prioridade de 15 s para pegar/mover; null = sem dono...
     owner_until INTEGER               -- ...até este epoch ms
   );`,
  // v6: sessões de conta sobrevivem a reinícios. Só o hash SHA-256 do token vai para o disco (o token fica com o cliente).
  `CREATE TABLE account_sessions (
     token_hash TEXT PRIMARY KEY,
     account_id INTEGER NOT NULL,
     account TEXT NOT NULL,
     weak_password INTEGER NOT NULL,
     created INTEGER NOT NULL,         -- epoch ms
     expires INTEGER NOT NULL          -- epoch ms (inatividade)
   );
   CREATE INDEX account_sessions_account ON account_sessions(account_id);`,
  // v7: quando o item caiu no chão (teto do prazo: juntar pilhas nunca passa de 2× o tempo normal). NULL = registro antigo.
  `ALTER TABLE ground_items ADD COLUMN created_at INTEGER;`,
];

export interface AccountRow {
  id: number;
  name: string;
  pass_hash: string;
  salt: string;
  created_at: number;
}

let db: DatabaseSync | null = null;

function migrate(d: DatabaseSync) {
  const cur = (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = cur; v < MIGRATIONS.length; v++) {
    d.exec("BEGIN");
    try {
      const m = MIGRATIONS[v]!;
      if (typeof m === "string") d.exec(m); else m(d);
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  }
}

/** Aplica as migrações pendentes numa base já aberta (testes de migração). */
export function migrateForTest(d: DatabaseSync) { migrate(d); }

/** Abre (ou reabre) a base. `file` = caminho ou ":memory:". Útil para testes. */
export function initDb(file?: string): DatabaseSync {
  db?.close();
  const target = file ?? process.env.LEMONQUEST_DB ?? path.join(DATA_DIR, "lemonquest.db");
  if (target !== ":memory:") fs.mkdirSync(path.dirname(target), { recursive: true });
  const d = new DatabaseSync(target);
  d.exec("PRAGMA journal_mode = WAL");
  // Com WAL, NORMAL continua durável a queda do processo (só uma queda de energia perde os últimos commits) e evita um
  // fsync por commit — o autosave gravava N jogadores com N fsyncs (#56).
  d.exec("PRAGMA synchronous = NORMAL");
  d.exec("PRAGMA foreign_keys = ON");
  // Outro processo (CLI de admin) pode estar escrevendo: espera até 3 s pelo lock em vez de falhar na hora.
  d.exec("PRAGMA busy_timeout = 3000");
  migrate(d);
  db = d;
  return d;
}

function getDb(): DatabaseSync {
  return db ?? initDb();
}

/** Checkpoint do WAL. PASSIVE = periódico (não bloqueia leitores); TRUNCATE = no desligamento. */
export function checkpoint(mode: "PASSIVE" | "TRUNCATE" = "PASSIVE"): void {
  db?.exec(`PRAGMA wal_checkpoint(${mode})`);
}

/** Checkpoint TRUNCATE + fecha a base (desligamento). Idempotente. */
export function closeDb(): void {
  if (!db) return;
  try { checkpoint("TRUNCATE"); } finally { db.close(); db = null; }
}

/**
 * Cópia consistente da base em `file` (VACUUM INTO). Grava num `.tmp` e só troca pelo arquivo final depois de pronta:
 * uma falha (disco cheio...) não apaga o backup anterior com o mesmo nome.
 */
export function backupTo(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.rmSync(tmp, { force: true });
  try {
    getDb().prepare("VACUUM INTO ?").run(tmp);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

interface CharRow {
  id: number; account_id: number; name: string; vocation: string; level: number; xp: number;
  x: number | null; y: number | null; dir: number; data: string | null;
}

const toRecord = (r: CharRow): CharacterRecord => ({
  id: r.id, accountId: r.account_id, name: r.name, vocation: r.vocation as Vocation, level: r.level, xp: r.xp,
  x: r.x, y: r.y, dir: r.dir, data: parseData(r.data),
});

function parseData(raw: string | null): CharacterData {
  try { return raw ? (JSON.parse(raw) as CharacterData) : {}; } catch { return {}; }
}

/** Conta pelo nome (chave NFC + minúsculas). O nome da conta é privado e independe dos nomes dos personagens. */
export function findAccount(name: string): AccountRow | undefined {
  return getDb().prepare("SELECT * FROM accounts WHERE name_key = ?").get(nameKey(name)) as AccountRow | undefined;
}

/** Cria uma conta (sem personagens). Lança se o nome já existir (inclusive variante de caixa/acentos). */
export function createAccount(name: string, passHash: string, salt: string): AccountRow {
  const now = Date.now();
  const r = getDb().prepare("INSERT INTO accounts (name, name_key, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, nameKey(name), passHash, salt, now);
  return { id: Number(r.lastInsertRowid), name, pass_hash: passHash, salt, created_at: now };
}

/** Cria um personagem na conta. Lança se o nome já existir em QUALQUER conta. */
export function createCharacter(accountId: number, name: string, vocation: Vocation, extra: Partial<CharacterData> = {}): CharacterRecord {
  // Roupa inicial = a padrão da vocação (o jogador troca depois na janela de roupas).
  const data: CharacterData = { ...extra, outfit: defaultOutfit(vocation), addons: 0 };
  const r = getDb().prepare(
    "INSERT INTO characters (account_id, name, name_key, vocation, level, xp, x, y, dir, data, updated_at) VALUES (?, ?, ?, ?, 1, 0, NULL, NULL, 4, ?, ?)",
  ).run(accountId, name, nameKey(name), vocation, JSON.stringify(data), Date.now());
  return { id: Number(r.lastInsertRowid), accountId, name, vocation, level: 1, xp: 0, x: null, y: null, dir: 4, data };
}

/** Personagens da conta, na ordem de criação. */
export function listCharacters(accountId: number): CharacterRecord[] {
  return (getDb().prepare("SELECT * FROM characters WHERE account_id = ? ORDER BY id").all(accountId) as unknown as CharRow[]).map(toRecord);
}

export function countCharacters(accountId: number): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM characters WHERE account_id = ?").get(accountId) as { n: number }).n;
}

/** Atalho (testes/ferramentas): conta + um personagem com o mesmo nome, como no esquema antigo. */
export function createAccountWithCharacter(name: string, passHash: string, salt: string, vocation: Vocation): CharacterRecord {
  const d = getDb();
  d.exec("BEGIN");
  try {
    const acc = createAccount(name, passHash, salt);
    const ch = createCharacter(acc.id, name, vocation);
    d.exec("COMMIT");
    return ch;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function getCharacterByName(name: string): CharacterRecord | undefined {
  const r = getDb().prepare("SELECT * FROM characters WHERE name_key = ?").get(nameKey(name)) as CharRow | undefined;
  return r ? toRecord(r) : undefined;
}

export function saveCharacter(c: CharacterRecord): void {
  getDb().prepare(
    "UPDATE characters SET vocation = ?, level = ?, xp = ?, x = ?, y = ?, dir = ?, data = ?, updated_at = ? WHERE id = ?",
  ).run(c.vocation, c.level, c.xp, c.x, c.y, c.dir, JSON.stringify(c.data ?? {}), Date.now(), c.id);
}

export function findAccountById(id: number): AccountRow | undefined {
  return getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
}

/** Troca a senha da conta (hash + salt novos). */
export function updatePassword(accountId: number, passHash: string, salt: string): void {
  getDb().prepare("UPDATE accounts SET pass_hash = ?, salt = ? WHERE id = ?").run(passHash, salt, accountId);
}

export interface ResetRow { account_id: number; code_hash: string; code_salt: string; created_at: number; expires_at: number; created_by: string }

/** Grava o código de recuperação da conta (substitui um anterior: só o mais novo vale). */
export function setResetCode(accountId: number, codeHash: string, codeSalt: string, expiresAt: number, createdBy: string, now = Date.now()): void {
  getDb().prepare(
    "INSERT OR REPLACE INTO password_resets (account_id, code_hash, code_salt, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(accountId, codeHash, codeSalt, now, expiresAt, createdBy);
}

export function getResetCode(accountId: number): ResetRow | undefined {
  return getDb().prepare("SELECT * FROM password_resets WHERE account_id = ?").get(accountId) as ResetRow | undefined;
}

export function deleteResetCode(accountId: number): void {
  getDb().prepare("DELETE FROM password_resets WHERE account_id = ?").run(accountId);
}

/**
 * Exclui o personagem guardando a linha inteira em `deleted_characters` (mesma transação). O nome fica livre.
 * Devolve false se o personagem não existe (ou não é da conta).
 */
export function deleteCharacterArchived(charId: number, accountId: number, accountName: string, now = Date.now()): boolean {
  const d = getDb();
  d.exec("BEGIN");
  try {
    const r = d.prepare(
      `INSERT INTO deleted_characters (char_id, account_id, account_name, name, vocation, level, xp, x, y, dir, data, updated_at, deleted_at)
       SELECT id, account_id, ?, name, vocation, level, xp, x, y, dir, COALESCE(data, '{}'), updated_at, ?
       FROM characters WHERE id = ? AND account_id = ?`,
    ).run(accountName, now, charId, accountId);
    if (Number(r.changes) !== 1) { d.exec("ROLLBACK"); return false; }
    d.prepare("DELETE FROM characters WHERE id = ?").run(charId);
    d.exec("COMMIT");
    return true;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

// --- estado do mundo (kv + itens no chão) ---------------------------------------------------------------------------

export function getKv(key: string): string | undefined {
  const r = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value;
}

export function setKv(key: string, value: string): void {
  getDb().prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/** Tons de tingimento liberados por uma CONTA (vale pra qualquer personagem dela). Guardado no `kv` existente. */
export function getAccountTones(accountId: number): string[] {
  try { return JSON.parse(getKv(`account.tones.${accountId}`) ?? "[]") as string[]; } catch { return []; }
}

/** Adiciona um tom à conta (idempotente) e retorna a lista atualizada. */
export function addAccountTone(accountId: number, toneId: string): string[] {
  const list = getAccountTones(accountId);
  if (!list.includes(toneId)) list.push(toneId);
  setKv(`account.tones.${accountId}`, JSON.stringify(list));
  return list;
}

/** Montaria liberada pra CONTA (vale pra qualquer personagem dela). Guardado no `kv` existente. */
export function hasMount(accountId: number): boolean { return getKv(`account.mount.${accountId}`) === "1"; }

/** Libera a montaria pra conta (idempotente). */
export function unlockMount(accountId: number): void { setKv(`account.mount.${accountId}`, "1"); }

export interface SessionRow { token_hash: string; account_id: number; account: string; weak_password: number; created: number; expires: number }

export function insertSessionRow(r: SessionRow): void {
  getDb().prepare("INSERT OR REPLACE INTO account_sessions (token_hash, account_id, account, weak_password, created, expires) VALUES (?, ?, ?, ?, ?, ?)")
    .run(r.token_hash, r.account_id, r.account, r.weak_password, r.created, r.expires);
}

export function getSessionRow(tokenHash: string): SessionRow | undefined {
  return getDb().prepare("SELECT * FROM account_sessions WHERE token_hash = ?").get(tokenHash) as SessionRow | undefined;
}

export function updateSessionExpires(tokenHash: string, expires: number): void {
  getDb().prepare("UPDATE account_sessions SET expires = ? WHERE token_hash = ?").run(expires, tokenHash);
}

export function deleteSessionRow(tokenHash: string): void {
  getDb().prepare("DELETE FROM account_sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteSessionRowsOfAccount(accountId: number): void {
  getDb().prepare("DELETE FROM account_sessions WHERE account_id = ?").run(accountId);
}

export function deleteExpiredSessionRows(now: number): void {
  getDb().prepare("DELETE FROM account_sessions WHERE expires <= ?").run(now);
}

/** Hashes das sessões da conta, da mais antiga para a mais nova. */
export function listSessionHashesOfAccount(accountId: number): string[] {
  return (getDb().prepare("SELECT token_hash FROM account_sessions WHERE account_id = ? ORDER BY created, rowid").all(accountId) as { token_hash: string }[])
    .map((r) => r.token_hash);
}

export interface GroundRow {
  x: number;
  y: number;
  item: string;
  expiresAt: number;
  owner: string | null;
  ownerUntil: number | null;
  /** Quando caiu (epoch ms); null = registro de antes da v7. */
  createdAt?: number | null;
}

/** Itens no chão, na ordem de inserção. */
export function loadGroundRows(): GroundRow[] {
  const rows = getDb().prepare("SELECT x, y, item, expires_at, owner, owner_until, created_at FROM ground_items ORDER BY seq").all() as
    { x: number; y: number; item: string; expires_at: number; owner: string | null; owner_until: number | null; created_at: number | null }[];
  return rows.map((r) => ({ x: r.x, y: r.y, item: r.item, expiresAt: r.expires_at, owner: r.owner, ownerUntil: r.owner_until, createdAt: r.created_at }));
}

/**
 * Roda `fn` numa transação (SAVEPOINT: pode ficar dentro de outra — a de fora decide o COMMIT). Erro = desfaz e relança.
 */
export function transaction<T>(fn: () => T): T {
  const d = getDb();
  const sp = `sp${++savepointSeq}`;
  d.exec(`SAVEPOINT ${sp}`);
  try {
    const r = fn();
    d.exec(`RELEASE ${sp}`);
    return r;
  } catch (e) {
    // Se o SQLite já desfez a transação inteira (disco cheio, E/S), o savepoint não existe mais: não esconde o erro original.
    try { d.exec(`ROLLBACK TO ${sp}`); d.exec(`RELEASE ${sp}`); } catch { /* já desfeito */ }
    throw e;
  }
}
let savepointSeq = 0;

/** Substitui TODOS os itens no chão (uma transação; aninha dentro de `transaction`). */
export function replaceGroundRows(rows: readonly GroundRow[]): void {
  transaction(() => {
    getDb().exec("DELETE FROM ground_items");
    const ins = getDb().prepare("INSERT INTO ground_items (x, y, item, expires_at, owner, owner_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const r of rows) ins.run(r.x, r.y, r.item, r.expiresAt, r.owner, r.ownerUntil, r.createdAt ?? null);
  });
}

export interface RankingRow { name: string; vocation: string; level: number; xp: number; data: CharacterData }

/** Todos os personagens (campos mínimos) para o ranking público. Nunca inclui a conta. */
export function listRankingRows(): RankingRow[] {
  const rows = getDb().prepare("SELECT name, vocation, level, xp, data FROM characters").all() as unknown as
    { name: string; vocation: string; level: number; xp: number; data: string | null }[];
  return rows.map((r) => ({ name: r.name, vocation: r.vocation, level: r.level, xp: r.xp, data: parseData(r.data) }));
}

export interface DeletedCharacterRow {
  id: number; char_id: number; account_id: number; account_name: string; name: string; vocation: string;
  level: number; xp: number; x: number | null; y: number | null; dir: number; data: string; updated_at: number; deleted_at: number;
}

/** Arquivo de excluídos (mais recentes primeiro). */
export function listDeletedCharacters(): DeletedCharacterRow[] {
  return getDb().prepare("SELECT * FROM deleted_characters ORDER BY id DESC").all() as unknown as DeletedCharacterRow[];
}
