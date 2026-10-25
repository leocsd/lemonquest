// Recompensas diárias do Quadro de Recompensas: dia (troca às 06:00 de America/Sao_Paulo, calculado explicitamente,
// independente do TZ do servidor) e geração determinística (semente = dia + faixa de level).
import { BOUNTIES_PER_DAY, BOUNTY_BANDS, BOUNTY_RESET_HOUR, BOUNTY_TZ, monsterDef, type MonsterDef } from "@lemonquest/shared";

const HOUR = 3_600_000;

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BOUNTY_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Data/hora local em America/Sao_Paulo. */
export function tzParts(ms: number): { y: number; m: number; d: number; h: number; mi: number } {
  const o: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year!, m: o.month!, d: o.day!, h: o.hour! % 24, mi: o.minute! };
}

/** Diferença (ms) entre o relógio local de São Paulo e UTC no instante `ms` (ex.: −3 h). */
export function tzOffsetMs(ms: number): number {
  const p = tzParts(ms);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  return asUtc - (Math.floor(ms / 60_000) * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Chave do "dia de recompensas": a data local de (agora − 6 h). Antes das 6h ainda vale o dia anterior. */
export function bountyDay(ms: number): string {
  const p = tzParts(ms - BOUNTY_RESET_HOUR * HOUR);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Instante (ms UTC) da próxima troca (06:00 local do dia seguinte ao dia de recompensas atual). */
export function nextBountyReset(ms: number): number {
  const [y, m, d] = bountyDay(ms).split("-").map(Number) as [number, number, number];
  const local = Date.UTC(y, m - 1, d + 1, BOUNTY_RESET_HOUR);
  let guess = local - tzOffsetMs(ms);
  guess = local - tzOffsetMs(guess);
  return guess;
}

/** FNV-1a 32 bits. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BountyDef { monster: string; count: number; xp: number; gold: number }

/** Quantidades possíveis por abate (monstros fortes pedem menos). */
const COUNTS_LOW = [15, 20, 25, 30];
const COUNTS_HIGH = [10, 15, 20];

/** Índice de faixa válido (save corrompido ou chamada errada não geram ouro negativo nem semente diferente). */
export function clampBand(band: number): number {
  return Number.isFinite(band) ? Math.max(0, Math.min(BOUNTY_BANDS.length - 1, Math.floor(band))) : 0;
}

/** Valores de uma recompensa: XP de bônus = a XP dos próprios abates (dobra a caçada); ouro ≈ o dos abates + fixo por faixa. */
function bountyFor(monster: string, d: MonsterDef, count: number, band: number): BountyDef {
  const avgGold = d.gold ? (d.gold[0] + d.gold[1]) / 2 : 0;
  return { monster, count, xp: Math.round(count * d.xp), gold: Math.round(count * avgGold * 0.8 + 50 * (band + 1)) };
}

/** As 3 recompensas do dia para a faixa `band` (mesmo dia + faixa = mesmas recompensas para todos). */
export function generateBounties(day: string, band: number, defs: (id: string) => MonsterDef | undefined = monsterDef): BountyDef[] {
  band = clampBand(band);
  const b = BOUNTY_BANDS[band]!;
  const rng = mulberry32(hashStr(`${day}:${band}`));
  const pool = [...b.monsters];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  const out: BountyDef[] = [];
  for (const id of pool) {
    if (out.length >= BOUNTIES_PER_DAY) break;
    const d = defs(id);
    if (!d) continue;
    const opts = d.level >= 24 ? COUNTS_HIGH : COUNTS_LOW;
    out.push(bountyFor(id, d, opts[Math.floor(rng() * opts.length)]!, band));
  }
  return out;
}

/**
 * Lista do dia gravada (ciclo 14: cada recompensa leva o id do monstro `m` e a quantidade `c`). Assim a lista não
 * muda se BOUNTY_BANDS mudar no meio do dia (deploy). Gravação antiga, sem `m`/`c`, ou com monstro que não existe
 * mais: refaz o sorteio do dia + faixa, como antes. XP e ouro são recalculados (seguem os dados atuais do monstro).
 */
export function restoreBounties(
  day: string, band: number, saved: readonly { m?: unknown; c?: unknown }[], defs: (id: string) => MonsterDef | undefined = monsterDef,
): BountyDef[] {
  band = clampBand(band);
  const out: BountyDef[] = [];
  for (const x of saved.slice(0, BOUNTIES_PER_DAY)) {
    const d = typeof x?.m === "string" ? defs(x.m) : undefined;
    const c = Number(x?.c);
    if (!d || !Number.isInteger(c) || c <= 0) return generateBounties(day, band, defs);
    out.push(bountyFor(x.m as string, d, c, band));
  }
  return out.length ? out : generateBounties(day, band, defs);
}
