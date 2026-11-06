// Janela "Coliseu" (Mestre do Coliseu): lista de grupos abertos, criar/entrar/sair/iniciar, modificador da semana das
// ondas 61–70 e os melhores tempos das 70 ondas (ciclo 16).
import {
  ARENA_COUNT, ARENA_MAX_WAVE, ARENA_MOD_FROM_WAVE, ARENA_MODS, ARENA_VERSUS_CHESTS, ARENA_WEEK_PRIZE_CHESTS, arenaTimeText,
  partyMinLevel, timeLeftText,
  type ArenaLobbiesMsg, type ArenaTimeRecord, type ArenaWaveRecord,
} from "@lemonquest/shared";
import { session } from "../../session.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { arenaAction, arenaLobbiesStore, arenaStateStore, arenaWindowOpen, closeArenaWindow, phaseRemaining } from "./arena.ts";
import { useTicker } from "./useTicker.ts";
import { ArenaQuests } from "../quests/NpcQuests.tsx";
import { partyStore } from "../party/party.ts";
import "./arena.css";

function TimeRow({ label, r }: { label: string; r: ArenaTimeRecord | undefined }) {
  const mod = r ? ARENA_MODS[r.mod] : undefined;
  return (
    <div class="arena-time-row">
      <span>{label}</span>
      {r ? (
        <>
          <b>{arenaTimeText(r.ms)}</b>
          <span class="arena-time-names" data-tip={r.names.join(", ")} data-tip-sub={mod ? `${mod.icon} ${mod.name} · semana ${r.week}` : undefined}>{r.names.join(", ")}</span>
        </>
      ) : <span class="arena-time-names">ninguém ainda</span>}
    </div>
  );
}

/** Modificador da semana (ondas 61–70) e melhores tempos das 70 ondas. */
function WeekInfo({ week }: { week: NonNullable<ArenaLobbiesMsg["week"]> }) {
  const mod = ARENA_MODS[week.mod];
  return (
    <div class="arena-week">
      {mod && (
        <div class="arena-week-mod" data-tip="Modificador da semana" data-tip-sub={`Troca na segunda-feira (em ${timeLeftText(week.endsAt, Date.now())}). A partida usa o da semana em que começou.`}>
          <span class="arena-mod-icon" aria-hidden="true">{mod.icon}</span>
          <span>Ondas {ARENA_MOD_FROM_WAVE}–{ARENA_MAX_WAVE} desta semana: <b>{mod.name}</b> — {mod.desc}</span>
        </div>
      )}
      <div class="arena-sub">Tempo para vencer as {ARENA_MAX_WAVE} ondas</div>
      <TimeRow label="Semana" r={week.best} />
      <TimeRow label="Recorde" r={week.record} />
      <div class="arena-hint">O grupo do melhor tempo da semana leva o título "Campeão do Coliseu" até a semana seguinte.</div>
      <WavesTop waves={week.waves ?? []} />
    </div>
  );
}

/** Coliseu competitivo (2026-11-06): os 5 grupos que mais longe chegaram na semana. */
function WavesTop({ waves }: { waves: ArenaWaveRecord[] }) {
  return (
    <>
      <div class="arena-sub">Ondas da semana (todo grupo entra)</div>
      {!waves.length ? <div class="arena-time-row"><span class="arena-time-names">ninguém ainda</span></div> : waves.map((r, i) => (
        <div key={r.at} class="arena-time-row">
          <span>{i + 1}º</span>
          <b>{r.wave} ondas</b>
          <span class="arena-time-names" data-tip={r.names.join(", ")} data-tip-sub={`em ${arenaTimeText(r.ms)}`}>{r.names.join(", ")}</span>
        </div>
      ))}
      <div class="arena-hint">Na virada da semana, o 1º lugar ganha {ARENA_WEEK_PRIZE_CHESTS} Baús de Recompensa para cada um. Também no chat: /coliseu.</div>
    </>
  );
}

