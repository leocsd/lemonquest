// Ícones de condição (canto superior esquerdo), estilo Tibia. O encantamento vem do servidor como condição (imbued); a
// bênção (ciclo 17) é só de exibição, lida do estado do jogador.
import { useEffect, useState } from "preact/hooks";
import { CONDITION_DEFS, conditionsStore, type Condition } from "./conditions.ts";
import { PixelIcon } from "./icons.tsx";
import { selectStore, useStore } from "./store.ts";
import { meStore } from "./world.ts";

/** 45s / 12:05 */
const fmtLeft = (s: number): string => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`);

const BLESSED: Condition = { id: "blessed", detail: "A próxima morte não tira XP" };
/** Só a bênção do jogador: o meStore muda a cada passo e a faixa não precisa redesenhar por isso. */
const blessedStore = selectStore(meStore, (m) => !!m?.blessed);

export function ConditionsStrip() {
  const conds = useStore(conditionsStore);
  const blessed = useStore(blessedStore);
  const list = blessed ? [...conds, BLESSED] : conds;
  const timed = conds.some((c) => c.until);
  const [, setTick] = useState(0);

  // Atualiza o contador e remove expiradas.
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => {
      const now = Date.now();
      if (conditionsStore.get().some((c) => c.until && c.until <= now)) {
        conditionsStore.set((l) => l.filter((c) => !c.until || c.until > now));
      }
      setTick((t) => t + 1);
    }, 250);
    return () => clearInterval(id);
  }, [timed]);

  if (list.length === 0) return null;
  const now = Date.now();
  return (
    <div class="conditions" aria-label="Condições">
      {list.map((c) => {
        const def = CONDITION_DEFS[c.id];
        if (!def) return null;
        const left = c.until ? Math.max(0, Math.ceil((c.until - now) / 1000)) : null;
        return (
          <div
            key={c.id}
            class="cond"
            style={{ "--cond": def.color } as any}
            data-tip={def.label}
            data-tip-sub={[c.detail, left != null ? fmtLeft(left) : null].filter(Boolean).join(" · ") || undefined}
          >
            <PixelIcon name={def.glyph} size={14} />
            {c.label ? <span class="cond-time">{c.label}</span> : left != null && left <= 99 && <span class="cond-time">{left}</span>}
          </div>
        );
      })}
    </div>
  );
}
