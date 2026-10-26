// Diário de missões (tecla L / trilho): ativas, disponíveis (dá para pegar agora, com quem e onde), em breve (o que
// falta para abrir) e concluídas, com descrição, passos e recompensas.
import {
  MAX_TRACKED_QUESTS, QUEST_LIST, availableQuests, npcDef, questDef, questLockReason, questReady, unlockText, upcomingQuests,
  type QuestDef,
} from "@lemonquest/shared";
import { useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { inventoryStore } from "../items/inventory.ts";
import { toggleChallenges } from "../challenges/challenges.ts";
import { bindOverlay } from "../overlays.ts";
import { worldIndexStore } from "../../game/worldIndex.ts";
import { guideEffectiveStore, isGuiding, toggleGuideQuest } from "../hud/guideState.ts";
import { npcWhere, npcZone } from "./questInfo.ts";
import { inventoryCounter, myLevelStore, questAction, questLogOpen, questStore, rewardText, stepLines } from "./quests.ts";
import "./quests.css";

// Esc pela pilha de sobreposições, registrado no instante em que o store abre (não num useEffect, que deixava um frame
// sem listener e um Esc rápido limpava o alvo). Os Desafios, abertos por cima, saem primeiro por terem entrado depois.
bindOverlay("quest-log", questLogOpen, (v) => v, () => questLogOpen.set(false));

/** Quantas missões travadas o "Em breve" mostra. */
const SOON_LIMIT = 5;

export function QuestLog() {
  const open = useStore(questLogOpen);
  if (!open) return null;
  return <QuestLogDialog />;
}

function QuestLogDialog() {
  const st = useStore(questStore);
  const level = useStore(myLevelStore);
  const idx = useStore(worldIndexStore);
  const guide = useStore(guideEffectiveStore);
  useStore(inventoryStore);
  const count = inventoryCounter();
  const active = (st?.active ?? []).flatMap((a) => { const d = questDef(a.id); return d ? [{ def: d, a }] : []; });
  const done = QUEST_LIST.filter((d) => st?.done.includes(d.id));
  const ctx = { level, done: st?.done ?? [], active: active.map((x) => x.def.id) };
  const avail = st && level ? availableQuests(ctx) : [];
  const soon = st && level ? upcomingQuests(ctx, SOON_LIMIT) : [];
  const [sel, setSel] = useState<string>(active[0]?.def.id ?? avail[0]?.id ?? done[0]?.id ?? "");
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const drag = useWindowDrag("questLog");
  useDialogFocus(drag.ref);
  const pick = (id: string) => { setSel(id); setConfirmAbandon(false); };

  const def = questDef(sel);
  const act = st?.active.find((a) => a.id === sel);
  const isDone = !!st?.done.includes(sel);
  const tracked = !!st?.tracked.includes(sel);
  return (
    <div ref={drag.ref} class={`hud-card hud-window quest-log${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Diário de missões">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" />
        <span>Diário de missões</span>
        <button class="quest-btn ql-weekly" onClick={toggleChallenges} data-tip="Desafios da semana" data-tip-sub="Metas que zeram na segunda-feira">Desafios semanais</button>
        <button class="win-close" onClick={() => questLogOpen.set(false)} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      <div class="ql-body">
        <div class="ql-list">
          <div class="ql-group">Ativas ({active.length})</div>
          {active.length === 0 && <div class="hud-empty">Nenhuma. Veja as disponíveis logo abaixo.</div>}
          {active.map(({ def: d, a }) => {
            const ready = questReady(d, a.progress, count);
            return (
              <button key={d.id} class={`ql-item${sel === d.id ? " sel" : ""}`} onClick={() => pick(d.id)}>
                <span class="quest-mark" style={ready ? undefined : { color: "#a9adba" }}>?</span>{d.name}
              </button>
            );
          })}
          <div class="ql-group">Disponíveis ({avail.length})</div>
          {avail.length === 0 && <div class="hud-empty">Nenhuma agora. Veja “Em breve”.</div>}
          {avail.map((d) => (
            <button key={d.id} class={`ql-item avail${sel === d.id ? " sel" : ""}`} onClick={() => pick(d.id)} data-quest={d.id}>
              <span class="quest-mark">!</span>{d.name}
            </button>
          ))}
          {soon.length > 0 && <div class="ql-group">Em breve</div>}
          {soon.map(({ def: d }) => (
            <button key={d.id} class={`ql-item soon${sel === d.id ? " sel" : ""}`} onClick={() => pick(d.id)} data-quest={d.id}>
              <span class="quest-mark" aria-hidden="true">·</span>{d.name}<span class="ql-lv">lv {d.minLevel}</span>
            </button>
          ))}
          <div class="ql-group">Concluídas ({done.length})</div>
          {done.map((d) => (
            <button key={d.id} class={`ql-item done${sel === d.id ? " sel" : ""}`} onClick={() => pick(d.id)}>
              <span class="quest-mark" style={{ color: "#8fd18f" }}>✓</span>{d.name}
            </button>
          ))}
        </div>
        <div class="ql-detail">
          {!def ? <div class="ql-empty">Selecione uma missão.</div> : !act && !isDone ? <QuestOffer def={def} lock={questLockReason(def, ctx)} where={npcWhere(idx, def.giver)} zone={npcZone(idx, def.giver)} guiding={isGuiding(guide, "quest", def.id)} /> : <>
            <h3>{def.name}</h3>
            <div class="ql-meta">{npcWhere(idx, def.giver)} · level {def.minLevel}+{isDone ? " · concluída" : act && questReady(def, act.progress, count) ? " · pronta para entregar" : ""}</div>
            <div class="ql-summary">{def.summary}</div>
            <ul class="quest-steps">
              {stepLines(def, isDone ? def.steps.map((s) => s.count) : act?.progress, isDone ? () => 1e9 : count).map((l, i) => (
                <li key={i} class={l.done ? "done" : ""}><span>{l.label}</span><span class="quest-step-n">{l.cur}/{l.max}</span></li>
              ))}
            </ul>
            <div class="quest-reward"><b>Recompensa:</b> {rewardText(def.rewards)}{def.rewards.unlock ? ` · ${unlockText(def.rewards.unlock)}` : ""}</div>
            {act && (
              <div class="quest-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <label class="ql-track">
                  <input type="checkbox" checked={tracked} onChange={() => questAction({ action: "track", questId: def.id, on: !tracked })} />
                  Rastrear (máx. {MAX_TRACKED_QUESTS})
                </label>
                <GuideButton on={isGuiding(guide, "quest", def.id)} questId={def.id} />
                {confirmAbandon
                  ? <button class="quest-btn" onClick={() => { questAction({ action: "abandon", questId: def.id }); setConfirmAbandon(false); }}>Confirmar abandono</button>
                  : <button class="quest-btn" onClick={() => setConfirmAbandon(true)}>Abandonar</button>}
              </div>
            )}
          </>}
        </div>
      </div>
    </div>
  );
}

/** Missão ainda não aceita: com quem pegar e onde, ou o que falta para abrir. */
function QuestOffer({ def, lock, where, zone, guiding }: { def: QuestDef; lock: string | null; where: string; zone: string | null; guiding: boolean }) {
  const npc = npcDef(def.giver)?.name ?? def.giver;
  return (
    <>
      <h3>{def.name}</h3>
      <div class="ql-meta">{where} · level {def.minLevel}+</div>
      {lock
        ? <div class="ql-lock">{lock}</div>
        : <div class="ql-hint">Disponível: fale com {npc}{zone ? ` (${zone})` : ""} para aceitar.</div>}
      <div class="ql-summary">{def.summary}</div>
      <ul class="quest-steps">
        {def.steps.map((s, i) => <li key={i}><span>{s.label}</span><span class="quest-step-n">{s.count > 1 ? `×${s.count}` : ""}</span></li>)}
      </ul>
      <div class="quest-reward"><b>Recompensa:</b> {rewardText(def.rewards)}{def.rewards.unlock ? ` · ${unlockText(def.rewards.unlock)}` : ""}</div>
      {!lock && <div class="quest-actions"><GuideButton on={guiding} questId={def.id} /></div>}
    </>
  );
}

/** "Guiar" (seta e minimapa até o NPC da missão ou o próximo passo dela; ui/hud/guideState.ts). */
function GuideButton({ on, questId }: { on: boolean; questId: string }) {
  return (
    <button class={`quest-btn${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggleGuideQuest(questId)}
      data-tip={on ? "Parar de guiar" : "Mostrar o caminho"}>{on ? "Guiando" : "Guiar"}</button>
  );
}
