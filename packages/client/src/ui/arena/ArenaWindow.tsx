// Janela "Coliseu" (Mestre do Coliseu): lista de grupos abertos, criar/entrar/sair/iniciar.
import { ARENA_COUNT, partyMinLevel } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { arenaAction, arenaLobbiesStore, arenaStateStore, arenaWindowOpen, closeArenaWindow, phaseRemaining } from "./arena.ts";
import { useTicker } from "./useTicker.ts";
import { ArenaQuests } from "../quests/NpcQuests.tsx";
import { partyStore } from "../party/party.ts";
import "./arena.css";

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
        <div class="arena-hint">Enfrente ondas de monstros sozinho ou em grupo (sem limite de pessoas). As ondas vêm uma atrás da outra; depois de cada chefe (ondas 5, 10, 15...) há uma pausa para comprar e curar. Dá para sair a qualquer momento (botão Sair) ficando com o que já ganhou. Cair aqui não tem penalidade. XP e ouro das ondas só para quem tem pelo menos 2/3 do level do mais alto do grupo ainda de pé (conta de novo a cada onda); quem fica abaixo luta sem ganhar nada.</div>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
