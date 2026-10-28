// Criaturas da wiki: lista de todas (ordenável) com os chefes à parte e uma página por criatura, no tom do TibiaWiki:
// atributos, resistências, habilidades, loot, onde nasce e onde mais aparece (missões, eventos, Coliseu, Invasão).
// "Resiste a / Fraco contra" e a lista principal seguem as regras do Bestiário do jogo (client/ui/bestiary/
// bestiaryLogic.ts): a wiki mostra o mesmo texto que o jogador vê ao abrir o Bestiário.
import {
  ARENA_WAVES, BASE_STEP_MS, BOSS_ROOT_SLOW_PCT, BOSS_SLOW_MULT, ELITE, ELITE_CHANCE, HEAL_ALLIES_LOCKOUT_MS, HELP_RADIUS,
  INVASION_TIERS, MAGIC_ARMOR_FACTOR, QUEST_CHEST_GROUPS, QUEST_LEVERS, SPELLS, WEEKLY_EVENTS, canBeElite,
  TARGETING_LABEL, damageTakenMult, monsterResistances, monsterTargeting, summonScaled,
  type DamageKind, type MonsterAbility, type MonsterDef,
} from "../../../packages/shared/src/index.ts";
import { DOT_INTERVAL_MS, DOT_LABEL } from "../../../packages/server/src/systems/conditions.ts";
import { elementLines } from "../../../packages/client/src/ui/bestiary/bestiaryLogic.ts";
import {
  creatureIcon, duration, esc, fmt, itemIcon, itemLink, kindBadge, kindName, link, monsterLink, npcLink, pct, questLink,
  slug, spellLink, table, vocList, zoneLink,
  type WikiPage,
} from "../html.mts";
import type { WikiModel } from "../model.mts";

const D = 1; // todas as páginas desta seção ficam em criaturas/

/** Elementos na ordem da linha de resistências (a mesma lista de monsterResistances). */
const ELEMENTS: DamageKind[] = ["physical", "fire", "ice", "energy", "earth", "holy", "death"];
const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;
/** Acima disto (ms por passo) dá para fugir andando de qualquer level; até BASE_STEP_MS alcança o jogador lv 1. */
const SLOW_STEP_MS = 400;

/** Entra na lista principal: o mesmo filtro do Bestiário (sem bonecos de treino e invocações de jogador). */
const listed = (d: MonsterDef): boolean => !d.invulnerable && d.xp > 0;
/** Magia que invoca a criatura como aliada do jogador (Lobo Espiritual). */
const summonSpellOf = (id: string) => Object.values(SPELLS).find((s) => s.summon?.monsterId === id);
/** Levels de quem invoca mostrados na escala da invocação. */
const SUMMON_SAMPLE_LEVELS = [50, 100];

