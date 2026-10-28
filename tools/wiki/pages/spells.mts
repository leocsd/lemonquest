// Seção Magias da wiki: índice com uma tabela ordenável por vocação, as famílias prontas ("tecla inteligente") e uma
// página por magia com fórmula, mana, recarga e o valor esperado por level. Nenhum número da magia é escrito à mão: tudo
// sai de SPELLS/SPELL_FAMILIES e das mesmas contas do servidor (evalSpellFormula, spellPower, spellMana, baseStats).
//
// Os valores de exemplo usam o jogador típico de `skillEstimate` (magic level e skill da arma médios da produção, sem
// equipamento). Dano de cavaleiro/paladino usa o `spellPower` (skill da arma + level); a cura usa só o magic level.
import {
  BOSS_ROOT_SLOW_PCT, BOSS_SLOW_MULT, DEFAULT_SPELL_RANGE, GLOBAL_SPELL_COOLDOWN_MS, GROUP_MAX, GROUP_SPELLS_MAX, HOTKEY_MAX,
  MAGIC_ARMOR_FACTOR, MANA_SHIELD_ABSORB, MONSTERS, PLAYABLE_VOCATIONS, SKILL_ESTIMATE_LEVELS, SPELL_FAMILIES, isHiddenVocation,
  baseStats, evalSpellFormula, familyLevel, skillEstimate, spellMana, spellPower,
  type ConditionId, type SpellDef, type SpellFamily, type Vocation,
} from "../../../packages/shared/src/index.ts";
// Só constantes (o módulo não carrega o servidor): o intervalo dos danos contínuos e da cura contínua.
import { DOT_INTERVAL_MS, DOT_KIND, REGEN_TICK_MS } from "../../../packages/server/src/systems/conditions.ts";
import {
  duration, esc, fmt, kindBadge, kindName, link, monsterLink, pct, slug, spellLink, table, vocName,
  type SearchEntry, type WikiPage,
} from "../html.mts";
import type { WikiModel } from "../model.mts";

const DEPTH = 1; // magias/*.html

// ---------------------------------------------------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------------------------------------------------

/** Nomes das condições, iguais ao catálogo do HUD (client/ui/hud/conditions.ts). */
const COND_LABEL: Record<ConditionId, string> = {
  combat: "Em combate", poison: "Envenenado", burn: "Queimando", energy: "Eletrificado", bleed: "Sangrando", freeze: "Congelado",
  protect: "Protegido", haste: "Rápido", slow: "Lento", drunk: "Tonto", regen: "Regenerando", pz: "Zona de proteção",
  manashield: "Escudo de Mana", rooted: "Enraizado", taunted: "Provocado", fed: "Alimentado", berserk: "Fúria",
  exposed: "Exposto", imbued: "Encantado",
};
const condLabel = (id: ConditionId): string => COND_LABEL[id] ?? id;

