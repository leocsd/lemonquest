import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ActiveEvent } from "@lemonquest/shared";
import {
  CHEGOU_BOXES_PER_HOUR, CHEGOU_SEAL, CLICKUP_MAX_BACKOFF_MS, ClickUpSystem, LINK_MAX_TRIES, LINK_REFUSED, LINK_WINDOW_MS, SPRINT_EVENT_XP, clickupConfig, countByProject,
  parsePurchaseItem, sprintGoals, weekStartMs, type ClickUpHost,
} from "./clickup.ts";
import { ClickUpHttpError, httpClickUp, queryString, type ClickUpApi, type ClickUpAuthApi, type CuQuery, type CuTask } from "./clickupClient.ts";

type FixTask = CuTask & { _h: number };
const FIX = JSON.parse(readFileSync(new URL("./fixtures/clickup.json", import.meta.url), "utf8")) as Record<"purchases" | "history" | "week" | "open", FixTask[]>;
/** Quarta-feira, 10h (horário local): a semana começou 58 h antes. */
const NOW = new Date(2026, 9, 21, 10, 0).getTime();
const H = 3_600_000;
const POLL = 5 * 60_000;
const at = (list: FixTask[], now = NOW): CuTask[] => list.map(({ _h, ...t }) => ({ ...t, date_done: String(now + _h * H), date_updated: String(now + _h * H) }));

/** API falsa: devolve as fixtures conforme a busca e guarda as queries. */
function fakeApi(over: Partial<Record<keyof typeof FIX, FixTask[]>> = {}) {
  const calls: { kind: string; q: CuQuery }[] = [];
  const data = { ...FIX, ...over };
  const api: ClickUpApi & { calls: typeof calls; data: typeof data; fail?: Error } = {
    calls, data,
    async listTasks(_id, q) {
      calls.push({ kind: "list", q });
      if (api.fail) throw api.fail;
      const since = Number(q.date_updated_gt ?? 0);
      return { tasks: at(data.purchases).filter((t) => Number(t.date_updated) > since), last_page: true };
    },
    async teamTasks(_id, q) {
      const kind = q.date_done_lt ? "history" : q.date_done_gt ? "week" : "open";
      calls.push({ kind, q });
      if (api.fail) throw api.fail;
      return { tasks: at(data[kind]), last_page: true };
    },
  };
  return api;
}

function makeHost(kv = new Map<string, string>()) {
  const feed: string[] = [];
  const boxes: { defId: string; count: number }[][] = [];
  const events: ActiveEvent[] = [];
  const credits: [string, number][] = [];
  const logs: string[] = [];
  let now = NOW;
  const host: ClickUpHost = {
    getKv: (k) => kv.get(k), setKv: (k, v) => void kv.set(k, v),
    feed: (t) => void feed.push(t),
    dropBox: (items) => { boxes.push(items); return "na Estação Central da Malha"; },
    startEvent: (ev) => { events.push(ev); return true; },
    credit: (name, n) => { credits.push([name, n]); return true; },
    now: () => now, random: () => 0, log: (l) => void logs.push(l),
  };
  return { host, kv, feed, boxes, events, credits, logs, setNow: (v: number) => { now = v; } };
}

const CFG = { pollMs: POLL, teamId: "1", purchasesList: "2" };
async function cycle(sys: ClickUpSystem, now = NOW) { await sys.poll(now); sys.tick(now); }

describe("clickup: configuração", () => {
  it("sem token = desligado, sem chamar a rede nem logar", async () => {
    expect(clickupConfig({})).toBeNull();
    const h = makeHost();
    const sys = ClickUpSystem.fromEnv(h.host, {});
    expect(sys.enabled).toBe(false);
    sys.maybePoll(NOW);
    await sys.poll(NOW);
    sys.tick(NOW);
    expect(h.logs).toEqual([]);
    expect(sys.workMsg("painel_obra").online).toBe(false);
    expect(sys.statusLine()).toContain("desligado");
  });
  it("intervalo pelo ambiente (padrão 5 min, mínimo 1, teto 60)", () => {
    expect(clickupConfig({ LEMONQUEST_CLICKUP_TOKEN: "pk" })!.pollMs).toBe(5 * 60_000);
    expect(clickupConfig({ LEMONQUEST_CLICKUP_TOKEN: "pk", LEMONQUEST_CLICKUP_POLL_MIN: "2" })!.pollMs).toBe(2 * 60_000);
    expect(clickupConfig({ LEMONQUEST_CLICKUP_TOKEN: "pk", LEMONQUEST_CLICKUP_POLL_MIN: "0" })!.pollMs).toBe(5 * 60_000);
    expect(clickupConfig({ LEMONQUEST_CLICKUP_TOKEN: "pk", LEMONQUEST_CLICKUP_POLL_MIN: "999" })!.pollMs).toBe(60 * 60_000);
  });
  it("query string com listas no formato chave[]", () => {
    expect(queryString({ space_ids: ["1", "2"], page: 0, x: undefined })).toBe("space_ids%5B%5D=1&space_ids%5B%5D=2&page=0");
  });
});

