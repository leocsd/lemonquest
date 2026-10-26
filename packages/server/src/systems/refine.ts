// Refino no Ferreiro (ciclo 16, 16-5): C2S.Refine com a janela do Ferreiro aberta (NpcSystem fecha ao sair do
// alcance). Item da mochila ou do equipamento; cobra ouro + gema (+ o material extra do +4/+5, ciclo 20) por tentativa
// (shared/data/refine.ts) e sorteia.
// Falha só consome o custo: o item não some nem perde nível. Sem estado próprio (o nível mora na ItemInstance, que
// viaja com o item para depot, troca e chão).
import {
  REFINE_MAX, REFINE_NPC, S2C, refineBlock, refineCost, refinedName, refineLevel, refineMaterials,
  type DropFrom, type NoticeMsg, type RefineMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { InventorySystem } from "./inventory.ts";

export interface RefineHost {
  inventory: Pick<InventorySystem, "peekAt" | "countItem" | "removeItems" | "spendGold" | "gold" | "defs" | "itemChanged">;
  send(id: string, type: string, msg: unknown): void;
  /** NPC com a janela aberta para o jogador ("" = nenhum). */
  npcOpen(id: string): string;
  /** Grava o personagem (ouro gasto e item refinado vão juntos para o banco). */
  save?(id: string): void;
  rng?: () => number;
  log?: (line: string) => void;
}

/** "Faltam materiais: 1x Ametista, 1x Frasco de Aço Líquido." */
const missingText = (list: { count: number; name: string }[]): string => `Faltam materiais: ${list.map((m) => `${m.count}x ${m.name}`).join(", ")}.`;

export const REFINE_MSG = {
  closed: "Fale com o Ferreiro para refinar.",
  gone: "O item não está mais aí.",
  max: `Este item já está no refino máximo (+${REFINE_MAX}).`,
  gold: (n: number) => `Ouro insuficiente: a tentativa custa ${n.toLocaleString("pt-BR")} de ouro.`,
  material: (n: number, name: string) => missingText([{ count: n, name }]),
  materials: missingText,
} as const;

const isInt = (n: unknown): n is number => Number.isInteger(n);

/** Formato do `from` (mochila ou equipamento); o InventorySystem confere o índice/slot. */
function validFrom(f: unknown): f is DropFrom {
  if (!f || typeof f !== "object") return false;
  const r = f as Record<string, unknown>;
  return (r.where === "backpack" && isInt(r.index)) || (r.where === "equip" && typeof r.slot === "string");
}

export class RefineSystem {
  private readonly rng: () => number;
  private readonly log: (line: string) => void;

  constructor(private readonly o: RefineHost) {
    this.rng = o.rng ?? Math.random;
    this.log = o.log ?? ((l) => console.log(l));
  }

  private notice(id: string, text: string, kind: NoticeMsg["kind"]): void {
    this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg);
  }

  /** C2S.Refine */
  onRefine(p: PlayerState, msg: RefineMsg): void {
    if (!msg || typeof msg !== "object" || !validFrom(msg.from) || typeof msg.uid !== "string" || !isInt(msg.level) || p.hp <= 0) return;
    if (this.o.npcOpen(p.id) !== REFINE_NPC) return this.notice(p.id, REFINE_MSG.closed, "warn");
    const inv = this.o.inventory;
    const it = inv.peekAt(p.id, msg.from);
    if (!it || it.uid !== msg.uid) return this.notice(p.id, REFINE_MSG.gone, "warn");
    const d = inv.defs(it.defId);
    const block = refineBlock(d);
    if (block) return this.notice(p.id, block, "warn");
    const cur = refineLevel(d, it.refine);
    if (cur >= REFINE_MAX) return this.notice(p.id, REFINE_MSG.max, "warn");
    // Nível pedido ≠ atual + 1: clique repetido que chegou depois do resultado (ou janela velha). Não cobra nada.
    if (msg.level !== cur + 1) return;
    const cost = refineCost(d, cur + 1)!;
    // Confere TODOS os materiais (gema e o extra do +4/+5) e o ouro antes de cobrar qualquer coisa.
    const mats = refineMaterials(cost);
    const missing = mats.filter((m) => inv.countItem(p.id, m.materialId) < m.count);
    if (missing.length) {
      return this.notice(p.id, REFINE_MSG.materials(missing.map((m) => ({ count: m.count, name: inv.defs(m.materialId)?.name ?? m.materialId }))), "warn");
    }
    if (inv.gold(p.id) < cost.gold) return this.notice(p.id, REFINE_MSG.gold(cost.gold), "warn");
    if (!inv.spendGold(p, cost.gold)) return;
    for (const m of mats) inv.removeItems(p, m.materialId, m.count);
    const before = refinedName(d, it);
    const ok = this.rng() >= cost.failChance;
    if (ok) {
      it.refine = cur + 1;
      inv.itemChanged(p, msg.from);
      this.notice(p.id, `Refino concluído: ${refinedName(d, it)}!`, "good");
    } else {
      this.notice(p.id, `O refino falhou. ${before} continua como estava; ${cost.extra ? "o ouro e os materiais foram gastos" : "o ouro e a gema foram gastos"}.`, "warn");
    }
    this.log(`[refino] ${p.name} ${ok ? "subiu" : "falhou"} ${it.defId} → +${cur + 1} (${cost.gold} de ouro)`);
    this.o.save?.(p.id);
  }
}
