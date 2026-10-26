// Rastreador compacto (canto superior esquerdo, até 3 missões e as recompensas diárias aceitas) e cartão "Missão concluída".
import { BOUNTY_NPC, NPCS, bountyTitle, questDef, questReady } from "@lemonquest/shared";
import { useEffect, useRef } from "preact/hooks";
import { worldIndexStore } from "../../game/worldIndex.ts";
import { useStore } from "../hud/store.ts";
import { guideRequestStore, isGuiding, toggleGuideBounty, toggleGuideQuest } from "../hud/guideState.ts";
import { inventoryStore } from "../items/inventory.ts";
import { huntInfo, nextStepLines } from "./questInfo.ts";
import { inventoryCounter, myLevelStore, questDoneStore, questLogOpen, questStore, rewardText, stepLines, trackerCollapsed } from "./quests.ts";
import "./quests.css";

export function QuestTracker() {
  const st = useStore(questStore);
  useStore(inventoryStore);
  const collapsed = useStore(trackerCollapsed);
  const level = useStore(myLevelStore);
  const idx = useStore(worldIndexStore);
  const guide = useStore(guideRequestStore);
  const prev = useRef(new Map<string, number>());
  const tracked = (st?.tracked ?? []).flatMap((id) => {
    const def = questDef(id);
    const a = st?.active.find((x) => x.id === id);
    return def && a ? [{ def, a }] : [];
  });
  // Destaque rápido no número que acabou de subir ("+1 Lobo").
  const bumped = new Set<string>();
  const count = inventoryCounter();
  for (const { def, a } of tracked) {
    stepLines(def, a.progress, count).forEach((l, i) => {
      const k = `${def.id}:${i}`;
      const was = prev.current.get(k);
      if (was !== undefined && l.cur > was) bumped.add(k);
    });
  }
  useEffect(() => {
    const m = new Map<string, number>();
    for (const { def, a } of tracked) stepLines(def, a.progress, inventoryCounter()).forEach((l, i) => m.set(`${def.id}:${i}`, l.cur));
    prev.current = m;
  });
  // Recompensas diárias aceitas (ciclo 17): onde o monstro vive e quão difícil é para o seu level.
  const bounties = (st?.bounties.list ?? []).flatMap((b, i) => (b.status === "active" ? [{ b, i }] : []));
  if (tracked.length === 0 && bounties.length === 0) return null;
  return (
    <div class="quest-tracker" aria-label="Missões rastreadas">
      <div class="quest-tracker-head" onClick={() => trackerCollapsed.set((v) => !v)}>
        <span />
        <span>Missões</span>
        <button aria-label={collapsed ? "Expandir" : "Recolher"} data-tip={collapsed ? "Expandir" : "Recolher"}>{collapsed ? "+" : "−"}</button>
      </div>
      {!collapsed && (
        <ul>
          {tracked.map(({ def, a }) => {
            const ready = questReady(def, a.progress, count);
            return (
              <li key={def.id} data-quest={def.id}>
                <div class="qt-head">
                  <div class={`qt-name${ready ? " ready" : ""}`} onClick={() => questLogOpen.set(true)} data-tip="Abrir o diário" data-tip-sub="Tecla L">{def.name}</div>
                  <GuideBtn on={isGuiding(guide, "quest", def.id)} onClick={() => toggleGuideQuest(def.id)} />
                </div>
                {stepLines(def, a.progress, count).map((l, i) => (
                  <div key={`${i}:${bumped.has(`${def.id}:${i}`) ? l.cur : ""}`} class={`qt-step${l.done ? " done" : ""}${bumped.has(`${def.id}:${i}`) ? " bump" : ""}`}>
                    <span>{l.label}</span>
                    <span>{l.max > 1 ? `${l.cur}/${l.max}` : l.done ? "✓" : "…"}</span>
                  </div>
                ))}
                {ready && NPCS[def.giver] && <div class="qt-hint">→ Fale com {NPCS[def.giver]!.name}</div>}
              </li>
            );
          })}
          {bounties.map(({ b, i }) => {
            const ready = b.progress >= b.count;
            return (
              <li key={`bounty:${i}`} class="qt-bounty" data-bounty={i}>
                <div class="qt-head">
                  <div class={`qt-name${ready ? " ready" : ""}`}>{bountyTitle(b)}</div>
                  <GuideBtn on={isGuiding(guide, "bounty", b.monster)} onClick={() => toggleGuideBounty(b.monster)} />
                </div>
                <div class="qt-bstep"><span class="qt-where">{huntInfo(idx, b.monster, level)}</span><span>{Math.min(b.progress, b.count)}/{b.count}</span></div>
                {ready && <div class="qt-hint">→ Entregue no {NPCS[BOUNTY_NPC]?.name ?? "Quadro de Recompensas"}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "Guiar": seta até o próximo passo (NPC, zona ou spawn mais perto; portal/viagem certo quando é noutra região). */
function GuideBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button class={`qt-guide${on ? " on" : ""}`} aria-pressed={on} onClick={(e) => { e.stopPropagation(); onClick(); }}
      data-tip={on ? "Parar o guia" : "Mostrar o caminho"} data-tip-sub={on ? undefined : "Seta na tela e marca no mapa"}>
      {on ? "Guiando" : "Guiar"}
    </button>
  );
}

export function QuestDoneCard() {
  const m = useStore(questDoneStore);
  const st = useStore(questStore);
  const level = useStore(myLevelStore);
  const idx = useStore(worldIndexStore);
  if (!m) return null;
  // Próximo passo (ciclo 17): as missões que esta abriu, ou o que ainda falta para elas.
  const next = m.questId ? nextStepLines(idx, m.questId, { level, done: st?.done ?? [], active: st?.active.map((a) => a.id) ?? [] }) : [];
  return (
    <div class="quest-done" key={m.id} role="status">
      <div class="quest-done-kicker">{m.bounty ? "Recompensa paga" : "Missão concluída"}</div>
      <div class="quest-done-name">{m.name}</div>
      <div class="quest-done-reward">{rewardText(m)}</div>
      {next.length > 0 && <div class="quest-done-next">{next.map((l) => <div key={l}>{l}</div>)}</div>}
    </div>
  );
}
