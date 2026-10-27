// Seção NPCs da wiki: um índice com os serviços de cada NPC e uma página por NPC (loja, compra, viagem, missões e os
// serviços especiais). Os preços seguem as contas do servidor (systems/npcs.ts, via model.soldBy e npcBuyPrice): a wiki
// nunca mostra um preço que o jogo não cobra.
import {
  BLESSING_GOLD_PER_LEVEL, BOUNTIES_PER_DAY, BOUNTY_NPC, BOUNTY_RESET_HOUR, CASINO_MATERIAL_POOL, CASINO_TICKET_PRICE,
  DEPOT_SIZE, EXCURSION_MAX_AHEAD_MS, EXCURSION_MAX_SLOTS, EXCURSION_NPC, IMBUE_DURATION_MS, ITEMS, NPC_BUY_RATIO,
  RARITIES, RARITY_LABEL, RARITY_PRICE_MULT, REFINE_ARMOR_PER_LEVEL, REFINE_ATTACK_PER_LEVEL, REFINE_MAX, REFINE_NPC,
  REQUEST_NPC, TRAVEL_FREE_LEVEL, blessingPrice, npcBuyPrice,
  type ItemDef, type ItemKind, type NpcDef,
} from "../../../packages/shared/src/index.ts";
import { duration, esc, fmt, itemIcon, itemLink, link, npcIcon, npcLink, questLink, slug, table, vocList, zoneLink, type WikiPage } from "../html.mts";
import type { WikiModel } from "../model.mts";

/** Profundidade das páginas desta seção ("npcs/x.html" → 1). */
const D = 1;

/** Tipos de item que a loja compra, no plural ("Armas"). */
const KIND_PLURAL: Record<ItemKind, string> = {
  weapon: "Armas", shield: "Escudos", helmet: "Elmos", armor: "Armaduras", legs: "Calças", boots: "Botas", ring: "Anéis",
  amulet: "Amuletos", potion: "Poções", material: "Materiais", food: "Comidas", key: "Chaves", quest: "Itens de missão",
};

/**
 * Probabilidades da ficha de cassino. Só existem no servidor (systems/npcs.ts, buyCasino), não em `shared`: se mudarem
 * lá, mude aqui (a soma das quatro faixas é 100 %).
 */
const CASINO_ODDS = { nothing: 0.45, goldBack: 0.35, material: 0.15, jackpot: 0.05 };
const CASINO_GOLD_BACK = Math.round(CASINO_TICKET_PRICE * 0.4);
const CASINO_JACKPOT = CASINO_TICKET_PRICE * 3;

const levelsText = (l: { min: number; max: number } | undefined): string =>
  (l ? (l.min === l.max ? `lv ${l.min}` : `lv ${l.min}–${l.max}`) : "sem monstros");
/** Os mesmos termos da janela de viagem do jogo (client/ui/npc/travelInfo.ts). */
const aroundText = (l: { min: number; max: number } | undefined): string => (l ? levelsText(l) : "sem monstros por perto");

/** Os serviços do NPC, em poucas palavras (a ordem é a das colunas e dos atalhos do índice). */
function services(n: NpcDef): string[] {
  const s: string[] = [];
  if (n.shop?.sells.some((e) => ITEMS[e.itemId])) s.push("Loja");
  if (n.shop?.buys?.length) s.push("Compra");
  if (n.depot) s.push("Depot");
  if (n.travel?.length) s.push("Viagem");
  if (n.blessing) s.push("Bênção");
  if (n.casino) s.push("Cassino");
  if (n.imbuement) s.push("Encantamento");
  if (n.id === REFINE_NPC) s.push("Refino");
  if (n.id === "arena_master") s.push("Coliseu");
  if (n.id === BOUNTY_NPC) s.push("Quadro");
  if (n.id === REQUEST_NPC) s.push("Encomenda");
  if (n.id === EXCURSION_NPC) s.push("Mural");
  if (n.workBoard) s.push("Obra");
  return s;
}

const tags = (list: string[]): string => list.map((x) => `<span class="tag">${esc(x)}</span>`).join(" ");

