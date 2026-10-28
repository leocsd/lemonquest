import { useEffect, useRef, useState } from "preact/hooks";
import { C2S, EMOTES, MAX_CHAT_LEN, S2C, type ChatMessage, type ChatSendMsg, type NoticeMsg } from "@lemonquest/shared";
import { session } from "../session.ts";
import { isTyping } from "./focus.ts";
import { persistedBool, useStore } from "./hud/store.ts";
import { FEED_COLOR, onFeed } from "./items/loot.ts";
import { rarityColor } from "./items/itemInfo.ts";
import { partyStore } from "./party/party.ts";
import { subscribeHudInsets } from "./hud/layout.ts";
import { inTab, pushLine, pushNotice, type Line, type Tab } from "./chatLines.ts";
import { addedLines, decideScroll, scrolledAtBottom, unseenText } from "./chatScroll.ts";
import { onToast } from "./toasts.ts";
import { chatDraftStore } from "./chatDraft.ts";

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const collapsedStore = persistedBool("chatCollapsed", false);

/**
 * Janela estreita (meia tela, barra lateral aberta): a barra de magias centrada na área de jogo passa por baixo do
 * chat. Nesse caso o chat sobe para cima dela. Mede depois das transições de largura/posição (220 ms).
 */
function useLiftOverDock(chat: { current: HTMLDivElement | null }): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    let t = 0;
    const check = () => {
      const dock = document.querySelector(".bottom-dock")?.getBoundingClientRect(), el = chat.current;
      if (!dock || !el || dock.width === 0) return;
      const chatRight = el.getBoundingClientRect().left + el.offsetWidth;
      setLift(chatRight + 6 > dock.left ? Math.ceil(dock.height) + 8 : 0);
    };
    const later = () => { clearTimeout(t); t = window.setTimeout(check, 260); };
    check();
    later();
    window.addEventListener("resize", later);
    const off = subscribeHudInsets(later);
    return () => { clearTimeout(t); window.removeEventListener("resize", later); off(); };
  }, []);
  return lift;
}

