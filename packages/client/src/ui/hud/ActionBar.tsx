// Barra de ações (um slot por atalho de magia) centralizada na área visível, com overlay radial de cooldown e o botão
// que abre a janela Magias (H). Magia (ou família) ainda bloqueada no level não aparece: o atalho continua salvo e
// o slot surge quando ela libera. Magias de alvo mostram o alcance: avermelhada longe do alvo, apagada sem alvo.
import { spellDef, spellMana } from "@lemonquest/shared";
import { useEffect, useRef, useState } from "preact/hooks";
import { activateSlot, cooldownStore, flashStore, shakeStore, slotCountStore, slotRangeStore, slotsStore, type Cooldown, type SlotAction, type SlotRange } from "./actionbar.ts";
import { toggleHotkeys } from "../hotkeys/hotkeys.ts";
import { useStore } from "./store.ts";
import { meStore } from "./world.ts";
import { swapSlots } from "./castbar.ts";

export function ActionBar() {
  const slots = useStore(slotsStore);
  const cds = useStore(cooldownStore);
  const flashes = useStore(flashStore);
  const shakes = useStore(shakeStore);
  const me = useStore(meStore);
  const count = useStore(slotCountStore);
  const ranges = useStore(slotRangeStore);
  const now = useCooldownClock(cds);
  const level = me?.level ?? 1;

  return (
    <div class="action-bar" role="toolbar" aria-label="Barra de ações">
      {Array.from({ length: count }, (_, i) => {
        const a = slots[i];
        if (a && level < (a.unlockLevel ?? a.level ?? 0)) return null;
        return <ActionSlot key={i} index={i} action={a} cd={cds[i]} now={now} flash={flashes[i]} shake={shakes[i]} level={level} mana={me?.mana ?? 0} range={ranges[i] ?? null} />;
      })}
      <button class="action-config" onClick={toggleHotkeys} aria-label="Magias: atalhos e grupos" data-tip="Magias" data-tip-sub="Tecla de cada magia e grupos · H">⚙</button>
    </div>
  );
}

/** Relógio que só "anda" (rAF) enquanto há algum cooldown ativo. */
function useCooldownClock(cds: (Cooldown | null)[]): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!cds.some((c) => c && c.end > performance.now())) return;
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      if (cds.some((c) => c && c.end > t)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cds]);
  return now;
}

interface SlotProps { index: number; action: SlotAction | null; cd: Cooldown | null; now: number; flash: number; shake: number; level: number; mana: number; range: SlotRange }

const fmtCd = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0).replace(".", ",")} s`;

function ActionSlot({ index, action, cd, now, flash, shake, level, mana, range }: SlotProps) {
  const el = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  const [over, setOver] = useState(false);

  // Reinicia a animação de "pressionado" a cada flash.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const b = el.current;
    if (!b) return;
    b.classList.remove("flash");
    void b.offsetWidth;
    b.classList.add("flash");
  }, [flash]);

  // Tremida quando a magia falha.
  const firstShake = useRef(true);
  useEffect(() => {
    if (firstShake.current) { firstShake.current = false; return; }
    const b = el.current;
    if (!b) return;
    b.classList.remove("shake");
    void b.offsetWidth;
    b.classList.add("shake");
  }, [shake]);

  const active = cd && cd.end > now;
  const remain = active ? cd.end - now : 0;
  const frac = active ? remain / (cd.end - cd.start) : 0;
  const key = action?.keyLabel ?? "";
  const locked = !!action?.level && level < action.level;
  const def = action?.spellId ? spellDef(action.spellId) : undefined;
  const cost = def ? spellMana(def, level) : action?.mana;
  const noMana = !!action && !locked && cost != null && mana < cost;
  const sub = action?.spellId
    ? [`Mana ${cost}`, `Recarga ${fmtCd(action.cooldownMs ?? 0)}`, `Level ${action.level}`].join(" · ")
    : cost ? `${cost} de mana` : undefined;
  const rangeTip = range === "out" ? "Alvo fora de alcance" : range === "none" ? "Sem alvo" : "";
  const ready = !!action && !locked && !active && !noMana && range === "ok";

  return (
    <button
      ref={el}
      class={`slot action-slot${over ? " drop-over" : ""}${action ? " filled" : ""}${active ? " cooling" : ""}${locked ? " locked" : ""}${noMana ? " nomana" : ""}${action?.family ? " family" : ""}${range === "out" ? " out-range" : ""}${range === "none" ? " no-target" : ""}${ready ? " ready" : ""}`}
      style={action?.color ? ({ "--el": action.color } as any) : undefined}
      onClick={() => activateSlot(index)}
      draggable={!!action}
      onDragStart={(e) => { e.dataTransfer?.setData("text/plain", String(index)); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "move"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        // Uma linha do editor de grupo (outro tipo de dado) solta aqui dava Number("") === 0 e trocava o slot 1.
        const raw = e.dataTransfer?.getData("text/plain");
        if (!raw) return;
        const from = Number(raw);
        if (Number.isInteger(from)) swapSlots(from, index);
      }}
      onAnimationEnd={(e) => (e.currentTarget as HTMLElement).classList.remove("flash", "shake")}
      data-tip={action ? action.label : "Atalho vazio"}
      data-tip-sub={action ? `${sub} · tecla ${key}${rangeTip ? ` · ${rangeTip}` : ""}` : "Configure na janela Magias (H)"}
      aria-label={action ? `${action.label}${rangeTip ? ` (${rangeTip.toLowerCase()})` : ""}` : "Atalho vazio"}
      data-tip-words={action?.words}
      data-tip-desc={action?.desc ? (locked ? `${action.desc} (Requer level ${action.level})` : action.desc) : undefined}
    >
      <span class="action-key">{key}</span>
      {action?.family && <span class="action-family" aria-hidden="true">◆</span>}
      {action?.icon && <img src={action.icon} alt="" draggable={false} />}
      {action && !action.icon && <span class="action-abbr">{action.label.slice(0, 2)}</span>}
      {cost != null && !locked && <span class="action-mana">{cost}</span>}
      {/* Alcance só por cor não serve para quem não distingue cores: glifo no canto de baixo (o tooltip já diz em texto). */}
      {range === "out" && <span class="action-state" aria-hidden="true">»</span>}
      {range === "none" && <span class="action-state" aria-hidden="true">∅</span>}
      {locked && (
        <span class="action-lock">
          <svg width="9" height="10" viewBox="0 0 9 10" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 4V3a2.5 2.5 0 0 1 5 0v1h1v6H1V4zm1 0h3V3a1.5 1.5 0 0 0-3 0z" fill="currentColor" fill-rule="evenodd" /></svg>
          Lv {action!.level}
        </span>
      )}
      {active && (
        <>
          <span class="action-cd" style={{ "--cd": `${(frac * 360).toFixed(1)}deg` } as any} />
          <span class="action-cd-num">{remain >= 1000 ? Math.ceil(remain / 1000) : (remain / 1000).toFixed(1).replace(".", ",")}</span>
        </>
      )}
    </button>
  );
}
