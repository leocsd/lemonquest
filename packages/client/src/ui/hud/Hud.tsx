// HUD do jogo: monta todos os painéis e trata os atalhos de teclado da UI.
import { useEffect } from "preact/hooks";
import { isTyping } from "../focus.ts";
import { ActionBar } from "./ActionBar.tsx";
import { activateSlot } from "./actionbar.ts";
import { effectiveHotkeys, hotkeyIndex, keyFromEvent, toggleHotkeys } from "../hotkeys/hotkeys.ts";
import { HotkeysWindow } from "../hotkeys/HotkeysWindow.tsx";
import { SpellGroupsWindow } from "../hotkeys/SpellGroupsWindow.tsx";
import type { Vocation } from "@lemonquest/shared";
import { startCastBar } from "./castbar.ts";
import { ConditionsStrip } from "./ConditionsStrip.tsx";
import { LowHpVignette } from "./LowHpVignette.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { SkillsWindow } from "./SkillsWindow.tsx";
import { followPlayer } from "./FightMode.tsx";
import { clearTarget, getTarget } from "./target.ts";
import { meStore } from "./world.ts";
import { Tooltip } from "./Tooltip.tsx";
import "../items/bind.ts";
import { DragLayer } from "../items/DragLayer.tsx";
import { useItemKeys } from "../items/keys.ts";
import { closeTopOverlay } from "../overlays.ts";
import { dialogStore } from "../items/dialogs.ts";
import { ItemTooltip } from "../items/ItemTooltip.tsx";
import { LootToasts } from "../items/LootToasts.tsx";
import { QuickPotions } from "../items/QuickPotions.tsx";
import { NpcWindow } from "../npc/NpcWindow.tsx";
import { ArenaWindow } from "../arena/ArenaWindow.tsx";
import { ArenaHud } from "../arena/ArenaHud.tsx";
import { TrainingWindow } from "../training/TrainingWindow.tsx";
import { helpOpen, skillsOpen, soundOpen, toggle } from "./uiState.ts";
import { toggleBestiary } from "../bestiary/Bestiary.tsx";
import { OutfitWindow } from "../outfit/OutfitWindow.tsx";
import { ContextMenu } from "../outfit/ContextMenu.tsx";
import { toggleOutfit } from "../outfit/outfit.ts";
import { QuestTracker, QuestDoneCard } from "../quests/QuestTracker.tsx";
import { FirstSteps } from "./FirstSteps.tsx";
import { QuestLog } from "../quests/QuestLog.tsx";
import { toggleQuestLog } from "../quests/quests.ts";
import { AchievementsWindow } from "../achievements/AchievementsWindow.tsx";
import { RankingWindow } from "../achievements/RankingWindow.tsx";
import { toggleAchievements, toggleRanking } from "../achievements/achievements.ts";
import "./world.ts";
import "./hud.css";

export function Hud() {
  useHudKeys();
  useItemKeys();
  useEffect(() => startCastBar(), []);
  useNoButtonFocus();
  return (
    <>
      <LowHpVignette />
      <ConditionsStrip />
      <QuestTracker />
      <QuestDoneCard />
      <FirstSteps />
      {/* Barra de magias + poções num bloco só: nunca se sobrepõem, qualquer que seja o número de slots. */}
      <div class="bottom-dock">
        <ActionBar />
        <QuickPotions />
      </div>
      <NpcWindow />
      <ArenaWindow />
      <ArenaHud />
      <TrainingWindow />
      <LootToasts />
      <SkillsWindow />
      <HotkeysWindow />
      <SpellGroupsWindow />
      <OutfitWindow />
      <QuestLog />
      <AchievementsWindow />
      <RankingWindow />
      <Sidebar />
      <ContextMenu />
      <Tooltip />
      <ItemTooltip />
      <DragLayer />
    </>
  );
}

function useHudKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || e.ctrlKey || e.altKey || e.metaKey) return;
      // Select do HUD focado (ex.: magia no painel H) não troca de opção por digitação: solta o foco antes.
      const ae = document.activeElement;
      if (ae instanceof HTMLSelectElement && ae.closest("#ui") && !/^(Arrow|Enter|Space|Tab)/.test(e.code)) { e.preventDefault(); ae.blur(); }
      // Atalhos de magia (painel H). Teclas do jogo nunca viram atalho (shared/hotkeys.ts), então não há disputa.
      // Com o diálogo de quantidade aberto as teclas são dele (o Esc continua fechando, mais abaixo).
      const slot = dialogStore.get() ? -1 : hotkeyIndex(effectiveHotkeys(meStore.get()?.vocation as Vocation | undefined), keyFromEvent(e));
      if (slot >= 0) {
        e.preventDefault();
        if (!e.repeat) activateSlot(slot);
        return;
      }
      if (e.repeat) return;
      if (e.code === "KeyH") { e.preventDefault(); toggleHotkeys(); return; }
      if (e.code === "KeyK") { e.preventDefault(); toggle(skillsOpen); return; }
      if (e.code === "KeyO") { e.preventDefault(); toggleOutfit(); return; }
      if (e.code === "KeyL") { e.preventDefault(); toggleQuestLog(); return; }
      if (e.code === "KeyJ") { e.preventDefault(); toggleAchievements(); return; }
      if (e.code === "KeyR") { e.preventDefault(); toggleRanking(); return; }
      if (e.code === "KeyB") { e.preventDefault(); toggleBestiary(); return; }
      if (e.key === "?" || e.code === "F1") { e.preventDefault(); soundOpen.set(false); toggle(helpOpen); return; }
      if (e.key === "Escape") {
        // Janelas, cartões e menus fecham pela pilha (overlays.ts: a última aberta primeiro; normalmente o listener
        // em captura de lá já tratou este Esc). Só com tudo fechado o Esc para de seguir e, depois, limpa o alvo.
        if (closeTopOverlay()) return;
        if (meStore.get()?.followId) followPlayer(null);
        else if (getTarget()) clearTarget();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * Botões do HUD não roubam o foco: assim Enter continua abrindo o chat (em vez de "clicar" de novo
 * o último botão) e o chat aberto não perde o foco ao clicar no painel.
 * Checkbox/select (rastrear missão, título) soltam o foco depois de mudar: senão as setas mexeriam
 * no select (e WASD no checkbox) em vez de andar. Campos de texto (chat, quantidade) não são afetados.
 */
function useNoButtonFocus() {
  useEffect(() => {
    const DRAGGABLE = '#ui button[draggable="true"]';
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      // Botão arrastável (slot da barra): preventDefault no mousedown impede o arrasto no Chrome; o foco sai no clique/fim do arrasto.
      if (t?.closest("#ui button") && !t.closest(DRAGGABLE)) e.preventDefault();
    };
    const dropFocus = (e: Event) => { (((e.target as HTMLElement | null)?.closest(DRAGGABLE)) as HTMLElement | null)?.blur(); };
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("#ui")) return;
      if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "radio"))) t.blur();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("change", onChange);
    document.addEventListener("click", dropFocus);
    document.addEventListener("dragend", dropFocus);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("change", onChange);
      document.removeEventListener("click", dropFocus);
      document.removeEventListener("dragend", dropFocus);
    };
  }, []);
}
