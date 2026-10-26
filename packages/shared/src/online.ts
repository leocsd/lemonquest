// Painel "Online" da barra lateral (ciclo 18): quem está no jogo, amigos primeiro, com a mesma regra de zona do /quem
// (server/systems/social.ts). Tipos e ordem puros (servidor monta, cliente só mostra).
import type { Vocation } from "./types.ts";

export interface OnlineEntry {
  /** Sessão (para o convite de grupo). */
  id: string;
  name: string;
  level: number;
  vocation: Vocation;
  /** Está na sua lista de amigos. */
  friend: boolean;
  /** Está no seu grupo. */
  party: boolean;
  /** Dividiria XP num grupo com você (regra dos 2/3, a mesma do grupo e do "✓ grupo" do /quem). */
  share: boolean;
  /** Zona só de amigos mútuos (cada um na lista do outro), do grupo e de quem está na PZ (regra do /quem); ausente = escondida. */
  zone?: string;
  /** No mundo sem ninguém no controle (caiu ou saiu em combate). */
  away?: boolean;
}

/** S2C.Online: só para você (as zonas visíveis dependem de quem pergunta). Você não entra na lista. */
export interface OnlineMsg {
  list: OnlineEntry[];
  /** Amigos fora do jogo (nomes, na ordem da sua lista). */
  offlineFriends: string[];
}

/** C2S.Social (3/s): pedir a lista; pôr/tirar alguém dos amigos (o mesmo do /amigo, sem alternar por engano). */
export type SocialActionMsg =
  | { action: "list" }
  | { action: "friend"; name: string; on: boolean };

/** Amigos primeiro; depois maior level e nome. */
export function sortOnline<T extends Pick<OnlineEntry, "friend" | "level" | "name">>(list: T[]): T[] {
  return list.sort((a, b) => Number(b.friend) - Number(a.friend) || b.level - a.level || a.name.localeCompare(b.name));
}