/** Nome para título/busca: nomes repetidos (as 4 lojas do Coliseu, os cocheiros) ganham a zona ou o tile. */
function displayNames(m: WikiModel): Map<string, string> {
  const count = new Map<string, number>();
  for (const n of m.npcs) count.set(n.name, (count.get(n.name) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const n of m.npcs) {
    if ((count.get(n.name) ?? 0) < 2) { out.set(n.id, n.name); continue; }
    const same = m.npcs.filter((o) => o.name === n.name);
    const pos = m.npcPos(n.id);
    const zones = new Set(same.map((o) => m.npcPos(o.id)?.zone ?? ""));
    out.set(n.id, !pos ? n.name : zones.size === same.length && pos.zone ? `${n.name} (${pos.zone})` : `${n.name} (${pos.x}, ${pos.y})`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------------------------------------------------

function renderIndex(m: WikiModel, names: Map<string, string>): WikiPage {
  const npcs = [...m.npcs].sort((a, b) => (names.get(a.id) ?? a.name).localeCompare(names.get(b.id) ?? b.name, "pt-BR"));

  const rows = npcs.map((n) => {
    const pos = m.npcPos(n.id);
    const svc = services(n);
    const quests = m.questsOf(n.id).length;
    return [
      npcIcon(n.sprite, n.name, 32),
      npcLink(n.id, D),
      pos?.zone ? zoneLink(pos.zone, D) : "—",
      pos ? `<span data-sort="${pos.y * 1000 + pos.x}">${pos.x}, ${pos.y}</span>` : "—",
      svc.length ? tags(svc) : `<span class="muted">—</span>`,
      quests,
    ];
  });

  // Atalhos: "onde compro uma bênção?" é a pergunta mais comum sobre NPC.
  const shortcut = (label: string, pick: (n: NpcDef) => boolean): string => {
    const list = npcs.filter(pick);
    if (!list.length) return "";
    return `<li><b>${esc(label)}:</b> ${list.map((n) => {
      const z = m.npcPos(n.id)?.zone;
      return `${npcLink(n.id, D)}${z ? ` <small>(${esc(z)})</small>` : ""}`;
    }).join(", ")}</li>`;
  };
  const by = (label: string) => (n: NpcDef) => services(n).includes(label);
  const quick = [
    shortcut("Bênção", by("Bênção")), shortcut("Depot", by("Depot")), shortcut("Viagem", by("Viagem")),
    shortcut("Cassino", by("Cassino")), shortcut("Encantamento", by("Encantamento")), shortcut("Refino", by("Refino")),
    shortcut("Coliseu", by("Coliseu")), shortcut("Quadro de Recompensas e Encomenda", by("Quadro")),
    shortcut("Mural de Excursões", by("Mural")), shortcut("Painéis da obra", by("Obra")),
  ].filter(Boolean);

  const withQuests = npcs.filter((n) => m.questsOf(n.id).length).length;
  const body = `<h1>NPCs</h1>
<p>${npcs.length} personagens não jogáveis povoam o mundo: mercadores, sacerdotes, cocheiros, guardas e quem dá missão. Para falar com um, <b>clique nele</b> estando a até 3 tiles de distância; o diálogo abre a loja, o depósito, a viagem ou a lista de missões, conforme o NPC. Quem tem missão disponível mostra um <b>!</b> amarelo sobre a cabeça. ${withQuests} deles dão ${fmt(m.quests.length)} missões ao todo (veja a seção ${link("missoes/index.html", "Missões", D)}).</p>
<h2>Quem faz o quê</h2>
<ul>
${quick.join("\n")}
</ul>
<h2>Todos os NPCs</h2>
${table(["", "NPC", "Zona", "Posição (x, y)", "Serviços", "Missões"], rows, { sortable: true })}`;

  return {
    path: "npcs/index.html", title: "NPCs", body,
    search: [{ title: "NPCs", kind: "Seção", text: "personagens mercadores sacerdotes cocheiros lojas" }],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Página de um NPC
// ---------------------------------------------------------------------------------------------------------------------

/** Linhas da loja (itens que o servidor de fato vende, com o preço dele), do mais barato ao mais caro. */
function sellRows(m: WikiModel, n: NpcDef): { it: ItemDef; price: number; limited: boolean }[] {
  const seen = new Set<string>();
  const rows: { it: ItemDef; price: number; limited: boolean }[] = [];
  for (const e of n.shop?.sells ?? []) {
    const it = ITEMS[e.itemId];
    const src = m.soldBy(e.itemId).find((s) => s.npcId === n.id);
    if (!it || !src || seen.has(it.id)) continue;
    seen.add(it.id);
    rows.push({ it, price: src.price, limited: !!src.limited });
  }
  return rows.sort((a, b) => a.price - b.price || a.it.name.localeCompare(b.it.name, "pt-BR"));
}

function renderSells(m: WikiModel, n: NpcDef): string {
  const rows = sellRows(m, n);
  if (!rows.length) return "";
  const lv = (it: ItemDef) => `<span data-sort="${it.level ?? 0}">${it.level ?? "—"}</span>`;
  const cells = rows.map((r) => [
    itemIcon(r.it, 32), itemLink(r.it.id, D), r.price, lv(r.it), esc(vocList(r.it.vocations)),
    r.limited ? `<span class="tag">1 por semana</span>` : "",
  ]);
  const notes: string[] = [];
  if (rows.some((r) => r.limited)) {
    notes.push(`<b>1 por semana</b> é a encomenda especial (equipamento de tier 6–7, a 1,5× o valor de loot): cada personagem compra <b>uma</b> peça por semana, somando todos os vendedores; a semana vira na segunda-feira. Essas peças continuam caindo de monstros e chefes normalmente.`);
  }
  if (rows.some((r) => r.it.use && r.it.level)) {
    notes.push(`Poções e comidas só podem ser compradas por quem já tem o level de uso. Equipamento pode ser comprado antes, mas só se equipa no level indicado.`);
  }
  return `<h2>Vende</h2>
${table(["", "Item", "Preço (ouro)", "Level", "Vocação", "Obs."], cells, { sortable: true })}
${notes.map((t) => `<p class="muted">${t}</p>`).join("\n")}`;
}

/** Três exemplos de preço de compra: um barato, um médio e um caro entre os itens dos tipos que o NPC compra. */
function buyExamples(buys: readonly ItemKind[]): ItemDef[] {
  const pool = Object.values(ITEMS).filter((d) => buys.includes(d.kind) && d.value > 0 && !d.unique)
    .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
  if (pool.length <= 3) return pool;
  // Quantis baixos: o topo da lista é equipamento de tier 7–8, que ninguém vende de passagem.
  const pick = (q: number) => pool[Math.min(pool.length - 1, Math.floor(pool.length * q))]!;
  return [...new Set([pick(0.15), pick(0.4), pick(0.7)])];
}

function renderBuys(n: NpcDef): string {
  const buys = n.shop?.buys;
  if (!buys?.length) return "";
  const ex = buyExamples(buys);
  const mult = RARITIES.filter((r) => r !== "common").map((r) => `${RARITY_LABEL[r].toLowerCase()} ×${fmt(RARITY_PRICE_MULT[r])}`).join(" · ");
  return `<h2>Compra</h2>
<p>Compra: ${buys.map((k) => `<b>${esc(KIND_PLURAL[k] ?? k)}</b>`).join(", ")}.</p>
<p>Paga <b>${fmt(NPC_BUY_RATIO * 100)} % do valor</b> do item por unidade (mínimo de 1 de ouro); o preço de venda das lojas é o valor cheio. Raridade multiplica o que o NPC paga: ${esc(mult)}. O botão <i>Vender tudo</i> não vende itens raros ou melhores nem itens refinados (esses só saem um a um).</p>
${ex.length ? table(["", "Exemplo", "Valor do item", "O NPC paga (comum)"], ex.map((d) => [itemIcon(d, 32), itemLink(d.id, D), d.value, npcBuyPrice(d.value)]), { class: "compact" }) : ""}`;
}

function renderTravel(m: WikiModel, n: NpcDef): string {
  if (!n.travel?.length) return "";
  const rows = [...n.travel].sort((a, b) => a.price - b.price || a.label.localeCompare(b.label, "pt-BR")).map((t) => {
    const zone = m.index.zoneAt(t.x, t.y);
    const around = m.index.levelsNear(t.x, t.y);
    return [esc(t.label), zone ? zoneLink(zone, D) : "—", `<span data-sort="${around?.min ?? 0}">${esc(aroundText(around))}</span>`, t.price];
  });
  return `<h2>Viagem</h2>
<p>Paga o preço e chega na hora ao destino (tile de chegada dentro da zona protegida). Até o <b>level ${TRAVEL_FREE_LEVEL}</b> a viagem é <b>grátis</b>. Não dá para viajar em combate nem logo depois de atacar outro jogador. “Monstros em volta” é a faixa de level dos monstros ao redor do ponto de chegada, o que vale conferir antes de pagar.</p>
${table(["Destino", "Chega em", "Monstros em volta", "Preço (ouro)"], rows, { sortable: true })}`;
}

function renderQuests(m: WikiModel, n: NpcDef): string {
  const given = [...m.questsOf(n.id)].sort((a, b) => a.minLevel - b.minLevel);
  const involved = m.quests.filter((q) => q.giver !== n.id
    && q.steps.some((s) => (s.kind === "talk" && s.target === n.id) || (s.kind === "deliver" && s.npc === n.id)));
  if (!given.length && !involved.length) return "";
  const parts: string[] = [`<h2>Missões</h2>`];
  if (given.length) {
    parts.push(`<h3>Missões que dá (${given.length})</h3>`);
    parts.push(table(["Missão", "Level mínimo", "XP", "Ouro"], given.map((q) => [questLink(q.id, D), q.minLevel, q.rewards.xp, q.rewards.gold]), { sortable: true }));
  }
  if (involved.length) {
    parts.push(`<p><b>Também aparece em missões de outros NPCs</b> (falar com ele ou entregar itens a ele): ${involved.map((q) => questLink(q.id, D)).join(", ")}.</p>`);
  }
  return parts.join("\n");
}

/** Os serviços especiais, cada um com uma linha de explicação. */
function renderOthers(n: NpcDef): string {
  const s: string[] = [];
  if (n.blessing) {
    const eg = [10, 50, 100].map((l) => `level ${l} → ${fmt(blessingPrice(l))}`).join("; ");
    s.push(`<h3>Bênção</h3>
<p>Protege da perda de XP: na <b>próxima morte</b> você não perde experiência (a bênção é gasta nesse momento e continua valendo mesmo que você saia do jogo). Só uma por vez. Preço: <b>${BLESSING_GOLD_PER_LEVEL} de ouro por level</b> (${esc(eg)}).</p>`);
  }
  if (n.depot) {
    s.push(`<h3>Depósito</h3>
<p>Baú com <b>${DEPOT_SIZE} espaços</b> para guardar o que não cabe na mochila. É o mesmo baú em todos os guarda-volumes do mundo: o que você deixa num aparece nos outros.</p>`);
  }
  if (n.casino) {
    const o = CASINO_ODDS;
    const pool = CASINO_MATERIAL_POOL.map((id) => itemLink(id, D)).join(", ");
    s.push(`<h3>Cassino</h3>
<p>Vende uma <b>ficha</b> por <b>${fmt(CASINO_TICKET_PRICE)} de ouro</b> (preço fixo, igual em qualquer level) e o prêmio sai na hora. O jogo nunca dá poder de combate: só ouro, um material ou nada. Em média, a ficha paga menos do que custa.</p>
${table(["Resultado", "Chance", "Prêmio"], [
      ["Nada esta vez", `${fmt(o.nothing * 100)} %`, "—"],
      ["Ouro de volta", `${fmt(o.goldBack * 100)} %`, `${fmt(CASINO_GOLD_BACK)} de ouro`],
      ["Material", `${fmt(o.material * 100)} %`, `1 de: ${pool}`],
      ["Prêmio grande", `${fmt(o.jackpot * 100)} %`, `${fmt(CASINO_JACKPOT)} de ouro`],
    ], { class: "compact" })}
<p class="muted">Deixe um espaço livre na mochila antes de comprar a ficha: um dos prêmios é um material.</p>`);
  }
  if (n.imbuement) {
    s.push(`<h3>Encantamento</h3>
<p>Vende um encantamento de combate: <b>1 efeito ativo por personagem</b>, que dura ${esc(duration(IMBUE_DURATION_MS))} de combate contra monstros. Cada tier pede level mínimo, ouro e materiais. Comprar outro troca o efeito sem reembolso. Efeitos, tiers e materiais: ${link("mecanicas/encantamento.html", "Mecânicas › Encantamento", D)}.</p>`);
  }
  if (n.id === REFINE_NPC) {
    s.push(`<h3>Refino</h3>
<p>Refina equipamento de tier 5 em diante (level 35+) de +1 até +${REFINE_MAX}: arma ganha +${REFINE_ATTACK_PER_LEVEL} de ataque por nível; elmo, armadura, calças, botas e escudo ganham +${REFINE_ARMOR_PER_LEVEL} de armadura. Cada tentativa custa ouro e uma gema e pode falhar, mas a falha <b>não destrói nem rebaixa</b> o item. Custos e chances: ${link("mecanicas/refino.html", "Mecânicas › Refino", D)}.</p>`);
  }
  if (n.id === "arena_master") {
    s.push(`<h3>Coliseu</h3>
<p>Forme um grupo, escolha uma arena e enfrente ondas de monstros cada vez mais fortes. Quanto mais longe o grupo for, maior a glória. Os vendedores do Coliseu (poções e comida) só atendem na pausa entre as ondas.</p>`);
  }
  if (n.id === BOUNTY_NPC) {
    s.push(`<h3>Quadro de Recompensas</h3>
<p>Mostra <b>${BOUNTIES_PER_DAY} recompensas novas por dia</b> (a troca é às ${BOUNTY_RESET_HOUR}h, horário de Brasília): cada uma pede um número de cabeças de um monstro da faixa do seu level e paga ouro, XP e um ${itemLink("bounty_chest", D)}.</p>`);
  }
  if (n.id === REQUEST_NPC) {
    s.push(`<h3>Encomenda semanal</h3>
<p>A cada semana (renova na segunda-feira) o quadro também pede uma quantidade de um material, sorteado pela faixa do seu level, e paga em ouro quem entregar. Basta ter o material na mochila com o quadro aberto. Os materiais sempre caem de monstros comuns que dá para caçar no seu level.</p>`);
  }
  if (n.id === EXCURSION_NPC) {
    s.push(`<h3>Mural de Excursões</h3>
<p>Marque uma saída em grupo (destino, faixa de level, horário e de 2 a ${EXCURSION_MAX_SLOTS} vagas, até ${Math.round(EXCURSION_MAX_AHEAD_MS / 3_600_000)} h à frente) ou ponha seu nome numa que já está no mural com “Quero ir”. Quem marca avisa o líder; o líder chama todo mundo para o grupo. A lista também aparece na Agenda.</p>`);
  }
  if (n.workBoard) {
    s.push(`<h3>Painel da obra</h3>
<p>Mostra a aba “Na obra”, com as barras de andamento do sprint do trabalho real vindas do gerenciador de tarefas. Fechar tarefas vinculadas rende conquistas.</p>`);
  }
  return s.length ? `<h2>Outros serviços</h2>\n${s.join("\n")}` : "";
}

/** "a", "a e b", "a, b e c". */
const joinPt = (parts: readonly string[]): string =>
  (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`);

/** O que o NPC faz, em palavras: a frase de abertura da página (o resto da página detalha cada serviço). */
const PHRASE: Record<string, string> = {
  "Depot": "guarda os seus itens no depósito", "Bênção": "vende a bênção contra a perda de XP",
  "Cassino": "vende fichas de cassino", "Encantamento": "vende encantamentos de combate", "Refino": "refina equipamento",
  "Coliseu": "organiza as partidas do Coliseu", "Quadro": "posta as recompensas diárias",
  "Encomenda": "pede a encomenda semanal de material", "Mural": "guarda o mural de excursões", "Obra": "mostra o andamento da obra",
};
function summary(m: WikiModel, n: NpcDef): string {
  const sells = sellRows(m, n).length;
  const p: string[] = [];
  if (sells) p.push(`vende ${fmt(sells)} ${sells === 1 ? "item" : "itens"}`);
  if (n.shop?.buys?.length) p.push(`compra ${joinPt(n.shop.buys.map((k) => (KIND_PLURAL[k] ?? k).toLowerCase()))}`);
  if (n.travel?.length) p.push(`leva a ${n.travel.length === 1 ? "1 destino" : `${n.travel.length} destinos`} de viagem`);
  for (const label of services(n)) if (PHRASE[label]) p.push(PHRASE[label]!);
  const q = m.questsOf(n.id).length;
  if (q) p.push(`dá ${q === 1 ? "1 missão" : `${q} missões`}`);
  const text = p.length ? p.join("; ") : "só conversa: faz parte da ambientação do mundo";
  return `${text[0]!.toUpperCase()}${text.slice(1)}.`;
}

function renderNpc(m: WikiModel, n: NpcDef, names: Map<string, string>): WikiPage {
  const name = names.get(n.id) ?? n.name;
  const pos = m.npcPos(n.id);
  const svc = services(n);
  const lv = pos?.zone ? m.zoneLevels(pos.zone) : undefined;
  const quests = m.questsOf(n.id).length;
  const box: [string, string][] = [
    ["Zona", pos?.zone ? zoneLink(pos.zone, D) : '<span class="muted">fora de zona com nome</span>'],
    ["Posição", pos ? `<span class="coords">${pos.x}, ${pos.y}</span>` : '<span class="muted">fora do mapa</span>'],
  ];
  if (lv) box.push(["Monstros da zona", esc(levelsText(lv))]);
  if (svc.length) box.push(["Serviços", tags(svc)]);
  if (quests) box.push(["Missões", String(quests)]);

  const where = pos ? ` está ${pos.zone ? `na zona ${zoneLink(pos.zone, D)} ` : ""}(${pos.x}, ${pos.y}).` : " não aparece no mapa.";
  const body = [
    `<aside class="infobox"><div class="portrait">${npcIcon(n.sprite, n.name, 64)}</div><h3>${esc(n.name)}</h3>`
      + `<dl>${box.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></aside>`,
    `<h1>${esc(n.name)}</h1>`,
    `<p class="lead">${esc(n.name)}${where} ${summary(m, n)}</p>`,
    `<blockquote class="quote">${esc(n.greeting)}</blockquote>`,
    `<div class="clear"></div>`,
    renderSells(m, n),
    renderBuys(n),
    renderTravel(m, n),
    renderQuests(m, n),
    renderOthers(n),
    n.idleLines?.length
      ? `<details class="idle"><summary>Falas de ambientação (${n.idleLines.length})</summary><ul>${n.idleLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>`
      : "",
  ].filter(Boolean).join("\n");

  const searchText = [
    pos?.zone ?? "", ...svc, ...(n.travel ?? []).map((t) => t.label),
    ...m.questsOf(n.id).map((q) => q.name),
  ].filter(Boolean).join(" ");
  return {
    path: `npcs/${slug(n.id)}.html`, title: name,
    body, nav: `${link("npcs/index.html", "NPCs", D)} › ${esc(name)}`,
    search: [{ title: name, kind: "NPC", text: searchText }],
  };
}

export function render(m: WikiModel): WikiPage[] {
  const names = displayNames(m);
  return [renderIndex(m, names), ...m.npcs.map((n) => renderNpc(m, n, names))];
}
