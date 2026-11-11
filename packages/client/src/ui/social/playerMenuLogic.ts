// Itens do menu do botão direito em jogadores (ciclo 17). Puro (recebe o estado e as ações) para testar; quem abre o
// menu (mundo e lista de Batalha) usa o mesmo, em playerMenu.ts.
import type { CtxMenuItem } from "../outfit/outfit.ts";

/** Outro jogador: o que o menu precisa saber. */
export interface PlayerMenuState {
  attacking: boolean;
  following: boolean;
  /** Estou num grupo. */
  inParty: boolean;
  /** Sou o líder do meu grupo. */
  leader: boolean;
  /** O jogador clicado é do meu grupo. */
  member: boolean;
}
export interface PlayerMenuActions {
  attack(): void; follow(): void; trade(): void;
  invite(): void; lead(): void; kick(): void;
}

/**
 * Seguir, grupo e troca primeiro; "Atacar" por último e em vermelho (PvP não pode ser o item que um clique apressado
 * acerta: antes ele era o primeiro do menu, bem onde o mouse já está). "Parar de atacar" não é perigoso: sem vermelho.
 */
export function playerMenuItems(s: PlayerMenuState, a: PlayerMenuActions): CtxMenuItem[] {
  const items: CtxMenuItem[] = [{ label: s.following ? "Parar de seguir" : "Seguir", run: a.follow }];
  if (s.member) {
    if (s.leader) items.push({ label: "Passar liderança", run: a.lead }, { label: "Expulsar do grupo", run: a.kick });
  } else if (!s.inParty || s.leader) {
    items.push({ label: "Convidar para o grupo", run: a.invite });
  }
  items.push({ label: "Trocar itens", run: a.trade });
  items.push(s.attacking ? { label: "Parar de atacar", run: a.attack } : { label: "Atacar", run: a.attack, danger: true });
  return items;
}

/** Botão direito em você: roupa, item do chão, grupo e (por último) voltar à lista de personagens. */
export function selfMenuItems(
  s: { groundHere: boolean; inParty: boolean },
  a: { outfit(): void; pickup(): void; leaveParty(): void; switchCharacter(): void },
): CtxMenuItem[] {
  return [
    { label: "Trocar roupa", run: a.outfit },
    ...(s.groundHere ? [{ label: "Pegar item do chão", run: a.pickup }] : []),
    ...(s.inParty ? [{ label: "Sair do grupo", run: a.leaveParty }] : []),
    { label: "Trocar personagem", run: a.switchCharacter },
  ];
}