describe("clickup: funções puras", () => {
  it("item do título de compra", () => {
    expect(parsePurchaseItem("[Câmera IP 4MP] - P08/ 10/10")).toBe("Câmera IP 4MP");
    expect(parsePurchaseItem("Cabo de rede - P06/ 14/10")).toBe("Cabo de rede");
  });
  it("início da semana ISO é segunda 00:00", () => {
    expect(weekStartMs(NOW)).toBe(new Date(2026, 9, 19).getTime());
  });
  it("metas = média das 4 semanas anteriores, sem Oficina nem espaço fora do mapa", () => {
    expect(sprintGoals(at(FIX.history), weekStartMs(NOW))).toEqual({ p08: 2, p11: 1 });
    expect(countByProject(at(FIX.week))).toEqual({ p08: 2, p11: 1 });
  });
});

describe("clickup: A1 Chegou!", () => {
  it("a primeira leitura só marca o que já estava entregue; a seguinte anuncia o novo uma vez", async () => {
    const h = makeHost();
    const api = fakeApi();
    const sys = new ClickUpSystem(h.host, api, CFG);
    await cycle(sys);
    expect(h.feed).toEqual([]);
    expect(api.calls.find((c) => c.kind === "list")!.q.date_updated_gt).toBeUndefined(); // semente: tudo
    // Chega uma encomenda nova.
    api.data.purchases = [...FIX.purchases, { id: "c9", name: "[Iluminador IR] - P08/ 20/10", status: { status: "Pedidos Entregues" }, _h: 0.01 } as FixTask];
    const later = NOW + POLL;
    h.setNow(later);
    await cycle(sys, later);
    expect(h.feed).toEqual(["📦 Chegou! Iluminador IR — tem Caixa de Encomenda na Estação Central da Malha."]);
    expect(h.boxes[0]![0]).toEqual({ defId: CHEGOU_SEAL, count: 1 });
    // Mesma leitura de novo, e depois de "reiniciar" (outro sistema com o mesmo kv): nada repete.
    await cycle(sys, later + POLL);
    const again = new ClickUpSystem(h.host, api, CFG);
    await cycle(again, later + 2 * POLL);
    expect(h.feed).toHaveLength(1);
  });

  it("lista negra não anuncia; cliente vira disfarce; caixas limitadas por hora; excesso vira 'e mais N'", async () => {
    const h = makeHost(new Map([["clickup.chegou.seen", "[]"]]));
    const extra = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, name: `[Parafuso ${i}] - P08/ 20/10`, status: { status: "pedidos entregues" }, _h: -0.1 })) as FixTask[];
    const sys = new ClickUpSystem(h.host, fakeApi({ purchases: [...FIX.purchases, ...extra] }), CFG);
    await cycle(sys);
    // c3 (Token USB) some; c4 (sem colchetes) vira "Cabo de rede Ferrovia".
    expect(h.feed.some((t) => t.includes("Token"))).toBe(false);
    expect(h.feed.some((t) => t.includes("Cabo de rede Ferrovia"))).toBe(true);
    expect(h.feed.filter((t) => t.startsWith("📦 Chegou!"))).toHaveLength(5);
    expect(h.feed.at(-1)).toBe("📦 …e mais 2 encomendas chegaram hoje.");
    expect(h.boxes).toHaveLength(CHEGOU_BOXES_PER_HOUR);
  });
});

