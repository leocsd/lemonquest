// Estagiário (2026-11-01, spec docs/superpowers/specs/2026-11-01-estagiario-design.md; v2 em
// docs/superpowers/specs/2026-11-02-estagiario-v2-estrategia.md; v3 em
// docs/superpowers/specs/2026-11-02-estagiario-v3-abordagem.md): bot de caça do próprio jogo.
// Aqui só as regras puras (o servidor decide e age em server/systems/estagiario.ts; o cliente só configura).
import { castableBy, familiesFor, type SpellGroup } from "./data/spellFamilies.ts";
import { spellDef, spellMana, spellsFor, type ConditionId, type SpellDef } from "./data/spells.ts";
import type { QuickPotionKind } from "./itemRules.ts";
import type { Vocation } from "./types.ts";

export type CuraAcao = { magia: string } | { pocao: QuickPotionKind };
/** `aliado` (v2): um colega de grupo a até o raio da magia abaixo de `abaixoDe`% → cura em grupo (só magia "party"). */
export type CuraQuando = "vida" | "mana" | "aliado";
export interface RegraCura { quando: CuraQuando; abaixoDe: number; acao: CuraAcao }
/**
 * Conta os monstros selvagens a até `raio` tiles; com `minBichos` ou mais, conjura `magia` (magia, família ou grupo).
 * v2: `manaMin` (%) substitui a reserva geral só nesta regra (ausente = a reserva geral); `vidaAlvoMin` (%) não gasta a
 * magia num alvo com menos vida que isso (ausente = qualquer vida).
 */
export interface RegraAtaque { minBichos: number; raio: number; magia: string; manaMin?: number; vidaAlvoMin?: number }
/** Quando o buff vale: sempre, só em combate (deu/levou dano há pouco) ou só fora dele. */
export type BuffQuando = "sempre" | "combate" | "fora";
/**
 * Buff (ou invocação, v2) mantido: reconjura `magia` quando a condição dela acaba (ou a invocação some).
 * `manaMin` (%): só com mana a partir daí (ausente = só a mana da própria magia, ver escolherBuff).
 */
export interface RegraBuff { magia: string; quando: BuffQuando; manaMin?: number }
/**
 * v3 etapa 1 (2026-11-02, dono: "quando a vida abaixou muito, ele não usou pote" — a Cura nascia desligada a cada
 * entrada): o que o jogador deixou ligado fica salvo no personagem e volta ao entrar de novo. A rota não (gasta turno).
 * Só os `true` são gravados.
 */
export interface EstagiarioLigado { cura?: boolean; ataque?: boolean; buffs?: boolean }
export const LIGADOS: readonly (keyof EstagiarioLigado)[] = ["cura", "ataque", "buffs"];
/** Diário (v3 etapa 1): de onde veio cada anotação, para a janela rotular. */
export type DiarioCanal = "cura" | "pocao" | "buff" | "comer" | "rota" | "interruptor" | "aviso";
/** Uma linha do diário: quando (ms epoch), o canal e o texto curto em português ("vida 42% → poção de vida, +450"). */
export interface DiarioItem { t: number; canal: DiarioCanal; texto: string }
/** Quantas linhas o diário guarda (servidor e janela). */
export const DIARIO_MAX = 50;
/** `portal`: o tile do portal pisado na gravação (a rota anda até ele para atravessar de novo). */
export interface PontoRota { x: number; y: number; portal?: boolean }
export interface RotaCaca { nome: string; pontos: PontoRota[] }
/** `colega` (v3, caçar com amigo): o colega seguido morreu, saiu do grupo, saiu do jogo ou sumiu — o seguir desligou. */
export type AlarmeTipo = "pocao" | "vidaBaixa" | "jogador" | "atacado" | "privada" | "turno" | "mochila" | "morte" | "colega";
/**
 * v3 etapa 3: "simples" = um perfil de três números mais o recomendado da vocação (as listas de regras ficam guardadas
 * para o modo avançado); "avancado" = as listas de regras, como na v2.
 */
export type Modo = "simples" | "avancado";
/** Perfil por nome: o save guarda só o nome, então a versão atual do preset vale na hora (sem "configuração antiga"). */
export type Preset = "seguro" | "equilibrado" | "agressivo";
export const PRESETS: readonly Preset[] = ["seguro", "equilibrado", "agressivo"];
/**
 * Os três números do modo simples (% de vida/mana): abaixo de `emergencia`, poção e magia de cura saem juntas; entre a
 * emergência e `conforto`, a melhor cobertura por custo (a magia se cobre ≥ COBERTURA_MAGIA do que falta sem furar a
 * reserva, senão a poção); abaixo de `reserva` de mana, poção de mana e nenhuma magia de ataque.
 */
