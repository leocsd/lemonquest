import crypto from "node:crypto";
import { promisify } from "node:util";
import { Router, type Response } from "express";
import {
  MAX_CHARACTERS_PER_ACCOUNT, MAX_NAME_LEN, VOCATIONS, isSex, type Sex,
  type AccountSession, type AuthFail, type CharacterSummary, type CreateCharacterRequest, type DeleteCharacterRequest,
  type LoginRequest, type PlayRequest, type PlayResponse, type ResetPasswordRequest,
} from "@lemonquest/shared";
import {
  countCharacters, createAccount, createCharacter, deleteCharacterArchived, deleteExpiredSessionRows, deleteResetCode,
  deleteSessionRow, deleteSessionRowsOfAccount, findAccount, getCharacterByName, getResetCode, getSessionRow,
  insertSessionRow, listCharacters, listSessionHashesOfAccount, nameKey, setResetCode, updatePassword, updateSessionExpires,
} from "./db.ts";
import { FailureLimiter, RateCounter } from "./ratelimit.ts";
import type { CharacterRecord } from "./types.ts";
import { loadOutfit } from "../systems/outfit.ts";
import { e2eMode } from "../e2e.ts";
import { devAdmins } from "../systems/devcommands.ts";
import { starterKit } from "../systems/inventory.ts";

/** Validade do token de entrada no mundo (uso único, emitido pelo /api/play). */
export const TOKEN_TTL_MS = 60_000;
/**
 * Sessão da conta (lista de personagens): expira após 30 dias sem uso; logout invalida. O cliente a guarda no navegador
 * (localStorage) para abrir direto na lista de personagens (dono, 2026-10-27); antes eram 30 min, só na aba.
 */
export const SESSION_IDLE_MS = 30 * 24 * 3600_000;
/** Sessões simultâneas por conta (abas/PCs): passou disso, a mais antiga cai. */
const MAX_SESSIONS_PER_ACCOUNT = 8;
const MIN_NAME_LEN = 3;
export const MIN_ACCOUNT_LEN = 3;
export const MAX_ACCOUNT_LEN = 20;
/** Senha mínima para contas NOVAS. Contas antigas (mínimo antigo 3) ainda entram, com aviso. */
export const MIN_PASSWORD_LEN = 6;
const LEGACY_MIN_PASSWORD_LEN = 3;
const MAX_PASSWORD_LEN = 200;

/** 5 falhas/min (por IP e por conta) → 5 min de bloqueio. */
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_FAIL_WINDOW_MS = 60_000;
export const LOGIN_LOCK_MS = 5 * 60_000;
/** 3 contas novas por IP por hora. */
export const CREATE_MAX_PER_HOUR = 3;
/** 10 tentativas de criar personagem por conta por hora (anti-spam/varredura de nomes). */
export const CHAR_CREATE_MAX_PER_HOUR = 10;

/** Código de recuperação de senha: 8 caracteres, vale 24 h, uso único. */
export const RESET_CODE_LEN = 8;
export const RESET_CODE_TTL_MS = 24 * 3600_000;
/** Sem 0/O/1/I/L: fácil de ditar e de digitar. */
const RESET_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** 10 tentativas de excluir personagem por conta por hora (a senha errada também conta no limitador do login). */
export const DELETE_MAX_PER_HOUR = 10;

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

/** Dados que o onAuth estático entrega ao onJoin (client.auth). Precisa ser JSON puro (passa por IPC). */
export interface AuthData {
  name: string;
  key: string;
  /** Senha abaixo do mínimo atual (conta antiga): o jogo sugere trocar. */
  weakPassword: boolean;
}

interface TokenEntry extends AuthData { expires: number }
const tokens = new Map<string, TokenEntry>();
/** Reserva do nome no /play: um token pendente por personagem (pedido novo invalida o anterior). */
const pendingByKey = new Map<string, string>();
/** Personagens no mundo: name_key -> sessionId dono. */
const online = new Map<string, string>();

