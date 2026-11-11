// PvP estilo Tibia: jogadores se atacam em qualquer lugar fora da zona de proteção. Atacar quem não revidou (e não tem
// caveira) dá caveira branca; matar assim 3 vezes em 24 h dá caveira vermelha (morte com o dobro de XP perdida e ouro no chão).

/** "" = sem caveira. */
export type Skull = "" | "white" | "red";

/** Caveira branca dura isso desde o último ataque injusto; atacar alguém também justifica o revide por este tempo. */
export const PVP_AGGRESSION_MS = 15 * 60_000;
/** Depois de atacar um jogador, não se entra em zona de proteção por este tempo. */
export const PZ_LOCK_MS = 60_000;
/** Mortes injustas dentro da janela que dão caveira vermelha. */
export const RED_SKULL_KILLS = 3;
export const RED_SKULL_WINDOW_MS = 24 * 60 * 60_000;
/** Caveira vermelha: multiplicador da XP perdida na morte e fração do ouro que cai no chão. */
export const RED_SKULL_DEATH_XP_MULT = 2;
export const RED_SKULL_GOLD_DROP = 0.5;
/**
 * Dano de jogador em jogador (ataque básico, distância e magia), depois da armadura. Ciclo 15: as magias de fim de
 * jogo foram calibradas contra monstros com milhares de vida; em PvP um mago lv 100 morria em 1 s para duas magias.
 */
export const PVP_DAMAGE_MULT = 0.5;

/** Mortes injustas que ainda contam (dentro da janela). */
export function recentKills(kills: readonly number[], now: number): number[] {
  return kills.filter((t) => Number.isFinite(t) && t <= now && now - t < RED_SKULL_WINDOW_MS);
}

export const SKULL_LABEL: Record<Exclude<Skull, "">, string> = { white: "Caveira branca", red: "Caveira vermelha" };
