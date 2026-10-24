// Eventos semanais: janelas de tempo com bônus (XP e/ou chance de loot). Horário do servidor (fuso da máquina).

export interface GameEventDef {
  id: string;
  name: string;
  desc: string;
  /** Multiplicador da XP de abates (1 = normal). */
  xpMult: number;
  /** Multiplicador da chance de cada item do loot (1 = normal; a chance nunca passa de 100%). */
  lootMult: number;
  /** Dia da semana (0 = domingo … 6 = sábado), hora e minuto de início, e duração em minutos. */
  day: number;
  hour: number;
  minute?: number;
  durationMin: number;
  /** Chefe (id em MONSTERS) que o evento convoca no começo, no spawn dele (se não houver um vivo). */
  boss?: string;
}

/** Chefes do almoço: dias úteis, 12h15 às 13h (o público joga no intervalo do escritório). */
const LUNCH = { hour: 12, minute: 15, durationMin: 45 } as const;

export const WEEKLY_EVENTS: readonly GameEventDef[] = [
  { id: "mare_de_tesouros", name: "Maré de Tesouros", desc: "Chance de loot +50%", xpMult: 1, lootMult: 1.5, day: 3, hour: 12, durationMin: 60 },
  { id: "noite_de_cacada", name: "Noite de Caçada", desc: "XP em dobro", xpMult: 2, lootMult: 1, day: 5, hour: 19, durationMin: 60 },
  // Evento de XP em horário de escritório (ciclo 9, GD-14): terça às 13h, logo depois do Rei Goblin (12h15–13h) — o
  // agendador devolve um evento só, então as janelas não podem se sobrepor.
  { id: "cacada_de_terca", name: "Caçada de Terça", desc: "XP em dobro", xpMult: 2, lootMult: 1, day: 2, hour: 13, durationMin: 60 },
  { id: "tarde_de_sabado", name: "Tarde de Sábado", desc: "XP ×1,5 e loot +25%", xpMult: 1.5, lootMult: 1.25, day: 6, hour: 14, durationMin: 120 },
  // Tradições do escritório (ciclo 10): o "Sextou" das 17h de sexta (entre Demodras, 12h15–13h, e a Noite de Caçada,
  // 19h) e a Reunião Geral de segunda às 9h, quando a TV da War Room fala sozinha (antes do Lich, 12h15).
  { id: "sextou", name: "Sextou!", desc: "XP ×1,5 e loot +25% até o fim do expediente", xpMult: 1.5, lootMult: 1.25, day: 5, hour: 17, durationMin: 60 },
  { id: "reuniao_geral", name: "Reunião Geral", desc: "Enquanto a TV da War Room fala, os monstros largam mais loot: +50%", xpMult: 1, lootMult: 1.5, day: 1, hour: 9, durationMin: 45 },
  // Chefes no almoço (seg, ter, qui, sex; a quarta é da Maré de Tesouros), do mais fácil ao mais difícil na semana.
  { id: "despertar_do_lich", name: "Despertar do Lich", desc: "O Lich do Pântano acordou! Loot +50%", xpMult: 1, lootMult: 1.5, day: 1, ...LUNCH, boss: "swamp_lich" },
  { id: "cacada_ao_rei", name: "Caçada ao Rei Goblin", desc: "O Rei Goblin voltou às Ruínas! Loot +50%", xpMult: 1, lootMult: 1.5, day: 2, ...LUNCH, boss: "goblin_king" },
  // Raids das Terras Selvagens, como no Tibia: o chefe aparece no covil dele na hora marcada.
  { id: "rugido_do_yeti", name: "Rugido do Yeti", desc: "O Yeti saiu da caverna na Ilha Gelada! Loot +50%", xpMult: 1, lootMult: 1.5, day: 4, ...LUNCH, boss: "yeti" },
  { id: "furia_de_demodras", name: "Fúria de Demodras", desc: "Demodras acordou no Vale dos Dragões! Loot +50%", xpMult: 1, lootMult: 1.5, day: 5, ...LUNCH, boss: "demodras" },
  // Malha da Ferrovia (ciclo 11): o apito das cinco de quarta, fim do expediente. Fora do almoço porque a quarta ao meio-dia
  // é da Maré de Tesouros e o almoço já tem um chefe por dia útil; antes das 18h para o Orshabaal seguir o único noturno.
  { id: "apito_da_locomotiva", name: "Apito da Locomotiva", desc: "O Tirano da Serra desceu ao Túnel da Serra! Loot +50%", xpMult: 1, lootMult: 1.5, day: 3, hour: 17, durationMin: 60, boss: "locomotiva_fantasma" },
  // Fim de semana: Ferumbras à tarde e o único chefe noturno (Orshabaal), para quem joga de casa.
  { id: "retorno_de_ferumbras", name: "Retorno de Ferumbras", desc: "Ferumbras voltou à Cidadela! XP ×1,5 e loot +50%", xpMult: 1.5, lootMult: 1.5, day: 0, hour: 15, durationMin: 90, boss: "ferumbras" },
  { id: "invasao_de_orshabaal", name: "Invasão de Orshabaal", desc: "Orshabaal subiu do Abismo! XP ×1,5 e loot +50%", xpMult: 1.5, lootMult: 1.5, day: 6, hour: 21, durationMin: 90, boss: "orshabaal" },
];