export interface Perfil { emergencia: number; conforto: number; reserva: number }
export const PERFIL_LIMITES = { emergencia: { lo: 5, hi: 60 }, conforto: { lo: 10, hi: 90 }, reserva: { lo: 0, hi: 60 } } as const;
/** O conforto fica pelo menos isto acima da emergência (senão a faixa do meio some). */
export const CONFORTO_ACIMA = 5;
export interface EstagiarioConfig {
  /** v3: qual parte desta configuração o tick usa (ver `configEfetiva`). */
  modo: Modo;
  /** v3: null = os deslizadores do jogador (`perfil` próprio); com nome, `perfil` vem do preset e não é gravado. */
  preset: Preset | null;
  /** v3: os números do modo simples. */
  perfil: Perfil;
  cura: RegraCura[];
  ataque: RegraAtaque[];
  /** Buffs mantidos ativos (2026-11-01, pedido do dono), na ordem. */
  buffs: RegraBuff[];
  /** Abaixo desta % de mana não conjura magia de ataque (sobra para a cura). Só o ataque: buff tem a própria regra. */
  reservaMana: number;
  rotas: RotaCaca[];
  /** Alarmes desligados pelo jogador (ausente/true = ligado). "morte" não desliga. */
  alarmes: Partial<Record<AlarmeTipo, boolean>>;
  /** % de vida do alarme "vidaBaixa". */
  vidaAlarme: number;
  /** v2: come sozinho quando o "alimentado" está acabando (com a Cura ligada). */
  comer: boolean;
  /**
   * v2 (decisão do dono, 2026-11-02): com a rota rodando, quem ataca à distância para de perseguir a esta distância do
   * alvo e recua um passo quando um monstro corpo a corpo encosta. 0 = colado (o cavaleiro); 2–4 tiles.
   */
  distancia: number;
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
export const ALARMES: readonly AlarmeTipo[] = ["pocao", "vidaBaixa", "jogador", "atacado", "privada", "turno", "mochila", "morte", "colega"];
/**
 * Caçar com amigo (v3, decisões do dono em 2026-11-02: gasta turno; só no mesmo grupo; o seguidor prefere o alvo do
 * colega; o líder com rota espera). O colega a mais que isto (ou sem caminho) por SEGUIR_SUMIU_MS desliga o seguir.
 */
export const SEGUIR_MAX_TILES = 15;
export const SEGUIR_SUMIU_MS = 10_000;
/** Líder com rota: espera um seguidor vivo a mais de ESPERAR_TILES (volta a andar quando todos estão a até ESPERAR_PERTO_TILES), no máximo ESPERAR_MAX_MS por vez. */
export const ESPERAR_TILES = 8;
export const ESPERAR_PERTO_TILES = 4;
export const ESPERAR_MAX_MS = 30_000;
/** Distâncias que a opção "manter distância" aceita (0 = colado). */
export const DISTANCIAS: readonly number[] = [0, 2, 3, 4];
/** Recuando, nunca mais longe que isto de onde a luta começou (a rota não deriva para outro spawn). */
export const RECUO_MAX_TILES = 6;
/** Come quando o "alimentado" tem menos que isto pela frente. */
export const COMER_ANTES_MS = 60_000;

const int = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const cleanNome = (raw: unknown): string =>
  typeof raw === "string" ? raw.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, NOME_ROTA_MAX).trim() : "";
/** Campo opcional em % (0 ou inválido = ausente). */
const pctOpcional = (v: unknown): number | undefined => { const n = int(v, 0, 100, 0); return n > 0 ? n : undefined; };

const curaDaVocacao = (v: Vocation): string => (v === "fairy" ? "fairy_kiss" : "light_heal");

/**
 * Cura recomendada por vocação (afinada no arnês de balanço, 2026-11-02, dono: "o pote cura muito mais e a skill come
 * tempo de skills para atacar"): a POÇÃO é a cura principal — cura de uma vez (a Grande, 450, é 61 % da vida de um
 * cavaleiro lv 40 contra 15 % do Limpar Feridas) e não ocupa a recarga global, que fica livre para as magias de ataque.
 * A cura própria da vocação e a Cura comum (mesmo limiar; a Cura só sai enquanto a própria está trancada pelo level)
 * ficam de emergência, para quando a poção está em recarga. Medido contra 4 monstros da faixa: cavaleiro lv 40 de 42
 * para 58 abates em 4 min, paladino de 40 para 50, com a vida mínima mais alta. Magos mantêm a Cura (36 % da vida por
 * 70 de mana, pool grande) como cura corrente ao lado da poção. Paladino com a poção a 60 %: mesmos abates, vida mínima
 * 44–51 % em vez de 25–39 %. A poção de mana alimenta as magias (cavaleiro 25 %, paladino 30 %, magos 35 %: mais baixo
 * derruba os abates, mais alto só gasta poção).
 */
export function curaRecomendada(v: Vocation): RegraCura[] {
  const hp = (abaixoDe: number): RegraCura => ({ quando: "vida", abaixoDe, acao: { pocao: "hp" } });
  const mp = (abaixoDe: number): RegraCura => ({ quando: "mana", abaixoDe, acao: { pocao: "mana" } });
  const magia = (abaixoDe: number, id: string): RegraCura => ({ quando: "vida", abaixoDe, acao: { magia: id } });
  if (v === "knight") return [hp(50), magia(35, "wound_cleansing"), magia(35, "light_heal"), mp(25)];
  if (v === "paladin") return [hp(60), magia(35, "divine_healing"), magia(35, "light_heal"), mp(30)];
  return [hp(50), magia(55, curaDaVocacao(v)), mp(35)];
}

