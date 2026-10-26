// Quando mostrar a tela de novidades sozinha e o que mostrar aberto. Puro (sem DOM) para poder testar.

export interface NewsState { seen: string | null; level: number; xp: number }

/**
 * Mostra sozinha só para quem já joga (personagem novo já tem o cartão de primeiros passos) e ainda não viu o id mais
 * recente. Quem nunca viu nenhuma novidade, mas já tem progresso, vê a mais recente uma vez.
 */
export function shouldAutoShowNews(s: NewsState, latestId: string): boolean {
  if (s.level <= 1 && s.xp <= 0) return false;
  return s.seen !== latestId;
}

/**
 * Ciclo 17: aberto fica só o que o jogador ainda não viu (as entradas mais novas que `seen`); o resto vai para o
 * histórico recolhido. Quem nunca viu nada (ou viu um id que já saiu da lista) vê só a mais recente aberta. Sem nada
 * novo (aberta pela ajuda), a mais recente fica aberta e `nothingNew` avisa.
 */
export function splitNews<T extends { id: string }>(news: readonly T[], seen: string | null): { fresh: T[]; history: T[]; nothingNew: boolean } {
  const i = seen ? news.findIndex((n) => n.id === seen) : -1;
  if (i === 0) return { fresh: news.slice(0, 1), history: news.slice(1), nothingNew: true };
  const cut = i > 0 ? i : Math.min(1, news.length);
  return { fresh: news.slice(0, cut), history: news.slice(cut), nothingNew: false };
}
