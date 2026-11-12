// Estado compartilhado do minimapa: cores do mapa, máscara de exploração (fog of war), posições e zonas.
// Vive fora dos componentes para já capturar S2C.Explored no momento em que a sala conecta.
import { Callbacks, type Room } from "@colyseus/sdk";
import { ExploredMask, S2C, type ExploredMsg, type TiledMap, type TiledObject } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { MAP_URL, worldMapJson } from "../../game/worldMap.ts";

const FOG_RGB = [7, 8, 12] as const; // #07080c
/** Se o Phaser não entregar o JSON do mapa em 10 s (cena não subiu?), o minimapa baixa por conta própria. */
const MAP_SHARE_TIMEOUT_MS = 10_000;
const GID_MASK = 0x1fffffff;
/** Fração mínima de pixels opacos para o tile contar como "visível" numa camada. */
const MIN_OPAQUE = 0.4;

export interface Zone { name: string; x: number; y: number; w: number; h: number } // em tiles
export interface ZoneLabel { name: string; x: number; y: number } // centro em tiles

interface Pos { x: number; y: number }

type Listener = () => void;

class MinimapStore {
  ready = false;
  width = 0;
  height = 0;
  base: HTMLCanvasElement | null = null; // 1px por tile
  fog: HTMLCanvasElement | null = null; // 1px por tile, alfa = escuridão
  mask: ExploredMask | null = null;
  me: Pos | null = null;
  others = new Map<string, Pos>();
  zones: Zone[] = [];
  zoneName: string | null = null;
  /** Incrementa a cada mudança que exige redesenho. */
  version = 0;

  private listeners = new Set<Listener>();
  private zoneListeners = new Set<Listener>();
  private pending: ExploredMsg | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private fogData: ImageData | null = null;
  private disposers: (() => void)[] = [];

  constructor() {
    void this.loadMap();
    session.onRoom((room) => this.bindRoom(room));
  }

  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  subscribeZone(l: Listener) { this.zoneListeners.add(l); return () => { this.zoneListeners.delete(l); }; }
  private bump() { this.version++; for (const l of this.listeners) l(); }

  // --- rede -----------------------------------------------------------------