/**
 * Quantos bichos a até `raio` tiles pedem a magia de área: as de raio 3+ pedem 2; as outras (raio 1–2 e ondas) valem
 * com 1. Afinado no arnês (2026-11-02): com 2–3 bichos as áreas ficavam paradas contra um monstro só e o dano era o do
 * golpe de alvo único; com 1 o feiticeiro passou de 92 para 131 abates em 4 min contra 2 monstros (Explosão de Fogo e
 * ondas no alvo sozinho), o druida de 94 para 134 e o cavaleiro de 96 para 121 (Giro Feroz), à custa de mais poção de
 * mana. As de raio 3+ (Inferno, Nevasca, Terremoto, Tempestades) custam 110–260 de mana e esperam 2.
 */
const minBichosArea = (s: SpellDef): number => ((s.target === "area_self" || s.target === "area_target") && (s.radius ?? 1) >= 3 ? 2 : 1);
/** Raio (tiles) em volta do personagem que conta os bichos para a magia: o raio dela, ou o comprimento da onda. */
const raioDaMagia = (s: SpellDef): number => Math.max(1, Math.min(4, s.target === "wave" ? s.length ?? 1 : s.radius ?? 1));

/**
 * Ataque recomendado por vocação, magia por magia (2026-11-01, pedido do dono: "por skill, área e alvo, e a quantidade
 * de tiles que cada uma pega"): cada magia de dano em área (em volta, no alvo ou onda) vira uma regra com o raio dela e
 * 1–3 bichos, da mais forte (level maior) para a mais fraca; a última regra é a tecla inteligente "no alvo" da vocação,
 * que solta o golpe de alvo único mais forte pronto (do level 1 em diante). Magias acima do level são puladas sozinhas.
 */
export function ataqueRecomendado(v: Vocation): RegraAtaque[] {
  const alvo = familiesFor(v).find((f) => f.id.endsWith(":target"));
  // A família de alvo do cavaleiro só tem magia a partir do lv 30 (Golpe Brutal): a Investida (lv 10) cobre o meio.
  const extras: RegraAtaque[] = v === "knight" ? [{ minBichos: 1, raio: 1, magia: "charge" }] : [];
  const area = spellsFor(v)
    .filter((s) => s.damage && !s.heal && (s.target === "area_self" || s.target === "area_target" || s.target === "wave"))
    .sort((a, b) => b.level - a.level)
    .slice(0, REGRAS_MAX - extras.length - (alvo ? 1 : 0))
    .map((s): RegraAtaque => ({ minBichos: minBichosArea(s), raio: raioDaMagia(s), magia: s.id }));
  return alvo ? [...area, ...extras, { minBichos: 1, raio: 1, magia: alvo.id }] : [...area, ...extras];
}

/**
 * Magia de buff (2026-11-01): em si mesmo ou no grupo, aplica uma condição e não dá dano, não cura nem invoca
 * (Pés Ligeiros, Pele de Ferro, Fúria, Escudo de Mana, Muralha de Escudos, Luz Restauradora, Banho de Espuma...).
 */
export const ehBuff = (s: SpellDef): boolean =>
  (s.target === "self" || s.target === "party") && !!s.condition && !s.damage && !s.heal && !s.summon;
/** Invocação (v2): entra na aba Buffs como "manter invocado" (Invocar Lobo, Amiguinha Borboleta). */
export const ehInvocacao = (s: SpellDef): boolean => !!s.summon;

/** Buffs e invocações que a vocação pode escolher, do level menor para o maior. */
export const buffsDaVocacao = (v: Vocation): SpellDef[] => spellsFor(v).filter((s) => ehBuff(s) || ehInvocacao(s));

/**
 * Buffs recomendados por vocação: a pressa sempre (fora de combate também, para andar a rota mais rápido); o cavaleiro
 * segura Pele de Ferro e Fúria na luta (medido: sempre ou sem buff rende o mesmo em bando, mas a vida mínima cai);
 * magos e a fada mantêm o escudo de mana SEMPRE (afinado 2026-11-02: o primeiro golpe do bando chegava antes do escudo
 * "em combate"; sempre ligado, +6 % de abates e vida mínima 20 % em vez de 7 % no lv 40); druida e fada mantêm a
 * invocação na luta (sempre gasta 90 de mana a cada minuto andando e rendeu menos). Acima do level, a regra é pulada.
 */
export function buffsRecomendados(v: Vocation): RegraBuff[] {
  const b = (magia: string, quando: BuffQuando): RegraBuff => ({ magia, quando });
  if (v === "knight") return [b("swift_feet", "sempre"), b("iron_skin", "combate"), b("berserk", "combate")];
  if (v === "paladin") return [b("swift_feet", "sempre")];
  if (v === "fairy") return [b("bubble_bath", "sempre"), b("swift_wings", "sempre"), b("summon_butterfly", "combate")];
  if (v === "druid") return [b("mana_shield", "sempre"), b("swift_feet", "sempre"), b("summon_wolf", "combate")];
  return [b("mana_shield", "sempre"), b("swift_feet", "sempre")];
}

