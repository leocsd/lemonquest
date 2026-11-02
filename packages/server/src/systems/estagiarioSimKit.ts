// Simulador do Estagiário (só mede; nenhuma regra de jogo mora aqui): o bot com uma configuração, caçando com os
// sistemas reais (magias, condições, combate, IA dos monstros, perseguição, movimento, regeneração) contra monstros
// corpo a corpo da faixa num anel de spawns. Usado por estagiarioBalance.test.ts (metas como asserções) e por análises
// pontuais (grids de variantes de cura/ataque/buff). Semente fixa: a mesma rodada dá o mesmo relatório.
import {
  REGEN_INTERVAL_MS, TICK_MS, baseStats, estagiarioPadrao, manaRegenAmount, monsterDef, regenAmount, skillEstimate, spellDef,
  type ConditionId, type EstagiarioConfig, type MonsterDef, type QuickPotionKind, type RegraCura, type Vocation,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { ConditionSystem } from "./conditions.ts";
import { EstagiarioSystem } from "./estagiario.ts";
import { FightModeSystem } from "./fightmode.ts";
import { MovementSystem } from "./movement.ts";
import { SkillSystem } from "./skills.ts";
import { SpellSystem } from "./spells.ts";
import { SummonSystem } from "./summons.ts";
import { def, openGrid, player, seeded, world } from "./testkit.ts";

/** Monstro de referência da faixa (números do catálogo, sem habilidades, para a luta ser só o básico). */
export const MONSTRO: Record<number, Partial<MonsterDef>> = {
  20: { id: "skeleton", name: "Esqueleto", level: 24, hp: 280, xp: 200, damage: [20, 42], damageKind: "physical", armor: 6, attackMs: 2000, stepMs: 400 },
  40: { id: "orc_warrior", name: "Orc Guerreiro", level: 42, hp: 700, xp: 900, damage: [40, 80], damageKind: "physical", armor: 12, attackMs: 1800, stepMs: 320 },
  60: { id: "cyclops", name: "Ciclope", level: 55, hp: 1200, xp: 1800, damage: [65, 130], damageKind: "physical", armor: 18, attackMs: 2000, stepMs: 400 },
};
/** A melhor poção do level (items.ts): Média (lv 15) / Grande (lv 30). */
export const POCAO_HP: Record<number, number> = { 20: 180, 40: 450, 60: 450 };
export const POCAO_MANA: Record<number, number> = { 20: 350, 40: 900, 60: 900 };
export const VOCS: readonly Vocation[] = ["knight", "paladin", "sorcerer", "druid"];
export const LEVELS = [20, 40, 60] as const;
export const SEGUNDOS = 240;

/** As regras recomendadas da v2 no modo avançado (a referência medida de 2026-11-02): o modo simples tem de render como elas. */
export const configAvancada = (v: Vocation): Partial<EstagiarioConfig> => ({ ...estagiarioPadrao(v), modo: "avancado" });

/**
 * A configuração recomendada de ANTES da v2 (2026-11-01), para medir o ganho: Cura comum com limiar acima da cura própria
 * (70 contra 55/60), magos com a Cura a 65, Golpe Giratório com 2 bichos, colado (sem manter distância), sem invocação.
 * Modo avançado: no simples (v3) as listas não valem.
 */
export function configAntiga(v: Vocation): Partial<EstagiarioConfig> {
  const hp = (abaixoDe: number): RegraCura => ({ quando: "vida", abaixoDe, acao: { pocao: "hp" } });
  const mp = (abaixoDe: number): RegraCura => ({ quando: "mana", abaixoDe, acao: { pocao: "mana" } });
  const mg = (abaixoDe: number, id: string): RegraCura => ({ quando: "vida", abaixoDe, acao: { magia: id } });
  const cura = v === "knight" ? [hp(35), mg(55, "wound_cleansing"), mg(70, "light_heal"), mp(25)]
    : v === "paladin" ? [hp(35), mg(60, "divine_healing"), mg(70, "light_heal"), mp(35)]
      : [hp(35), mg(65, "light_heal"), mp(35)];
  const padrao = estagiarioPadrao(v);
  return {
    modo: "avancado",
    cura,
    ataque: padrao.ataque.map((r) => (r.magia === "spin_strike" ? { ...r, minBichos: 2 } : r)),
    buffs: padrao.buffs.filter((b) => !spellDef(b.magia)?.summon),
    distancia: 0,
  };
}

export interface Resultado {
  casts: Record<string, number>; falhas: Record<string, number>; pocoes: Record<string, number>; uptime: Record<string, number>;
  manaCura: number; manaAtaque: number; manaBuff: number; kills: number; mortes: number; hpMin: number; manaMedia: number;
}

export interface Opcoes {
  pocaoMana?: boolean;
  config?: Partial<EstagiarioConfig>;
  /** Linha do tempo por segundo (posição, alvo, vizinhos, vida, mana, motivo), preenchida aqui. */
  trace?: string[];
  nMonstros?: number;
  /** Deslocamento da semente (0 = a de sempre): rodadas diferentes da mesma configuração. */
  seed?: number;
}

export function simular(v: Vocation, L: number, o: Opcoes = {}): Resultado {
  const grade = openGrid(48, 48);
  // Spawns num anel a 12 tiles do centro (RESPAWN_PLAYER_DIST = 7: a luta no meio não impede o respawn), percepção 14.
  const mdef = def({ ...MONSTRO[L]!, aggroRange: 14, respawnMs: 2000, fleeAtHpPct: 0 });
  const defs: Record<string, MonsterDef> = { [mdef.id]: mdef };
  const anel = [{ x: 12, y: 24 }, { x: 36, y: 24 }, { x: 24, y: 12 }, { x: 24, y: 36 }];
  const semente = (o.seed ?? 0) * 1000;
  const w = world({
    grid: grade, defs: (id) => defs[id], spawns: anel.slice(0, o.nMonstros ?? 4).map((t) => ({ defId: mdef.id, x: t.x, y: t.y, count: 1, radius: 0 })),
    spawn: { x: 2, y: 2 }, seed: 7 + L + semente,
  });
  w.mm.spawnAll();
  const st = baseStats(v, L);
  const sk = skillEstimate(v, L);
  const p = w.add(player("p", 21, 24, {
    vocation: v, level: L, hp: st.maxHp, maxHp: st.maxHp, mana: st.maxMana, maxMana: st.maxMana, bot: false, chase: true,
    magicLevel: sk.magic, skillMelee: sk.melee, skillDistance: sk.distance, skillShield: sk.shield, speedPct: 100, stance: "balanced",
  } as Partial<PlayerState>));
  w.mm.playerList = [...w.players.values()];
  const send = (to: string, type: string, msg: unknown) => w.sent.push({ to, type, msg });
  const skills = new SkillSystem(send);
  skills.load(p, { melee: { level: sk.melee, tries: 0 }, distance: { level: sk.distance, tries: 0 }, magic: { level: sk.magic, tries: 0 }, shield: { level: sk.shield, tries: 0 } } as never);
  const conditions = new ConditionSystem({ monsters: w.mm, combat: w.combat, getPlayer: (id) => w.players.get(id), players: () => w.players.values(), send });
  // RNG semeado também nas magias e invocações (o do mundo já é): a medida tem de ser a mesma a cada rodada.
  const rng = seeded(100 + L + semente);
  // O catálogo real para a invocação do druida (Lobo Espiritual); o monstro da faixa vem do def local.
  const summons = new SummonSystem({ monsters: w.mm, combat: w.combat, getPlayer: (id) => w.players.get(id), defs: (id) => defs[id] ?? monsterDef(id), rng });
  const spells = new SpellSystem({
    grid: grade, monsters: w.mm, combat: w.combat, conditions, summons, skills,
    players: () => w.players.values(), getPlayer: (id) => w.players.get(id),
    teleport: (q, x, y) => { q.x = x; q.y = y; }, send, broadcast: (type, msg) => send("*", type, msg), now: w.now, rng,
  });
  let mortes = 0;
  w.combat.hooks = {
    damageTakenPct: (id) => conditions.damageTakenPct(id),
    manaShield: (id) => conditions.manaShield(id),
    onPlayerDied: (q) => { conditions.clear(q.id); summons.despawnOwner(q.id); sys.onDied(q); mortes++; q.hp = q.maxHp; q.mana = q.maxMana; q.x = 21; q.y = 24; },
  };
  // Poções infinitas com a recarga real (2 s vida / 1 s mana) e a quantidade da melhor poção do level.
  let potCd = 0;
  const pocoes: Record<string, number> = {};
  const tem = (k: QuickPotionKind) => k === "hp" || o.pocaoMana !== false;
  const potions = {
    potionReady: (_q: PlayerState, now = w.now()) => now >= potCd,
    usePotion: (q: PlayerState, kind: QuickPotionKind) => {
      if (w.now() < potCd || !tem(kind)) return false;
      if (kind === "hp") { w.combat.healPlayer(q, q.id, POCAO_HP[L]!); potCd = w.now() + 2000; }
      else { w.combat.restoreMana(q, POCAO_MANA[L]!); potCd = w.now() + 1000; }
      pocoes[kind] = (pocoes[kind] ?? 0) + 1;
      return true;
    },
    countPotions: () => 999, canDrink: (_q: PlayerState, k: QuickPotionKind) => tem(k),
    potionAmount: (_q: PlayerState, k: QuickPotionKind) => (tem(k) ? (k === "hp" ? POCAO_HP[L]! : POCAO_MANA[L]!) : 0),
  };
  const mv = new MovementSystem(grade, { now: w.now });
  mv.setExtraBlocker((x, y) => w.mm.isMonsterAt(x, y));
  mv.addPlayer(p);
  const fight = new FightModeSystem({ movement: mv, monsters: w.mm, attackRange: (q) => w.combat.attackOf(q).range, now: w.now });
  const falhas: Record<string, number> = {};
  const casts: Record<string, number> = {};
  let manaCura = 0, manaAtaque = 0, manaBuff = 0;
  const spellsWrap = {
    ready: (q: PlayerState, id: string, now?: number) => spells.ready(q, id, now),
    cast: (q: PlayerState, id: string, t?: string, op?: { silent?: boolean }) => {
      const antes = q.mana;
      const r = spells.cast(q, id, t, op);
      if (!r.ok) falhas[`${id}:${r.reason}`] = (falhas[`${id}:${r.reason}`] ?? 0) + 1;
      else {
        casts[id] = (casts[id] ?? 0) + 1;
        const s = spellDef(id)!, gasto = antes - q.mana;
        if (s.heal) manaCura += gasto; else if (s.damage) manaAtaque += gasto; else manaBuff += gasto;
      }
      return r;
    },
  };
  const sys = new EstagiarioSystem({
    spells: spellsWrap, potions, conditions, fight, monsters: w.mm, movement: mv,
    companions: { spawnCompanion: () => ({}), despawnCompanion: () => {}, companionOf: () => ({}) },
    npcOpen: () => false, spellGroups: () => [], players: () => w.players.values(), send, now: w.now,
    inCombat: (id, now) => w.combat.inCombat(id, now),
    invocacoes: (id) => summons.ownedBy(id).length,
    attackRange: (q) => w.combat.attackOf(q).range,
  });
  // A rota liga o modo de caça completo (perseguição forçada e "manter distância"); um circuito curto perto do centro.
  const config: EstagiarioConfig = { ...estagiarioPadrao(v), ...o.config, rotas: [{ nome: "Anel", pontos: [{ x: 21, y: 24 }, { x: 22, y: 25 }] }] };
  sys.load(p, { config });
  sys.onToggle(p, { cura: true, ataque: true, buffs: true, rota: "Anel" });
  const uptime: Record<string, number> = {};
  let hpMin = Infinity, ticks = 0, manaSoma = 0, kills = 0;
  let regenAt = w.now() + REGEN_INTERVAL_MS;
  const vivos = () => [...w.mm.all()].filter((m) => m.s.hp > 0 && !m.s.ownerId);
  let antesVivos = vivos().length;
  let proxTrace = w.now();
  const fim = w.now() + SEGUNDOS * 1000;
  while (w.now() < fim) {
    w.setClock(w.now() + TICK_MS);
    if (o.trace && w.now() >= proxTrace) {
      proxTrace += 1000;
      const t = w.mm.wild(p.targetId);
      const vl = vivos();
      const perto = (r: number) => vl.filter((m) => Math.max(Math.abs(m.s.x - p.x), Math.abs(m.s.y - p.y)) <= r).length;
      o.trace.push(`t=${Math.round((w.now() - 10_000) / 1000)}s pos=${p.x},${p.y} alvo=${t ? `@${Math.max(Math.abs(t.s.x - p.x), Math.abs(t.s.y - p.y))} hp${t.s.hp}` : "-"} vivos=${vl.length} adj=${perto(1)} a3=${perto(3)} hp=${Math.round((p.hp / p.maxHp) * 100)}% mana=${Math.round((p.mana / p.maxMana) * 100)}% motivo=${sys.estado(p).motivo}`);
    }
    sys.tick(w.now());
    fight.tick(w.now(), w.players.values());
    mv.tick(w.now(), w.players.values());
    w.mm.tick(w.now());
    w.combat.tick(w.now());
    conditions.tick(w.now());
    w.combat.flush();
    if (w.now() >= regenAt) {
      regenAt += REGEN_INTERVAL_MS;
      const lutando = w.combat.inCombat(p.id, w.now());
      if (p.hp > 0) {
        p.mana = Math.min(p.maxMana, p.mana + manaRegenAmount(p.maxMana, p.level, lutando, false));
        if (!lutando) p.hp = Math.min(p.maxHp, p.hp + regenAmount(p.maxHp, p.level, false));
      }
    }
    for (const c of ["haste", "protect", "berserk", "manashield"] as ConditionId[]) if (conditions.has(p.id, c)) uptime[c] = (uptime[c] ?? 0) + 1;
    hpMin = Math.min(hpMin, (p.hp / p.maxHp) * 100); manaSoma += (p.mana / p.maxMana) * 100; ticks++;
    const agora = vivos().length;
    if (agora < antesVivos) kills += antesVivos - agora;
    antesVivos = agora;
  }
  for (const k of Object.keys(uptime)) uptime[k] = Math.round((uptime[k]! / ticks) * 100);
  return { casts, falhas, pocoes, uptime, manaCura, manaAtaque, manaBuff, kills, mortes, hpMin: Math.round(hpMin), manaMedia: Math.round(manaSoma / ticks) };
}

export const linha = (titulo: string, r: Resultado): string => {
  const c = Object.entries(r.casts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${spellDef(k)?.name ?? k}×${n}`).join(", ");
  return [
    `== ${titulo} ==`, `  casts: ${c || "-"}`, `  falhas: ${JSON.stringify(r.falhas)}`,
    `  poções ${JSON.stringify(r.pocoes)} · kills ${r.kills} · mortes ${r.mortes} · HP mín ${r.hpMin}% · mana média ${r.manaMedia}%`,
    `  mana gasta: cura ${r.manaCura} / ataque ${r.manaAtaque} / buff ${r.manaBuff} · uptime% ${JSON.stringify(r.uptime)}`,
  ].join("\n");
};