/** `saved` = última expiração gravada no banco (a renovação só é regravada quando passa de SESSION_SAVE_EVERY_MS). */
interface AccountSessionEntry { accountId: number; account: string; weakPassword: boolean; created: number; expires: number; saved: number }
/** Sessões de conta: token aleatório (32 bytes) → conta. Cache em memória; a fonte é a tabela account_sessions (só o hash do token). */
const sessions = new Map<string, AccountSessionEntry>();
const SESSION_SAVE_EVERY_MS = 60_000;
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const ipFails = new FailureLimiter(LOGIN_MAX_FAILS, LOGIN_FAIL_WINDOW_MS, LOGIN_LOCK_MS);
const accountFails = new FailureLimiter(LOGIN_MAX_FAILS, LOGIN_FAIL_WINDOW_MS, LOGIN_LOCK_MS);
const creations = new RateCounter(CREATE_MAX_PER_HOUR, 3600_000);
const charCreations = new RateCounter(CHAR_CREATE_MAX_PER_HOUR, 3600_000);
/** Recuperação de senha: mesmo esquema do login (5 falhas/min por IP e por conta → 5 min). */
const resetIpFails = new FailureLimiter(LOGIN_MAX_FAILS, LOGIN_FAIL_WINDOW_MS, LOGIN_LOCK_MS);
const resetAccountFails = new FailureLimiter(LOGIN_MAX_FAILS, LOGIN_FAIL_WINDOW_MS, LOGIN_LOCK_MS);
const deletions = new RateCounter(DELETE_MAX_PER_HOUR, 3600_000);
let lastSweep = 0;

/** Zera o estado em memória (testes). */
export function resetAuthState(): void {
  tokens.clear(); pendingByKey.clear(); online.clear(); sessions.clear();
  for (const l of [ipFails, accountFails, resetIpFails, resetAccountFails]) l.sweep(Number.MAX_SAFE_INTEGER);
  for (const c of [creations, charCreations, deletions]) c.sweep(Number.MAX_SAFE_INTEGER);
  lastSweep = 0;
}

const LETTER = String.raw`(?:(?=\p{L})\p{Script=Latin})`;
/** Letras latinas e dígitos (ex.: "V1R4 L4T4"), com pelo menos uma letra. */
const NAME_CHAR = String.raw`(?:${LETTER}|[0-9])`;
const NAME_RE = new RegExp(`^(?=.*${LETTER})${NAME_CHAR}+(?: ${NAME_CHAR}+)*$`, "u");
const ACC_CHAR = String.raw`(?:${LETTER}|[0-9._-])`;
const ACCOUNT_RE = new RegExp(`^${ACC_CHAR}+(?: ${ACC_CHAR}+)*$`, "u");

/** Letras de nomes NOVOS: ASCII + Latin-1 + Latin Extended-A (barra sósias: ｆｕｌｌｗｉｄｔｈ, ʟ small caps, ligaduras ﬁ). */
const PLAIN_NAME_RE = /^(?=.*[A-Za-zÀ-ÖØ-öø-ſ])[0-9A-Za-zÀ-ÖØ-öø-ſ]+(?: [0-9A-Za-zÀ-ÖØ-öø-ſ]+)*$/u;

/** Nome aceito na CRIAÇÃO (mais estrito que normalizeName, que segue valendo para nomes antigos). */
export const isPlainNewName = (name: string): boolean => name.normalize("NFKC") === name && PLAIN_NAME_RE.test(name);

type Env = Record<string, string | undefined>;

/** Chave sem acentos: "Leonardó" e "Leonardo" colidem (para reservar nomes de admin). */
const foldKey = (s: string): string => nameKey(s).normalize("NFD").replace(/\p{M}/gu, "");

/** O nome (ou uma variante com/sem acento dele) está em LEMONQUEST_ADMINS? */
export const isReservedAdminName = (name: string, env: Env = process.env): boolean => {
  const k = foldKey(name);
  for (const a of devAdmins(env)) if (foldKey(a) === k) return true;
  return false;
};

/** Contas (name_key) que podem criar personagens com nome de admin: LEMONQUEST_ADMIN_ACCOUNTS="leonardo, ana". */
export const adminAccounts = (env: Env = process.env): Set<string> =>
  new Set((env.LEMONQUEST_ADMIN_ACCOUNTS ?? "").split(",").map((s) => nameKey(s.trim())).filter(Boolean));

