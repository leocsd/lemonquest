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