describe("clickup: A2 sprints e A3 conquistas", () => {
  it("barras por projeto e Sprint Fechada quando a semana alcança a meta (uma vez só, mesmo depois de reiniciar)", async () => {
    const h = makeHost();
    const sys = new ClickUpSystem(h.host, fakeApi(), CFG);
    await cycle(sys);
    const msg = sys.workMsg("painel_obra");
    expect(msg.online).toBe(true);
    expect(msg.sprints).toEqual([
      { id: "p08", name: "Portal de Inspeção", done: 2, goal: 2 },
      { id: "p11", name: "Câmera na Locomotiva", done: 1, goal: 1 },
    ]);
    expect(msg.total).toEqual({ done: 3, goal: 3, fired: true });
    expect(h.events).toHaveLength(1);
    expect(h.events[0]!.xpMult).toBe(SPRINT_EVENT_XP);
    expect(h.events[0]!.until).toBe(NOW + 3_600_000);
    sys.tick(NOW + 5000);
    await cycle(new ClickUpSystem(h.host, fakeApi(), CFG), NOW + POLL); // reinício: não dispara de novo
    expect(h.events).toHaveLength(1);
    expect(sys.workMsg("x").total.fired).toBe(true);
  });

  it("histórico só é buscado uma vez por semana", async () => {
    const h = makeHost();
    const api = fakeApi();
    const sys = new ClickUpSystem(h.host, api, CFG);
    await cycle(sys);
    await cycle(sys, NOW + POLL);
    expect(api.calls.filter((c) => c.kind === "history")).toHaveLength(1);
  });

  it("vínculo credita só tarefas fechadas depois dele, uma vez por tarefa, inclusive Oficina", async () => {
    const h = makeHost();
    const sys = new ClickUpSystem(h.host, fakeApi(), CFG);
    sys.link("Heroi", "43024221", NOW - 10 * H);
    await cycle(sys);
    expect(h.credits).toEqual([["Heroi", 3]]); // w1, w2, w4 (w3 foi antes do vínculo)
    await cycle(sys, NOW + POLL);
    await cycle(new ClickUpSystem(h.host, fakeApi(), CFG), NOW + 2 * POLL);
    expect(h.credits).toHaveLength(1);
    // Revincular a outro usuário troca (um personagem, um usuário).
    sys.link("Heroi", "42990224", NOW - 10 * H);
    expect(sys.linkList()).toEqual([["42990224", { name: "Heroi", since: NOW - 10 * H }]]);
    sys.link("Heroi", null);
    expect(sys.linkList()).toEqual([]);
  });
});

describe("clickup: A4 Na obra", () => {
  it("só Ferrovia e Oficina, título disfarçado, sem lista negra nem cliente confidencial, mais recentes primeiro", async () => {
    const h = makeHost();
    const sys = new ClickUpSystem(h.host, fakeApi(), CFG);
    await cycle(sys);
    expect(sys.workMsg("painel_obra").tasks).toEqual([
      { title: "Subir container do RDT", who: "ninguém ainda", project: "Oficina" },
      { title: "Go/NoGo das câmeras em Pátio com Pedrão", who: "Julião", project: "Portal de Inspeção" },
      { title: "Validar dark-field com a Ferrovia", who: "alguém da Ferrovia", project: "Câmera na Locomotiva" },
    ]);
  });
});

describe("clickup: falhas", () => {
  it("erro dobra a espera até 30 min, loga pouco e volta ao normal ao acertar", async () => {
    const h = makeHost();
    const api = fakeApi();
    api.fail = new Error("rede fora");
    const sys = new ClickUpSystem(h.host, api, CFG);
    const flush = () => new Promise((r) => setTimeout(r, 0));
    let t = NOW;
    await sys.poll(t);
    for (const w of [POLL, 2 * POLL, 4 * POLL, CLICKUP_MAX_BACKOFF_MS, CLICKUP_MAX_BACKOFF_MS]) {
      const n = api.calls.length;
      sys.maybePoll(t + w - 1);
      expect(api.calls.length).toBe(n);
      t += w;
      sys.maybePoll(t);
      expect(api.calls.length).toBe(n + 1);
      await flush();
    }
    expect(h.logs.length).toBe(2); // 1ª falha e a 4ª (espera no teto)
    api.fail = undefined;
    await cycle(sys, t + CLICKUP_MAX_BACKOFF_MS);
    expect(h.logs.at(-1)).toContain("voltou ao normal");
    expect(h.feed).toEqual([]);
  });

  it("429 com reset longo espera o reset", async () => {
    const h = makeHost();
    const api = fakeApi();
    api.fail = new ClickUpHttpError(429, 20 * 60_000);
    const sys = new ClickUpSystem(h.host, api, CFG);
    await sys.poll(NOW);
    const n = api.calls.length;
    sys.maybePoll(NOW + 19 * 60_000);
    expect(api.calls.length).toBe(n);
  });
});

