// Seção Missões da wiki: o índice (por faixa de level, com as cadeias e as quests de baú/alavanca) e uma página por
// missão. Tudo sai de shared/data/quests.ts, questUnlocks.ts e questWorld.ts; nada é escrito à mão.
import {
  ITEMS, MAX_TRACKED_QUESTS, MONSTERS, NPCS, OUTFITS, QUEST_CHESTS, QUEST_CHEST_GROUPS, QUEST_LEVERS, TITLES,
  nextQuestsAfter, questEffectiveLevel,
  type QuestChestDef, type QuestChestGroupDef, type QuestDef, type QuestStep,
} from "../../../packages/shared/src/index.ts";
import {
  creatureIcon, esc, fmt, itemIcon, itemLink, link, monsterLink, npcIcon, npcLink, pct, questLink, slug, table, zoneLink,
  type WikiPage,
} from "../html.mts";
import type { WikiModel } from "../model.mts";

/** Profundidade das páginas desta seção ("missoes/x.html" → 1). */
const D = 1;

/** Faixas de level do índice: [de, até) e o rótulo (a faixa de baixo vai até o level anterior ao da próxima). */
const BANDS: { from: number; to: number; label: string }[] = [
  { from: 1, to: 10, label: "Level 1–9" },
  { from: 10, to: 25, label: "Level 10–24" },
  { from: 25, to: 40, label: "Level 25–39" },
  { from: 40, to: 60, label: "Level 40–59" },
  { from: 60, to: 80, label: "Level 60–79" },
  { from: 80, to: 100, label: "Level 80–99" },
  { from: 100, to: Infinity, label: "Level 100 ou mais" },
];

const bandId = (b: { from: number }) => `lv-${b.from}`;

// ---------------------------------------------------------------------------------------------------------------------
// Recompensas
// ---------------------------------------------------------------------------------------------------------------------

/** "title:heroi" → título, "outfit:barbaro" → roupa, "addon:invocador:2" → addon (ids de achievements/outfits). */
function unlockInfo(unlock: string): { label: string; text: string } | undefined {
  const [kind, id, n] = unlock.split(":");
  if (kind === "title") return { label: "Título", text: TITLES[id ?? ""] ?? id ?? unlock };
  if (kind === "outfit") return { label: "Roupa", text: OUTFITS[id ?? ""]?.name ?? id ?? unlock };
  if (kind === "addon") {
    const o = OUTFITS[id ?? ""];
    const a = o?.addons[Number(n) - 1];
    return { label: "Addon", text: o && a ? `${o.name}: ${a.name}` : unlock };
  }
  return undefined;
}

/** Recompensa numa linha só (índice): XP, ouro, até 2 itens e o desbloqueio. Chave de ordenação = XP. */
function rewardCell(q: QuestDef): string {
  const r = q.rewards;
  const parts = [`${fmt(r.xp)} XP`, `${fmt(r.gold)} ouro`];
  const items = r.items ?? [];
  if (items.length) {
    const shown = items.slice(0, 2).map((i) => `${fmt(i.count)}× ${ITEMS[i.itemId]?.name ?? i.itemId}`).join(", ");
    parts.push(items.length > 2 ? `${shown} +${items.length - 2}` : shown);
  }
  const u = r.unlock ? unlockInfo(r.unlock) : undefined;
  if (u) parts.push(`${u.label.toLowerCase()} ${u.text}`);
  return `<span data-sort="${r.xp}">${esc(parts.join(" · "))}</span>`;
}

