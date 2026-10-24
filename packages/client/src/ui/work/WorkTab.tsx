// Aba "Na obra" da janela de NPC: barras coletivas da sprint da semana, as tarefas abertas da Ferrovia e da Oficina e o
// vínculo do próprio ClickUp (token pessoal: enviado uma vez, nunca guardado nem mostrado).
import type { WorkMsg } from "@lemonquest/shared";
import { useRef, useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { agoText, barFraction, linkWork, unlinkWork, workStore } from "./work.ts";
import "./work.css";

export function WorkTab({ npcId }: { npcId: string }) {
  const w = useStore(workStore);
  if (!w || w.npcId !== npcId) return <div class="hud-empty">Lendo o quadro…</div>;
  return (
    <div class="work-tab">
      {w.online ? <Board w={w} /> : <div class="hud-empty">O quadro está sem notícias da obra por enquanto.</div>}
      {w.canLink && <LinkBox w={w} />}
    </div>
  );
}

function Board({ w }: { w: WorkMsg }) {
  const t = w.total;
  return (
    <>
      <div class="work-head">
        <span>Sprint da semana {w.week.replace(/^\d+-W/, "")}</span>
        <small data-tip="Última leitura do ClickUp">{agoText(w.updatedAt)}</small>
      </div>
      <div class={`work-total${t.fired ? " fired" : ""}`}>
        <Bar done={t.done} goal={t.goal} />
        <span>
          {t.done}{t.goal > 0 ? `/${t.goal}` : ""} tarefas fechadas
          {t.fired ? " — Sprint Fechada! XP ×1,25 por 1 h" : t.goal > 0 ? " — bater a meta dá XP ×1,25 para todos" : ""}
        </span>
      </div>
      {w.sprints.length > 0 && (
        <ul class="work-bars">
          {w.sprints.map((s) => (
            <li key={s.id} class="work-bar-row">
              <span class="work-bar-name">{s.name}</span>
              <Bar done={s.done} goal={s.goal} />
              <span class="work-bar-num">{s.done}{s.goal > 0 ? `/${s.goal}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      <div class="work-head"><span>Na obra</span></div>
      {w.tasks.length === 0
        ? <div class="hud-empty">Nenhuma tarefa aberta para mostrar.</div>
        : (
          <ul class="work-tasks">
            {w.tasks.map((r, i) => (
              <li key={i} class="work-task">
                <div class="work-task-title">{r.title}</div>
                <div class="work-task-meta">{r.project} · {r.who}</div>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

/** "Vincular meu ClickUp": o token fica só no campo (não controlado, sem estado) e é apagado ao enviar. */
function LinkBox({ w }: { w: WorkMsg }) {
  const input = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState(false);
  const submit = () => {
    const el = input.current;
    if (!el || !el.value.trim()) return;
    linkWork(el.value);
    el.value = "";
    setSent(true);
  };
  return (
    <div class="work-link">
      <div class="work-head"><span>Vincular meu ClickUp</span></div>
      {w.link ? (
        <div class="work-link-state">
          <span>Vinculado como <b>{w.link.nick}</b>{w.polling ? "" : " (as tarefas contam quando o ClickUp do servidor estiver ligado)"}</span>
          <button class="shop-btn" onClick={() => unlinkWork()}>Desvincular</button>
        </div>
      ) : (
        <>
          <div class="work-link-help">
            Não vinculado. Suas tarefas fechadas no ClickUp viram conquistas. Gere o token pessoal em ClickUp → Configurações → Apps →
            API Token, cole aqui e vincule. O jogo confere quem você é e <b>não guarda o token</b>; se quiser, gere outro no ClickUp
            depois (o jogo roda sem criptografia na rede do escritório).
          </div>
          <form class="work-link-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <input
              ref={input} type="password" autocomplete="off" spellcheck={false} maxLength={128} placeholder="pk_…"
              aria-label="Token pessoal do ClickUp" onInput={() => sent && setSent(false)}
            />
            <button class="shop-btn" type="submit">Vincular</button>
          </form>
          {sent && <div class="work-link-help">Conferindo no ClickUp…</div>}
        </>
      )}
    </div>
  );
}

function Bar({ done, goal }: { done: number; goal: number }) {
  const f = barFraction(done, goal);
  return (
    <span class="work-bar" role="meter" aria-valuemin={0} aria-valuemax={goal || done || 1} aria-valuenow={done}>
      <span class={`work-bar-fill${goal > 0 && done >= goal ? " full" : ""}`} style={{ width: `${Math.round(f * 100)}%` }} />
    </span>
  );
}
