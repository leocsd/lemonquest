// Endurecimento: comandos de dev, chat, isolamento de falhas, posição salva, tile livre, backups.
import { describe, expect, it, vi } from "vitest";
import { CollisionGrid, ExploredMask } from "@lemonquest/shared";
import { devCommandsEnabled, handleDevCommand, isDevAdmin } from "./devcommands.ts";
import { handleChat, sanitizeText } from "./chat.ts";
import { ErrorLog, runSteps } from "./safe.ts";
import { def, grid, openGrid, world } from "./testkit.ts";
import { isValidStart, nearestFreeTile, reachableFrom } from "../world/tiles.ts";
import { backupFileName, parseBackupName, selectBackupsToDelete } from "../persistence/backup.ts";

describe("comandos de dev", () => {
  const on = { LEMONQUEST_DEV_COMMANDS: "1", LEMONQUEST_ADMINS: "Leo, José da Silva", NODE_ENV: "development" };
  it("só com LEMONQUEST_DEV_COMMANDS=1, fora de produção e para admins", () => {
    expect(devCommandsEnabled({})).toBe(false);
    expect(devCommandsEnabled({ ...on, NODE_ENV: "production" })).toBe(false);
    expect(devCommandsEnabled(on)).toBe(true);
    expect(isDevAdmin("LEO", on)).toBe(true);
    expect(isDevAdmin("josé da silva", on)).toBe(true);
    expect(isDevAdmin("Ana", on)).toBe(false);
    expect(isDevAdmin("Leo", { ...on, LEMONQUEST_DEV_COMMANDS: "0" })).toBe(false);
  });

  it("não-admin: /level não é tratado (vira 'Comando desconhecido.' no chat)", () => {
    const p = { id: "a", name: "Ana", level: 1 } as any;
    const ctx = { inventory: {} as any, send: vi.fn(), teleport: vi.fn(), isWalkable: () => true, setMagicLevel: vi.fn(), env: on };
    expect(handleDevCommand(p, "/level 30", ctx)).toBe(false);
    expect(p.level).toBe(1);
    const admin = { id: "b", name: "Leo", level: 1, maxHp: 1, maxMana: 1 } as any;
    expect(handleDevCommand(admin, "/heal", ctx)).toBe(true);
  });
});

describe("chat", () => {
  const mk = () => {
    const sent: any[] = [];
    return { client: { sessionId: "c" + Math.random(), send: (t: string, m: unknown) => sent.push([t, m]) } as any, sent };
  };
  it("texto com '/' nunca vai para o chat; desconhecido → aviso", () => {
    const broadcast = vi.fn();
    const { client, sent } = mk();
    handleChat({ broadcast } as any, client, { name: "Ana" } as any, { text: "/level 30", channel: "global" }, { command: () => false });
    handleChat({ broadcast } as any, client, { name: "Ana" } as any, { text: "/level 30", channel: "global" });
    expect(broadcast).not.toHaveBeenCalled();
    expect(sent).toHaveLength(2);
    expect(sent[0][1]).toMatchObject({ text: "Comando desconhecido. Digite /ajuda para ver os comandos." });
  });
  it("remove caracteres de controle/formatação", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(sanitizeText("a‮b\nc​d\u0007")).toBe("abcd");
    const broadcast = vi.fn();
    const { client } = mk();
    handleChat({ broadcast } as any, client, { name: "Ana" } as any, { text: "oi\r\n[sistema] você morreu", channel: "global" });
    expect(broadcast.mock.calls[0]![1].text).toBe("oi[sistema] você morreu");
  });
});

describe("isolamento de falhas", () => {
  it("runSteps: um passo que lança não impede os outros; log 1×/10 s por chave", () => {
    let t = 0;
    const out = vi.fn();
    const log = new ErrorLog(10_000, () => t, out);
    const ok = vi.fn();
    const steps = [["ruim", () => { throw new Error("x"); }], ["bom", ok]] as const;
    expect(runSteps(steps, log)).toBe(1);
    runSteps(steps, log);
    expect(ok).toHaveBeenCalledTimes(2);
    expect(out).toHaveBeenCalledTimes(1);
    t = 10_001;
    runSteps(steps, log);
    expect(out).toHaveBeenCalledTimes(2);
    expect(String(out.mock.calls[1]![0])).toMatch(/suprimidos/);
  });

  it("monstro cuja IA lança é removido; os outros continuam", () => {
    const out = vi.fn();
    const w = world({
      grid: openGrid(20, 20), spawns: [{ defId: "dummy", x: 5, y: 5, count: 2, radius: 2 }],
      defs: () => def(), errors: new ErrorLog(10_000, Date.now, out),
    });
    w.mm.spawnAll();
    expect(w.mm.size).toBe(2);
    const [bad] = [...w.mm.all()];
    Object.defineProperty(bad!, "mode", { get() { throw new Error("estado corrompido"); }, configurable: true });
    w.run(200);
    expect(w.mm.size).toBe(1);
    expect(out).toHaveBeenCalled();
  });
});

