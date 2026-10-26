// Ponte jogo → UI para eventos de combate que viram overlays Preact.
import { createStore } from "../hud/store.ts";

export interface LevelBanner {
  level: number; n: number; /** Nomes das magias recém-liberadas. */ spells: string[];
  /** Maior level já visto na sessão antes deste (o banner lista o que abriu entre os dois; ciclo 17). */
  from: number;
}
export interface DeathInfo {
  killerName: string;
  lostXp: number;
  /** A bênção foi gasta nesta morte (DiedMsg.blessingUsed). */
  blessingUsed?: boolean;
  /** XP que a bênção salvou (DiedMsg.savedXp). */
  savedXp?: number;
}

export const levelBannerStore = createStore<LevelBanner | null>(null);
export const deathStore = createStore<DeathInfo | null>(null);

let bannerSeq = 0;
export const showLevelBanner = (level: number, spells: string[] = [], from = level - 1) =>
  levelBannerStore.set({ level, n: ++bannerSeq, spells, from: from > 0 ? from : level - 1 });
export const showDeath = (info: DeathInfo) => deathStore.set(info);
export const hideDeath = () => deathStore.set(null);
