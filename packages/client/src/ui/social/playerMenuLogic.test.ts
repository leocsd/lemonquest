import { describe, expect, it } from "vitest";
import { playerMenuItems, selfMenuItems, type PlayerMenuState } from "./playerMenuLogic.ts";

const noop = () => {};
const A = { attack: noop, follow: noop, trade: noop, invite: noop, lead: noop, kick: noop };
const base: PlayerMenuState = { attacking: false, following: false, inParty: false, leader: false, member: false };
const labels = (s: Partial<PlayerMenuState>) => playerMenuItems({ ...base, ...s }, A).map((i) => i.label);

describe("menu do jogador", () => {
  it("Atacar vem por último e em vermelho; Parar de atacar também por último, sem vermelho", () => {
    const items = playerMenuItems(base, A);
    expect(items.map((i) => i.label)).toEqual(["Seguir", "Convidar para o grupo", "Trocar itens", "Atacar"]);
    expect(items.at(-1)!.danger).toBe(true);
    expect(items.slice(0, -1).some((i) => i.danger)).toBe(false);
    const stop = playerMenuItems({ ...base, attacking: true, following: true }, A);
    expect(stop.map((i) => i.label)).toEqual(["Parar de seguir", "Convidar para o grupo", "Trocar itens", "Parar de atacar"]);
    expect(stop.at(-1)!.danger).toBeFalsy();
  });

  it("grupo: líder passa liderança/expulsa membro; membro comum não convida; líder convida quem é de fora", () => {
    expect(labels({ inParty: true, leader: true, member: true })).toEqual(["Seguir", "Passar liderança", "Expulsar do grupo", "Trocar itens", "Atacar"]);
    expect(labels({ inParty: true, leader: false, member: true })).toEqual(["Seguir", "Trocar itens", "Atacar"]);
    expect(labels({ inParty: true, leader: false })).toEqual(["Seguir", "Trocar itens", "Atacar"]);
    expect(labels({ inParty: true, leader: true })).toEqual(["Seguir", "Convidar para o grupo", "Trocar itens", "Atacar"]);
  });

  it("cada item chama a ação certa", () => {
    const called: string[] = [];
    const acts = Object.fromEntries(Object.keys(A).map((k) => [k, () => called.push(k)])) as unknown as typeof A;
    for (const i of playerMenuItems({ ...base, inParty: true, leader: true, member: true }, acts)) i.run();
    expect(called).toEqual(["follow", "lead", "kick", "trade", "attack"]);
  });
});

describe("menu em você", () => {
  it("Trocar personagem sempre por último; item do chão e grupo só quando há", () => {
    const a = { outfit: noop, pickup: noop, leaveParty: noop, switchCharacter: noop };
    expect(selfMenuItems({ groundHere: false, inParty: false }, a).map((i) => i.label)).toEqual(["Trocar roupa", "Trocar personagem"]);
    expect(selfMenuItems({ groundHere: true, inParty: true }, a).map((i) => i.label)).toEqual(["Trocar roupa", "Pegar item do chão", "Sair do grupo", "Trocar personagem"]);
  });
});
