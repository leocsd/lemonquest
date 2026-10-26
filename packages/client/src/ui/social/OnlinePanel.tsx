// Card "Online" da barra lateral (ciclo 18): quem está no jogo, amigos primeiro, com level e a zona quando a regra do
// /quem deixa (amigos mútuos, grupo e quem está em zona de proteção). Estrela põe/tira dos amigos; + convida para o grupo
// (C2S.Party, como o botão direito); ✉ abre o chat com "/w nome ".
import type { PartyActionMsg } from "@lemonquest/shared";
import { draftChat, whisperDraft } from "../chatDraft.ts";
import { Section } from "../hud/Section.tsx";
import { useStore } from "../hud/store.ts";
import { vocationMeta } from "../hud/vocations.ts";
import { partyAction, partyStore } from "../party/party.ts";
import { session } from "../../session.ts";
import { onlineStore, setFriend } from "./online.ts";
import { canInviteOnline, onlineLine, onlineTip } from "./onlineLogic.ts";
import "./online.css";

export function OnlinePanel() {
  const data = useStore(onlineStore);
  return (
    <Section id="online" title="Online" aside={<span class="count-chip">{data?.list.length ?? 0}</span>} class="online-section">
      <OnlineBody />
    </Section>
  );
}

function OnlineBody() {
  const data = useStore(onlineStore);
  const party = useStore(partyStore);
  if (!data) return <div class="hud-empty">Carregando…</div>;
  const s = { inParty: !!party, leader: party?.leaderId === session.myId };
  return (
    <div class="online" data-testid="online-panel">
      {data.list.length === 0 && <div class="hud-empty">Só você no mundo agora.</div>}
      {data.list.length > 0 && (
        <ul class="online-list">
          {data.list.map((e) => {
            const v = vocationMeta(e.vocation);
            return (
              <li key={e.id} class={`online-row${e.friend ? " friend" : ""}${e.party ? " party" : ""}${e.away ? " away" : ""}`} data-online={e.name}>
                <FriendStar name={e.name} on={e.friend} />
                <span class="online-main" data-tip={e.name} data-tip-sub={onlineTip(e, v.label)}>
                  <span class="online-name" style={{ color: v.color }}>{e.name}</span>
                  <span class="online-sub">{onlineLine(e)}</span>
                </span>
                <span class="online-actions">
                  {canInviteOnline(e, s) && (
                    <button class="online-mini" onClick={() => partyAction({ action: "invite", targetId: e.id } satisfies PartyActionMsg)} data-tip="Convidar para o grupo" aria-label={`Convidar ${e.name} para o grupo`}>+</button>
                  )}
                  <button class="online-mini" onClick={() => draftChat(whisperDraft(e.name))} data-tip="Sussurrar" data-tip-sub={`/w ${e.name}`} aria-label={`Sussurrar para ${e.name}`}>✉</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {data.offlineFriends.length > 0 && (
        <div class="online-off">
          <span class="online-off-title">Amigos fora do jogo</span>
          <ul class="online-list">
            {data.offlineFriends.map((n) => (
              <li key={n} class="online-row off" data-online-off={n}>
                <FriendStar name={n} on />
                <span class="online-main"><span class="online-name">{n}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FriendStar({ name, on }: { name: string; on: boolean }) {
  return (
    <button
      class={`online-star${on ? " on" : ""}`}
      onClick={() => setFriend(name, !on)}
      aria-pressed={on}
      aria-label={on ? `Tirar ${name} dos amigos` : `Pôr ${name} nos amigos`}
      data-tip={on ? "Amigo (clique para tirar)" : "Pôr nos amigos"}
      data-tip-sub="Amigos aparecem primeiro; a zona aparece quando a amizade é mútua"
    >{on ? "★" : "☆"}</button>
  );
}