const RESERVA_MANA: Partial<Record<Vocation, number>> = { knight: 20, paladin: 25 };

/** Distância padrão da opção "manter distância": o cavaleiro luta colado; os outros a 3 tiles (decisão do dono). */
export const distanciaPadrao = (v: Vocation): number => (v === "knight" ? 0 : 3);

/**
 * Presets do modo simples por vocação (emergência / conforto / reserva de mana, em %). Partem dos limiares medidos na
 * v2 (poção a 50/60 %, cura própria a 35 %, reserva 25/30/35) e foram conferidos no arnês de balanço
 * (estagiarioBalance.test.ts: o equilibrado rende como as regras recomendadas da v2, o seguro mantém a vida mínima
 * mais alta, o agressivo gasta menos poção).
 */
const PERFIS: Record<Preset, { knight: Perfil; paladin: Perfil; mago: Perfil }> = {
  seguro: { knight: { emergencia: 40, conforto: 65, reserva: 35 }, paladin: { emergencia: 40, conforto: 70, reserva: 40 }, mago: { emergencia: 40, conforto: 65, reserva: 45 } },
  equilibrado: { knight: { emergencia: 30, conforto: 50, reserva: 25 }, paladin: { emergencia: 30, conforto: 60, reserva: 30 }, mago: { emergencia: 30, conforto: 55, reserva: 35 } },
  // Magos: a reserva fica em 30 (com 25 o escudo ficava sem mana e a vida mínima caía a 5 % no lv 40/60 — o bando bate
  // de uma vez quando ele cai); a agressividade está nos limiares de cura.
  agressivo: { knight: { emergencia: 20, conforto: 40, reserva: 20 }, paladin: { emergencia: 20, conforto: 50, reserva: 25 }, mago: { emergencia: 25, conforto: 45, reserva: 30 } },
};
export const perfilDoPreset = (preset: Preset, v: Vocation): Perfil => ({ ...PERFIS[preset][v === "knight" ? "knight" : v === "paladin" ? "paladin" : "mago"] });

/** Perfil próprio vindo do save ou do cliente: números nas faixas, conforto pelo menos CONFORTO_ACIMA acima da emergência. */
export function sanitizePerfil(raw: unknown, v: Vocation): Perfil {
  const d = perfilDoPreset("equilibrado", v), r = obj(raw);
  const L = PERFIL_LIMITES;
  const emergencia = int(r?.emergencia, L.emergencia.lo, L.emergencia.hi, d.emergencia);
  return {
    emergencia,
    conforto: Math.max(emergencia + CONFORTO_ACIMA, int(r?.conforto, L.conforto.lo, L.conforto.hi, d.conforto)),
    reserva: int(r?.reserva, L.reserva.lo, L.reserva.hi, d.reserva),
  };
}

export function estagiarioPadrao(v: Vocation): EstagiarioConfig {
  return {
    modo: "simples",
    preset: "equilibrado",
    perfil: perfilDoPreset("equilibrado", v),
    cura: curaRecomendada(v),
    ataque: ataqueRecomendado(v),
    buffs: buffsRecomendados(v),
    reservaMana: RESERVA_MANA[v] ?? 30,
    rotas: [],
    alarmes: {},
    vidaAlarme: 25,
    comer: true,
    distancia: distanciaPadrao(v),
  };
}

function regraCura(raw: unknown, v: Vocation): RegraCura | null {
  const r = obj(raw);
  if (!r || (r.quando !== "vida" && r.quando !== "mana" && r.quando !== "aliado")) return null;
  const a = obj(r.acao);
  if (!a) return null;
  let acao: CuraAcao | null = null;
  if (a.pocao === "hp" || a.pocao === "mana") acao = { pocao: a.pocao };
  else if (typeof a.magia === "string") {
    const s = spellDef(a.magia);
    if (s?.heal && s.vocations.includes(v)) acao = { magia: s.id };
  }
  // Aliado: só cura em grupo (a regra olha a vida dos colegas; poção e cura própria não os alcançam).
  if (r.quando === "aliado" && (!acao || !("magia" in acao) || spellDef(acao.magia)?.target !== "party")) return null;
  return acao ? { quando: r.quando, abaixoDe: int(r.abaixoDe, 1, 99, 50), acao } : null;
}

function regraAtaque(raw: unknown, v: Vocation, groups: readonly SpellGroup[]): RegraAtaque | null {
  const r = obj(raw);
  if (!r || typeof r.magia !== "string" || !castableBy(r.magia, v, groups)) return null;
  const s = spellDef(r.magia);
  if (s && (!s.damage || s.heal)) return null; // magia solta: só de dano (família/grupo já são de ataque)
  const out: RegraAtaque = { minBichos: int(r.minBichos, 1, 8, 1), raio: int(r.raio, 1, 4, 1), magia: r.magia };
  const manaMin = pctOpcional(r.manaMin), vidaAlvoMin = pctOpcional(r.vidaAlvoMin);
  if (manaMin !== undefined) out.manaMin = manaMin;
  if (vidaAlvoMin !== undefined) out.vidaAlvoMin = vidaAlvoMin;
  return out;
}