/** Nome de PERSONAGEM: NFC; letras do alfabeto latino (com acentos) e dígitos, palavras separadas por um único espaço. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < MIN_NAME_LEN || name.length > MAX_NAME_LEN) return null;
  if (!NAME_RE.test(name)) return null;
  return name;
}

/** Nome de CONTA (privado): NFC; 3–20 letras latinas/dígitos e . _ - (espaços simples entre partes). */
export function normalizeAccount(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < MIN_ACCOUNT_LEN || name.length > MAX_ACCOUNT_LEN) return null;
  if (!ACCOUNT_RE.test(name)) return null;
  return name;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return (await scrypt(password, salt, 64)).toString("hex");
}

async function checkPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const a = Buffer.from(await hashPassword(password, salt), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sweep(now: number) {
  for (const [t, v] of tokens) {
    if (v.expires > now) continue;
    tokens.delete(t);
    if (pendingByKey.get(v.key) === t) pendingByKey.delete(v.key);
  }
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [t, s] of sessions) if (s.expires <= now) sessions.delete(t);
  deleteExpiredSessionRows(now);
  for (const l of [ipFails, accountFails, resetIpFails, resetAccountFails]) l.sweep(now);
  for (const c of [creations, charCreations, deletions]) c.sweep(now);
}

function issueToken(name: string, weakPassword: boolean, now: number): string {
  sweep(now);
  const key = nameKey(name);
  const prev = pendingByKey.get(key);
  if (prev) tokens.delete(prev);
  const token = crypto.randomUUID();
  tokens.set(token, { name, key, weakPassword, expires: now + TOKEN_TTL_MS });
  pendingByKey.set(key, token);
  return token;
}

