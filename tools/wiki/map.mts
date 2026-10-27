// Mapa da wiki: o mundo inteiro num PNG (2 px por tile) com a MESMA regra de cor do minimapa do jogo
// (packages/client/src/ui/minimap/store.ts, buildBase: média dos pixels opacos do tile, camadas above → deco → ground,
// água puxada para o azul, colisão escurecida) e uma página por zona com o recorte dela, o que nasce lá, NPCs, portais
// e missões. Rótulos e marcadores são HTML por cima da imagem (posições em %), não pixels: o PNG fica só com o terreno.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  MONSTERS, NPCS, TRAVEL_FREE_LEVEL, findObjects, monsterDef, questChestGroup,
  type TiledMap, type WorldPortal,
} from "../../packages/shared/src/index.ts";
import {
  ASSETS, creatureIcon, esc, fmt, link, monsterLink, npcIcon, npcLink, questLink, slug, table, up, zoneLink,
  type WikiPage,
} from "./html.mts";
import type { WikiModel } from "./model.mts";

export interface WikiFile { path: string; data: Buffer }

/** Pixels por tile no mapa do mundo. */
const WORLD_SCALE = 2;
/** Lado maior (px) do recorte de uma zona; a escala fica entre 2 e 8 px por tile. */
const CROP_TARGET = 640;
const CROP_MARGIN = 3;
/** Fora da zona, no recorte: o terreno escurece para a zona se destacar. */
const OUTSIDE_DIM = 0.4;

const GID_MASK = 0x1fffffff;
const FOG_RGB = [7, 8, 12] as const;
const WATER_RGB = [47, 111, 181] as const;
const MIN_OPAQUE = 0.4;

/** Cor (RGB) de cada tile do mapa, como o minimapa: Uint8Array W×H×3. */
export function tileColors(map: TiledMap): Uint8Array {
  const W = map.width, H = map.height, tw = map.tilewidth, th = map.tileheight;
  const layer = (n: string) => map.layers.find((l) => l.type === "tilelayer" && l.name === n)?.data;
  const order = [layer("above"), layer("deco"), layer("ground")];
  const collision = layer("collision");
  const images = new Map<string, PNG>();
  const sets = map.tilesets
    .filter((ts) => ts.image)
    .map((ts) => {
      const file = join(ASSETS, "maps", ts.image!);
      let img = images.get(file);
      if (!img) { img = PNG.sync.read(readFileSync(file)); images.set(file, img); }
      return { ts, img };
    })
    .sort((a, b) => b.ts.firstgid - a.ts.firstgid);
  const cache = new Map<number, [number, number, number] | null>();
  const colorOf = (gid: number): [number, number, number] | null => {
    if (cache.has(gid)) return cache.get(gid)!;
    let res: [number, number, number] | null = null;
    const s = sets.find((t) => gid >= t.ts.firstgid);
    if (s) {
      const px = s.img;
      const cols = s.ts.columns || Math.floor(px.width / tw);
      const id = gid - s.ts.firstgid;
      const ox = (id % cols) * tw, oy = Math.floor(id / cols) * th;
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const o = ((oy + y) * px.width + ox + x) * 4;
          if (o + 3 >= px.data.length || px.data[o + 3]! < 128) continue;
          r += px.data[o]!; g += px.data[o + 1]!; b += px.data[o + 2]!; n++;
        }
      }
      if (n >= tw * th * MIN_OPAQUE) {
        res = [r / n, g / n, b / n];
        if (/water/i.test(s.ts.name ?? "")) res = res.map((v, i) => v * 0.55 + WATER_RGB[i]! * 0.45) as [number, number, number];
      }
    }
    cache.set(gid, res);
    return res;
  };
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    let c: [number, number, number] | null = null;
    for (const l of order) {
      const gid = (l?.[i] ?? 0) & GID_MASK;
      if (gid && (c = colorOf(gid))) break;
    }
    let [r, g, b] = c ?? FOG_RGB;
    if (collision?.[i]) { r *= 0.8; g *= 0.8; b *= 0.8; }
    // Uint8ClampedArray do canvas trunca; aqui também (|0), para dar os mesmos pixels do minimapa.
    out[i * 3] = r | 0; out[i * 3 + 1] = g | 0; out[i * 3 + 2] = b | 0;
  }
  return out;
}

