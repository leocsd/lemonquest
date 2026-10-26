// Aba "Missões" da janela de NPC (oferta → Aceitar/Recusar, progresso, Entregar) e o Quadro de Recompensas.
import {
  BOUNTY_CHEST_ID, bountyTitle, itemDef, questsForNpc, unlockText, upcomingQuests, type QuestDef, type QuestStatus,
} from "@lemonquest/shared";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";
import { inventoryStore } from "../items/inventory.ts";
import { useTicker } from "../arena/useTicker.ts";
import { worldIndexStore } from "../../game/worldIndex.ts";
import { guideRequestStore, isGuiding, toggleGuideBounty } from "../hud/guideState.ts";
import { huntInfo, materialSources, materialSourcesText } from "./questInfo.ts";
import { inventoryCounter, myLevelStore, questAction, questStore, rewardText, stepLines } from "./quests.ts";
import { materialRequestAction, materialRequestStore } from "./materialRequest.ts";
import "./quests.css";

const STATUS_LABEL: Partial<Record<QuestStatus, string>> = { available: "Nova", active: "Em andamento", ready: "Pronta" };
/** Quantas missões travadas o NPC lista embaixo das ofertas. */
const LOCKED_SHOWN = 2;

export function NpcQuestList({ npcId }: { npcId: string }) {
  const st = useStore(questStore);
  useStore(inventoryStore); // coletar/entregar dependem da mochila
  const me = useStore(meStore);
  const [declined, setDeclined] = useState<string[]>([]);
  const [accepted, setAccepted] = useState<string[]>([]);
  if (!st || !me) return <div class="hud-empty">Carregando missões…</div>;
  const count = inventoryCounter();
  const list = questsForNpc(npcId, st, me.level, count).filter((e) => !declined.includes(e.def.id));
  // Missões deste NPC ainda travadas, da que abre antes: o NPC diz o que falta (level e/ou outra missão, com quem).
  const locked = upcomingQuests({ level: me.level, done: st.done, active: st.active.map((a) => a.id) }, Infinity)
    .filter((e) => e.def.giver === npcId).slice(0, LOCKED_SHOWN);
  if (list.length === 0 && locked.length === 0) return <div class="quest-empty">Nenhuma missão por aqui no momento.</div>;
  return (
    <>
      {list.length === 0 && <div class="quest-empty">Ainda não tenho trabalho para você, mas logo terei.</div>}
      {list.length > 0 && (
        <ul class="quest-offers">
          {list.map(({ def, status }) => (
            <QuestCard
              key={def.id} def={def} status={status} progress={st.active.find((a) => a.id === def.id)?.progress}
              justAccepted={accepted.includes(def.id)}
              onAccept={() => { setAccepted((l) => [...l, def.id]); questAction({ action: "accept", questId: def.id }); }}
              onDecline={() => setDeclined((l) => [...l, def.id])}
              onTurnIn={() => questAction({ action: "turnIn", questId: def.id })}
              count={count}
            />
          ))}
        </ul>
      )}
      {locked.length > 0 && (
        <ul class="quest-locked" aria-label="Missões bloqueadas">
          {locked.map(({ def, reason }) => (
            <li key={def.id} data-quest={def.id}><b>{def.name}</b> <span>{reason}</span></li>
          ))}
        </ul>
      )}
    </>
  );
}

function QuestCard(o: {
  def: QuestDef; status: QuestStatus; progress?: number[]; justAccepted: boolean; count: ReturnType<typeof inventoryCounter>;
  onAccept: () => void; onDecline: () => void; onTurnIn: () => void;
}) {
  const { def, status } = o;
  const text = status === "available" ? def.dialog.offer : status === "ready" ? def.dialog.complete : o.justAccepted ? def.dialog.accept : def.dialog.progress;
  const lines = stepLines(def, o.progress, o.count);
  return (
    <li class={`quest-card st-${status}`} data-quest={def.id}>
      <div class="quest-card-head">
        <span class="quest-mark" aria-hidden="true">{status === "available" ? "!" : "?"}</span>
        <span class="quest-card-name">{def.name}</span>
        <span class="quest-chip">{STATUS_LABEL[status]}</span>
      </div>
      <div class="quest-say">“{text}”</div>
      <ul class="quest-steps">
        {lines.map((l, i) => (
          <li key={i} class={l.done ? "done" : ""}>
            <span>{l.label}</span>
            <span class="quest-step-n">{l.max > 1 || status !== "available" ? `${l.cur}/${l.max}` : ""}</span>
          </li>
        ))}
      </ul>
      <div class="quest-reward"><b>Recompensa:</b> {rewardText(def.rewards)}{def.rewards.unlock ? ` · ${unlockText(def.rewards.unlock)}` : ""}</div>
      <div class="quest-actions">
        {status === "available" && <>
          <button class="quest-btn primary" onClick={o.onAccept}>Aceitar</button>
          <button class="quest-btn" onClick={o.onDecline}>Recusar</button>
        </>}
        {status === "ready" && <button class="quest-btn primary" onClick={o.onTurnIn}>Entregar</button>}
      </div>
    </li>
  );
}