function regraBuff(raw: unknown, v: Vocation): RegraBuff | null {
  const r = obj(raw);
  if (!r || typeof r.magia !== "string") return null;
  const s = spellDef(r.magia);
  if (!s || !s.vocations.includes(v) || !(ehBuff(s) || ehInvocacao(s))) return null;
  // `emCombate` é o formato salvo antes da v2 (true = só em combate).
  const quando: BuffQuando = r.quando === "combate" || r.quando === "fora" || r.quando === "sempre" ? r.quando : r.emCombate === true ? "combate" : "sempre";
  const out: RegraBuff = { magia: s.id, quando };
  const manaMin = pctOpcional(r.manaMin);
  if (manaMin !== undefined) out.manaMin = manaMin;
  return out;
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
  const cura = Array.isArray(r.cura) ? list(r.cura, (e) => regraCura(e, v), REGRAS_MAX) : curaRecomendada(v);
  const ataque = Array.isArray(r.ataque) ? list(r.ataque, (e) => regraAtaque(e, v, groups), REGRAS_MAX) : ataqueRecomendado(v);
  // Sem a lista no que veio salvo (configuração de antes dos buffs): vale o recomendado; lista vazia fica vazia.
  const listaBuffs = Array.isArray(r.buffs) ? buffs : buffsRecomendados(v);
  // v3: save sem `modo` (de antes da v3) — quem nunca mexeu nas listas entra no modo simples; quem personalizou fica no
  // avançado com as suas regras (e pode escolher o simples na aba Perfil).
  const recomendadas = JSON.stringify([cura, ataque, listaBuffs]) === JSON.stringify([curaRecomendada(v), ataqueRecomendado(v), buffsRecomendados(v)]);
  const modo: Modo = r.modo === "avancado" || r.modo === "simples" ? r.modo : recomendadas ? "simples" : "avancado";
  const preset: Preset | null = (PRESETS as readonly unknown[]).includes(r.preset) ? (r.preset as Preset) : r.preset === null && obj(r.perfil) ? null : "equilibrado";
  return {
    modo,
    preset,
    perfil: preset ? perfilDoPreset(preset, v) : sanitizePerfil(r.perfil, v),
    cura,
    ataque,
    buffs: listaBuffs,
    reservaMana: int(r.reservaMana, 0, 90, RESERVA_MANA[v] ?? 30),
    rotas,
    alarmes,
    vidaAlarme: int(r.vidaAlarme, 1, 99, 25),
    comer: r.comer !== false,
    // Sem o campo (configuração de antes da v2): o padrão da vocação; valor fora da lista também.
    distancia: typeof r.distancia === "number" && DISTANCIAS.includes(r.distancia) ? r.distancia : distanciaPadrao(v),
  };
}

/**
 * v3: o que vai no save — só o que difere do padrão da vocação. O preset vai pelo nome (os números dele não), as
 * listas de regras só quando mexidas. `modo` vai sempre que algo mais vai (o save de antes da v3 não o tinha, e a
 * leitura o deduz das listas; com ele gravado a escolha do jogador vale mesmo com listas personalizadas no simples).
 */
export function compactar(c: EstagiarioConfig, v: Vocation): Partial<EstagiarioConfig> {
  const d = estagiarioPadrao(v);
  const out: Record<string, unknown> = {};
  const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (c.preset !== d.preset) out.preset = c.preset;
  if (c.preset === null) out.perfil = c.perfil;
  for (const k of ["cura", "ataque", "buffs", "rotas", "alarmes"] as const) if (!igual(c[k], d[k])) out[k] = c[k];
  for (const k of ["reservaMana", "vidaAlarme", "comer", "distancia"] as const) if (c[k] !== d[k]) out[k] = c[k];
  if (c.modo !== d.modo || Object.keys(out).length) out.modo = c.modo;
  return out as Partial<EstagiarioConfig>;
}

/**
 * v3: a configuração que o tick usa. No modo simples, o recomendado da vocação com a reserva de mana do perfil (a cura
 * em si é a política `decidirCura`; a lista de cura recomendada fica só para o alarme de poção); as listas guardadas
 * são do modo avançado e não valem.
 */
export function configEfetiva(c: EstagiarioConfig, v: Vocation): EstagiarioConfig {
  if (c.modo !== "simples") return c;
  return { ...c, cura: curaRecomendada(v), ataque: ataqueRecomendado(v), buffs: buffsRecomendados(v), reservaMana: c.perfil.reserva, distancia: distanciaPadrao(v) };
}

