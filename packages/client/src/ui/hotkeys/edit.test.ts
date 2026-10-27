import { describe, expect, it } from "vitest";
import { HOTKEY_MAX, keyLabel, type Hotkey } from "@lemonquest/shared";
import { addRow, addSlot, assignKey, hotkeyIndex, keyFromEvent, nextFreeKey, placeUnlocked, removeRow, setRowSpell, swapHotkeySpells } from "./edit.ts";

const L: Hotkey[] = [{ key: "Digit1", spellId: "fireball" }, { key: "Digit2", spellId: "energy_wave" }];
const ev = (code: string, o: Partial<KeyboardEvent> = {}) => ({ code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...o });

describe("edição dos atalhos", () => {
  it("tecla do evento: Shift vira prefixo; Ctrl/Alt/Meta não são atalho", () => {
    expect(keyFromEvent(ev("KeyF"))).toBe("KeyF");
    expect(keyFromEvent(ev("Digit2", { shiftKey: true }))).toBe("Shift+Digit2");
    expect(keyFromEvent(ev("Digit2", { ctrlKey: true }))).toBeNull();
    expect(keyFromEvent(ev("Digit2", { altKey: true }))).toBeNull();
    expect(hotkeyIndex(L, "Digit2")).toBe(1);
    expect(hotkeyIndex(L, null)).toBe(-1);
  });

  it("tecla do jogo é recusada com o motivo; tecla livre é aplicada", () => {
    const bad = assignKey(L, 0, "KeyQ", keyLabel);
    expect(bad).toMatchObject({ error: true, message: "Tecla Q usada por: Poção de vida" });
    expect(bad.list).toEqual(L);
    expect(assignKey(L, 0, "KeyF", keyLabel).list[0]).toEqual({ key: "KeyF", spellId: "fireball" });
  });

  it("tecla de outra linha: as duas trocam de tecla (com aviso)", () => {
    const r = assignKey(L, 0, "Digit2", keyLabel);
    expect(r.error).toBeUndefined();
    expect(r.message).toMatch(/trocaram/);
    expect(r.list).toEqual([{ key: "Digit2", spellId: "fireball" }, { key: "Digit1", spellId: "energy_wave" }]);
    expect(L[0]!.key).toBe("Digit1"); // não muta a original
  });

  it("magia, remover, trocar magias e adicionar", () => {
    expect(setRowSpell(L, 1, "inferno")[1]).toEqual({ key: "Digit2", spellId: "inferno" });
    expect(removeRow(L, 0)).toEqual([{ key: "Digit2", spellId: "energy_wave" }]);
    expect(swapHotkeySpells(L, 0, 1)).toEqual([{ key: "Digit1", spellId: "energy_wave" }, { key: "Digit2", spellId: "fireball" }]);
    expect(swapHotkeySpells(L, 0, 5)).toEqual(L);
    const added = addRow(L, "sorcerer").list;
    expect(added).toHaveLength(3);
    expect(added[2]!.key).toBe("Digit3");
    expect(["fireball", "energy_wave"]).not.toContain(added[2]!.spellId);
  });

  it("no máximo HOTKEY_MAX; teclas livres acabam nas letras e depois com Shift", () => {
    let list: Hotkey[] = [];
    for (let i = 0; i < HOTKEY_MAX + 3; i++) list = addRow(list, "druid").list;
    expect(list).toHaveLength(HOTKEY_MAX);
    expect(addRow(list, "druid").error).toBe(true);
    expect(new Set(list.map((h) => h.key)).size).toBe(HOTKEY_MAX);
    expect(nextFreeKey(["Digit1"])).toBe("Digit2");
  });

  it("addSlot (slot +): próxima tecla livre com aviso; já na barra ou barra cheia é erro", () => {
    const r = addSlot(L, "inferno", keyLabel);
    expect(r.list.at(-1)).toEqual({ key: "Digit3", spellId: "inferno" });
    expect(r.message).toBe("Na tecla 3.");
    expect(L).toHaveLength(2); // não muta a original
    expect(addSlot(L, "fireball", keyLabel)).toMatchObject({ error: true, message: "Já está na tecla 1." });
    const full = Array.from({ length: HOTKEY_MAX }, (_, i) => ({ key: `Key${"BCFGTUVXYZNP"[i]}`, spellId: `s${i}` }));
    expect(addSlot(full, "inferno", keyLabel)).toMatchObject({ error: true, message: `A barra está cheia (${HOTKEY_MAX}): tire um atalho.` });
  });

  it("sem magia repetida: escolher a magia de outra linha troca as duas; com todas já em atalhos, não adiciona", () => {
    expect(setRowSpell(L, 1, "fireball")).toEqual([{ key: "Digit1", spellId: "energy_wave" }, { key: "Digit2", spellId: "fireball" }]);
    let list: Hotkey[] = [];
    // Paladino: 11 magias, uma tecla sobrando (o cavaleiro chegou a 12 com a Muralha de Escudos e bateria no limite antes).
    for (let i = 0; i < 11; i++) list = addRow(list, "paladin").list;
    expect(new Set(list.map((h) => h.spellId)).size).toBe(11);
    expect(addRow(list, "paladin")).toMatchObject({ error: true, message: "Todas as suas magias já têm atalho." });
  });

  describe("magia nova ao subir de level", () => {
    const lbl = (k: string) => keyLabel(k);

    it("família já na barra: só avisa; magia avulsa nova entra na próxima tecla livre", () => {
      const list: Hotkey[] = [{ key: "Digit1", spellId: "light_heal" }, { key: "Digit2", spellId: "fam:sorcerer:target" }];
      const r = placeUnlocked(list, "sorcerer", 14, 20, lbl);
      // lv 15: Escudo de Mana (avulsa) entra; lv 20: Raio de Energia já está na família da tecla 2.
      expect(r.list).toEqual([...list, { key: "Digit3", spellId: "mana_shield" }]);
      expect(r.notes).toEqual(["Nova magia: Escudo de Mana na tecla 3.", "Nova magia: Raio de Energia, já na tecla 2 (Ataque no alvo)."]);
    });

    it("primeira magia de uma família entra como a família; quem monta magia por magia continua assim", () => {
      const r = placeUnlocked([{ key: "Digit1", spellId: "light_heal" }], "sorcerer", 4, 5, lbl);
      // lv 5: Pés Ligeiros (avulsa) na 2 e Onda de Energia como a família Onda na 3.
      expect(r.list.slice(1)).toEqual([{ key: "Digit2", spellId: "swift_feet" }, { key: "Digit3", spellId: "fam:sorcerer:wave" }]);
      const solo = placeUnlocked([{ key: "Digit1", spellId: "energy_wave" }], "sorcerer", 34, 35, lbl);
      expect(solo.list.at(-1)).toEqual({ key: "Digit2", spellId: "fire_wave" });
    });

    it("atalho que já existia (estava escondido) só ganha o aviso; barra cheia avisa para abrir o H", () => {
      const r = placeUnlocked([{ key: "KeyF", spellId: "inferno" }], "sorcerer", 29, 30, lbl);
      expect(r.list).toEqual([{ key: "KeyF", spellId: "inferno" }]);
      expect(r.notes).toEqual(["Nova magia: Inferno na tecla F."]);
      const full = Array.from({ length: HOTKEY_MAX }, (_, i) => ({ key: nextFreeKey([])!.replace("1", "") + i, spellId: "x" + i }));
      const f = placeUnlocked(full, "sorcerer", 29, 30, lbl);
      expect(f.list).toHaveLength(HOTKEY_MAX);
      expect(f.notes[0]).toContain("A barra está cheia");
    });
  });
});
