// Cliente HTTP do ClickUp (API v2, só leitura), isolado para o sistema (clickup.ts) e trocável por um falso nos testes.
// Só os campos que o jogo usa; o resto da resposta é ignorado. Nada aqui roda dentro do tick.

const BASE = "https://api.clickup.com/api/v2";
const TIMEOUT_MS = 15_000;

/** Tarefa como vem da API (só o que usamos). Datas em ms epoch, como string. */
export interface CuTask {
  id: string;
  name: string;
  status?: { status?: string; type?: string };
  date_updated?: string | null;
  date_done?: string | null;
  date_closed?: string | null;
  assignees?: { id?: number | string; email?: string | null }[];
  space?: { id?: string };
  list?: { id?: string };
}

export interface CuPage { tasks: CuTask[]; last_page?: boolean }

/** Filtros de busca (viram query string; listas viram `chave[]=v`). */
export type CuQuery = Record<string, string | number | boolean | readonly (string | number)[] | undefined>;

export interface ClickUpApi {
  /** GET /list/{id}/task */
  listTasks(listId: string, q: CuQuery): Promise<CuPage>;
  /** GET /team/{id}/task (busca no workspace inteiro, filtrada por espaços) */
  teamTasks(teamId: string, q: CuQuery): Promise<CuPage>;
}

/** Erro HTTP da API (429 traz o tempo de espera sugerido). */
export class ClickUpHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs?: number) {
    super(`ClickUp HTTP ${status}`);
  }
}

export function queryString(q: CuQuery): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const x of v) parts.push(`${encodeURIComponent(`${k}[]`)}=${encodeURIComponent(String(x))}`);
    else parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

type FetchFn = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown>;
}>;

/** Cliente real. `fetchFn` = fetch global (trocável). */
export function httpClickUp(token: string, fetchFn: FetchFn = fetch as unknown as FetchFn): ClickUpApi {
  const get = async (path: string, q: CuQuery): Promise<CuPage> => {
    const qs = queryString(q);
    const res = await fetchFn(`${BASE}${path}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: token, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // 429: o ClickUp manda X-RateLimit-Reset (epoch em segundos) — esperamos até lá.
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const retry = res.status === 429 && reset > 0 ? Math.max(0, reset * 1000 - Date.now()) : undefined;
      throw new ClickUpHttpError(res.status, retry);
    }
    const body = (await res.json()) as Partial<CuPage> | null;
    return { tasks: Array.isArray(body?.tasks) ? body!.tasks : [], last_page: body?.last_page };
  };
  return {
    listTasks: (listId, q) => get(`/list/${encodeURIComponent(listId)}/task`, q),
    teamTasks: (teamId, q) => get(`/team/${encodeURIComponent(teamId)}/task`, q),
  };
}

/** Quem é o dono de um token pessoal (vínculo feito pelo próprio jogador). */
export interface CuMe { id: string; email: string }

/**
 * API de identidade com o token do JOGADOR (vínculo self-service): só GET /user e GET /team. O token entra apenas no
 * header da requisição e não é guardado em lugar nenhum; erro sai sem texto da resposta (que poderia ecoar o token).
 */
export interface ClickUpAuthApi {
  me(token: string): Promise<CuMe>;
  teams(token: string): Promise<string[]>;
}

const AUTH_TIMEOUT_MS = 10_000;

export function httpClickUpAuth(fetchFn: FetchFn = fetch as unknown as FetchFn): ClickUpAuthApi {
  const get = async (path: string, token: string): Promise<unknown> => {
    const res = await fetchFn(`${BASE}${path}`, {
      headers: { Authorization: token, Accept: "application/json" },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!res.ok) throw new ClickUpHttpError(res.status);
    return res.json();
  };
  return {
    async me(token) {
      const b = (await get("/user", token)) as { user?: { id?: number | string; email?: string } } | null;
      const u = b?.user;
      if (!u || (typeof u.id !== "number" && typeof u.id !== "string") || typeof u.email !== "string") throw new ClickUpHttpError(502);
      return { id: String(u.id), email: u.email };
    },
    async teams(token) {
      const b = (await get("/team", token)) as { teams?: { id?: number | string }[] } | null;
      return Array.isArray(b?.teams) ? b!.teams.map((t) => String(t?.id ?? "")) : [];
    },
  };
}
