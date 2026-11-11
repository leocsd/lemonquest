// Barra lateral direita (minimapa, personagem, equipamento, batalha, mochila) + trilho de botões.
import type { ComponentChild } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Minimap } from "../minimap/Minimap.tsx";
import { Backpack } from "./Backpack.tsx";
import { BattleList } from "./BattleList.tsx";
import { EquipmentPanel } from "./EquipmentPanel.tsx";
import { HelpPopover } from "./HelpPopover.tsx";
import { SoundPopover } from "./SoundPopover.tsx";
import { AutoPotionPopover } from "./AutoPotionPopover.tsx";
import { A11yPopover } from "./A11yPopover.tsx";
import { autoPotionStore } from "../items/autoPotion.ts";
import { mutedStore, volumeStore } from "../../game/sfx.ts";
import { PixelIcon } from "./icons.tsx";
import { setHudInsets } from "./layout.ts";
import { panelOrderStore, panelPinsStore, type PanelId } from "./panels.ts";
import { usePanelDrag } from "./reorder.ts";
import { PinButton } from "./Section.tsx";
import { PartyPanel } from "../party/PartyPanel.tsx";
import { StatBar } from "./StatBar.tsx";
import { Portrait, StatusPanel } from "./StatusPanel.tsx";
import { useStore } from "./store.ts";
import { outfitOpen, toggleOutfit } from "../outfit/outfit.ts";
import { questLogOpen, toggleQuestLog } from "../quests/quests.ts";
import { achievementsOpen, rankingOpen, toggleAchievements, toggleRanking } from "../achievements/achievements.ts";
import { a11yOpen, autoOpen, helpOpen, NARROW_PX, sidebarOpen, SIDEBAR_GAP, SIDEBAR_W, skillsOpen, soundOpen, toggle } from "./uiState.ts";
import { meStore } from "./world.ts";
import { bestiaryOpen, toggleBestiary } from "../bestiary/Bestiary.tsx";
import { agendaOpen, toggleAgenda } from "../agenda/agenda.ts";