/** "5 h 12 min" / "8 min" */
export function fmtUntil(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`;
}

export function BountyBoard() {
  const st = useStore(questStore);
  const level = useStore(myLevelStore);
  const idx = useStore(worldIndexStore);
  const guide = useStore(guideRequestStore);
  useTicker(30_000);
  if (!st) return <div class="hud-empty">Carregando recompensas…</div>;
  const chest = itemDef(BOUNTY_CHEST_ID)?.name ?? "Baú";
  return (
    <div class="bounty-board">
      <ul class="quest-offers">
        {st.bounties.list.map((b, i) => {
          const ready = b.status === "active" && b.progress >= b.count;
          const pct = Math.round((Math.min(b.progress, b.count) / b.count) * 100);
          return (
            <li key={i} class={`quest-card bounty st-${b.status}${ready ? " ready" : ""}`} data-bounty={i}>
              <div class="quest-card-head">
                <span class="quest-mark" aria-hidden="true">{b.status === "open" ? "!" : b.status === "done" ? "✓" : "?"}</span>
                <span class="quest-card-name">{bountyTitle(b)}</span>
                <span class="quest-chip">{b.status === "open" ? "Nova" : b.status === "done" ? "Paga" : ready ? "Cumprida" : "Em andamento"}</span>
              </div>
              {b.status !== "open" && (
                <div class="bounty-bar" role="progressbar" aria-valuenow={b.progress} aria-valuemax={b.count}>
                  <span style={{ width: `${pct}%` }} />
                  <em>{Math.min(b.progress, b.count)}/{b.count}</em>
                </div>
              )}
              {b.status !== "done" && <div class="bounty-where"><b>Onde:</b> {huntInfo(idx, b.monster, level)}</div>}
              <div class="quest-reward"><b>Recompensa:</b> {rewardText({ xp: b.xp, gold: b.gold, items: [] })} · {chest}</div>
              <div class="quest-actions">
                {b.status !== "done" && <BountyGuideBtn on={isGuiding(guide, "bounty", b.monster)} monster={b.monster} />}
                {b.status === "open" && <button class="quest-btn primary" onClick={() => questAction({ action: "bountyAccept", index: i })}>Aceitar</button>}
                {ready && <button class="quest-btn primary" onClick={() => questAction({ action: "bountyTurnIn", index: i })}>Entregar</button>}
              </div>
            </li>
          );
        })}
      </ul>
      <div class="bounty-reset">Novas recompensas em {fmtUntil(st.bounties.resetsAt - Date.now())} (todo dia às 6h).</div>
    </div>
  );
}

/** "Guiar" até o spawn mais perto do monstro da recompensa (ui/hud/guideState.ts). */
function BountyGuideBtn({ on, monster }: { on: boolean; monster: string }) {
  return (
    <button class={`quest-btn${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggleGuideBounty(monster)}
      data-tip={on ? "Parar de guiar" : "Mostrar onde caçar"}>{on ? "Guiando" : "Guiar"}</button>
  );
}

/** Encomenda semanal de material: pede N de um material específico, paga ouro, uma vez por semana. */
export function MaterialRequestBoard() {
  const req = useStore(materialRequestStore);
  const idx = useStore(worldIndexStore);
  useStore(inventoryStore); // "have" muda com a mochila
  useTicker(30_000);
  useEffect(() => { materialRequestAction({ action: "list" }); }, []);
  if (!req) return <div class="hud-empty">Carregando encomenda…</div>;
  const def = itemDef(req.materialId);
  const ready = !req.claimed && req.have >= req.count;
  // Onde o material cai (ciclo 17): os monstros comuns mais fracos que o soltam, com a zona de cada um.
  const sources = materialSourcesText(materialSources(idx, req.materialId));
  return (
    <div class="bounty-board">
      <ul class="quest-offers">
        <li class={`quest-card bounty st-${req.claimed ? "done" : ready ? "active" : "open"}${ready ? " ready" : ""}`}>
          <div class="quest-card-head">
            <span class="quest-mark" aria-hidden="true">{req.claimed ? "✓" : ready ? "?" : "!"}</span>
            <span class="quest-card-name">Encomenda: {def?.name ?? req.materialId}</span>
            <span class="quest-chip">{req.claimed ? "Paga" : ready ? "Cumprida" : "Em andamento"}</span>
          </div>
          <div class="bounty-bar" role="progressbar" aria-valuenow={Math.min(req.have, req.count)} aria-valuemax={req.count}>
            <span style={{ width: `${Math.round((Math.min(req.have, req.count) / req.count) * 100)}%` }} />
            <em>{Math.min(req.have, req.count)}/{req.count}</em>
          </div>
          {!req.claimed && sources && <div class="bounty-where"><b>Cai de:</b> {sources}</div>}
          <div class="quest-reward"><b>Recompensa:</b> {rewardText({ xp: 0, gold: req.gold, items: [] })}</div>
          <div class="quest-actions">
            {ready && <button class="quest-btn primary" onClick={() => materialRequestAction({ action: "turnIn" })}>Entregar</button>}
          </div>
        </li>
      </ul>
      <div class="bounty-reset">Nova encomenda em {fmtUntil(req.resetsAt - Date.now())} (toda segunda).</div>
    </div>
  );
}

/** Missões do Mestre do Coliseu dentro da janela do Coliseu (só aparece se houver alguma). */
export function ArenaQuests() {
  const st = useStore(questStore);
  const me = useStore(meStore);
  if (!st || !me || questsForNpc("arena_master", st, me.level, inventoryCounter()).length === 0) return null;
  return <NpcQuestList npcId="arena_master" />;
}
