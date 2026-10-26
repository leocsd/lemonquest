// Lista do Mural de Excursões: na aba Excursões da Agenda (de qualquer lugar: Quero ir, sair, cancelar, convidar) e na
// janela do NPC Mural de Excursões, que também tem o formulário de postar (só escolhas: destino, faixa, horário, vagas).
import {
  EXCURSION_LEVEL_MAX, EXCURSION_MAX_SLOTS, EXCURSION_MIN_SLOTS, excursionDestinations, excursionTimeSlots, suggestedBand,
  type ExcursionDest, type ExcursionPerson, type ExcursionView,
} from "@lemonquest/shared";
import { useMemo, useState } from "preact/hooks";
import { session } from "../../session.ts";
import { worldIndexStore } from "../../game/worldIndex.ts";
import { useTicker } from "../arena/useTicker.ts";
import { guideTile } from "../hud/guideState.ts";
import { useStore } from "../hud/store.ts";
import { vocationMeta } from "../hud/vocations.ts";
import { meStore, playersStore } from "../hud/world.ts";
import { destGroups, destOptionText, excursionClock, excursionFill, excursionRole, excursionStatus, joinBlock, timeSlotLabel } from "./excursionLogic.ts";
import { excursionAction, excursionNow, excursionsStore } from "./excursions.ts";
import "./excursions.css";

/** `board`: janela do NPC (mostra o formulário de postar). */
export function ExcursionsTab({ board = false }: { board?: boolean }) {
  const data = useStore(excursionsStore);
  const me = useStore(meStore);
  const players = useStore(playersStore);
  useTicker(30_000);
  const onlineNames = useMemo(() => new Set([...players.values()].map((p) => p.name)), [players]);
  const myName = me?.name ?? session.myName;
  const list = data?.list ?? [];
  const mine = list.find((e) => excursionRole(e, myName) === "leader");
  const now = excursionNow();
  return (
    <div class="ex-tab" data-testid="excursions-tab">
      {board && !mine && me && <PostForm level={me.level} />}
      {board && mine && <div class="ex-note">Sua excursão está no mural. Para marcar outra, cancele a atual.</div>}
      {!data && <div class="ex-empty">Carregando…</div>}
      {data && list.length === 0 && (
        <div class="ex-empty">{board ? "Nenhuma excursão marcada. Que tal a primeira?" : "Nenhuma excursão marcada. Marque uma no Mural de Excursões, na praça da Vila."}</div>
      )}
      {list.length > 0 && (
        <ul class="ex-list">
          {list.map((e) => <Card key={e.id} e={e} me={{ name: myName, level: me?.level ?? 0 }} list={list} online={onlineNames} now={now} />)}
        </ul>
      )}
      {!board && list.length > 0 && <div class="ex-foot">Para marcar uma excursão, fale com o Mural de Excursões, na praça da Vila.</div>}
    </div>
  );
}

function Person({ p, online, lead }: { p: ExcursionPerson; online: boolean; lead?: boolean }) {
  const v = vocationMeta(p.vocation);
  return (
    <span class={`ex-person${online ? "" : " off"}`} data-tip={`${p.name}${lead ? " (líder)" : ""}`} data-tip-sub={`lv ${p.level} · ${v.label}${online ? "" : " · fora do jogo"}`}>
      {lead && <span class="ex-crown" aria-label="líder">♛</span>}
      <span class="ex-person-name" style={{ color: v.color }}>{p.name}</span>
      <span class="ex-person-lv">{p.level}</span>
    </span>
  );
}

function Card({ e, me, list, online, now }: { e: ExcursionView; me: { name: string; level: number }; list: ExcursionView[]; online: Set<string>; now: number }) {
  const role = excursionRole(e, me.name);
  const block = joinBlock(e, me, list);
  const status = excursionStatus(e, now);
  const guide = guideSpot(e.dest);
  return (
    <li class={`ex-card${role !== "none" ? ` ex-${role}` : ""}${e.departed ? " ex-departed" : ""}`} data-excursion={e.id}>
      <div class="ex-head">
        <b class="ex-dest">{e.destLabel}</b>
        <span class={`ex-chip${e.departed ? " done" : e.at <= now ? " now" : ""}`}>{status}</span>
        <span class="ex-fill" data-tip="Pessoas / vagas (contando o líder)">{excursionFill(e)}</span>
      </div>
      <div class="ex-meta">
        <span class="ex-when">{excursionClock(e.at, now)}</span>
        <span>· lv {e.minLevel}–{e.maxLevel}</span>
        {e.destLevels && <span class="ex-dim">· monstros lv {e.destLevels.min === e.destLevels.max ? e.destLevels.min : `${e.destLevels.min}–${e.destLevels.max}`}</span>}
      </div>
      <div class="ex-people">
        <Person p={e.leader} online={online.has(e.leader.name)} lead />
        {e.members.map((m) => <Person key={m.name} p={m} online={online.has(m.name)} />)}
      </div>
      <div class="ex-actions">
        {guide && <button class="quest-btn" onClick={() => guideTile(guide.x, guide.y, e.destLabel)} data-tip="Guiar até o destino" data-tip-sub="Seta na tela e marca no minimapa">Guiar</button>}
        {role === "leader" && (
          <>
            <button class="quest-btn primary" disabled={!e.members.length} onClick={() => excursionAction({ action: "inviteAll", id: e.id })} data-tip="Convite de grupo para cada inscrito online">Convidar todos</button>
            <button class="quest-btn danger" onClick={() => excursionAction({ action: "cancel", id: e.id })}>Cancelar</button>
          </>
        )}
        {role === "member" && <button class="quest-btn" onClick={() => excursionAction({ action: "leave", id: e.id })}>Sair da lista</button>}
        {role === "none" && (
          <button class="quest-btn primary" disabled={!!block} onClick={() => excursionAction({ action: "join", id: e.id })} data-tip={block ?? "Avisa o líder; ele te convida para o grupo"}>
            Quero ir
          </button>
        )}
      </div>
    </li>
  );
}

