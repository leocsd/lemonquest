// Mochila com itens reais (arrastar, usar, equipar), 5 por linha. O tamanho vem do servidor (cresce com o level até o
// teto da vocação: backpackCapacity) e ela se organiza sozinha. O ouro fica no cabeçalho.
import { BACKPACK_BY_VOCATION, BACKPACK_LEVELS_PER_SLOT, BACKPACK_SIZE } from "@lemonquest/shared";
import { GoldLabel } from "../items/Gold.tsx";
import { inventoryStore } from "../items/inventory.ts";
import { ItemSlot } from "../items/ItemSlot.tsx";
import { meStore } from "./world.ts";
import { PixelIcon } from "./icons.tsx";
import { Section } from "./Section.tsx";
import { useStore } from "./store.ts";

export function Backpack() {
  const inv = useStore(inventoryStore);
  const me = useStore(meStore);
  const bp = inv?.backpack ?? [];
  const slots = bp.length || BACKPACK_SIZE;
  const used = bp.filter(Boolean).length;
  const max = me ? BACKPACK_BY_VOCATION[me.vocation]?.max : undefined;
  const growth = max === undefined ? "" : slots < max ? `Ganha 1 espaço a cada ${BACKPACK_LEVELS_PER_SLOT} levels (até ${max}). ` : `No máximo da vocação (${max}). `;
  return (
    <Section
      id="backpack"
      title="Mochila"
      size="backpack"
      aside={
        <span class="bag-aside">
          <GoldLabel gold={inv?.gold ?? 0} />
          <span class="count-chip" data-tip="Espaço usado" data-tip-sub={`${growth}A mochila se organiza sozinha.`}>{used}/{slots}</span>
        </span>
      }
    >
      <div class={`bag-grid${used === 0 ? " empty" : ""}`}>
        {Array.from({ length: slots }, (_, i) => (
          <ItemSlot key={i} loc={{ where: "backpack", index: i }} inst={bp[i]} size={38} class="bag-slot" />
        ))}
        {used === 0 && (
          <div class="bag-empty">
            <PixelIcon name="backpack" size={18} />
            <span>Mochila vazia</span>
          </div>
        )}
      </div>
    </Section>
  );
}