/** Cura esperada da magia (a fórmula de evalSpellFormula sem a variação), para a política do modo simples. */
export const curaEstimada = (f: { base: number; perLevel: number; perMagic: number }, level: number, magicLevel: number): number =>
  Math.max(0, Math.round(f.base + level * f.perLevel + magicLevel * f.perMagic));

/** Magias de cura própria da vocação até o level, com o custo de mana no level (a política do modo simples). */
export const curasProprias = (v: Vocation, level: number): { id: string; mana: number; heal: NonNullable<SpellDef["heal"]> }[] =>
  spellsFor(v).filter((s) => s.heal && s.target === "self" && s.level <= level).map((s) => ({ id: s.id, mana: spellMana(s, level), heal: s.heal! }));
/** A cura em grupo da vocação até o level (druida/fada), se houver. */
export const curaEmGrupo = (v: Vocation, level: number): SpellDef | undefined => spellsFor(v).find((s) => s.heal && s.target === "party" && s.level <= level);

/** A magia cobre pelo menos isto do que falta para ser a escolha na faixa de conforto (senão a poção). */
export const COBERTURA_MAGIA = 0.6;

export interface SituacaoCura {
  hp: number; maxHp: number; mana: number; maxMana: number;
  /** Por tipo: a recarga passou (`pronta`) e quanto recupera a poção que seria bebida (0 = nenhuma que o level/vocação deixem). */
  pocao: Record<QuickPotionKind, { pronta: boolean; recupera: number }>;
  /** Magias de cura própria até o level: prontas (recarga e mana), a cura esperada e o custo. */
  magias: readonly { id: string; pronta: boolean; cura: number; mana: number }[];
  /** Cura em grupo (druida/fada): pronta e se há colega ao alcance abaixo do conforto. */
  grupo?: { id: string; pronta: boolean; aliadoBaixo: boolean };
  /** Escudo de Mana ativo: o dano vai na mana, então a mana é a vida. */
  escudoDeMana: boolean;
}
/** Um canal por recarga: a poção (vida ou mana) e a magia saem no mesmo tick; `motivos` é o que segurou (diário). */
export interface DecisaoCura { pocao: QuickPotionKind | null; magia: string | null; motivos: string[] }

/**
 * Política de cura do modo simples (v3 etapa 3; canais da etapa 2): abaixo da emergência, poção e a magia de cura mais
 * forte pronta saem juntas; entre a emergência e o conforto, a magia se cobre ≥ COBERTURA_MAGIA do que falta e ainda
 * sobra a reserva de mana (o mago: a Cura cobre bem e a mana sobra), senão a poção (o cavaleiro: o Limpar Feridas cobre
 * pouco e a poção cura de uma vez), senão a magia que estiver pronta. Colega abaixo do conforto: a cura em grupo, quando
 * a magia não foi precisa para si. Mana abaixo da reserva: poção de mana, se o canal de poção não está servindo a vida;
 * com o Escudo de Mana a mana é a vida (limiar = conforto) e, na emergência de mana, a poção de mana passa na frente da
 * de vida a não ser que a vida também esteja na emergência.
 */
export function decidirCura(s: SituacaoCura, perfil: Perfil): DecisaoCura {
  const pct = s.maxHp > 0 ? (s.hp / s.maxHp) * 100 : 100;
  const manaPct = s.maxMana > 0 ? (s.mana / s.maxMana) * 100 : 100;
  const falta = Math.max(0, s.maxHp - s.hp);
  const motivos: string[] = [];
  let pocao: QuickPotionKind | null = null, magia: string | null = null;
  const temPocao = (k: QuickPotionKind) => s.pocao[k].pronta && s.pocao[k].recupera > 0;
  const semPocao = (k: QuickPotionKind) => {
    const nome = k === "hp" ? "poção de vida" : "poção de mana";
    motivos.push(s.pocao[k].recupera > 0 ? `${nome} em recarga` : `nenhuma ${nome} que você possa beber`);
  };
  const nome = (id: string) => spellDef(id)?.name ?? id;
  const semMagia = () => { if (s.magias.length) motivos.push(`${s.magias.map((m) => nome(m.id)).join(" e ")} em recarga ou sem mana`); };
  const melhor = [...s.magias].filter((m) => m.pronta).sort((a, b) => b.cura - a.cura)[0];
  if (pct < perfil.emergencia) {
    if (temPocao("hp")) pocao = "hp"; else semPocao("hp");
    if (melhor) magia = melhor.id; else semMagia();
  } else if (pct < perfil.conforto) {
    const cobre = melhor && falta > 0 ? Math.min(melhor.cura, falta) / falta : 0;
    const sobra = melhor && s.maxMana > 0 ? ((s.mana - melhor.mana) / s.maxMana) * 100 : 0;
    if (melhor && cobre >= COBERTURA_MAGIA && sobra >= perfil.reserva) magia = melhor.id;
    else if (temPocao("hp")) pocao = "hp";
    else if (melhor) magia = melhor.id;
    else { semPocao("hp"); semMagia(); }
  }
  if (s.grupo?.aliadoBaixo && !magia) {
    if (s.grupo.pronta) magia = s.grupo.id; else motivos.push(`${nome(s.grupo.id)} em recarga ou sem mana`);
  }
  const limiar = s.escudoDeMana ? perfil.conforto : perfil.reserva;
  if (manaPct < limiar && pocao === null) { if (temPocao("mana")) pocao = "mana"; else semPocao("mana"); }
  if (s.escudoDeMana && manaPct < perfil.emergencia && pocao === "hp" && pct >= perfil.emergencia && temPocao("mana")) pocao = "mana";
  return { pocao, magia, motivos };
}

