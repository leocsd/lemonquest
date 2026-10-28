// Loot automático: o que entra sozinho na mochila quando um bicho morre; o resto fica no chão onde ele caiu. Abre pelo
// botão do trilho ou pelo funil no cabeçalho da Mochila. A regra é do servidor (shared/lootFilter.ts); aqui só a escolha.
import { useEffect, useRef } from "preact/hooks";
import { DEFAULT_LOOT_FILTER, GEAR_FLOORS, GEAR_FLOOR_LABEL, GEAR_FLOOR_SHORT, LOOT_MIN_VALUES, isDefaultLootFilter } from "@lemonquest/shared";
import { lootFilterStore, previewLootFilter, setLootFilter } from "../items/lootFilter.ts";
import { useStore } from "./store.ts";
import { lootOpen } from "./uiState.ts";

export function LootFilterPopover() {
  const el = useRef<HTMLDivElement>(null);
  const f = useStore(lootFilterStore);

  // Clique fora fecha (o botão do trilho e o funil da Mochila alternam sozinhos).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (el.current?.contains(t) || (t as HTMLElement).closest?.(".hud-rail, .bag-filter")) return;
      lootOpen.set(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Solta o foco depois de mexer: com o controle focado, as setas mudariam o valor em vez de andar.
  const release = (e: Event) => (e.currentTarget as HTMLElement).blur();
  const check = (label: string, key: "materials" | "potions" | "food") => (
    <label class="sound-row">
      <input type="checkbox" checked={f[key]} onChange={(e) => { setLootFilter({ [key]: (e.currentTarget as HTMLInputElement).checked }); release(e); }} />
      <span>{label}</span>
    </label>
  );
  const step = Math.max(0, LOOT_MIN_VALUES.indexOf(f.minValue));
  const minAt = (e: Event) => LOOT_MIN_VALUES[Number((e.currentTarget as HTMLInputElement).value)] ?? 0;

  return (
    <div class="hud-card help-pop sound-pop loot-pop" ref={el} role="dialog" aria-label="Loot automático">
      <div class="help-title">Loot automático</div>
      <div class="help-sub">Equipamento que entra sozinho</div>
      <div class="seg" role="radiogroup" aria-label="Equipamento que entra sozinho">
        {GEAR_FLOORS.map((g) => (
          <button
            key={g} class={`seg-btn${f.gear === g ? " active" : ""}`} role="radio" aria-checked={f.gear === g} aria-label={GEAR_FLOOR_LABEL[g]}
            data-tip={GEAR_FLOOR_LABEL[g]} onClick={(e) => { setLootFilter({ gear: g }); release(e); }}
          >
            {GEAR_FLOOR_SHORT[g]}
          </button>
        ))}
      </div>
      <div class="help-sub">Também pegar</div>
      {check("Materiais", "materials")}
      {check("Poções", "potions")}
      {check("Comida", "food")}
      <label class="sound-row loot-min">
        <span>Só o que vale</span>
        <input
          type="range" min={0} max={LOOT_MIN_VALUES.length - 1} step={1} value={step} aria-label="Valor mínimo para entrar na mochila"
          onInput={(e) => previewLootFilter({ minValue: minAt(e) })}
          onChange={(e) => { setLootFilter({ minValue: minAt(e) }); release(e); }}
          onPointerUp={release}
        />
        <b>{f.minValue === 0 ? "tudo" : `${f.minValue}+`}</b>
      </label>
      <div class="auto-potion-note">
        Ouro, itens de missão e raros ou melhores entram sempre. O que ficar de fora cai no chão onde o bicho morreu, por 10 min, para quem quiser.
      </div>
      {!isDefaultLootFilter(f) && (
        <button class="btn loot-reset" onClick={(e) => { setLootFilter({ ...DEFAULT_LOOT_FILTER }); release(e); }}>Voltar a pegar tudo</button>
      )}
    </div>
  );
}
