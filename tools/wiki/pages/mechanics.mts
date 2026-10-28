// Mecânicas: uma página por sistema, com os números tirados dos dados e das fórmulas do jogo (shared), nunca escritos
// à mão. Onde a regra só existe no servidor (prioridade do loot de grupo, sorteio do Quadro de Recompensas), o valor
// vem do próprio código do servidor: importado quando o módulo é puro, lido por regex quando não é (falha se sumir).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACHIEVEMENTS, ARENA_BOSS_EVERY, ARENA_BREAK_MS, ARENA_COMPLETE_GOLD, ARENA_COMPLETE_XP_PCT, ARENA_COUNT, ARENA_LOBBY_RANGE,
  ARENA_MAX_WAVE, ARENA_MILESTONE_GOLD, ARENA_MILESTONE_WAVE, ARENA_MODS, ARENA_MOD_FROM_WAVE, ARENA_MOD_ORDER,
  ARENA_PAUSE_HEAL, ARENA_SHOP_PAUSE_MS, ARENA_WAVES, ARENA_XP_MULT, BACKPACK_BY_VOCATION, BACKPACK_LEVELS_PER_SLOT,
  BLESSING_GOLD_PER_LEVEL, BOUNTIES_PER_DAY, BOUNTY_BANDS, BOUNTY_CHEST_ID, BOUNTY_NPC, BOUNTY_RESET_HOUR, CHALLENGES,
  CHALLENGES_PER_WEEK, CHALLENGE_BONUS_PRIZE, CHALLENGE_BONUS_XP_PCT, CRIT_CHANCE, CRIT_MULT, DEATH_PENALTY_STAGES,
  FOOD_MAX_MS, FOOD_TICK_MS, HEALTH_POTION_CD_MS, IMBUEMENTS, IMBUEMENT_EFFECTS, IMBUEMENT_TIERS, IMBUE_DURATION_MS,
  IMBUE_SPELL_MULT, IMBUE_WARN_MS, INVASION_BASE, INVASION_CHESTS, INVASION_DEFENDED_BONUS, INVASION_DEFEND_PCT,
  INVASION_MAX_ALIVE, INVASION_MIN_POINTS, INVASION_PER_PLAYER, INVASION_TIERS, INVASION_WAVES, ITEMS, MANA_POTION_CD_MS,
  MISS_CHANCE, MONSTERS, NPCS, OUTFIT_TONES, OUTFIT_TONE_PRICE, OUT_OF_COMBAT_MS, PARTY_ACTIVE_MS, PARTY_INVITE_MS,
  PARTY_MAX, PARTY_SHARE_BONUS, PARTY_SHARE_RANGE, PARTY_VOCATION_BONUS, PARTY_VOCATION_BONUS_MIN, PLAYER_ATTACK_MS,
  PVP_AGGRESSION_MS, PVP_DAMAGE_MULT, PZ_LOCK_MS, QUEST_CHESTS, QUEST_CHEST_GROUPS, QUEST_LIST, RARITY_LABEL,
  RED_SKULL_DEATH_XP_MULT, RED_SKULL_GOLD_DROP, RED_SKULL_KILLS, RED_SKULL_WINDOW_MS, REFINE_ARMOR_PER_LEVEL,
  REFINE_ATTACK_PER_LEVEL, REFINE_BASE_GOLD, REFINE_EXTRA, REFINE_EXTRA_FROM, REFINE_FAIL_CHANCE, REFINE_GOLD_MULT,
  REFINE_MATERIAL, REFINE_MAX, REFINE_NPC, REFINE_TIERS, REFINE_TIER_LEVEL, REGEN_INTERVAL_MS, SKILLS, SKILL_RATE,
  PLAYABLE_VOCATIONS, SKILL_START, SPELLS, STANCE_DEALT, STANCE_TAKEN, TITLES, TOTAL_ACHIEVEMENT_POINTS, TRAVEL_FREE_LEVEL,
  VOCATION_ATTACK, WEEKLY_EVENTS, XP_STAGES, arenaWaveGold, arenaWeekMod, baseStats, blessingPrice, challengeGold, challengeTarget,
  deathPenalty, deathPenaltyPct, evalSpellFormula, eventBonusText, imbuementDesc, imbuementMaterials, imbuementName,
  manaRegenAmount, partyMinLevel, partyShareEach, refineExpectedExtra, refineExpectedGold, refineTier, regenAmount,
  isHiddenVocation, isMage, skillEstimate, spellsFor, unlockText, vocationFits, weekChallenges, weekId, xpForLevel,
  type ChallengeDef, type ItemDef, type SkillId, type SpellDef, type Vocation, type WeaponType,
} from "../../../packages/shared/src/index.ts";
import { generateBounties } from "../../../packages/server/src/systems/bounties.ts";
import {
  ROOT, duration, esc, fmt, itemIcon, itemLink, kindName, link, monsterLink, npcLink, pct, questLink, spellLink, table,
  vocList, vocName, zoneLink, type WikiPage,
} from "../html.mts";
import type { WikiModel } from "../model.mts";

/** Páginas desta seção (ordem do índice e da página inicial). */
export const MECHANICS: readonly { slug: string; title: string; blurb: string; keywords: string }[] = [
  { slug: "vocacoes", title: "Vocações", blurb: "Vida e mana por level, ataque, armas, skills e magias de cada vocação.", keywords: "cavaleiro paladino feiticeiro druida knight paladin sorcerer druid vida mana skill" },
  { slug: "experiencia", title: "Experiência e levels", blurb: "XP por level, estágios de XP da caça e espaço da mochila.", keywords: "xp level nivel estagio mochila" },
  { slug: "cura-e-pocoes", title: "Cura e poções", blurb: "Fórmula da Cura, curas próprias, poções, comida e regeneração.", keywords: "cura exura pocao pocoes comida regeneracao regen" },
  { slug: "morte", title: "Morte e PvP", blurb: "XP perdida por faixa de level, bênção e caveiras.", keywords: "morte morrer bencao caveira pvp skull" },
  { slug: "grupo", title: "Grupo", blurb: "XP compartilhada, regra de level e divisão do loot.", keywords: "grupo party xp compartilhada loot" },
  { slug: "coliseu", title: "Coliseu", blurb: "As ondas, os chefes, o modificador da semana e as recompensas.", keywords: "coliseu arena ondas modificador" },
  { slug: "eventos", title: "Eventos da semana", blurb: "Agenda semanal com bônus de XP e loot, chefes e a Invasão da Vila.", keywords: "eventos agenda bonus chefe invasao" },
  { slug: "recompensas", title: "Quadro de Recompensas", blurb: "As tarefas diárias de caça por faixa de level.", keywords: "quadro recompensas diarias bounty bau" },
  { slug: "desafios", title: "Desafios da semana", blurb: "As três metas semanais e os prêmios.", keywords: "desafios semana metas" },
  { slug: "refino", title: "Refino", blurb: "Do +1 ao +5 no Ferreiro: chances, ouro e materiais por tier.", keywords: "refino ferreiro forja +5 gema" },
  { slug: "encantamento", title: "Encantamento", blurb: "Efeitos, tiers, custos e duração.", keywords: "encantamento imbuement dreno espinhos perfurante veloz" },
  { slug: "tingimento", title: "Tingimento", blurb: "Os tons de roupa e o preço.", keywords: "tingimento tom cor roupa" },
  { slug: "conquistas", title: "Conquistas e títulos", blurb: "A lista de conquistas, pontos, roupas e títulos.", keywords: "conquistas titulos roupas addons achievements" },
  { slug: "atalhos-e-controles", title: "Atalhos e controles", blurb: "Teclas e cliques do jogo.", keywords: "atalhos teclas controles teclado mouse" },
];