function rewardList(q: QuestDef): string {
  const r = q.rewards;
  const li: string[] = [];
  if (r.xp) li.push(`<li><b>${fmt(r.xp)}</b> de experiência</li>`);
  if (r.gold) li.push(`<li><b>${fmt(r.gold)}</b> de ouro</li>`);
  for (const i of r.items ?? []) {
    const d = ITEMS[i.itemId];
    li.push(`<li>${d ? `${itemIcon(d, 24)} ` : ""}${fmt(i.count)}× ${itemLink(i.itemId, D)}</li>`);
  }
  const u = r.unlock ? unlockInfo(r.unlock) : undefined;
  if (u) li.push(`<li><b>${esc(u.label)}:</b> ${esc(u.text)}</li>`);
  return `<ul class="rewards">${li.join("")}</ul>`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------------------------------------------------

function monsterRef(id: string): string {
  const d = MONSTERS[id];
  return `${d ? `${creatureIcon(d, 24)} ` : ""}${monsterLink(id, D)}${d ? ` <small>(lv ${d.level})</small>` : ""}`;
}

function itemRef(id: string): string {
  const d = ITEMS[id];
  return `${d ? `${itemIcon(d, 24)} ` : ""}${itemLink(id, D)}`;
}

/** Onde achar o alvo do passo: zonas dos spawns (monstro) ou quem dropa/vende (item). Vazio se não há nada a dizer. */
function whereText(m: WikiModel, s: QuestStep): string {
  if (s.kind === "kill" || s.kind === "boss") {
    const byZone = new Map<string, number>();
    for (const sp of m.spawnsOf(s.target)) if (sp.zone) byZone.set(sp.zone, (byZone.get(sp.zone) ?? 0) + sp.count);
    const zones = [...byZone].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).slice(0, 3).map(([z]) => zoneLink(z, D));
    return zones.length ? `Onde: ${zones.join(", ")}` : "";
  }
  if (s.kind === "collect" || s.kind === "deliver") {
    const drops = m.droppedBy(s.target).slice(0, 3);
    if (drops.length) return `Cai de: ${drops.map((d) => `${monsterLink(d.monsterId, D)} (${pct(d.chance)})`).join(", ")}`;
    const sold = m.soldBy(s.target).slice(0, 2);
    if (sold.length) return `Vendido por: ${sold.map((x) => `${npcLink(x.npcId, D)} (${fmt(x.price)} de ouro)`).join(", ")}`;
  }
  return "";
}

