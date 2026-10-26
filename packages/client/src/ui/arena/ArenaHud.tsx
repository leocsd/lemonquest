// HUD da partida do coliseu (topo, centro): contagem 3-2-1, "Onda 7 · 5 monstros", respiro entre ondas, pausa com
// "Pronto" (depois das ondas-chefe), botão de sair (com confirmação), faixa de onda e cartão de resultado. Ciclo 16:
// modificador da semana nas ondas 61–70 e o relógio da partida (ranking de tempo das 70 ondas).
import { useEffect, useState } from "preact/hooks";
import { ARENA_MAX_WAVE, ARENA_MOD_FROM_WAVE, ARENA_MODS, arenaTimeText, partyMinLevel, type ArenaModId } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { useStore } from "../hud/store.ts";
import { arenaAction, arenaBannerStore, arenaResultStore, arenaStateStore, phaseRemaining } from "./arena.ts";
import { useTicker } from "./useTicker.ts";
import "./arena.css";

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Selo do modificador da semana (só nas ondas 61–70). */
function ModChip({ mod, wave }: { mod?: ArenaModId; wave: number }) {
  const m = mod ? ARENA_MODS[mod] : undefined;
  if (!m || wave < ARENA_MOD_FROM_WAVE) return null;
  return <><span class="sep">·</span><span class="arena-mod" data-tip={m.name} data-tip-sub={m.desc}>{m.icon} {m.name}</span></>;
}

/** Relógio da partida (desde a onda 1, no relógio do servidor). */
function Clock({ startedAt, offset }: { startedAt?: number; offset: number }) {
  if (!startedAt) return null;
  return <><span class="sep">·</span><span class="arena-clock" data-tip="Tempo da partida" data-tip-sub="Ranking de tempo das 70 ondas">⏱ {arenaTimeText(Date.now() + offset - startedAt)}</span></>;
}

/** Faixa de onda e cartão de resultado. A barra da partida (MatchBar) fica na pilha do topo (App). */
export function ArenaHud() {
  return (
    <>
      <WaveBanner />
      <ResultCard />
    </>
  );
}

export function MatchBar() {
  const st = useStore(arenaStateStore);
  const phase = st?.s.phase;
  useTicker(phase === "countdown" || phase === "pause" || phase === "break" || phase === "queued" ? 200 : phase === "fight" ? 1000 : 0);
  if (!st) return null;
  const s = st.s;
  const left = phaseRemaining(st);
  const secs = Math.ceil(left / 1000);
  // Contagem dentro da arena: números grandes.
  if (s.phase === "countdown" && s.arenaId && s.wave === 0 && left > 0 && secs <= 3) {
    return <div class="arena-count" key={secs}>{secs}</div>;
  }
  if (!s.arenaId) {
    if (s.phase === "countdown") return <div class="arena-bar">Entrando no Coliseu em <b>{secs}</b> s</div>;
    return (
      <div class="arena-bar small">
        Coliseu · {s.phase === "queued" ? "na fila, aguardando uma arena" : `grupo de ${s.members.length} — fique perto do Mestre`}
      </div>
    );
  }
  if (s.phase === "countdown") return <div class="arena-bar">Prepare-se… <b>{secs}</b></div>;
  if (s.phase === "fight") {
    const boss = s.wave % 5 === 0;
    return (
      <div class={`arena-bar${boss ? " boss" : ""}`}>
        <span>Onda <b>{s.wave}</b>/{ARENA_MAX_WAVE}</span>
        <span class="sep">·</span>
        <span>{s.monstersLeft ?? 0} {s.monstersLeft === 1 ? "monstro" : "monstros"}</span>
        <ModChip mod={s.mod} wave={s.wave} />
        <Clock startedAt={s.startedAt} offset={st.offset} />
        <LeaveButton />
      </div>
    );
  }
  if (s.phase === "break") {
    const next = s.wave + 1;
    return (
      <div class="arena-bar">
        <span>Onda <b>{s.wave}</b> vencida! Próxima{next % 5 === 0 ? " (chefe!)" : ""} em <b>{secs}</b> s</span>
        <ModChip mod={s.mod} wave={next} />
        <LeaveButton />
      </div>
    );
  }
  if (s.phase === "pause") {
    const me = s.members.find((m) => m.name === session.myName);
    // Mesma faixa do servidor (membros vivos): abaixo de 2/3 do maior level a onda não paga XP nem ouro.
    const minLv = partyMinLevel(Math.max(0, ...s.members.filter((m) => m.alive).map((m) => m.level ?? 0)));
    return (
      <div class="arena-bar pause">
        <div class="arena-pause-row">
          <span>Pausa · <b>{secs}</b> s</span>
          <button class={`arena-btn primary${me?.ready ? " done" : ""}`} disabled={!me?.alive || me?.ready} onClick={() => arenaAction({ action: "ready" })}>
            {me?.ready ? "Pronto ✓" : "Pronto"}
          </button>
          <LeaveButton />
        </div>
        <div class="arena-pause-members">
          {s.members.map((m) => (
            <span key={m.name} class={m.alive ? "" : "out"} data-tip={m.ready ? "Pronto" : m.alive ? "Ainda não clicou em Pronto" : "Fora da partida (caiu ou desistiu)"}>
              {m.ready ? "✓" : m.alive ? "…" : "✗"} {m.name}
              {m.alive && m.level !== undefined && m.level < minLv && <span class="arena-noxp" data-tip={`Abaixo do level ${minLv}: sem XP nem ouro`}> sem XP/ouro</span>}
            </span>
          ))}
        </div>
        <div class="arena-pause-hint">Próxima: onda {s.wave + 1}{(s.wave + 1) % 5 === 0 ? " (chefe!)" : ""} · Vendedor do Coliseu aberto · ganho: {fmt(s.earned.xp)} XP, {fmt(s.earned.gold)} ouro</div>
        {s.wave + 1 === ARENA_MOD_FROM_WAVE && s.mod && ARENA_MODS[s.mod] && (
          <div class="arena-pause-hint">Ondas {ARENA_MOD_FROM_WAVE}–{ARENA_MAX_WAVE} desta semana: {ARENA_MODS[s.mod].icon} <b>{ARENA_MODS[s.mod].name}</b> — {ARENA_MODS[s.mod].desc}</div>
        )}
      </div>
    );
  }
  return null;
}