const D = 1; // todas as páginas desta seção ficam em mecanicas/

// ---------------------------------------------------------------------------------------------------------------------
// Pedaços comuns
// ---------------------------------------------------------------------------------------------------------------------

const SKILL_NAME: Record<SkillId, string> = { melee: "Corpo a corpo", distance: "Distância", magic: "Magic level", shield: "Escudo" };
const WEAPON_NAME: Record<WeaponType, string> = { sword: "Espada", axe: "Machado", club: "Clava", bow: "Arco", wand: "Varinha", rod: "Cajado" };
const DAY_NAME = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const two = (n: number) => String(n).padStart(2, "0");
const hhmm = (h: number, m = 0) => `${two(h)}:${two(m)}`;
const ddmm = (d: Date) => `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
const mult = (x: number) => `×${fmt(x)}`;
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

/** NPCs que têm a flag (no mapa), como links. */
const npcsWith = (flag: (id: string) => boolean): string =>
  Object.keys(NPCS).filter(flag).map((id) => npcLink(id, D)).join(", ") || "—";

/** Item com ícone e link. */
const itemCell = (id: string, size = 24): string => {
  const d = ITEMS[id];
  return `${d ? itemIcon(d, size) : ""} ${itemLink(id, D)}`;
};

/** "3× Gema Verde + 1× Cromo" (materiais com link). */
const mats = (list: { materialId: string; count: number }[]): string =>
  list.map((x) => `${x.count}× ${itemCell(x.materialId, 20)}`).join(" + ");

/** Segunda-feira da semana de `d` (00:00, horário local). */
function mondayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}
/** As próximas `n` semanas (a atual primeiro): segunda-feira e id ISO. */
function nextWeeks(n: number): { monday: Date; id: string }[] {
  const m0 = mondayOf(new Date());
  return Array.from({ length: n }, (_, i) => {
    const monday = new Date(m0.getFullYear(), m0.getMonth(), m0.getDate() + 7 * i);
    return { monday, id: weekId(monday) };
  });
}

/**
 * Constante numérica do código do servidor que não dá para importar (o módulo puxa o estado do Colyseus): lida por
 * regex, com `_` de milhar. Some do código = o gerador falha, em vez de mostrar um número velho.
 */
function serverConst(file: string, name: string): string {
  const src = readFileSync(join(ROOT, "packages", "server", "src", file), "utf8");
  const mt = new RegExp(`export const ${name}(?::[^=]+)? = ([^;]+);`).exec(src);
  if (!mt) throw new Error(`wiki: não achei ${name} em packages/server/src/${file}`);
  return mt[1]!.trim();
}
const serverNumber = (file: string, name: string): number => {
  const v = Number(serverConst(file, name).replace(/_/g, ""));
  if (!Number.isFinite(v)) throw new Error(`wiki: ${name} em ${file} não é um número`);
  return v;
};

const page = (slug: string, body: string, extraSearch = ""): WikiPage => {
  const meta = MECHANICS.find((x) => x.slug === slug)!;
  return {
    path: `mecanicas/${slug}.html`, title: meta.title, body: `<h1>${esc(meta.title)}</h1>\n${body}`,
    nav: `${link("mecanicas/index.html", "Mecânicas", D)} › ${esc(meta.title)}`,
    search: [{ title: meta.title, kind: "Mecânica", text: `${meta.blurb} ${meta.keywords} ${extraSearch}` }],
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Vocações
// ---------------------------------------------------------------------------------------------------------------------

/** Papel de cada vocação em uma frase (o resto da seção sai dos dados). */
const ROLE: Record<Vocation, string> = {
  knight: "Linha de frente: a maior vida por level, escudo, golpes em área e Provocar para segurar os monstros.",
  paladin: "Atirador: arco de longe, magias sagradas e cura própria; vida e mana equilibradas.",
  sorcerer: "Mago de ataque: fogo e energia em alvo e em área, Escudo de Mana; pouca vida e muita mana.",
  druid: "Mago de apoio: gelo e terra, Cura em Grupo, raízes e invocação; pouca vida e muita mana.",
  fairy: "Vocação oculta (não aparece na wiki): magias-espelho do druida, cor-de-rosa e com brilhinho.",
};
const STATS_LEVELS = [1, 10, 20, 30, 50, 70, 100, 120];

function vocacoes(): WikiPage {
  const parts: string[] = [];
  parts.push(`<p class="lead">Quatro vocações, escolhidas ao criar o personagem. Vida e mana máximas vêm só do level e da vocação (mais o que o equipamento der); a vida máxima é recalculada a cada login.</p>`);
  parts.push(`<h2>Vida e mana por level</h2>`);
  parts.push(`<p>Fórmula: vida = 150 + (vida por level) × (level − 1); mana = 50 + (mana por level) × (level − 1). Sem equipamento.</p>`);
  parts.push(table(["Level", ...PLAYABLE_VOCATIONS.map((v) => `${esc(vocName[v])}<br><small>vida / mana</small>`)],
    STATS_LEVELS.map((L) => [L, ...PLAYABLE_VOCATIONS.map((v) => { const s = baseStats(v, L); return `${fmt(s.maxHp)} / ${fmt(s.maxMana)}`; })])));

  parts.push(`<h2>Combate básico</h2>`);
  parts.push(`<ul>
