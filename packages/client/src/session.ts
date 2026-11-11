import type { Room } from "@colyseus/sdk";
import {
  CLOSE_KICKED, CLOSE_REPLACED, CLOSE_TRAINING,
  type AccountSession, type AuthFail, type CreateCharacterRequest, type DeleteCharacterRequest, type JoinOptions, type LoginRequest,
  type PlayResponse, type ResetPasswordRequest,
} from "@lemonquest/shared";
import { client, endpoint } from "./net.ts";

/**
 * Ponto de encontro entre a UI (Preact) e o jogo (Phaser).
 * - UI de login chama login() e depois connect().
 * - WorldScene assina onRoom() para começar a renderizar quando a sala existir.
 */
type Listener = (room: Room) => void;

export type ConnStatus = "idle" | "online" | "reconnecting" | "closed";

/**
 * Códigos de fechamento. 4000-4010 são do Colyseus (CONSENTED, SERVER_SHUTDOWN=4001, WITH_ERROR,
 * FAILED_TO_RECONNECT=4003, MAY_TRY_RECONNECT). CLOSE_REPLACED (4100) = personagem entrou em outro lugar;
 * CLOSE_TRAINING (4101) = saiu para treinar offline (ver shared/messages.ts).
 */
export { CLOSE_KICKED, CLOSE_REPLACED, CLOSE_TRAINING };

/** Sessão da conta guardada na aba (sessionStorage): após desconectar, volta direto à lista de personagens. */
const ACCOUNT_SESSION_KEY = "lemonquest.accountSession";
export const LAST_ACCOUNT_KEY = "lemonquest.account";

function storeGet(s: Storage, k: string): string | null { try { return s.getItem(k); } catch { return null; } }
function storeSet(s: Storage, k: string, v: string | null) {
  try { if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* armazenamento indisponível */ }
}

/** Servidor que não responde (travado/sobrecarregado) vira erro em vez de "Carregando…" para sempre. */
export const API_TIMEOUT_MS = 15_000;

