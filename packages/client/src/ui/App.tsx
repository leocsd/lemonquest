import { useEffect, useState } from "preact/hooks";
import { session } from "../session.ts";
import { Login } from "./Login.tsx";
import { useLoginReady } from "./loading.ts";
import { Chat } from "./Chat.tsx";
import { Toasts } from "./Toasts.tsx";
import { PartyInvites } from "./party/PartyInvites.tsx";
import { ExcursionCards } from "./excursions/ExcursionCards.tsx";
import { TradeInvite, TradeWindow } from "./trade/TradeWindow.tsx";
import { EventBadge } from "./events/EventBadge.tsx";
import { MatchBar } from "./arena/ArenaHud.tsx";
import { InvasionBar } from "./invasion/InvasionBar.tsx";
import { FeedTicker } from "./items/LootToasts.tsx";
import { LookCardView } from "./look/LookCard.tsx";
import { NewsWindow } from "./news/NewsWindow.tsx";
import { ChallengesWindow } from "./challenges/ChallengesWindow.tsx";
import { AgendaWindow } from "./agenda/AgendaWindow.tsx";
import { BestiaryWindow } from "./bestiary/Bestiary.tsx";
import { LootFilterWindow } from "./items/LootFilterWindow.tsx";
import { Hud } from "./hud/Hud.tsx";
import { TeleportFade } from "./fx/TeleportFade.tsx";
import { CombatOverlays } from "./combat/CombatOverlays.tsx";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import { Announce } from "./Announce.tsx";
import { FXTEST } from "../game/fxtest.ts";
import { UITEST } from "./uitest/flag.ts";
import { WorldMapOverlay, ZoneBanner } from "./minimap/Minimap.tsx";

export function App() {
  const [connected, setConnected] = useState(false);

  useEffect(() => session.onRoom(() => setConnected(true)), []);
  useEffect(() => { if (UITEST) void import("./uitest/harness.ts").then((m) => m.startUiTest()); }, []);
  useNoNativeContextMenu();

  // O login só aparece com o mapa pronto (ou após 15 s): nada de caixa de login sobre tela preta.
  const loginReady = useLoginReady();
  if (!connected && !FXTEST && !UITEST) return loginReady ? <Login /> : null;
  return (
    <>
      <Hud />
      {/* Centro do topo numa pilha só (nada se sobrepõe): evento, barra do Coliseu, avisos, notícias e convites. */}
      <div class="top-stack">
        <EventBadge />
        <InvasionBar />
        <MatchBar />
        <Toasts />
        <FeedTicker />
        <PartyInvites />
        <ExcursionCards />
        <TradeInvite />
      </div>
      <LookCardView />
      <TradeWindow />
      <NewsWindow />
      <ChallengesWindow />
      <AgendaWindow />
      <BestiaryWindow />
      <LootFilterWindow />
      <Chat />
      <WorldMapOverlay />
      <ZoneBanner />
      <Announce />
      <TeleportFade />
      <CombatOverlays />
      <ConnectionStatus />
    </>
  );
}

/**
 * Botão direito sobre o HUD (#ui) não abre o menu nativo do navegador: no jogo o botão direito é ação (olhar, menu de
 * contexto, vender, pegar) e o menu do navegador aparecia por cima dos painéis. Campos de texto (chat, quantidade, ouro
 * da troca) ficam com o menu nativo: copiar/colar.
 */
function useNoNativeContextMenu() {
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.("#ui")) return;
      if (t.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);
}
