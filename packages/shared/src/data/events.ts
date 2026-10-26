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
  /** Invasão da Vila (shared/data/invasion.ts, server/systems/invasion.ts): ondas de monstros durante a janela. */
  invasion?: true;
}

/** Chefes do almoço: dias úteis, 12h15 às 13h (o público joga no intervalo do escritório). */
const LUNCH = { hour: 12, minute: 15, durationMin: 45 } as const;

export const WEEKLY_EVENTS: readonly GameEventDef[] = [
  // Ciclo 18 (decisão do dono): a quarta do almoço é da Invasão da Vila (12h15–12h55, como os chefes do almoço, mas
  // terminando antes das 13h); a Maré de Tesouros passou para quinta 13h–14h, logo depois do Yeti.
  { id: "invasao_da_vila", name: "Invasão da Vila", desc: "Monstros cercam a Vila em ondas: quem ajudar a defender ganha Baú de Recompensa", xpMult: 1, lootMult: 1, day: 3, hour: 12, minute: 15, durationMin: 40, invasion: true },
  { id: "mare_de_tesouros", name: "Maré de Tesouros", desc: "Chance de loot +50%", xpMult: 1, lootMult: 1.5, day: 4, hour: 13, durationMin: 60 },
  { id: "noite_de_cacada", name: "Noite de Caçada", desc: "XP em dobro", xpMult: 2, lootMult: 1, day: 5, hour: 19, durationMin: 60 },
  // Evento de XP em horário de escritório (ciclo 9, GD-14): terça às 13h, logo depois do Rei Goblin (12h15–13h) — o
  // agendador devolve um evento só, então as janelas não podem se sobrepor.
  { id: "cacada_de_terca", name: "Caçada de Terça", desc: "XP em dobro", xpMult: 2, lootMult: 1, day: 2, hour: 13, durationMin: 60 },
  { id: "tarde_de_sabado", name: "Tarde de Sábado", desc: "XP ×1,5 e loot +25%", xpMult: 1.5, lootMult: 1.25, day: 6, hour: 14, durationMin: 120 },
  // Tradições do escritório (ciclo 10): o "Sextou" das 17h de sexta (entre Demodras, 12h15–13h, e a Noite de Caçada,
  // 19h) e a Reunião Geral de segunda às 9h, quando a TV da War Room fala sozinha (antes do Lich, 12h15).
  { id: "sextou", name: "Sextou!", desc: "XP ×1,5 e loot +25% até o fim do expediente", xpMult: 1.5, lootMult: 1.25, day: 5, hour: 17, durationMin: 60 },
  { id: "reuniao_geral", name: "Reunião Geral", desc: "Enquanto a TV da War Room fala, os monstros largam mais loot: +50%", xpMult: 1, lootMult: 1.5, day: 1, hour: 9, durationMin: 45 },
  // Chefes no almoço (seg, ter, qui, sex; a quarta é da Invasão da Vila), do mais fácil ao mais difícil na semana.
  { id: "despertar_do_lich", name: "Despertar do Lich", desc: "O Lich do Pântano acordou! Loot +50%", xpMult: 1, lootMult: 1.5, day: 1, ...LUNCH, boss: "swamp_lich" },
  { id: "cacada_ao_rei", name: "Caçada ao Rei Goblin", desc: "O Rei Goblin voltou às Ruínas! Loot +50%", xpMult: 1, lootMult: 1.5, day: 2, ...LUNCH, boss: "goblin_king" },
  // Raids das Terras Selvagens, como no Tibia: o chefe aparece no covil dele na hora marcada.
  { id: "rugido_do_yeti", name: "Rugido do Yeti", desc: "O Yeti saiu da caverna na Ilha Gelada! Loot +50%", xpMult: 1, lootMult: 1.5, day: 4, ...LUNCH, boss: "yeti" },
  { id: "furia_de_demodras", name: "Fúria de Demodras", desc: "Demodras acordou no Vale dos Dragões! Loot +50%", xpMult: 1, lootMult: 1.5, day: 5, ...LUNCH, boss: "demodras" },
  // Malha da Ferrovia (ciclo 11): o apito das cinco de quarta, fim do expediente. Fora do almoço porque a quarta ao meio-dia
  // é da Invasão da Vila (era da Maré de Tesouros até o ciclo 18) e o almoço já tem um chefe por dia útil; antes das 18h
  // para o Orshabaal seguir o único noturno.
  { id: "apito_da_locomotiva", name: "Apito da Locomotiva", desc: "O Tirano da Serra desceu ao Túnel da Serra! Loot +50%", xpMult: 1, lootMult: 1.5, day: 3, hour: 17, durationMin: 60, boss: "locomotiva_fantasma" },
  // Fim de semana: Ferumbras à tarde e o único chefe noturno (Orshabaal), para quem joga de casa.
  { id: "retorno_de_ferumbras", name: "Retorno de Ferumbras", desc: "Ferumbras voltou à Cidadela! XP ×1,5 e loot +50%", xpMult: 1.5, lootMult: 1.5, day: 0, hour: 15, durationMin: 90, boss: "ferumbras" },
  { id: "invasao_de_orshabaal", name: "Invasão de Orshabaal", desc: "Orshabaal subiu do Abismo! XP ×1,5 e loot +50%", xpMult: 1.5, lootMult: 1.5, day: 6, hour: 21, durationMin: 90, boss: "orshabaal" },
  // Ciclo 12: em produção ninguém tinha matado Ferumbras nem Orshabaal (só apareciam no fim de semana, sem ninguém
  // online). Ganham também uma edição no fim do expediente, nos dias livres às 17h (como o Apito da Locomotiva).
  { id: "ferumbras_no_expediente", name: "Ferumbras na Cidadela", desc: "Ferumbras voltou à Cidadela! XP ×1,5 e loot +50%", xpMult: 1.5, lootMult: 1.5, day: 2, hour: 17, durationMin: 60, boss: "ferumbras" },
  { id: "orshabaal_no_expediente", name: "Cerco de Orshabaal", desc: "Orshabaal subiu do Abismo! XP ×1,5 e loot +50%", xpMult: 1.5, lootMult: 1.5, day: 4, hour: 17, durationMin: 60, boss: "orshabaal" },
  // Siderúrgica (ciclo 19): a sangria das cinco de segunda, fim do expediente, como as outras edições das 17h (terça
  // Ferumbras, quarta Apito, quinta Orshabaal); a segunda às 17h estava livre.
  { id: "sangria_do_alto_forno", name: "Sangria do Alto-Forno", desc: "A corrida de gusa acordou o Golem do Convertedor na Aciaria! Loot +50%", xpMult: 1, lootMult: 1.5, day: 1, hour: 17, durationMin: 60, boss: "golem_convertedor" },
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

/** Ocorrência de um evento agendado (ms epoch). `live` = já começou e ainda não acabou. */
export interface UpcomingEvent { def: GameEventDef; start: number; end: number; live: boolean }

/**
 * Agenda: as próximas `n` ocorrências (a em andamento primeiro), em ordem de início. O padrão (uma por evento) é a
 * semana inteira a partir de agora: cada evento se repete a cada 7 dias. Mesmo fuso do agendador (horário local da
 * máquina, como `scheduledEvent`/`nextScheduled`); a janela de ontem que atravessa a meia-noite também conta.
 */
export function upcomingEvents(now: Date, n: number = WEEKLY_EVENTS.length, defs: readonly GameEventDef[] = WEEKLY_EVENTS): UpcomingEvent[] {
  const t = now.getTime();
  const out: UpcomingEvent[] = [];
  for (const def of defs) {
    for (let ahead = -1; ahead <= 7; ahead++) {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, def.hour, def.minute ?? 0, 0, 0);
      if (s.getDay() !== def.day) continue;
      const start = s.getTime(), end = start + def.durationMin * 60_000;
      if (end > t) out.push({ def, start, end, live: start <= t });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.def.id.localeCompare(b.def.id)).slice(0, Math.max(0, n));
}

/** Aviso de "evento começando": quanto antes do início (S2C.EventSoon, Feed e título da aba). */
export const EVENT_SOON_MS = 10 * 60_000;

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
/** "12:15" no fuso local (o do servidor, para o /agenda; o do navegador, na janela). */
export function clockText(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** "hoje", "amanhã" ou o dia da semana ("qui"), em dias de calendário no fuso local. */
export function eventDayText(start: number, now: number): string {
  const day = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const diff = Math.round((day(start) - day(now)) / 86_400_000);
  return diff === 0 ? "hoje" : diff === 1 ? "amanhã" : WEEKDAY_SHORT[new Date(start).getDay()]!;
}
/** "hoje às 12:15", "amanhã às 09:00", "qui às 17:00". */
export const eventWhenText = (start: number, now: number): string => `${eventDayText(start, now)} às ${clockText(start)}`;

/** "XP ×2 · loot ×1,5" (só o que está acima de 1, vírgula decimal). */
export function eventBonusText(e: Pick<ActiveEvent, "xpMult" | "lootMult">): string {
  const fmt = (n: number) => String(n).replace(".", ",");
  const parts: string[] = [];
  if (e.xpMult > 1) parts.push(`XP ×${fmt(e.xpMult)}`);
  if (e.lootMult > 1) parts.push(`loot ×${fmt(e.lootMult)}`);
  return parts.join(" · ");
}