/** Ponto para o guia: covil do chefe ou o Mestre do Coliseu (zona inteira não tem um tile só). */
function guideSpot(dest: string): { x: number; y: number } | null {
  const idx = worldIndexStore.get();
  if (!idx) return null;
  if (dest === "coliseu") return idx.npcAt("arena_master") ?? null;
  if (dest.startsWith("chefe:")) return idx.spawnsOf(dest.slice("chefe:".length))[0] ?? null;
  return null;
}

/** Destino inicial: o primeiro cuja faixa de monstros cobre o seu level (senão o primeiro da lista). */
const defaultDest = (dests: readonly ExcursionDest[], level: number) =>
  (dests.find((d) => d.kind === "zone" && d.levels && d.levels.min <= level && level <= d.levels.max) ?? dests[0])?.id ?? "";

function PostForm({ level }: { level: number }) {
  const idx = useStore(worldIndexStore);
  const dests = useMemo(() => (idx ? excursionDestinations(idx) : []), [idx]);
  const band = suggestedBand(level);
  const [dest, setDest] = useState(() => defaultDest(dests, level));
  const [min, setMin] = useState(band.min);
  const [max, setMax] = useState(band.max);
  const [at, setAt] = useState(0);
  const [slots, setSlots] = useState(4);
  const now = excursionNow();
  const times = excursionTimeSlots(now);
  // O horário escolhido virou passado (a janela ficou aberta): volta para "agora".
  const atOk = times.includes(at) ? at : 0;
  const chosen = dest || defaultDest(dests, level);
  const clamp = (v: number) => Math.max(1, Math.min(EXCURSION_LEVEL_MAX, Math.round(v) || 1));
  const bandOk = min <= max;
  if (!dests.length) return <div class="ex-empty">Carregando o mapa…</div>;
  return (
    <form class="ex-form" onSubmit={(ev) => { ev.preventDefault(); if (bandOk) excursionAction({ action: "post", dest: chosen, minLevel: min, maxLevel: max, at: atOk, slots }); }} data-testid="excursion-form">
      <label class="ex-field ex-wide">
        <span>Destino</span>
        <select value={chosen} onChange={(e) => setDest((e.target as HTMLSelectElement).value)} data-testid="ex-dest">
          {destGroups(dests).map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((d) => <option key={d.id} value={d.id}>{destOptionText(d)}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label class="ex-field">
        <span>Level de</span>
        <input type="number" min={1} max={EXCURSION_LEVEL_MAX} value={min} onChange={(e) => setMin(clamp(Number((e.target as HTMLInputElement).value)))} data-testid="ex-min" />
      </label>
      <label class="ex-field">
        <span>até</span>
        <input type="number" min={1} max={EXCURSION_LEVEL_MAX} value={max} onChange={(e) => setMax(clamp(Number((e.target as HTMLInputElement).value)))} data-testid="ex-max" />
      </label>
      <label class="ex-field">
        <span>Horário</span>
        <select value={String(atOk)} onChange={(e) => setAt(Number((e.target as HTMLSelectElement).value))} data-testid="ex-at">
          {times.map((t) => <option key={t} value={String(t)}>{timeSlotLabel(t, now)}</option>)}
        </select>
      </label>
      <label class="ex-field">
        <span>Vagas</span>
        <select value={String(slots)} onChange={(e) => setSlots(Number((e.target as HTMLSelectElement).value))} data-testid="ex-slots">
          {Array.from({ length: EXCURSION_MAX_SLOTS - EXCURSION_MIN_SLOTS + 1 }, (_, i) => EXCURSION_MIN_SLOTS + i).map((n) => <option key={n} value={String(n)}>{n} pessoas</option>)}
        </select>
      </label>
      <div class="ex-form-foot">
        <span class="ex-dim">{bandOk ? `Faixa sugerida: lv ${band.min}–${band.max} (divide XP com você). Sem texto livre: o resto se combina no grupo.` : "O level mínimo passa do máximo."}</span>
        <button type="submit" class="quest-btn primary" disabled={!bandOk} data-testid="ex-post">Marcar excursão</button>
      </div>
    </form>
  );
}
