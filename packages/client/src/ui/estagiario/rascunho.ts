// Rascunho da janela do Estagiário (sem DOM nem rede, testado em rascunho.test.ts). A janela edita uma cópia local dos
// campos configuráveis e só manda ao servidor no "Aplicar". Antes, cada número digitado ia na hora e o eco do servidor
// (e o estado periódico de 10 s com a rota rodando) redesenhava o campo com o valor antigo no meio da digitação.
// Rotas não entram aqui: gravar, renomear e apagar continuam indo na hora (store.ts salvarConfig).
import type { EstagiarioConfig } from "@lemonquest/shared";

/** Os campos que a janela edita no rascunho (o resto da configuração, as rotas, vem sempre do servidor). */
export type Rascunho = Pick<EstagiarioConfig, "cura" | "ataque" | "buffs" | "reservaMana" | "alarmes" | "vidaAlarme">;

/** Faixas dos números, as mesmas do servidor (shared/estagiario.ts sanitizeEstagiario). */
export const LIMITES = {
  abaixoDe: { lo: 1, hi: 99, dflt: 50 },
  minBichos: { lo: 1, hi: 8, dflt: 1 },
  raio: { lo: 1, hi: 4, dflt: 1 },
  reservaMana: { lo: 0, hi: 90 },
  vidaAlarme: { lo: 1, hi: 99 },
} as const;

export const extrairRascunho = (c: EstagiarioConfig): Rascunho => ({
  cura: c.cura, ataque: c.ataque, buffs: c.buffs, reservaMana: c.reservaMana, alarmes: c.alarmes, vidaAlarme: c.vidaAlarme,
});

/** Igualdade de valor (ordem das chaves não importa; NaN de campo vazio é igual a NaN). */
export function iguais(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => iguais(x, bb[i]));
  }
  const ra = a as Record<string, unknown>, rb = b as Record<string, unknown>;
  // Chave com `undefined` conta como ausente (alarmes ligados não têm chave).
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined), kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => iguais(ra[k], rb[k]));
}

/** O rascunho tem alterações que o servidor ainda não tem? */
export const rascunhoSujo = (r: Rascunho, servidor: EstagiarioConfig): boolean => !iguais(r, extrairRascunho(servidor));

/** Texto do campo → número sem limitar (vazio ou inválido = NaN; a faixa só vale no Aplicar). */
export const lerNumero = (texto: string): number => (texto.trim() === "" ? NaN : Number(texto));

/** Inteiro na faixa (inválido = `dflt`), como o servidor guarda. */
export const limitar = (v: number, lo: number, hi: number, dflt: number): number =>
  Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt;

/** Põe os números do rascunho nas faixas; campo inválido volta ao valor do servidor (ou ao padrão, em regra nova). */
export function limitarRascunho(r: Rascunho, servidor: EstagiarioConfig): Rascunho {
  const L = LIMITES;
  return {
    ...r,
    cura: r.cura.map((x, i) => ({ ...x, abaixoDe: limitar(x.abaixoDe, L.abaixoDe.lo, L.abaixoDe.hi, servidor.cura[i]?.abaixoDe ?? L.abaixoDe.dflt) })),
    ataque: r.ataque.map((x, i) => ({
      ...x,
      minBichos: limitar(x.minBichos, L.minBichos.lo, L.minBichos.hi, servidor.ataque[i]?.minBichos ?? L.minBichos.dflt),
      raio: limitar(x.raio, L.raio.lo, L.raio.hi, servidor.ataque[i]?.raio ?? L.raio.dflt),
    })),
    reservaMana: limitar(r.reservaMana, L.reservaMana.lo, L.reservaMana.hi, servidor.reservaMana),
    vidaAlarme: limitar(r.vidaAlarme, L.vidaAlarme.lo, L.vidaAlarme.hi, servidor.vidaAlarme),
  };
}

/** O que o Aplicar manda: a configuração do servidor (rotas) com o rascunho já nas faixas por cima. */
export const configParaAplicar = (r: Rascunho, servidor: EstagiarioConfig): EstagiarioConfig => ({ ...servidor, ...limitarRascunho(r, servidor) });

/** Envio do Aplicar ainda sem confirmação: o rascunho que foi e o que o servidor tinha antes. */
export interface Pendente { enviado: Rascunho; antes: Rascunho; em: number }
/** Quanto tempo um estado com a configuração de antes do Aplicar é tido como "atrasado" (saiu antes do pedido chegar). */
export const PENDENTE_MS = 3000;

/**
 * Estado do servidor que saiu antes do Aplicar chegar lá (o periódico de 10 s, por exemplo): ainda traz a configuração
 * de antes. Não é a confirmação, então não mexe no rascunho.
 */
export const estadoAtrasado = (p: Pendente | null, servidor: EstagiarioConfig): boolean =>
  !!p && !iguais(p.antes, p.enviado) && iguais(extrairRascunho(servidor), p.antes);

export interface Sincronia { rascunho: Rascunho | null; pendente: Pendente | null }

/**
 * Chegou um estado do servidor. Devolve o rascunho e o pendente novos e a configuração que a janela deve tomar como "do
 * servidor" (`config`). Regras: sem alterações, o rascunho acompanha o servidor; com alterações, fica como está (as rotas
 * e os interruptores vêm do servidor de qualquer jeito). Estado atrasado logo depois do Aplicar mantém o aplicado; passado
 * PENDENTE_MS sem confirmação (mensagem perdida), vale o do servidor e a barra de "não aplicadas" volta.
 */
export function sincronizar(s: Sincronia, anterior: EstagiarioConfig | null, servidor: EstagiarioConfig, now: number): Sincronia & { config: EstagiarioConfig } {
  if (s.pendente && estadoAtrasado(s.pendente, servidor)) {
    if (now - s.pendente.em < PENDENTE_MS) return { ...s, config: { ...servidor, ...s.pendente.enviado } };
    return { rascunho: s.rascunho, pendente: null, config: servidor };
  }
  const acompanha = !s.rascunho || !anterior || !rascunhoSujo(s.rascunho, anterior);
  return { rascunho: acompanha ? extrairRascunho(servidor) : s.rascunho, pendente: null, config: servidor };
}
