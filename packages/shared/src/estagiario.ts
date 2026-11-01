// Estagiário (2026-11-01, spec docs/superpowers/specs/2026-11-01-estagiario-design.md): bot de caça do próprio jogo.
// Aqui só as regras puras (o servidor decide e age em server/systems/estagiario.ts; o cliente só configura).
import { castableBy, familiesFor, type SpellGroup } from "./data/spellFamilies.ts";
import { spellDef, spellsFor, type SpellDef } from "./data/spells.ts";
import type { QuickPotionKind } from "./itemRules.ts";
import type { Vocation } from "./types.ts";

export type CuraAcao = { magia: string } | { pocao: QuickPotionKind };
export interface RegraCura { quando: "vida" | "mana"; abaixoDe: number; acao: CuraAcao }
/** Conta os monstros selvagens a até `raio` tiles; com `minBichos` ou mais, conjura `magia` (magia, família ou grupo). */
export interface RegraAtaque { minBichos: number; raio: number; magia: string }
/** Buff mantido ativo: reconjura `magia` quando a condição dela acaba; `emCombate` = só com um monstro vivo de alvo. */
export interface RegraBuff { magia: string; emCombate: boolean }
/** `portal`: o tile do portal pisado na gravação (a rota anda até ele para atravessar de novo). */
export interface PontoRota { x: number; y: number; portal?: boolean }
export interface RotaCaca { nome: string; pontos: PontoRota[] }
export type AlarmeTipo = "pocao" | "vidaBaixa" | "jogador" | "atacado" | "privada" | "turno" | "mochila" | "morte";
export interface EstagiarioConfig {
  cura: RegraCura[];
  ataque: RegraAtaque[];
  /** Buffs mantidos ativos (2026-11-01, pedido do dono), na ordem. */
  buffs: RegraBuff[];
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

/**
 * Cura recomendada por vocação (2026-11-01, pedido do dono): poção forte primeiro na vida baixa; depois a cura própria
 * da vocação (Limpar Feridas do cavaleiro, Cura Divina do paladino — só saem quando o level libera; antes disso a regra
 * é pulada e vale a seguinte); a Cura comum; e a poção de mana. Magos curam mais com a Cura (magic level alto).
 */
export function curaRecomendada(v: Vocation): RegraCura[] {
  const hp = (abaixoDe: number): RegraCura => ({ quando: "vida", abaixoDe, acao: { pocao: "hp" } });
  const mp = (abaixoDe: number): RegraCura => ({ quando: "mana", abaixoDe, acao: { pocao: "mana" } });
  const magia = (abaixoDe: number, id: string): RegraCura => ({ quando: "vida", abaixoDe, acao: { magia: id } });
  if (v === "knight") return [hp(35), magia(55, "wound_cleansing"), magia(70, "light_heal"), mp(25)];
  if (v === "paladin") return [hp(35), magia(60, "divine_healing"), magia(70, "light_heal"), mp(35)];
  return [hp(35), magia(65, curaDaVocacao(v)), mp(35)];
}

/** Quantos bichos a até `raio` tiles pedem a magia de área: as de raio 3+ pedem 3; as menores, 2. */
const minBichosArea = (s: SpellDef): number => (s.target === "area_self" && (s.radius ?? 1) >= 3 ? 3 : 2);
/** Raio (tiles) em volta do personagem que conta os bichos para a magia: o raio dela, ou o comprimento da onda. */
const raioDaMagia = (s: SpellDef): number => Math.max(1, Math.min(4, s.target === "wave" ? s.length ?? 1 : s.radius ?? 1));

/**
 * Ataque recomendado por vocação, magia por magia (2026-11-01, pedido do dono: "por skill, área e alvo, e a quantidade
 * de tiles que cada uma pega"): cada magia de dano em área (em volta, no alvo ou onda) vira uma regra com o raio dela e
 * 2–3 bichos, da mais forte (level maior) para a mais fraca; a última regra é a tecla inteligente "no alvo" da vocação,
 * que solta o golpe de alvo único mais forte pronto (do level 1 em diante). Magias acima do level são puladas sozinhas.
 */
export function ataqueRecomendado(v: Vocation): RegraAtaque[] {
  const alvo = familiesFor(v).find((f) => f.id.endsWith(":target"));
  const area = spellsFor(v)
    .filter((s) => s.damage && !s.heal && (s.target === "area_self" || s.target === "area_target" || s.target === "wave"))
    .sort((a, b) => b.level - a.level)
    .slice(0, REGRAS_MAX - (alvo ? 1 : 0))
    .map((s): RegraAtaque => ({ minBichos: minBichosArea(s), raio: raioDaMagia(s), magia: s.id }));
  return alvo ? [...area, { minBichos: 1, raio: 1, magia: alvo.id }] : area;
}

/**
 * Magia de buff (2026-11-01): em si mesmo ou no grupo, aplica uma condição e não dá dano, não cura nem invoca
 * (Pés Ligeiros, Pele de Ferro, Fúria, Escudo de Mana, Muralha de Escudos, Luz Restauradora, Banho de Espuma...).
 */
export const ehBuff = (s: SpellDef): boolean =>
  (s.target === "self" || s.target === "party") && !!s.condition && !s.damage && !s.heal && !s.summon;

/** Buffs que a vocação pode escolher, do level menor para o maior. */
export const buffsDaVocacao = (v: Vocation): SpellDef[] => spellsFor(v).filter(ehBuff);

/**
 * Buffs recomendados por vocação: a pressa sempre (fora de combate também, para andar a rota mais rápido); o cavaleiro
 * segura Pele de Ferro e Fúria na luta; magos e a fada, o escudo de mana na luta. Acima do level, a regra é pulada.
 */
export function buffsRecomendados(v: Vocation): RegraBuff[] {
  const b = (magia: string, emCombate: boolean): RegraBuff => ({ magia, emCombate });
  if (v === "knight") return [b("swift_feet", false), b("iron_skin", true), b("berserk", true)];
  if (v === "paladin") return [b("swift_feet", false)];
  if (v === "fairy") return [b("bubble_bath", true), b("swift_wings", false)];
  return [b("mana_shield", true), b("swift_feet", false)];
}

const RESERVA_MANA: Partial<Record<Vocation, number>> = { knight: 20, paladin: 25 };

export function estagiarioPadrao(v: Vocation): EstagiarioConfig {
  return {
    cura: curaRecomendada(v),
    ataque: ataqueRecomendado(v),
    buffs: buffsRecomendados(v),
    reservaMana: RESERVA_MANA[v] ?? 30,
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

function regraBuff(raw: unknown, v: Vocation): RegraBuff | null {
  const r = obj(raw);
  if (!r || typeof r.magia !== "string") return null;
  const s = spellDef(r.magia);
  return s && s.vocations.includes(v) && ehBuff(s) ? { magia: s.id, emCombate: r.emCombate === true } : null;
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
  const buffs: RegraBuff[] = [];
  for (const e of Array.isArray(r.buffs) ? r.buffs.slice(0, REGRAS_MAX * 4) : []) {
    if (buffs.length >= REGRAS_MAX) break;
    const k = regraBuff(e, v);
    if (k && !buffs.some((x) => x.magia === k.magia)) buffs.push(k); // a mesma magia duas vezes não faz nada a mais
  }
  const alarmes: Partial<Record<AlarmeTipo, boolean>> = {};
  const a = obj(r.alarmes);
  if (a) for (const t of ALARMES) if (t !== "morte" && a[t] === false) alarmes[t] = false;
  return {
    cura: Array.isArray(r.cura) ? list(r.cura, (e) => regraCura(e, v), REGRAS_MAX) : estagiarioPadrao(v).cura,
    ataque: Array.isArray(r.ataque) ? list(r.ataque, (e) => regraAtaque(e, v, groups), REGRAS_MAX) : ataqueRecomendado(v),
    // Sem a lista no que veio salvo (configuração de antes dos buffs): vale o recomendado; lista vazia fica vazia.
    buffs: Array.isArray(r.buffs) ? buffs : buffsRecomendados(v),
    reservaMana: int(r.reservaMana, 0, 90, RESERVA_MANA[v] ?? 30),
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

/**
 * Buff a conjurar agora: o primeiro da lista cuja condição não está ativa, que vale fora de combate (ou há alvo), que
 * respeita a reserva de mana (menos o escudo de mana, que é de sobrevivência) e está pronto.
 */
export function escolherBuff(
  regras: readonly RegraBuff[], ativo: (condicao: string) => boolean, comAlvo: boolean, manaPct: number, reservaMana: number,
  pronto: (magia: string) => boolean,
): string | null {
  for (const r of regras) {
    const s = spellDef(r.magia);
    if (!s?.condition || (r.emCombate && !comAlvo) || ativo(s.condition.id)) continue;
    if (s.condition.id !== "manashield" && manaPct < reservaMana) continue;
    if (pronto(s.id)) return s.id;
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
