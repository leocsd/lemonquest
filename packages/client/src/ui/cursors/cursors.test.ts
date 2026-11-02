import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import meta from "./cursors.json";

// Cursores do tema limão (tools/cursors/generate.mjs). Garante que o desenho e o CSS gerado batem e que nenhum CSS do
// cliente volta a usar o cursor do sistema (cursor: pointer etc. some com o tema).
const DIR = resolve(__dirname);
const UI = resolve(__dirname, "..");
const css = readFileSync(join(DIR, "cursors.css"), "utf8");

function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? cssFiles(p) : n.endsWith(".css") ? [p] : [];
  });
}

describe("cursores do tema limão", () => {
  const nomes = Object.keys(meta) as (keyof typeof meta)[];

  it("cada cursor tem PNG 32×32, hotspot dentro e variável no CSS", () => {
    expect(nomes.length).toBeGreaterThanOrEqual(12);
    for (const n of nomes) {
      const { w, h } = pngSize(join(DIR, `${n}.png`));
      expect([w, h]).toEqual([32, 32]);
      const m = meta[n];
      expect(m.x).toBeGreaterThanOrEqual(0); expect(m.x).toBeLessThan(32);
      expect(m.y).toBeGreaterThanOrEqual(0); expect(m.y).toBeLessThan(32);
      expect(css).toContain(`--cur-${n}: url("./${n}.png") ${m.x} ${m.y}, ${m.reserva};`);
    }
  });

  it("os cursores do canvas (game/cursor.ts) existem", () => {
    for (const n of ["padrao", "ataque", "falar", "mao", "pegar", "olhar"]) expect(nomes).toContain(n);
  });

  it("nenhum CSS do cliente usa cursor do sistema nem variável inexistente", () => {
    const ruins: string[] = [];
    for (const f of cssFiles(UI)) {
      const txt = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, val] of txt.matchAll(/(?<![-\w])cursor:\s*([^;}]+)/g)) {
        const v = val.replace(/\s*!important\s*$/, "").trim();
        const ok = /^var\(--cur-([a-z]+)\)$/.exec(v);
        if (v === "none" || v === "inherit") continue;
        if (!ok || !nomes.includes(ok[1] as keyof typeof meta)) ruins.push(`${f}: cursor: ${v}`);
      }
    }
    expect(ruins).toEqual([]);
  });
});