export function ArenaWindow() {
  const open = useStore(arenaWindowOpen);
  const list = useStore(arenaLobbiesStore);
  const st = useStore(arenaStateStore);
  const party = useStore(partyStore);
  useTicker(open && st?.s.phase === "countdown" ? 250 : 0);
  const drag = useWindowDrag("arena");
  useDialogFocus(drag.ref, open);
  if (!open) return null;
  const mine = st && !st.s.arenaId ? st.s : null;
  const myName = session.myName;
  // Faixa do Coliseu (mesma regra da XP compartilhada; server/systems/arena.ts, waveCleared): a cada onda vencida, quem
  // está abaixo de 2/3 do maior level entre os vivos não ganha XP nem ouro da onda (nem o bônus de completar). No lobby
  // a prévia usa todos os membros.
  const minLv = partyMinLevel(Math.max(0, ...(mine?.members ?? []).map((m) => m.level ?? 0)));
  const leader = mine?.leader === myName;
  return (
    <div ref={drag.ref} class={`hud-card hud-window arena-window${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Coliseu">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Coliseu</span>
        <button class="win-close" onClick={closeArenaWindow} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      <div class="arena-body">
        <div class="arena-info">
          Arenas livres: <b>{list?.freeArenas ?? "?"}/{ARENA_COUNT}</b> · Fila: <b>{list?.queue ?? 0}</b>
        </div>
        <div class="arena-hint">Enfrente {ARENA_MAX_WAVE} ondas de monstros sozinho ou em grupo (sem limite de pessoas). As ondas vêm uma atrás da outra; depois de cada chefe (ondas 5, 10, 15...) há uma pausa para comprar e curar. Dá para sair a qualquer momento (botão Sair) ficando com o que já ganhou. Cair aqui não tem penalidade. XP e ouro das ondas só para quem tem pelo menos 2/3 do level do mais alto do grupo ainda de pé (conta de novo a cada onda); quem fica abaixo luta sem ganhar nada.</div>
        {list?.week && <WeekInfo week={list.week} />}
        <ArenaQuests />
        {mine ? (
          <div class="arena-mine">
            <div class="arena-mine-title">
              Seu grupo · {mine.phase === "queued" ? "na fila" : mine.phase === "countdown" ? `entrando em ${Math.ceil(phaseRemaining(st) / 1000)} s` : "aguardando"}
            </div>
            <ul class="arena-members">
              {mine.members.map((m) => (
                <li key={m.name}>
                  {m.name === mine.leader ? "👑 " : ""}{m.name}
                  {m.level !== undefined && <span class="arena-lv"> · Lv {m.level}</span>}
                  {m.level !== undefined && m.level < minLv && <span class="arena-noxp" data-tip={`Abaixo do level ${minLv} (2/3 do maior do grupo): sem XP nem ouro das ondas`}> sem XP/ouro</span>}
                </li>
              ))}
            </ul>
            <div class="arena-actions">
              {leader && mine.phase === "lobby" && (
                <button class="arena-btn primary" onClick={() => arenaAction({ action: "start" })}>
                  Iniciar{mine.members.length === 1 ? " (solo)" : ""}
                </button>
              )}
              {mine.phase !== "countdown" && <button class="arena-btn" onClick={() => arenaAction({ action: "leave" })}>Sair</button>}
            </div>
          </div>
        ) : (
          <div class="arena-actions">
            <button class="arena-btn primary" onClick={() => arenaAction({ action: "create" })}>Criar grupo</button>
            {party && party.leaderId === session.myId && party.members.length > 1 && (
              <button
                class="arena-btn"
                onClick={() => arenaAction({ action: "create", withParty: true })}
                data-tip="Cria o grupo do Coliseu já com os membros do seu grupo que estão perto do Mestre"
              >Criar grupo do Coliseu com meu grupo</button>
            )}
          </div>
        )}
        <div class="arena-sub">Grupos abertos</div>
        {!list?.lobbies.length ? <div class="hud-empty">Nenhum grupo aberto. Crie o seu!</div> : (
          <ul class="arena-lobbies">
            {list.lobbies.map((l) => {
              const isMine = mine?.lobbyId === l.id;
              // Desafio grupo × grupo: o líder do lobby desafia outro lobby; o líder desafiado responde aqui.
              const myLobby = list.lobbies.find((x) => x.id === mine?.lobbyId);
              const canChallenge = !!mine && leader && mine.phase === "lobby" && !isMine && !myLobby?.versusTo && l.versusTo !== mine.lobbyId;
              const challengedMe = !!mine && leader && l.versusTo === mine.lobbyId;
              const sent = myLobby?.versusTo === l.id;
              return (
                <li key={l.id} class={`arena-lobby${isMine ? " mine" : ""}`}>
                  <div class="arena-lobby-main">
                    <div class="arena-lobby-leader">{l.leader}</div>
                    <div class="arena-lobby-sub">{l.members.join(", ")} · lv médio {l.avgLevel}</div>
                  </div>
                  <span class="arena-slots">{l.members.length}</span>
                  {!mine && (
                    <button class="arena-btn" onClick={() => arenaAction({ action: "join", lobbyId: l.id })}>Entrar</button>
                  )}
                  {canChallenge && (
                    <button class="arena-btn" onClick={() => arenaAction({ action: "versus", lobbyId: l.id })}
                      data-tip="Desafiar este grupo" data-tip-sub={`Os dois grupos começam juntos, em salas separadas e com as mesmas ondas. Vence quem passar mais ondas (empate: quem chegou mais rápido); ${ARENA_VERSUS_CHESTS} Baú de Recompensa para cada um do grupo vencedor.`}>Desafiar</button>
                  )}
                  {sent && <span class="arena-slots" data-tip="Esperando a resposta do líder">desafiado…</span>}
                  {challengedMe && (
                    <>
                      <button class="arena-btn primary" onClick={() => arenaAction({ action: "versusAnswer", lobbyId: l.id, accept: true })} data-tip="Aceitar o desafio deste grupo">Aceitar desafio</button>
                      <button class="arena-btn" onClick={() => arenaAction({ action: "versusAnswer", lobbyId: l.id, accept: false })}>Recusar</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
