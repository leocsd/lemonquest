// Janela "Novidades": abre sozinha uma vez por versão (para quem já joga) e pelo botão da ajuda (F1).
import { LATEST_NEWS_ID, NEWS, type NewsEntry } from "@lemonquest/shared";
import { useEffect, useRef } from "preact/hooks";
import { session } from "../../session.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { meStore } from "../hud/world.ts";
import { bindOverlay } from "../overlays.ts";
import { markNewsSeen, newsOpen, seenNews } from "./news.ts";
import { shouldAutoShowNews, splitNews } from "./newsLogic.ts";
import "./news.css";

/** Fechar = marcar a versão como vista (pelo ×, "Entendi" ou Esc). */
function closeNews(): void {
  const name = session.myName;
  if (name) markNewsSeen(name);
  newsOpen.set(false);
}
// Esc pela pilha de sobreposições: fecha só esta janela (não tira o alvo).
bindOverlay("news", newsOpen, (v) => v, closeNews);

export function NewsWindow() {
  const open = useStore(newsOpen);
  const me = useStore(meStore);
  const name = session.myName;

  // Abre sozinha uma vez por versão.
  useEffect(() => {
    if (!me || !name || new URLSearchParams(location.search).has("e2e")) return; // testes E2E não são interrompidos
    if (shouldAutoShowNews({ seen: seenNews(name), level: me.level, xp: me.xp }, LATEST_NEWS_ID)) newsOpen.set(true);
  }, [!!me, name]);

  const close = closeNews;
  const winRef = useRef<HTMLDivElement>(null);
  useDialogFocus(winRef, open);

  if (!open) return null;
  // O que já foi visto fica recolhido no histórico (o "visto" só muda ao fechar: reabrir mostra igual até lá).
  const { fresh, history, nothingNew } = splitNews(NEWS, name ? seenNews(name) : null);
  const entry = (n: NewsEntry, latest: boolean) => (
    <section key={n.id} class={`news-entry${latest ? " latest" : ""}`}>
      <h3>{n.title} <span class="news-date">{n.date}</span></h3>
      <ul>{n.items.map((i) => <li key={i}>{i}</li>)}</ul>
    </section>
  );
  return (
    <div ref={winRef} class="news-window panel" role="dialog" aria-label="Novidades">
      <div class="news-head"><b>Novidades</b><button class="news-x" onClick={close} aria-label="Fechar">×</button></div>
      <div class="news-body">
        {nothingNew && <p class="news-none">Nada novo desde a sua última visita. A mais recente:</p>}
        {fresh.map((n) => entry(n, true))}
        {history.length > 0 && (
          <details class="news-history">
            <summary>Histórico ({history.length})</summary>
            {history.map((n) => entry(n, false))}
          </details>
        )}
      </div>
      <div class="news-foot"><button class="party-btn primary" onClick={close}>Entendi</button></div>
    </div>
  );
}
