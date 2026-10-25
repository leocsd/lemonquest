// Poção automática: bebe a poção de vida/mana sozinha quando o valor cai abaixo do limite escolhido (0 = desligado).
// A decisão é pura (testável); o controlador liga o jogador (meStore) à poção rápida (Q/E), que já respeita a recarga.
import { createStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";
import { AUTO_POTION_MAX, parseSettings, shouldDrink, type AutoPotionSettings } from "./autoPotionLogic.ts";
import { potionCooling, quickPotion, quickPotionPick, type PotionKind } from "./potions.ts";

export { AUTO_POTION_MAX };
export type { AutoPotionSettings };

export const AUTO_POTION_KEY = "lemonquest.autoPotion";

export const autoPotionStore = createStore<AutoPotionSettings>(
  (() => { try { return parseSettings(localStorage.getItem(AUTO_POTION_KEY)); } catch { return { hp: 0, mana: 0 }; } })(),
);
autoPotionStore.subscribe((s) => { try { localStorage.setItem(AUTO_POTION_KEY, JSON.stringify(s)); } catch { /* indisponível */ } });

const last: Record<PotionKind, number> = { hp: -Infinity, mana: -Infinity };

function check() {
  const me = meStore.get();
  if (!me) return;
  const s = autoPotionStore.get();
  const now = performance.now();
  // Vida primeiro: quem está quase morrendo não espera mana.
  for (const [kind, cur, max, pct] of [["hp", me.hp, me.maxHp, s.hp], ["mana", me.mana, me.maxMana, s.mana]] as const) {
    if (!shouldDrink(cur, max, pct, now, last[kind])) continue;
    if (potionCooling() || !quickPotionPick(kind).it) continue; // sem poção usável: não enche a tela de avisos
    last[kind] = now;
    quickPotion(kind);
    return;
  }
}

meStore.subscribe(check);
