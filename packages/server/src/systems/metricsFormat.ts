// Formatação das métricas: linhas do /metricas (chat do admin) e resumo diário da CLI (npm run admin -- metricas).
// Puro: recebe as amostras já coletadas (systems/metrics.ts) ou lidas dos arquivos (persistence/metricsFiles.ts).
import type { ClientRow, ServerSample } from "./metrics.ts";
import { formatUptime } from "./status.ts";
import { localDay } from "../persistence/metricsFiles.ts";

const f0 = (v: number) => String(Math.round(v));
const f1 = (v: number) => v.toFixed(1);
const heapText = (v: number | null) => (v === null ? "heap ?" : `heap ${f0(v)} MB`);

/** Linha de um cliente: nome · app · heap · texturas · fps (mín) · objetos · aberto há. */
export function clienteResumo(c: ClientRow): string {
  return `${c.nome} · ${c.app} · ${heapText(c.heapMb)} · texturas ${f0(c.texMb)} MB · fps ${f0(c.fps)} (mín ${f0(c.fpsMin)}) · ${c.objetos} objetos · aberto há ${formatUptime(c.uptimeS * 1000)}`;
}

/** /metricas: servidor agora, a última hora e os clientes online (o mais pesado primeiro). */
export function metricasLines(agora: ServerSample, hora: readonly ServerSample[], clientes: readonly ClientRow[]): string[] {
  const save = agora.saveMedMs !== undefined ? ` · autosave ${f1(agora.saveMedMs)} ms (máx ${f1(agora.saveMaxMs ?? 0)})` : "";
  const lines = [
    `Servidor agora: RSS ${agora.rssMb} MB (heap ${agora.heapMb} MB) · CPU ${f1(agora.cpuPct)}% · tick média ${agora.tickMedMs.toFixed(2)} ms, máx ${f1(agora.tickMaxMs)} ms, p95 ${agora.tickP95Ms.toFixed(2)} ms`,
    `${agora.online} online · ${agora.monstros} monstros · ${agora.chao} itens no chão · ${agora.bots} Estagiários com rota · ${f1(agora.msgsS)} msgs/s${save}`,
  ];
  if (hora.length) {
    let rss = 0, tick = 0, onMin = Infinity, onMax = 0;
    for (const s of hora) {
      rss = Math.max(rss, s.rssMb); tick = Math.max(tick, s.tickMaxMs);
      onMin = Math.min(onMin, s.online); onMax = Math.max(onMax, s.online);
    }
    lines.push(`Última hora (${hora.length} amostras): RSS máx ${rss} MB · tick máx ${f1(tick)} ms · online mín ${onMin}, máx ${onMax}`);
  } else lines.push("Última hora: nenhuma amostra ainda (a primeira sai 30 s depois de o servidor subir).");
  if (!clientes.length) {
    lines.push("Clientes: nenhum relatório ainda (cada cliente manda o primeiro 30 s depois de entrar).");
    return lines;
  }
  lines.push(`Clientes (${clientes.length}, o mais pesado primeiro):`);
  const sorted = [...clientes].sort((a, b) => (b.heapMb ?? -1) - (a.heapMb ?? -1) || b.texMb - a.texMb);
  for (const c of sorted) lines.push(clienteResumo(c));
  return lines;
}

/** Quantas amostras do histórico mostrar no chat (as mais novas). */
export const CLIENTE_HIST_LINHA = 15;

/** /metricas <nome>: o histórico curto (heap e fps) para ver se cresce. */
export function clienteLines(nome: string, hist: readonly ClientRow[]): string[] {
  if (!hist.length) return [`Sem relatórios de ${nome} (precisa estar online há pelo menos 30 s). Uso: /metricas [nome]`];
  const last = hist[hist.length - 1]!;
  const shown = hist.slice(-CLIENTE_HIST_LINHA);
  const first = hist[0]!;
  const lines = [clienteResumo(last)];
  const min = Math.max(1, Math.round((last.t - first.t) / 60_000));
  if (first.heapMb !== null && last.heapMb !== null && hist.length > 1) {
    const d = last.heapMb - first.heapMb;
    lines.push(`Heap ${d >= 0 ? "+" : ""}${f0(d)} MB e texturas ${last.texMb - first.texMb >= 0 ? "+" : ""}${f0(last.texMb - first.texMb)} MB em ${min} min (${hist.length} relatórios).`);
  }
  lines.push(`Heap (MB, mais antiga → mais nova): ${shown.map((h) => (h.heapMb === null ? "?" : f0(h.heapMb))).join(" · ")}`);
  lines.push(`Texturas (MB): ${shown.map((h) => f0(h.texMb)).join(" · ")}`);
  lines.push(`FPS mín: ${shown.map((h) => f0(h.fpsMin)).join(" · ")}`);
  return lines;
}