export const alarmeLigado = (c: EstagiarioConfig, t: AlarmeTipo): boolean => t === "morte" || c.alarmes[t] !== false;

export function avancarTurno(t: TurnoEstado | undefined, now: number, rodando: boolean): TurnoEstado {
  if (!t || !Number.isFinite(t.ms) || !Number.isFinite(t.em)) return { ms: TURNO_MAX_MS, em: now };
  const dt = Math.max(0, now - t.em);
  const ms = rodando ? Math.max(0, t.ms - dt) : Math.min(TURNO_MAX_MS, t.ms + dt * TURNO_RECARGA);
  return { ms: Math.round(ms), em: now };
}

/** O que o jogador deixou ligado, vindo do save (qualquer coisa que não seja `true` vale desligado). */
export function sanitizeLigado(raw: unknown): EstagiarioLigado {
  const r = obj(raw);
  const out: EstagiarioLigado = {};
  if (r) for (const k of LIGADOS) if (r[k] === true) out[k] = true;
  return out;
}

/**
 * Cura a fazer agora: a primeira regra que vale e está pronta. `aliadoAbaixo(pct, acao)`: há colega de grupo ao
 * alcance da magia com menos de `pct`% de vida (regras "aliado"; ausente = nunca). `naoPronta(regra)` (v3, diário):
 * chamada para cada regra que vale mas cuja ação não está pronta — o servidor anota por que a cura está esperando.
 */
export function escolherCura(
  c: { hp: number; maxHp: number; mana: number; maxMana: number }, regras: readonly RegraCura[], pronto: (a: CuraAcao) => boolean,
  aliadoAbaixo?: (pct: number, acao: CuraAcao) => boolean, naoPronta?: (r: RegraCura) => void,
): CuraAcao | null {
  for (const r of regras) {
    if (r.quando === "aliado") {
      if (!aliadoAbaixo?.(r.abaixoDe, r.acao)) continue;
    } else {
      const [cur, max] = r.quando === "vida" ? [c.hp, c.maxHp] : [c.mana, c.maxMana];
      if (max <= 0 || (cur / max) * 100 >= r.abaixoDe) continue;
    }
    if (pronto(r.acao)) return r.acao;
    naoPronta?.(r);
  }
  return null;
}

/** Mana (%) abaixo da qual a regra de ataque não conjura: a dela (`manaMin`) ou a reserva geral. */
export const pisoDeMana = (r: RegraAtaque, reservaMana: number): number => r.manaMin ?? reservaMana;

/**
 * Ataque a conjurar: a primeira regra com mana no piso dela, alvo com vida bastante, magia pronta (`resolver`:
 * família/grupo → a magia) e bichos suficientes. Resolve antes de contar: a contagem depende da magia resolvida (onda
 * conta nos tiles da onda; área no alvo, em volta do alvo) e uma regra sem magia pronta nem precisa contar.
 */
export function escolherAtaque(
  regras: readonly RegraAtaque[], bichosEm: (raio: number, magia: string) => number, manaPct: number, reservaMana: number,
  resolver: (magia: string) => string | null, alvoPct = 100,
): string | null {
  for (const r of regras) {
    if (manaPct < pisoDeMana(r, reservaMana) || alvoPct < (r.vidaAlvoMin ?? 0)) continue;
    const id = resolver(r.magia);
    if (id && bichosEm(r.raio, id) >= r.minBichos) return id;
  }
  return null;
}

export interface ContextoBuff {
  /** Condição ativa no jogador (o buff só é reconjurado quando a dele acabou). */
  ativo(condicao: ConditionId): boolean;
  /** Há invocação viva do jogador (a regra de invocação espera ela sumir). */
  invocado(): boolean;
  /** Deu ou levou dano há pouco (regras "combate"/"fora"). */
  emCombate: boolean;
  mana: number;
  maxMana: number;
  /** Pronta: level, recarga própria e global e a mana da própria magia (SpellSystem.ready). */
  pronto(magia: string): boolean;
}

/**
 * Buff a conjurar agora: o primeiro da lista cujo efeito não está ativo, que vale no momento (sempre / em combate / fora),
 * com a mana mínima da regra (se houver) e pronto. v2: a reserva de mana do ATAQUE não segura mais os buffs — era ela que
 * deixava o Pés Ligeiros parado enquanto o Escudo de Mana, a única exceção, seguia saindo. Também não se exige "sobra
 * para uma cura": medido, isso recriava o mesmo problema sem poção de mana (cavaleiro e paladino vivem com a mana no
 * chão e o Pés Ligeiros ficava ativo 13 % do tempo), e os buffs custam uma fração da regeneração (20–60 de mana a cada
 * 15–30 s). Quem quiser segurar um buff caro põe `manaMin` nele.
 */
