// Lista de criaturas/jogadores próximos. Clique seleciona o alvo (target.ts); botão direito num jogador: o mesmo menu do
// mundo (ui/social/playerMenu.ts: seguir, grupo, troca e, por último, atacar).
import { useEffect, useMemo } from "preact/hooks";
import { session } from "../../session.ts";
import { openPlayerMenu } from "../social/playerMenu.ts";
import { battleSourcesStore, buildBattleList, BATTLE_RANGE, type BattleEntry } from "./battle.ts";
import { FightModeControls } from "./FightMode.tsx";
import { Section } from "./Section.tsx";
import { useStore } from "./store.ts";
import { clearTarget, targetStore, toggleTarget } from "./target.ts";
import { vocationMeta } from "./vocations.ts";
import { playersStore, selectMe } from "./world.ts";

const hpColor = (pct: number) => (pct > 60 ? "#5bbf5b" : pct > 30 ? "#d9a441" : pct > 10 ? "#d9534f" : "#8f2a2a");

/** Lista pura (recebe entradas prontas) — reutilizável por outras fontes. */
export function BattleRows({ entries }: { entries: BattleEntry[] }) {
  const target = useStore(targetStore);
  const followId = selectMe(useStore(playersStore))?.followId ?? "";
  const menu = (ev: MouseEvent, e: BattleEntry) => {
    ev.preventDefault();
    if (e.kind !== "player") { toggleTarget({ id: e.id, kind: e.kind }); return; }
    openPlayerMenu(e.id, ev.clientX, ev.clientY);
  };
  if (entries.length === 0) {
    return (
      <div class="hud-empty battle-empty">
        <span class="battle-empty-dot" />
        Ninguém por perto
      </div>
    );
  }
  return (
    <ul class="battle-list">
      {entries.map((e) => {
        const sel = target?.id === e.id && target.kind === e.kind;
        const fol = !sel && e.kind === "player" && followId === e.id;
        return (
          <li key={`${e.kind}:${e.id}`}>
            <button
              class={`battle-row ${e.kind}${sel ? " selected" : ""}${fol ? " following" : ""}`}
              style={e.color ? ({ "--row-accent": e.color } as any) : undefined}
              onClick={() => toggleTarget({ id: e.id, kind: e.kind })}
              onContextMenu={(ev) => menu(ev as MouseEvent, e)}
              data-tip={e.name}
              data-tip-sub={`${e.kind === "player" ? `Jogador${fol ? " (seguindo)" : ""} · botão direito: seguir, grupo, troca, atacar` : `Criatura${e.elite ? " elite" : ""}${e.difficulty ? ` ${e.difficulty}` : ""}${e.pack ? " · chama o bando" : ""}`} · ${e.distance} sqm · ${e.hpPct}% HP`}
            >
              <span class="battle-mark" aria-hidden="true" />
              <span class="battle-main">
                <span class="battle-name">
                  {(e.difficulty === "perigosa" || e.difficulty === "chefe") && <span class="battle-danger" aria-label={e.difficulty}>! </span>}
                  {e.elite && <span class="battle-elite" role="img" aria-label="elite">★ </span>}
                  {e.name}
                  {e.pack && <span class="battle-pack" role="img" title="Chama o bando" aria-label="chama o bando"> ⚑</span>}
                </span>
                <span class="battle-hp">
                  <span style={{ width: `${e.hpPct}%`, background: hpColor(e.hpPct) }} />
                </span>
              </span>
              <span class="battle-dist">{e.distance}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function BattleList() {
  const players = useStore(playersStore);
  const extra = useStore(battleSourcesStore);
  const entries = useMemo(() => {
    const list = buildBattleList(players, session.myId, extra, BATTLE_RANGE);
    for (const e of list) if (e.kind === "player" && !e.color) e.color = vocationMeta(players.get(e.id)?.vocation ?? "").color;
    return list;
  }, [players, extra]);
  const target = useStore(targetStore);

  // Alvo que saiu do jogo deixa de existir.
  useEffect(() => {
    if (target?.kind === "player" && !players.has(target.id)) clearTarget();
  }, [players, target]);

  return (
    <Section id="battle" title="Batalha" aside={<span class="count-chip">{entries.length}</span>} size="battle" class="battle-section" controls={<FightModeControls />}>
      <BattleRows entries={entries} />
    </Section>
  );
}