export function Chat() {
  const [lines, setLines] = useState<Line[]>([]);
  const collapsed = useStore(collapsedStore);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<Tab>("global");
  const [partyUnread, setPartyUnread] = useState(0);
  const [emotesOpen, setEmotesOpen] = useState(false);
  const party = useStore(partyStore);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const root = useRef<HTMLDivElement>(null);
  const lift = useLiftOverDock(root);
  // Rolagem: acompanha as mensagens novas; quem subiu para ler o histórico só segura a posição enquanto o mouse está
  // sobre o chat (vê "↓ N novas" e clica para descer); tirou o mouse, volta ao fim.
  const atBottom = useRef(true);
  /** scrollTop deixado pela última rolagem nossa: um evento de scroll nessa posição não é gesto do leitor (chatScroll.ts). */
  const stuckTop = useRef(0);
  const reading = useRef(false);
  const prevLines = useRef<Line[]>([]);
  const [unseen, setUnseen] = useState(0);
  const unseenRef = useRef(0);
  unseenRef.current = unseen;

  useEffect(() => session.onRoom((room) => {
    room.onMessage(S2C.Chat, (m: ChatMessage) => {
      setLines((l) => pushLine(l, m));
      if (m.channel === "party") {
        if (collapsedRef.current || tabRef.current !== "party") setPartyUnread((n) => n + 1);
      } else if (collapsedRef.current || tabRef.current !== "global") setUnread((n) => n + 1);
    });
    // Respostas de comandos de admin (Notice com log): ficam no chat, copiáveis (ex.: código de recuperação).
    room.onMessage(S2C.Notice, (m: NoticeMsg) => {
      if (typeof m?.text !== "string") return;
      if (m.log) setLines((l) => pushLine(l, { from: "", text: m.text, channel: "system", ts: Date.now() }));
      // Avisos (mochila cheia, porta fechada, PZ…): o toast some em segundos; fica uma cópia esmaecida, sem "não lido".
      else if (m.kind === "warn") setLines((l) => pushNotice(l, m.text, Date.now()));
    });
  }), []);
  useEffect(() => onToast((t) => { if (t.kind === "warn") setLines((l) => pushNotice(l, t.text, Date.now())); }), []);

  useEffect(() => onFeed((f) => {
    setLines((l) => pushLine(l, { from: "Servidor", text: f.text, channel: "system", ts: f.ts, feed: f }));
    if (collapsedRef.current || tabRef.current !== "global") setUnread((n) => n + 1);
  }), []);

  useEffect(() => {
    if (collapsed) return;
    if (tab === "global") setUnread(0); else setPartyUnread(0);
  }, [collapsed, tab]);
  // Saiu do grupo: volta para Geral.
  useEffect(() => { if (!party && tab === "party") setTab("global"); }, [party, tab]);

  const jumpToEnd = () => {
    const el = log.current;
    if (el) { el.scrollTop = el.scrollHeight; stuckTop.current = el.scrollTop; }
    atBottom.current = true;
    setUnseen(0);
  };
  useEffect(() => {
    const added = addedLines(prevLines.current, lines, (m) => inTab(m, tab));
    prevLines.current = lines;
    // Recolhido: a lista tem altura 0 e "no fim" não faz sentido; ao abrir, mostra o mais novo (como antes).
    const d = decideScroll(atBottom.current || collapsed, unseen, added, reading.current);
    if (d.scroll) jumpToEnd(); else setUnseen(d.unseen);
  }, [lines, collapsed]);
  // Trocou de aba: começa pelo fim dela.
  useEffect(() => { jumpToEnd(); }, [tab]);
  const onLogScroll = () => {
    const el = log.current;
    if (!el) return;
    atBottom.current = scrolledAtBottom(atBottom.current, stuckTop.current, el.scrollTop, el.clientHeight, el.scrollHeight);
    if (atBottom.current) setUnseen(0);
  };
  const onLogEnter = () => { reading.current = true; };
  // Saiu do chat com mensagens novas esperando: volta ao fim (quem só passou o mouse nem percebe).
  const onLogLeave = () => { reading.current = false; if (unseenRef.current > 0) jumpToEnd(); };

  // Enter (fora de campos de texto) abre o chat. O input já existe no DOM (só fica recolhido), então o
  // foco é síncrono: as teclas digitadas logo depois do Enter já caem no campo e nada se perde.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || isTyping()) return;
      e.preventDefault();
      collapsedStore.set(false);
      input.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Texto pronto (Sussurrar no painel Online): abre na aba Geral com o foco e o cursor no fim.
  useEffect(() => chatDraftStore.subscribe((d) => {
    if (!d) return;
    setTab("global");
    collapsedStore.set(false);
    setText(d.text);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(d.text.length, d.text.length);
    });
  }), []);

  // Clicar fora do chat (ex.: no mapa) devolve o teclado ao jogo. O Phaser cancela o mousedown do
  // canvas, então o navegador não tira o foco sozinho. O texto digitado é mantido.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (document.activeElement !== input.current) return;
      if ((e.target as HTMLElement | null)?.closest?.(".chat")) return;
      input.current?.blur();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, []);

  useEffect(() => {
    if (!emotesOpen) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement | null)?.closest?.(".emote-wrap")) setEmotesOpen(false); };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [emotesOpen]);

  const sendEmote = (id: string) => {
    const msg: ChatSendMsg = { text: `/e ${id}`, channel: "global" };
    session.room?.send(C2S.Chat, msg);
    setEmotesOpen(false);
  };

  const close = () => {
    setText("");
    input.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation(); // o jogo não pode receber as teclas digitadas
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = text.trim();
      if (t) {
        // Comandos (/...) e magias sempre funcionam; no Grupo a fala vai só para o grupo.
        const msg: ChatSendMsg = { text: t, channel: tab };
        session.room?.send(C2S.Chat, msg);
      }
      close();
    }
  };

  return (
    <div ref={root} class={`panel chat${collapsed ? " collapsed" : ""}${typing ? " typing" : ""}`} style={lift ? { bottom: `${10 + lift}px` } : undefined}>
      <div class="chat-head">
        <div class="chat-tabs" role="tablist">
          <button class={`chat-tab${tab === "global" ? " active" : ""}`} role="tab" aria-selected={tab === "global"} onClick={() => { setTab("global"); collapsedStore.set(false); }}>
            Geral
            {(collapsed || tab !== "global") && unread > 0 && <span class="chat-unread">{unread > 9 ? "9+" : unread}</span>}
          </button>
          <button
            class={`chat-tab${tab === "party" ? " active" : ""}`}
            role="tab"
            aria-selected={tab === "party"}
            aria-disabled={!party}
            data-tip="Grupo"
            data-tip-sub={party ? "Só os membros do grupo leem" : "Convide alguém (botão direito no jogador ou /convidar nome)"}
            onClick={() => { if (!party) return; setTab("party"); collapsedStore.set(false); }}
          >
            Grupo
            {(collapsed || tab !== "party") && partyUnread > 0 && <span class="chat-unread">{partyUnread > 9 ? "9+" : partyUnread}</span>}
          </button>
        </div>
        <span class="chat-hint">{typing ? "Esc fecha" : "Enter para falar"}</span>
        <span class="emote-wrap">
          <button class="chat-fold emote-btn" onClick={() => setEmotesOpen((o) => !o)} aria-expanded={emotesOpen} aria-label="Emotes" data-tip="Emotes" data-tip-sub="/e nome">☺</button>
          {emotesOpen && (
            <div class="emote-pop" role="menu" aria-label="Emotes">
              {EMOTES.map((e) => (
                <button key={e.id} role="menuitem" class="emote-item" onClick={() => sendEmote(e.id)} data-emote={e.id}>
                  <span class="emote-glyph" style={{ color: e.color }}>{e.glyph}</span>
                  <span class="emote-name">{e.label}</span>
                </button>
              ))}
            </div>
          )}
        </span>
        <button
          class="chat-fold"
          onClick={() => collapsedStore.set((c) => !c)}
          data-tip={collapsed ? "Mostrar chat" : "Recolher chat"}
          aria-expanded={!collapsed}
        >
          <span class={`chat-caret${collapsed ? " up" : ""}`} aria-hidden="true" />
        </button>
      </div>
      <div class="chat-log" ref={log} onScroll={onLogScroll} onMouseEnter={onLogEnter} onMouseLeave={onLogLeave}>
        {!lines.some((m) => inTab(m, tab)) && (
          <div class="chat-empty">{tab === "party" ? "Nenhuma mensagem do grupo ainda." : "Nenhuma mensagem ainda. Diga oi!"}</div>
        )}
        {lines.map((m) => inTab(m, tab) && (
          <div key={m.key} class={`chat-line ${m.channel}${m.from === session.myName ? " mine" : ""}${m.from ? "" : " sys"}${m.dim ? " dim" : ""}`}>
            <span class="chat-time">{hhmm(m.ts)}</span>
            {m.feed ? (
              <span class="chat-text chat-feed" style={{ color: m.feed.rarity ? rarityColor(m.feed.rarity) : FEED_COLOR[m.feed.kind] }}>
                <b class="chat-from">[Servidor]</b> {m.text}
              </span>
            ) : m.channel === "whisper" ? (
              <span class="chat-text"><b class="chat-from">{m.from === session.myName ? `Você → ${m.to}` : `${m.from} sussurra`}</b> {m.text}</span>
            ) : m.channel === "system" || (m.channel === "party" && !m.from) ? (
              <span class="chat-text">{m.text}</span>
            ) : (
              <span class="chat-text"><b class="chat-from">{m.from}</b> {m.text}</span>
            )}
          </div>
        ))}
      </div>
      {unseen > 0 && !collapsed && (
        <button class="chat-new" onClick={jumpToEnd} aria-label={`${unseen} mensagens novas; ir para o fim`}>{unseenText(unseen)}</button>
      )}
      <div class="chat-input-wrap">
        <input
          ref={input}
          class="chat-input"
          value={text}
          maxLength={MAX_CHAT_LEN}
          tabIndex={-1}
          placeholder={tab === "party" ? "Mensagem para o Grupo…" : "Mensagem para Geral…"}
          aria-label="Mensagem do chat"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={onKeyDown}
          onFocus={() => { setTyping(true); collapsedStore.set(false); }}
          onBlur={() => setTyping(false)}
        />
      </div>
    </div>
  );
}