/** PNG do retângulo de tiles [x0..x1]×[y0..y1] a `k` px por tile; `dim(x,y)` = fator de brilho do tile (1 = normal). */
function renderPng(colors: Uint8Array, W: number, x0: number, y0: number, x1: number, y1: number, k: number, dim?: (x: number, y: number) => number): Buffer {
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const png = new PNG({ width: tw * k, height: th * k });
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const i = ((y0 + ty) * W + x0 + tx) * 3;
      const f = dim ? dim(x0 + tx, y0 + ty) : 1;
      const r = colors[i]! * f, g = colors[i + 1]! * f, b = colors[i + 2]! * f;
      for (let py = 0; py < k; py++) {
        let o = ((ty * k + py) * png.width + tx * k) * 4;
        for (let pxl = 0; pxl < k; pxl++, o += 4) { png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255; }
      }
    }
  }
  return PNG.sync.write(png);
}

interface Box { x0: number; y0: number; x1: number; y1: number }
interface Marker { x: number; y: number; cls: string; title: string; href?: string; label?: string }

/** Marcadores e rótulos em % sobre a imagem do retângulo `b` (tiles). */
function mapView(img: string, alt: string, b: Box, markers: Marker[], depth: number, cls = ""): string {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  const pos = (x: number, y: number) => `left:${(((x - b.x0) / w) * 100).toFixed(3)}%;top:${(((y - b.y0) / h) * 100).toFixed(3)}%`;
  const mk = markers.map((m) => {
    const inner = m.label ? esc(m.label) : "";
    const attrs = `class="${m.cls}" style="${pos(m.x, m.y)}" title="${esc(m.title)}"`;
    return m.href ? `<a ${attrs} href="${esc(up(depth) + m.href)}">${inner}</a>` : `<span ${attrs}>${inner}</span>`;
  }).join("");
  return `<div class="mapview ${cls}" style="aspect-ratio:${w}/${h}"><img src="${esc(img)}" alt="${esc(alt)}" width="${w}" height="${h}">${mk}</div>`;
}

const LEGEND = `<ul class="legend">
<li><span class="mk npc"></span>NPC</li><li><span class="mk portal"></span>Portal</li><li><span class="mk boss"></span>Chefe</li><li><span class="mk spawn"></span>Criaturas (spawn)</li>
</ul>`;

/** "lv 10–25" ou "sem monstros". */
const levelsText = (l: { min: number; max: number } | undefined): string =>
  (l ? (l.min === l.max ? `lv ${l.min}` : `lv ${l.min}–${l.max}`) : "sem monstros");

/** O que o NPC faz, em poucas palavras. */
function npcRoles(m: WikiModel, id: string): string[] {
  const d = NPCS[id];
  if (!d) return [];
  const r: string[] = [];
  if (d.shop) r.push(d.shop.buys?.length ? "Loja (compra e vende)" : "Loja");
  if (d.depot) r.push("Depósito");
  if (d.travel?.length) r.push("Viagem");
  if (d.blessing) r.push("Bênção");
  if (d.imbuement) r.push("Encantamento");
  if (d.casino) r.push("Cassino");
  const q = m.questsOf(id).length;
  if (q) r.push(q === 1 ? "1 missão" : `${q} missões`);
  return r;
}

const travelPriceText = (price: number): string => (price > 0 ? `${fmt(price)} de ouro (grátis até o lv ${TRAVEL_FREE_LEVEL})` : "grátis");

/** Requisito da porta ("lv 10+", "missão X", baú). */
function portalReq(p: WorldPortal, depth: number): string {
  const r: string[] = [];
  if (p.minLevel) r.push(`lv ${p.minLevel}+`);
  if (p.quest) r.push(`missão ${questLink(p.quest, depth)}`);
  if (p.chestGroup) r.push(esc(questChestGroup(p.chestGroup)?.name ?? p.chestGroup));
  return r.join(" · ") || "livre";
}