describe("clickup: privacidade (revisão cruzada)", () => {
  it("compra com cliente confidencial no projeto/data do título não é anunciada nem gera caixa", async () => {
    const h = makeHost(new Map([["clickup.chegou.seen", "[]"]]));
    const bad = ["[Câmera] - JLR/ 12-10", "[Lente] - EdgeSM / 03-10", "Câmera X - Projeto JLR", "[Cabo] - Land Rover/ 01-10"]
      .map((name, i) => ({ id: `b${i}`, name, status: { status: "pedidos entregues" }, _h: -0.1 })) as FixTask[];
    const sys = new ClickUpSystem(h.host, fakeApi({ purchases: bad }), CFG);
    await cycle(sys);
    expect(h.feed).toEqual([]);
    expect(h.boxes).toEqual([]);
  });

  it("entrega antiga que voltou por edição (fora do SEEN_CAP) não é reanunciada", async () => {
    const h = makeHost(new Map([["clickup.chegou.seen", "[]"]]));
    const api = fakeApi({ purchases: [{ id: "old", name: "[Fonte 12V] - P08/ 01-09", status: { status: "pedidos entregues" }, _h: -0.1 } as FixTask] });
    const sys = new ClickUpSystem(h.host, {
      ...api,
      listTasks: async (id, q) => ({ tasks: (await api.listTasks(id, q)).tasks.map((t) => ({ ...t, date_done: String(NOW - 30 * 86_400_000) })), last_page: true }),
    }, CFG);
    await cycle(sys);
    expect(h.feed).toEqual([]);
  });

  it("erro de rede ou HTTP nunca põe o token no log", async () => {
    const TOKEN = "pk_SEGREDO_123";
    for (const fetchFn of [
      async () => { throw new Error("connect ECONNREFUSED"); },
      async () => ({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({ err: "Token invalid" }) }),
      async () => ({ ok: false, status: 429, headers: { get: () => String(Math.floor(NOW / 1000) + 60) }, json: async () => ({}) }),
    ]) {
      const h = makeHost();
      const sys = new ClickUpSystem(h.host, httpClickUp(TOKEN, fetchFn as never), CFG);
      await sys.poll(NOW);
      expect(h.logs.length).toBeGreaterThan(0);
      for (const l of h.logs) expect(l).not.toContain(TOKEN);
    }
  });
});

