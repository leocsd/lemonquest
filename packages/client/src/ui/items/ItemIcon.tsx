// Ícone de item nítido (pixelado), escalado por fator inteiro e centralizado num quadrado `box`.
// Suporta imagem única e frame de atlas (background-position). Borda/brilho de raridade, contagem de pilha e selo "+N"
// do refino (canto de cima: mochila, equipamento, depot, troca e loja usam este ícone).
import type { ItemDef, ItemInstance, ItemIcon as ItemIconDef, Rarity } from "@lemonquest/shared";
import { useEffect, useState } from "preact/hooks";
import { defOf } from "./inventory.ts";
import "./items.css";

const sizes = new Map<string, { w: number; h: number } | null>();
const waiting = new Map<string, Set<() => void>>();

export const assetUrl = (url: string): string => encodeURI(`${import.meta.env.BASE_URL}${url}`);

function loadSize(url: string, cb: () => void) {
  let set = waiting.get(url);
  if (set) { set.add(cb); return; }
  set = new Set([cb]);
  waiting.set(url, set);
  const img = new Image();
  img.onload = () => { sizes.set(url, { w: img.naturalWidth, h: img.naturalHeight }); flush(url); };
  img.onerror = () => { sizes.set(url, null); flush(url); };
  img.src = assetUrl(url);
}
function flush(url: string) {
  const s = waiting.get(url);
  waiting.delete(url);
  s?.forEach((f) => f());
}

function useImageSize(url: string): { w: number; h: number } | null | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    if (sizes.has(url)) return;
    let alive = true;
    loadSize(url, () => { if (alive) force((n) => n + 1); });
    return () => { alive = false; };
  }, [url]);
  return sizes.get(url);
}

/** Retângulo desenhado e offsets de background para um ícone dentro de `box` px. Exportado para testes. */
export function iconLayout(icon: ItemIconDef, img: { w: number; h: number }, box: number) {
  const fw = icon.frameWidth ?? img.w, fh = icon.frameHeight ?? img.h;
  const fit = box / Math.max(fw, fh);
  // Fator inteiro quando cabe (nítido); se a imagem é maior que a caixa, reduz de forma fracionária.
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const cols = Math.max(1, Math.floor(img.w / fw));
  const frame = icon.frame ?? 0;
  return {
    width: fw * scale, height: fh * scale,
    bgW: img.w * scale, bgH: img.h * scale,
    bgX: -(frame % cols) * fw * scale, bgY: -Math.floor(frame / cols) * fh * scale,
  };
}

interface Props {
  def?: ItemDef;
  inst?: ItemInstance | null;
  /** Lado (px) da área do ícone. */
  box?: number;
  /** Mostra contagem de pilha. */
  count?: boolean;
  /** Moldura própria com borda/brilho de raridade (fora de slots). */
  framed?: boolean;
  rarity?: Rarity;
  class?: string;
}

export function ItemIcon({ def, inst, box = 32, count = true, framed = false, rarity, class: cls }: Props) {
  const d = def ?? defOf(inst);
  const r = rarity ?? inst?.rarity ?? "common";
  const icon = d?.icon;
  const img = useImageSize(icon?.url ?? "");
  const lay = icon && img ? iconLayout(icon, img, box) : null;
  const n = inst?.count ?? 1;
  return (
    <div
      class={`item-icon rar-${r}${r === "epic" || r === "legendary" ? " rar-fx" : ""}${framed ? " framed" : ""}${cls ? ` ${cls}` : ""}`}
      style={{ width: `${box}px`, height: `${box}px` }}
    >
      {lay && icon ? (
        <span
          class="item-pic"
          style={{
            width: `${lay.width}px`, height: `${lay.height}px`,
            backgroundImage: `url("${assetUrl(icon.url)}")`,
            backgroundSize: `${lay.bgW}px ${lay.bgH}px`,
            backgroundPosition: `${lay.bgX}px ${lay.bgY}px`,
          }}
        >
          {icon.tint != null && (
            // Tint multiplicativo (como no Phaser): camada da cor recortada pelo próprio ícone.
            <span
              class="item-tint"
              style={{
                backgroundColor: `#${icon.tint.toString(16).padStart(6, "0")}`,
                maskImage: `url("${assetUrl(icon.url)}")`,
                maskSize: `${lay.bgW}px ${lay.bgH}px`,
                maskPosition: `${lay.bgX}px ${lay.bgY}px`,
                maskRepeat: "no-repeat",
              }}
            />
          )}
        </span>
      ) : (
        !d || img === null ? <span class="item-unknown">?</span> : null
      )}
      {count && n > 1 && <span class="item-count">{n > 9999 ? `${Math.floor(n / 1000)}k` : n}</span>}
      {(inst?.refine ?? 0) > 0 && <span class="item-refine">+{inst!.refine}</span>}
    </div>
  );
}
