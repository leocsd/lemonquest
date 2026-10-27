// Card "Online" da barra lateral (ciclo 18; reorganizado em 2026-10-27 a pedido do dono): quem está no jogo em blocos —
// seu grupo, amigos e o resto —, cada linha com o rosto da vocação, nome, level e a zona quando a regra do /quem deixa
// (amigos mútuos, grupo e quem está em zona de proteção). Botões em pixel art: estrela põe/tira dos amigos; + convida
// para o grupo (C2S.Party, como o botão direito); balão abre o chat com "/w nome ".
import type { OnlineEntry, PartyActionMsg } from "@lemonquest/shared";
import { draftChat, whisperDraft } from "../chatDraft.ts";
import { PixelIcon } from "../hud/icons.tsx";
import { Section } from "../hud/Section.tsx";
import { useStore } from "../hud/store.ts";
import { vocationMeta } from "../hud/vocations.ts";
import { partyAction, partyStore } from "../party/party.ts";
import { session } from "../../session.ts";
import { onlineStore, setFriend } from "./online.ts";
import { canInviteOnline, groupOnline, onlineLine, onlineTip } from "./onlineLogic.ts";
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
      {groupOnline(data.list).map((g) => (
        <div class={`online-group g-${g.key}`} key={g.key}>
          {g.label && <span class="online-group-title">{g.label} <span class="online-group-n">{g.entries.length}</span></span>}
          <ul class="online-list">
            {g.entries.map((e) => <OnlineRow key={e.id} e={e} s={s} />)}
          </ul>
        </div>
      ))}
      {data.offlineFriends.length > 0 && (
        <div class="online-group g-off">
          <span class="online-group-title">Amigos fora do jogo <span class="online-group-n">{data.offlineFriends.length}</span></span>
          <ul class="online-list">
            {data.offlineFriends.map((n) => (
              <li key={n} class="online-row off" data-online-off={n}>
                <span class="online-face empty" aria-hidden="true" />
                <span class="online-main"><span class="online-name">{n}</span></span>
                <span class="online-actions"><FriendStar name={n} on /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OnlineRow({ e, s }: { e: OnlineEntry; s: { inParty: boolean; leader: boolean } }) {
  const v = vocationMeta(e.vocation);
  return (
    <li class={`online-row${e.friend ? " friend" : ""}${e.party ? " party" : ""}${e.away ? " away" : ""}`} data-online={e.name}>
      <img class="online-face" src={v.faceset} alt="" draggable={false} title={v.label} />
      <span class="online-main" data-tip={e.name} data-tip-sub={onlineTip(e, v.label)}>
        <span class="online-name" style={{ color: v.color }}>{e.name}</span>
        <span class="online-sub">{onlineLine(e)}</span>
      </span>
      <span class="online-actions">
        <FriendStar name={e.name} on={e.friend} />
        {canInviteOnline(e, s) && (
          <button class="online-btn invite" onClick={() => partyAction({ action: "invite", targetId: e.id } satisfies PartyActionMsg)} data-tip="Convidar para o grupo" aria-label={`Convidar ${e.name} para o grupo`}>
            <PixelIcon name="plus" size={12} />
          </button>
        )}
        <button class="online-btn" onClick={() => draftChat(whisperDraft(e.name))} data-tip="Sussurrar" data-tip-sub={`/w ${e.name}`} aria-label={`Sussurrar para ${e.name}`}>
          <PixelIcon name="bubble" size={12} />
        </button>
      </span>
    </li>
  );
}

function FriendStar({ name, on }: { name: string; on: boolean }) {
  return (
    <button
      class={`online-btn star${on ? " on" : ""}`}
      onClick={() => setFriend(name, !on)}
      aria-pressed={on}
      aria-label={on ? `Tirar ${name} dos amigos` : `Pôr ${name} nos amigos`}
      data-tip={on ? "Amigo (clique para tirar)" : "Pôr nos amigos"}
      data-tip-sub="Amigos aparecem primeiro; a zona aparece quando a amizade é mútua"
    ><PixelIcon name={on ? "star" : "star_outline"} size={12} /></button>
  );
}