/** "do Cavaleiro", "do Feiticeiro e do Druida", "de todas as vocações". */
function vocPhrase(v: readonly Vocation[]): string {
  if (v.length >= PLAYABLE_VOCATIONS.length) return "de todas as vocações";
  const parts = v.map((x) => `do ${vocName[x]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0] ?? "";
}

/** Skill da arma que conta no dano de cada vocação (as demais só têm o magic level). */
const WEAPON_SKILL: Partial<Record<Vocation, { id: "melee" | "distance"; label: string }>> = {
  knight: { id: "melee", label: "corpo a corpo" },
  paladin: { id: "distance", label: "distância" },
};

const range = (s: SpellDef): number => s.range ?? DEFAULT_SPELL_RANGE;
const isBuffTarget = (s: SpellDef): boolean => s.target === "self" || s.target === "party";

// ---------------------------------------------------------------------------------------------------------------------
// Geometria (mesma conta de systems/spells.ts: circleTiles/waveTiles, sem paredes) — o servidor não carrega fora do jogo
// ---------------------------------------------------------------------------------------------------------------------

/** Tiles do círculo "Chebyshev arredondado": dx²+dy² ≤ r²+r (raio 1 = 3×3, raio 2 = 5×5 sem os cantos). */
function circleCount(r: number): number {
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) n++;
  return n;
}

/** Tiles da onda: cada fileira tem 2·meia-largura+1; no cone a meia-largura cresce de 0 até ⌊(largura−1)/2⌋. */
function waveCount(length: number, width: number, rect: boolean): number {
  const max = Math.max(0, Math.floor((Math.max(1, width) - 1) / 2));
  let n = 0;
  for (let i = 1; i <= Math.max(1, Math.floor(length)); i++) {
    const h = length <= 1 || rect ? max : Math.round((max * (i - 1)) / (length - 1));
    n += 2 * h + 1;
  }
  return n;
}

/** Alvo/forma curtos para a tabela ("alvo até 5", "área 3 em volta", "onda 5×3", "grupo"). */
function shapeShort(s: SpellDef): string {
  switch (s.target) {
    case "self": return "você";
    case "target": return (range(s) <= 1 ? "alvo adjacente" : `alvo até ${range(s)}`) + (s.dash ? " (investida)" : "");
    case "area_self": return `área ${s.radius ?? 1} em volta`;
    case "area_target": return `área ${s.radius ?? 1} no alvo (até ${range(s)})`;
    case "wave": return `${s.rect ? "retângulo" : "onda"} ${s.length ?? 3}×${s.width ?? 1}`;
    case "party": return `grupo (raio ${s.radius ?? 3})`;
  }
}

/** Alvo/forma por extenso para a página da magia. */
function shapeLong(s: SpellDef): string {
  const r = s.radius ?? 1;
  switch (s.target) {
    case "self": return "Só você.";
    case "target":
      return range(s) <= 1
        ? "Um alvo selecionado, encostado em você (alcance 1 tile)."
        : `Um alvo selecionado, a até ${range(s)} tiles de você.${s.dash ? " Você avança até ele antes do golpe." : ""}`;
    case "area_self": return `Todos os inimigos num raio de ${r} ${r === 1 ? "tile" : "tiles"} em volta de você (${circleCount(r)} tiles).`;
    case "area_target":
      return `Todos os inimigos num raio de ${r} ${r === 1 ? "tile" : "tiles"} em volta do alvo (${circleCount(r)} tiles); o alvo precisa estar a até ${range(s)} tiles de você.`;
    case "wave": {
      const l = s.length ?? 3, w = s.width ?? 1, n = waveCount(l, w, !!s.rect);
      return s.rect
        ? `Retângulo de ${w} tiles de largura por ${l} de comprimento à sua frente (${n} tiles).`
        : `Onda em cone à sua frente: ${l} tiles de comprimento, abrindo até ${w} de largura (${n} tiles).`;
    }
    case "party": return `Você e os aliados a até ${s.radius ?? 3} tiles de você.`;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Efeitos
// ---------------------------------------------------------------------------------------------------------------------

/** Frase completa da condição aplicada pela magia (texto puro). */
function conditionSentence(c: NonNullable<SpellDef["condition"]>): string {
  const dur = duration(c.durationMs), v = c.value ?? 0;
  const label = condLabel(c.id);
  const dot = DOT_KIND[c.id];
  if (dot) {
    const ticks = Math.floor(c.durationMs / DOT_INTERVAL_MS);
    return `${label}: ${fmt(v)} de dano de ${kindName[dot].toLowerCase()} a cada ${duration(DOT_INTERVAL_MS)} por ${dur} (${fmt(ticks)} ${ticks === 1 ? "tique" : "tiques"}: ${fmt(v * ticks)} no total).`;
  }
  switch (c.id) {
    case "protect": return `${label}: ${fmt(v)} % menos dano recebido por ${dur}.`;
    case "haste": return `${label}: +${fmt(v)} % de velocidade de movimento por ${dur}.`;
    case "slow": return `${label}: −${fmt(v)} % de velocidade de movimento por ${dur} (em chefes, −${fmt(Math.round(v * BOSS_SLOW_MULT))} %).`;
    case "rooted": return `${label}: preso no lugar por ${dur} (chefes não ficam presos: só ${fmt(BOSS_ROOT_SLOW_PCT)} % mais lentos).`;
    case "regen": {
      const ticks = Math.floor(c.durationMs / REGEN_TICK_MS);
      return `${label}: ${fmt(v)} de vida ${REGEN_TICK_MS === 1000 ? "por segundo" : `a cada ${duration(REGEN_TICK_MS)}`} durante ${dur} (${fmt(v * ticks)} no total).`;
    }
    case "manashield": return `${label}: por ${dur}, ${pct(MANA_SHIELD_ABSORB, 0)} do dano recebido sai da mana e o resto da vida (sem mana, tudo na vida).`;
    case "berserk": return `${label}: +${fmt(v)} % em todo o dano que você causa, por ${dur}.`;
    case "exposed": return `${label}: por ${dur} o alvo perde a resistência elemental e toma ${fmt(v)} % a mais de dano elemental, de qualquer um do grupo.`;
    default: return `${label} por ${dur}.`;
  }
}

/** Efeito em poucas palavras, para a coluna de valor das magias sem dano nem cura. */
function effectShort(s: SpellDef): string {
  const c = s.condition;
  if (s.summon) return `${s.summon.count} × ${MONSTERS[s.summon.monsterId]?.name ?? s.summon.monsterId} · ${duration(s.summon.durationMs)}`;
  if (s.taunt) return `provoca por ${duration(c?.durationMs ?? 0)}`;
  if (!c) return "—";
  const dur = duration(c.durationMs), v = fmt(c.value ?? 0);
  switch (c.id) {
    case "protect": return `−${v} % de dano · ${dur}`;
    case "haste": return `+${v} % de velocidade · ${dur}`;
    case "berserk": return `+${v} % de dano · ${dur}`;
    case "exposed": return `+${v} % de dano elemental · ${dur}`;
    case "regen": return `${v} de vida/s · ${dur}`;
    case "rooted": return `preso por ${dur}`;
    case "manashield": return `${pct(MANA_SHIELD_ABSORB, 0)} do dano na mana · ${dur}`;
    default: return `${condLabel(c.id)} · ${dur}`;
  }
}

/** Pedaços da coluna Tipo (HTML cru). */
function typeParts(s: SpellDef): string[] {
  const out: string[] = [];
  if (s.damage) out.push(`Dano ${kindBadge(s.damage.kind)}`);
  if (s.heal) out.push(kindBadge("heal"));
  if (s.taunt) out.push("Provocação");
  if (s.dash) out.push("Investida");
  if (s.summon) out.push("Invocação");
  const c = s.condition;
  if (c && c.id === "regen" && !s.heal) out.push(`${kindBadge("heal")} contínua`);
  else if (c && !s.taunt) out.push(`${isBuffTarget(s) ? "Reforço" : "Efeito"}: ${esc(condLabel(c.id))}`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Valores esperados
// ---------------------------------------------------------------------------------------------------------------------

interface Sample {
  level: number;
  /** Magic level típico (skillEstimate) e, para cavaleiro/paladino, a skill da arma. */
  ml: number;
  weapon?: number;
  /** Potência que entra na fórmula: o `spellPower` no dano; o magic level na cura (como o servidor). */
  power: number;
  avg: number;
  min: number;
  max: number;
  /** Vida máxima do personagem no level, sem equipamento (para a cura em % da vida). */
  hp: number;
}

/** Valor da magia (dano ou cura) para o jogador típico da vocação no level; undefined = a magia não tem fórmula. */
function sample(s: SpellDef, voc: Vocation, level: number): Sample | undefined {
  const f = s.damage ?? s.heal;
  if (!f) return undefined;
  const sk = skillEstimate(voc, level);
  const w = WEAPON_SKILL[voc];
  const weapon = w ? sk[w.id] : undefined;
  const power = s.damage ? spellPower(voc, sk.magic, weapon ?? 10, 0, level) : sk.magic;
  // rng fixo: 0,5 = média; 0 e 1 = os extremos da variação.
  const at = (r: number) => evalSpellFormula(f, level, power, () => r);
  return { level, ml: sk.magic, ...(weapon !== undefined ? { weapon } : {}), power, avg: at(0.5), min: at(0), max: at(1), hp: baseStats(voc, level).maxHp };
}

const LEVELS = [10, 30, 50, 70, 100, 130];
/** O level de liberação e os levels de referência acima dele. */
const levelsFor = (s: SpellDef): number[] => [s.level, ...LEVELS.filter((l) => l > s.level)];

/** "lv 1: 34 · lv 100: 412" para a coluna de valor da tabela de uma vocação; sem fórmula, o efeito em poucas palavras. */
function valueCell(s: SpellDef, voc: Vocation): string {
  const a = sample(s, voc, s.level), b = sample(s, voc, 100);
  if (!a || !b) return esc(effectShort(s));
  const text = s.level >= 100 ? `lv 100: <b>${fmt(b.avg)}</b>` : `lv ${s.level}: <b>${fmt(a.avg)}</b> · lv 100: <b>${fmt(b.avg)}</b>`;
  return `<span data-sort="${a.avg}">${text}</span>`;
}

/** Nível em que o custo de mana chega ao teto (undefined = sem teto ou nunca chega). */
function manaCapLevel(s: SpellDef): number | undefined {
  if (s.manaMax == null) return undefined;
  for (let l = Math.max(1, s.level); l <= 300; l++) if (spellMana(s, l) >= s.manaMax) return l;
  return undefined;
}

const cooldownCell = (s: SpellDef): string =>
  `<span data-sort="${s.cooldownMs}">${esc(duration(s.cooldownMs))}${s.global === false ? " <small>(fora da global)</small>" : ""}</span>`;

// ---------------------------------------------------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------------------------------------------------

const nav = (...parts: string[]): string => parts.join(" › ");
const code = (t: string): string => `<code>${esc(t)}</code>`;

/** Jogador típico por level (os pontos de SKILL_ESTIMATE_LEVELS): o que vale como "magic level", skill da arma e poder. */
function profileTable(): string {
  const headers = ["Vocação", ...SKILL_ESTIMATE_LEVELS.map((l) => `Level ${l}`)];
  const rows = PLAYABLE_VOCATIONS.map((v) => {
    const w = WEAPON_SKILL[v];
    return [esc(vocName[v]), ...SKILL_ESTIMATE_LEVELS.map((L) => {
      const sk = skillEstimate(v, L);
      if (!w) return `ML ${sk.magic}`;
      return `ML ${sk.magic} · ${w.label} ${sk[w.id]} · poder ${spellPower(v, sk.magic, sk[w.id], 0, L)}`;
    })];
  });
  return table(headers, rows);
}

function vocationTable(m: WikiModel, voc: Vocation): string {
  const list = m.spells.filter((s) => s.vocations.includes(voc)).sort((a, b) => a.level - b.level);
  const rows = list.map((s) => [
    spellLink(s.id, DEPTH), code(s.words), s.level, spellMana(s, s.level), cooldownCell(s), esc(shapeShort(s)),
    typeParts(s).join(" · ") || "—", valueCell(s, voc),
  ]);
  return table(["Magia", "Palavras", "Level", "Mana", "Recarga", "Alvo / forma", "Tipo", "Valor (lv liberação · lv 100)"], rows, { sortable: true });
}

function familyTable(): string {
  const rows = SPELL_FAMILIES.filter((f) => !isHiddenVocation(f.vocation)).map((f) => [
    `<b>${esc(f.name)}</b>`, esc(vocName[f.vocation]), familyLevel(f),
    f.spells.map((id) => spellLink(id, DEPTH)).join(" › "), esc(f.desc),
  ]);
  return table(["Família", "Vocação", "Libera no level", "Magias, da mais forte à mais fraca", "Descrição"], rows, { sortable: true });
}

function renderIndex(m: WikiModel): WikiPage {
  const sections = PLAYABLE_VOCATIONS.map((v) => `<h2 id="${slug(vocName[v])}">${esc(vocName[v])}</h2>\n${vocationTable(m, v)}`).join("\n");
  const toc = [...PLAYABLE_VOCATIONS.map((v) => `<a href="#${slug(vocName[v])}">${esc(vocName[v])}</a>`), `<a href="#familias">Famílias prontas</a>`, `<a href="#valores">Como ler os valores</a>`].join(" · ");

  const body = `<h1>Magias</h1>
<p class="lead">${fmt(m.spells.length)} magias para as quatro vocações: palavras mágicas, mana, recarga, alcance e o dano ou a cura esperados em cada level.</p>
<p class="muted">${toc}</p>

<h2 id="conjurar">Como conjurar</h2>
<p>Digite as palavras mágicas no chat (por exemplo ${code("exura")}) ou aperte a tecla do atalho: por padrão <b>1</b> a <b>0</b>, e a janela <b>Magias</b> (tecla <b>H</b>) deixa escolher a tecla de cada uma (até ${HOTKEY_MAX} atalhos, salvos no personagem). A barra só mostra o que o seu level já libera.</p>
<p>Cada magia gasta mana e tem a própria recarga. A maioria também aciona a <b>recarga global</b> de ${esc(duration(GLOBAL_SPELL_COOLDOWN_MS))}: depois de conjurar, nenhuma outra magia dessas sai nesse tempo. As magias de alvo precisam de um alvo selecionado e ao alcance. Clique no cabeçalho de uma coluna para ordenar a tabela; os valores de dano e cura estão explicados em <a href="#valores">Como ler os valores</a>.</p>

${sections}

<h2 id="familias">Famílias prontas (tecla inteligente)</h2>
<p>Uma tecla para várias magias do mesmo papel: ao apertar, sai a <b>primeira da lista que estiver pronta</b> (liberada no seu level, fora de recarga, com mana e ao alcance) — por isso a lista vai da mais forte à mais fraca. As magias continuam existindo à parte, pelas palavras ou por uma tecla própria. Na janela Magias você também monta até ${GROUP_MAX} grupos seus, com até ${GROUP_SPELLS_MAX} magias na ordem que quiser.</p>
${familyTable()}

<h2 id="valores">Como ler os valores</h2>
<p>Dano e cura seguem <code>base + level × a + poder × b</code>, com uma variação aleatória para cima e para baixo (a de cada magia está na página dela). O <b>poder</b> é o magic level (ML) dos magos e em toda cura; no <b>dano</b> do cavaleiro e do paladino é o maior entre o ML e ⌊(skill da arma + level − 10) ÷ 2⌋. Os números das tabelas são a <b>média por alvo</b> de um jogador típico da vocação, sem equipamento (bônus de itens somam ao ML e à skill):</p>
${profileTable()}
<p class="muted">Dano e cura em área valem por alvo atingido. Contra criaturas a armadura do alvo ainda reduz o dano: por inteiro no físico e só em ${esc(pct(MAGIC_ARMOR_FACTOR, 0))} nos elementos.</p>
`;

  const search: SearchEntry[] = [
    { title: "Magias", kind: "Seção", text: "magias feitiços palavras mágicas mana recarga" },
    ...SPELL_FAMILIES.filter((f) => !isHiddenVocation(f.vocation)).map((f) => ({
      title: `${f.name} (${vocName[f.vocation]})`, kind: "Família de magias",
      text: `tecla inteligente ${f.spells.map((id) => m.spells.find((s) => s.id === id)?.name ?? id).join(" ")}`,
      href: "magias/index.html#familias",
    })),
  ];
  return { path: "magias/index.html", title: "Magias", body, search, nav: nav(link("index.html", "Início", DEPTH), "Magias") };
}

// ---------------------------------------------------------------------------------------------------------------------
// Página da magia
// ---------------------------------------------------------------------------------------------------------------------

/** Quadro lateral da página (mesma marcação das páginas de criatura): chave em texto puro, valor em HTML cru. */
const infobox = (title: string, rows: [string, string][]): string =>
  `<aside class="infobox"><h3>${esc(title)}</h3><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></aside>`;

/** "22 + level × 2,2 + ML × 3" a partir dos coeficientes (omite os zerados). */
function formulaText(f: { base: number; perLevel: number; perMagic: number }, powerName: string): string {
  const terms = [fmt(f.base)];
  if (f.perLevel) terms.push(`level × ${fmt(f.perLevel)}`);
  if (f.perMagic) terms.push(`${powerName} × ${fmt(f.perMagic)}`);
  return terms.join(" + ");
}

function manaFact(s: SpellDef): string {
  if (!s.manaPerLevel) return fmt(s.mana);
  const cap = manaCapLevel(s);
  const rule = `${fmt(s.mana)} + ${fmt(s.manaPerLevel)} por level${s.manaMax != null ? `, no máximo ${fmt(s.manaMax)}${cap ? ` (a partir do level ${cap})` : ""}` : ""}`;
  return `${esc(rule)}<br><small>No level de liberação (${s.level}): ${fmt(spellMana(s, s.level))}.</small>`;
}

function effectsList(s: SpellDef): string[] {
  const out: string[] = [];
  const c = s.condition;
  if (s.dash) out.push(`<b>Investida:</b> você anda em linha reta até ${range(s)} tiles em direção ao alvo, parando ao lado dele ou diante de um obstáculo, e então golpeia.`);
  if (s.taunt) out.push(`<b>Provocação:</b> os monstros num raio de ${s.radius ?? 3} tiles passam a atacar você por ${esc(duration(c?.durationMs ?? 0))}.`);
  if (c && !s.taunt) {
    const who = s.target === "self" ? "Em você"
      : s.target === "party" ? `Em você e nos aliados a até ${s.radius ?? 3} tiles`
      : "Em cada inimigo atingido";
    out.push(`<b>${who}:</b> ${esc(conditionSentence(c))}`);
  }
  if (s.summon) {
    const sm = s.summon;
    out.push(`<b>Invocação:</b> ${sm.count} × ${monsterLink(sm.monsterId, DEPTH)} aliado, que luta ao seu lado por ${esc(duration(sm.durationMs))}.`);
  }
  return out;
}

function formulaSection(s: SpellDef): string {
  const f = s.damage ?? s.heal;
  if (!f) return "";
  const dmg = !!s.damage;
  const voc = s.vocations;
  const byWeapon = dmg && voc.some((v) => WEAPON_SKILL[v]);
  const perTarget = s.target !== "self" && s.target !== "target";
  const lines = [
    `<p>${dmg ? "Dano" : "Cura"}${perTarget ? (dmg ? " por alvo" : " por aliado") : ""} = <code>${esc(formulaText(f, dmg ? "poder" : "ML"))}</code>, com variação aleatória de ±${esc(pct(f.variance, 0))}.</p>`,
  ];
  if (dmg) {
    lines.push(byWeapon
      ? `<p><b>Poder</b> = o maior entre o magic level (ML) e ⌊(skill da arma + level − 10) ÷ 2⌋: a skill de ${voc.filter((v) => WEAPON_SKILL[v]).map((v) => `${WEAPON_SKILL[v]!.label} do ${vocName[v].toLowerCase()}`).join(" e ")}, com os bônus do equipamento.${voc.every((v) => WEAPON_SKILL[v]) ? "" : " Para os magos, o poder é o ML."}</p>`
      : `<p><b>Poder</b> = o magic level (ML) do mago, com o bônus dos itens.</p>`);
    lines.push(`<p class="muted">${s.damage!.kind === "physical"
      ? "A armadura do alvo reduz este dano por inteiro."
      : `A armadura do alvo só vale ${esc(pct(MAGIC_ARMOR_FACTOR, 0))} contra dano de ${esc(kindName[s.damage!.kind].toLowerCase())}.`}</p>`);
  } else {
    lines.push(f.perMagic
      ? `<p>A cura usa o magic level (ML, com o bônus dos itens), não a skill da arma: quem tem mais ML cura mais.</p>`
      : `<p>Não depende do magic level: só o level conta.</p>`);
  }
  return `<h2 id="formula">Fórmula</h2>\n${lines.join("\n")}`;
}

function levelSection(s: SpellDef): string {
  const f = s.damage ?? s.heal;
  if (!f) return "";
  const dmg = !!s.damage;
  const perTarget = s.target !== "self" && s.target !== "target";
  const valueHead = `${dmg ? "Dano médio" : "Cura média"}${perTarget ? (dmg ? " por alvo" : " por aliado") : ""}`;
  const levels = levelsFor(s);
  const showMana = !!s.manaPerLevel;
  // Sem perMagic o ML não entra na conta (Limpar Feridas): a coluna só confundiria.
  const showMl = f.perMagic > 0;
  let html: string;

  if (s.vocations.length === 1) {
    const voc = s.vocations[0]!;
    const w = dmg ? WEAPON_SKILL[voc] : undefined;
    const headers = ["Level"];
    if (showMana) headers.push("Mana");
    if (showMl) headers.push("ML típico");
    if (w) headers.push(`Skill (${w.label})`, "Poder");
    headers.push(valueHead, "Variação (mín–máx)");
    if (!dmg) headers.push("% da vida máxima");
    const rows = levels.map((L) => {
      const x = sample(s, voc, L)!;
      const r: (string | number)[] = [L];
      if (showMana) r.push(spellMana(s, L));
      if (showMl) r.push(x.ml);
      if (w) r.push(x.weapon ?? 0, x.power);
      r.push(x.avg, `${fmt(x.min)}–${fmt(x.max)}`);
      if (!dmg) r.push(pct(x.avg / x.hp, 0));
      return r;
    });
    html = table(headers, rows);
  } else {
    const headers = ["Level", ...(showMana ? ["Mana"] : []), ...s.vocations.map((v) => `${valueHead} · ${esc(vocName[v])}`)];
    const rows = levels.map((L) => {
      const r: (string | number)[] = [L];
      if (showMana) r.push(spellMana(s, L));
      for (const v of s.vocations) {
        const x = sample(s, v, L)!;
        const hint = [...(showMl ? [`ML ${x.ml}`] : []), ...(dmg && WEAPON_SKILL[v] ? [`poder ${x.power}`] : []), ...(!dmg ? [`${pct(x.avg / x.hp, 0)} da vida`] : [])];
        r.push(`<b>${fmt(x.avg)}</b> <small>(${fmt(x.min)}–${fmt(x.max)})</small>${hint.length ? `<br><small>${esc(hint.join(" · "))}</small>` : ""}`);
      }
      return r;
    });
    html = table(headers, rows);
  }
  const byWeapon = dmg && s.vocations.some((v) => WEAPON_SKILL[v]);
  const basis = byWeapon ? ": o ML e a skill da arma são a média de cada level (a mesma que o balanço do jogo usa)"
    : showMl ? ": o ML é a média de cada level (a mesma que o balanço do jogo usa)" : "";
  return `<h2 id="valores">Valor esperado por level</h2>
${html}
<p class="muted">Para um jogador típico da vocação, sem equipamento${basis}. A primeira linha é o level em que a magia é liberada.${!dmg ? " A porcentagem é da vida máxima do level, sem equipamento." : ""}</p>`;
}

function familiesSection(s: SpellDef): string {
  const fams = SPELL_FAMILIES.filter((f) => f.spells.includes(s.id));
  const idx = `${link("magias/index.html#familias", "famílias prontas", DEPTH)}`;
  if (!fams.length) {
    return `<h2 id="familias">Famílias</h2>\n<p>Não pertence a nenhuma das ${idx}: só sai pelas palavras mágicas ou por uma tecla própria.</p>`;
  }
  const item = (f: SpellFamily): string => {
    const pos = f.spells.indexOf(s.id);
    const before = f.spells.slice(0, pos);
    const after = f.spells.slice(pos + 1);
    const parts = [`${pos + 1}ª de ${f.spells.length} na ordem de prioridade`];
    if (before.length) parts.push(`sai quando ${before.map((id) => spellLink(id, DEPTH)).join(", ")} não ${before.length > 1 ? "estão" : "está"} pronta${before.length > 1 ? "s" : ""}`);
    else parts.push("é a primeira a sair quando está pronta");
    if (after.length) parts.push(`depois dela: ${after.map((id) => spellLink(id, DEPTH)).join(", ")}`);
    return `<li><b>${esc(f.name)}</b> (${esc(vocName[f.vocation])}): ${parts.join("; ")}.</li>`;
  };
  return `<h2 id="familias">Famílias que a incluem</h2>
<p>A tecla inteligente solta esta magia quando for a primeira pronta da lista (${idx}).</p>
<ul>
${fams.map(item).join("\n")}
</ul>`;
}

function renderSpell(s: SpellDef): WikiPage {
  const first = s.vocations[0]!;
  const crumbs = s.vocations.length === 1
    ? [link("index.html", "Início", DEPTH), link("magias/index.html", "Magias", DEPTH), link(`magias/index.html#${slug(vocName[first])}`, vocName[first], DEPTH), esc(s.name)]
    : [link("index.html", "Início", DEPTH), link("magias/index.html", "Magias", DEPTH), esc(s.name)];

  const rows: [string, string][] = [
    ["Palavras mágicas", code(s.words)],
    ["Vocações", esc(s.vocations.length >= PLAYABLE_VOCATIONS.length ? "Todas" : s.vocations.map((v) => vocName[v]).join(", "))],
    ["Level", fmt(s.level)],
    ["Mana", manaFact(s)],
    ["Recarga", esc(duration(s.cooldownMs))],
    ["Recarga global", s.global === false
      ? "não aciona nem espera"
      : `aciona (${esc(duration(GLOBAL_SPELL_COOLDOWN_MS))})`],
    ["Alvo / forma", esc(shapeShort(s))],
    ["Tipo", typeParts(s).join(" · ") || "—"],
  ];
  // Alcance e efeitos por extenso; a recarga global sem número no quadro, com a explicação aqui.
  const details = [
    esc(shapeLong(s)),
    s.global === false
      ? "<b>Recarga global:</b> esta magia não aciona nem espera a recarga global, então pode ser conjurada junto com outra."
      : `<b>Recarga global:</b> depois de conjurá-la, as outras magias esperam ${esc(duration(GLOBAL_SPELL_COOLDOWN_MS))}.`,
    ...effectsList(s),
  ];

  const body = `${infobox(s.name, rows)}
<h1>${esc(s.name)} <small class="words">${code(s.words)}</small></h1>
<p class="lead">${esc(s.name)} é uma magia ${esc(vocPhrase(s.vocations))}, liberada no level ${s.level}. ${esc(s.description)}</p>
<h2 id="efeitos">Alcance e efeitos</h2>
<ul>
${details.map((e) => `<li>${e}</li>`).join("\n")}
</ul>
${formulaSection(s)}
<div class="clear"></div>
${levelSection(s)}
${familiesSection(s)}
`;
  const text = [s.words, ...s.vocations.map((v) => vocName[v]), s.damage ? kindName[s.damage.kind] : "", s.heal ? "cura" : ""].filter(Boolean).join(" ");
  return {
    path: `magias/${slug(s.id)}.html`, title: s.name, body, nav: nav(...crumbs),
    search: [{ title: s.name, kind: "Magia", text }],
  };
}

export function render(m: WikiModel): WikiPage[] {
  return [renderIndex(m), ...m.spells.map(renderSpell)];
}