<li>Ataque automático a cada ${duration(PLAYER_ATTACK_MS)}, igual para todas as vocações.</li>
<li>${pct(MISS_CHANCE, 0)} de chance de errar; cavaleiros e paladinos têm ${pct(CRIT_CHANCE, 0)} de crítico (dano ${mult(CRIT_MULT)}), mais o bônus de crítico dos itens.</li>
<li>A armadura tira um valor fixo de cada golpe físico; magia de elemento ignora metade da armadura.</li>
<li>Fora de combate = ${duration(OUT_OF_COMBAT_MS)} sem dar nem receber dano.</li>
</ul>`);
  parts.push(table(["Modo de luta", "Dano causado", "Dano recebido"], ([["offensive", "Ofensivo (F2)"], ["balanced", "Equilibrado (F3)"], ["defensive", "Defensivo (F4)"]] as const)
    .map(([k, label]) => [label, mult(STANCE_DEALT[k]), mult(STANCE_TAKEN[k])])));

  const weapons = (v: Vocation) => {
    const t = new Set<string>();
    let shields = 0, books = 0;
    for (const d of Object.values(ITEMS)) {
      if (!vocationFits(d.vocations, v)) continue;
      if (d.kind === "weapon" && d.weaponType) t.add(WEAPON_NAME[d.weaponType]);
      if (d.kind === "shield") { if (d.vocations?.length && d.vocations.every((x) => isMage(x))) books++; else shields++; }
    }
    return { types: [...t], shields, books };
  };

  for (const v of PLAYABLE_VOCATIONS) {
    const a = VOCATION_ATTACK[v];
    const s1 = baseStats(v, 1), s2 = baseStats(v, 2);
    const w = weapons(v);
    const spells = spellsFor(v);
    parts.push(`<h2 id="${v}">${esc(vocName[v])}</h2>`);
    parts.push(`<p>${esc(ROLE[v])}</p>`);
    parts.push(`<ul>