export function Sidebar() {
  const open = useStore(sidebarOpen);
  const skills = useStore(skillsOpen);
  const help = useStore(helpOpen);
  const bestiary = useStore(bestiaryOpen);
  const muted = useStore(mutedStore);
  const volume = useStore(volumeStore).volume;
  const sound = useStore(soundOpen);
  const autoPop = useStore(autoOpen);
  const a11yPop = useStore(a11yOpen);
  const autoCfg = useStore(autoPotionStore);
  const outfit = useStore(outfitOpen);
  const questLog = useStore(questLogOpen);
  const achOpen = useStore(achievementsOpen);
  const rankOpen = useStore(rankingOpen);
  const agenda = useStore(agendaOpen);

  const order = useStore(panelOrderStore);
  const pins = useStore(panelPinsStore);
  const anyPinned = order.some((id) => pins[id]);
  const pinnedOnly = !open && anyPinned;
  const showVitals = !open && !pins.status;

  // Recolhida com painéis fixados, a coluna fica à esquerda do trilho: a câmera deve descontá-la também.
  useEffect(() => {
    setHudInsets({ right: open ? SIDEBAR_W + SIDEBAR_GAP : pinnedOnly ? PINNED_RIGHT + SIDEBAR_W + SIDEBAR_GAP : 0 });
  }, [open, pinnedOnly]);

  const asideRef = useRef<HTMLElement>(null);
  const phRef = useRef<HTMLDivElement>(null);
  usePanelDrag(asideRef, phRef);

  // Tela baixa (720p): a coluna rola, mas a barra de rolagem é escondida — marca "tem mais embaixo" (mochila!).
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const check = () => el.classList.toggle("more-below", el.scrollHeight - el.scrollTop - el.clientHeight > 6);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    const mo = new MutationObserver(() => { for (const c of Array.from(el.children)) ro.observe(c); check(); });
    mo.observe(el, { childList: true });
    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => { ro.disconnect(); mo.disconnect(); el.removeEventListener("scroll", check); };
  }, []);

  // Ao estreitar a janela abaixo do limite, recolhe (uma vez por cruzamento).
  useEffect(() => {
    let wasNarrow = window.innerWidth < NARROW_PX;
    const onResize = () => {
      const narrow = window.innerWidth < NARROW_PX;
      if (narrow && !wasNarrow) sidebarOpen.set(false);
      wasNarrow = narrow;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div class={`hud-side${open ? " open" : ""}`}>
      <nav class="hud-rail" aria-label="Painéis">
        <button
          class="rail-btn"
          onClick={() => toggle(sidebarOpen)}
          data-tip={open ? "Recolher painel" : "Abrir painel"}
          aria-label={open ? "Recolher painel" : "Abrir painel"}
          aria-expanded={open}
        >
          <span class={`rail-chevron${open ? "" : " flip"}`} aria-hidden="true" />
        </button>
        <span class="rail-sep" />
        <button class={`rail-btn${skills ? " active" : ""}`} onClick={() => toggle(skillsOpen)} data-tip="Habilidades" data-tip-sub="Tecla K" aria-label="Habilidades" aria-pressed={skills}>
          <PixelIcon name="chart" size={14} />
        </button>
        <button class={`rail-btn${outfit ? " active" : ""}`} onClick={toggleOutfit} data-tip="Roupas" data-tip-sub="Tecla O" aria-label="Roupas" aria-pressed={outfit}>
          <PixelIcon name="shirt" size={14} />
        </button>
        <button class={`rail-btn${questLog ? " active" : ""}`} onClick={toggleQuestLog} data-tip="Diário de missões" data-tip-sub="Tecla L" aria-label="Diário de missões" aria-pressed={questLog}>
          <PixelIcon name="scroll" size={14} />
        </button>
        <button class={`rail-btn${achOpen ? " active" : ""}`} onClick={toggleAchievements} data-tip="Conquistas" data-tip-sub="Tecla J" aria-label="Conquistas" aria-pressed={achOpen}>
          <PixelIcon name="trophy" size={14} />
        </button>
        <button class={`rail-btn${bestiary ? " active" : ""}`} onClick={toggleBestiary} data-tip="Bestiário" data-tip-sub="Tecla B" aria-label="Bestiário" aria-pressed={bestiary}>
          <PixelIcon name="swords" size={14} />
        </button>
        <button class={`rail-btn${rankOpen ? " active" : ""}`} onClick={toggleRanking} data-tip="Ranking" data-tip-sub="Tecla R" aria-label="Ranking" aria-pressed={rankOpen}>
          <PixelIcon name="podium" size={14} />
        </button>
        <button class="rail-btn" onClick={openWorldMap} data-tip="Mapa do mundo" data-tip-sub="Tecla M" aria-label="Mapa do mundo">
          <PixelIcon name="map" size={14} />
        </button>
        <button class={`rail-btn${agenda ? " active" : ""}`} onClick={toggleAgenda} data-tip="Agenda de eventos" data-tip-sub="Eventos da semana · /agenda no chat" aria-label="Agenda de eventos" aria-pressed={agenda} data-testid="rail-agenda">
          <PixelIcon name="calendar" size={14} />
        </button>
        <button class={`rail-btn${help ? " active" : ""}`} onClick={() => { soundOpen.set(false); autoOpen.set(false); a11yOpen.set(false); toggle(helpOpen); }} data-tip="Atalhos" data-tip-sub="Tecla ?" aria-label="Atalhos e ajuda" aria-expanded={help}>
          <span class="rail-q">?</span>
        </button>
        <button
          class={`rail-btn${muted || volume === 0 ? "" : " active"}`}
          onClick={() => { helpOpen.set(false); autoOpen.set(false); a11yOpen.set(false); toggle(soundOpen); }}
          data-tip="Som"
          data-tip-sub={muted ? "Mudo" : `Volume ${volume}%`}
          aria-expanded={sound}
          aria-label="Som"
        >
          <span class="rail-q">{muted || volume === 0 ? "×" : "♪"}</span>
        </button>
        <button
          class={`rail-btn${autoCfg.hp || autoCfg.mana ? " active" : ""}`}
          onClick={() => { helpOpen.set(false); soundOpen.set(false); a11yOpen.set(false); toggle(autoOpen); }}
          data-tip="Poção automática"
          data-tip-sub={autoCfg.hp || autoCfg.mana ? `Vida ${autoCfg.hp ? autoCfg.hp + "%" : "off"} · Mana ${autoCfg.mana ? autoCfg.mana + "%" : "off"}` : "Desligada"}
          aria-expanded={autoPop}
          aria-label="Poção automática"
        >
          <span class="rail-q">⚗</span>
        </button>
        <button
          class="rail-btn"
          onClick={() => { helpOpen.set(false); soundOpen.set(false); autoOpen.set(false); toggle(a11yOpen); }}
          data-tip="Acessibilidade"
          data-tip-sub="Texto, contraste e animações"
          aria-expanded={a11yPop}
          aria-label="Acessibilidade"
        >
          <span class="rail-q">Aa</span>
        </button>
        {a11yPop && <A11yPopover />}
        {autoPop && <AutoPotionPopover />}
        {help && <HelpPopover />}
        {sound && <SoundPopover />}
      </nav>
      {showVitals && <CompactVitals />}
      <aside
        ref={asideRef}
        class={`hud-panel${pinnedOnly ? " pinned-only" : ""}${showVitals ? " with-vitals" : ""}`}
        aria-hidden={!open && !pinnedOnly}
        inert={!open && !pinnedOnly}
      >
        {order.map((id) => PANELS[id])}
        <div class="panel-ph" ref={phRef} aria-hidden="true" />
        <button
          class="panel-more" tabIndex={-1} aria-label="Rolar a barra lateral para baixo"
          onClick={() => asideRef.current?.scrollBy({ top: 220, behavior: "smooth" })}
        >▾</button>
      </aside>
    </div>
  );
}

/** Direita da coluna de fixados com a barra recolhida: margem (8) + trilho (34) + folga (6). */
const PINNED_RIGHT = 48;

function MinimapCard() {
  const pinned = useStore(panelPinsStore).minimap;
  return (
    <div class={`hud-card minimap-card${pinned ? " is-pinned" : ""}`} data-panel-id="minimap">
      <div class="minimap-handle" data-drag-handle>
        <span class="drag-grip h" aria-hidden="true" />
        <PinButton id="minimap" />
      </div>
      <div class="minimap-slot"><Minimap /></div>
    </div>
  );
}

const PANELS: Record<PanelId, ComponentChild> = {
  minimap: <MinimapCard key="minimap" />,
  status: <StatusPanel key="status" />,
  equipment: <EquipmentPanel key="equipment" />,
  battle: <BattleList key="battle" />,
  backpack: <Backpack key="backpack" />,
  party: <PartyPanel key="party" />,
};

/** O mapa-múndi (ui/minimap) alterna com a tecla M num listener de window; reutilizamos o mesmo caminho. */
function openWorldMap() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", code: "KeyM" }));
}

/** Mini HP/mana quando o painel está recolhido. */
function CompactVitals() {
  const me = useStore(meStore);
  if (!me) return null;
  return (
    <div class="hud-card compact-vitals" onClick={() => sidebarOpen.set(true)} data-tip="Abrir painel" role="button" tabIndex={0} aria-label="Abrir painel" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sidebarOpen.set(true); } }}>
      <Portrait me={me} size={40} />
      <div class="compact-bars">
        <StatBar kind="hp" value={me.hp} max={me.maxHp} text={`${me.hp}`} />
        <StatBar kind="mana" value={me.mana} max={me.maxMana} text={`${me.mana}`} />
      </div>
    </div>
  );
}