const range = (a: number, b: number): string => (a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`);
const levelsText = (l: { min: number; max: number }): string => (l.min === l.max ? `lv ${l.min}` : `lv ${l.min}–${l.max}`);
const bossTag = '<span class="tag boss">chefe</span>';
const clock = (h: number, m: number): string => `${h % 24}h${m ? String(m).padStart(2, "0") : ""}`;

function speedText(stepMs: number): string {
  const label = stepMs <= BASE_STEP_MS ? "rápido" : stepMs <= SLOW_STEP_MS ? "normal" : "lento";
  return `${label} (${fmt(stepMs)} ms por passo)`;
}

/** Zonas onde a criatura nasce, da que tem mais exemplares para a que tem menos. */
function zonesOf(m: WikiModel, id: string): { zone: string; points: { x: number; y: number; count: number }[]; total: number }[] {
  const by = new Map<string, { x: number; y: number; count: number }[]>();
  for (const s of m.spawnsOf(id)) {
    const l = by.get(s.zone) ?? [];
    l.push({ x: s.x, y: s.y, count: s.count });
    by.set(s.zone, l);
  }
  return [...by].map(([zone, points]) => ({ zone, points, total: points.reduce((n, p) => n + p.count, 0) }))
    .sort((a, b) => b.total - a.total || a.zone.localeCompare(b.zone, "pt-BR"));
}

const zoneLinks = (m: WikiModel, id: string): string => {
  const zs = zonesOf(m, id).filter((z) => z.zone);
  return zs.length ? zs.map((z) => zoneLink(z.zone, D)).join(", ") : '<span class="muted">não nasce solto no mapa</span>';
};

// ---------------------------------------------------------------------------------------------------------------------
// Habilidades
// ---------------------------------------------------------------------------------------------------------------------

/** "dano físico", "dano de fogo", "dano sagrado". */
const damageOf = (k: DamageKind): string =>
  (k === "physical" ? "dano físico" : k === "holy" ? "dano sagrado" : `dano de ${kindName[k].toLowerCase()}`);

/** Lado da área quadrada de raio r (mesmo círculo das magias: r = 1 → 3×3). */
const side = (r: number) => 2 * r + 1;

function abilityText(d: MonsterDef, a: MonsterAbility): string {
  const parts: string[] = [];
  const reach = a.range ?? d.attackRange;
  if (a.shape === "target") parts.push(`Projétil no alvo (alcance ${reach})`);
  else if (a.shape === "area_self") parts.push(`Área em volta de si (${side(a.radius ?? 1)}×${side(a.radius ?? 1)})`);
  else if (a.shape === "area_target") parts.push(`Área no alvo (${side(a.radius ?? 1)}×${side(a.radius ?? 1)}, alcance ${reach})`);
  else if (a.shape === "wave") parts.push(`Onda à frente (${a.length ?? 1} de comprimento, até ${a.width ?? 1} de largura)`);
  if (a.damage) parts.push(`${range(a.damage.min, a.damage.max)} de ${damageOf(a.damage.kind)}`);
  if (a.condition) {
    const c = a.condition;
    parts.push(c.id === "slow"
      ? `deixa lento (−${c.value} % de velocidade por ${duration(c.durationMs)})`
      : `causa ${esc(DOT_LABEL[c.id] ?? c.id)} (${fmt(c.value)} de dano a cada ${duration(DOT_INTERVAL_MS)} por ${duration(c.durationMs)})`);
  }
  if (a.heal) parts.push(`Cura ${pct(a.heal.pct, 0)} da própria vida quando está abaixo de ${pct(a.heal.belowHpPct, 0)}`);
  if (a.healAllies) {
    const h = a.healAllies;
    parts.push(`Cura ${pct(h.pct, 0)} da vida de cada aliado a até ${h.radius} tiles (inclusive ele mesmo) quando algum está abaixo de ${pct(h.belowHpPct, 0)}; cada monstro recebe essa cura no máximo 1 vez a cada ${duration(HEAL_ALLIES_LOCKOUT_MS)}`);
  }
  if (a.summon) {
    const s = a.summon;
    parts.push(`Invoca ${s.count} × ${monsterLink(s.monsterId, D)} (no máximo ${s.max} vivos; somem com o invocador e não dão XP nem loot)`);
  }
  if (a.windupMs) parts.push(`aviso no chão de ${duration(a.windupMs)} antes do golpe (dá para sair)`);
  const extra = [`Recarga de ${duration(a.cooldownMs)}`];
  if (a.chance !== undefined && a.chance < 1) extra.push(`${pct(a.chance, 0)} de chance por turno quando pronta`);
  return `${parts.join("; ")}. <span class="muted">${extra.join(", ")}.</span>`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Outras aparições (o que existe nos dados: eventos, Coliseu, Invasão, alavancas, covis e invocações)
// ---------------------------------------------------------------------------------------------------------------------

function appearances(m: WikiModel, d: MonsterDef): string[] {
  const out: string[] = [];
  for (const e of WEEKLY_EVENTS.filter((x) => x.boss === d.id)) {
    const start = e.hour * 60 + (e.minute ?? 0), end = start + e.durationMin;
    out.push(`<b>Evento semanal “${esc(e.name)}”</b>: ${WEEKDAY[e.day]}, das ${clock(e.hour, e.minute ?? 0)} às ${clock(Math.floor(end / 60), end % 60)}. ${esc(e.desc)}. No começo do evento o chefe é convocado no spawn dele, se não houver um vivo.`);
  }
  for (const g of Object.values(QUEST_CHEST_GROUPS).filter((x) => x.needBoss === d.id)) {
    out.push(`<b>Covil</b>: derrotá-lo destranca os baús de “${esc(g.name)}” (${esc(g.where)}, lv ${g.minLevel}+). Vale o abate de quem bateu perto do chefe e do grupo perto dele; Coliseu e invocações não contam.`);
  }
  const waves = ARENA_WAVES.filter((w) => w.monsters.some((x) => x.id === d.id));
  if (waves.length) {
    const txt = waves.map((w) => {
      const e = w.monsters.find((x) => x.id === d.id)!;
      return e.elite && w.boss ? `${w.wave} (chefe da onda${e.elite > 1 ? `, vida ×${fmt(e.elite)}` : ""})` : String(w.wave);
    });
    out.push(`<b>Coliseu</b>: ${waves.length === 1 ? "onda" : "ondas"} ${txt.join(", ")}.`);
  }
  const invasion = INVASION_TIERS.flatMap((t) => {
    const lv = t.maxLevel >= 9999 ? `lv ${t.minLevel}+` : `lv ${t.minLevel}–${t.maxLevel}`;
    return t.leader === d.id ? [`líder das ondas da faixa ${lv}`] : t.monsters.includes(d.id) ? [`aparece nas ondas da faixa ${lv}`] : [];
  });
  if (invasion.length) out.push(`<b>Invasão da Vila</b>: ${invasion.join("; ")}.`);
  for (const l of Object.values(QUEST_LEVERS)) {
    const n = l.monsters.filter((x) => x === d.id).length;
    if (n) out.push(`<b>Sala da alavanca “${esc(l.name)}”</b> (lv ${l.minLevel}+, ${l.minPlayers} a ${l.players} jogadores): até ${n} com o grupo cheio. Dá XP e loot normais, sem respawn.`);
  }
  for (const s of m.monsters) {
    for (const a of s.abilities ?? []) {
      if (a.summon?.monsterId === d.id) out.push(`<b>Invocado por</b> ${monsterLink(s.id, D)} (“${esc(a.name)}”): sem XP nem loot.`);
    }
  }
  const sp = summonSpellOf(d.id);
  if (sp) out.push(`<b>Invocado pela magia</b> ${spellLink(sp.id, D)} (${esc(vocList(sp.vocations))}, lv ${sp.level}), por ${duration(sp.summon!.durationMs)}. Fica mais forte com o level de quem invoca.`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Página de uma criatura
// ---------------------------------------------------------------------------------------------------------------------

function creaturePage(m: WikiModel, d: MonsterDef): WikiPage {
  const zones = zonesOf(m, d.id);
  const parts: string[] = [];
  const inert = !!(d.invulnerable || d.stationary);
  // Invocação de jogador: segue o dono, some no fim da magia e não solta nada; percepção, fuga e respawn não valem.
  const ally = !!summonSpellOf(d.id);
  const el = elementLines(monsterResistances(d));

  // Infobox: só valores curtos (cabe na coluna de 300 px); as explicações vão para "Comportamento".
  const box: [string, string][] = [["Level", fmt(d.level)]];
  box.push(["Vida", d.invulnerable ? "infinita" : fmt(d.hp)]);
  box.push(["XP", d.xp > 0 ? fmt(d.xp) : "nenhuma"]);
  if (!inert) {
    box.push(["Dano", range(d.damage[0], d.damage[1])]);
    box.push(["Elemento", kindBadge(d.damageKind)]);
  }
  box.push(["Armadura", fmt(d.armor)]);
  if (!inert) {
    box.push(["Alcance", d.attackRange > 1 ? `à distância (${d.attackRange})` : "corpo a corpo"]);
    box.push(["Ataque", `a cada ${duration(d.attackMs)}`]);
    box.push(["Velocidade", speedText(d.stepMs)]);
  }
  if (!inert && !ally) {
    box.push(["Percepção", d.aggroRange > 0 ? `${d.aggroRange} tiles` : "passivo"]);
    if (d.aggroRange > 0) box.push(["Alvo", esc(TARGETING_LABEL[monsterTargeting(d)])]);
    box.push(["Foge com", d.fleeAtHpPct > 0 ? `${pct(d.fleeAtHpPct, 0)} da vida` : "não foge"]);
    box.push(["Respawn", d.invulnerable || d.respawnMs <= 0 ? "não renasce" : duration(d.respawnMs)]);
  }
  box.push(["Morto-vivo", d.undead ? "sim" : "não"]);
  if (!d.invulnerable) {
    if (el.resists) box.push(["Resiste a", esc(el.resists)]);
    if (el.weak) box.push(["Fraco contra", esc(el.weak)]);
  }
  parts.push(`<aside class="infobox"><div class="portrait">${creatureIcon(d, 64)}</div><h3>${esc(d.name)}</h3>`
    + `<dl>${box.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></aside>`);

  const where = zones.some((z) => z.zone) ? ` que vive em ${zoneLinks(m, d.id)}` : ", que não nasce solto no mapa";
  parts.push(`<h1>${esc(d.name)}${d.boss ? ` ${bossTag}` : ""}</h1>`);
  parts.push(`<p class="lead">${esc(d.name)} é ${d.boss ? "um chefe" : "uma criatura"} de level ${d.level}${where}.${inert
    ? " Fica parado e não perde vida (o dano só aparece como número): serve para treinar, sem XP nem loot."
    : ` Ataca ${d.attackRange > 1 ? `à distância, até ${d.attackRange} tiles,` : "corpo a corpo"} com ${damageOf(d.damageKind)} de ${range(d.damage[0], d.damage[1])} por golpe (antes da armadura do alvo).`}</p>`);

  const notes: string[] = [];
  if (d.armor) notes.push(`<b>Armadura ${fmt(d.armor)}</b>: tira ${fmt(d.armor)} de cada golpe físico e ${fmt(d.armor * MAGIC_ARMOR_FACTOR)} do dano elemental.`);
  if (d.pack) {
    const kin = m.monsters.filter((x) => x.id !== d.id && x.pack?.family === d.pack!.family);
    notes.push(`<b>Bando</b>: ao levar o 1º golpe, cair abaixo de 50 % da vida ou começar a fugir, grita “${esc(d.pack.shout)}” e chama a família a até ${HELP_RADIUS} tiles para atacar quem bateu${kin.length ? ` (${kin.map((x) => monsterLink(x.id, D)).join(", ")})` : ""}.`);
  }
  if (canBeElite(d)) {
    notes.push(`<b>Elite</b>: ${pct(ELITE_CHANCE, 0)} de chance de nascer Elite, com vida ×${fmt(ELITE.hp)}, dano ×${fmt(ELITE.dmg)}, XP ×${fmt(ELITE.xp)}, ouro ×${fmt(ELITE.gold)} e chance de loot ×${fmt(ELITE.loot)}.`);
  }
  if (d.boss) notes.push(`<b>Chefe</b>: raiz vira lentidão de ${BOSS_ROOT_SLOW_PCT} % e as lentidões valem ${pct(BOSS_SLOW_MULT, 0)} do normal.`);
  if (ally) {
    notes.push(`<b>Cresce com quem invoca</b>: ${SUMMON_SAMPLE_LEVELS.map((lv) => {
      const s = summonScaled(d, lv);
      return `no level ${lv}, vida ${fmt(s.hp)} e dano ${range(s.damage[0], s.damage[1])}`;
    }).join("; ")}.`);
  }
  if (notes.length) parts.push(`<h2>Comportamento</h2>
<ul>${notes.map((x) => `<li>${x}</li>`).join("")}</ul>`);
  parts.push(`<div class="clear"></div>`);

  if (!d.invulnerable) {
    parts.push(`<h2>Resistências e fraquezas</h2>`);
    parts.push(table(ELEMENTS.map(kindBadge), [ELEMENTS.map((k) => {
      const x = damageTakenMult(d, k);
      return x === 1 ? pct(x, 0) : `<b class="res ${x < 1 ? "lo" : "hi"}">${pct(x, 0)}</b>`;
    })]));
    parts.push(`<p class="muted">${el.resists || el.weak ? "" : "Toma dano normal de todos os elementos. "}Dano recebido de cada elemento, depois da armadura (100 % = normal).</p>`);
  }

  if (d.abilities?.length) {
    parts.push(`<h2>Habilidades</h2>`);
    parts.push(`<p class="muted">Cada habilidade ocupa o turno do ataque básico: quando usa uma, não ataca.</p>`);
    parts.push(table(["Habilidade", "O que faz"], d.abilities.map((a) => [`<b>${esc(a.name)}</b>`, abilityText(d, a)])));
  }

  if (!inert && !ally) {
    parts.push(`<h2>Loot</h2>`);
    parts.push(`<p><b>Ouro:</b> ${d.gold && d.gold[1] > 0 ? `${range(d.gold[0], d.gold[1])} moedas por abate` : "nenhum"}</p>`);
    const loot = [...(d.loot ?? [])].sort((a, b) => b.chance - a.chance || a.itemId.localeCompare(b.itemId));
    if (loot.length) {
      parts.push(table(["", "Item", "Chance", "Quantidade"], loot.map((l) => {
        const item = m.items.find((x) => x.id === l.itemId);
        const min = l.min ?? 1, max = l.max ?? l.min ?? 1;
        return [
          item ? itemIcon(item, 32) : "",
          itemLink(l.itemId, D),
          `<span data-sort="${l.chance}">${l.chance >= 1 ? "sempre" : pct(l.chance, 2)}</span>`,
          `<span data-sort="${max}">${range(min, max)}</span>`,
        ];
      }), { sortable: true }));
      parts.push(`<p class="muted">Cada item é sorteado em separado a cada abate; eventos de loot${canBeElite(d) ? " e a Elite" : ""} aumentam a chance. Equipamentos saem com raridade sorteada${d.boss ? " (de chefe: um nível acima, no mínimo incomum)" : ""}.</p>`);
    } else {
      parts.push(`<p>Não solta itens.</p>`);
    }
  }

  parts.push(`<h2>Onde encontrar</h2>`);
  if (zones.length) {
    parts.push(table(["Zona", "Level da zona", "Exemplares", "Spawns (x, y)"], zones.map((z) => {
      const lv = z.zone ? m.zoneLevels(z.zone) : undefined;
      return [
        z.zone ? zoneLink(z.zone, D) : '<span class="muted">fora de zona com nome</span>',
        lv ? `<span data-sort="${lv.min}">${esc(levelsText(lv))}</span>` : "—",
        z.total,
        `<span class="coords" data-sort="${z.points.length}">${z.points.map((p) => `(${p.x}, ${p.y})${p.count > 1 ? ` ×${p.count}` : ""}`).join(" · ")}</span>`,
      ];
    }), { sortable: true }));
  } else {
    parts.push(`<p>Não nasce solto no mapa.</p>`);
  }

  const other = appearances(m, d);
  if (other.length) {
    parts.push(`<h2>Outras aparições</h2>`);
    parts.push(`<ul>${other.map((x) => `<li>${x}</li>`).join("")}</ul>`);
  }

  const quests = m.questsTargeting(d.id);
  if (quests.length) {
    parts.push(`<h2>Missões</h2>`);
    parts.push(table(["Missão", "Pede", "Dada por", "Level"], quests.map((q) => {
      const steps = q.steps.filter((s) => (s.kind === "kill" || s.kind === "boss") && s.target === d.id);
      const ask = steps.map((s) => (s.kind === "boss" ? "derrotar o chefe" : `matar ${fmt(s.count)}`)).join(", ");
      return [questLink(q.id, D), esc(ask), npcLink(q.giver, D), q.minLevel];
    }), { sortable: true }));
  }

  return {
    path: `criaturas/${slug(d.id)}.html`,
    title: d.name,
    body: parts.join("\n"),
    nav: `${link("criaturas/index.html", "Criaturas", D)} › ${esc(d.name)}`,
    search: [{
      title: d.name,
      kind: d.boss ? "Chefe" : "Criatura",
      text: [
        `lv ${d.level}`, d.boss ? "chefe boss" : "", d.undead ? "morto-vivo" : "", kindName[d.damageKind],
        ...zones.map((z) => z.zone), ...(d.abilities ?? []).map((a) => a.name),
        ...(d.loot ?? []).map((l) => m.items.find((x) => x.id === l.itemId)?.name ?? l.itemId),
      ].filter(Boolean).join(" "),
    }],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------------------------------------------------

export function render(m: WikiModel): WikiPage[] {
  const byLevel = [...m.monsters].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "pt-BR"));
  const main = byLevel.filter(listed);
  const bosses = main.filter((d) => d.boss);
  const others = byLevel.filter((d) => !listed(d));

  const rows = main.map((d) => [
    creatureIcon(d, 32),
    `${monsterLink(d.id, D)}${d.boss ? ` ${bossTag}` : ""}`,
    d.level, d.hp, d.xp,
    `<span data-sort="${(d.damage[0] + d.damage[1]) / 2}">${range(d.damage[0], d.damage[1])}</span>`,
    kindBadge(d.damageKind),
    d.armor,
    d.boss ? "sim" : "—",
    zoneLinks(m, d.id),
  ]);

  const bossRows = bosses.map((d) => {
    const events = WEEKLY_EVENTS.filter((e) => e.boss === d.id)
      .map((e) => `${esc(e.name)} <span class="muted">(${WEEKDAY[e.day]}, ${clock(e.hour, e.minute ?? 0)})</span>`);
    return [
      creatureIcon(d, 32),
      monsterLink(d.id, D),
      d.level, d.hp,
      zoneLinks(m, d.id),
      `<span data-sort="${d.respawnMs}">${duration(d.respawnMs)}</span>`,
      events.length ? events.join("<br>") : "—",
    ];
  });

  const body = `<h1>Criaturas</h1>
<p class="lead">Todas as ${main.length} criaturas do jogo, do level ${main[0]?.level ?? 1} ao ${main.at(-1)?.level ?? 1}, com ${bosses.length} chefes. Clique no cabeçalho para ordenar e no nome para ver resistências, habilidades, loot e onde encontrar.</p>
<p class="muted">Dano por golpe antes da armadura do alvo. A partir do level 10, monstros comuns podem nascer Elite (${pct(ELITE_CHANCE, 0)}): vida ×${fmt(ELITE.hp)}, XP ×${fmt(ELITE.xp)} e loot melhor.</p>
${table(["", "Nome", "Level", "Vida", "XP", "Dano", "Elemento", "Armadura", "Chefe", "Onde vive"], rows, { sortable: true })}
<h2>Chefes</h2>
<p>Chefes renascem no próprio spawn depois do tempo de respawn; os que têm evento semanal também são convocados na hora do evento.</p>
${table(["", "Chefe", "Level", "Vida", "Onde vive", "Respawn", "Evento semanal"], bossRows, { sortable: true })}
${others.length ? `<p class="muted">Fora da lista (não dão XP nem aparecem no Bestiário): ${others.map((d) => {
    const why = d.invulnerable ? "invulnerável, só para treinar" : summonSpellOf(d.id) ? "invocação de jogador" : "sem XP";
    return `${monsterLink(d.id, D)} (${why})`;
  }).join(", ")}.</p>` : ""}`;

  return [
    {
      path: "criaturas/index.html",
      title: "Criaturas",
      body,
      search: [{ title: "Criaturas", kind: "Lista", text: "bestiário monstros criaturas chefes bosses lista todas" }],
    },
    ...byLevel.map((d) => creaturePage(m, d)),
  ];
}