  private bindRoom(room: Room) {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.others.clear();
    this.me = null;
    const myId = room.sessionId;
    this.disposers.push(room.onMessage(S2C.Explored, (m: ExploredMsg) => this.onExplored(m)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $ = Callbacks.get(room as any) as any;
    // Um desligador por jogador, solto quando ele sai (antes ia para `disposers` e ficava até trocar de sala: um por
    // login de colega, segurando o schema de quem já saiu). Mesmo padrão de hud/world.ts.
    const perPlayer = new Map<string, () => void>();
    this.disposers.push(
      $.onAdd("players", (p: Pos, id: string) => {
        this.setPos(id, myId, p.x, p.y);
        perPlayer.get(id)?.();
        perPlayer.set(id, $.onChange(p, () => this.setPos(id, myId, p.x, p.y)));
      }),
      $.onRemove("players", (_p: Pos, id: string) => {
        perPlayer.get(id)?.();
        perPlayer.delete(id);
        this.others.delete(id);
        this.bump();
      }),
      () => { for (const off of perPlayer.values()) off(); perPlayer.clear(); },
    );
  }

  private setPos(id: string, myId: string, x: number, y: number) {
    if (id === myId) {
      if (this.me && this.me.x === x && this.me.y === y) return;
      this.me = { x, y };
      this.mask?.reveal(x, y); // revelação local imediata (mesma função do servidor)
      if (this.mask) this.refreshFog(x, y);
      this.updateZone();
    } else {
      this.others.set(id, { x, y });
    }
    this.bump();
  }

  private onExplored(m: ExploredMsg) {
    if (!this.ready) { this.pending = m; return; }
    this.applyExplored(m);
  }

  private applyExplored(m: ExploredMsg) {
    if (m.width !== this.width || m.height !== this.height) return;
    const incoming = ExploredMask.fromBase64(m.width, m.height, m.bits);
    const mask = this.mask ?? (this.mask = new ExploredMask(m.width, m.height));
    for (let i = 0; i < mask.bits.length; i++) mask.bits[i] |= incoming.bits[i];
    if (this.me) mask.reveal(this.me.x, this.me.y);
    this.rebuildFog();
    this.bump();
  }

  // --- zonas ----------------------------------------------------------------

  /** Zona (menor área) que contém o tile. */
  zoneAt(x: number, y: number): string | null {
    let best: Zone | null = null;
    for (const z of this.zones) {
      if (x < z.x || y < z.y || x >= z.x + z.w || y >= z.y + z.h) continue;
      if (!best || z.w * z.h < best.w * best.h) best = z;
    }
    return best?.name ?? null;
  }

  private updateZone() {
    const name = this.me ? this.zoneAt(this.me.x, this.me.y) : null;
    if (name === this.zoneName) return;
    this.zoneName = name;
    for (const l of this.zoneListeners) l();
  }

  /** Rótulos das zonas que tiveram algum tile explorado (posição = centro ponderado por área). */
  visibleZoneLabels(): ZoneLabel[] {
    const mask = this.mask;
    if (!mask) return [];
    const groups = new Map<string, { sx: number; sy: number; area: number; seen: boolean }>();
    for (const z of this.zones) {
      const g = groups.get(z.name) ?? { sx: 0, sy: 0, area: 0, seen: false };
      const area = z.w * z.h;
      g.sx += (z.x + z.w / 2) * area;
      g.sy += (z.y + z.h / 2) * area;
      g.area += area;
      if (!g.seen) {
        outer: for (let y = z.y; y < z.y + z.h; y++) {
          for (let x = z.x; x < z.x + z.w; x++) if (mask.has(x, y)) { g.seen = true; break outer; }
        }
      }
      groups.set(z.name, g);
    }
    const out: ZoneLabel[] = [];
    for (const [name, g] of groups) if (g.seen) out.push({ name, x: g.sx / g.area, y: g.sy / g.area });
    return out;
  }

  // --- fog ------------------------------------------------------------------

  private unexploredNeighbours(x: number, y: number): number {
    const m = this.mask!;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
      if (!m.has(nx, ny)) n++;
    }
    return n;
  }

  private fogRegion(x0: number, y0: number, x1: number, y1: number) {
    if (!this.mask || !this.fogData || !this.fogCtx) return;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(this.width - 1, x1); y1 = Math.min(this.height - 1, y1);
    const d = this.fogData.data;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = (y * this.width + x) * 4;
        let a = 255;
        if (this.mask.has(x, y)) {
          // Borda suave: explorado vizinho de inexplorado escurece até ~50%; a ampliação com
          // suavização no desenho transforma isso num degradê em vez de degraus.
          a = Math.round(Math.min(1, this.unexploredNeighbours(x, y) / 3) * 128);
        }
        d[o] = FOG_RGB[0]; d[o + 1] = FOG_RGB[1]; d[o + 2] = FOG_RGB[2]; d[o + 3] = a;
      }
    }
    this.fogCtx.putImageData(this.fogData, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  private refreshFog(cx: number, cy: number) {
    const r = 8 + 2;
    this.fogRegion(cx - r, cy - r, cx + r, cy + r);
  }

  private rebuildFog() {
    this.fogRegion(0, 0, this.width - 1, this.height - 1);
  }

  // --- mapa -----------------------------------------------------------------

  private async loadMap() {
    try {
      const mapUrl = new URL(MAP_URL, location.href);
      // Reaproveita o world.json que o Phaser já baixou (um pedido só), com fallback para o fetch de antes.
      const tiled = await new Promise<TiledMap>((resolve, reject) => {
        const timer = setTimeout(() => {
          console.warn("[minimap] JSON do mapa não veio do Phaser; baixando à parte");
          fetch(mapUrl).then((r) => r.json()).then(resolve, reject);
        }, MAP_SHARE_TIMEOUT_MS);
        void worldMapJson.then((data) => { clearTimeout(timer); resolve(data); });
      });
      const images = await Promise.all(
        tiled.tilesets.map((ts) => (ts.image ? loadImage(new URL(ts.image, mapUrl).href) : Promise.resolve(null))),
      );
      this.buildBase(tiled, images);
      this.zones = parseZones(tiled);
      this.width = tiled.width;
      this.height = tiled.height;
      this.mask = new ExploredMask(this.width, this.height);
      this.fog = document.createElement("canvas");
      this.fog.width = this.width;
      this.fog.height = this.height;
      this.fogCtx = this.fog.getContext("2d")!;
      this.fogData = this.fogCtx.createImageData(this.width, this.height);
      this.ready = true;
      if (this.me) this.mask.reveal(this.me.x, this.me.y);
      if (this.pending) { const m = this.pending; this.pending = null; this.applyExplored(m); } else this.rebuildFog();
      this.updateZone();
      this.bump();
    } catch (e) {
      console.warn("[minimap] falha ao carregar o mapa", e);
    }
  }

  private buildBase(tiled: TiledMap, images: (HTMLImageElement | null)[]) {
    const { width: W, height: H } = tiled;
    const tw = tiled.tilewidth, th = tiled.tileheight;
    const layer = (n: string) => tiled.layers.find((l) => l.type === "tilelayer" && l.name === n)?.data;
    const order = [layer("above"), layer("deco"), layer("ground")];
    const collision = layer("collision");

    // Ordena tilesets por firstgid (decrescente) para achar o dono de um gid.
    const sets = tiled.tilesets
      .map((ts, i) => ({ ts, img: images[i], px: null as ImageData | null }))
      .filter((s) => s.img)
      .sort((a, b) => b.ts.firstgid - a.ts.firstgid);
    const cache = new Map<number, [number, number, number] | null>();
    const water = [47, 111, 181];

    const colorOf = (gid: number): [number, number, number] | null => {
      if (cache.has(gid)) return cache.get(gid)!;
      let res: [number, number, number] | null = null;
      const s = sets.find((t) => gid >= t.ts.firstgid);
      if (s && s.img) {
        if (!s.px) {
          const c = document.createElement("canvas");
          c.width = s.img.naturalWidth; c.height = s.img.naturalHeight;
          const cx = c.getContext("2d", { willReadFrequently: true })!;
          cx.drawImage(s.img, 0, 0);
          s.px = cx.getImageData(0, 0, c.width, c.height);
        }
        const cols = s.ts.columns || Math.floor(s.px.width / tw);
        const id = gid - s.ts.firstgid;
        const ox = (id % cols) * tw, oy = Math.floor(id / cols) * th;
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < th; y++) {
          for (let x = 0; x < tw; x++) {
            const o = ((oy + y) * s.px.width + ox + x) * 4;
            if (o + 3 >= s.px.data.length || s.px.data[o + 3] < 128) continue;
            r += s.px.data[o]; g += s.px.data[o + 1]; b += s.px.data[o + 2]; n++;
          }
        }
        if (n >= tw * th * MIN_OPAQUE) {
          res = [r / n, g / n, b / n];
          if (/water/i.test(s.ts.name ?? "")) res = res.map((v, i) => v * 0.55 + water[i] * 0.45) as [number, number, number];
        }
      }
      cache.set(gid, res);
      return res;
    };

    const base = document.createElement("canvas");
    base.width = W; base.height = H;
    const ctx = base.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      let c: [number, number, number] | null = null;
      for (const l of order) {
        const gid = (l?.[i] ?? 0) & GID_MASK;
        if (gid && (c = colorOf(gid))) break;
      }
      let [r, g, b] = c ?? [FOG_RGB[0], FOG_RGB[1], FOG_RGB[2]];
      if (collision?.[i]) { r *= 0.8; g *= 0.8; b *= 0.8; }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.base = base;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn("[minimap] tileset não carregou", src); resolve(null); };
    img.src = src;
  });
}

function parseZones(tiled: TiledMap): Zone[] {
  const layer = tiled.layers.find((l) => l.type === "objectgroup" && l.name === "objects");
  const tw = tiled.tilewidth, th = tiled.tileheight;
  return (layer?.objects ?? [])
    .filter((o: TiledObject) => (o.type ?? o.class) === "zone" && o.name)
    .map((o) => ({
      name: o.name,
      x: Math.floor(o.x / tw), y: Math.floor(o.y / th),
      w: Math.ceil(o.width / tw), h: Math.ceil(o.height / th),
    }));
}

export const minimapStore = new MinimapStore();
