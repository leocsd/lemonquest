// Janela de ranking (tecla R): top 10 por categoria, recorde do Coliseu. Dados de GET /api/ranking (cache de 30 s).
// Ciclo 18: a sua linha fica em destaque e, fora do top 10, uma linha extra "você: #N" (RankingResponse.me).
import { useEffect, useState } from "preact/hooks";
import { timeLeftText, type RankingCategoryId } from "@lemonquest/shared";
import { selectStore, useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { meStore } from "../hud/world.ts";
import { session } from "../../session.ts";
import { bindOverlay } from "../overlays.ts";
import { fmtNum, loadRanking, rankingOpen, rankingStore } from "./achievements.ts";
import "./achievements.css";

/** Só o level do seu personagem (a linha "você"): não re-renderiza a cada patch de vida/mana. */
const myLevel = selectStore(meStore, (m) => m?.level ?? 0);

// Esc pela pilha de sobreposições (registrado no instante em que abre: a última janela aberta fecha primeiro).
bindOverlay("ranking", rankingOpen, (v) => v, () => rankingOpen.set(false));

const PAGE_URL = import.meta.env.DEV ? "/ranking.html" : "/ranking";

export function RankingWindow() {
  const open = useStore(rankingOpen);
  if (!open) return null;
  return <RankingDialog />;
}

function RankingDialog() {
  const { data, error } = useStore(rankingStore);
  const [cat, setCat] = useState<RankingCategoryId>("level");
  useEffect(() => { void loadRanking(); }, []);
  const c = data?.categories.find((x) => x.id === cat);
  const showLv = cat !== "level"; // no ranking de level a coluna "Lv" repetiria o valor
  const myName = session.myName;
  const level = useStore(myLevel);
  const mine = data?.me?.[cat];
  const inTop = !!c?.entries.some((e) => e.name === myName);
  const drag = useWindowDrag("ranking");
  useDialogFocus(drag.ref);

  return (
    <div ref={drag.ref} class={`hud-card hud-window rank-win${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Ranking">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Ranking</span>
        <button class="win-close" onClick={() => rankingOpen.set(false)} data-tip="Fechar" data-tip-sub="R ou Esc" aria-label="Fechar">×</button>
      </div>
      <div class="rank-tabs" role="tablist">
        {(data?.categories ?? []).map((x) => (
          <button key={x.id} role="tab" aria-selected={cat === x.id} class={`ach-filter${cat === x.id ? " on" : ""}`} onClick={() => setCat(x.id)}>
            {x.title}
          </button>
        ))}
      </div>
      <div class="rank-body">
        {!data && !error && <div class="ach-empty">Carregando…</div>}
        {error && <div class="ach-empty">Não foi possível carregar o ranking.</div>}
        {c && (
          <table class="rank-table">
            <thead><tr><th>#</th><th>Personagem</th>{showLv && <th>Lv</th>}<th class="num">{c.unit}</th></tr></thead>
            <tbody>
              {c.entries.map((e) => (
                <tr key={e.rank} class={`${e.rank <= 3 ? `top${e.rank}` : ""}${e.name === myName ? " me" : ""}`} aria-current={e.name === myName ? "true" : undefined}>
                  <td>{e.rank}</td><td>{e.name}</td>{showLv && <td>{e.level}</td>}<td class="num">{fmtNum(e.value)}</td>
                </tr>
              ))}
              {c.entries.length === 0 && <tr><td colspan={showLv ? 4 : 3} class="ach-empty">Ninguém ainda.</td></tr>}
              {!inTop && mine && (
                <tr class="me me-extra" data-testid="rank-me">
                  <td>#{mine.rank}</td><td>você</td>{showLv && <td>{level || ""}</td>}<td class="num">{fmtNum(mine.value)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <div class="rank-foot">
        {data && cat.startsWith("week_") && <span data-testid="week-reset">Zera em <b>{timeLeftText(data.weekEndsAt, Date.now())}</b> (segunda 00h)</span>}
        {data && <span>Recorde do Coliseu: <b>{data.arenaServerBest > 0 ? `${data.arenaServerBest} ondas` : "—"}</b></span>}
        <a href={PAGE_URL} target="_blank" rel="noopener">Página pública</a>
      </div>
    </div>
  );
}
