// Edição pura da configuração do Estagiário (sem DOM nem rede, para testar no node: store.test.ts). A janela só junta os
// pedaços; o servidor sanitiza tudo de novo (shared/estagiario.ts).
import {
  NOME_ROTA_MAX, REGRAS_MAX, ehInvocacao, spellDef, type AlarmeTipo, type BuffQuando, type EstagiarioConfig, type RegraAtaque, type RegraBuff, type RegraCura,
  type SpellDef,
} from "@lemonquest/shared";

/** Regra nova de cura (vida abaixo de 50% → poção de vida), no fim; com REGRAS_MAX regras, a mesma lista. */
export function addRegraCura(l: readonly RegraCura[]): readonly RegraCura[] {
  if (l.length >= REGRAS_MAX) return l;
  return [...l, { quando: "vida", abaixoDe: 50, acao: { pocao: "hp" } }];
}

/** Regra nova de ataque com `magia` (magia, família ou grupo), 1 bicho a até 1 tile. */
export function addRegraAtaque(l: readonly RegraAtaque[], magia: string): readonly RegraAtaque[] {
  if (l.length >= REGRAS_MAX || !magia) return l;
  return [...l, { minBichos: 1, raio: 1, magia }];
}

/** Buff novo com `magia`, valendo sempre, no fim; sem magia, repetido ou cheia, a mesma lista. */
export function addRegraBuff(l: readonly RegraBuff[], magia: string): readonly RegraBuff[] {
  if (l.length >= REGRAS_MAX || !magia || l.some((r) => r.magia === magia)) return l;
  return [...l, { magia, quando: "sempre" }];
}

/** Rótulo do "quando" do buff (select da aba Buffs). */
export const QUANDO_BUFF: readonly { id: BuffQuando; label: string }[] = [
  { id: "sempre", label: "sempre" }, { id: "combate", label: "só em combate" }, { id: "fora", label: "só fora de combate" },
];

/** Nome do buff/invocação na lista, com "(invocação)" e o level quando acima do do jogador. */
export const rotuloBuff = (s: SpellDef, level: number): string =>
  `${s.name}${ehInvocacao(s) ? " (invocação)" : ""}${s.level > level ? ` (lv ${s.level})` : ""}`;

/** Rótulo da opção de distância ("colado" ou "N tiles"). */
export const rotuloDistancia = (d: number): string => (d <= 0 ? "colado" : `${d} tiles`);

/** Sobe (`-1`) ou desce (`+1`) a regra `i`; nas pontas, a mesma lista. */
export function moverRegra<T>(l: readonly T[], i: number, delta: -1 | 1): readonly T[] {
  const j = i + delta;
  if (i < 0 || i >= l.length || j < 0 || j >= l.length) return l;
  const n = [...l];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}

export function removerRegra<T>(l: readonly T[], i: number): readonly T[] {
  if (i < 0 || i >= l.length) return l;
  return l.filter((_, k) => k !== i);
}

export function setRegra<T extends object>(l: readonly T[], i: number, patch: Partial<T>): readonly T[] {
  if (i < 0 || i >= l.length) return l;
  return l.map((r, k) => (k === i ? { ...r, ...patch } : r));
}

/** Nome de rota como o servidor guarda (sem controle, espaços juntos, até NOME_ROTA_MAX). */
export const limparNomeRota = (s: string): string => s.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, NOME_ROTA_MAX).trim();

/** Renomeia a rota `antigo`; null = nome vazio, já usado por outra rota ou rota que não existe. */
export function renomearRota(c: EstagiarioConfig, antigo: string, novo: string): EstagiarioConfig | null {
  const nome = limparNomeRota(novo);
  if (!nome || !c.rotas.some((r) => r.nome === antigo)) return null;
  if (c.rotas.some((r) => r.nome !== antigo && r.nome.toLowerCase() === nome.toLowerCase())) return null;
  return { ...c, rotas: c.rotas.map((r) => (r.nome === antigo ? { ...r, nome } : r)) };
}

export const apagarRota = (c: EstagiarioConfig, nome: string): EstagiarioConfig => ({ ...c, rotas: c.rotas.filter((r) => r.nome !== nome) });

/** Liga/desliga um alarme (ligado = sem chave, como o servidor guarda). "morte" é só informativo: não muda. */
export function alternarAlarme(c: EstagiarioConfig, t: AlarmeTipo): EstagiarioConfig {
  if (t === "morte") return c;
  const alarmes = { ...c.alarmes };
  if (alarmes[t] === false) delete alarmes[t]; else alarmes[t] = false;
  return { ...c, alarmes };
}

/** Turno restante em "h:mm" (minutos para baixo). */
export function fmtTurno(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Turno que a janela mostra agora: o servidor manda a cada mudança e a cada 10 s com a rota rodando; entre um envio e
 * outro a conta segue a mesma regra (gasta rodando sem pausa, recarrega 1/12 desligada ou pausada, até o teto).
 */
export function turnoMostrado(
  e: { turnoMs: number; rota: string | null; pausa: string }, recebidoEm: number, now: number, max: number, recarga: number,
): number {
  const dt = Math.max(0, now - recebidoEm);
  // Pausada conta como parada no servidor (avancarTurno com rodando = false): recarrega.
  if (e.rota !== null && e.pausa === "") return Math.max(0, e.turnoMs - dt);
  return Math.min(max, e.turnoMs + dt * recarga);
}

/**
 * Onde a regra de ataque conta os bichos (como o servidor conta): a área no alvo em volta do alvo, a onda nos tiles
 * dela virada para o alvo e o resto (área em volta, alvo único, família, grupo) em volta do jogador.
 */
export function ondeConta(magia: string): string {
  const t = spellDef(magia)?.target;
  return t === "area_target" ? "em volta do alvo" : t === "wave" ? "na onda virada para o alvo" : "em volta de você";
}

/** Ponto da rota em que o Estagiário está ("ponto 3/12"); sem rota, "". */
export const fmtPonto = (p: { i: number; n: number } | null): string => (p ? `ponto ${p.i + 1}/${p.n}` : "");