export function renderMap(m: WikiModel): { pages: WikiPage[]; files: WikiFile[] } {
  const map = m.mapJson;
  const W = map.width, H = map.height;
  const colors = tileColors(map);
  const pages: WikiPage[] = [];
  const files: WikiFile[] = [];

  // Zona de cada tile (menor área vence, a regra do jogo), para destacar a zona no recorte.
  const zoneNames = m.index.zones.map((z) => z.name);
  const zoneIdx = new Map(zoneNames.map((n, i) => [n, i]));
  const zoneGrid = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const z = m.index.zoneAt(x, y); if (z) zoneGrid[y * W + x] = zoneIdx.get(z)!; }

  const zoneObjs = findObjects(map, "zone");
  const isPz = (name: string) => zoneObjs.some((o) => o.name === name && o.properties?.some((p) => p.name === "pz" && p.value === true));

  // Centro de cada zona ponderado pela área dos retângulos (como os rótulos do minimapa).
  const centroid = (name: string): { x: number; y: number } => {
    let sx = 0, sy = 0, area = 0;
    for (const r of m.index.zones.find((z) => z.name === name)?.rects ?? []) {
      const a = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
      sx += ((r.x0 + r.x1 + 1) / 2) * a; sy += ((r.y0 + r.y1 + 1) / 2) * a; area += a;
    }
    return area ? { x: sx / area - 0.5, y: sy / area - 0.5 } : { x: 0, y: 0 };
  };

  // Spawns por zona e chefes.
  const spawnsByZone = new Map<string, { id: string; x: number; y: number; count: number }[]>();
  const bossSpawns: Marker[] = [];
  for (const def of m.monsters) {
    for (const s of m.spawnsOf(def.id)) {
      const l = spawnsByZone.get(s.zone) ?? [];
      l.push({ id: def.id, x: s.x, y: s.y, count: s.count });
      spawnsByZone.set(s.zone, l);
      if (def.boss) bossSpawns.push({ x: s.x, y: s.y, cls: "mk boss", title: `${def.name} (chefe, lv ${def.level})`, href: `criaturas/${slug(def.id)}.html` });
    }
  }

  // --- mundo ---------------------------------------------------------------------------------------------------------
  files.push({ path: "mapa.png", data: renderPng(colors, W, 0, 0, W - 1, H - 1, WORLD_SCALE) });
  const world: Box = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  const npcMarkers = (zone?: string): Marker[] => m.index.npcs.filter((n) => !zone || n.zone === zone)
    .map((n) => ({ x: n.x, y: n.y, cls: "mk npc", title: NPCS[n.id]?.name ?? n.id, href: `npcs/${slug(n.id)}.html` }));
  const portalMarkers = (zone?: string): Marker[] => m.index.portals.filter((p) => !zone || m.zoneOf(p.x, p.y) === zone)
    .map((p) => ({ x: p.x, y: p.y, cls: "mk portal", title: `Portal → ${p.label}`, ...(p.zone ? { href: `mapa/${slug(p.zone)}.html` } : {}) }));
  const labels: Marker[] = zoneNames.map((name) => ({ ...centroid(name), cls: "zl", title: name, href: `mapa/${slug(name)}.html`, label: name }));

  const zoneRows = zoneNames.map((name) => {
    const sp = spawnsByZone.get(name) ?? [];
    const kinds = new Set(sp.map((s) => s.id));
    const npcs = m.index.npcs.filter((n) => n.zone === name).length;
    const lv = m.zoneLevels(name);
    return { name, lv, kinds: kinds.size, npcs, pz: isPz(name) };
  }).sort((a, b) => (a.lv?.min ?? Infinity) - (b.lv?.min ?? Infinity) || a.name.localeCompare(b.name, "pt-BR"));

  const worldBody = `<h1>Mapa do mundo</h1>
<p class="lead">O mundo inteiro (${fmt(W)} × ${fmt(H)} tiles), com as cores do minimapa do jogo. Clique num nome para ver a zona: o que nasce lá, NPCs, portais e missões. Passe o mouse nos pontos para ver o que são.</p>
${LEGEND}
${mapView("../mapa.png", "Mapa do mundo", world, [...portalMarkers(), ...npcMarkers(), ...bossSpawns, ...labels], 1, "world")}
<h2>Zonas (${zoneNames.length})</h2>
${table(["Zona", "Level", "Tipos de criatura", "NPCs"], zoneRows.map((z) => [
    `${zoneLink(z.name, 1)}${z.pz ? ' <span class="tag pz" title="Zona de proteção: sem combate">PZ</span>' : ""}`,
    `<span data-sort="${z.lv?.min ?? 9999}">${esc(levelsText(z.lv))}</span>`, z.kinds, z.npcs,
  ]), { sortable: true })}`;
  pages.push({
    path: "mapa/index.html", title: "Mapa do mundo", body: worldBody,
    search: [{ title: "Mapa do mundo", kind: "Mapa", text: "mapa mundo zonas regiões" }],
  });

  // --- zonas ---------------------------------------------------------------------------------------------------------
  for (const zone of m.index.zones) {
    const name = zone.name;
    const zi = zoneIdx.get(name)!;
    const s = slug(name);
    const box: Box = {
      x0: Math.max(0, Math.min(...zone.rects.map((r) => r.x0)) - CROP_MARGIN),
      y0: Math.max(0, Math.min(...zone.rects.map((r) => r.y0)) - CROP_MARGIN),
      x1: Math.min(W - 1, Math.max(...zone.rects.map((r) => r.x1)) + CROP_MARGIN),
      y1: Math.min(H - 1, Math.max(...zone.rects.map((r) => r.y1)) + CROP_MARGIN),
    };
    const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
    const k = Math.max(2, Math.min(8, Math.floor(CROP_TARGET / Math.max(bw, bh))));
    files.push({ path: `mapa/${s}.png`, data: renderPng(colors, W, box.x0, box.y0, box.x1, box.y1, k, (x, y) => (zoneGrid[y * W + x] === zi ? 1 : OUTSIDE_DIM)) });

    const sp = spawnsByZone.get(name) ?? [];
    const byMonster = new Map<string, { points: number; count: number }>();
    for (const x of sp) { const e = byMonster.get(x.id) ?? { points: 0, count: 0 }; e.points++; e.count += x.count; byMonster.set(x.id, e); }
    const spawnMarkers: Marker[] = sp.map((x) => {
      const d = monsterDef(x.id);
      return { x: x.x, y: x.y, cls: d?.boss ? "mk boss" : "mk spawn", title: `${d?.name ?? x.id} ×${x.count}`, href: `criaturas/${slug(x.id)}.html` };
    });
    const npcsHere = m.index.npcs.filter((n) => n.zone === name);
    const portalsOut = m.index.portals.filter((p) => m.zoneOf(p.x, p.y) === name);
    const portalsIn = m.index.portals.filter((p) => p.zone === name && m.zoneOf(p.x, p.y) !== name);
    const lv = m.zoneLevels(name);
    // Sem monstro (vila, estação): a faixa do que há em volta, pela mesma conta do jogo (levelsNear do índice).
    const c = centroid(name);
    const near = lv ? undefined : m.index.levelsNear(Math.round(c.x), Math.round(c.y));
    const pz = isPz(name);

    const parts: string[] = [];
    parts.push(`<h1>${esc(name)}</h1>`);
    const facts = [
      `<b>Level:</b> ${esc(levelsText(lv))}${near ? ` (arredores: ${esc(levelsText(near))})` : ""}`,
      pz ? `<span class="tag pz">Zona de proteção</span> sem combate e com regeneração ×3` : "",
      `<b>Tamanho:</b> ${zone.rects.length === 1 ? "1 área" : `${zone.rects.length} áreas`}`,
    ].filter(Boolean);
    parts.push(`<p class="facts">${facts.join(" · ")}</p>`);
    parts.push(LEGEND);
    parts.push(mapView(`${s}.png`, `Mapa de ${name}`, box, [...portalMarkers(name), ...npcMarkers(name), ...spawnMarkers], 1));

    if (byMonster.size) {
      const rows = [...byMonster].map(([id, e]) => ({ id, def: MONSTERS[id], ...e }))
        .sort((a, b) => (a.def?.level ?? 0) - (b.def?.level ?? 0) || a.id.localeCompare(b.id));
      parts.push(`<h2>Criaturas</h2>`);
      parts.push(table(["", "Criatura", "Level", "Quantidade", "Pontos de spawn"], rows.map((r) => [
        r.def ? creatureIcon(r.def, 32) : "",
        `${monsterLink(r.id, 1)}${r.def?.boss ? ' <span class="tag boss">chefe</span>' : ""}`,
        r.def?.level ?? 0, r.count, r.points,
      ]), { sortable: true }));
    }

    if (npcsHere.length) {
      parts.push(`<h2>NPCs</h2>`);
      parts.push(`<ul class="npc-list">${npcsHere.map((n) => {
        const d = NPCS[n.id];
        const roles = npcRoles(m, n.id);
        return `<li>${d ? npcIcon(d.sprite, d.name, 32) : ""}<span>${npcLink(n.id, 1)}${roles.length ? `<small>${esc(roles.join(" · "))}</small>` : ""}</span></li>`;
      }).join("")}</ul>`);
      const travel = npcsHere.flatMap((n) => (NPCS[n.id]?.travel ?? []).map((t) => ({ npc: n.id, t })));
      if (travel.length) {
        parts.push(`<h3>Viagens daqui</h3>`);
        parts.push(table(["NPC", "Destino", "Chega em", "Preço"], travel.map(({ npc, t }) => {
          const z = m.zoneOf(t.x, t.y);
          return [npcLink(npc, 1), esc(t.label), z ? zoneLink(z, 1) : "—", esc(travelPriceText(t.price))];
        })));
      }
    }

    if (portalsOut.length || portalsIn.length) {
      parts.push(`<h2>Portais</h2>`);
      if (portalsOut.length) {
        parts.push(table(["Saída (tile)", "Leva a", "Requisito"], portalsOut.map((p) => [
          `${p.x}, ${p.y}`, p.zone ? zoneLink(p.zone, 1) : "—", portalReq(p, 1),
        ])));
      }
      if (portalsIn.length) {
        const from = [...new Set(portalsIn.map((p) => m.zoneOf(p.x, p.y)).filter(Boolean))];
        parts.push(`<p><b>Chega-se também por portal de:</b> ${from.map((z) => zoneLink(z, 1)).join(", ")}.</p>`);
      }
    }

    const given = npcsHere.flatMap((n) => m.questsOf(n.id)).sort((a, b) => a.minLevel - b.minLevel);
    const explore = m.quests.filter((q) => q.steps.some((st) => st.kind === "explore" && st.target === name));
    if (given.length || explore.length) {
      parts.push(`<h2>Missões</h2>`);
      if (given.length) {
        parts.push(table(["Missão", "Dada por", "Level"], given.map((q) => [questLink(q.id, 1), npcLink(q.giver, 1), q.minLevel]), { sortable: true }));
      }
      if (explore.length) parts.push(`<p><b>Missões que pedem para explorar esta zona:</b> ${explore.map((q) => questLink(q.id, 1)).join(", ")}.</p>`);
    }

    pages.push({
      path: `mapa/${s}.html`, title: name, body: parts.join("\n"),
      nav: `${link("mapa/index.html", "Mapa", 1)} › ${esc(name)}`,
      search: [{
        title: name, kind: "Zona",
        text: [levelsText(lv), ...[...byMonster.keys()].map((id) => MONSTERS[id]?.name ?? id), ...npcsHere.map((n) => NPCS[n.id]?.name ?? n.id)].join(" "),
      }],
    });
  }
  return { pages, files };
}