describe("clickup: vínculo self-service (token do próprio jogador)", () => {
  const TOKEN = "pk_43024221_SEGREDOabcdef123";
  /** Auth falsa: o dono de cada token, os workspaces dele e quantas chamadas houve. */
  function fakeAuth(users: Record<string, { id: string; email: string; teams: string[] } | "erro" | "401">) {
    const calls: string[] = [];
    const auth: ClickUpAuthApi & { calls: string[] } = {
      calls,
      async me(token) {
        calls.push("me");
        const u = users[token];
        if (!u || u === "401") throw new ClickUpHttpError(401);
        if (u === "erro") throw new Error("ECONNRESET");
        return { id: u.id, email: u.email };
      },
      async teams(token) {
        calls.push("teams");
        const u = users[token];
        return u && typeof u === "object" ? u.teams : [];
      },
    };
    return auth;
  }
  function linkHost() {
    const h = makeHost();
    const results: { sid: string; ok: boolean; text: string }[] = [];
    h.host.linkResult = (sid, ok, text) => void results.push({ sid, ok, text });
    return { ...h, results };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  async function link(sys: ClickUpSystem, sid: string, name: string, token: unknown, now = NOW) {
    sys.requestLink(sid, name, token, now);
    await flush();
    sys.tick(now);
  }

  it("token válido da casa e do workspace: vincula; o token não aparece em kv, log, aviso nem no quadro", async () => {
    const h = linkHost();
    const auth = fakeAuth({ [TOKEN]: { id: "43024221", email: "pedro@embeddo.io", teams: ["123", "30950578"] } });
    const sys = new ClickUpSystem(h.host, null, null, auth);
    await link(sys, "s1", "Heroi", TOKEN);
    expect(h.results).toHaveLength(1);
    expect(h.results[0]!.ok).toBe(true);
    expect(h.results[0]!.text).toContain("vinculado como Pedrão");
    expect(h.results[0]!.text).toContain("quando o ClickUp do servidor estiver ligado"); // servidor sem token próprio
    expect(sys.linkOf("Heroi")).toBe("43024221");
    const msg = sys.workMsg("painel_obra", "Heroi");
    expect(msg.link).toEqual({ nick: "Pedrão" });
    expect(msg.canLink).toBe(true);
    expect(msg.polling).toBe(false);
    const everything = JSON.stringify([...h.kv.values(), h.logs, h.results, h.feed, msg]);
    expect(everything).not.toContain("SEGREDO");
    expect(everything).not.toContain(TOKEN);
  });

  it("recusa e-mail de fora, workspace errado, erro do ClickUp e formato inválido (este sem chamar a API)", async () => {
    const h = linkHost();
    const auth = fakeAuth({
      pk_externo_0123456789: { id: "999", email: "fulano@mrs.com.br", teams: ["30950578"] },
      pk_outrows_0123456789: { id: "998", email: "x@embeddo.io", teams: ["111"] },
      pk_revogado_0123456789: "401",
      pk_semrede_0123456789: "erro",
    });
    const sys = new ClickUpSystem(h.host, null, null, auth);
    await link(sys, "s1", "A", "pk_externo_0123456789");
    await link(sys, "s2", "B", "pk_outrows_0123456789");
    await link(sys, "s3", "C", "pk_revogado_0123456789");
    await link(sys, "s4", "D", "pk_semrede_0123456789");
    expect(h.results.map((r) => r.ok)).toEqual([false, false, false, false]);
    expect(h.results.slice(0, 3).every((r) => r.text === LINK_REFUSED)).toBe(true);
    expect(h.results[3]!.text).toContain("Tente de novo");
    expect(sys.linkList()).toEqual([]);
    const before = auth.calls.length;
    for (const bad of ["", "abc", "pk_curto", "token pk_0123456789abc", `pk_${"x".repeat(200)}`, 42, null]) await link(sys, "s5", "E", bad);
    expect(auth.calls.length).toBe(before);
    expect(JSON.stringify([h.results, h.logs])).not.toContain("pk_");
  });

  it("limite de tentativas por personagem: 5 a cada 10 min, depois 'tente mais tarde'", async () => {
    const h = linkHost();
    const auth = fakeAuth({});
    const sys = new ClickUpSystem(h.host, null, null, auth);
    for (let i = 0; i < LINK_MAX_TRIES; i++) await link(sys, "s1", "Heroi", `pk_errado_${i}_0123456789`);
    expect(auth.calls.filter((c) => c === "me")).toHaveLength(LINK_MAX_TRIES);
    await link(sys, "s1", "Heroi", "pk_errado_x_0123456789");
    expect(h.results.at(-1)!.text).toBe("Muitas tentativas. Tente mais tarde.");
    expect(auth.calls.filter((c) => c === "me")).toHaveLength(LINK_MAX_TRIES);
    await link(sys, "s1", "Heroi", "pk_errado_y_0123456789", NOW + LINK_WINDOW_MS + 1);
    expect(auth.calls.filter((c) => c === "me")).toHaveLength(LINK_MAX_TRIES + 1);
  });

  it("desvincular, e o mesmo usuário em outro personagem tira o vínculo do anterior", async () => {
    const h = linkHost();
    const auth = fakeAuth({ [TOKEN]: { id: "43024221", email: "pedro@embeddo.io", teams: ["30950578"] } });
    const sys = new ClickUpSystem(h.host, null, null, auth);
    await link(sys, "s1", "Heroi", TOKEN);
    await link(sys, "s2", "Alt", TOKEN);
    expect(sys.linkOf("Heroi")).toBeUndefined();
    expect(sys.linkOf("Alt")).toBe("43024221");
    expect(h.results.at(-1)!.text).toContain("saiu de Heroi");
    expect(sys.workMsg("x", "Heroi").link).toBeNull();
    sys.unlink("s2", "Alt");
    expect(h.results.at(-1)).toEqual({ sid: "s2", ok: true, text: "ClickUp desvinculado." });
    expect(sys.linkList()).toEqual([]);
    sys.unlink("s2", "Alt");
    expect(h.results.at(-1)!.ok).toBe(false);
  });

  it("vínculo próprio conta só tarefas fechadas depois dele (mesma regra do /vincular)", async () => {
    const h = linkHost();
    const auth = fakeAuth({ [TOKEN]: { id: "43024221", email: "pedro@embeddo.io", teams: [CFG.teamId] } }); // workspace configurado no servidor
    const sys = new ClickUpSystem(h.host, fakeApi(), CFG, auth);
    await link(sys, "s1", "Heroi", TOKEN, NOW - 4.5 * H); // depois de w1 (-5 h), antes de w2 (-4 h) e w4 (-3 h)
    await cycle(sys);
    expect(h.credits).toEqual([["Heroi", 2]]);
    expect(sys.workMsg("x", "Heroi").polling).toBe(true);
  });
});