describe("posição salva / tiles", () => {
  const g = grid([
    "......#...",
    "......#...",
    "......#...",
    "......#...",
  ]);
  const portals = new Map([["1,1", { x: 8, y: 2 }]]);
  const reach = reachableFrom(g, { x: 0, y: 0 }, (x, y) => portals.get(`${x},${y}`));
  it("BFS a partir do spawn, atravessando portais", () => {
    expect(reach[0]).toBe(1);
    expect(reach[2 * 10 + 8]).toBe(1); // do outro lado da parede, via portal
    const noPortal = reachableFrom(g, { x: 0, y: 0 }, () => undefined);
    expect(noPortal[2 * 10 + 8]).toBe(0);
  });
  it("vários pontos de partida (templo + chegadas das viagens de NPC, ciclo 22): o outro lado conta sem portal", () => {
    const both = reachableFrom(g, [{ x: 0, y: 0 }, { x: 8, y: 3 }], () => undefined);
    expect(both[0]).toBe(1);
    expect(both[2 * 10 + 8]).toBe(1);
    expect(both[0 * 10 + 6]).toBe(0); // a parede continua parede
  });
  it("isValidStart: parede, fora do mapa, portal, NPC, monstro, inalcançável → false", () => {
    const base = { grid: g, reachable: reach, isPortal: (x: number, y: number) => x === 1 && y === 1, isNpc: (x: number, y: number) => x === 2 && y === 2, isMonster: (x: number, y: number) => x === 3 && y === 3 };
    expect(isValidStart(4, 0, base)).toBe(true);
    expect(isValidStart(6, 0, base)).toBe(false);
    expect(isValidStart(null, 0, base)).toBe(false);
    expect(isValidStart(99, 0, base)).toBe(false);
    expect(isValidStart(1, 1, base)).toBe(false);
    expect(isValidStart(2, 2, base)).toBe(false);
    expect(isValidStart(3, 3, base)).toBe(false);
    expect(isValidStart(8, 2, { ...base, reachable: reachableFrom(g, { x: 0, y: 0 }, () => undefined) })).toBe(false);
  });
  it("nearestFreeTile: o próprio tile, senão o vizinho livre mais próximo (ortogonal antes de diagonal)", () => {
    expect(nearestFreeTile(5, 5, () => true)).toEqual({ x: 5, y: 5 });
    expect(nearestFreeTile(5, 5, (x, y) => !(x === 5 && y === 5))).toEqual({ x: 5, y: 4 });
    expect(nearestFreeTile(5, 5, (x, y) => Math.abs(x - 5) === 1 && Math.abs(y - 5) === 1)).toEqual({ x: 4, y: 4 });
    expect(nearestFreeTile(5, 5, () => false, 3)).toBeNull();
  });
});

describe("máscara de exploração", () => {
  it("mesma largura e máscara salva menor → copia o prefixo; mapa mais largo → remapeia; mais estreito → descarta", () => {
    const old = new ExploredMask(16, 8);
    old.reveal(3, 3, 1);
    const grown = ExploredMask.fromBase64(16, 12, old.toBase64(), 16);
    expect(grown.bits.length).toBe(24);
    expect(grown.has(3, 3)).toBe(true);
    expect(ExploredMask.fromBase64(16, 12, old.toBase64()).has(3, 3)).toBe(true); // legado sem largura salva
    const wider = ExploredMask.fromBase64(20, 12, old.toBase64(), 16);
    expect(wider.has(3, 3)).toBe(true);
    expect(wider.has(4, 4)).toBe(true);
    expect(ExploredMask.fromBase64(12, 12, old.toBase64(), 16).has(3, 3)).toBe(false);
    expect(ExploredMask.fromBase64(8, 8, old.toBase64()).bits.length).toBe(8); // maior que o mapa → zera
  });
});

describe("rotação de backups", () => {
  const at = (y: number, mo: number, d: number, h: number) => new Date(y, mo - 1, d, h);
  it("nome ↔ data", () => {
    expect(backupFileName(at(2026, 3, 7, 9))).toBe("lemonquest-20260307-09.db");
    expect(parseBackupName("lemonquest-20260307-09.db")?.getTime()).toBe(at(2026, 3, 7, 9).getTime());
    expect(parseBackupName("outro.db")).toBeNull();
  });
  it("mantém 48 h de horários + 1 por dia por 14 dias; ignora arquivos alheios", () => {
    const now = at(2026, 10, 20, 12);
    const names: string[] = [];
    for (let h = 0; h < 24 * 20; h++) names.push(backupFileName(new Date(now.getTime() - h * 3600_000)));
    names.push("notas.txt");
    const del = new Set(selectBackupsToDelete(names, now));
    const kept = names.filter((n) => !del.has(n));
    expect(del.has("notas.txt")).toBe(false);
    // 48 horários (h = 0..47)
    for (let h = 0; h < 48; h++) expect(kept).toContain(backupFileName(new Date(now.getTime() - h * 3600_000)));
    // Dias mais antigos: só o último backup do dia (23h).
    expect(kept).toContain("lemonquest-20261016-23.db");
    expect(kept).not.toContain("lemonquest-20261016-22.db");
    // Mais de 14 dias → apagado.
    expect(kept.some((n) => n.startsWith("lemonquest-202610050"))).toBe(false);
    expect(kept.filter((n) => n.endsWith(".db")).length).toBeLessThanOrEqual(48 + 14);
  });
});