export function escolherBuff(regras: readonly RegraBuff[], ctx: ContextoBuff): string | null {
  const manaPct = ctx.maxMana > 0 ? (ctx.mana / ctx.maxMana) * 100 : 0;
  for (const r of regras) {
    const s = spellDef(r.magia);
    if (!s || (!s.condition && !s.summon)) continue;
    if ((r.quando === "combate" && !ctx.emCombate) || (r.quando === "fora" && ctx.emCombate)) continue;
    if (s.summon ? ctx.invocado() : ctx.ativo(s.condition!.id)) continue;
    if (r.manaMin !== undefined && manaPct < r.manaMin) continue;
    if (ctx.pronto(s.id)) return s.id;
  }
  return null;
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export interface Recuo {
  pos: { x: number; y: number };
  alvo: { x: number; y: number };
  /** Monstros corpo a corpo encostados (é deles que se recua). */
  ameacas: readonly { x: number; y: number }[];
  /** Onde se quer ficar do alvo (a opção "manter distância", já limitada ao alcance). */
  distancia: number;
  /** O alvo tem de continuar a até isto (o alcance do ataque). */
  alcance: number;
  /** Onde a luta começou: nunca mais que RECUO_MAX_TILES dali. */
  origem: { x: number; y: number };
  /** Tile andável e livre (sem criatura, fora da PZ). */
  livre(x: number, y: number): boolean;
  /** Do tile dá para ver o alvo. */
  visao(x: number, y: number): boolean;
}

/**
 * Para onde recuar um passo (v2, "manter distância"): o vizinho livre que sai de perto de TODAS as ameaças (a pelo menos
 * 2 tiles), mantém o alvo no alcance e à vista e não passa de RECUO_MAX_TILES da origem da luta. Entre os que servem:
 * o mais longe das ameaças; depois o que fica a até `distancia` do alvo (a perseguição não puxa de volta); depois o
 * mais perto dessa distância; por fim o passo reto (a diagonal demora 1,4×). null = encurralado: fica e luta.
 */
export function escolherRecuo(r: Recuo): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bestKey: number[] = [];
  // Comparação lexicográfica: a primeira posição diferente decide (maior ganha).
  const melhor = (a: number[], b: number[]): boolean => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!; return false; };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const t = { x: r.pos.x + dx, y: r.pos.y + dy };
    const dAlvo = cheb(t, r.alvo);
    if (dAlvo < 1 || dAlvo > r.alcance || cheb(t, r.origem) > RECUO_MAX_TILES || !r.livre(t.x, t.y) || !r.visao(t.x, t.y)) continue;
    const longe = Math.min(3, ...r.ameacas.map((a) => cheb(t, a)));
    if (longe < 2) continue; // ainda encostado em alguma ameaça: não adianta
    const key = [longe, dAlvo <= r.distancia ? 1 : 0, -Math.abs(dAlvo - r.distancia), dx && dy ? 0 : 1];
    if (!best || melhor(key, bestKey)) { best = t; bestKey = key; }
  }
  return best;
}

export function indiceMaisProximo(pontos: readonly PontoRota[], pos: { x: number; y: number }): number {
  let best = -1, bestD = Infinity;
  pontos.forEach((p, i) => { const d = cheb(p, pos); if (d < bestD) { best = i; bestD = d; } });
  return best;
}

export const novaGravacao = (pos: { x: number; y: number }): Gravacao => ({ pontos: [{ x: pos.x, y: pos.y }], dir: null, desdeUltimo: 0 });

/**
 * Um passo do jogador durante a gravação (`de` → `para`, posições de ticks seguidos). Salto (mais de 1 tile): `portal`
 * é o tile do portal pisado (o servidor o acha: no mesmo tick o passo chega nele e o portal já leva ao destino, então o
 * tick só vê `de`, ao lado, e `para`); ausente = o próprio `de` (compatível); null = não foi portal (Investida, /tp,
 * viagem de NPC): origem e destino entram como pontos comuns, sem portal.
 */
export function gravarPasso(
  g: Gravacao, de: { x: number; y: number }, para: { x: number; y: number }, portal?: { x: number; y: number } | null,
): Gravacao {
  if (g.pontos.length >= PONTOS_MAX || (de.x === para.x && de.y === para.y)) return g;
  const pontos = [...g.pontos];
  const push = (p: PontoRota) => { if (pontos.length < PONTOS_MAX) pontos.push(p); };
  if (cheb(de, para) > 1) {
    const last = pontos[pontos.length - 1];
    if (portal === null) { // salto sem portal: a origem (se ainda não é o último ponto) e o destino
      if (!last || last.x !== de.x || last.y !== de.y) push({ x: de.x, y: de.y });
    } else {
      const t = portal ?? de;
      push({ x: t.x, y: t.y, portal: true });
    }
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
