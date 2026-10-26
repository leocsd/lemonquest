// Janela "Desafios da semana": as 3 metas sorteadas da semana com barra de progresso, resgate e o bônus por cumprir
// todas. Abre pelo botão do trilho (ciclo 18) e pelo diário de missões.
import { itemDef, timeLeftText, type ChallengeReward } from "@lemonquest/shared";
import { useRef } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { bindOverlay } from "../overlays.ts";
import { challengeAction, challengesOpen, challengesStore } from "./challenges.ts";
import "../party/party.css";
import "./challenges.css";

// Esc pela pilha de sobreposições: fecha só esta janela (aberta por cima do diário, sai antes dele; não tira o alvo).
bindOverlay("challenges", challengesOpen, (v) => v, () => challengesOpen.set(false));

/** "+400 de ouro · 10× Poção de Vida" */
export function rewardLine(r: ChallengeReward): string {
  const parts: string[] = [];
  if (r.xp) parts.push(`+${r.xp.toLocaleString("pt-BR")} XP`);
  if (r.gold) parts.push(`+${r.gold.toLocaleString("pt-BR")} de ouro`);
  for (const i of r.items ?? []) parts.push(`${i.count}× ${itemDef(i.itemId)?.name ?? i.itemId}`);
  return parts.join(" · ");
}

export function ChallengesWindow() {
  const open = useStore(challengesOpen);
  const data = useStore(challengesStore);
  const winRef = useRef<HTMLDivElement>(null);
  useDialogFocus(winRef, open);
  if (!open) return null;
  const allClaimed = !!data && data.goals.every((g) => g.claimed);
  return (
    <div ref={winRef} class="challenges-window panel" role="dialog" aria-label="Desafios da semana">
      <div class="ch-head">
        <b>Desafios da semana</b>
        <button class="ch-x" onClick={() => challengesOpen.set(false)} aria-label="Fechar">×</button>
      </div>
      <div class="ch-body">
      {!data && <div class="ch-empty">Carregando…</div>}
      {data && (
        <>
          <div class="ch-sub">
            Zera em <b>{timeLeftText(data.weekEndsAt, Date.now())}</b> (segunda 00h). O progresso conta desde segunda-feira e o
            prêmio cresce com o seu level. Cumpriu e não resgatou? Ele chega sozinho na virada.
          </div>
          <ul class="ch-list">
            {data.goals.map((g) => {
              const done = g.progress >= g.target;
              return (
                <li key={g.id} class={`ch-goal${g.claimed ? " claimed" : done ? " ready" : ""}`} data-goal={g.id}>
                  <div class="ch-goal-top"><b>{g.name}</b><span class="ch-n">{g.progress.toLocaleString("pt-BR")} / {g.target.toLocaleString("pt-BR")}</span></div>
                  <div class="ch-desc">{g.desc}</div>
                  <div class="ch-bar" aria-hidden="true"><span style={{ width: `${Math.round((g.progress / g.target) * 100)}%` }} /></div>
                  <div class="ch-foot">
                    <span class="ch-reward">{rewardLine(g.reward)}</span>
                    {g.claimed
                      ? <span class="ch-done">✓ resgatado</span>
                      : <button class={`party-btn${done ? " primary" : ""}`} disabled={!done} onClick={() => challengeAction({ action: "claim", id: g.id })}>Resgatar</button>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div class={`ch-bonus${data.bonus.claimed ? " claimed" : allClaimed ? " ready" : ""}`} data-goal="bonus">
            <div class="ch-goal-top"><b>Bônus da semana</b><span class="ch-n">{data.goals.filter((g) => g.claimed).length} / {data.goals.length}</span></div>
            <div class="ch-desc">Resgate os três desafios para liberar.</div>
            <div class="ch-foot">
              <span class="ch-reward">{rewardLine(data.bonus.reward)}</span>
              {data.bonus.claimed
                ? <span class="ch-done">✓ resgatado</span>
                : <button class={`party-btn${allClaimed ? " primary" : ""}`} disabled={!allClaimed} onClick={() => challengeAction({ action: "claimBonus" })}>Resgatar bônus</button>}
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
