import { describe, expect, it } from "vitest";
import { OUTFIT_TONES, TONE_KEEP, TONE_PIVOT, colorizePixel, toneColor } from "@lemonquest/shared";
import { colorizeData, swatchBackground, swatchOrder } from "./colorize.ts";

const MID = Math.round(TONE_PIVOT * 255);

describe("tingimento de uma sheet (colorizeData)", () => {
  it("aplica colorizePixel em cada pixel visível e mantém o alpha", () => {
    const tone = toneColor("crimson");
    const data = new Uint8ClampedArray([0, 0, 0, 255, MID, MID, MID, 128, 0x8d, 0x97, 0x7f, 255]);
    colorizeData(data, tone);
    expect([...data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...data.slice(4, 8)]).toEqual([(tone >> 16) & 255, (tone >> 8) & 255, tone & 255, 128]);
    expect([...data.slice(8, 12)]).toEqual([...colorizePixel(0x8d, 0x97, 0x7f, tone), 255]);
  });

  it("pixel transparente e pele do pack ficam como estão; cores repetidas saem iguais", () => {
    const skin = [...TONE_KEEP][0]!;
    const data = new Uint8ClampedArray([
      90, 40, 200, 0,
      skin >> 16, (skin >> 8) & 255, skin & 255, 255,
      60, 70, 80, 255,
      60, 70, 80, 255,
    ]);
    colorizeData(data, toneColor("emerald"));
    expect([...data.slice(0, 4)]).toEqual([90, 40, 200, 0]);
    expect([...data.slice(4, 8)]).toEqual([skin >> 16, (skin >> 8) & 255, skin & 255, 255]);
    expect([...data.slice(8, 12)]).toEqual([...data.slice(12, 16)]);
    expect([...data.slice(8, 11)]).not.toEqual([60, 70, 80]);
  });
});

describe("amostras dos tons na janela", () => {
  it("ordem: vivos pelo matiz (arco-íris), depois terrosos e por fim cinzas do claro ao escuro", () => {
    const ids = swatchOrder(OUTFIT_TONES).map((t) => t.id);
    expect(ids).toHaveLength(OUTFIT_TONES.length);
    expect(ids.slice(0, 3)).toEqual(["crimson", "amber", "gold"]);
    expect(ids.indexOf("emerald")).toBeLessThan(ids.indexOf("azure"));
    expect(ids.indexOf("azure")).toBeLessThan(ids.indexOf("violet"));
    expect(ids.slice(-4)).toEqual(["chestnut", "silver", "slate", "charcoal"]);
  });

  it("a amostra mostra o meio-tom exato do tom (o que a roupa vira)", () => {
    for (const t of OUTFIT_TONES) {
      const [r, g, b] = [(t.color >> 16) & 255, (t.color >> 8) & 255, t.color & 255];
      expect(swatchBackground(t.color), t.id).toContain(`rgb(${r} ${g} ${b}) 48%`);
    }
  });
});
