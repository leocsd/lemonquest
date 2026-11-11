// Dois slots rápidos ao lado da barra de ações: Q (vida) e E (mana), com contagem e recarga de 1 s.
import { useEffect, useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { PixelIcon } from "../hud/icons.tsx";
import { countInBackpack, defOf, inventoryStore } from "./inventory.ts";
import { ItemIcon } from "./ItemIcon.tsx";
import { myLevelStore, potionCdStore, quickPotion, quickPotionPick, type PotionKind } from "./potions.ts";

function useClock(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

export function QuickPotions() {
  const inv = useStore(inventoryStore); // re-render quando a mochila muda
  const level = useStore(myLevelStore); // e no level up (destrava uma poção melhor)
  const cd = useStore(potionCdStore);
  const cooling = !!cd && cd.end > performance.now();
  const now = useClock(cooling);
  const frac = cd && cd.end > now ? (cd.end - now) / (cd.end - cd.start) : 0;
  // Chega ao fim: limpa o estado para parar o relógio.
  useEffect(() => {
    if (!cd) return;
    const t = window.setTimeout(() => potionCdStore.set(null), Math.max(0, cd.end - performance.now()) + 30);
    return () => clearTimeout(t);
  }, [cd]);
  void inv; void level;
  return (
    <div class="quick-slots" role="toolbar" aria-label="Poções rápidas">
      <QuickSlot kind="hp" keyLabel="Q" frac={frac} />
      <QuickSlot kind="mana" keyLabel="E" frac={frac} />
    </div>
  );
}

function QuickSlot({ kind, keyLabel, frac }: { kind: PotionKind; keyLabel: string; frac: number }) {
  const { it, needLevel } = quickPotionPick(kind);
  const def = defOf(it);
  const count = it ? countInBackpack(it.defId) : 0;
  const label = kind === "hp" ? "Poção de vida" : "Poção de mana";
  const empty = needLevel ? `Tecla ${keyLabel} · as da mochila pedem level ${needLevel}` : `Tecla ${keyLabel} · nenhuma na mochila`;
  return (
    <button
      class={`slot quick-slot ${kind}${it ? " filled" : " empty"}`}
      onClick={() => quickPotion(kind)}
      data-tip={def ? def.name : label}
      data-tip-sub={it ? `Tecla ${keyLabel} · ${count} na mochila` : empty}
    >
      <span class="action-key">{keyLabel}</span>
      {it ? <ItemIcon inst={it} def={def} box={34} count={false} /> : <PixelIcon name="drop" size={18} class="slot-ghost" />}
      <span class="quick-count">{count}</span>
      {frac > 0 && <span class="action-cd" style={{ "--cd": `${(frac * 360).toFixed(1)}deg` } as never} />}
    </button>
  );
}
