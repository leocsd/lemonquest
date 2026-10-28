/// <reference types="node" />
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADDON_FRAME, ADDON_OFFSET_X, ADDON_OFFSET_Y, DEFAULT_OUTFIT, OUTFITS, OUTFIT_LIST, activeAddons, addonLayers, outfitAvailable,
  outfitFaceset, outfitName, outfitSheet, outfitVocationLock, outfitsVisibleTo, resolveOutfit,
} from "./outfits.ts";
import { SEXES, VOCATIONS, isSex, sexOf } from "../types.ts";
import { computeAnchors, readSheet } from "../../../../tools/addons/anchors.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const asset = (rel: string) => root + "assets/" + rel;

describe("OUTFITS", () => {
  it("12–24 roupas, ids únicos, chaves = ids", () => {
    expect(OUTFIT_LIST.length).toBeGreaterThanOrEqual(12);
    expect(OUTFIT_LIST.length).toBeLessThanOrEqual(24);
    expect(new Set(OUTFIT_LIST.map((o) => o.id)).size).toBe(OUTFIT_LIST.length);
    for (const [k, o] of Object.entries(OUTFITS)) expect(o.id).toBe(k);
    const addonIds = OUTFIT_LIST.flatMap((o) => o.addons.map((a) => a.id));
    expect(new Set(addonIds).size).toBe(addonIds.length);
  });

  it("sheets base existem e são 64x112; sheets base diferentes entre si", () => {
    for (const o of OUTFIT_LIST) {
      expect(existsSync(asset(o.sheet)), o.sheet).toBe(true);
      const png = readSheet(asset(o.sheet));
      expect([png.width, png.height], o.id).toEqual([64, 112]);
    }
    expect(new Set(OUTFIT_LIST.map((o) => o.sheet)).size).toBe(OUTFIT_LIST.length);
  });

  it("2 addons por roupa, com nome e overlays existentes no layout 4x7 de frames 32x32", () => {
    for (const o of OUTFIT_LIST) {
      expect(o.addons).toHaveLength(2);
      for (const a of o.addons) {
        expect(a.name.length, a.id).toBeGreaterThan(2);
        for (const s of [a.sheet, a.backSheet].filter(Boolean) as string[]) {
          expect(existsSync(asset(s)), s).toBe(true);
          const png = readSheet(asset(s));
          expect([png.width, png.height], s).toEqual([4 * ADDON_FRAME, 7 * ADDON_FRAME]);
        }
        expect(a.extraTop).toBeGreaterThanOrEqual(0);
        expect(a.extraTop).toBeLessThanOrEqual(ADDON_OFFSET_Y);
      }
    }
  });

  it("retratos existem (Faceset do pack ou gerado) com 38x38", () => {
    for (const o of OUTFIT_LIST) {
      const face = o.faceset ?? o.sheet.replace(/SpriteSheet\.png$/, "Faceset.png");
      expect(existsSync(asset(face)), face).toBe(true);
      const png = readSheet(asset(face));
      expect([png.width, png.height], face).toEqual([38, 38]);
    }
  });

  it("toda vocação tem roupa padrão existente (Mago = sheet gerada com barba longa)", () => {
    for (const v of VOCATIONS) expect(OUTFITS[DEFAULT_OUTFIT[v]], v).toBeDefined();
    expect(OUTFITS[DEFAULT_OUTFIT.knight].sheet).toContain("/Knight/");
    expect(OUTFITS[DEFAULT_OUTFIT.paladin].sheet).toContain("/Hunter/");
    expect(OUTFITS[DEFAULT_OUTFIT.sorcerer].sheet).toBe("addons/base_mago.png");
    expect(OUTFITS[DEFAULT_OUTFIT.druid].sheet).toContain("/Shaman/");
    expect(resolveOutfit(undefined, "druid").id).toBe(DEFAULT_OUTFIT.druid);
    expect(resolveOutfit("pirata", "druid").id).toBe("pirata");
    expect(activeAddons(OUTFITS.mago, 2).map((a) => a.id)).toEqual(["mago_cajado"]);
    expect(activeAddons(OUTFITS.mago, 3)).toHaveLength(2);
  });
});

