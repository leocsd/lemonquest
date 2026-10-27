import { describe, expect, it } from "vitest";
import { canInviteOnline, groupOnline, onlineLine, onlineTip } from "./onlineLogic.ts";

describe("painel Online: linha e botões", () => {
  it("blocos: seu grupo, amigos e o resto, na ordem recebida; um bloco só fica sem rótulo", () => {
    const list = [
      { name: "a", party: false, friend: true }, { name: "b", party: true, friend: true }, { name: "c", party: false, friend: false },
      { name: "d", party: false, friend: true }, { name: "e", party: true, friend: false },
    ];
    expect(groupOnline(list).map((g) => [g.key, g.label, g.entries.map((e) => e.name).join("")])).toEqual([
      ["party", "Seu grupo", "be"], ["friends", "Amigos", "ad"], ["others", "No mundo", "c"],
    ]);
    expect(groupOnline([{ party: false, friend: false }, { party: false, friend: false }]).map((g) => [g.key, g.label])).toEqual([["others", ""]]);
    expect(groupOnline([])).toEqual([]);
  });

  it("level, zona (quando a regra do /quem deixa) e ausente", () => {
    expect(onlineLine({ level: 45, zone: "Pântano Turvo" })).toBe("lv 45 · Pântano Turvo");
    expect(onlineLine({ level: 45 })).toBe("lv 45");
    expect(onlineLine({ level: 45, away: true })).toBe("lv 45 · ausente");
  });

  it("Convidar: fora do seu grupo, e só se você está sem grupo ou é o líder (como o botão direito)", () => {
    expect(canInviteOnline({ party: false }, { inParty: false, leader: false })).toBe(true);
    expect(canInviteOnline({ party: false }, { inParty: true, leader: true })).toBe(true);
    expect(canInviteOnline({ party: false }, { inParty: true, leader: false })).toBe(false);
    expect(canInviteOnline({ party: true }, { inParty: true, leader: true })).toBe(false);
  });

  it("dica: vocação, XP dividida e o porquê da zona escondida", () => {
    expect(onlineTip({ share: true, zone: "Vila", friend: true, party: false }, "Druida")).toBe("Druida · divide XP com você");
    expect(onlineTip({ share: false, friend: false, party: false }, "Cavaleiro")).toBe("Cavaleiro · zona só para amigos mútuos e grupo");
    // Amigo só de um lado (a ☆ não pede licença): a zona espera a amizade mútua.
    expect(onlineTip({ share: false, friend: true, party: false }, "Paladino")).toBe("Paladino · zona aparece quando a amizade for mútua");
  });
});
