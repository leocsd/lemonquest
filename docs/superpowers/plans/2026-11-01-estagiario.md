# Estagiário — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bot de caça dentro do jogo (cura, ataque, rota de caça gravada, alarmes, turno de 2 h) executado pelo
servidor, com um acompanhante visível ("Estagiário de <nome>") enquanto a rota roda.

**Architecture:** regras puras e tipos em `packages/shared/src/estagiario.ts`; um sistema novo
`packages/server/src/systems/estagiario.ts` no tick do `WorldRoom` que decide e age pelas APIs dos sistemas existentes
(magias, poções, luta, movimento, invocações); o cliente só configura (janela "Estagiário") e mostra (🤖, alarmes).
Spec: `docs/superpowers/specs/2026-11-01-estagiario-design.md` — leia antes de qualquer tarefa.

**Tech Stack:** TypeScript estrito, Node 24, Colyseus 0.18, vitest, Preact (HUD), Phaser 3 (mundo), Playwright (E2E).

## Global Constraints

- Tudo em português: código (nomes novos), comentários (explicam o porquê), UI, docs e commits (uma linha descritiva,
  sem prefixo, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Regra de jogo nova = dado/fórmula no `shared` + teste unitário ao lado (`x.ts` + `x.test.ts`).
- Mensagem nova do cliente: tipo em `shared/src/messages.ts`, validação no servidor e limite em `MESSAGE_LIMITS`
  (`WorldRoom.ts`); sistema novo entra nas listas do tick (`this.steps`), `cleanupSession` e `onReconnect`.
- **Nunca** aponte servidor, teste ou script para `data/`, `docker-data/` ou `docker-data-dev/`. Nunca commite `*.db*`.
- Não refatorar `WorldScene.ts` nem `WorldRoom.ts`: só acrescentar o necessário (fiação, poucas linhas).
- Não rodar E2E localmente (o CI roda); validar com `npm run typecheck` e `npx vitest run <arquivos>`; a suíte
  inteira (`npm test`) no fim de cada tarefa que mexe no servidor. Unitários e build não rodam junto com E2E.
- Valores fixos da spec: turno máximo **7.200.000 ms** (2 h); recarga **1/12** do tempo com a rota desligada
  (5 min por hora); busca de alvo **12 tiles** (= `AUTO_SEEK_DIST`); até **6** regras de cura e **6** de ataque; até
  **5** rotas, **200** pontos por rota, nome até **20** caracteres; ponto a cada **6** tiles andados; ponto travado
  **10 s** → pula; pausa manual **10 s**; alarme de poção abaixo de **10**; aviso de turno a **5 min**; vida do alarme
  padrão **25%**; reserva de mana **0..90%**.
- O Estagiário (acompanhante) **não ataca, não toma dano, não atrai monstro, nunca é alvo**, ocupa 1 tile (o dono
  passa por ele), não entra na battle list, segue o dono a 1–2 tiles e reaparece ao lado dele se ficar a mais de 6.
- Alarmes só disparam com a **rota rodando** (o Estagiário trabalhando); "Você morreu" sempre que a rota estava ligada.
- Ao reconectar, nada religa sozinho. Desconexão (drop ou leave) desliga cura, ataque e rota.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `packages/shared/src/estagiario.ts` (novo) | tipos, constantes, `sanitizeEstagiario`, `estagiarioPadrao`, turno, decisões puras, gravação de rota |
| `packages/shared/src/estagiario.test.ts` (novo) | testes das regras puras |
| `packages/shared/src/index.ts` | reexporta `./estagiario.ts` |
| `packages/shared/src/messages.ts` | C2S/S2C e tipos das mensagens novas |
| `packages/shared/src/types.ts` | `PlayerView.bot?`; `MonsterDef.companion?` (ver Task 2) |
| `packages/shared/src/data/monsters.ts` | def `estagiario` (acompanhante) |
| `packages/shared/src/online.ts` | `OnlineEntry.bot?` |
| `packages/server/src/state.ts` | `@type("boolean") bot` |
| `packages/server/src/persistence/types.ts` | `CharacterData.estagiario?` |
| `packages/server/src/systems/spells.ts` | `ready()` público e `cast(..., { silent })` |
| `packages/server/src/systems/inventory.ts` | `potionReady`, `usePotion(..., { silent })`, `countPotions` |
| `packages/server/src/systems/fightmode.ts` | `nearestTarget(p, reach)` público; chase forçado por id |
| `packages/server/src/systems/monsters.ts` / `monsterAbilities.ts` / `combat.ts` | acompanhante imune e nunca alvo |
| `packages/server/src/systems/summons.ts` | `spawnCompanion`/`despawnCompanion`, IA do acompanhante |
| `packages/server/src/systems/movement.ts` | `setExtraBlocker` recebe o id de quem anda |
| `packages/server/src/systems/social.ts` / `loot.ts` | ganchos `onWhisper` / `onBackpackFull` |
| `packages/server/src/systems/estagiario.ts` (novo) + `.test.ts` | o sistema |
| `packages/server/src/rooms/WorldRoom.ts` (+ `.test.ts`) | fiação, mensagens, persistência, ganchos |
| `packages/client/src/ui/estagiario/*` (novo) | store, bind, janela, alarmes |
| `packages/client/src/ui/hud/Sidebar.tsx`, `App.tsx`/`Hud.tsx`, `world.ts`, `battle.ts` | botão, montagem, `bot`, 🤖, filtro |
| `packages/client/src/scenes/WorldScene.ts` | 🤖 no nome; nome "Estagiário de X"; acompanhante fora da battle list |
| `packages/client/src/ui/social/OnlinePanel.tsx` | 🤖 no painel Online |
| `e2e/estagiario.spec.ts` (novo) | cenário ponta a ponta |
| Docs | `CHANGELOG.md`, `docs/GAME_ROADMAP.md`, `docs/TEST_PLAN.md`, `shared/src/data/news.ts`, `README.md` |

---

### Task 1: Regras puras do Estagiário (`shared/estagiario.ts`)

**Files:**
- Create: `packages/shared/src/estagiario.ts`
- Create: `packages/shared/src/estagiario.test.ts`
- Modify: `packages/shared/src/index.ts` (acrescentar `export * from "./estagiario.ts";`)

**Interfaces:**
- Consumes: `spellDef`, `castableBy`, `SpellGroup` (`./data/spellFamilies.ts`, `./data/spells.ts`), `Vocation` (`./types.ts`),
  `QuickPotionKind` (`./itemRules.ts`).
- Produces (usado pelas Tasks 2–7, nomes exatos):
  - tipos `RegraCura`, `CuraAcao`, `RegraAtaque`, `PontoRota`, `RotaCaca`, `AlarmeTipo`, `EstagiarioConfig`,
    `TurnoEstado`, `Gravacao`;
  - constantes `REGRAS_MAX`, `ROTAS_MAX`, `PONTOS_MAX`, `NOME_ROTA_MAX`, `TURNO_MAX_MS`, `TURNO_RECARGA`,
    `PAUSA_MANUAL_MS`, `PONTO_TRAVADO_MS`, `GRAVAR_A_CADA`, `POCAO_ALARME_MIN`, `TURNO_AVISO_MS`, `BUSCA_TILES`,
    `ALARMES` (lista ordenada de `AlarmeTipo`);
  - `estagiarioPadrao(v: Vocation): EstagiarioConfig`;
  - `sanitizeEstagiario(raw: unknown, v: Vocation, groups?: readonly SpellGroup[]): EstagiarioConfig`;
  - `avancarTurno(t: TurnoEstado | undefined, now: number, rodando: boolean): TurnoEstado`;
  - `escolherCura(c: { hp: number; maxHp: number; mana: number; maxMana: number }, regras: readonly RegraCura[], pronto: (a: CuraAcao) => boolean): CuraAcao | null`;
  - `escolherAtaque(regras: readonly RegraAtaque[], bichosEm: (raio: number) => number, manaPct: number, reservaMana: number, resolver: (magia: string) => string | null): string | null`;
  - `indiceMaisProximo(pontos: readonly PontoRota[], pos: { x: number; y: number }): number`;
  - `novaGravacao(pos: { x: number; y: number }): Gravacao`, `gravarPasso(g: Gravacao, de: {x,y}, para: {x,y}): Gravacao`,
    `fecharGravacao(g: Gravacao, pos: {x,y}): PontoRota[]`;
  - `alarmeLigado(c: EstagiarioConfig, t: AlarmeTipo): boolean`.

- [ ] **Step 1: Escrever os testes**

`packages/shared/src/estagiario.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ALARMES, BUSCA_TILES, NOME_ROTA_MAX, PONTOS_MAX, REGRAS_MAX, ROTAS_MAX, TURNO_MAX_MS,
  alarmeLigado, avancarTurno, escolherAtaque, escolherCura, estagiarioPadrao, fecharGravacao, gravarPasso,
  indiceMaisProximo, novaGravacao, sanitizeEstagiario, type RegraCura,
} from "./estagiario.ts";

describe("estagiário: configuração", () => {
  it("padrão: poção de vida < 35%, cura da vocação < 70%, poção de mana < 40%; sem ataque e sem rotas", () => {
    const c = estagiarioPadrao("knight");
    expect(c.cura).toEqual([
      { quando: "vida", abaixoDe: 35, acao: { pocao: "hp" } },
      { quando: "vida", abaixoDe: 70, acao: { magia: "light_heal" } },
      { quando: "mana", abaixoDe: 40, acao: { pocao: "mana" } },
    ]);
    expect(estagiarioPadrao("fairy").cura[1]!.acao).toEqual({ magia: "fairy_kiss" });
    expect([c.ataque, c.rotas, c.reservaMana, c.vidaAlarme]).toEqual([[], [], 30, 25]);
    for (const a of ALARMES) expect(alarmeLigado(c, a), a).toBe(true);
  });

  it("sanitiza: limites, magias de outra vocação, curas que não curam, ataques que curam, lixo", () => {
    const raw = {
      cura: [
        ...Array.from({ length: 9 }, () => ({ quando: "vida", abaixoDe: 50, acao: { pocao: "hp" } })),
      ],
      ataque: [
        { minBichos: 3, raio: 2, magia: "spin_strike" },
        { minBichos: 99, raio: 9, magia: "fam:knight:area" },
        { minBichos: 1, raio: 1, magia: "fireball" }, // de feiticeiro: sai
        { minBichos: 1, raio: 1, magia: "light_heal" }, // cura não é ataque: sai
      ],
      reservaMana: 500,
      vidaAlarme: 0,
      rotas: [{ nome: "  Cave   dos Ratos  ", pontos: [{ x: 1, y: 2 }, { x: -1, y: 2 }, { x: 3.5, y: 2 }, { x: 4, y: 5, portal: true }] }],
      alarmes: { jogador: false, morte: false, inventado: false },
    };
    const c = sanitizeEstagiario(raw, "knight");
    expect(c.cura).toHaveLength(REGRAS_MAX);
    expect(c.ataque).toEqual([{ minBichos: 3, raio: 2, magia: "spin_strike" }, { minBichos: 8, raio: 4, magia: "fam:knight:area" }]);
    expect([c.reservaMana, c.vidaAlarme]).toEqual([90, 1]);
    expect(c.rotas).toEqual([{ nome: "Cave dos Ratos", pontos: [{ x: 1, y: 2 }, { x: 4, y: 5, portal: true }] }]);
    expect(alarmeLigado(c, "jogador")).toBe(false);
    expect(alarmeLigado(c, "morte")).toBe(true); // não desliga
    expect(sanitizeEstagiario(null, "druid")).toEqual(estagiarioPadrao("druid"));
    expect(sanitizeEstagiario({ cura: [{ quando: "vida", abaixoDe: 50, acao: { magia: "wound_cleansing" } }] }, "sorcerer").cura).toEqual([]);
  });

  it("rotas: até ROTAS_MAX, até PONTOS_MAX pontos, nome até NOME_ROTA_MAX, nomes repetidos e rota vazia saem", () => {
    const pts = Array.from({ length: PONTOS_MAX + 50 }, (_, i) => ({ x: i, y: 1 }));
    const rotas = Array.from({ length: ROTAS_MAX + 2 }, (_, i) => ({ nome: `Rota ${i}`, pontos: pts }));
    rotas.push({ nome: "Rota 0", pontos: pts }, { nome: "Vazia", pontos: [] });
    const c = sanitizeEstagiario({ rotas: [{ nome: "x".repeat(40), pontos: pts }, ...rotas] }, "paladin");
    expect(c.rotas).toHaveLength(ROTAS_MAX);
    expect(c.rotas[0]!.nome).toHaveLength(NOME_ROTA_MAX);
    expect(c.rotas[0]!.pontos).toHaveLength(PONTOS_MAX);
    expect(new Set(c.rotas.map((r) => r.nome)).size).toBe(ROTAS_MAX);
  });
});

describe("estagiário: turno", () => {
  it("começa cheio, gasta em tempo real rodando, recarrega 1/12 parado, nunca passa do teto nem fica negativo", () => {
    const t0 = avancarTurno(undefined, 1000, false);
    expect(t0).toEqual({ ms: TURNO_MAX_MS, em: 1000 });
    const t1 = avancarTurno(t0, 1000 + 3_600_000, true); // 1 h rodando
    expect(t1.ms).toBe(TURNO_MAX_MS - 3_600_000);
    const t2 = avancarTurno(t1, t1.em + 12 * 60_000, false); // 12 min parado → +1 min
    expect(t2.ms).toBe(TURNO_MAX_MS - 3_600_000 + 60_000);
    expect(avancarTurno(t2, t2.em + 10 * 3_600_000, true).ms).toBe(0);
    expect(avancarTurno(t2, t2.em + 100 * 3_600_000, false).ms).toBe(TURNO_MAX_MS);
    expect(avancarTurno(t2, t2.em - 5000, true)).toEqual({ ms: t2.ms, em: t2.em - 5000 }); // relógio voltou: nada muda
  });
});

describe("estagiário: decisões", () => {
  const regras: RegraCura[] = [
    { quando: "vida", abaixoDe: 35, acao: { pocao: "hp" } },
    { quando: "vida", abaixoDe: 70, acao: { magia: "light_heal" } },
    { quando: "mana", abaixoDe: 40, acao: { pocao: "mana" } },
  ];
  const c = (hp: number, mana: number) => ({ hp, maxHp: 100, mana, maxMana: 100 });

  it("cura: a primeira regra que vale e está pronta; ninguém pronto = nada", () => {
    expect(escolherCura(c(30, 100), regras, () => true)).toEqual({ pocao: "hp" });
    expect(escolherCura(c(30, 100), regras, (a) => !("pocao" in a))).toEqual({ magia: "light_heal" });
    expect(escolherCura(c(80, 10), regras, () => true)).toEqual({ pocao: "mana" });
    expect(escolherCura(c(80, 90), regras, () => true)).toBeNull();
    expect(escolherCura(c(30, 10), regras, () => false)).toBeNull();
    expect(escolherCura({ hp: 0, maxHp: 0, mana: 0, maxMana: 0 }, regras, () => true)).toBeNull(); // sem máximo: nada
  });

  it("ataque: respeita a reserva de mana, conta bichos pelo raio e usa o que o resolvedor devolver", () => {
    const at = [{ minBichos: 3, raio: 2, magia: "fam:knight:area" }, { minBichos: 1, raio: 1, magia: "brutal_strike" }];
    const bichos = (n2: number, n1: number) => (r: number) => (r >= 2 ? n2 : n1);
    const resolve = (m: string) => (m === "fam:knight:area" ? "whirlwind" : m);
    expect(escolherAtaque(at, bichos(4, 1), 80, 30, resolve)).toBe("whirlwind");
    expect(escolherAtaque(at, bichos(2, 1), 80, 30, resolve)).toBe("brutal_strike");
    expect(escolherAtaque(at, bichos(4, 1), 20, 30, resolve)).toBeNull(); // abaixo da reserva
    expect(escolherAtaque(at, bichos(4, 1), 80, 30, () => null)).toBeNull(); // nada pronto
    expect(escolherAtaque(at, bichos(0, 0), 80, 30, resolve)).toBeNull();
  });

  it("rota: retoma pelo ponto mais próximo (Chebyshev; empate = o primeiro)", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(indiceMaisProximo(pts, { x: 9, y: 2 })).toBe(1);
    expect(indiceMaisProximo(pts, { x: 5, y: 5 })).toBe(0);
    expect(indiceMaisProximo([], { x: 1, y: 1 })).toBe(-1);
    expect(BUSCA_TILES).toBe(12);
  });
});

describe("estagiário: gravação de rota", () => {
  it("marca o início, as curvas, um ponto a cada 6 tiles retos, portais (tile pisado + destino) e o fim", () => {
    let g = novaGravacao({ x: 0, y: 0 });
    for (let x = 0; x < 8; x++) g = gravarPasso(g, { x, y: 0 }, { x: x + 1, y: 0 }); // 8 passos para leste
    for (let y = 0; y < 2; y++) g = gravarPasso(g, { x: 8, y }, { x: 8, y: y + 1 }); // curva para o sul
    g = gravarPasso(g, { x: 8, y: 2 }, { x: 50, y: 70 }); // pisou num portal em (8,2)
    g = gravarPasso(g, { x: 50, y: 70 }, { x: 50, y: 70 }); // parado: nada
    g = gravarPasso(g, { x: 50, y: 70 }, { x: 51, y: 70 });
    expect(fecharGravacao(g, { x: 51, y: 70 })).toEqual([
      { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 2, portal: true }, { x: 50, y: 70 }, { x: 51, y: 70 },
    ]);
  });

  it("para de crescer em PONTOS_MAX", () => {
    let g = novaGravacao({ x: 0, y: 0 });
    for (let i = 0; i < PONTOS_MAX * 2; i++) g = gravarPasso(g, { x: i, y: i % 2 }, { x: i + 1, y: (i + 1) % 2 });
    expect(fecharGravacao(g, { x: 0, y: 0 }).length).toBeLessThanOrEqual(PONTOS_MAX);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/shared/src/estagiario.test.ts`
Expected: FAIL (módulo `./estagiario.ts` não existe).

- [ ] **Step 3: Implementar**

`packages/shared/src/estagiario.ts`:

```ts
// Estagiário (2026-11-01, spec docs/superpowers/specs/2026-11-01-estagiario-design.md): bot de caça do próprio jogo.
// Aqui só as regras puras (o servidor decide e age em server/systems/estagiario.ts; o cliente só configura).
import { castableBy, type SpellGroup } from "./data/spellFamilies.ts";
import { spellDef } from "./data/spells.ts";
import type { QuickPotionKind } from "./itemRules.ts";
import type { Vocation } from "./types.ts";

export type CuraAcao = { magia: string } | { pocao: QuickPotionKind };
export interface RegraCura { quando: "vida" | "mana"; abaixoDe: number; acao: CuraAcao }
/** Conta os monstros selvagens a até `raio` tiles; com `minBichos` ou mais, conjura `magia` (magia, família ou grupo). */
export interface RegraAtaque { minBichos: number; raio: number; magia: string }
/** `portal`: o tile do portal pisado na gravação (a rota anda até ele para atravessar de novo). */
export interface PontoRota { x: number; y: number; portal?: boolean }
export interface RotaCaca { nome: string; pontos: PontoRota[] }
export type AlarmeTipo = "pocao" | "vidaBaixa" | "jogador" | "atacado" | "privada" | "turno" | "mochila" | "morte";
export interface EstagiarioConfig {
  cura: RegraCura[];
  ataque: RegraAtaque[];
  /** Abaixo desta % de mana não conjura magia de ataque (sobra para a cura). */
  reservaMana: number;
  rotas: RotaCaca[];
  /** Alarmes desligados pelo jogador (ausente/true = ligado). "morte" não desliga. */
  alarmes: Partial<Record<AlarmeTipo, boolean>>;
  /** % de vida do alarme "vidaBaixa". */
  vidaAlarme: number;
}
/** Turno restante (ms) e o instante da última conta; a recarga é calculada ao ler (`avancarTurno`). */
export interface TurnoEstado { ms: number; em: number }
export interface Gravacao { pontos: PontoRota[]; dir: string | null; desdeUltimo: number }

export const REGRAS_MAX = 6;
export const ROTAS_MAX = 5;
export const PONTOS_MAX = 200;
export const NOME_ROTA_MAX = 20;
export const TURNO_MAX_MS = 2 * 3_600_000;
/** Com a rota desligada, cada ms parado devolve 1/12 ms de turno (5 min por hora; vazio → cheio em 24 h). */
export const TURNO_RECARGA = 1 / 12;
export const PAUSA_MANUAL_MS = 10_000;
export const PONTO_TRAVADO_MS = 10_000;
export const GRAVAR_A_CADA = 6;
export const POCAO_ALARME_MIN = 10;
export const TURNO_AVISO_MS = 5 * 60_000;
/** Alcance de busca de alvo (= AUTO_SEEK_DIST do ataque automático). */
export const BUSCA_TILES = 12;
export const ALARMES: readonly AlarmeTipo[] = ["pocao", "vidaBaixa", "jogador", "atacado", "privada", "turno", "mochila", "morte"];

const int = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const cleanNome = (raw: unknown): string =>
  typeof raw === "string" ? raw.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, NOME_ROTA_MAX).trim() : "";

const curaDaVocacao = (v: Vocation): string => (v === "fairy" ? "fairy_kiss" : "light_heal");

export function estagiarioPadrao(v: Vocation): EstagiarioConfig {
  return {
    cura: [
      { quando: "vida", abaixoDe: 35, acao: { pocao: "hp" } },
      { quando: "vida", abaixoDe: 70, acao: { magia: curaDaVocacao(v) } },
      { quando: "mana", abaixoDe: 40, acao: { pocao: "mana" } },
    ],
    ataque: [],
    reservaMana: 30,
    rotas: [],
    alarmes: {},
    vidaAlarme: 25,
  };
}

function regraCura(raw: unknown, v: Vocation): RegraCura | null {
  const r = obj(raw);
  if (!r || (r.quando !== "vida" && r.quando !== "mana")) return null;
  const a = obj(r.acao);
  if (!a) return null;
  let acao: CuraAcao | null = null;
  if (a.pocao === "hp" || a.pocao === "mana") acao = { pocao: a.pocao };
  else if (typeof a.magia === "string") {
    const s = spellDef(a.magia);
    if (s?.heal && s.vocations.includes(v)) acao = { magia: s.id };
  }
  return acao ? { quando: r.quando, abaixoDe: int(r.abaixoDe, 1, 99, 50), acao } : null;
}

function regraAtaque(raw: unknown, v: Vocation, groups: readonly SpellGroup[]): RegraAtaque | null {
  const r = obj(raw);
  if (!r || typeof r.magia !== "string" || !castableBy(r.magia, v, groups)) return null;
  const s = spellDef(r.magia);
  if (s && (!s.damage || s.heal)) return null; // magia solta: só de dano (família/grupo já são de ataque)
  return { minBichos: int(r.minBichos, 1, 8, 1), raio: int(r.raio, 1, 4, 1), magia: r.magia };
}

function rota(raw: unknown): RotaCaca | null {
  const r = obj(raw);
  const nome = cleanNome(r?.nome);
  if (!r || !nome || !Array.isArray(r.pontos)) return null;
  const pontos: PontoRota[] = [];
  for (const p of r.pontos.slice(0, PONTOS_MAX * 2)) {
    if (pontos.length >= PONTOS_MAX) break;
    const o = obj(p);
    if (!o || !Number.isInteger(o.x) || !Number.isInteger(o.y) || (o.x as number) < 0 || (o.y as number) < 0) continue;
    pontos.push(o.portal === true ? { x: o.x as number, y: o.y as number, portal: true } : { x: o.x as number, y: o.y as number });
  }
  return pontos.length ? { nome, pontos } : null;
}

export function sanitizeEstagiario(raw: unknown, v: Vocation, groups: readonly SpellGroup[] = []): EstagiarioConfig {
  const r = obj(raw);
  if (!r) return estagiarioPadrao(v);
  const list = <T>(x: unknown, f: (e: unknown) => T | null, max: number): T[] => {
    const out: T[] = [];
    if (!Array.isArray(x)) return out;
    for (const e of x.slice(0, max * 4)) { if (out.length >= max) break; const k = f(e); if (k) out.push(k); }
    return out;
  };
  const rotas: RotaCaca[] = [];
  for (const e of Array.isArray(r.rotas) ? r.rotas.slice(0, ROTAS_MAX * 4) : []) {
    if (rotas.length >= ROTAS_MAX) break;
    const k = rota(e);
    if (k && !rotas.some((x) => x.nome.toLowerCase() === k.nome.toLowerCase())) rotas.push(k);
  }
  const alarmes: Partial<Record<AlarmeTipo, boolean>> = {};
  const a = obj(r.alarmes);
  if (a) for (const t of ALARMES) if (t !== "morte" && a[t] === false) alarmes[t] = false;
  return {
    cura: Array.isArray(r.cura) ? list(r.cura, (e) => regraCura(e, v), REGRAS_MAX) : estagiarioPadrao(v).cura,
    ataque: list(r.ataque, (e) => regraAtaque(e, v, groups), REGRAS_MAX),
    reservaMana: int(r.reservaMana, 0, 90, 30),
    rotas,
    alarmes,
    vidaAlarme: int(r.vidaAlarme, 1, 99, 25),
  };
}

export const alarmeLigado = (c: EstagiarioConfig, t: AlarmeTipo): boolean => t === "morte" || c.alarmes[t] !== false;

export function avancarTurno(t: TurnoEstado | undefined, now: number, rodando: boolean): TurnoEstado {
  if (!t || !Number.isFinite(t.ms) || !Number.isFinite(t.em)) return { ms: TURNO_MAX_MS, em: now };
  const dt = Math.max(0, now - t.em);
  const ms = rodando ? Math.max(0, t.ms - dt) : Math.min(TURNO_MAX_MS, t.ms + dt * TURNO_RECARGA);
  return { ms: Math.round(ms), em: now };
}

export function escolherCura(
  c: { hp: number; maxHp: number; mana: number; maxMana: number }, regras: readonly RegraCura[], pronto: (a: CuraAcao) => boolean,
): CuraAcao | null {
  for (const r of regras) {
    const [cur, max] = r.quando === "vida" ? [c.hp, c.maxHp] : [c.mana, c.maxMana];
    if (max <= 0 || (cur / max) * 100 >= r.abaixoDe) continue;
    if (pronto(r.acao)) return r.acao;
  }
  return null;
}

export function escolherAtaque(
  regras: readonly RegraAtaque[], bichosEm: (raio: number) => number, manaPct: number, reservaMana: number,
  resolver: (magia: string) => string | null,
): string | null {
  if (manaPct < reservaMana) return null;
  for (const r of regras) {
    if (bichosEm(r.raio) < r.minBichos) continue;
    const id = resolver(r.magia);
    if (id) return id;
  }
  return null;
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function indiceMaisProximo(pontos: readonly PontoRota[], pos: { x: number; y: number }): number {
  let best = -1, bestD = Infinity;
  pontos.forEach((p, i) => { const d = cheb(p, pos); if (d < bestD) { best = i; bestD = d; } });
  return best;
}

export const novaGravacao = (pos: { x: number; y: number }): Gravacao => ({ pontos: [{ x: pos.x, y: pos.y }], dir: null, desdeUltimo: 0 });

/** Um passo do jogador durante a gravação (`de` → `para`, posições de ticks seguidos). */
export function gravarPasso(g: Gravacao, de: { x: number; y: number }, para: { x: number; y: number }): Gravacao {
  if (g.pontos.length >= PONTOS_MAX || (de.x === para.x && de.y === para.y)) return g;
  const pontos = [...g.pontos];
  const push = (p: PontoRota) => { if (pontos.length < PONTOS_MAX) pontos.push(p); };
  if (cheb(de, para) > 1) { // teleporte (portal): o tile pisado e o destino
    push({ x: de.x, y: de.y, portal: true });
    push({ x: para.x, y: para.y });
    return { pontos, dir: null, desdeUltimo: 0 };
  }
  const dir = `${Math.sign(para.x - de.x)},${Math.sign(para.y - de.y)}`;
  let desde = g.desdeUltimo;
  if (g.dir !== null && dir !== g.dir) { const last = pontos[pontos.length - 1]!; if (last.x !== de.x || last.y !== de.y) push({ x: de.x, y: de.y }); desde = 0; }
  desde++;
  if (desde >= GRAVAR_A_CADA) { push({ x: para.x, y: para.y }); desde = 0; }
  return { pontos, dir, desdeUltimo: desde };
}

export function fecharGravacao(g: Gravacao, pos: { x: number; y: number }): PontoRota[] {
  const last = g.pontos[g.pontos.length - 1];
  if (g.pontos.length < PONTOS_MAX && (!last || last.x !== pos.x || last.y !== pos.y)) return [...g.pontos, { x: pos.x, y: pos.y }];
  return [...g.pontos];
}
```

Observação para o teste de gravação: a curva em (8,0) entra quando o primeiro passo para o sul chega; o ponto a cada 6
tiles conta passos desde o último ponto (inclusive desde o início). Se o teste do Step 1 divergir só nessa contagem,
ajuste a implementação (não o teste) até bater: (0,0) início, (6,0) seis passos, (8,0) curva.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/shared/src/estagiario.test.ts` → PASS. Depois `npm run typecheck` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/estagiario.ts packages/shared/src/estagiario.test.ts packages/shared/src/index.ts
git commit -m "Estagiário: regras puras (configuração, turno, cura, ataque, gravação de rota) no shared"
```

---

### Task 2: Protocolo, estado sincronizado, persistência e o def do acompanhante

**Files:**
- Modify: `packages/shared/src/messages.ts` (C2S, S2C, tipos)
- Modify: `packages/shared/src/types.ts` (`PlayerView.bot?: boolean`; `MonsterDef.companion?: boolean` — o `MonsterDef`
  fica em `packages/shared/src/data/monsters.ts`: acrescente ali o campo opcional com JSDoc)
- Modify: `packages/shared/src/data/monsters.ts` (def `estagiario`)
- Modify: `packages/shared/src/online.ts` (`OnlineEntry.bot?: boolean`)
- Modify: `packages/server/src/state.ts` (`@type("boolean") bot = false;` ao lado de `auto`)
- Modify: `packages/server/src/persistence/types.ts` (`CharacterData.estagiario?`)
- Test: `packages/shared/src/data/monsters.test.ts` (ou o teste que itera os monstros; ver Step 3)

**Interfaces:**
- Consumes: tipos da Task 1.
- Produces:
  - `C2S.EstagiarioConfig = "estagiarioConfig"`, `C2S.EstagiarioToggle = "estagiarioToggle"`, `C2S.EstagiarioGravar = "estagiarioGravar"`;
  - `S2C.EstagiarioEstado = "estagiarioEstado"`, `S2C.EstagiarioAlarme = "estagiarioAlarme"`;
  - `interface EstagiarioConfigMsg { config: EstagiarioConfig }`;
  - `interface EstagiarioToggleMsg { cura?: boolean; ataque?: boolean; rota?: string | null }`;
  - `interface EstagiarioGravarMsg { acao: "iniciar" | "parar" | "descartar"; nome?: string }`;
  - `type EstagiarioPausa = "" | "manual" | "npc"`;
  - `interface EstagiarioEstadoMsg { config: EstagiarioConfig; cura: boolean; ataque: boolean; rota: string | null; pausa: EstagiarioPausa; gravando: boolean; pontosGravados: number; turnoMs: number }`;
  - `interface EstagiarioAlarmeMsg { tipo: AlarmeTipo; texto: string }`;
  - `CharacterData.estagiario?: { config?: EstagiarioConfig; turno?: TurnoEstado }` (cura/ataque/rota ligados NÃO são gravados: ao reconectar nada religa);
  - `MONSTERS.estagiario` com `companion: true`.

- [ ] **Step 1: Mensagens.** Em `messages.ts`, acrescente ao objeto `C2S` (com JSDoc de uma linha cada, no estilo do
  arquivo) as três chaves acima e ao `S2C` as duas; acrescente as interfaces acima perto de `SetLootFilterMsg`,
  importando `EstagiarioConfig` e `AlarmeTipo` de `./estagiario.ts`.

- [ ] **Step 2: Estado e persistência.**
  - `PlayerView` (shared/types.ts): `/** Rota do Estagiário rodando (🤖 no nome). */ bot?: boolean;`
  - `PlayerState` (server/state.ts): `@type("boolean") bot = false;` logo após `auto`.
  - `OnlineEntry` (shared/online.ts): `bot?: boolean;`
  - `CharacterData` (server/persistence/types.ts), junto de `lootFilter`:
    ```ts
    /** Estagiário: configuração e turno (o que está ligado não é gravado). Ausente = padrão e turno cheio. */
    estagiario?: { config?: EstagiarioConfig; turno?: TurnoEstado };
    ```

- [ ] **Step 3: Def do acompanhante.** Em `MonsterDef` (shared/data/monsters.ts) acrescente:
  ```ts
  /** Acompanhante (Estagiário): nunca é alvo, não toma dano, não ataca, não dá XP; fora da battle list e da wiki. */
  companion?: boolean;
  ```
  E o def, ao lado de `summoned_butterfly`:
  ```ts
  // Estagiário (2026-11-01): só acompanha o dono enquanto a rota de caça roda. Visual de um morador da vila.
  estagiario: {
    id: "estagiario", name: "Estagiário", level: 1, hp: 1, xp: 0, damage: [0, 0], damageKind: "physical", armor: 0,
    attackMs: 60_000, attackRange: 1, stepMs: 260, aggroRange: 0, fleeAtHpPct: 0, respawnMs: 0, gold: [0, 0], loot: [],
    companion: true,
    sprite: grid4("ninja/Actor/Character/Boy/SpriteSheet.png"),
  },
  ```
  Ajuste os campos obrigatórios ao que o tipo exigir (copie o formato de `summoned_butterfly`). Rode
  `npx vitest run packages/shared packages/server/src/systems/monsters.test.ts`; testes que iteram todos os monstros
  (curvas de XP/vida, loot, wiki em `tools/wiki`) e já pulam as invocações (`summoned_*`, `xp: 0`) devem pular também
  `companion` — acrescente a condição onde falhar, com um comentário. Confirme que
  `packages/client/public/.../ninja/Actor/Character/Boy/SpriteSheet.png` (ou o caminho que as sprites de NPC usam)
  existe; se não existir, use outro de `npcs.ts` (`C + "..."`).

- [ ] **Step 4: Verificar.** `npm run typecheck` e `npm test` → tudo verde.

- [ ] **Step 5: Commit** — `git commit -m "Estagiário: mensagens, PlayerState.bot, campo salvo no personagem e o def do acompanhante"`

---

### Task 3: Ganchos nos sistemas existentes (magias, poções, luta, acompanhante imune, bloqueio, alarmes)

**Files:**
- Modify: `packages/server/src/systems/spells.ts`, `inventory.ts`, `fightmode.ts`, `movement.ts`, `monsters.ts`,
  `monsterAbilities.ts`, `combat.ts`, `summons.ts`, `social.ts`, `loot.ts`
- Test: os `.test.ts` ao lado de cada um (acrescentar casos)

**Interfaces:**
- Produces (exatos):
  - `SpellSystem.ready(p: PlayerState, spellId: string, now?: number): boolean` — vocação, level, recarga própria,
    recarga global (se `s.global !== false`), mana (`spellMana`), vivo. Não olha alvo/alcance.
  - `SpellSystem.cast(p, spellId, targetId?, opts?: { silent?: boolean }): CastResultMsg` — com `silent`, **não** envia
    `S2C.CastResult` quando falha (no sucesso envia como sempre).
  - `InventorySystem.potionReady(p: PlayerState, now?: number): boolean` (a recarga única `potionCdUntil`).
  - `InventorySystem.usePotion(p: PlayerState, kind: QuickPotionKind, opts?: { silent?: boolean }): boolean` — mesma
    lógica de `onQuickPotion`; com `silent` não manda os avisos (sem poção / recarga); devolve se bebeu.
  - `InventorySystem.countPotions(p: PlayerState, kind: QuickPotionKind): number` — soma das pilhas da mochila com
    `potionAmount(def, kind) > 0`.
  - `FightModeSystem.nearestTarget(p: PlayerState, reach: number): string` — a mesma busca do `autoTarget` (selvagem,
    vivo, não invulnerável, fora da PZ, com LOS, mais próximo), "" se nada; `autoTarget` passa a usá-la.
  - `FightModeSystem.forceChase(id: string, on: boolean): void` — enquanto ligado, o tick persegue como se
    `p.chase === true`, sem mudar `p.chase` (não é gravado).
  - `MovementSystem.setExtraBlocker(fn: (x: number, y: number, moverId?: string) => boolean)` — `isOccupied` passa o id.
  - `MonsterManager.isCompanion(m: Monster): boolean` (`!!m.def.companion`) e `blocksPlayer(x, y, playerId): boolean`
    (monstro no tile, exceto o acompanhante cujo `ownerId === playerId`).
  - `SummonSystem.spawnCompanion(p: PlayerState, now?: number): Monster | null`, `despawnCompanion(ownerId: string): void`,
    `companionOf(ownerId: string): Monster | undefined`.
  - `SocialHost.onWhisper?(to: PlayerState, from: PlayerState): void` (chamado em `deliver` quando entrega um sussurro).
  - `LootOptions.onBackpackFull?(p: PlayerState): void` (chamado em `onKill` quando `fell + lost > 0` para aquele jogador).

- [ ] **Step 1: Testes que falham.** Acrescente:
  - `spells.test.ts`: `ready` falso em recarga própria e global, sem mana, de outra vocação, abaixo do level; verdadeiro
    pronto. `cast(..., { silent: true })` sem mana não grava nada em `sent` (o array de mensagens do kit); sem `silent`, grava.
  - `inventory.test.ts` (kit `invWorld` de `m4kit.ts`): `usePotion(p, "hp", { silent: true })` sem poção → `false` e
    nenhum Notice; com poção → `true`, consome 1; `potionReady` falso logo depois; `countPotions` soma pilhas.
  - `m4.test.ts`: `nearestTarget(p, 12)` acha o monstro a 12 e não a 13; `forceChase` faz andar até o alvo com
    `p.chase === false` e `p.chase` continua `false`.
  - `summons.test.ts` (ou `m4.test.ts`): `spawnCompanion` cria um monstro `estagiario` com `ownerId`; ele não é alvo de
    monstro (`validTarget` falso), não toma dano de `combat.damageMonster` nem de habilidade em área
    (`monsterAbilities.hitTiles`), não ataca o alvo do dono, segue o dono até ≤ 2 tiles, reaparece ao lado se o dono
    for teleportado para longe (> 6), não é removido por `summon()` (reconjurar o Lobo não apaga o acompanhante) e
    sai com `despawnCompanion` e com `despawnOwner`.
  - `movement.test.ts`: com `setExtraBlocker((x, y, id) => …)` o dono passa pelo tile do próprio acompanhante e outro
    jogador não.
  - `social.test.ts`/`loot.test.ts`: os ganchos são chamados uma vez no sussurro entregue e na mochila cheia.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run packages/server/src/systems/{spells,inventory,m4,summons,movement,social,loot}.test.ts`.

- [ ] **Step 3: Implementar** (cada item no arquivo indicado, com comentário do porquê):
  - `spells.ts`: extraia de `tryCast` as checagens de vocação/level/recarga/mana para `ready`; `cast` recebe `opts` e só
    chama `this.o.send(p.id, S2C.CastResult, res)` se `res.ok || !opts?.silent`.
  - `inventory.ts`: `usePotion` reaproveita o corpo de `onQuickPotion` (`pickQuickPotion(inv.backpack, kind, p.level,
    this.defs, p.vocation)` → `useAt`), com `warn` condicionado a `!silent`; `onQuickPotion` passa a chamar
    `usePotion(p, msg.kind)`. `useAt` precisa devolver se bebeu (`boolean`) e aceitar `silent`.
  - `fightmode.ts`: mova o laço de `autoTarget` para `nearestTarget(p, reach)`; `autoTarget` faz
    `const id = this.nearestTarget(p, reach); if (id) p.targetId = id;`. `forceChase` usa um `Set<string>`; no `tick`,
    troque `!p.chase` por `!(p.chase || this.forced.has(p.id))`; `removePlayer` limpa o set.
  - `movement.ts`: o tipo do blocker ganha `moverId?: string`; `isOccupied(bx, by, id)` chama `this.extra?.(bx, by, id)`.
  - `monsters.ts`: `isCompanion`, `blocksPlayer`; `validTarget(id)` devolve falso para acompanhante; `isMonsterAt`
    continua igual (monstros não entram no tile dele). Em `onDamaged`/`callForHelp`, ignore acompanhante.
  - `monsterAbilities.ts` (`hitTiles`): `if (other?.s.ownerId && !mm.isCompanion(other) && …)`.
  - `combat.ts`: em `monsterAttack` (ramo `isMonsterState(target)`) e `damageMonster`, retorne cedo se o alvo é
    acompanhante (`monsterDef(target.defId)?.companion`).
  - `summons.ts`: `spawnCompanion` usa `monsters.spawnSummon(monsterDef("estagiario")!, x, y, p.id, now)` num tile livre
    ao lado (`freeTilesAround(p.x, p.y, 1)`; sem tile livre → no próprio tile do dono); guarda num `Map<ownerId, id>`
    separado das invocações (`summon()` só remove as invocações de combate); `update(m, now)`: se `isCompanion(m)`,
    roda a IA de acompanhante — sem expirar, sem atacar; dono ausente/morto → `kill`; distância > 6 → teletransporta
    para um tile livre ao lado do dono; distância > 2 → anda um passo pelo caminho (`computePath`/`followPath`/
    `greedyStep`, como a invocação faz); senão fica parado. `despawnOwner` também remove o acompanhante.
  - `social.ts`: `SocialHost.onWhisper?.(target, p)` dentro de `deliver`, depois de entregar.
  - `loot.ts`: em `onKill`, para o jogador que ficou com `fell + lost > 0`, `this.o.onBackpackFull?.(p)`.
  - `WorldRoom.ts`: `movement.setExtraBlocker((x, y, id) => (id ? this.monsters.blocksPlayer(x, y, id) : this.monsters.isMonsterAt(x, y)) || this.npcs.isNpcAt(x, y))`.

- [ ] **Step 4: Verificar** — os testes do Step 2 passam; `npm run typecheck`; `npm test` (suíte inteira) verde.

- [ ] **Step 5: Commit** — `git commit -m "Estagiário: ganchos nos sistemas (magia e poção prontas e silenciosas, busca de alvo, chase forçado, acompanhante imune, sussurro e mochila cheia)"`

---

### Task 4: `EstagiarioSystem` — cura, ataque, turno, liga/desliga e fiação no `WorldRoom`

**Files:**
- Create: `packages/server/src/systems/estagiario.ts`, `packages/server/src/systems/estagiario.test.ts`
- Modify: `packages/server/src/rooms/WorldRoom.ts` (+ `WorldRoom.test.ts`)

**Interfaces:**
- Consumes: Task 1 (regras), Task 2 (mensagens, `PlayerState.bot`, `CharacterData.estagiario`), Task 3 (APIs).
- Produces:
  ```ts
  export interface EstagiarioOptions {
    spells: { ready(p: PlayerState, id: string, now?: number): boolean; cast(p: PlayerState, id: string, targetId?: string, opts?: { silent?: boolean }): { ok: boolean } };
    potions: { potionReady(p: PlayerState, now?: number): boolean; usePotion(p: PlayerState, kind: QuickPotionKind, opts?: { silent?: boolean }): boolean; countPotions(p: PlayerState, kind: QuickPotionKind): number };
    fight: { nearestTarget(p: PlayerState, reach: number): string; forceChase(id: string, on: boolean): void; resume(id: string): void };
    monsters: Pick<MonsterManager, "wild" | "all" | "inPz">;
    movement: Pick<MovementSystem, "isIdle" | "pathFor" | "follow">;
    companions: { spawnCompanion(p: PlayerState, now?: number): unknown; despawnCompanion(ownerId: string): void };
    npcOpen: (id: string) => boolean;
    spellGroups: (p: PlayerState) => readonly SpellGroup[];
    players: () => Iterable<PlayerState>;
    send: (sessionId: string, type: string, msg: unknown) => void;
    now?: () => number;
  }
  export class EstagiarioSystem {
    constructor(o: EstagiarioOptions);
    load(p: PlayerState, saved: CharacterData["estagiario"]): void;   // join: config sanitizada + turno
    saved(p: PlayerState): CharacterData["estagiario"];                // para rec.data.estagiario
    onConfig(p: PlayerState, m: EstagiarioConfigMsg): void;
    onToggle(p: PlayerState, m: EstagiarioToggleMsg): void;
    onGravar(p: PlayerState, m: EstagiarioGravarMsg): void;            // Task 5
    manual(id: string): void;                                          // movimento manual (pausa a rota)
    onDied(p: PlayerState): void;
    desligarTudo(p: PlayerState): void;                                // drop/leave
    alarme(p: PlayerState, tipo: AlarmeTipo, texto: string): void;     // Task 6 usa
    estado(p: PlayerState): EstagiarioEstadoMsg;
    tick(now: number): void;
    removePlayer(id: string): void;
  }
  ```

Comportamento (cada item vira um caso de teste em `estagiario.test.ts`, com `world()`/`player()`/`openGrid`/`def` do
`testkit.ts` e falsos simples para `spells`/`potions`/`fight`/`companions` que registram chamadas):

1. `load` sem dado salvo → config `estagiarioPadrao(p.vocation)`, turno cheio; `saved` devolve `{ config, turno }` (só
   o que difere do padrão é gravado; config igual ao padrão → `config` ausente).
2. `onConfig` sanitiza (`sanitizeEstagiario(m.config, p.vocation, spellGroups(p))`), troca, responde `S2C.EstagiarioEstado`.
3. `onToggle({ cura: true })` liga a cura; `{ ataque: true }` liga o ataque; `{ rota: "Nome" }` liga a rota se ela existe,
   há turno (> 0) e o jogador **não** está na PZ (senão Notice "Saia da zona de proteção para ligar a rota." /
   "O turno do Estagiário acabou por hoje."); `{ rota: null }` desliga. Ligar a rota: `p.bot = true`, liga o ataque
   enquanto ela roda, `fight.forceChase(p.id, true)`, `companions.spawnCompanion(p)`, índice = `indiceMaisProximo`.
   Desligar: `p.bot = false`, `forceChase(false)`, `despawnCompanion`, o ataque volta ao estado escolhido pelo jogador.
   Toda mudança responde `S2C.EstagiarioEstado`.
4. **Cura** (tick, jogador vivo, cura ligada): `escolherCura(p, config.cura, pronto)`, com `pronto({magia}) =
   spells.ready(p, id)` e `pronto({pocao}) = potions.potionReady(p) && potions.countPotions(p, kind) > 0`; executa
   `spells.cast(p, id, undefined, { silent: true })` ou `potions.usePotion(p, kind, { silent: true })`. No máximo uma
   ação de cura por tick.
5. **Ataque** (tick, ataque ligado, depois da cura): sem alvo válido (`monsters.wild(p.targetId)` falso) →
   `p.targetId = fight.nearestTarget(p, BUSCA_TILES)` (nunca jogador; se `p.targetId` aponta para um jogador, não faz
   nada); com alvo → `escolherAtaque(config.ataque, bichosEm, manaPct, config.reservaMana, resolver)` onde
   `bichosEm(r)` conta `monsters.all()` selvagens vivos a até `r` tiles (Chebyshev) e `resolver(id)` devolve: magia solta
   → `id` se `spells.ready`; família/grupo → `pickFromFamily(resolveFamily(id, spellGroups(p), p.vocation), p.level,
   (s) => spells.ready(p, s.id))?.id ?? null`. Conjura com `cast(p, id, p.targetId, { silent: true })`.
6. **Turno**: com a rota rodando e sem pausa, `turno = avancarTurno(turno, now, true)`; senão `avancarTurno(…, false)`.
   Chegou a 0 → desliga a rota (Notice "O turno do Estagiário acabou por hoje."). Enquanto a rota roda, manda
   `EstagiarioEstado` a cada 10 s (o cliente mostra o turno).
7. **PZ**: rota rodando e o jogador entrou na PZ (`monsters.inPz(p.x, p.y)` passou de falso para verdadeiro) → desliga a rota.
8. `onDied` → desliga a rota (cura/ataque continuam); `desligarTudo` → desliga cura, ataque e rota (sem alarme).
9. `manual(id)` → com a rota rodando, `pausa = "manual"` até `now + PAUSA_MANUAL_MS` (renovada a cada chamada).
   `npcOpen(p.id)` verdadeiro → `pausa = "npc"`. Pausado: não anda na rota (Task 5) nem gasta turno; cura e ataque seguem.

Fiação no `WorldRoom.ts` (só acréscimos):
- Construir em `onCreate`, depois de `fight`/`spells`/`inventory`/`summons`:
  `this.estagiario = new EstagiarioSystem({ spells: this.spells, potions: this.inventory, fight: this.fight, monsters: this.monsters, movement: this.movement, companions: this.summons, npcOpen: (id) => this.npcs.openFor(id) !== "", spellGroups: (p) => sanitizeSpellGroups(this.records.get(p.id)?.data.spellGroups, p.vocation), players: () => this.state.players.values(), send })`.
- `this.steps`: `["estagiario", () => this.estagiario.tick(this.tickNow)]` **antes** de `["fight", …]`.
- Mensagens: `this.on<EstagiarioConfigMsg>(C2S.EstagiarioConfig, (p, m) => { this.estagiario.onConfig(p, m); this.saveEstagiario(p); })`,
  idem `EstagiarioToggle` e `EstagiarioGravar`; `MESSAGE_LIMITS`: `[C2S.EstagiarioConfig]: 2, [C2S.EstagiarioToggle]: 5, [C2S.EstagiarioGravar]: 2`.
- `saveEstagiario(p)`: `rec.data.estagiario = this.estagiario.saved(p)` (ou `delete` quando `undefined`).
- Join (onde `lootFilterOf` é usado): `this.estagiario.load(p, rec.data.estagiario)` e
  `client.send(S2C.EstagiarioEstado, this.estagiario.estado(p))`. `onReconnect`: reenvia o estado.
- Move (dir ≠ null) e WalkTo (sem `stop`): chamar `this.estagiario.manual(p.id)`.
- `onDrop` (antes de `allowReconnection`) e `onLeave`: `this.estagiario.desligarTudo(p)`.
- `combat.hooks.onPlayerDied`: `this.estagiario.onDied(p)` (o `summons.despawnOwner` que já existe remove o acompanhante).
- `cleanupSession` steps: `["estagiario", () => this.estagiario.removePlayer(sid)]`; `save()` grava `rec.data.estagiario`.
- `WorldRoom.test.ts`: as três mensagens validadas (lixo não quebra; config sanitizada volta no `EstagiarioEstado`;
  rota inexistente não liga), limite em `MESSAGE_LIMITS`, `estagiario` salvo e carregado no reconnect.

- [ ] **Step 1:** escrever `estagiario.test.ts` com os casos 1–9 (falham).
- [ ] **Step 2:** `npx vitest run packages/server/src/systems/estagiario.test.ts` → FAIL.
- [ ] **Step 3:** implementar `estagiario.ts` e a fiação; testes do `WorldRoom.test.ts`.
- [ ] **Step 4:** `npx vitest run packages/server/src/systems/estagiario.test.ts packages/server/src/rooms/WorldRoom.test.ts`; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git commit -m "Estagiário: sistema no servidor (cura, ataque, turno, liga e desliga) e mensagens no WorldRoom"`

---

### Task 5: Rota de caça — gravar e rodar

**Files:**
- Modify: `packages/server/src/systems/estagiario.ts`, `estagiario.test.ts`

**Interfaces:**
- Consumes: `novaGravacao`, `gravarPasso`, `fecharGravacao`, `indiceMaisProximo`, `PONTO_TRAVADO_MS`, `PONTOS_MAX`.
- Produces: `onGravar` completo; estado `gravando`/`pontosGravados` no `EstagiarioEstadoMsg`.

Comportamento (cada item é um caso de teste):
1. `onGravar({ acao: "iniciar" })` → `gravando = true`, `novaGravacao(p)`; a cada tick, `gravarPasso(g, últimaPos, posAtual)`
   (guarde a posição do tick anterior). Recusa iniciar com a rota rodando.
2. `onGravar({ acao: "parar", nome })` → `pontos = fecharGravacao(g, p)`; com nome válido (limpo como na Task 1) e ≥ 2
   pontos, grava/substitui a rota de mesmo nome (até `ROTAS_MAX`; cheio e nome novo → Notice "Já há 5 rotas: apague uma
   antes."); responde o estado. `"descartar"` só larga a gravação.
3. **Rodar** (tick, rota ligada, sem pausa, sem alvo vivo, jogador ocioso `movement.isIdle`): alvo = `pontos[i]`;
   cheb(p, alvo) ≤ 0 (ou o jogador foi teleportado para o ponto seguinte de um portal) → `i = (i + 1) % n`; senão
   anda um passo pelo caminho (`movement.pathFor(p, alvo)` recalculado no máximo a cada 300 ms ou quando o alvo muda;
   `movement.follow(p, dir, now)`), como `FightModeSystem.stepToward`. Ponto com `portal: true`: o objetivo é pisar
   exatamente nele (o PortalSystem teleporta); o próximo ponto é o destino, alcançado pelo teleporte.
4. Sem progresso (distância ao ponto não diminuiu) por `PONTO_TRAVADO_MS` → pula para o próximo ponto.
5. Com alvo vivo, não anda na rota (o `forceChase` da Task 4 aproxima). Ao matar (sem alvo de novo), retoma em
   `indiceMaisProximo(pontos, p)`.
6. Pausa manual/NPC: não anda; ao sair da pausa, retoma pelo ponto mais próximo.

Teste-cenário (o principal): `openGrid(30, 10)`, rota `[(2,2), (10,2), (10,6)]`, um rato fraco em (12,6), jogador com
cura e ataque falsos-mas-reais: ligar a rota → em ≤ 20 s simulados o jogador passou por (10,2), o rato morreu (ataque
automático do `combat`), o turno diminuiu, `p.bot === true`; `manual()` → por 10 s não anda; desligar → `p.bot === false`.

- [ ] **Step 1:** testes (falham). **Step 2:** rodar. **Step 3:** implementar. **Step 4:** `npx vitest run packages/server/src/systems/estagiario.test.ts`; `npm test`.
- [ ] **Step 5: Commit** — `git commit -m "Estagiário: rota de caça gravada andando e rodada pelo servidor (portais, ponto travado, retomada)"`

---

### Task 6: Alarmes no servidor

**Files:**
- Modify: `packages/server/src/systems/estagiario.ts`, `estagiario.test.ts`, `packages/server/src/rooms/WorldRoom.ts`

Regras (só com a rota rodando; respeitam `alarmeLigado`; mandam `S2C.EstagiarioAlarme { tipo, texto }`):

| tipo | dispara | rearma | texto |
|---|---|---|---|
| `pocao` | `countPotions` de algum `kind` usado nas regras de cura < `POCAO_ALARME_MIN` | voltou a ≥ 10 | "Estagiário: poções acabando (N de vida)." / "(N de mana)" |
| `vidaBaixa` | vida < `vidaAlarme`% | vida ≥ `vidaAlarme + 10`% | "Estagiário: vida baixa (N%)." |
| `jogador` | outro jogador vivo a ≤ `BUSCA_TILES` | quando aquele jogador sai do alcance | "Estagiário: <nome> está por perto." |
| `atacado` | `onPlayerHit(atacante, vítima)` com a vítima no Estagiário | 10 s depois | "Estagiário: <nome> está te atacando!" |
| `privada` | `SocialHost.onWhisper(para, de)` | a cada mensagem | "Estagiário: mensagem de <nome>." |
| `turno` | turno cruzou `TURNO_AVISO_MS` para baixo | turno voltou acima | "Estagiário: faltam 5 min de turno." |
| `mochila` | `LootOptions.onBackpackFull(p)` | 60 s depois | "Estagiário: mochila cheia — o loot está ficando no chão." |
| `morte` | `onDied` com a rota rodando (sempre, ignora o liga/desliga) | — | "Estagiário: você morreu. A rota foi desligada." |

Fiação: `combat.hooks.onPlayerHit = (a, b, now) => { this.pvp.onHit(a, b, now); this.estagiario.onAtacado(b, a); }`
(preserve o que já estava no gancho); `SocialSystem` recebe `onWhisper: (to, from) => this.estagiario.onPrivada(to, from)`;
`LootSystem` recebe `onBackpackFull: (p) => this.estagiario.onMochilaCheia(p)`. Métodos novos públicos:
`onAtacado(vitima: PlayerState, atacante: PlayerState)`, `onPrivada(para: PlayerState, de: PlayerState)`,
`onMochilaCheia(p: PlayerState)`.

- [ ] **Step 1:** um teste por linha da tabela (dispara uma vez, rearma, respeita o desligado, nada com a rota desligada).
- [ ] **Step 2–4:** rodar, implementar, `npm test`.
- [ ] **Step 5: Commit** — `git commit -m "Estagiário: alarmes (poção, vida, jogador perto, atacado, mensagem, turno, mochila cheia, morte)"`

---

### Task 7: Cliente — janela, botão, 🤖, acompanhante e alarmes

**Files:**
- Create: `packages/client/src/ui/estagiario/store.ts` (estado recebido + envio), `bind.ts` (S2C), `EstagiarioWindow.tsx`,
  `estagiario.css`, `alarmes.ts` (+ `store.test.ts` para as funções puras de edição)
- Modify: `packages/client/src/ui/hud/Sidebar.tsx` (botão no trilho), `App.tsx` ou `Hud.tsx` (montar a janela; importar o
  bind), `hud/world.ts` (`snap`: `bot: !!p.bot`), `hud/battle.ts` (`buildBattleList`: nome do jogador com `🤖 ` quando
  `bot`), `scenes/WorldScene.ts` (só acréscimos: `onPlayerChange` atualiza o nome com `actor.setName((p.bot ? "🤖 " : "") + p.name)`
  quando `bot` mudar; `addMonster`: def `companion` → nome `Estagiário de <nome do dono>` pelo `playersStore`, sem barra
  de vida se o `Actor` permitir; `publishBattle`: pula `MONSTERS[defId]?.companion`), `ui/social/OnlinePanel.tsx`
  (`🤖` antes do nome quando `e.bot`), `server/src/systems/social.ts` (`onlineFor` preenche `bot: p.bot || undefined`),
  `game/sfx.ts` (reaproveitar um som existente para o alarme, ex.: `"fail"` com `rate` maior — não criar asset novo)

Comportamento:
- **Store** (`store.ts`): `estagiarioStore = createStore<EstagiarioEstadoMsg | null>(null)`; `estagiarioOpen = createStore(false)`;
  `toggleEstagiario()`; `salvarConfig(c)` (envia `C2S.EstagiarioConfig` com debounce de 300 ms, como `ui/items/lootFilter.ts`);
  `ligar(m: EstagiarioToggleMsg)`; `gravar(m: EstagiarioGravarMsg)`; funções puras de edição testadas em `store.test.ts`:
  `addRegraCura`, `moverRegra`, `removerRegra`, `addRegraAtaque` (limite `REGRAS_MAX`).
- **Bind** (`bind.ts`): `session.onRoom((room) => { room.onMessage(S2C.EstagiarioEstado, (m) => estagiarioStore.set(m)); room.onMessage(S2C.EstagiarioAlarme, (m) => alarme(m)); })`.
- **Alarme** (`alarmes.ts`): `pushToast({ text, kind: "warn" })`, `sfx.play(...)`, `notifyAttention` — acrescente
  `"estagiario"` a `AttentionReason` em `attentionLogic.ts` (marca no título como as outras).
- **Janela** (`EstagiarioWindow.tsx`, no molde de `ui/items/LootFilterWindow.tsx`: `bindOverlay`, `useWindowDrag`,
  `useDialogFocus`, classes `hud-card hud-window`): cabeçalho com interruptores **Cura** e **Ataque**, a rota ativa e o
  turno restante (`h:mm`); quatro abas:
  - *Cura*: lista de regras (quando vida/mana, "abaixo de N%", ação = poção de vida/mana ou uma das curas da vocação),
    subir/descer/remover, "+ Regra" (até 6).
  - *Ataque*: regras (`≥ N bichos a até R tiles` → magia/família/grupo da vocação, como a janela Magias lista), reserva de mana.
  - *Rota*: lista das rotas (Ligar/Desligar, Renomear, Apagar), "Gravar" → enquanto grava mostra "Gravando… N pontos"
    com "Parar e salvar" (pede o nome) e "Descartar".
  - *Alarmes*: um interruptor por alarme (exceto "Você morreu", só informativo), % da vida baixa.
  - Toda edição chama `salvarConfig`. Textos em português. `data-testid` em: `rail-estagiario`, `est-tab-rota`,
    `est-gravar`, `est-parar`, `est-nome`, `est-salvar-rota`, `est-ligar-<nome>`, `est-desligar`.
- **Botão no trilho** (`Sidebar.tsx`, no molde do `rail-loot`): `data-testid="rail-estagiario"`, ícone 🤖 (ou um
  `PixelIcon` existente), `active` com a janela aberta ou a rota ligada, `data-tip="Estagiário"`.

- [ ] **Step 1:** `store.test.ts` (edição de regras) falhando → implementar → passar.
- [ ] **Step 2:** janela, bind, botão, 🤖, acompanhante e filtro da battle list.
- [ ] **Step 3:** conferir no harness `?uitest` (`npm run dev`, abrir `http://localhost:3000/?uitest`): a janela abre pelo
  trilho, as abas editam e o `send` registra `C2S.EstagiarioConfig`. Acrescente ao `setItemTransport` do harness o eco
  de `EstagiarioConfig`/`Toggle` → `estagiarioStore` para a janela funcionar sem servidor.
- [ ] **Step 4:** `npm run typecheck`; `npx vitest run packages/client`; `npm test`.
- [ ] **Step 5: Commit** — `git commit -m "Estagiário: janela de configuração, botão no trilho, 🤖 no nome, acompanhante na tela e alarmes no cliente"`

---

### Task 8: E2E e documentação

**Files:**
- Create: `e2e/estagiario.spec.ts`
- Modify: `CHANGELOG.md`, `docs/GAME_ROADMAP.md`, `docs/TEST_PLAN.md`, `packages/shared/src/data/news.ts`, `README.md`

- [ ] **Step 1: E2E** (`e2e/estagiario.spec.ts`, helpers de `e2e/helpers.ts`; `FOREST = { x: 70, y: 62 }` é local nas
  specs que o usam — defina igual): cavaleiro, `say("/item health_potion 20")`, teleporte para perto de ratos
  (`walkableNear(page, FOREST.x, FOREST.y, 4)`), abrir `rail-estagiario` → aba Rota → `est-gravar`, andar 3 tiles com o
  teclado (`page.keyboard.press("ArrowRight")` ×3 com `waitSettled`), `est-parar`, nome "Teste", `est-salvar-rota`,
  `est-ligar-Teste`; `expect.poll` até `meState(page).bot === true`; existe um monstro `estagiario` em `monsters(page)`
  (via `window.__lq`; se a sonda não expõe `defId`, use o nome "Estagiário de …"); `expect.poll` (até 60 s) o XP subir
  (um rato morreu sem comando); `est-desligar` → `bot === false` e o acompanhante sumiu. Não rode localmente: o CI roda.
- [ ] **Step 2: Docs.**
  - `CHANGELOG.md`: entrada "2026-11-0X · Estagiário" (o que é, decisões do dono, limites, alarmes).
  - `docs/GAME_ROADMAP.md`: seção "Estagiário (2026-11-01)" com itens ES-1..ES-6 (regras, sistema, rota, alarmes,
    cliente, E2E) ✅ e "ES-7 arte própria / refill / rendimento menor 🧭".
  - `docs/TEST_PLAN.md`: resultados reais (arquivos de teste e contagens).
  - `shared/src/data/news.ts`: entrada nova (itens < 200 caracteres; rode `npx vitest run packages/shared/src/data/news.test.ts`).
  - `README.md`: controles — botão Estagiário e o que ele faz.
- [ ] **Step 3:** `npm run typecheck`; `npm test`.
- [ ] **Step 4: Commit** — `git commit -m "Estagiário: E2E e documentação (CHANGELOG, ROADMAP, TEST_PLAN, Novidades, README)"`

---

## Autoavaliação (feita ao escrever)

- Cobertura da spec: cura (T4), ataque e nunca jogador (T4), rota/gravação/portal/travado/pausas (T5), alarmes (T6),
  turno e desligamentos (T4), acompanhante imune/segue/bloqueia (T3), visibilidade 🤖 (T2/T7), persistência (T2/T4),
  protocolo e limites (T2/T4), cliente (T7), testes e docs (T8). Ponto da spec ajustado na execução: ligar a rota dentro
  da PZ é recusado (entrar na PZ com ela rodando desliga) — senão quem sai do templo nunca ligaria.
- Nomes conferidos entre tarefas: `estagiarioPadrao`, `sanitizeEstagiario`, `avancarTurno`, `escolherCura`,
  `escolherAtaque`, `indiceMaisProximo`, `novaGravacao`/`gravarPasso`/`fecharGravacao`, `alarmeLigado`, `BUSCA_TILES`,
  `ready`, `usePotion`, `potionReady`, `countPotions`, `nearestTarget`, `forceChase`, `spawnCompanion`/`despawnCompanion`,
  `blocksPlayer`, `isCompanion`, `onWhisper`, `onBackpackFull`, `EstagiarioEstadoMsg`.
