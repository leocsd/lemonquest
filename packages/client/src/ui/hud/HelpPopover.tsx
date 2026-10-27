// Cola de atalhos de teclado.
import { useEffect, useRef } from "preact/hooks";
import { bindOverlay } from "../overlays.ts";
import { helpOpen } from "./uiState.ts";
import { newsOpen } from "../news/news.ts";

// Esc pela pilha de sobreposições: a ajuda fecha como qualquer janela, na ordem em que foi aberta.
bindOverlay("help", helpOpen, (v) => v, () => helpOpen.set(false));

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: "Movimento",
    rows: [
      { keys: ["W", "A", "S", "D"], label: "Andar (ou setas)" },
      { keys: ["7", "9", "1", "3"], label: "Diagonais (numpad)" },
      { keys: ["Ctrl", "←↑→↓"], label: "Virar sem andar" },
      { keys: ["Clique"], label: "Andar até o ponto" },
    ],
  },
  {
    title: "Combate",
    rows: [
      { keys: ["1", "–", "0"], label: "Magias da barra (teclas configuráveis em H)" },
      { keys: ["H"], label: "Magias (tecla de cada magia e grupos)" },
      { keys: ["Q", "E"], label: "Poção de vida / mana" },
      { keys: ["F2", "F3", "F4"], label: "Modo de luta (ofensivo · equilibrado · defensivo)" },
      { keys: ["F8"], label: "Seguir o alvo" },
      { keys: ["F9"], label: "Ataque automático" },
      { keys: ["Clique dir."], label: "Jogador: atacar (PvP) · seguir · trocar itens" },
      { keys: ["Esc"], label: "Fechar janela · parar de seguir · limpar alvo" },
    ],
  },
  {
    title: "Mundo e itens",
    rows: [
      { keys: ["Esq.", "+", "Dir."], label: "Olhar (ou Shift + clique)" },
      { keys: ["Clique dir."], label: "Pegar item do chão (ou duplo clique / Ctrl + clique)" },
      { keys: ["Arrastar"], label: "Mover item no chão ou para a mochila (Shift no meio do arrasto: quantidade)" },
      { keys: ["Clique dir."], label: "Na água: pescar (com a Vara de Pesca)" },
      { keys: ["Clique"], label: "NPC, baú ou alavanca: o personagem vai até lá" },
    ],
  },
  {
    title: "Janelas",
    rows: [
      { keys: ["Enter"], label: "Abrir/enviar chat" },
      { keys: ["/ajuda"], label: "Comandos do chat (grupo…)" },
      { keys: ["M"], label: "Mapa do mundo" },
      { keys: ["K"], label: "Habilidades" },
      { keys: ["L"], label: "Diário de missões" },
      { keys: ["I"], label: "Equipamento e mochila" },
      { keys: ["O"], label: "Roupas e addons" },
      { keys: ["J"], label: "Conquistas" },
      { keys: ["R"], label: "Ranking" },
      { keys: ["B"], label: "Bestiário" },
      { keys: ["F1"], label: "Esta ajuda (ou ?)" },
    ],
  },
  {
    // Funções que não tinham pista nenhuma na tela (UX-18).
    title: "Painéis",
    rows: [
      { keys: ["Arrastar"], label: "Cabeçalho do painel: reordenar a barra" },
      { keys: ["📌"], label: "Fixar: visível com a barra recolhida" },
      { keys: ["Arrastar"], label: "Borda de baixo (Batalha/Mochila): altura" },
      { keys: ["Roda"], label: "No minimapa: zoom" },
      { keys: ["Clique"], label: "Relógio do minimapa: efeitos de luz" },
      { keys: ["Clique dir."], label: "Em você: roupa · pegar · sair do grupo" },
    ],
  },
];

export function HelpPopover() {
  const el = useRef<HTMLDivElement>(null);

  // Clique fora fecha.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (el.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.(".hud-rail")) return; // o botão "?" alterna sozinho
      helpOpen.set(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div class="hud-card help-pop" ref={el} role="dialog" aria-label="Atalhos de teclado">
      <div class="help-title">Atalhos</div>
      {GROUPS.map((g) => (
        <section key={g.title} class="help-group">
          <div class="help-sub">{g.title}</div>
          <ul class="help-list">
            {g.rows.map((r) => (
              <li key={r.label}>
                <span class="help-keys">
                  {r.keys.map((k, i) => (k === "–" || k === "+" ? <span key={i} class="help-dash">{k}</span> : <kbd key={i}>{k}</kbd>))}
                </span>
                <span class="help-label">{r.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <button class="btn help-news" onClick={() => { helpOpen.set(false); newsOpen.set(true); }}>Novidades</button>
    </div>
  );
}
