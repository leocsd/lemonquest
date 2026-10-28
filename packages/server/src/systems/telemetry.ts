// Telemetria de progressão (ciclo 9): tempo jogado, mortes e ouro ganho/gasto por level, por personagem. Fica em
// `CharacterData.play` e alimenta o /status com médias por faixa de level — é o dado que faltava para calibrar o
// balanço do ciclo 8 (pendência "medir playedMs/mortes por level" dos ciclos 7 e 8). Puro: o WorldRoom liga os ganchos
// (entrada, level up, morte, ouro) e chama `serialize` ao gravar o personagem.
import { SKILL_START, SKILLS, VOCATIONS, attackSkillOf, monsterDef, type SkillId } from "@lemonquest/shared";
import { DOT_LABEL } from "./conditions.ts";

/**
 * Por level. Ciclo 12 (medir antes de mexer): abates, XP, dano causado a monstros e dano perdido para a resistência
 * elemental — o que falta para comparar as vocações e ver o efeito da resistência. Saves antigos: campos ausentes = 0.
 * Ciclo 15: `deathsBy` = mortes por causa (chave de `CombatHooks.onPlayerDied`), para ver o que mata em cada faixa antes
 * de travar as metas de balanço; mortes de antes disso só estão em `deaths`.
 */
export interface LevelStats {
  ms: number; deaths: number; goldIn: number; goldOut: number;
  kills?: number; xp?: number; dmg?: number; resisted?: number;
  deathsBy?: Record<string, number>;
}
export interface PlayData { ms: number; byLevel: Record<string, LevelStats> }

interface Live { level: number; since: number; data: PlayData }

// Os campos do ciclo 12 (kills, xp, dmg, resisted) só aparecem quando há dado: o save de cada level não cresce à toa.
const emptyStats = (): LevelStats => ({ ms: 0, deaths: 0, goldIn: 0, goldOut: 0 });

function cloneData(d: PlayData): PlayData {
  const byLevel: Record<string, LevelStats> = {};
  for (const [k, v] of Object.entries(d.byLevel ?? {})) {
    const s: LevelStats = { ...emptyStats(), ...v };
    if (v?.deathsBy) s.deathsBy = { ...v.deathsBy }; // o mapa também é copiado: o salvo não pode mudar com o vivo
    byLevel[k] = s;
  }
  return { ms: d.ms ?? 0, byLevel };
}

/** Faixas de level do resumo (a última é aberta). */
export const LEVEL_BANDS: readonly (readonly [number, number])[] = [[1, 9], [10, 19], [20, 39], [40, 59], [60, 79], [80, 99], [100, 999]];
/** Faixa só entra no resumo com pelo menos isto de tempo jogado somado. */
export const SUMMARY_MIN_MS = 10 * 60_000;

export class PlayTelemetry {
  private live = new Map<string, Live>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Entrou no mundo: continua a contagem a partir do que estava salvo. */
  onJoin(id: string, level: number, saved: PlayData | undefined): void {
    this.live.set(id, { level, since: this.now(), data: saved ? cloneData(saved) : { ms: 0, byLevel: {} } });
  }

  private bucket(l: Live, level = l.level): LevelStats {
    const k = String(level);
    return (l.data.byLevel[k] ??= emptyStats());
  }

  /** Passa o tempo decorrido para o level atual. */
  private flush(l: Live): void {
    const t = this.now(), dt = Math.max(0, t - l.since);
    l.since = t;
    if (dt > 0) { l.data.ms += dt; this.bucket(l).ms += dt; }
  }

  /** Mudou de level (para cima pelo jogo ou por comando de dev): o tempo até aqui fica no level antigo. */
  onLevel(id: string, level: number): void {
    const l = this.live.get(id);
    if (!l || l.level === level) return;
    this.flush(l);
    l.level = level;
  }

