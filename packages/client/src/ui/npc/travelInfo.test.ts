import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWorldIndex, type TiledMap } from "@lemonquest/shared";
import { travelInfo } from "./travelInfo.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const index = buildWorldIndex(JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap);

describe("viagem: faixa de level do destino", () => {
  it("Fronteira é perigosa para quem está abaixo; a Vila não", () => {
    const low = travelInfo(index, "coach_village", "frontier", 10)!;
    expect(low.text).toMatch(/^Monstros em volta: lv \d+–\d+$/);
    expect(low.danger).toBe(true);
    expect(travelInfo(index, "coach_village", "frontier", 90)!.danger).toBe(false);
    expect(travelInfo(index, "coach_frontier", "village", 1)).toMatchObject({ danger: false, text: expect.stringMatching(/lv 1–/) });
  });

  it("Estação do Minério (cercada, saída por portal): vale o Pátio logo depois do portão", () => {
    const info = travelInfo(index, "chefe_estacao_vila", "minerio", 5)!;
    expect(info.text).toMatch(/^Monstros em volta: lv \d+–\d+$/);
    expect(info.danger).toBe(true); // lv 5 abaixo do Pátio de Minério
  });

  it("destino sem monstro (Oficina), destino desconhecido e índice ainda carregando", () => {
    expect(travelInfo(index, "coach_village", "oficina", 1)).toEqual({ text: "Sem monstros por perto", danger: false });
    expect(travelInfo(index, "coach_village", "nao_existe", 1)).toBeNull();
    expect(travelInfo(null, "coach_village", "frontier", 1)).toBeNull();
  });
});