function openSession(accountId: number, account: string, weakPassword: boolean, now: number): string {
  const mine = listSessionHashesOfAccount(accountId);
  while (mine.length >= MAX_SESSIONS_PER_ACCOUNT) {
    const old = mine.shift()!;
    deleteSessionRow(old);
    for (const [t] of sessions) if (hashToken(t) === old) sessions.delete(t);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = now + SESSION_IDLE_MS;
  sessions.set(token, { accountId, account, weakPassword, created: now, expires, saved: expires });
  insertSessionRow({ token_hash: hashToken(token), account_id: accountId, account, weak_password: weakPassword ? 1 : 0, created: now, expires });
  return token;
}

/** Sessão válida (e renovada: expiração conta a partir do último uso). Depois de um reinício, recarrega do banco. */
function touchSession(token: unknown, now: number): AccountSessionEntry | null {
  if (typeof token !== "string" || token.length > 100) return null;
  let s = sessions.get(token);
  if (!s) {
    const r = getSessionRow(hashToken(token));
    if (!r) return null;
    s = { accountId: r.account_id, account: r.account, weakPassword: !!r.weak_password, created: r.created, expires: r.expires, saved: r.expires };
    sessions.set(token, s);
  }
  if (s.expires <= now) { dropSession(token); return null; }
  s.expires = now + SESSION_IDLE_MS;
  if (s.expires - s.saved >= SESSION_SAVE_EVERY_MS) { updateSessionExpires(hashToken(token), s.expires); s.saved = s.expires; }
  return s;
}

function dropSession(token: string) {
  sessions.delete(token);
  deleteSessionRow(hashToken(token));
}

export function summarize(rec: CharacterRecord): CharacterSummary {
  const look = loadOutfit(rec);
  const s: CharacterSummary = { name: rec.name, vocation: rec.vocation, level: rec.level, outfit: look.outfit, addons: look.addons, sex: look.sex };
  const t = rec.data.offlineTraining;
  if (t && typeof t.skill === "string" && typeof t.sinceMs === "number") s.training = { skill: t.skill, sinceMs: t.sinceMs };
  if (online.has(nameKey(rec.name))) s.online = true;
  return s;
}

function sessionResponse(token: string, s: AccountSessionEntry): AccountSession {
  return { ok: true, session: token, account: s.account, characters: listCharacters(s.accountId).map(summarize) };
}

const limited = (ms: number): AuthFail => {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return { ok: false, error: "too_many_attempts", retryAfterSec: s, message: `Muitas tentativas. Tente de novo em ${s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`}.` };
};
const fail = (error: AuthFail["error"], message?: string): AuthFail => (message ? { ok: false, error, message } : { ok: false, error });

export interface LoginContext {
  /** IP do cliente (req.ip: o do socket, ou o do X-Forwarded-For com LEMONQUEST_TRUST_PROXY — ver index.ts). */
  ip?: string;
  now?: () => number;
}

/** POST /api/login — entra na conta (ou cria, com create=true) e devolve a sessão + lista de personagens. */
export async function handleLogin(req: LoginRequest, ctx: LoginContext = {}): Promise<AccountSession> {
  const now = ctx.now ?? Date.now;
  const ip = ctx.ip ?? "?";
  if (!req || typeof req !== "object" || typeof req.password !== "string") return fail("invalid_request");
  const account = normalizeAccount(req.account);
  if (!account) return fail("invalid_account");
  if (req.password.length > MAX_PASSWORD_LEN) return fail("wrong_password");
  const key = nameKey(account);
  sweep(now());

  const wait = Math.max(ipFails.lockedFor(ip, now()), accountFails.lockedFor(key, now()));
  if (wait > 0) return limited(wait);

  const acc = findAccount(account);
  if (req.create === true) {
    if (acc) return fail("account_taken");
    if (req.password.length < MIN_PASSWORD_LEN) {
      return fail("weak_password", `A senha precisa ter pelo menos ${MIN_PASSWORD_LEN} caracteres.`);
    }
    const cw = e2eMode() ? 0 : creations.waitFor(ip, now());
    if (cw > 0) return limited(cw);
    creations.record(ip, now());
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await hashPassword(req.password, salt);
    let row;
    try {
      row = createAccount(account, hash, salt);
    } catch {
      return fail("account_taken"); // corrida: alguém criou a mesma conta (ou variante de caixa/acentos) durante o hash
    }
    console.log(`[auth] conta criada: ${row.name} de ${ip}`);
    const s = openSession(row.id, row.name, false, now());
    return sessionResponse(s, sessions.get(s)!);
  }

  if (!acc) {
    // Conta inexistente conta como falha do IP (freia varredura de nomes de conta).
    ipFails.begin(ip);
    ipFails.end(ip, true, now());
    return fail("no_account");
  }

  ipFails.begin(ip);
  accountFails.begin(key);
  let ok = false;
  try {
    ok = req.password.length >= LEGACY_MIN_PASSWORD_LEN && await checkPassword(req.password, acc.salt, acc.pass_hash);
  } finally {
    ipFails.end(ip, !ok, now());
    accountFails.end(key, !ok, now());
  }
  if (!ok) {
    console.warn(`[auth] senha errada para a conta "${account}" de ${ip}`);
    return fail("wrong_password");
  }
  accountFails.reset(key); // o contador por IP não zera: login na própria conta não "recarrega" tentativas contra outra
  const s = openSession(acc.id, acc.name, req.password.length < MIN_PASSWORD_LEN, now());
  return sessionResponse(s, sessions.get(s)!);
}

/** POST /api/characters — cria um personagem na conta da sessão. */
export function handleCreateCharacter(req: CreateCharacterRequest, ctx: LoginContext = {}): AccountSession {
  const now = (ctx.now ?? Date.now)();
  if (!req || typeof req !== "object") return fail("invalid_request");
  sweep(now);
  const s = touchSession(req.session, now);
  if (!s) return fail("invalid_session");
  if (countCharacters(s.accountId) >= MAX_CHARACTERS_PER_ACCOUNT) return fail("too_many_characters");
  // Toda tentativa conta (inclusive nome inválido/ocupado): freia spam e varredura de nomes.
  const ck = String(s.accountId);
  const cw = e2eMode() ? 0 : charCreations.waitFor(ck, now);
  if (cw > 0) return limited(cw);
  charCreations.record(ck, now);
  const name = normalizeName(req.name);
  if (!name || !isPlainNewName(name)) return fail("invalid_name");
  if (!VOCATIONS.includes(req.vocation)) return fail("invalid_request");
  // Sexo: ausente = "m" (clientes antigos, scripts de teste); qualquer outro valor é pedido inválido.
  if (req.sex !== undefined && !isSex(req.sex)) return fail("invalid_request");
  const sex: Sex = req.sex ?? "m";
  // Nome de admin livre (admin excluiu/ainda não criou o personagem) não pode ser pego por qualquer conta: admin é
  // decidido pelo nome. Responde "name_taken" para não revelar quem é admin.
  if (!e2eMode() && isReservedAdminName(name) && !adminAccounts().has(nameKey(s.account))) {
    console.warn(`[auth] nome de admin recusado: ${name} (conta ${s.account}; libere em LEMONQUEST_ADMIN_ACCOUNTS)`);
    return fail("name_taken");
  }
  if (getCharacterByName(name)) return fail("name_taken");
  let rec;
  try {
    rec = createCharacter(s.accountId, name, req.vocation, { ...starterKit(req.vocation), sex });
  } catch {
    return fail("name_taken");
  }
  console.log(`[auth] personagem criado: ${rec.name} (${rec.vocation}, ${sex}) na conta ${s.account}`);
  return sessionResponse(req.session, s);
}

/** POST /api/play — emite o token de uso único para entrar no mundo com um personagem da conta. */
export function handlePlay(req: PlayRequest, ctx: LoginContext = {}): PlayResponse {
  const now = (ctx.now ?? Date.now)();
  if (!req || typeof req !== "object") return fail("invalid_request");
  sweep(now);
  const s = touchSession(req.session, now);
  if (!s) return fail("invalid_session");
  if (typeof req.name !== "string" || req.name.length > 64) return fail("no_character");
  const key = nameKey(req.name.normalize("NFC").trim());
  const rec = listCharacters(s.accountId).find((c) => nameKey(c.name) === key);
  if (!rec) return fail("no_character");
  // Personagem já online: o join com este token derruba a sessão antiga (CLOSE_REPLACED, ver WorldRoom.onJoin).
  return { ok: true, token: issueToken(rec.name, s.weakPassword, now), name: rec.name, vocation: rec.vocation };
}

/** POST /api/session — revalida uma sessão guardada (voltar à lista de personagens após desconectar). */
export function handleResume(req: { session?: unknown }, ctx: LoginContext = {}): AccountSession {
  const now = (ctx.now ?? Date.now)();
  sweep(now);
  const s = touchSession(req?.session, now);
  if (!s) return fail("invalid_session");
  return sessionResponse(req.session as string, s);
}

/** Normaliza o código digitado: maiúsculas, sem espaços/hífens. */
export const normalizeResetCode = (raw: unknown): string =>
  typeof raw === "string" ? raw.toUpperCase().replace(/[\s-]/g, "").slice(0, 32) : "";

/** Código formatado para exibir/ditar: ABCD-EFGH (o hífen é opcional na hora de digitar). */
export const formatResetCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

export interface ResetCodeResult { code: string; account: string; expiresAt: number }

/**
 * Gera um código de recuperação para a conta (substitui um anterior). Guarda só o hash (scrypt + salt).
 * Devolve null se a conta não existe. `by` = quem gerou (admin/CLI), para o log.
 */
export async function createResetCode(accountName: string, by: string, now = Date.now()): Promise<ResetCodeResult | null> {
  const acc = typeof accountName === "string" ? findAccount(accountName.normalize("NFC").trim().replace(/\s+/g, " ")) : undefined;
  if (!acc) return null;
  let code = "";
  for (let i = 0; i < RESET_CODE_LEN; i++) code += RESET_ALPHABET[crypto.randomInt(RESET_ALPHABET.length)];
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(code, salt);
  const expiresAt = now + RESET_CODE_TTL_MS;
  setResetCode(acc.id, hash, salt, expiresAt, by, now);
  console.log(`[auth] código de recuperação gerado para a conta ${acc.name} por ${by} (vale até ${new Date(expiresAt).toLocaleString("pt-BR")})`);
  return { code, account: acc.name, expiresAt };
}

/** Derruba todas as sessões de conta abertas (senha trocada). */
function closeAccountSessions(accountId: number) {
  for (const [t, s] of sessions) if (s.accountId === accountId) sessions.delete(t);
  deleteSessionRowsOfAccount(accountId);
}

/** Derruba uma sessão do jogo (o index registra o kick da sala; ausente nos testes de auth puros). */
let kickSession: ((sessionId: string, reason: string) => void) | null = null;
export function setSessionKicker(fn: ((sessionId: string, reason: string) => void) | null): void { kickSession = fn; }

/** Senha trocada: tokens de entrada pendentes caem e os personagens da conta que estão no mundo são desconectados. */
function closeAccountPlay(accountId: number) {
  const keys = new Set(listCharacters(accountId).map((c) => nameKey(c.name)));
  for (const k of keys) {
    const t = pendingByKey.get(k);
    if (t) { tokens.delete(t); pendingByKey.delete(k); }
    const sid = online.get(k);
    if (sid) kickSession?.(sid, "A senha da conta foi trocada. Entre de novo.");
  }
}

/** POST /api/reset-password — troca a senha com um código de recuperação válido e já entra na conta. */
export async function handleResetPassword(req: ResetPasswordRequest, ctx: LoginContext = {}): Promise<AccountSession> {
  const now = ctx.now ?? Date.now;
  const ip = ctx.ip ?? "?";
  if (!req || typeof req !== "object" || typeof req.password !== "string" || typeof req.code !== "string") return fail("invalid_request");
  const account = normalizeAccount(req.account);
  if (!account) return fail("invalid_account");
  if (req.password.length < MIN_PASSWORD_LEN || req.password.length > MAX_PASSWORD_LEN) {
    return fail("weak_password", `A senha precisa ter pelo menos ${MIN_PASSWORD_LEN} caracteres.`);
  }
  const key = nameKey(account);
  sweep(now());
  const wait = Math.max(resetIpFails.lockedFor(ip, now()), resetAccountFails.lockedFor(key, now()));
  if (wait > 0) return limited(wait);

  const code = normalizeResetCode(req.code);
  const acc = findAccount(account);
  const row = acc ? getResetCode(acc.id) : undefined;
  resetIpFails.begin(ip);
  resetAccountFails.begin(key);
  let ok = false;
  try {
    ok = !!row && row.expires_at > now() && code.length === RESET_CODE_LEN && await checkPassword(code, row.code_salt, row.code_hash);
  } finally {
    resetIpFails.end(ip, !ok, now());
    resetAccountFails.end(key, !ok, now());
  }
  if (!ok || !acc) {
    if (acc && row && row.expires_at <= now()) deleteResetCode(acc.id);
    console.warn(`[auth] código de recuperação inválido/expirado para a conta "${account}" de ${ip}`);
    return fail("invalid_code");
  }
  // Uso único: o código sai ANTES de gravar a senha (dois pedidos simultâneos com o mesmo código: só um troca).
  const still = getResetCode(acc.id);
  if (!still || still.code_hash !== row!.code_hash) return fail("invalid_code");
  deleteResetCode(acc.id);
  const salt = crypto.randomBytes(16).toString("hex");
  updatePassword(acc.id, await hashPassword(req.password, salt), salt);
  closeAccountSessions(acc.id);
  closeAccountPlay(acc.id);
  resetAccountFails.reset(key);
  accountFails.reset(key);
  console.log(`[auth] senha da conta ${acc.name} redefinida com código de recuperação (de ${ip})`);
  const s = openSession(acc.id, acc.name, false, now());
  return sessionResponse(s, sessions.get(s)!);
}

const ONLINE_MSG = "Esse personagem está online. Saia do jogo com ele antes de excluí-lo.";
const TRAINING_MSG = "Esse personagem está treinando offline. Entre com ele (o treino termina), saia e tente de novo.";

/** POST /api/characters/delete — exclui (arquivando) um personagem da conta. Exige a senha da conta. */
export async function handleDeleteCharacter(req: DeleteCharacterRequest, ctx: LoginContext = {}): Promise<AccountSession> {
  const now = ctx.now ?? Date.now;
  const ip = ctx.ip ?? "?";
  if (!req || typeof req !== "object" || typeof req.password !== "string") return fail("invalid_request");
  sweep(now());
  const s = touchSession(req.session, now());
  if (!s) return fail("invalid_session");
  const key = nameKey(s.account);
  const wait = Math.max(ipFails.lockedFor(ip, now()), accountFails.lockedFor(key, now()));
  if (wait > 0) return limited(wait);
  const ck = String(s.accountId);
  const dw = deletions.waitFor(ck, now());
  if (dw > 0) return limited(dw);
  deletions.record(ck, now());
  if (typeof req.name !== "string" || req.name.length > 64) return fail("no_character");
  const ckey = nameKey(req.name.normalize("NFC").trim());
  const find = () => listCharacters(s.accountId).find((c) => nameKey(c.name) === ckey);
  const rec = find();
  if (!rec) return fail("no_character");
  if (online.has(ckey)) return fail("character_online", ONLINE_MSG);
  if (rec.data.offlineTraining) return fail("character_training", TRAINING_MSG);

  const acc = findAccount(s.account);
  if (!acc) return fail("invalid_session");
  ipFails.begin(ip);
  accountFails.begin(key);
  let ok = false;
  try {
    ok = req.password.length <= MAX_PASSWORD_LEN && req.password.length >= LEGACY_MIN_PASSWORD_LEN
      && await checkPassword(req.password, acc.salt, acc.pass_hash);
  } finally {
    ipFails.end(ip, !ok, now());
    accountFails.end(key, !ok, now());
  }
  if (!ok) {
    console.warn(`[auth] senha errada ao excluir personagem na conta "${s.account}" de ${ip}`);
    return fail("wrong_password");
  }
  // Rechecagem depois do hash assíncrono: pode ter entrado no jogo nesse meio-tempo.
  const again = find();
  if (!again) return fail("no_character");
  if (online.has(ckey)) return fail("character_online", ONLINE_MSG);
  if (again.data.offlineTraining) return fail("character_training", TRAINING_MSG);
  const pending = pendingByKey.get(ckey);
  if (pending) { tokens.delete(pending); pendingByKey.delete(ckey); }
  if (!deleteCharacterArchived(again.id, s.accountId, s.account, now())) return fail("no_character");
  console.log(`[auth] personagem excluído: ${again.name} (level ${again.level} ${again.vocation}) da conta ${s.account} — arquivado em deleted_characters`);
  return sessionResponse(req.session, s);
}

/** POST /api/logout — encerra a sessão da conta. */
export function handleLogout(req: { session?: unknown }): { ok: true } {
  if (typeof req?.session === "string") dropSession(req.session);
  return { ok: true };
}

function send(res: Response, r: { ok: boolean; error?: string }) {
  if (!r.ok && r.error === "too_many_attempts") res.status(429);
  else if (!r.ok && r.error === "invalid_session") res.status(401);
  res.json(r);
}

function route(fn: (body: any, ctx: LoginContext) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string }) {
  return async (req: import("express").Request, res: Response) => {
    try {
      send(res, await fn(req.body ?? {}, { ip: req.ip ?? req.socket.remoteAddress ?? "?" }));
    } catch (e) {
      console.error(`[auth] erro em ${req.path}`, e);
      res.status(500).json({ ok: false, error: "invalid_request" } satisfies AuthFail);
    }
  };
}

/** Rotas HTTP montadas em /api (ver o fluxo de contas em shared/messages.ts). */
export const authRouter = Router();
authRouter.post("/login", route(handleLogin));
authRouter.post("/session", route(handleResume));
authRouter.post("/characters", route(handleCreateCharacter));
authRouter.post("/characters/delete", route(handleDeleteCharacter));
authRouter.post("/reset-password", route(handleResetPassword));
authRouter.post("/play", route(handlePlay));
authRouter.post("/logout", route(handleLogout));

/** Valida (e consome) o token emitido no /play. Lança Error se inválido/expirado. */
export function consumeToken(token: string, now = Date.now()): AuthData {
  const entry = typeof token === "string" ? tokens.get(token) : undefined;
  if (entry) {
    tokens.delete(token);
    if (pendingByKey.get(entry.key) === token) pendingByKey.delete(entry.key);
  }
  if (!entry || entry.expires <= now) throw new Error("Token inválido ou expirado");
  if (!getCharacterByName(entry.name)) throw new Error("Personagem não encontrado");
  return { name: entry.name, key: entry.key, weakPassword: entry.weakPassword };
}

/** Marca o personagem como online para `owner` (sessionId). Devolve o dono anterior, se havia outro. */
export function claimOnline(name: string, owner: string): string | undefined {
  const key = nameKey(name);
  const prev = online.get(key);
  online.set(key, owner);
  return prev !== undefined && prev !== owner ? prev : undefined;
}

/** Libera o nome — só se `owner` ainda for o dono (uma sessão chutada não derruba a nova). */
export function releaseOnline(name: string, owner: string): boolean {
  const key = nameKey(name);
  if (online.get(key) !== owner) return false;
  online.delete(key);
  return true;
}

export const onlineOwner = (name: string): string | undefined => online.get(nameKey(name));