  /** Morte no level atual; `cause` (formato em `causeLabel`) entra também em `deathsBy`. */
  onDeath(id: string, cause?: string): void {
    const l = this.live.get(id);
    if (!l) return;
    const b = this.bucket(l);
    b.deaths++;
    if (cause) { const by = (b.deathsBy ??= {}); by[cause] = (by[cause] ?? 0) + 1; }
  }
  onGold(id: string, n: number): void { const l = this.live.get(id); if (l && n > 0) this.bucket(l).goldIn += Math.floor(n); }
  onSpend(id: string, n: number): void { const l = this.live.get(id); if (l && n > 0) this.bucket(l).goldOut += Math.floor(n); }
  onKill(id: string): void { const l = this.live.get(id); if (l) { const b = this.bucket(l); b.kills = (b.kills ?? 0) + 1; } }
  onXp(id: string, n: number): void { const l = this.live.get(id); if (l && n > 0) { const b = this.bucket(l); b.xp = (b.xp ?? 0) + Math.floor(n); } }
  /** Dano causado a monstro (`dealt`) e o que a resistência elemental tirou dele (`resisted`). */
  onDamage(id: string, dealt: number, resisted: number): void {
    const l = this.live.get(id);
    if (!l) return;
    const b = this.bucket(l);
    if (dealt > 0) b.dmg = (b.dmg ?? 0) + Math.round(dealt);
    if (resisted > 0) b.resisted = (b.resisted ?? 0) + Math.round(resisted);
  }

  /** Estado para gravar em `CharacterData.play` (cópia, com o tempo até agora já contado no level `level`). */
  serialize(id: string, level: number): PlayData | undefined {
    const l = this.live.get(id);
    if (!l) return undefined;
    this.onLevel(id, level);
    this.flush(l);
    return cloneData(l.data);
  }

  removePlayer(id: string): void { this.live.delete(id); }

  /** Tempo jogado total de uma sessão viva (ms), para o /status. */
  liveMs(id: string): number { const l = this.live.get(id); return l ? l.data.ms + Math.max(0, this.now() - l.since) : 0; }
}

/** Resumo por faixa de level a partir dos dados salvos (de todos os personagens) + sessões vivas. */
export function summarizePlay(all: Iterable<PlayData | undefined>): string[] {
  const bands = LEVEL_BANDS.map(() => ({ ms: 0, levels: 0, deaths: 0, gold: 0 }));
  for (const d of all) {
    if (!d) continue;
    for (const [k, v] of Object.entries(d.byLevel ?? {})) {
      const lv = Number(k);
      const i = LEVEL_BANDS.findIndex(([a, b]) => lv >= a && lv <= b);
      if (i < 0 || !(v.ms > 0)) continue;
      const b = bands[i]!;
      b.ms += v.ms; b.levels++; b.deaths += v.deaths ?? 0; b.gold += (v.goldIn ?? 0) - (v.goldOut ?? 0);
    }
  }
  const parts: string[] = [];
  LEVEL_BANDS.forEach(([a, b], i) => {
    const s = bands[i]!;
    if (s.ms < SUMMARY_MIN_MS) return;
    const hours = s.ms / 3_600_000;
    const label = b >= 999 ? `${a}+` : `${a}–${b}`;
    parts.push(`${label}: ${(hours / s.levels).toFixed(2)} h/level · ${(s.deaths / hours).toFixed(1)} mortes/h · ${fmtGold(s.gold / hours)} ouro/h`);
  });
  return parts.length ? [`Progressão medida (por faixa): ${parts.join(" | ")}`] : ["Progressão medida: ainda sem 10 min jogados em nenhuma faixa."];
}

function fmtGold(n: number): string {
  const sign = n < 0 ? "−" : "+";
  const v = Math.abs(n);
  return `${sign}${v >= 1000 ? `${(v / 1000).toFixed(1)} mil` : Math.round(v)}`;
}

/** Faixas do relatório por vocação (mais largas que as do /status: são poucos personagens por vocação). */
export const VOCATION_BANDS: readonly (readonly [number, number])[] = [[1, 19], [20, 39], [40, 59], [60, 79], [80, 99], [100, 999]];