/** Evento em andamento (agendado ou disparado por admin). */
export interface ActiveEvent {
  id: string;
  name: string;
  desc: string;
  xpMult: number;
  lootMult: number;
  /** Fim, em ms epoch. */
  until: number;
  /** Chefe convocado ao começar (ver GameEventDef.boss). */
  boss?: string;
}

export const eventDef = (id: string): GameEventDef | undefined => WEEKLY_EVENTS.find((e) => e.id === id);

export function toActive(def: GameEventDef, until: number): ActiveEvent {
  return { id: def.id, name: def.name, desc: def.desc, xpMult: def.xpMult, lootMult: def.lootMult, until, ...(def.boss ? { boss: def.boss } : {}) };
}

/** Evento agendado que está valendo em `now` (considera o de ontem que atravessa a meia-noite). Null se nenhum. */
export function scheduledEvent(now: Date, defs: readonly GameEventDef[] = WEEKLY_EVENTS): ActiveEvent | null {
  for (const def of defs) {
    for (const back of [0, 1]) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, def.hour, def.minute ?? 0, 0, 0);
      if (start.getDay() !== def.day) continue;
      const end = start.getTime() + def.durationMin * 60_000;
      if (start.getTime() <= now.getTime() && now.getTime() < end) return toActive(def, end);
    }
  }
  return null;
}

/** Próximo início de evento agendado depois de `now` (para o /evento mostrar "próximo"). */
export function nextScheduled(now: Date, defs: readonly GameEventDef[] = WEEKLY_EVENTS): { def: GameEventDef; at: number } | null {
  let best: { def: GameEventDef; at: number } | null = null;
  for (const def of defs) {
    for (let ahead = 0; ahead <= 7; ahead++) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, def.hour, def.minute ?? 0, 0, 0);
      if (start.getDay() !== def.day || start.getTime() <= now.getTime()) continue;
      if (!best || start.getTime() < best.at) best = { def, at: start.getTime() };
      break;
    }
  }
  return best;
}

/** "XP ×2 · loot ×1,5" (só o que está acima de 1, vírgula decimal). */
export function eventBonusText(e: Pick<ActiveEvent, "xpMult" | "lootMult">): string {
  const fmt = (n: number) => String(n).replace(".", ",");
  const parts: string[] = [];
  if (e.xpMult > 1) parts.push(`XP ×${fmt(e.xpMult)}`);
  if (e.lootMult > 1) parts.push(`loot ×${fmt(e.lootMult)}`);
  return parts.join(" · ");
}
