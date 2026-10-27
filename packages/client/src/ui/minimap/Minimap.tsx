// Minimapa com fog of war, mapa-múndi em tela cheia (tecla M) e banner de zona. Marcadores (ciclo 17): serviços, missões,
// portais, destino do guia, marcador pessoal (clique direito no mapa-múndi) e o grupo no mapa-múndi.
import { isPartyMember, partyStore } from "../party/party.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { C2S, type WalkToMsg } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { isTyping } from "../focus.ts";
import { pushOverlay } from "../overlays.ts";
import { minimapStore as store } from "./store.ts";
import { MARKER_STYLE, markerNear, visibleMarkers, type MapMarker, type MarkerKind } from "./markers.ts";
import { mapMarkersStore, togglePersonalMark } from "./markerState.ts";
import { clockLabel, phaseAt, ambientForZone, darknessOf, PHASE_LABEL } from "@lemonquest/shared";
import { worldClock } from "../../game/daynight.ts";
import { LIGHT_LEVELS, lightLevelStore, useLightLevel } from "../../game/lighting.ts";
import "./minimap.css";

/** Hora do mundo + ícone sol/lua + seletor "Efeitos de luz" (alto/baixo/desligado). */
function DayClock() {
  const [, tick] = useState(0);
  const [open, setOpen] = useState(false);
  const level = useLightLevel();
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const now = worldClock.now();
  const { phase } = phaseAt(now);
  const night = phase === "night" || phase === "dusk";
  return (
    <div class="daynight">
      <button class="daynight-btn" onClick={() => setOpen((o) => !o)} title="Efeitos de luz" data-testid="daynight">
        <span class={`dn-icon ${night ? "moon" : "sun"}`} aria-hidden="true" />
        <span class="dn-label">{PHASE_LABEL[phase]}</span>
        <span class="dn-time">{clockLabel(now)}</span>
      </button>
      {open && (
        <div class="daynight-pop hud-card" role="dialog" aria-label="Efeitos de luz">
          <div class="help-title">Efeitos de luz</div>
          {LIGHT_LEVELS.map((l) => (
            <button key={l.id} class={`dn-opt${level === l.id ? " active" : ""}`} onClick={() => lightLevelStore.set(l.id)} title={l.hint}>{l.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const BG = "#07080c";
const FRAME_MS = 66; // ~15 fps
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_KEY = "lemonquest.minimap.zoom";

function loadZoom(): number {
  const z = Number(localStorage.getItem(ZOOM_KEY));
  return z >= ZOOM_MIN && z <= ZOOM_MAX ? Math.round(z) : 3;
}

const MARK_FONT = '"Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", sans-serif';
const explored = (x: number, y: number) => !!store.mask?.has(x, y);

/** Glifo com contorno de cada marcador que cai dentro de W×H; o destino do guia ganha um anel pulsando. */
function drawMarkers(
  ctx: CanvasRenderingContext2D, list: readonly MapMarker[], px: (x: number) => number, py: (y: number) => number,
  size: number, W: number, H: number, t: number,
) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.font = `bold ${Math.round(size)}px ${MARK_FONT}`;
  const pulse = (Math.sin(t / 300) + 1) / 2;
  for (const m of list) {
    const x = px(m.x), y = py(m.y);
    if (x < -size || y < -size || x > W + size || y > H + size) continue;
    const st = MARKER_STYLE[m.kind];
    if (m.kind === "guide") {
      ctx.strokeStyle = `rgba(255,212,71,${0.25 + 0.5 * (1 - pulse)})`;
      ctx.lineWidth = Math.max(1, size / 8);
      ctx.beginPath(); ctx.arc(x, y, size * (0.7 + pulse * 0.4), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.lineWidth = Math.max(2, size / 4);
    ctx.strokeStyle = "rgba(7,8,12,.95)";
    ctx.strokeText(st.glyph, x, y);
    ctx.fillStyle = st.color;
    ctx.fillText(st.glyph, x, y);
  }
}

/** Caixinha com o nome do marcador sob o mouse (mapa-múndi). */
function drawTip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dpr: number, W: number) {
  ctx.font = `600 ${Math.round(12 * dpr)}px "Pixelify Sans", monospace`;
  const w = ctx.measureText(text).width + 12 * dpr, h = 20 * dpr;
  const bx = Math.max(2, Math.min(W - w - 2, x - w / 2)), by = Math.max(2, y - h - 10 * dpr);
  ctx.fillStyle = "rgba(16,19,28,.95)";
  ctx.strokeStyle = "#3d4560";
  ctx.lineWidth = dpr;
  ctx.fillRect(bx, by, w, h);
  ctx.strokeRect(bx, by, w, h);
  ctx.fillStyle = "#f3e6b8";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + 6 * dpr, by + h / 2);
}

/** Hook: nome da zona atual (null fora de qualquer zona). */
function useZoneName(): string | null {
  const [name, setName] = useState(store.zoneName);
  useEffect(() => store.subscribeZone(() => setName(store.zoneName)), []);
  return name;
}

interface View { sx: number; sy: number; tiles: number }

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef(loadZoom());
  const viewRef = useRef<View>({ sx: 0, sy: 0, tiles: 1 });
  const marksRef = useRef<MapMarker[]>([]);
  const [zoom, setZoom] = useState(zoomRef.current);
  const zone = useZoneName();
  const [nightK, setNightK] = useState(0);
  const lvl = useLightLevel();
  useEffect(() => {
    const f = () => setNightK(lvl === "off" ? 0 : darknessOf(ambientForZone(worldClock.now(), store.zoneName)) * 0.5);
    f(); const t = setInterval(f, 2000); return () => clearInterval(t);
  }, [lvl]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const fit = () => {
      const px = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)));
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    };
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    fit();

    const draw = (t: number) => {
      const S = canvas.width;
      const dpr = window.devicePixelRatio || 1;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, S, S);
      const me = store.me;
      if (!store.ready || !store.base || !me) return;
      const ppt = zoomRef.current * dpr; // pixels de tela por tile
      const tiles = S / ppt;
      const sx = me.x + 0.5 - tiles / 2;
      const sy = me.y + 0.5 - tiles / 2;
      viewRef.current = { sx, sy, tiles };
      ctx.drawImage(store.base, sx, sy, tiles, tiles, 0, 0, S, S);
      if (store.fog) {
        ctx.imageSmoothingEnabled = true; // suaviza a fronteira da névoa
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(store.fog, sx, sy, tiles, tiles, 0, 0, S, S);
      }
      // Marcadores: serviços e portais só no explorado; missão, guia e marcador pessoal sempre.
      const marks = visibleMarkers(mapMarkersStore.get(), explored);
      marksRef.current = marks;
      drawMarkers(ctx, marks, (mx) => (mx + 0.5 - sx) * ppt, (my) => (my + 0.5 - sy) * ppt, (6 + zoomRef.current * 2) * dpr, S, S, t);
      // Outros jogadores (só em tiles explorados).
      ctx.fillStyle = "#ffd447";
      ctx.strokeStyle = "rgba(0,0,0,.7)";
      ctx.lineWidth = dpr;
      const rOther = Math.max(1.5 * dpr, ppt * 0.45);
      for (const [id, o] of store.others) {
        // Membros do grupo: pontos verdes (sempre visíveis, mesmo fora do explorado).
        const mate = isPartyMember(id);
        if (!mate && !store.mask?.has(o.x, o.y)) continue;
        const x = (o.x + 0.5 - sx) * ppt, y = (o.y + 0.5 - sy) * ppt;
        if (x < 0 || y < 0 || x > S || y > S) continue;
        ctx.fillStyle = mate ? "#7ee06d" : "#ffd447";
        ctx.beginPath(); ctx.arc(x, y, rOther, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      // Jogador local: ponto branco com pulso discreto.
      const c = S / 2;
      const pulse = (Math.sin(t / 380) + 1) / 2;
      const r = Math.max(2 * dpr, ppt * 0.55);
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - pulse)})`;
      ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.arc(c, c, r + (1 + pulse * 3) * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };

    const timer = setInterval(() => draw(performance.now()), FRAME_MS);
    draw(performance.now());
    return () => { clearInterval(timer); ro.disconnect(); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current + (e.deltaY < 0 ? 1 : -1)));
      if (z === zoomRef.current) return;
      zoomRef.current = z;
      localStorage.setItem(ZOOM_KEY, String(z));
      setZoom(z);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const tileAt = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: Math.floor(v.sx + ((e.clientX - rect.left) / rect.width) * v.tiles),
      y: Math.floor(v.sy + ((e.clientY - rect.top) / rect.height) * v.tiles),
    };
  };

  const onClick = (e: MouseEvent) => {
    const room = session.room;
    if (!room || !store.ready) return;
    const { x, y } = tileAt(e);
    if (x < 0 || y < 0 || x >= store.width || y >= store.height) return;
    room.send(C2S.WalkTo, { x, y } satisfies WalkToMsg);
  };

  // Marcador sob o mouse: o nome vira a dica do minimapa.
  const onMove = (e: MouseEvent) => {
    const { x, y } = tileAt(e);
    const m = markerNear(marksRef.current, x, y, Math.max(1, Math.ceil(6 / zoomRef.current)));
    const tip = m ? m.label : "Clique para andar até lá";
    const el = e.currentTarget as HTMLCanvasElement;
    if (el.title !== tip) el.title = tip;
  };

  return (
    <div class="minimap">
      <div class="minimap-box panel">
        <canvas ref={canvasRef} class="minimap-canvas" onClick={onClick} onMouseMove={onMove} title="Clique para andar até lá" data-testid="minimap" />
        <span class="minimap-zoom">{zoom}x</span>
        <div class="minimap-night" style={{ opacity: nightK }} />
      </div>
      <div class="minimap-zone">{zone && <span key={zone} class="minimap-zone-name">{zone}</span>}</div>
      <DayClock />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapa-múndi (tecla M)
// ---------------------------------------------------------------------------

/** Legenda dos marcadores no mapa-múndi. */
const LEGEND_KINDS: MarkerKind[] = ["temple", "depot", "shop", "travel", "board", "quest", "questReady", "portal", "guide", "personal"];

/** Zoom máximo, em px (CSS) por tile: o mapa-múndi tem uma cor por tile, e acima disso só cresce o quadrado. */
const WM_MAX_SCALE = 12;
/** "Centrar em mim" (tecla C) aproxima pelo menos até aqui: dá para ler o entorno da zona onde você está. */
const WM_ME_SCALE = 4;
/** Cada passo da roda e de +/− multiplica a escala por isto (e arredonda, ver stepScale). */
const WM_STEP = 1.25;
/** Uma seta move o mapa 40 px de tela, em qualquer zoom. */
const WM_PAN_PX = 40;
/** Até aqui o botão solto ainda é clique (o do fundo fecha o mapa); passou, é arrasto. */
const WM_DRAG_PX = 4;
/** Roda: um dente de mouse dá ~100 px e o touchpad manda muitos eventos pequenos; um passo a cada 50 px acumulados. */
const WM_WHEEL_PX = 50;

/** Vista do mapa-múndi: escala em px CSS por tile e o tile (fracionário) no canto superior esquerdo do canvas. */
interface WorldView { scale: number; ox: number; oy: number }
/** Tamanho do canvas, em px CSS. */
interface ViewSize { w: number; h: number }
/** Botão apertado sobre o mapa aberto: onde começou, se já virou arrasto e (sobre o canvas) a vista no começo. */
interface Press { x: number; y: number; moved: boolean; pan: { ox: number; oy: number } | null }

/** px de TELA por tile. Tira o resíduo de ponto flutuante (n/dpr × dpr = 2,9999…) para os níveis inteiros seguirem inteiros. */
function devScale(s: number, dpr: number): number {
  const S = s * dpr, n = Math.round(S);
  return Math.abs(S - n) < 1e-6 ? n : S;
}

/**
 * Escala que mostra o mapa inteiro. Com 1 px de tela por tile ou mais, arredonda PARA BAIXO a um inteiro de px de tela:
 * tile de largura inteira fica nítido (fracionário deixa uns tiles 1 px mais largos e o mapa "treme" ao arrastar), e para
 * baixo para caber. Abaixo de 1 (mapa 400×888 em tela baixa) fica fracionária: senão o mapa nem caberia.
 */
function fitScale(sz: ViewSize, dpr: number): number {
  const S = Math.min(sz.w / store.width, sz.h / store.height) * dpr;
  return (S >= 1 ? Math.floor(S + 1e-6) : S) / dpr;
}

/** Arredonda a inteiro de px de tela quando passa de 1 (mesmo motivo de fitScale). */
function snapScale(s: number, dpr: number): number {
  const S = devScale(s, dpr);
  return (S >= 1 ? Math.round(S) : S) / dpr;
}

/** Entre o mapa inteiro e WM_MAX_SCALE. */
function clampScale(s: number, sz: ViewSize, dpr: number): number {
  const min = fitScale(sz, dpr);
  const max = Math.max(min, Math.floor(WM_MAX_SCALE * dpr + 1e-6) / dpr);
  return Math.min(max, Math.max(min, s));
}

/**
 * Próximo nível da roda e de +/−: ×1,25 arredondado a inteiro de px de tela. Se o arredondamento devolve o mesmo nível
 * (1 × 1,25 → 1), anda um inteiro; assim os níveis ficam 1, 2, 3, 4, 5, 6, 8, 10, 12 (com dpr 1).
 */
function stepScale(s: number, dir: 1 | -1, dpr: number): number {
  const S = devScale(s, dpr), t = dir > 0 ? S * WM_STEP : S / WM_STEP;
  if (t < 1) return t / dpr;
  const n = Math.round(t);
  return (dir > 0 ? Math.max(n, Math.floor(S) + 1) : Math.min(n, Math.ceil(S) - 1)) / dpr;
}

/**
 * Eixo em que o mapa cabe inteiro: centrado (arrastar ali não teria o que mostrar). Senão o centro da tela não sai do mapa:
 * sobra no máximo meia tela de fundo além da borda, dá para centrar qualquer tile (até os cantos) e o mapa nunca some.
 */
function clampAxis(o: number, view: number, size: number): number {
  return view >= size ? (size - view) / 2 : Math.min(size - view / 2, Math.max(-view / 2, o));
}

function clampView(v: WorldView, sz: ViewSize) {
  v.ox = clampAxis(v.ox, sz.w / v.scale, store.width);
  v.oy = clampAxis(v.oy, sz.h / v.scale, store.height);
}

/** Põe o tile (x, y) no centro do canvas, dentro dos limites de clampView. */
function centerView(v: WorldView, sz: ViewSize, x: number, y: number) {
  v.ox = x - sz.w / v.scale / 2;
  v.oy = y - sz.h / v.scale / 2;
  clampView(v, sz);
}

function fitView(v: WorldView, sz: ViewSize, dpr: number) {
  v.scale = fitScale(sz, dpr);
  centerView(v, sz, store.width / 2, store.height / 2);
}

/** "2×", "0,8×": px CSS por tile, com uma casa decimal só quando não é inteiro. */
function zoomLabel(s: number): string {
  return `${(Math.round(s * 10) / 10).toLocaleString("pt-BR")}×`;
}

const pixelRatio = () => window.devicePixelRatio || 1;

export function WorldMapOverlay() {
  const [open, setOpen] = useState(false);
  /** Escala atual (px CSS por tile), só para o rótulo de zoom; 0 = vista ainda não ajustada. */
  const [zoom, setZoom] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Vista e tamanho em refs: arrastar e girar a roda mudam a vista dezenas de vezes por segundo, sem render do Preact.
  const viewRef = useRef<WorldView>({ scale: 0, ox: 0, oy: 0 });
  const sizeRef = useRef<ViewSize>({ w: 0, h: 0 });
  /** Mouse sobre o mapa, em tiles (fracionário); null fora (ou arrastando). */
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const pressRef = useRef<Press | null>(null);
  /** Pede um quadro no próximo frame, fora do intervalo de animação (o efeito de desenho troca esta função). */
  const redrawRef = useRef<() => void>(() => {});

  // Mapa aberto: entra na pilha de sobreposições (o Esc fecha só o mapa, não tira o alvo). Layout effect: registrado
  // no mesmo commit em que o mapa aparece, sem frame descoberto.
  useLayoutEffect(() => {
    if (!open) return;
    return pushOverlay("world-map", () => setOpen(false));
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Tecla física (code), como os atalhos de magia: em outros layouts o "m" cai noutra tecla, que pode ser um atalho.
      if (e.code === "KeyM" && !isTyping()) { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // --- Ações sobre a vista. Só usam refs e setZoom (estáveis): servem aos handlers e aos efeitos de qualquer render. ---
  const viewReady = () => store.ready && viewRef.current.scale > 0 && sizeRef.current.w > 0 && sizeRef.current.h > 0;
  /** Fecha uma mudança de vista: limita, atualiza o rótulo e redesenha já (no intervalo de ~15 fps o arrasto engasga). */
  const commit = () => {
    const v = viewRef.current;
    clampView(v, sizeRef.current);
    setZoom(v.scale);
    redrawRef.current();
  };
  /** Muda a escala mantendo o tile sob (mx, my) — px CSS no canvas — sob o mesmo ponto. */
  const zoomAt = (target: number, mx: number, my: number) => {
    if (!viewReady()) return;
    const v = viewRef.current;
    const s = clampScale(target, sizeRef.current, pixelRatio());
    if (s === v.scale) return;
    const wx = v.ox + mx / v.scale, wy = v.oy + my / v.scale;
    v.scale = s;
    v.ox = wx - mx / s;
    v.oy = wy - my / s;
    commit();
  };
  /** Um passo de zoom; sem ponto, em torno do centro do canvas (teclas +/−). */
  const zoomBy = (dir: 1 | -1, mx = sizeRef.current.w / 2, my = sizeRef.current.h / 2) =>
    zoomAt(stepScale(viewRef.current.scale, dir, pixelRatio()), mx, my);
  const fit = () => {
    if (!viewReady()) return;
    fitView(viewRef.current, sizeRef.current, pixelRatio());
    commit();
  };
  const centerMe = () => {
    const me = store.me;
    if (!viewReady() || !me) return;
    const v = viewRef.current, d = pixelRatio();
    // Já mais perto que WM_ME_SCALE? Fica no zoom de quem aproximou; só centra.
    v.scale = clampScale(snapScale(Math.max(v.scale, WM_ME_SCALE), d), sizeRef.current, d);
    centerView(v, sizeRef.current, me.x + 0.5, me.y + 0.5);
    commit();
  };
  /** Move a vista (dx, dy) px de tela: positivo mostra o que está à direita/abaixo. */
  const panBy = (dx: number, dy: number) => {
    if (!viewReady()) return;
    const v = viewRef.current;
    v.ox += dx / v.scale;
    v.oy += dy / v.scale;
    commit();
  };

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current!, box = boxRef.current!;
    const ctx = canvas.getContext("2d")!;
    let labels = store.visibleZoneLabels();
    let labelsVersion = store.version;
    // Toda abertura começa com o mapa inteiro (scale 0 = ajustar no primeiro quadro com mapa e tamanho prontos), medido
    // agora: o tamanho da abertura anterior não vale se a janela mudou com o mapa fechado.
    viewRef.current = { scale: 0, ox: 0, oy: 0 };
    sizeRef.current = { w: box.clientWidth, h: box.clientHeight };
    hoverRef.current = null;
    setZoom(0);

    const draw = () => {
      const t = performance.now();
      const sz = sizeRef.current, v = viewRef.current;
      if (!store.ready || !store.base || !sz.w || !sz.h) return;
      const dpr = window.devicePixelRatio || 1;
      if (!v.scale) { fitView(v, sz, dpr); setZoom(v.scale); }
      const W = Math.max(1, Math.round(sz.w * dpr)), H = Math.max(1, Math.round(sz.h * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      if (labelsVersion !== store.version) { labels = store.visibleZoneLabels(); labelsVersion = store.version; }
      // Mundo → tela (px de tela): (x − ox) × escala × dpr. Deslocamento arredondado: com S inteiro, toda borda de tile
      // cai em pixel inteiro (nítido e sem tremer enquanto arrasta).
      const S = devScale(v.scale, dpr);
      const offX = Math.round(-v.ox * S), offY = Math.round(-v.oy * S);
      const px = (x: number) => x * S + offX, py = (y: number) => y * S + offY;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      // Só o pedaço visível, em tiles inteiros e recortado nas bordas do mapa: origem inteira mantém o pixel nítido, e o
      // recorte à mão não depende de como cada navegador trata retângulo de origem fora da imagem (a folga das bordas).
      const x0 = Math.max(0, Math.floor(v.ox)), y0 = Math.max(0, Math.floor(v.oy));
      const x1 = Math.min(store.width, Math.ceil(v.ox + W / S)), y1 = Math.min(store.height, Math.ceil(v.oy + H / S));
      if (x1 > x0 && y1 > y0) {
        const sw = x1 - x0, sh = y1 - y0;
        ctx.drawImage(store.base, x0, y0, sw, sh, px(x0), py(y0), sw * S, sh * S);
        if (store.fog) {
          ctx.imageSmoothingEnabled = true; // suaviza a fronteira da névoa
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(store.fog, x0, y0, sw, sh, px(x0), py(y0), sw * S, sh * S);
        }
      }
      // Contorno do mundo: o fundo e a névoa têm a mesma cor, e sem ele não se vê onde o mapa acaba.
      ctx.strokeStyle = "#2c3242";
      ctx.lineWidth = dpr;
      ctx.strokeRect(px(0) - dpr / 2, py(0) - dpr / 2, store.width * S + dpr, store.height * S + dpr);
      // Rótulos das zonas já visitadas (só os que caem no canvas; a folga cobre o meio nome que ainda aparece).
      const cull = 160 * dpr;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${Math.round(14 * dpr)}px "Pixelify Sans", monospace`;
      ctx.lineJoin = "round";
      ctx.lineWidth = 4 * dpr;
      for (const l of labels) {
        const x = px(l.x), y = py(l.y);
        if (x < -cull || y < -cull || x > W + cull || y > H + cull) continue;
        ctx.strokeStyle = "rgba(7,8,12,.9)";
        ctx.strokeText(l.name, x, y);
        ctx.fillStyle = "#f3e6b8";
        ctx.fillText(l.name, x, y);
      }
      // Marcadores e grupo (membros sempre visíveis, mesmo fora do explorado). Glifo e pontos crescem com o zoom, até um teto.
      const marks = visibleMarkers(mapMarkersStore.get(), explored);
      drawMarkers(ctx, marks, (mx) => px(mx + 0.5), (my) => py(my + 0.5), Math.min(22 * dpr, Math.max(11 * dpr, S * 1.5)), W, H, t);
      const dot = Math.max(4 * dpr, S * 0.4);
      const names = new Map(partyStore.get()?.members.map((m) => [m.id, m.name]) ?? []);
      const mates: MapMarker[] = [];
      for (const [id, o] of store.others) {
        const name = names.get(id);
        if (!name) continue;
        mates.push({ kind: "personal", x: o.x, y: o.y, label: `Grupo: ${name}` });
        const x = px(o.x + 0.5), y = py(o.y + 0.5);
        if (x < -dot || y < -dot || x > W + dot || y > H + dot) continue;
        ctx.fillStyle = "#7ee06d";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath(); ctx.arc(x, y, dot, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      // Nome do marcador (ou do colega de grupo) sob o mouse: distância medida do centro do tile, raio de ~10 px de tela.
      const h = hoverRef.current;
      const hit = h ? markerNear([...marks, ...mates], h.x - 0.5, h.y - 0.5, Math.max(0.6, 10 / v.scale)) : undefined;
      if (hit) drawTip(ctx, hit.label, px(hit.x + 0.5), py(hit.y + 0.5) - 6 * dpr, dpr, W);
      // Jogador.
      const me = store.me;
      if (me) {
        const x = px(me.x + 0.5), y = py(me.y + 0.5);
        const pulse = (Math.sin(t / 380) + 1) / 2;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - pulse)})`;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.arc(x, y, dot + (1 + pulse * 6) * dpr, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath(); ctx.arc(x, y, dot, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    };

    let raf = 0;
    redrawRef.current = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

    // O canvas ocupa a caixa (sobra da coluna sem título e legendas): mede a caixa a cada mudança de janela ou de legenda.
    const ro = new ResizeObserver(() => {
      const prev = sizeRef.current;
      const sz = { w: box.clientWidth, h: box.clientHeight };
      sizeRef.current = sz;
      const v = viewRef.current, d = pixelRatio();
      if (v.scale && store.ready && sz.w && sz.h) {
        // Quem via o mapa inteiro continua vendo o mapa inteiro; senão mantém ox/oy e só reencaixa a escala nos limites novos.
        if (prev.w && prev.h && v.scale <= fitScale(prev, d) + 1e-9) v.scale = fitScale(sz, d);
        else v.scale = clampScale(snapScale(v.scale, d), sz, d);
        clampView(v, sz);
        setZoom(v.scale);
      }
      draw();
    });
    ro.observe(box);

    let wheel = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // nem rola a página nem dá o zoom do navegador (Ctrl+roda, pinça do touchpad)
      const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
      if (!dy) return;
      // Acumula (ver WM_WHEEL_PX): um dente = um passo, e o touchpad não vai do mínimo ao máximo num gesto. Inverteu, zera.
      wheel = Math.sign(dy) === Math.sign(wheel) ? wheel + dy : dy;
      if (Math.abs(wheel) < WM_WHEEL_PX) return;
      const r = canvas.getBoundingClientRect();
      zoomBy(wheel < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
      wheel = 0;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Teclas do mapa em captura, engolidas: o jogo ouve as setas na window (andaria por trás do mapa) e "0", "C", "-"…
    // podem ser atalhos de magia. WASD seguem andando, como antes do zoom.
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === "ArrowLeft") panBy(-WM_PAN_PX, 0);
      else if (k === "ArrowRight") panBy(WM_PAN_PX, 0);
      else if (k === "ArrowUp") panBy(0, -WM_PAN_PX);
      else if (k === "ArrowDown") panBy(0, WM_PAN_PX);
      else if (k === "+" || k === "=") zoomBy(1);
      else if (k === "-") zoomBy(-1);
      else if (k === "0") fit();
      else if (e.code === "KeyC") centerMe();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);

    draw();
    const timer = setInterval(draw, FRAME_MS);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey, true);
      redrawRef.current = () => {};
    };
  }, [open]);

  if (!open) return null;
  /** Tile (fracionário) sob o mouse, já com zoom e deslocamento; null antes de a vista existir. */
  const tileOf = (e: MouseEvent) => {
    const v = viewRef.current;
    if (!v.scale) return null;
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: v.ox + (e.clientX - r.left) / v.scale, y: v.oy + (e.clientY - r.top) / v.scale };
  };
  const endPan = (e: PointerEvent) => {
    if (pressRef.current) pressRef.current.pan = null;
    (e.currentTarget as HTMLCanvasElement).classList.remove("grabbing");
  };
  return (
    <div
      class="worldmap"
      // Em captura: o botão é registrado antes de o canvas tratar o evento, e o canvas já lê `moved` atualizado.
      onPointerDownCapture={(e) => { pressRef.current = { x: e.clientX, y: e.clientY, moved: false, pan: null }; }}
      onPointerMoveCapture={(e) => {
        const p = pressRef.current;
        if (p && e.buttons && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > WM_DRAG_PX) p.moved = true;
      }}
      // Clique no fundo fecha; arrasto não (nem o começado no mapa e solto fora dele).
      onClick={() => { if (!pressRef.current?.moved) setOpen(false); }}
    >
      <div class="worldmap-head">
        <div class="worldmap-title">Mapa do Mundo</div>
        <div class="worldmap-tools" role="toolbar" aria-label="Controles do mapa" onClick={(e) => e.stopPropagation()}>
          <button type="button" class="wm-btn" onClick={fit} aria-label="Ajustar: mostrar o mapa inteiro (tecla 0)" title="Mostrar o mapa inteiro (0)">Ajustar</button>
          <button type="button" class="wm-btn" onClick={centerMe} aria-label="Centrar em mim (tecla C)" title="Centrar em você (C)">Centrar em mim</button>
        </div>
      </div>
      <div ref={boxRef} class="worldmap-view">
        <canvas
          ref={canvasRef} class="worldmap-canvas" data-testid="worldmap" aria-label="Mapa do mundo"
          onClick={(e) => e.stopPropagation()}
          onDblClick={(e) => {
            // Duplo clique aproxima 2× no ponto, como nos mapas de navegador.
            const v = viewRef.current;
            if (!v.scale || pressRef.current?.moved) return;
            const r = e.currentTarget.getBoundingClientRect();
            zoomAt(snapScale(v.scale * 2, pixelRatio()), e.clientX - r.left, e.clientY - r.top);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 || !pressRef.current) return;
            e.currentTarget.setPointerCapture(e.pointerId); // o arrasto segue mesmo saindo do canvas
            const v = viewRef.current;
            pressRef.current.pan = { ox: v.ox, oy: v.oy };
          }}
          onPointerMove={(e) => {
            const p = pressRef.current, v = viewRef.current;
            if (p?.pan && p.moved && v.scale) {
              // O mapa vai junto com o mouse: o tile pego fica sob o cursor.
              e.currentTarget.classList.add("grabbing");
              hoverRef.current = null;
              v.ox = p.pan.ox - (e.clientX - p.x) / v.scale;
              v.oy = p.pan.oy - (e.clientY - p.y) / v.scale;
              commit();
            } else if (!p?.pan) hoverRef.current = tileOf(e);
          }}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onPointerLeave={() => { hoverRef.current = null; }}
          onContextMenu={(e) => {
            // Clique direito: põe/tira um marcador pessoal (guardado neste navegador) no tile sob o mouse, já com o zoom.
            e.preventDefault();
            e.stopPropagation();
            const t = tileOf(e);
            if (store.ready && t && t.x >= 0 && t.y >= 0 && t.x < store.width && t.y < store.height) togglePersonalMark(Math.floor(t.x), Math.floor(t.y));
          }}
        />
        {zoom > 0 && <span class="worldmap-zoom">{zoomLabel(zoom)}</span>}
      </div>
      <div class="worldmap-legend">
        <span class="dot dot-me" /> Você
        <span class="dot dot-party" /> Grupo
        {LEGEND_KINDS.map((k) => (
          <span key={k} class="wm-key"><span class="wm-glyph" style={{ color: MARKER_STYLE[k].color }}>{MARKER_STYLE[k].glyph}</span>{MARKER_STYLE[k].legend}</span>
        ))}
      </div>
      <div class="worldmap-legend">
        Áreas escuras ainda não foram exploradas
        <span class="sep">·</span> M ou Esc para fechar
      </div>
      <div class="worldmap-legend">
        Arraste ou use as setas para mover
        <span class="sep">·</span> roda do mouse ou +/− para zoom
        <span class="sep">·</span> duplo clique aproxima
        <span class="sep">·</span> 0 ajusta
        <span class="sep">·</span> C centra em você
        <span class="sep">·</span> clique direito: marcador
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banner ao entrar numa zona
// ---------------------------------------------------------------------------

const BANNER_MS = 2400;

export function ZoneBanner() {
  const [banner, setBanner] = useState<{ name: string; id: number } | null>(null);

  useEffect(() => {
    let id = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const name = store.zoneName;
      clearTimeout(timer);
      if (!name) { setBanner(null); return; }
      setBanner({ name, id: ++id });
      timer = setTimeout(() => setBanner(null), BANNER_MS);
    };
    if (store.zoneName) check();
    const off = store.subscribeZone(check);
    return () => { off(); clearTimeout(timer); };
  }, []);

  if (!banner) return null;
  return <div key={banner.id} class="zone-banner">{banner.name}</div>;
}
