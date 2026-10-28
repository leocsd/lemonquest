// Atalhos de itens/batalha: Q/E poções, F2–F4 posturas, F8 seguir, F9 ataque automático, Espaço mira/troca o bicho mais
// próximo, I recolhe/expande Equipamento+Mochila. (F5 fica com o navegador: atualizar a página. O Esc fecha overlays
// pela pilha de overlays.ts.)
import { arenaResultStore, arenaWindowOpen, closeArenaWindow } from "../arena/arena.ts";
import { useEffect } from "preact/hooks";
import { focusedByKeyboard, isTyping } from "../focus.ts";
import { session } from "../../session.ts";
import { battleSourcesStore, buildBattleList, nextBattleTarget, BATTLE_RANGE } from "../hud/battle.ts";
import { setFightMode, STANCES, toggleAuto, toggleChase } from "../hud/FightMode.tsx";
import { sectionsStore } from "../hud/Section.tsx";
import { setTarget, targetStore } from "../hud/target.ts";
import { playersStore } from "../hud/world.ts";
import { npcStore, closeNpc } from "../npc/npc.ts";
import { bindOverlay } from "../overlays.ts";
import { closeDialog, dialogStore } from "./dialogs.ts";
import { cancelDrag, dragStore } from "./dnd.ts";
import { quickPotion } from "./potions.ts";

// Overlays de itens na pilha do Esc (os módulos deles não conhecem a UI): arrasto, diálogo de quantidade, janela de
// NPC, resultado e janela do Coliseu. Cada um entra ao abrir e sai ao fechar, seja pelo Esc ou pelo próprio ×.
bindOverlay("drag", dragStore, (d) => d != null, () => { cancelDrag(); });
bindOverlay("dialog", dialogStore, (d) => d != null, closeDialog);
bindOverlay("npc", npcStore, (s) => s != null, closeNpc);
bindOverlay("arena-result", arenaResultStore, (r) => r != null, () => arenaResultStore.set(null));
bindOverlay("arena", arenaWindowOpen, (v) => v, closeArenaWindow);

export function toggleInventorySections(): void {
  sectionsStore.set((s) => {
    const open = !(s.equipment && s.backpack);
    return { ...s, equipment: open, backpack: open };
  });
}

/** Espaço: mira o bicho mais próximo; de novo, troca pro próximo da lista de Batalha (cíclico). Sem bicho, não mexe. */
function cycleTarget(): void {
  const list = buildBattleList(playersStore.get(), session.myId, battleSourcesStore.get(), BATTLE_RANGE);
  setTarget(nextBattleTarget(list, targetStore.get()));
}

export function useItemKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || e.ctrlKey || e.altKey || e.metaKey) return;
      if (dialogStore.get()) return;
      // Posturas em F2/F3/F4 (ofensivo/equilibrado/defensivo). F5 não é capturado: é o "atualizar" do navegador.
      const stanceKey = /^F([2-4])$/.exec(e.code);
      if (stanceKey) {
        e.preventDefault();
        if (!e.repeat) setFightMode({ stance: STANCES[Number(stanceKey[1]) - 2].id });
        return;
      }
      if (e.code === "F8") { e.preventDefault(); if (!e.repeat) toggleChase(); return; }
      if (e.code === "F9") { e.preventDefault(); if (!e.repeat) toggleAuto(); return; }
      if (e.code === "Space") {
        // Botão do HUD focado pelo teclado (Tab): o Espaço continua apertando o botão — o preventDefault aqui cancelaria
        // a ativação (medido no Chromium). Foco deixado por clique do mouse não conta: quem clicou num botão e voltou ao
        // jogo quer mirar, não apertar o botão de novo.
        if (focusedByKeyboard()) return;
        e.preventDefault();
        if (!e.repeat) cycleTarget();
        return;
      }
      if (e.repeat) return;
      if (e.code === "KeyQ") quickPotion("hp");
      else if (e.code === "KeyE") quickPotion("mana");
      else if (e.code === "KeyI") toggleInventorySections();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
