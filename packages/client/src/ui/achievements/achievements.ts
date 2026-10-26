// Estado das conquistas e do ranking no cliente: stores, mensagens do servidor e abrir/fechar as janelas.
import {
  C2S, S2C, TITLES, isUnlockedIn, unlockText,
  type AchievementDef, type AchievementUnlockedMsg, type AchievementsMsg, type RankingResponse, type SetTitleMsg,
} from "@lemonquest/shared";
import { session } from "../../session.ts";
import { endpoint } from "../../net.ts";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";
import { pushToast } from "../toasts.ts";

/** Último estado enviado pelo servidor (null = ainda não chegou). */
export const achievementsStore = createStore<AchievementsMsg | null>(null);
export const achievementsOpen = createStore(false);
export const rankingOpen = createStore(false);

export const requestAchievements = (): void => send(C2S.AchievementsRequest, {});

export function toggleAchievements(): void {
  const next = !achievementsOpen.get();
  achievementsOpen.set(next);
  if (next) requestAchievements();
}
export const toggleRanking = (): void => rankingOpen.set((v) => !v);

export function sendTitle(title: string): void {
  send(C2S.SetTitle, { title } satisfies SetTitleMsg);
}

/** Toast de conquista desbloqueada: "Conquista desbloqueada! Nome (+N pts) · Roupa: X". */
export function handleUnlocked(m: AchievementUnlockedMsg): void {
  const rewards = m.rewards.map(unlockText).join(" · ");
  pushToast({ text: `🏆 Conquista desbloqueada! ${m.name} (+${m.points} pts)${rewards ? ` — ${rewards}` : ""}`, kind: "good" });
}

session.onRoom((room) => {
  achievementsStore.set(null);
  room.onMessage(S2C.Achievements, (m: AchievementsMsg) => achievementsStore.set(m));
  room.onMessage(S2C.AchievementUnlocked, (m: AchievementUnlockedMsg) => handleUnlocked(m));
});

// --- helpers de exibição ------------------------------------------------------------------------------------------------

const nf = new Intl.NumberFormat("pt-BR");
export const fmtNum = (n: number): string => nf.format(Math.floor(n));

/** "6,5 h / 12 h", "40% / 60%", "1.234 / 5.000". */
export function fmtProgress(def: AchievementDef, v: number): string {
  const cur = Math.min(v, def.target);
  if (def.metric === "offline") return `${(cur / 60).toFixed(1).replace(".", ",")} h / ${def.target / 60} h`;
  if (def.metric === "explore") return `${Math.floor(cur)}% / ${def.target}%`;
  return `${fmtNum(cur)} / ${fmtNum(def.target)}`;
}

export const titleText = (id: string): string => TITLES[id] ?? id;

/** Roupa/addon liberado para este personagem? Sem o estado do servidor ainda, só o que o personagem veste conta. */
export function outfitUnlockedFor(
  st: AchievementsMsg | null, vocation: string, wornOutfit: string, wornAddons: number, outfitId: string, bit: 0 | 1 | 2,
): boolean {
  if (!st) return outfitId === wornOutfit && (bit === 0 || (wornAddons & bit) !== 0) ? true : isUnlockedIn([], vocation, outfitId, bit);
  return isUnlockedIn(st.unlocks, vocation, outfitId, bit);
}

// --- ranking ----------------------------------------------------------------------------------------------------------------

/** `name` = personagem da busca (o `me` da resposta é dele: trocar de personagem busca de novo). */
export const rankingStore = createStore<{ data: RankingResponse | null; error: boolean; at: number; name?: string }>({ data: null, error: false, at: 0 });
const CLIENT_CACHE_MS = 30_000;

/** Busca /api/ranking (cache de 30 s no cliente; `force` ignora). `?me=` traz a posição do seu personagem (ciclo 18). */
export async function loadRanking(force = false): Promise<void> {
  const cur = rankingStore.get();
  const name = session.myName;
  if (!force && cur.data && cur.name === name && Date.now() - cur.at < CLIENT_CACHE_MS) return;
  try {
    const r = await fetch(`${endpoint}/api/ranking${name ? `?me=${encodeURIComponent(name)}` : ""}`);
    if (!r.ok) throw new Error(String(r.status));
    rankingStore.set({ data: (await r.json()) as RankingResponse, error: false, at: Date.now(), name });
  } catch {
    rankingStore.set({ ...cur, error: true });
  }
}
