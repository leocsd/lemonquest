// Encomenda semanal de material (Quadro de Recompensas): pede N de um material específico (não abates), geração
// determinística por semana + faixa de level (mesmo esquema de bounties.ts). Progresso em rec.data.request,
// sem tabela nova. Sem passo de "aceitar": quem tem o material na hora entrega direto, com o Quadro aberto.
// A faixa é gravada na primeira consulta da semana: subir de level no meio da semana não troca o material.
import {
  REQUEST_BANDS, REQUEST_NPC, S2C, levelForXp, requestBand, weekEndsAt, weekId,
  type MaterialRequestActionMsg, type MaterialRequestView, type NoticeMsg,
} from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";
import type { PlayerState } from "../state.ts";
import { hashStr, mulberry32 } from "./bounties.ts";
import type { InventorySystem } from "./inventory.ts";

export interface MaterialRequestHost {
  record(id: string): CharacterRecord | undefined;
  send(id: string, type: string, msg: unknown): void;
  inventory: Pick<InventorySystem, "countItem" | "removeItems" | "addGold" | "defs">;
  save(id: string): void;
  /** NPC com a janela aberta para o jogador ("" = nenhum; NpcSystem fecha ao sair do alcance). */
  npcOpen(id: string): string;
  now?(): number;
}

export interface MaterialRequestDef { materialId: string; count: number; gold: number }

/** Quantidade e recompensa: material mais caro pede menos e paga mais por unidade. */
export function generateRequest(week: string, band: number, inv: Pick<InventorySystem, "defs">): MaterialRequestDef {
  band = Number.isFinite(band) ? Math.max(0, Math.min(REQUEST_BANDS.length - 1, Math.floor(band))) : 0;
  const b = REQUEST_BANDS[band]!;
  const rng = mulberry32(hashStr(`${week}:request:${band}`));
  const materialId = b.materials[Math.floor(rng() * b.materials.length)]!;
  const value = inv.defs(materialId)?.value ?? 10;
  const count = Math.max(3, Math.min(20, Math.round(300 / value)));
  const gold = Math.round(value * count * 1.3) + 100 * (band + 1);
  return { materialId, count, gold };
}

type State = NonNullable<CharacterRecord["data"]["request"]>;

export class MaterialRequestSystem {
  constructor(private readonly o: MaterialRequestHost) {}

  private now() { return this.o.now?.() ?? Date.now(); }
  private notice(id: string, text: string, kind: NoticeMsg["kind"] = "info") { this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg); }

  /** Estado da semana; a faixa fica gravada na primeira consulta (estado antigo sem faixa: grava agora). */
  private state(rec: CharacterRecord, level: number): State {
    const w = weekId(new Date(this.now()));
    if (rec.data.request?.week === w) {
      const s = rec.data.request;
      // Gravado antes do ciclo 14 (sem faixa): a do level do começo da semana, para quem já consultou e subiu de faixa
      // não ver o material trocar no deploy.
      s.band ??= requestBand(rec.data.week?.id === w ? levelForXp(rec.data.week.xp) : level);
      return s;
    }
    return (rec.data.request = { week: w, claimed: false, band: requestBand(level) });
  }

  view(p: PlayerState): MaterialRequestView | null {
    const rec = this.o.record(p.id);
    if (!rec) return null;
    const st = this.state(rec, p.level);
    const def = generateRequest(st.week, st.band!, this.o.inventory);
    return {
      materialId: def.materialId, count: def.count, have: this.o.inventory.countItem(p.id, def.materialId),
      gold: def.gold, claimed: st.claimed, resetsAt: weekEndsAt(new Date(this.now())),
    };
  }

  push(p: PlayerState) {
    const v = this.view(p);
    if (v) this.o.send(p.id, S2C.MaterialRequestState, { request: v });
  }

  onMessage(p: PlayerState, m: MaterialRequestActionMsg): void {
    if (!m || typeof m !== "object") return;
    if (m.action === "list") { this.push(p); return; }
    if (m.action === "turnIn") this.turnIn(p);
  }

  private turnIn(p: PlayerState): void {
    const rec = this.o.record(p.id);
    if (!rec || p.hp <= 0) return;
    // Mesmo critério das missões e das recompensas diárias: só com a janela do Quadro aberta (perto dele).
    if (this.o.npcOpen(p.id) !== REQUEST_NPC) { this.notice(p.id, "Entregue a encomenda no Quadro de Recompensas.", "warn"); return; }
    const st = this.state(rec, p.level);
    if (st.claimed) { this.notice(p.id, "Você já entregou a encomenda desta semana.", "warn"); return; }
    const def = generateRequest(st.week, st.band!, this.o.inventory);
    if (this.o.inventory.countItem(p.id, def.materialId) < def.count) { this.notice(p.id, "Você não tem o suficiente ainda.", "warn"); return; }
    if (!this.o.inventory.removeItems(p, def.materialId, def.count)) return;
    st.claimed = true;
    this.o.inventory.addGold(p, def.gold);
    this.notice(p.id, `Encomenda entregue: +${def.gold} de ouro.`, "good");
    this.o.save(p.id);
    this.push(p);
  }
}