async function post<T extends { ok: boolean }>(path: string, body: unknown): Promise<T | AuthFail> {
  const res = await fetch(`${endpoint}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  try {
    return (await res.json()) as T | AuthFail;
  } catch {
    if (res.status === 429) return { ok: false, error: "too_many_attempts" };
    throw new Error(`HTTP ${res.status}`);
  }
}

/** Texto PT-BR do motivo da desconexão definitiva. */
export function closeMessage(code: number, reason?: string): string {
  const r = (reason ?? "").toLowerCase();
  if (code === CLOSE_REPLACED || /outro lugar|replaced|another (login|session)|duplicate/.test(r)) {
    return "Sua conta entrou em outro lugar.";
  }
  if (code === 4001 && !/reconnect/.test(r)) return "O servidor foi reiniciado ou desligado.";
  if (code === CLOSE_KICKED) {
    const why = (reason ?? "").trim();
    return why && why !== "Expulso por um administrador"
      ? `Você foi expulso por um administrador. Motivo: ${why}`
      : "Você foi expulso por um administrador.";
  }
  if (code === CLOSE_TRAINING) return "Seu personagem está treinando offline. Entre de novo para ver o progresso.";
  if (/kick|expuls/.test(r)) return "Você foi expulso do servidor.";
  if (code === 4003 || /reconnect/.test(r) || code === 1006 || code === 1001) {
    return "Não foi possível reconectar ao servidor. Ele pode ter sido reiniciado ou a rede caiu.";
  }
  return `A conexão com o servidor foi encerrada (código ${code}).`;
}

class Session {
  room: Room | null = null;
  myId = "";
  myName = "";
  status: ConnStatus = "idle";
  closeInfo: { code: number; reason: string } | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<() => void>();

  private setStatus(s: ConnStatus) {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l();
  }

  onStatus(l: () => void): () => void {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }

  // ---- Conta (HTTP) ----

  /** Token da sessão da conta guardado nesta aba (ou null). */
  get accountSession(): string | null { return storeGet(sessionStorage, ACCOUNT_SESSION_KEY); }

  private remember(r: AccountSession): AccountSession {
    if (r.ok) {
      storeSet(sessionStorage, ACCOUNT_SESSION_KEY, r.session);
      storeSet(localStorage, LAST_ACCOUNT_KEY, r.account);
    } else if (r.error === "invalid_session") {
      storeSet(sessionStorage, ACCOUNT_SESSION_KEY, null);
    }
    return r;
  }

  /** Último nome de conta usado neste navegador (nunca a senha). */
  get lastAccount(): string { return storeGet(localStorage, LAST_ACCOUNT_KEY) ?? ""; }

  async login(req: LoginRequest): Promise<AccountSession> {
    return this.remember(await post<AccountSession>("login", req));
  }

  /** Revalida a sessão guardada (voltar à lista de personagens). null = não havia sessão. */
  async resume(): Promise<AccountSession | null> {
    const s = this.accountSession;
    if (!s) return null;
    return this.remember(await post<AccountSession>("session", { session: s }));
  }

  async createCharacter(req: Omit<CreateCharacterRequest, "session">): Promise<AccountSession> {
    return this.remember(await post<AccountSession>("characters", { ...req, session: this.accountSession ?? "" }));
  }

  /** Troca a senha com o código de recuperação e já entra na conta. */
  async resetPassword(req: ResetPasswordRequest): Promise<AccountSession> {
    return this.remember(await post<AccountSession>("reset-password", req));
  }

  /** Exclui um personagem da conta (exige a senha). Devolve a lista atualizada. */
  async deleteCharacter(req: Omit<DeleteCharacterRequest, "session">): Promise<AccountSession> {
    return this.remember(await post<AccountSession>("characters/delete", { ...req, session: this.accountSession ?? "" }));
  }

  async play(name: string): Promise<PlayResponse> {
    const r = await post<PlayResponse>("play", { session: this.accountSession ?? "", name });
    if (!r.ok && r.error === "invalid_session") storeSet(sessionStorage, ACCOUNT_SESSION_KEY, null);
    return r;
  }

  async logout(): Promise<void> {
    const s = this.accountSession;
    storeSet(sessionStorage, ACCOUNT_SESSION_KEY, null);
    if (s) await post("logout", { session: s }).catch(() => {});
  }

  async connect(token: string, name: string): Promise<Room> {
    const opts: JoinOptions = { token };
    const room = await client.joinOrCreate("world", opts);
    this.room = room;
    this.myId = room.sessionId;
    this.myName = name;
    this.closeInfo = null;
    this.setStatus("online");
    // O SDK reconecta sozinho (onDrop -> tentativas -> onReconnect); onLeave = fim definitivo.
    room.onDrop(() => { if (this.room === room && this.status !== "closed") this.setStatus("reconnecting"); });
    room.onReconnect(() => { if (this.room === room && this.status !== "closed") this.setStatus("online"); });
    room.onLeave((code, reason) => {
      if (this.room !== room) return;
      this.closeInfo = { code, reason: reason ?? "" };
      this.setStatus("closed");
    });
    for (const l of this.listeners) l(room);
    return room;
  }

  /**
   * "Trocar personagem" (menu em você): sai da sala por vontade própria e recarrega a página. A sessão da conta fica na
   * aba (sessionStorage), então o login volta direto à lista de personagens. Soltar a sala antes de sair impede que o
   * onLeave mostre "Você foi desconectado" no meio do caminho.
   */
  async switchCharacter(): Promise<void> {
    const room = this.room;
    this.room = null;
    // Sem resposta do servidor em 2 s, recarrega mesmo assim (a queda vira saída normal do lado de lá).
    try { await Promise.race([room?.leave(true), new Promise((r) => setTimeout(r, 2000))]); } catch { /* já caiu: recarregar resolve igual */ }
    location.reload();
  }

  onRoom(l: Listener): () => void {
    this.listeners.add(l);
    if (this.room) l(this.room);
    return () => this.listeners.delete(l);
  }
}

export const session = new Session();