/**
 * Relatório por vocação × faixa (CLI `npm run admin -- telemetria`): horas, XP/h, abates/h, dano/h, % do dano perdido
 * para a resistência e mortes/h. Faixa com menos de SUMMARY_MIN_MS fica de fora (amostra pequena demais).
 */
export function vocationReport(rows: Iterable<{ vocation: string; play: PlayData | undefined }>): string[] {
  const acc = new Map<string, { ms: number; chars: number; xp: number; kills: number; dmg: number; resisted: number; deaths: number }>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const [k, v] of Object.entries(r.play?.byLevel ?? {})) {
      const lv = Number(k);
      const i = VOCATION_BANDS.findIndex(([a, b]) => lv >= a && lv <= b);
      if (i < 0 || !(v.ms > 0)) continue;
      const key = `${r.vocation}|${i}`;
      const a = acc.get(key) ?? { ms: 0, chars: 0, xp: 0, kills: 0, dmg: 0, resisted: 0, deaths: 0 };
      a.ms += v.ms; a.xp += v.xp ?? 0; a.kills += v.kills ?? 0; a.dmg += v.dmg ?? 0; a.resisted += v.resisted ?? 0; a.deaths += v.deaths ?? 0;
      if (!seen.has(key)) { seen.add(key); a.chars++; }
      acc.set(key, a);
    }
  }
  const out: string[] = [];
  for (const voc of VOCATIONS) {
    VOCATION_BANDS.forEach(([lo, hi], i) => {
      const a = acc.get(`${voc}|${i}`);
      if (!a || a.ms < SUMMARY_MIN_MS) return;
      const h = a.ms / 3_600_000;
      const lost = a.dmg + a.resisted > 0 ? Math.round((100 * a.resisted) / (a.dmg + a.resisted)) : 0;
      out.push(`${voc.padEnd(8)} ${(hi >= 999 ? `${lo}+` : `${lo}–${hi}`).padEnd(7)} ${h.toFixed(1).padStart(5)} h (${a.chars} pers.) · `
        + `${fmtNum(a.xp / h)} XP/h · ${Math.round(a.kills / h)} abates/h · ${fmtNum(a.dmg / h)} dano/h · ${lost}% resistido · `
        + `${(a.deaths / h).toFixed(1)} mortes/h`);
    });
  }
  return out.length ? out : ["Ainda sem 10 min jogados com a telemetria nova em nenhuma vocação/faixa."];
}