/** Sair do Coliseu: o primeiro clique pede confirmação ali mesmo (sem diálogo do navegador); some sozinha em 4 s. */
function LeaveButton() {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = window.setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(t);
  }, [asking]);
  if (!asking) {
    return <button class="arena-btn arena-leave" onClick={() => setAsking(true)} data-tip="Volta para a Vila com o que já ganhou">Sair</button>;
  }
  return (
    <span class="arena-leave-ask">
      Sair do Coliseu?
      <button class="arena-btn danger" onClick={() => { setAsking(false); arenaAction({ action: "leave" }); }}>Sim, sair</button>
      <button class="arena-btn" onClick={() => setAsking(false)}>Não</button>
    </span>
  );
}

function WaveBanner() {
  const b = useStore(arenaBannerStore);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!b) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [b?.nonce]);
  if (!b || !show) return null;
  return (
    <div class={`arena-banner${b.boss ? " boss" : ""}`} key={b.nonce}>
      {b.boss ? `Onda ${b.wave} — Chefe!` : `Onda ${b.wave}!`}
    </div>
  );
}

const REASON: Record<string, string> = {
  wiped: "Você caiu na arena",
  gave_up: "Você saiu do Coliseu",
  completed: "Coliseu conquistado!",
};

function ResultCard() {
  const r = useStore(arenaResultStore);
  if (!r) return null;
  return (
    <div class="hud-card arena-result" role="dialog" aria-label="Resultado do Coliseu">
      <div class="arena-result-title">{REASON[r.reason] ?? "Fim da partida"}</div>
      <div class="arena-result-waves">{r.wavesCleared} {r.wavesCleared === 1 ? "onda vencida" : "ondas vencidas"}</div>
      <div class="arena-result-grid">
        <span>XP</span><b>+{fmt(r.xp)}</b>
        <span>Ouro</span><b class="gold">+{fmt(r.gold)}</b>
        <span>Recorde</span><b>{r.best}{r.best === r.wavesCleared && r.wavesCleared > 0 ? " ★" : ""}</b>
        {r.timeMs !== undefined && <><span>Tempo</span><b>{arenaTimeText(r.timeMs)}{r.timeRecord ? " ★" : ""}</b></>}
      </div>
      {r.timeRecord && (
        <div class="arena-result-hint">
          {r.timeRecord === "server" ? "Novo recorde de tempo do Coliseu!" : "Melhor tempo da semana!"} Na virada da semana, o grupo do melhor tempo leva o título "Campeão do Coliseu".
        </div>
      )}
      {r.reason === "wiped" && <div class="arena-result-hint">Sem penalidade: a recompensa das ondas vencidas é sua.</div>}
      <button class="arena-btn primary" onClick={() => arenaResultStore.set(null)}>Fechar</button>
    </div>
  );
}
