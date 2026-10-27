// Página inicial da wiki: o que é o jogo, cartões para as seções (com as contagens dos dados), "Comece por aqui"
// (vocações e as primeiras missões) e a busca grande.
import { VOCATIONS, VOCATION_ATTACK, baseStats, spellsFor } from "../../../packages/shared/src/index.ts";
import { esc, fmt, kindName, link, npcLink, questLink, searchBox, vocName, zoneLink, type WikiPage } from "../html.mts";
import type { WikiModel } from "../model.mts";
import { MECHANICS } from "./mechanics.mts";

export function render(m: WikiModel): WikiPage[] {
  // Bonecos de treino (invulneráveis) não contam como criatura do bestiário.
  const creatures = m.monsters.filter((d) => !d.invulnerable).length;
  const cards: [string, string, number, string][] = [
    ["criaturas/index.html", "Criaturas", creatures, "Vida, dano, resistências, loot e onde nascem."],
    ["itens/index.html", "Itens", m.items.length, "Equipamentos, poções e materiais: quem dropa, quem vende, quem compra."],
    ["magias/index.html", "Magias", m.spells.length, "Palavras mágicas, mana, recarga e fórmulas por vocação."],
    ["npcs/index.html", "NPCs", m.npcs.length, "Lojas, viagens, depósito, bênção e quem dá missão."],
    ["missoes/index.html", "Missões", m.quests.length, "Passo a passo, requisitos e recompensas."],
    ["mapa/index.html", "Zonas", m.index.zones.length, "O mapa do mundo e cada região por dentro."],
  ];
  const cardHtml = cards.map(([href, label, n, text]) =>
    `<a class="card" href="${href}"><b>${fmt(n)}</b><span>${esc(label)}</span><small>${esc(text)}</small></a>`).join("\n");

  const vocCards = VOCATIONS.map((v) => {
    const a = VOCATION_ATTACK[v];
    const l1 = baseStats(v, 1), l2 = baseStats(v, 2);
    const first = spellsFor(v).filter((s) => s.level <= 10).map((s) => s.name);
    return `<a class="card voc" href="mecanicas/vocacoes.html#${v}"><span>${esc(vocName[v])}</span>
<small>${a.range > 1 ? `À distância (alcance ${a.range})` : "Corpo a corpo"}, dano ${esc(kindName[a.kind].toLowerCase())}. +${l2.maxHp - l1.maxHp} de vida e +${l2.maxMana - l1.maxMana} de mana por level.</small>
<small class="muted">Primeiras magias: ${esc(first.join(", "))}.</small></a>`;
  }).join("\n");

  const firstQuests = m.quests.slice(0, 3).map((q) => {
    const r = q.rewards;
    const gains = [r.xp ? `${fmt(r.xp)} XP` : "", r.gold ? `${fmt(r.gold)} de ouro` : ""].filter(Boolean).join(" e ");
    const zone = m.npcPos(q.giver)?.zone;
    return `<li>${questLink(q.id, 0)} <span class="muted">(lv ${q.minLevel}+, com ${npcLink(q.giver, 0)}${zone ? ` em ${zoneLink(zone, 0)}` : ""})</span><br><small>${esc(q.summary)}${gains ? ` Recompensa: ${esc(gains)}.` : ""}</small></li>`;
  }).join("\n");

  const mech = MECHANICS.map((x) => `<li>${link(`mecanicas/${x.slug}.html`, x.title, 0)} <small class="muted">${esc(x.blurb)}</small></li>`).join("\n");

  const body = `<section class="hero">
<h1>The Lemon Quest · Wiki</h1>
<p class="lead">MMORPG 2D de navegador no estilo Tibia, feito para a turma do escritório: um mundo pequeno e compartilhado, quatro vocações, caça em grupo, chefes no almoço e progressão lenta.<br>
Tudo aqui é gerado a partir dos dados do próprio jogo: números, drops, preços e mapas são os mesmos que o servidor usa.</p>
${searchBox("big", "Busque uma criatura, item, magia, NPC, missão ou zona…")}
</section>
<div class="cards">
${cardHtml}
</div>
<h2>Comece por aqui</h2>
<div class="cols">
<section>
<h3>Escolha a vocação</h3>
<div class="cards small">
${vocCards}
</div>
</section>
<section>
<h3>As primeiras missões</h3>
<p>Missões são dadas pelos NPCs marcados com <b>!</b> no jogo. As três primeiras:</p>
<ol class="quests">
${firstQuests}
</ol>
<p>${link("mecanicas/atalhos-e-controles.html", "Atalhos e controles", 0)} · ${link("mapa/index.html", "Mapa do mundo", 0)}</p>
</section>
</div>
<h2>Mecânicas</h2>
<ul class="mech-list">
${mech}
</ul>`;
  return [{ path: "index.html", title: "Início", body, search: [] }];
}