describe("sexo (♂/♀)", () => {
  it("sexo válido só \"m\" | \"f\"; o salvo ausente ou inválido vale \"m\" (personagens de antes)", () => {
    expect(SEXES).toEqual(["m", "f"]);
    for (const s of SEXES) expect(isSex(s)).toBe(true);
    for (const bad of [undefined, null, "", "M", "x", 0, {}]) { expect(isSex(bad)).toBe(false); expect(sexOf(bad)).toBe("m"); }
    expect(sexOf("f")).toBe("f");
  });

  it("12 roupas com versão feminina (com nome no feminino); as 8 fechadas vestem a mesma sheet nos dois sexos", () => {
    expect(OUTFIT_LIST.filter((o) => o.female).map((o) => o.id)).toEqual([
      "cidadao", "mago", "nobre", "invocador", "barbaro", "druida", "oriental", "pirata", "mendigo", "domador", "peregrino", "monge",
    ]);
    for (const o of OUTFIT_LIST) {
      if (o.female) { expect(o.nameF, o.id).toBeTruthy(); continue; }
      expect(o.nameF, o.id).toBeUndefined();
      expect(outfitSheet(o, "f")).toBe(o.sheet);
      expect(outfitFaceset(o, "f")).toBe(outfitFaceset(o, "m"));
      expect(o.addons.some((a) => a.female), o.id).toBe(false);
    }
    expect([outfitName(OUTFITS.cidadao!, "m"), outfitName(OUTFITS.cidadao!, "f")]).toEqual(["Cidadão", "Cidadã"]);
    expect(["mago", "barbaro", "mendigo", "domador", "peregrino", "monge"].map((id) => outfitName(OUTFITS[id]!, "f")))
      .toEqual(["Maga", "Bárbara", "Mendiga", "Domadora de Feras", "Peregrina", "Monja"]);
    expect(outfitName(OUTFITS.cavaleiro!, "f")).toBe("Cavaleiro");
    expect(outfitSheet(OUTFITS.mago!, undefined)).toBe("addons/base_mago.png"); // sem sexo = masculino
  });

  it("toda roupa existe e desenha nos dois sexos: sheet 64x112, retrato 38x38, overlays 4x7 de 32x32", () => {
    for (const o of OUTFIT_LIST) for (const sex of SEXES) {
      const at = `${o.id} ${sex}`;
      expect(outfitAvailable(o, sex), at).toBe(true);
      const sheet = outfitSheet(o, sex);
      expect(existsSync(asset(sheet)), `${at} ${sheet}`).toBe(true);
      const png = readSheet(asset(sheet));
      expect([png.width, png.height], at).toEqual([64, 112]);
      const face = outfitFaceset(o, sex);
      expect(existsSync(asset(face)), `${at} ${face}`).toBe(true);
      const fp = readSheet(asset(face));
      expect([fp.width, fp.height], face).toEqual([38, 38]);
      for (const a of o.addons) {
        const l = addonLayers(a, sex);
        expect(!!l.backSheet, `${at} ${a.id}: frente/trás iguais nos dois sexos`).toBe(!!a.backSheet);
        for (const s of [l.sheet, l.backSheet].filter(Boolean) as string[]) {
          expect(existsSync(asset(s)), s).toBe(true);
          const ap = readSheet(asset(s));
          expect([ap.width, ap.height], s).toEqual([4 * ADDON_FRAME, 7 * ADDON_FRAME]);
        }
        expect(l.extraTop).toBeGreaterThanOrEqual(0);
        expect(l.extraTop).toBeLessThanOrEqual(ADDON_OFFSET_Y);
      }
    }
  });

  it("sheets femininas próprias: nenhuma repete outra sheet; as geradas ficam em addons/base_<id>_f.png", () => {
    const all = [...OUTFIT_LIST.map((o) => o.sheet), ...OUTFIT_LIST.flatMap((o) => (o.female ? [o.female] : []))];
    expect(new Set(all).size).toBe(all.length);
    for (const id of ["mago", "mendigo", "oriental", "domador", "peregrino", "monge"]) {
      expect(OUTFITS[id]!.female, id).toBe(`addons/base_${id}_f.png`);
    }
    // overlays femininos só onde o gerador redesenhou (cabeça diferente); a Invocadora tem a cabeça igual à dele
    for (const a of OUTFIT_LIST.flatMap((o) => o.addons)) if (a.female) expect(a.female.sheet).toBe(`addons/${a.id}_f.png`);
    expect(OUTFITS.invocador!.addons.some((a) => a.female)).toBe(false);
    expect(OUTFITS.cidadao!.addons.every((a) => a.female)).toBe(true);
  });
});