function stepHtml(m: WikiModel, q: QuestDef, s: QuestStep): string {
  const n = s.count > 1 ? `${fmt(s.count)}× ` : "";
  let main: string;
  switch (s.kind) {
    case "kill": main = `<b>Derrotar</b> ${n}${monsterRef(s.target)}`; break;
    case "boss": main = `<b>Derrotar o chefe</b> ${monsterRef(s.target)}${s.count > 1 ? ` ${fmt(s.count)} vezes` : ""}`; break;
    case "collect": main = `<b>Ter na mochila</b> ${n}${itemRef(s.target)} <small>(não é consumido)</small>`; break;
    case "deliver": main = `<b>Entregar</b> ${n}${itemRef(s.target)} a ${npcLink(s.npc ?? q.giver, D)} <small>(consumido)</small>`; break;
    case "talk": main = `<b>Falar com</b> ${npcLink(s.target, D)}`; break;
    case "explore": {
      const known = m.index.zones.some((z) => z.name === s.target);
      const area = s.area ? ` <small>(área de ${s.area.w}×${s.area.h} tiles a partir do tile ${s.area.x}, ${s.area.y})</small>` : "";
      main = `<b>Explorar</b> ${known ? zoneLink(s.target, D) : esc(s.target)}${area}`;
      break;
    }
    case "arena": main = `<b>Vencer a onda ${fmt(s.count)}</b> do Coliseu`; break;
    default: main = esc(`${s.kind} ${s.target}`);
  }
  const where = whereText(m, s);
  const meta = [where, s.label ? `Rastreador: “${esc(s.label)}”` : ""].filter(Boolean).join(" · ");
  return `<li>${main}${meta ? `<br><small class="muted">${meta}</small>` : ""}</li>`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Página de uma missão
// ---------------------------------------------------------------------------------------------------------------------

/** O que concluir esta missão abre: missões seguintes, portais que exigem a missão e baús de covil dos chefes dela. */
function unlocksHtml(m: WikiModel, q: QuestDef): string {
  const li: string[] = [];
  const next = nextQuestsAfter(q.id);
  if (next.length) li.push(`<li><b>Missões seguintes:</b> ${next.map((x) => `${questLink(x.id, D)} <small>(lv ${x.minLevel}+)</small>`).join(", ")}.</li>`);
  const portals = m.index.portals.filter((p) => p.quest === q.id);
  for (const p of portals) {
    const from = m.zoneOf(p.x, p.y);
    li.push(`<li><b>Portal:</b> a passagem${from ? ` em ${zoneLink(from, D)}` : ""} (tile ${p.x}, ${p.y}) leva a ${p.zone ? zoneLink(p.zone, D) : esc(p.label)}${p.minLevel ? ` e também pede level ${p.minLevel}` : ""}; sem esta missão ela fica selada.</li>`);
  }
  const bosses = new Set(q.steps.filter((s) => s.kind === "boss").map((s) => s.target));
  for (const g of Object.values(QUEST_CHEST_GROUPS)) {
    if (g.needBoss && bosses.has(g.needBoss)) {
      li.push(`<li><b>Baú do covil:</b> derrotar ${monsterLink(g.needBoss, D)} também destranca o baú de “${esc(g.name)}” (${esc(g.where)}); veja ${link(`missoes/index.html#bau-${g.id}`, "Quests de baú", D)}.</li>`);
    }
  }
  return li.length ? `<h2>Destrava</h2>\n<ul>${li.join("")}</ul>` : "";
}

function renderQuest(m: WikiModel, q: QuestDef): WikiPage {
  const giver = NPCS[q.giver];
  const pos = m.npcPos(q.giver);
  const eff = questEffectiveLevel(q);
  const requires = (q.requires ?? []).map((id) => questLink(id, D));
  const box: [string, string][] = [
    ["Dada por", npcLink(q.giver, D)],
    ["Zona", pos?.zone ? zoneLink(pos.zone, D) : '<span class="muted">fora de zona com nome</span>'],
    ["Posição", pos ? `<span class="coords">${pos.x}, ${pos.y}</span>` : '<span class="muted">fora do mapa</span>'],
    ["Level mínimo", `${q.minLevel}${eff > q.minLevel ? ` <small class="muted">(na prática ${eff}, pelas missões anteriores)</small>` : ""}`],
    ["Pré-requisitos", requires.length ? requires.join("<br>") : "nenhum"],
    ["Recompensa", `${fmt(q.rewards.xp)} XP<br>${fmt(q.rewards.gold)} de ouro`],
  ];
  const dialogs: [string, string, string][] = [
    ["Oferta", "Ao falar com o NPC", q.dialog.offer],
    ["Ao aceitar", "Depois de aceitar a missão", q.dialog.accept],
    ["Em andamento", "Se voltar antes de terminar", q.dialog.progress],
    ["Ao concluir", "Ao entregar a missão", q.dialog.complete],
  ];

  const body = [
    `<aside class="infobox"><div class="portrait">${giver ? npcIcon(giver.sprite, giver.name, 64) : ""}</div><h3>${esc(giver?.name ?? q.giver)}</h3>`
      + `<dl>${box.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></aside>`,
    `<h1>${esc(q.name)}</h1>`,
    `<p class="lead">${esc(q.summary)}</p>`,
    `<h2>Passos</h2>
<p class="muted">Os passos podem ser feitos em qualquer ordem; a missão fica pronta quando todos estiverem completos. Depois, volte a ${npcLink(q.giver, D)} para receber a recompensa.</p>
<ol class="steps">${q.steps.map((s) => stepHtml(m, q, s)).join("\n")}</ol>`,
    `<h2>Recompensas</h2>\n${rewardList(q)}`,
    unlocksHtml(m, q),
    `<div class="clear"></div>
<h2>Diálogos</h2>
<p>Falas de ${npcLink(q.giver, D)} em cada momento da missão.</p>
${dialogs.map(([title, when, text]) => `<h3>${esc(title)} <small class="muted">${esc(when)}</small></h3>\n<blockquote class="quote">${esc(text)}</blockquote>`).join("\n")}`,
  ].filter(Boolean).join("\n");

  const names = q.steps.map((s) => (s.kind === "kill" || s.kind === "boss" ? MONSTERS[s.target]?.name
    : s.kind === "talk" ? NPCS[s.target]?.name : s.kind === "collect" || s.kind === "deliver" ? ITEMS[s.target]?.name
    : s.kind === "explore" ? s.target : undefined) ?? "");
  const u = q.rewards.unlock ? unlockInfo(q.rewards.unlock) : undefined;
  const text = [
    giver?.name ?? q.giver, pos?.zone ?? "", q.summary, ...q.steps.map((s) => s.label), ...names,
    ...(q.rewards.items ?? []).map((i) => ITEMS[i.itemId]?.name ?? ""), u?.text ?? "",
  ].filter(Boolean);
  return {
    path: `missoes/${slug(q.id)}.html`, title: q.name, body,
    nav: `${link("missoes/index.html", "Missões", D)} › ${esc(q.name)}`,
    search: [{ title: q.name, kind: "Missão", text: [...new Set(text)].join(" ") }],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Cadeias: cada missão com pré-requisito aparece depois de quem ela exige. Trechos sem bifurcação ficam numa linha só
 * (A → B → C); uma bifurcação abre uma sublista. Missão que já foi listada por outro ramo vira só o link ("já listada").
 */
function chainsHtml(m: WikiModel): { html: string; chained: number } {
  const byId = new Map(m.quests.map((q) => [q.id, q]));
  const kids = new Map<string, QuestDef[]>();
  for (const q of m.quests) for (const r of q.requires ?? []) if (byId.has(r)) kids.set(r, [...(kids.get(r) ?? []), q]);
  const roots = m.quests.filter((q) => !q.requires?.length && kids.has(q.id));
  const shown = new Set<string>();
  const ref = (q: QuestDef) => `${questLink(q.id, D)} <small>lv ${q.minLevel}</small>`;
  const also = (q: QuestDef) => ((q.requires?.length ?? 0) > 1
    ? ` <small class="muted">(requer ${q.requires!.map((id) => questLink(id, D)).join(" e ")})</small>` : "");
  const again = (q: QuestDef) => `${ref(q)} <small class="muted">(já listada acima)</small>`;

  const node = (q: QuestDef, arrow: boolean): string => {
    shown.add(q.id);
    let line = `${arrow ? "→ " : ""}${ref(q)}${also(q)}`;
    let cur = q;
    for (;;) {
      const ks = kids.get(cur.id) ?? [];
      if (!ks.length) return `<li>${line}</li>`;
      if (ks.length === 1) {
        const k = ks[0]!;
        if (shown.has(k.id)) return `<li>${line} → ${again(k)}</li>`;
        shown.add(k.id);
        line += ` → ${ref(k)}${also(k)}`;
        cur = k;
        continue;
      }
      return `<li>${line}<ul>${ks.map((k) => (shown.has(k.id) ? `<li>→ ${again(k)}</li>` : node(k, true))).join("")}</ul></li>`;
    }
  };
  const html = `<ul class="chain">${roots.map((r) => node(r, false)).join("\n")}</ul>`;
  return { html, chained: m.quests.filter((q) => q.requires?.length).length };
}

/** Prêmios de um grupo de baús: o que é igual em todos os baús (ouro, materiais) uma vez, e a escolha de cada baú. */
function chestRewards(g: QuestChestGroupDef): string {
  const chests = Object.values(QUEST_CHESTS).filter((c) => c.group === g.id);
  if (!chests.length) return "—";
  const key = (i: { itemId: string; count: number }) => `${i.itemId}:${i.count}`;
  const common = (chests[0]!.items ?? []).filter((i) => chests.every((c) => (c.items ?? []).some((j) => key(j) === key(i))));
  const commonGold = chests.every((c) => (c.gold ?? 0) === (chests[0]!.gold ?? 0)) ? (chests[0]!.gold ?? 0) : 0;
  const itemText = (i: { itemId: string; count: number }) => `${i.count > 1 ? `${fmt(i.count)}× ` : ""}${itemLink(i.itemId, D)}`;
  const own = (c: QuestChestDef) => (c.items ?? []).filter((i) => !common.some((x) => key(x) === key(i)));
  const lines: string[] = [];
  const all = [...(commonGold ? [`${fmt(commonGold)} de ouro`] : []), ...common.map(itemText)];
  if (all.length) lines.push(`${chests.length > 1 ? "Em todos os baús: " : ""}${all.join(", ")}`);
  if (chests.length > 1) {
    const choices = chests.map((c) => [...own(c).map(itemText), ...(commonGold ? [] : c.gold ? [`${fmt(c.gold)} de ouro`] : [])].join(" + ")).filter(Boolean);
    if (choices.length) lines.push(`<b>Escolha um:</b> ${choices.join(" · ")}`);
  }
  const unlock = chests.map((c) => c.unlock).find(Boolean);
  const u = unlock ? unlockInfo(unlock) : undefined;
  if (u) lines.push(`${esc(u.label)}: ${esc(u.text)}`);
  return lines.join("<br>");
}

function chestSection(): { html: string; groups: QuestChestGroupDef[] } {
  const groups = Object.values(QUEST_CHEST_GROUPS).sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name, "pt-BR"));
  const rows = groups.map((g) => {
    const lever = QUEST_LEVERS[g.id];
    const req = [
      g.needBoss ? `Derrotar ${monsterLink(g.needBoss, D)}` : "",
      lever ? `Alavanca de grupo: ${lever.minPlayers} a ${lever.players} jogadores nas placas` : "",
    ].filter(Boolean).join("<br>");
    return [`<span id="bau-${esc(g.id)}">${esc(g.name)}</span>`, esc(g.where), g.minLevel, req || "—", chestRewards(g)];
  });
  const html = `<h2 id="baus">Quests de baú e alavanca</h2>
<p>Algumas quests não têm NPC: o prêmio está num baú escondido no mundo. Cada personagem abre <b>um baú por quest</b>, uma única vez; quando a quest tem vários baús, é uma <b>escolha</b> (abrir um esvazia os outros para você). As quests de <b>covil</b> só abrem para quem já derrotou o chefe do covil; a <b>alavanca</b> leva o grupo à sala da quest e solta os monstros (quanto menor o grupo, menos monstros). A porta de level de cada lugar aparece no ${link("mapa/index.html", "mapa", D)}.</p>
${table(["Quest", "Onde", "Level", "Requisito", "Prêmios"], rows, { sortable: true })}`;
  return { html, groups };
}

function renderIndex(m: WikiModel): WikiPage {
  const sections = BANDS.map((b) => {
    const list = m.quests.filter((q) => q.minLevel >= b.from && q.minLevel < b.to)
      .sort((a, c) => a.minLevel - c.minLevel || m.quests.indexOf(a) - m.quests.indexOf(c));
    return { b, list };
  }).filter((s) => s.list.length);

  const rows = (list: QuestDef[]) => list.map((q) => {
    const pos = m.npcPos(q.giver);
    return [
      questLink(q.id, D), q.minLevel, npcLink(q.giver, D), pos?.zone ? zoneLink(pos.zone, D) : "—",
      (q.requires ?? []).length ? (q.requires ?? []).map((id) => questLink(id, D)).join("<br>") : "—",
      rewardCell(q),
    ];
  });

  const chains = chainsHtml(m);
  const chests = chestSection();
  const jump = sections.map((s) => `<a href="#${bandId(s.b)}">${esc(s.b.label)}</a> <small>(${s.list.length})</small>`).join(" · ");

  const body = `<h1>Missões</h1>
<p>O mundo tem <b>${m.quests.length} missões</b>, dadas por NPCs, mais as quests de baú e alavanca (no fim da página) e as recompensas diárias do Quadro.</p>
<h2>Como funciona</h2>
<ul>
<li><b>Aceitar:</b> clique no NPC que dá a missão e abra a aba <i>Missões</i> do diálogo. Um <b>!</b> amarelo sobre a cabeça do NPC indica missão disponível; um <b>?</b> amarelo, missão pronta para entregar; um <b>?</b> cinza, missão em andamento.</li>
<li><b>Requisitos:</b> level mínimo e, em algumas, outras missões concluídas (veja as cadeias abaixo).</li>
<li><b>Passos:</b> todos correm em paralelo, em qualquer ordem. Matar monstros conta para quem causou dano e para o grupo. Itens de “Ter na mochila” não são gastos; os de “Entregar” são.</li>
<li><b>Diário (tecla L):</b> lista as missões ativas, o que falta, as que já dá para pegar e as próximas. O botão <i>Guiar</i> põe uma seta na tela e uma marca no minimapa até o próximo passo. Até ${MAX_TRACKED_QUESTS} missões ficam fixas no rastreador do canto da tela.</li>
<li><b>Entregar:</b> com todos os passos feitos, volte ao NPC que deu a missão para receber XP, ouro e itens (e, em algumas, título, roupa ou addon).</li>
</ul>
<h2>Por faixa de level</h2>
<p>${jump} · <a href="#cadeias">Cadeias</a> · <a href="#baus">Quests de baú</a></p>
${sections.map((s) => `<h3 id="${bandId(s.b)}">${esc(s.b.label)} <small class="muted">(${s.list.length} ${s.list.length === 1 ? "missão" : "missões"})</small></h3>
${table(["Missão", "Level", "NPC", "Zona do NPC", "Pré-requisitos", "Recompensa"], rows(s.list), { sortable: true })}`).join("\n")}
<h2 id="cadeias">Cadeias</h2>
<p>${chains.chained} das ${m.quests.length} missões pedem que outra esteja concluída. Cada seta leva à missão que abre depois da anterior; o level é o mínimo da própria missão.</p>
${chains.html}
${chests.html}`;

  // Os grupos de baú também entram na busca (apontam para a linha na tabela do índice).
  const search = [
    { title: "Missões", kind: "Seção", text: "quests diário rastreador npc" },
    ...chests.groups.map((g) => ({ title: g.name, kind: "Missão", text: `${g.where} quest de baú alavanca`, href: `missoes/index.html#bau-${g.id}` })),
  ];
  return { path: "missoes/index.html", title: "Missões", body, search };
}

export function render(m: WikiModel): WikiPage[] {
  return [renderIndex(m), ...m.quests.map((q) => renderQuest(m, q))];
}