<li><b>Por level:</b> +${s2.maxHp - s1.maxHp} de vida e +${s2.maxMana - s1.maxMana} de mana.</li>
<li><b>Ataque básico:</b> ${a.range > 1 ? `à distância, alcance ${a.range}` : "corpo a corpo"}, dano ${esc(kindName[a.kind].toLowerCase())}${a.canCrit ? ", pode dar crítico" : ", sem crítico"}.</li>
<li><b>Armas:</b> ${esc(w.types.join(", ") || "—")}${w.shields ? `; usa escudo (${plural(w.shields, "escudo", "escudos")})` : ""}${w.books ? `; livros de magia (${w.books})` : ""}.</li>
<li><b>Skills</b> (multiplicador de dificuldade: menor sobe mais rápido): ${SKILLS.map((k) => `${SKILL_NAME[k]} ${mult(SKILL_RATE[v][k])}`).join(" · ")}.</li>
</ul>`);
    parts.push(`<p><b>Magias (${spells.length}):</b> ${spells.map((sp) => `${spellLink(sp.id, D)} <small class="muted">lv ${sp.level}</small>`).join(", ")}.</p>`);
  }
  parts.push(`<h2>Skills</h2>`);
  parts.push(`<p>Começam em ${SKILLS.map((k) => `${SKILL_NAME[k]} ${SKILL_START[k]}`).join(", ")}. Sobem com o uso: golpes de arma (corpo a corpo ou distância), golpes recebidos com escudo e mana gasta em magias (magic level). Também sobem com o treino offline nas estátuas do ${zoneLink("Centro de Treinamento", D)}.</p>`);
  return page("vocacoes", parts.join("\n"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Experiência
// ---------------------------------------------------------------------------------------------------------------------

function experiencia(): WikiPage {
  const parts: string[] = [];
  const levels = [2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
  parts.push(`<h2>XP por level</h2>`);
  parts.push(`<p>XP total para atingir o level: 50·L + 25·L² + 2·L³, com L = level − 1.</p>`);
  parts.push(table(["Level", "XP total", "XP até o próximo"], levels.map((L) => [L, xpForLevel(L), xpForLevel(L + 1) - xpForLevel(L)]), { sortable: true }));
  parts.push(`<h2 id="estagios">Estágios de XP</h2>`);
  parts.push(`<p>A XP de caça (abates e ondas do Coliseu) e a do Quadro de Recompensas cai a partir de certos levels. Missões e desafios da semana dão a XP cheia.</p>`);
  parts.push(table(["A partir do level", "XP de caça"], XP_STAGES.map((s) => [s.fromLevel, pct(s.mult, 0)])));
  parts.push(`<h2 id="mochila">Mochila</h2>`);
  parts.push(`<p>A mochila se organiza sozinha (pilhas iguais juntam; equipamento, poções, comida, materiais e o resto, nessa ordem) e ganha 1 espaço a cada ${BACKPACK_LEVELS_PER_SLOT} levels, até o teto da vocação:</p>`);
  parts.push(table(["Vocação", "Level 1", "Máximo"], PLAYABLE_VOCATIONS.map((v) => [vocName[v], BACKPACK_BY_VOCATION[v].base, `${BACKPACK_BY_VOCATION[v].max} (lv ${1 + (BACKPACK_BY_VOCATION[v].max - BACKPACK_BY_VOCATION[v].base) * BACKPACK_LEVELS_PER_SLOT})`])));
  return page("experiencia", parts.join("\n"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Cura e poções
// ---------------------------------------------------------------------------------------------------------------------

const formulaText = (f: { base: number; perLevel: number; perMagic: number; variance: number }): string =>
  [fmt(f.base), f.perLevel ? `${fmt(f.perLevel)} × level` : "", f.perMagic ? `${fmt(f.perMagic)} × ML` : ""].filter(Boolean).join(" + ")
  + (f.variance ? ` (±${pct(f.variance, 0)})` : "");
const manaText = (s: SpellDef): string =>
  (s.manaPerLevel ? `${fmt(s.mana)} + ${fmt(s.manaPerLevel)} × level${s.manaMax != null ? ` (máx. ${fmt(s.manaMax)})` : ""}` : fmt(s.mana));
/** Cura média (sem variação) no level, com o ML típico da vocação (estimativa do modelo de balanço). */
const avgHeal = (s: SpellDef, v: Vocation, L: number): number => evalSpellFormula(s.heal!, L, skillEstimate(v, L).magic, () => 0.5);

function curaEPocoes(m: WikiModel): WikiPage {
  const parts: string[] = [];
  const heals = Object.values(SPELLS).filter((s) => s.heal && !s.vocations.every((v) => isHiddenVocation(v))).sort((a, b) => a.level - b.level);
  parts.push(`<p class="lead">Como no Tibia: a Cura cresce com o magic level (ML). Magos curam muito por magia; cavaleiros curam pouco e compensam com as curas próprias e as poções de vida fortes; o paladino fica no meio.</p>`);
  parts.push(`<h2>Magias de cura</h2>`);
  parts.push(table(["Magia", "Palavras", "Vocações", "Level", "Mana", "Recarga", "Cura"], heals.map((s) => [
    spellLink(s.id, D), `<code>${esc(s.words)}</code>`, esc(vocList(s.vocations)), s.level, esc(manaText(s)), esc(duration(s.cooldownMs)),
    esc(formulaText(s.heal!)) + (s.target === "party" ? `<br><small>em você e no grupo a até ${s.radius ?? 0} tiles</small>` : ""),
  ])));
  const levels = [20, 50, 100];
  parts.push(`<h3>Quanto cura, em média</h3>`);
  parts.push(`<p>Cura média sem variação, com o ML típico de cada vocação no level (estimativa usada no balanceamento do jogo) e a vida máxima sem equipamento. Equipamento com bônus de magia aumenta o ML e a cura.</p>`);
  const rows: (string | number)[][] = [];
  for (const s of heals) {
    for (const v of s.vocations) {
      const cells = levels.map((L) => {
        if (L < s.level) return "—";
        const h = avgHeal(s, v, L);
        return `${fmt(h)} <small class="muted">(${pct(h / baseStats(v, L).maxHp, 0)} · ML ${skillEstimate(v, L).magic})</small>`;
      });
      rows.push([spellLink(s.id, D), esc(vocName[v]), ...cells]);
    }
  }
  parts.push(table(["Magia", "Vocação", ...levels.map((L) => `Level ${L}`)], rows));

  parts.push(`<h2 id="pocoes">Poções</h2>`);
  parts.push(`<p>A recarga é uma só para todas as poções: beber uma de vida bloqueia qualquer poção por ${duration(HEALTH_POTION_CD_MS)}; uma de mana, por ${duration(MANA_POTION_CD_MS)}. Poção acima do level não pode ser comprada nem bebida. No jogo, <kbd>Q</kbd> bebe a melhor poção de vida que o level permite e <kbd>E</kbd>, a de mana.</p>`);
  const potions = Object.values(ITEMS).filter((d) => d.kind === "potion").sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
  const priceCell = (d: ItemDef): string => {
    const s = m.soldBy(d.id);
    if (!s.length) return "—";
    const min = Math.min(...s.map((x) => x.price));
    // NPCs repetidos pelo nome (o vendedor de cada uma das 4 arenas) contam uma vez; até 3 links e "+N".
    const byName = new Map<string, string>();
    for (const x of s) if (x.price === min && !byName.has(NPCS[x.npcId]?.name ?? x.npcId)) byName.set(NPCS[x.npcId]?.name ?? x.npcId, x.npcId);
    const ids = [...byName.values()];
    const more = ids.length > 3 ? ` e mais ${ids.length - 3}` : "";
    return `${fmt(min)} <small class="muted">(${ids.slice(0, 3).map((id) => npcLink(id, D)).join(", ")}${more})</small>`;
  };
  parts.push(table(["", "Poção", "Level", "Vocações", "Recupera", "Recarga", "Preço"], potions.map((d) => [
    itemIcon(d, 24), itemLink(d.id, D), d.level ?? 1, esc(vocList(d.vocations)),
    esc([d.use?.heal ? `${fmt(d.use.heal)} de vida` : "", d.use?.mana ? `${fmt(d.use.mana)} de mana` : ""].filter(Boolean).join(" e ")),
    esc(duration(d.use?.cooldownMs ?? 0)), priceCell(d),
  ]), { sortable: true }));

  parts.push(`<h2 id="comida">Comida</h2>`);
  parts.push(`<p>Comer deixa o personagem alimentado: recupera vida e mana a cada ${duration(FOOD_TICK_MS)} pela duração da comida. Comer de novo soma tempo, até ${duration(FOOD_MAX_MS)}.</p>`);
  const foods = Object.values(ITEMS).filter((d) => d.kind === "food" && d.use?.food).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
  parts.push(table(["", "Comida", "Level", "Vida / tique", "Mana / tique", "Duração", "Preço"], foods.map((d) => [
    itemIcon(d, 24), itemLink(d.id, D), d.level ?? 1, d.use!.food!.hpPerTick, d.use!.food!.manaPerTick, esc(duration(d.use!.food!.durationMs)), priceCell(d),
  ]), { sortable: true }));

  parts.push(`<h2 id="regeneracao">Regeneração</h2>`);
  parts.push(`<p>A cada ${duration(REGEN_INTERVAL_MS)}: a vida só regenera fora de combate; a mana regenera sempre, pela metade em combate. Na zona de proteção (templo, vilas) tudo regenera ×3. Itens com regeneração de vida/mana somam ao tique.</p>`);
  parts.push(`<p>Vida por tique: 1 % da vida máxima + level × 0,25 (mín. 1). Mana por tique: 2 % da mana máxima + level × 0,5 (mín. 2).</p>`);
  const regenRows: (string | number)[][] = [];
  for (const L of [10, 30, 60, 100]) {
    for (const v of PLAYABLE_VOCATIONS) {
      const s = baseStats(v, L);
      regenRows.push([L, esc(vocName[v]), regenAmount(s.maxHp, L, false), manaRegenAmount(s.maxMana, L, false, false), manaRegenAmount(s.maxMana, L, true, false)]);
    }
  }
  parts.push(table(["Level", "Vocação", "Vida (fora de combate)", "Mana (fora de combate)", "Mana (em combate)"], regenRows, { sortable: true }));
  return page("cura-e-pocoes", parts.join("\n"), heals.map((s) => `${s.name} ${s.words}`).join(" "));
}

// ---------------------------------------------------------------------------------------------------------------------
// Morte e PvP
// ---------------------------------------------------------------------------------------------------------------------

function morte(): WikiPage {
  const parts: string[] = [];
  parts.push(`<p class="lead">Morrer leva o personagem de volta ao templo com vida e mana cheias. Não se perde item nem equipamento; perde-se uma parte da XP do level, nunca o level.</p>`);
  parts.push(`<h2>XP perdida</h2>`);
  parts.push(`<p>Perde-se uma fração da XP entre o início do level atual e o próximo, conforme a faixa de level. Se o personagem acabou de subir e ainda não tem essa XP acima do início do level, perde só o que tem.</p>`);
  parts.push(table(["A partir do level", "Da XP do level"], DEATH_PENALTY_STAGES.map((s) => [s.fromLevel, pct(s.pct, 0)])));
  const ex = [10, 30, 50, 60, 80, 100, 120];
  parts.push(table(["Level", "Perda", "XP perdida (máx.)", "Bênção"], ex.map((L) => [L, pct(deathPenaltyPct(L), 0), deathPenalty(L, Infinity), `${fmt(blessingPrice(L))} de ouro`])));
  parts.push(`<h2 id="bencao">Bênção</h2>`);
  parts.push(`<p>Comprada com ${npcsWith((id) => !!NPCS[id]!.blessing)}: custa ${fmt(BLESSING_GOLD_PER_LEVEL)} de ouro por level e zera a perda de XP da próxima morte. Só é gasta numa morte em que haveria XP a perder.</p>`);
  parts.push(`<h2>Morrer no Coliseu</h2>`);
  parts.push(`<p>Sem penalidade: quem cai sai da arena com vida cheia e fica com o que já ganhou. Veja ${link("mecanicas/coliseu.html", "Coliseu", D)}.</p>`);
  parts.push(`<h2 id="pvp">PvP e caveiras</h2>`);
  parts.push(`<ul>