describe("âncoras dos addons", () => {
  it("cabeça detectada dentro do frame em todos os frames de caminhada (todas as roupas, os dois sexos)", () => {
    for (const o of OUTFIT_LIST) for (const sex of SEXES) {
      const png = readSheet(asset(outfitSheet(o, sex)));
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const a = computeAnchors(png, col, row);
        const at = `${o.id} ${sex} ${col},${row}`;
        expect(a.top, at).toBeGreaterThanOrEqual(0);
        expect(a.top, at).toBeLessThan(5);
        expect(a.bottom, at).toBeGreaterThanOrEqual(14);
        expect(a.neck, at).toBeGreaterThan(a.top + 5);
        expect(a.headL, at).toBeLessThan(a.headR);
        expect(a.c2 / 2, at).toBeGreaterThan(4);
        expect(a.c2 / 2, at).toBeLessThan(11);
      }
    }
  });

  it("chapéus cobrem o topo da cabeça em todo frame, nos dois sexos (sem chapéu flutuando nem cabelo vazando)", () => {
    const op = (png: { width: number; data: Uint8Array }, x: number, y: number) => png.data[(y * png.width + x) * 4 + 3] >= 128;
    for (const [outfit, addon] of [["mago", 0], ["cidadao", 0], ["cacador", 0], ["pirata", 0], ["barbaro", 0]] as const) for (const sex of SEXES) {
      const o = OUTFITS[outfit]!;
      const base = readSheet(asset(outfitSheet(o, sex)));
      const hat = readSheet(asset(addonLayers(o.addons[addon], sex).sheet));
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const a = computeAnchors(base, col, row);
        for (let y = a.top; y <= a.top + 1; y++) for (let x = 0; x < 16; x++) {
          if (!op(base, col * 16 + x, row * 16 + y)) continue;
          expect(op(hat, col * ADDON_FRAME + ADDON_OFFSET_X + x, row * ADDON_FRAME + ADDON_OFFSET_Y + y), `${outfit} ${sex} ${col},${row} (${x},${y})`).toBe(true);
        }
        // o chapéu encosta na cabeça: tem pixel opaco na linha do topo da base
        let touches = false;
        for (let x = 0; x < 16; x++) if (op(hat, col * ADDON_FRAME + ADDON_OFFSET_X + x, row * ADDON_FRAME + ADDON_OFFSET_Y + a.top)) touches = true;
        expect(touches, `${outfit} ${sex} ${col},${row}`).toBe(true);
      }
    }
  });
});

describe("roupa exclusiva por vocação (a Fada, vocação oculta)", () => {
  it("fada: trancada por vocação nos três bits, roupa padrão da Fada, uma sheet gerada para os dois sexos, invisível às outras", () => {
    const o = OUTFITS.fada!;
    for (const bit of [0, 1, 2] as const) expect(outfitVocationLock(o, bit), `bit ${bit}`).toBe("fairy");
    expect(outfitVocationLock(OUTFITS.pirata!, 0)).toBeUndefined();
    expect(DEFAULT_OUTFIT.fairy).toBe("fada");
    expect(o.female).toBeUndefined();
    expect([o.sheet, o.faceset]).toEqual(["addons/base_fada.png", "addons/base_fada_face.png"]);
    expect(o.addons.map((a) => [a.id, !!a.backSheet])).toEqual([["fada_asas", true], ["fada_varinha", false]]);
    expect(outfitsVisibleTo("knight").map((x) => x.id)).not.toContain("fada");
    expect(outfitsVisibleTo("druid")).toHaveLength(OUTFIT_LIST.length - 1);
    expect(outfitsVisibleTo("fairy")).toHaveLength(OUTFIT_LIST.length);
    expect(resolveOutfit(undefined, "fairy").id).toBe("fada");
  });
});