function fmtNum(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} mi` : n >= 1000 ? `${(n / 1000).toFixed(1)} mil` : String(Math.round(n));
}

const bandIndex = (lv: number) => VOCATION_BANDS.findIndex(([a, b]) => lv >= a && lv <= b);
const bandLabel = (lo: number, hi: number) => (hi >= 999 ? `${lo}+` : `${lo}–${hi}`);

/**
 * Nome legível da causa de morte. Chaves (gravadas em `deathsBy`, estáveis entre versões): id do monstro (golpe
 * corpo a corpo/distância), "monstro/habilidade" (habilidade de monstro), "condição@monstro" (queimadura, veneno...
 * aplicados por ele; só "condição" se o dono não era conhecido), "pvp" (jogador, inclusive condição aplicada por
 * jogador) e "?" (sem causa informada).
 */
export function causeLabel(key: string): string {
  const name = (id: string) => monsterDef(id)?.name ?? id;
  const dot = (id: string) => DOT_LABEL[id as keyof typeof DOT_LABEL] ?? id;
  if (key === "pvp") return "PvP";
  if (key === "?") return "desconhecida";
  const at = key.indexOf("@");
  if (at >= 0) return `${dot(key.slice(0, at))} (${name(key.slice(at + 1))})`;
  const slash = key.indexOf("/");
  if (slash >= 0) {
    const mon = key.slice(0, slash), ab = key.slice(slash + 1);
    return `${name(mon)}: ${monsterDef(mon)?.abilities?.find((a) => a.id === ab)?.name ?? ab}`;
  }
  return key in DOT_LABEL ? dot(key) : name(key);
}

/**
 * Causas de morte por faixa (CLI `admin telemetria`): total de mortes e as `top` causas mais comuns de `deathsBy`.
 * Mortes de antes do ciclo 15 aparecem como "sem causa".
 */
export function deathReport(all: Iterable<PlayData | undefined>, top = 5): string[] {
  const bands = VOCATION_BANDS.map(() => ({ deaths: 0, by: new Map<string, number>() }));
  for (const d of all) {
    for (const [k, v] of Object.entries(d?.byLevel ?? {})) {
      const i = bandIndex(Number(k));
      if (i < 0) continue;
      const b = bands[i]!;
      b.deaths += v.deaths ?? 0;
      for (const [c, n] of Object.entries(v.deathsBy ?? {})) if (n > 0) b.by.set(c, (b.by.get(c) ?? 0) + n);
    }
  }
  const out: string[] = [];
  VOCATION_BANDS.forEach(([lo, hi], i) => {
    const b = bands[i]!;
    if (!(b.deaths > 0)) return;
    const sorted = [...b.by].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
    const parts = sorted.slice(0, top).map(([c, n]) => `${causeLabel(c)} ${n}`);
    const rest = sorted.slice(top).reduce((s, [, n]) => s + n, 0);
    if (rest > 0) parts.push(`outras ${rest}`);
    const unknown = b.deaths - sorted.reduce((s, [, n]) => s + n, 0);
    if (unknown > 0) parts.push(`sem causa ${unknown}`);
    out.push(`${bandLabel(lo, hi).padEnd(7)} ${String(b.deaths).padStart(4)} mortes · ${parts.join(" · ")}`);
  });
  return out.length ? out : ["Nenhuma morte registrada."];
}

/** Personagem salvo para o relatório de skills (level atual e `CharacterData.skills`). */
export interface SkillRow { vocation: string; level: number; skills?: Partial<Record<SkillId, { level: number }>> }

/**
 * Skills treinadas dos personagens salvos por vocação × faixa do level atual (CLI `admin telemetria`): média [mín–máx]
 * do ML, da skill da arma do ataque básico (melee do cavaleiro, distância do paladino; nos magos a arma é o próprio
 * ML) e do escudo, sem bônus de equipamento. É o "real" para conferir o `skillEstimate` do modelo de balanço.
 */
export function skillReport(rows: Iterable<SkillRow>): string[] {
  const acc = new Map<string, Record<SkillId, number[]>>();
  for (const r of rows) {
    const i = bandIndex(r.level);
    if (i < 0) continue;
    const key = `${r.vocation}|${i}`;
    const a = acc.get(key) ?? { melee: [], distance: [], magic: [], shield: [] };
    for (const s of SKILLS) a[s].push(r.skills?.[s]?.level ?? SKILL_START[s]);
    acc.set(key, a);
  }
  const stat = (v: number[]) => `${(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)} [${Math.min(...v)}–${Math.max(...v)}]`;
  const out: string[] = [];
  for (const voc of VOCATIONS) {
    const weapon = attackSkillOf(voc);
    VOCATION_BANDS.forEach(([lo, hi], i) => {
      const a = acc.get(`${voc}|${i}`);
      if (!a) return;
      const cols = [`ML ${stat(a.magic)}`];
      if (weapon !== "magic") cols.push(`arma ${stat(a[weapon])}`);
      cols.push(`escudo ${stat(a.shield)}`);
      out.push(`${voc.padEnd(8)} ${bandLabel(lo, hi).padEnd(7)} ${String(a.magic.length).padStart(3)} pers. · ${cols.join(" · ")}`);
    });
  }
  return out.length ? out : ["Nenhum personagem salvo."];
}