<li>Jogadores podem se atacar em qualquer lugar fora da zona de proteção. Dano de jogador em jogador: ${pct(PVP_DAMAGE_MULT, 0)} do normal.</li>
<li>Atacar quem não revidou (e não tem caveira) dá <b>caveira branca</b> por ${duration(PVP_AGGRESSION_MS)} desde o último ataque. Depois de atacar um jogador, não se entra em zona de proteção por ${duration(PZ_LOCK_MS)}.</li>
<li>Matar injustamente ${RED_SKULL_KILLS} vezes em ${duration(RED_SKULL_WINDOW_MS)} dá <b>caveira vermelha</b>: ao morrer, a XP perdida é ${mult(RED_SKULL_DEATH_XP_MULT)} e ${pct(RED_SKULL_GOLD_DROP, 0)} do ouro cai no chão.</li>
</ul>`);
  return page("morte", parts.join("\n"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Grupo
// ---------------------------------------------------------------------------------------------------------------------

function grupo(): WikiPage {
  const priorityMs = serverNumber("systems/ground.ts", "PARTY_LOOT_PRIORITY_MS");
  const groundRarities = [...serverConst("systems/loot.ts", "PARTY_GROUND_RARITIES").matchAll(/"(\w+)"/g)].map((x) => x[1]!);
  const decay = serverConst("systems/ground.ts", "DECAY_MS");
  const decayCommon = /common: ([\d_]+) \* 60_000/.exec(decay)?.[1];
  const decayRare = /rare: ([\d_]+) \* 60_000/.exec(decay)?.[1];
  if (!decayCommon || !decayRare) throw new Error("wiki: formato de DECAY_MS mudou em systems/ground.ts");
  const parts: string[] = [];
  parts.push(`<p class="lead">Convide com o botão direito no jogador (→ Convidar) ou com <code>/convidar nome</code> no chat (<code>/ajuda</code> lista os comandos de grupo). Até ${PARTY_MAX} membros; o convite vale ${duration(PARTY_INVITE_MS)}.</p>`);
  parts.push(`<h2>XP compartilhada</h2>`);
  parts.push(`<ul>
<li>A XP de um abate é dividida entre os membros ativos a até ${PARTY_SHARE_RANGE} tiles do monstro. Ativo = atacou um monstro ou curou alguém do grupo nos últimos ${duration(PARTY_ACTIVE_MS)}.</li>
<li>Cada membro extra soma +${pct(PARTY_SHARE_BONUS, 0)} à XP total; com ${PARTY_VOCATION_BONUS_MIN} ou mais vocações diferentes, mais +${pct(PARTY_VOCATION_BONUS, 0)}.</li>
<li>Regra de level: o menor level precisa ser pelo menos 2/3 do maior, senão a XP não é compartilhada.</li>
</ul>`);
  const solo = 1000;
  parts.push(`<p>Um monstro de ${fmt(solo)} XP, por pessoa:</p>`);
  parts.push(table(["Membros", "Cada um", "Cada um (3+ vocações)", "Total do grupo"], [1, 2, 3, 4, 5, 6, 8].map((n) => [
    n, partyShareEach(solo, n), n >= PARTY_VOCATION_BONUS_MIN ? partyShareEach(solo, n, PARTY_VOCATION_BONUS_MIN) : "—", partyShareEach(solo, n) * n,
  ])));
  parts.push(table(["Maior level", "Menor level aceito"], [20, 30, 45, 60, 90, 120].map((L) => [L, partyMinLevel(L)])));
  parts.push(`<h2 id="loot">Loot do grupo</h2>`);
  parts.push(`<ul>
<li>O ouro do abate é dividido em partes iguais entre quem participou (o resto da divisão fica com quem matou).</li>
<li>Itens ${esc(["common", "uncommon", "rare", "epic", "legendary"].filter((r) => !groundRarities.includes(r)).map((r) => RARITY_LABEL[r as keyof typeof RARITY_LABEL].toLowerCase()).join(" e "))} vão em rodízio para a mochila de quem participou (quem está sem espaço é pulado).</li>
<li>Itens ${esc(groundRarities.map((r) => RARITY_LABEL[r as keyof typeof RARITY_LABEL].toLowerCase()).join(", "))} caem no chão onde o monstro morreu, reservados ao grupo por ${duration(priorityMs)}, para o grupo decidir quem leva; depois ficam livres para qualquer um.</li>
<li>Item no chão some em ${decayCommon} min (comum e incomum) ou ${decayRare} min (raro ou melhor).</li>
</ul>`);
  return page("grupo", parts.join("\n"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Coliseu
// ---------------------------------------------------------------------------------------------------------------------

function coliseu(): WikiPage {
  const parts: string[] = [];
  const master = Object.keys(NPCS).find((id) => id === "arena_master");
  parts.push(`<p class="lead">Ondas de monstros para o grupo (ou sozinho), em ${ARENA_COUNT} arenas paralelas. Forme o lobby com ${master ? npcLink(master, D) : "o mestre do Coliseu"} na Vila (todos a até ${ARENA_LOBBY_RANGE} tiles dele) e comece.</p>`);
  parts.push(`<ul>
