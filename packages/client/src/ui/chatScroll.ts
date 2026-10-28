// Rolagem do chat: acompanha as mensagens novas sozinho. Quem subiu para ler o histórico só segura a posição enquanto
// está lendo (mouse sobre o chat) e vê uma pílula "↓ N novas"; tirou o mouse, o chat volta ao fim (dono, 2026-10-28:
// "quero que o scroll do chat desça automaticamente"). Lógica pura (sem DOM) para ter teste unitário.

/** Até esta distância do fim (px) o leitor conta como "no fim" (uma linha de 18 px já é "subiu"). */
export const STICK_PX = 8;

/** O leitor está colado no fim da lista? */
export function isAtBottom(scrollTop: number, clientHeight: number, scrollHeight: number, slack = STICK_PX): boolean {
  return scrollHeight - scrollTop - clientHeight <= slack;
}

/**
 * Estado "no fim" depois de um evento de scroll. O navegador dispara o evento da NOSSA rolagem (jumpToEnd) só no
 * quadro seguinte; numa rajada (login, loot do grupo, várias falas) a linha seguinte já cresceu a lista nesse meio
 * tempo, e medir a distância ao fim ali dizia "subiu uma linha" — o chat parava de acompanhar sem ninguém mexer
 * (reproduzido em 2026-10-28: 12 linhas em rajada → "↓ 6 novas"). Se o scrollTop ainda é o que a nossa rolagem
 * deixou (`stuckTop`), ninguém mexeu: o estado anterior vale; só uma mudança de posição é lida como gesto do leitor.
 */
export function scrolledAtBottom(prevAtBottom: boolean, stuckTop: number, scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  if (Math.abs(scrollTop - stuckTop) <= 1) return prevAtBottom;
  return isAtBottom(scrollTop, clientHeight, scrollHeight);
}

/** Quantas linhas de `next` (na aba visível) não existiam em `prev` — as chaves são únicas por linha. */
export function addedLines<T extends { key: string | number }>(prev: readonly T[], next: readonly T[], visible: (l: T) => boolean): number {
  const known = new Set(prev.map((l) => l.key));
  let n = 0;
  for (const l of next) if (!known.has(l.key) && visible(l)) n++;
  return n;
}

export interface ScrollDecision { scroll: boolean; unseen: number }

/**
 * Chegaram `added` linhas. No fim (ou chat recolhido, que ao abrir deve mostrar o mais novo): rola e zera o
 * contador. Subiu no histórico E está lendo (`reading` = mouse sobre o chat): fica parado e acumula as não lidas na
 * pílula. Subiu mas já tirou o mouse do chat: volta a acompanhar (o jogo é ao vivo; o histórico fica para quem está
 * nele).
 */
export function decideScroll(atBottom: boolean, unseenBefore: number, added: number, reading = true): ScrollDecision {
  if (atBottom || !reading) return { scroll: true, unseen: 0 };
  return { scroll: false, unseen: unseenBefore + added };
}

export const unseenText = (n: number): string => `↓ ${n} ${n === 1 ? "nova" : "novas"}`;