// --- CLI: resumo diário a partir dos arquivos --------------------------------------------------------------------

type Row = object;
const numOf = (r: Row, k: string): number | null => { const v = (r as Record<string, unknown>)[k]; return typeof v === "number" && Number.isFinite(v) ? v : null; };

/** mín/média/máx de um campo (null = nenhum valor). */
export function minAvgMax(rows: readonly Row[], k: string): { min: number; avg: number; max: number; n: number } | null {
  let min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (const r of rows) {
    const v = numOf(r, k);
    if (v === null) continue;
    n++; sum += v; if (v < min) min = v; if (v > max) max = v;
  }
  return n ? { min, avg: sum / n, max, n } : null;
}

const SERVER_FIELDS: [string, string, (v: number) => string][] = [
  ["rssMb", "RSS MB", f0], ["heapMb", "heap MB", f0], ["cpuPct", "CPU %", f1], ["tickMedMs", "tick médio ms", (v) => v.toFixed(2)],
  ["tickP95Ms", "tick p95 ms", (v) => v.toFixed(2)], ["tickMaxMs", "tick máx ms", f1], ["online", "online", f0], ["monstros", "monstros", f0],
  ["chao", "itens no chão", f0], ["bots", "Estagiários com rota", f0], ["msgsS", "msgs/s", f1], ["saveMaxMs", "autosave máx ms", f1],
];

/** Resumo de um dia: servidor (mín/méd/máx de cada número) e clientes por personagem. */
export function resumoDiaLines(dia: string, servidor: readonly Row[], clientes: readonly Row[]): string[] {
  const lines = [`${dia} — servidor: ${servidor.length} amostras · clientes: ${clientes.length} relatórios`];
  for (const [k, label, fmt] of SERVER_FIELDS) {
    const s = minAvgMax(servidor, k);
    if (s) lines.push(`  ${label}: mín ${fmt(s.min)} · méd ${fmt(s.avg)} · máx ${fmt(s.max)}`);
  }
  const porNome = new Map<string, Row[]>();
  for (const r of clientes) {
    const n = (r as { nome?: unknown }).nome;
    const nome = typeof n === "string" ? n : "?";
    let l = porNome.get(nome);
    if (!l) porNome.set(nome, (l = []));
    l.push(r);
  }
  const nomes = [...porNome.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  for (const nome of nomes) {
    const rs = porNome.get(nome)!;
    const apps = [...new Set(rs.map((r) => String((r as { app?: unknown }).app ?? "?")))].join("+");
    const heap = minAvgMax(rs, "heapMb"), tex = minAvgMax(rs, "texMb"), fps = minAvgMax(rs, "fpsMin");
    lines.push(`  ${nome} (${apps}, ${rs.length} relatórios): ` +
      (heap ? `heap méd ${f0(heap.avg)} / máx ${f0(heap.max)} MB` : "heap ?") +
      (tex ? ` · texturas méd ${f0(tex.avg)} / máx ${f0(tex.max)} MB` : "") +
      (fps ? ` · fps mín ${f0(fps.min)}` : ""));
  }
  return lines;
}

/** Agrupa as linhas por dia local (pelo `t`) e monta o resumo de cada dia, do mais antigo ao mais novo. */
export function resumoDiasLines(servidor: readonly Row[], clientes: readonly Row[]): string[] {
  const dias = new Map<string, { s: Row[]; c: Row[] }>();
  const add = (r: Row, k: "s" | "c") => {
    const t = numOf(r, "t");
    if (t === null) return;
    const d = localDay(t);
    let e = dias.get(d);
    if (!e) dias.set(d, (e = { s: [], c: [] }));
    e[k].push(r);
  };
  for (const r of servidor) add(r, "s");
  for (const r of clientes) add(r, "c");
  const out: string[] = [];
  for (const d of [...dias.keys()].sort()) out.push(...resumoDiaLines(d, dias.get(d)!.s, dias.get(d)!.c));
  return out;
}