<li>${ARENA_MAX_WAVE} ondas; a cada ${ARENA_BOSS_EVERY} vem uma onda-chefe. Entre ondas comuns há ${duration(ARENA_BREAK_MS)} de respiro; depois de cada onda-chefe, ${duration(ARENA_SHOP_PAUSE_MS)} de pausa com o vendedor da arena (todos clicando em "Pronto" encurta).</li>
<li>No fim de cada onda todos recuperam ${pct(ARENA_PAUSE_HEAL, 0)} da vida e da mana.</li>
<li>Recompensa paga a cada onda vencida: a XP dos monstros da onda ${mult(ARENA_XP_MULT)}, dividida pelos vivos (com o estágio de XP), e ouro para cada sobrevivente.</li>
<li>Onda ${ARENA_MILESTONE_WAVE}: marco de ${fmt(ARENA_MILESTONE_GOLD)} de ouro. Completar as ${ARENA_MAX_WAVE}: mais ${fmt(ARENA_COMPLETE_GOLD)} de ouro e ${pct(ARENA_COMPLETE_XP_PCT, 0)} da XP ganha na partida (para quem está na faixa de level do grupo: pelo menos 2/3 do maior).</li>
<li>Morrer na arena não tem penalidade: o personagem sai com vida cheia e fica com o que já ganhou.</li>
<li>O grupo do melhor tempo das ${ARENA_MAX_WAVE} ondas na semana leva o título <b>${esc(TITLES.campeao_coliseu ?? "Campeão do Coliseu")}</b> na semana seguinte.</li>
</ul>`);

  parts.push(`<h2 id="mods">Modificador da semana</h2>`);
  parts.push(`<p>Das ondas ${ARENA_MOD_FROM_WAVE} a ${ARENA_MAX_WAVE}, vale o modificador da semana (segunda a domingo), em rodízio fixo. A recompensa não muda.</p>`);
  parts.push(table(["", "Modificador", "Efeito"], ARENA_MOD_ORDER.map((id) => [esc(ARENA_MODS[id].icon), `<b>${esc(ARENA_MODS[id].name)}</b>`, esc(ARENA_MODS[id].desc)])));
  parts.push(`<p>Próximas semanas: ${nextWeeks(6).map((w) => `${ddmm(w.monday)} ${esc(ARENA_MODS[arenaWeekMod(w.id)].name)}`).join(" · ")}.</p>`);

  parts.push(`<h2 id="ondas">Ondas</h2>`);
  parts.push(`<p>Monstros para 1 jogador (o grupo traz mais monstros comuns; elites e chefes ganham vida). "Level" é o level justo para a onda sozinho. Ouro por sobrevivente ao vencer a onda.</p>`);
  parts.push(table(["Onda", "Level", "Monstros", "Ouro"], ARENA_WAVES.map((w) => [
    w.boss ? `<b>${w.wave}</b> <span class="tag boss">chefe</span>` : String(w.wave),
    w.level,
    w.monsters.map((e) => {
      const d = MONSTERS[e.id];
      if (e.elite !== undefined) return d?.boss ? `${monsterLink(e.id, D)} <small class="muted">(chefe)</small>` : `${monsterLink(e.id, D)} <small class="muted">(elite, vida ${mult(e.elite)})</small>`;
      return `${e.count}× ${monsterLink(e.id, D)}`;
    }).join(", "),
    arenaWaveGold(w.wave),
  ]), { sortable: true }));
  return page("coliseu", parts.join("\n"), Object.values(ARENA_MODS).map((x) => x.name).join(" "));
}

// ---------------------------------------------------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------------------------------------------------

function eventos(m: WikiModel): WikiPage {
  const parts: string[] = [];
  parts.push(`<p class="lead">Toda semana, no horário do servidor (Brasília). No jogo: botão <b>Agenda</b> no trilho à direita, ou <code>/agenda</code> e <code>/evento</code> no chat. Aviso 10 minutos antes.</p>`);
  const evs = [...WEEKLY_EVENTS].sort((a, b) => (a.day + 6) % 7 - (b.day + 6) % 7 || a.hour - b.hour || (a.minute ?? 0) - (b.minute ?? 0));
  parts.push(table(["Dia", "Horário", "Evento", "Bônus", "Chefe"], evs.map((e) => {
    const start = e.hour * 60 + (e.minute ?? 0), end = start + e.durationMin;
    const bossZone = e.boss ? m.spawnsOf(e.boss)[0]?.zone : undefined;
    return [
      `<span data-sort="${(e.day + 6) % 7}">${DAY_NAME[e.day]}</span>`,
      `<span data-sort="${start}">${hhmm(e.hour, e.minute)}–${hhmm(Math.floor(end / 60) % 24, end % 60)}</span>`,
      `<b>${esc(e.name)}</b><br><small>${esc(e.desc)}</small>`,
      esc(eventBonusText(e) || (e.invasion ? "Baú de Recompensa" : "—")),
      e.boss ? `${monsterLink(e.boss, D)}${bossZone ? `<br><small>${zoneLink(bossZone, D)}</small>` : ""}` : "—",
    ];
  }), { sortable: true }));
  parts.push(`<p>Bônus de loot multiplica a chance de cada item (nunca passa de 100 %). O chefe do evento aparece no covil dele no começo da janela, se não houver um vivo.</p>`);

  parts.push(`<h2 id="invasao">Invasão da Vila</h2>`);
  parts.push(`<p>Monstros saem de 4 pontos em volta da ${zoneLink("Vila de Pedra Clara", D)} em ${INVASION_WAVES.length} ondas e marcham até a borda da zona de proteção. Cada onda traz ${INVASION_BASE} invasores da faixa baixa mais ${INVASION_PER_PLAYER} por jogador presente, da faixa dele (no máximo ${INVASION_MAX_ALIVE} vivos); a última onda traz um líder elite.</p>`);
  parts.push(table(["Faixa (level)", "Invasores", "Líder"], INVASION_TIERS.map((t) => [
    t.maxLevel >= 9999 ? `${t.minLevel}+` : `${t.minLevel}–${t.maxLevel}`, t.monsters.map((id) => monsterLink(id, D)).join(", "), monsterLink(t.leader, D),
  ])));
  parts.push(`<p>Quem contribuir (dano nos invasores e cura em outros jogadores, mínimo ${INVASION_MIN_POINTS} pontos) ganha ${INVASION_CHESTS} ${itemLink(BOUNTY_CHEST_ID, D)}; mais ${INVASION_DEFENDED_BONUS} se a Vila for defendida (${pct(INVASION_DEFEND_PCT, 0)} dos invasores derrotados e o líder abatido).</p>`);
  return page("eventos", parts.join("\n"), WEEKLY_EVENTS.map((e) => e.name).join(" "));
}

// ---------------------------------------------------------------------------------------------------------------------
// Quadro de Recompensas
// ---------------------------------------------------------------------------------------------------------------------

function recompensas(): WikiPage {
  // O sorteio é do servidor (systems/bounties.ts, determinístico por dia + faixa): percorrer muitos dias mostra
  // exatamente as quantidades, XP e ouro que podem sair, sem copiar a regra.
  const seen = BOUNTY_BANDS.map(() => new Map<string, { counts: Set<number>; xp: number[]; gold: number[] }>());
  const d0 = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 1500; i++) {
    const day = new Date(d0 + i * 86_400_000).toISOString().slice(0, 10);
    BOUNTY_BANDS.forEach((_, band) => {
      for (const b of generateBounties(day, band)) {
        const e = seen[band]!.get(b.monster) ?? { counts: new Set(), xp: [], gold: [] };
        e.counts.add(b.count); e.xp.push(b.xp); e.gold.push(b.gold);
        seen[band]!.set(b.monster, e);
      }
    });
  }
  const range = (l: number[]) => { const a = Math.min(...l), b = Math.max(...l); return a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`; };
  const parts: string[] = [];
  parts.push(`<p class="lead">No ${npcLink(BOUNTY_NPC, D)}: ${BOUNTIES_PER_DAY} tarefas de caça por dia, sorteadas pela faixa do seu level (iguais para todos da faixa). A lista troca às ${hhmm(BOUNTY_RESET_HOUR)} (Brasília).</p>`);
  parts.push(`<p>Cada tarefa cumprida dá XP igual à dos próprios abates (com o ${link("mecanicas/experiencia.html#estagios", "estágio de XP", D)}), ouro e 1 ${itemLink(BOUNTY_CHEST_ID, D)}${ITEMS[BOUNTY_CHEST_ID]?.description ? ` <small class="muted">(${esc(ITEMS[BOUNTY_CHEST_ID]!.description!)})</small>` : ""}.</p>`);
  BOUNTY_BANDS.forEach((b, band) => {
    const next = BOUNTY_BANDS[band + 1]?.minLevel;
    parts.push(`<h2 id="faixa-${b.minLevel}">Level ${b.minLevel}${next ? `–${next - 1}` : "+"}</h2>`);
    parts.push(table(["Criatura", "Quantidade", "XP (antes do estágio)", "Ouro"], b.monsters.map((id) => {
      const e = seen[band]!.get(id);
      return [monsterLink(id, D), e ? esc([...e.counts].sort((x, y) => x - y).join(", ")) : "—", e ? range(e.xp) : "—", e ? range(e.gold) : "—"];
    })));
  });
  return page("recompensas", parts.join("\n"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Desafios da semana
// ---------------------------------------------------------------------------------------------------------------------

const GROUP_NAME = ["Caça", "Convívio", "Folga"] as const;
const POTION_NAME = { heal: "poções de vida", mana: "poções de mana" } as const;

function desafios(): WikiPage {
  const parts: string[] = [];
  // Meta fixa ou função do level do começo da semana (a de XP: um level inteiro); a função mostra dois exemplos.
  const goal = (c: ChallengeDef) => (typeof c.target === "number"
    ? esc(c.desc.replace("{n}", fmt(c.target)))
    : `${esc(c.desc.replace("{n} de XP", "a XP de 1 level").replace("{n}", "1 level"))} <small class="muted">(lv 1: ${fmt(challengeTarget(c, 1))}; lv 50: ${fmt(challengeTarget(c, 50))})</small>`);
  parts.push(`<p class="lead">Toda segunda-feira saem ${CHALLENGES_PER_WEEK} desafios, um de cada grupo, iguais para todos. O progresso conta desde segunda; o que foi cumprido e não resgatado é entregue sozinho na virada da semana.</p>`);
  parts.push(`<p>O ouro do prêmio é o valor da tabela × (1 + 10 % por level acima do 1, pelo level do começo da semana); a poção é a maior que o level já pode beber. Resgatando os ${CHALLENGES_PER_WEEK}, bônus de ${fmt(CHALLENGE_BONUS_PRIZE.gold)} de ouro (mesma escala), ${CHALLENGE_BONUS_PRIZE.potion ? `${CHALLENGE_BONUS_PRIZE.potion.count} ${POTION_NAME[CHALLENGE_BONUS_PRIZE.potion.kind]}` : ""} e XP de ${pct(CHALLENGE_BONUS_XP_PCT, 0)} do level (mín. 200).</p>`);
  parts.push(table(["Grupo", "Desafio", "Meta", "Ouro (lv 1)", "Ouro (lv 50)", "Poções"], CHALLENGES.map((c) => [
    GROUP_NAME[c.group], `<b>${esc(c.name)}</b>`, goal(c), c.prize.gold, challengeGold(c.prize.gold, 50),
    c.prize.potion ? `${c.prize.potion.count} ${POTION_NAME[c.prize.potion.kind]}` : "—",
  ])));
  parts.push(`<h2>Próximas semanas</h2>`);
  parts.push(table(["Semana de", "Desafios"], nextWeeks(6).map((w) => [ddmm(w.monday), weekChallenges(w.id).map((c) => esc(c.name)).join(" · ")])));
  return page("desafios", parts.join("\n"), CHALLENGES.map((c) => c.name).join(" "));
}

// ---------------------------------------------------------------------------------------------------------------------
// Refino
// ---------------------------------------------------------------------------------------------------------------------

function refino(): WikiPage {
  const parts: string[] = [];
  parts.push(`<p class="lead">Com ${npcLink(REFINE_NPC, D)}: armas e armaduras de tier 5 em diante (level ${REFINE_TIER_LEVEL[5]}+) vão de +1 a +${REFINE_MAX}. Cada nível dá +${REFINE_ATTACK_PER_LEVEL} de ataque (arma) ou +${REFINE_ARMOR_PER_LEVEL} de armadura (elmo, armadura, calças, botas, escudo).</p>`);
  parts.push(`<p>Cada tentativa custa ouro e 1 gema do tier, e pode falhar: a falha não destrói nem rebaixa o item, só consome o custo. Anéis, amuletos e livros de magia não são refinados. Do +${REFINE_EXTRA_FROM} em diante, os tiers 7 e 8 pedem também um material das regiões novas. "Vender tudo" no NPC nunca vende item refinado.</p>`);
  parts.push(table(["Nível", "Chance de falha", ...REFINE_TIERS.map((t) => `Tier ${t} (lv ${REFINE_TIER_LEVEL[t]}+)`)],
    Array.from({ length: REFINE_MAX }, (_, i) => [
      `+${i + 1}`, pct(REFINE_FAIL_CHANCE[i]!, 0),
      ...REFINE_TIERS.map((t) => `${fmt(REFINE_BASE_GOLD[t] * REFINE_GOLD_MULT[i]!)} de ouro`),
    ])));
  parts.push(table(["Tier", "Gema (toda tentativa)", `Extra (+${REFINE_EXTRA_FROM} e +${REFINE_MAX})`, `Ouro esperado do +0 ao +${REFINE_MAX}`], REFINE_TIERS.map((t) => [
    `Tier ${t}`, itemCell(REFINE_MATERIAL[t]), REFINE_EXTRA[t] ? `${itemCell(REFINE_EXTRA[t]!)} <small class="muted">(~${fmt(Math.round(refineExpectedExtra() * 10) / 10)} em média)</small>` : "—",
    Math.round(refineExpectedGold(t)),
  ])));
  parts.push(`<h2>Itens refináveis</h2>`);
  for (const t of REFINE_TIERS) {
    const list = Object.values(ITEMS).filter((d) => refineTier(d) === t).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
    parts.push(`<h3>Tier ${t} <small class="muted">(${list.length})</small></h3>`);
    parts.push(`<p class="item-grid">${list.map((d) => `<span>${itemIcon(d, 20)} ${itemLink(d.id, D)}</span>`).join("")}</p>`);
  }
  return page("refino", parts.join("\n"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Encantamento
// ---------------------------------------------------------------------------------------------------------------------

function encantamento(): WikiPage {
  const parts: string[] = [];
  parts.push(`<p class="lead">Com ${npcsWith((id) => !!NPCS[id]!.imbuement)}: um efeito ativo por personagem (não por arma), em 3 tiers. Dura ${duration(IMBUE_DURATION_MS)} de combate contra monstros: o relógio só anda enquanto você luta (não no boneco de treino nem no PvP). Aviso quando faltam ${duration(IMBUE_WARN_MS)}. Comprar de novo volta a ${duration(IMBUE_DURATION_MS)} (não soma).</p>`);
  parts.push(`<p>Vale no ataque automático contra monstros; em magia, os drenos e o Perfurante valem ${pct(IMBUE_SPELL_MULT, 0)}.</p>`);
  const rows: (string | number)[][] = [];
  for (const e of IMBUEMENT_EFFECTS) {
    for (const t of IMBUEMENT_TIERS) {
      const d = IMBUEMENTS[e].tiers[t];
      rows.push([`<b>${esc(imbuementName(e, t))}</b>`, esc(imbuementDesc(e, t)), d.minLevel || "—", d.goldPrice, mats(imbuementMaterials(d))]);
    }
  }
  parts.push(table(["Encantamento", "Efeito", "Level", "Ouro", "Materiais"], rows));
  return page("encantamento", parts.join("\n"), IMBUEMENT_EFFECTS.map((e) => IMBUEMENTS[e].name).join(" "));
}

// ---------------------------------------------------------------------------------------------------------------------
// Tingimento
// ---------------------------------------------------------------------------------------------------------------------

function tingimento(): WikiPage {
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  const parts: string[] = [];
  parts.push(`<p class="lead">Na janela de roupas (<kbd>O</kbd>): cada tom custa ${fmt(OUTFIT_TONE_PRICE)} de ouro, é comprado uma vez por conta e vale para todos os personagens dela. Recolore a roupa inteira (com os addons) preservando o brilho; a pele fica natural. Puramente cosmético.</p>`);
  parts.push(`<ul class="swatches">${OUTFIT_TONES.map((t) => `<li><span style="background:${hex(t.color)}"></span>${esc(t.name)}</li>`).join("")}</ul>`);
  return page("tingimento", parts.join("\n"), OUTFIT_TONES.map((t) => t.name).join(" "));
}

// ---------------------------------------------------------------------------------------------------------------------
// Conquistas e títulos
// ---------------------------------------------------------------------------------------------------------------------

function conquistas(): WikiPage {
  const parts: string[] = [];
  const reward = (ids: readonly string[] | undefined) => (ids?.length ? ids.map((id) => esc(unlockText(id))).join("<br>") : "—");
  parts.push(`<p class="lead">${ACHIEVEMENTS.length} conquistas, ${fmt(TOTAL_ACHIEVEMENT_POINTS)} pontos no total. No jogo: <kbd>J</kbd>. As secretas só mostram o que pedem depois de concluídas.</p>`);
  parts.push(table(["", "Conquista", "Requisito", "Pontos", "Recompensa"], ACHIEVEMENTS.map((a) => a.hidden
    ? ["❔", "<i>Secreta</i>", "<i>descubra jogando</i>", a.points, "—"]
    : [esc(a.icon), `<b>${esc(a.name)}</b>${a.rare ? ' <span class="tag gold">rara</span>' : ""}`, esc(a.desc), a.points, reward(a.rewards)]), { sortable: true }));

  // Títulos: de onde vem cada um (conquista, missão ou baú de quest); os rotativos são do ranking da semana.
  parts.push(`<h2 id="titulos">Títulos</h2>`);
  const sources = new Map<string, string[]>();
  const add = (id: string, src: string) => { const l = sources.get(id) ?? []; l.push(src); sources.set(id, l); };
  for (const a of ACHIEVEMENTS) for (const r of a.rewards ?? []) if (r.startsWith("title:")) add(r.slice(6), a.hidden ? "conquista secreta" : `conquista <b>${esc(a.name)}</b>`);
  for (const q of QUEST_LIST) if (q.rewards.unlock?.startsWith("title:")) add(q.rewards.unlock.slice(6), `missão ${questLink(q.id, D)}`);
  for (const c of Object.values(QUEST_CHESTS)) {
    if (!c.unlock?.startsWith("title:")) continue;
    const src = `baú da quest <b>${esc(QUEST_CHEST_GROUPS[c.group]?.name ?? c.group)}</b>`;
    if (!sources.get(c.unlock.slice(6))?.includes(src)) add(c.unlock.slice(6), src);
  }
  add("campeao_semana", "rotativo: líder de uma categoria do ranking semanal, até a segunda seguinte");
  add("campeao_coliseu", "rotativo: grupo do melhor tempo do Coliseu na semana");
  parts.push(table(["Título", "Como conseguir"], Object.entries(TITLES).map(([id, text]) => [`<b>${esc(text)}</b>`, sources.get(id)?.join("; ") ?? "—"])));
  return page("conquistas", parts.join("\n"), Object.values(TITLES).join(" "));
}


// ---------------------------------------------------------------------------------------------------------------------
// Atalhos e controles (a tabela "Ação | Controle" do README)
// ---------------------------------------------------------------------------------------------------------------------

/** Markdown de uma célula do README: `código` → <kbd>, **negrito**, *itálico*. */
const md = (s: string): string => esc(s.replace(/\\\|/g, "|"))
  .replace(/`([^`]+)`/g, "<kbd>$1</kbd>")
  .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
  .replace(/\*([^*]+)\*/g, "<i>$1</i>");

function atalhos(): WikiPage {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8").split(/\r?\n/);
  const start = readme.findIndex((l) => /^\|\s*Ação\s*\|\s*Controle\s*\|/.test(l));
  if (start < 0) throw new Error("wiki: não achei a tabela \"| Ação | Controle |\" no README.md");
  const rows: string[][] = [];
  for (let i = start + 2; i < readme.length && readme[i]!.startsWith("|"); i++) {
    rows.push(readme[i]!.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => md(c.trim())));
  }
  const parts: string[] = [];
  parts.push(`<p class="lead">Os controles do jogo, como no README. No jogo, <kbd>F1</kbd> ou <kbd>?</kbd> mostra a cola de atalhos.</p>`);
  parts.push(table(["Ação", "Controle"], rows, { class: "controls" }));
  return page("atalhos-e-controles", parts.join("\n"), rows.map((r) => r[0]).join(" "));
}

// ---------------------------------------------------------------------------------------------------------------------

export function render(m: WikiModel): WikiPage[] {
  const pages = [
    vocacoes(), experiencia(), curaEPocoes(m), morte(), grupo(), coliseu(), eventos(m), recompensas(), desafios(), refino(),
    encantamento(), tingimento(), conquistas(), atalhos(),
  ];
  const index: WikiPage = {
    path: "mecanicas/index.html", title: "Mecânicas",
    body: `<h1>Mecânicas</h1>
<p class="lead">Como o jogo funciona por dentro, com os números do próprio código.</p>
<ul class="mech-list">
${MECHANICS.map((x) => `<li>${link(`mecanicas/${x.slug}.html`, x.title, D)} <small class="muted">${esc(x.blurb)}</small></li>`).join("\n")}
</ul>
<p>Viagem de carroça e barco: grátis até o level ${TRAVEL_FREE_LEVEL}; os preços estão nas páginas das ${link("mapa/index.html", "zonas", D)} e dos NPCs.</p>`,
    search: [{ title: "Mecânicas", kind: "Mecânica", text: "como funciona regras" }],
  };
  return [index, ...pages];
}
