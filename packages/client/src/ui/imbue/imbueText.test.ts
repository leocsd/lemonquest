import { describe, expect, it } from "vitest";
import { fmtImbueBadge, fmtImbueLeft, imbuedDetail } from "./imbueText.ts";

const MIN = 60_000, H = 60 * MIN;

describe("tempo do encantamento", () => {
  it("por extenso: horas e minutos, minutos arredondados para cima", () => {
    expect(fmtImbueLeft(10 * H)).toBe("10h");
    expect(fmtImbueLeft(7 * H + 30 * MIN)).toBe("7h 30min");
    expect(fmtImbueLeft(7 * H + 29 * MIN + 1)).toBe("7h 30min");
    expect(fmtImbueLeft(45 * MIN)).toBe("45min");
    expect(fmtImbueLeft(1)).toBe("1min");
    expect(fmtImbueLeft(0)).toBe("0min");
  });

  it("selo da faixa: horas cheias (para baixo) ou minutos", () => {
    expect(fmtImbueBadge(10 * H)).toBe("10h");
    expect(fmtImbueBadge(7 * H + 59 * MIN)).toBe("7h");
    expect(fmtImbueBadge(60 * MIN)).toBe("1h");
    expect(fmtImbueBadge(59 * MIN + 1)).toBe("1h");
    expect(fmtImbueBadge(59 * MIN)).toBe("59m");
    expect(fmtImbueBadge(45 * MIN)).toBe("45m");
  });

  it("dica do ícone: nome com tier e tempo de combate", () => {
    expect(imbuedDetail("lifesteal", 2, 450)).toBe("Dreno de Vida II · 7h 30min de combate");
    expect(imbuedDetail("haste", 3, 45)).toBe("Veloz III · 45min de combate");
    expect(imbuedDetail("nope", 9, 60)).toBe("Encantamento · 1h de combate");
  });
});
