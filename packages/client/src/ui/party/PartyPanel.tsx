// Card "Grupo" da barra lateral: membros (vocação, level, HP/MP), coroa do líder, estado da XP compartilhada e ações.
// Só aparece quando você está num grupo.
import { PARTY_ACTIVE_MS, PARTY_MAX, PARTY_SHARE_RANGE, PARTY_SHARE_REASON_TEXT } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { Section } from "../hud/Section.tsx";
import { useStore } from "../hud/store.ts";
import { vocationMeta } from "../hud/vocations.ts";
import { playersStore } from "../hud/world.ts";
import { partyAction, partyStore, type PartyInfo } from "./party.ts";
import { shareBonusText } from "./shareText.ts";
import "./party.css";

const pct = (v: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);

export function PartyPanel() {
  const party = useStore(partyStore);
  if (!party) return null;
  return (
    <Section id="party" title="Grupo" aside={<span class="count-chip">{party.members.length}/{PARTY_MAX}</span>} class="party-section">
      <PartyBody party={party} />
    </Section>
  );
}

function PartyBody({ party }: { party: PartyInfo }) {
  const players = useStore(playersStore);
  const myId = session.myId;
  const leader = party.leaderId === myId;
  const share = party.share;
  const shareText = share.active
    ? "XP compartilhada ativa"
    : share.reason === "levels" && share.minLevel
      ? `${PARTY_SHARE_REASON_TEXT.levels} (mín. lv ${share.minLevel})`
      : PARTY_SHARE_REASON_TEXT[share.reason ?? "alone"];
  return (
    <div class="party">
      <div
        class={`party-share ${share.active ? "on" : "off"}`}
        data-tip={share.active ? shareBonusText() : "XP compartilhada inativa"}
        data-tip-sub={`Divide entre quem atacou/curou nos últimos ${PARTY_ACTIVE_MS / 1000} s a até ${PARTY_SHARE_RANGE} sqm do abate. Menor level ≥ 2/3 do maior.`}
      >
        <span class="party-share-dot" aria-hidden="true" />
        {shareText}
      </div>
      <ul class="party-members">
        {party.members.map((m) => {
          const snap = players.get(m.id);
          const v = vocationMeta(m.vocation);
          const isLeader = m.id === party.leaderId;
          const isMe = m.id === myId;
          return (
            <li key={m.id} class={`party-member${isMe ? " me" : ""}${m.active ? " active" : " idle"}`} data-member={m.name}>
              <div class="party-row">
                <span class="party-crown" aria-label={isLeader ? "Líder" : undefined} data-tip={isLeader ? "Líder do grupo" : undefined}>{isLeader ? "♛" : ""}</span>
                <span class="party-name" style={{ color: v.color }} title={m.name}>{m.name}</span>
                <span class="party-lvl">Lv {snap?.level ?? m.level}</span>
                {leader && !isMe && (
                  <span class="party-actions">
                    <button class="party-mini" onClick={() => partyAction({ action: "lead", targetId: m.id })} data-tip="Passar liderança" aria-label={`Passar liderança para ${m.name}`}>♛</button>
                    <button class="party-mini danger" onClick={() => partyAction({ action: "kick", targetId: m.id })} data-tip="Expulsar do grupo" aria-label={`Expulsar ${m.name}`}>×</button>
                  </span>
                )}
              </div>
              {snap ? (
                <div class="party-bars">
                  <span class="party-bar hp"><span style={{ width: `${pct(snap.hp, snap.maxHp)}%` }} /></span>
                  <span class="party-bar mp"><span style={{ width: `${pct(snap.mana, snap.maxMana)}%` }} /></span>
                </div>
              ) : <div class="party-off">longe</div>}
            </li>
          );
        })}
      </ul>
      <div class="party-foot">
        <button class="party-btn" onClick={() => partyAction({ action: "leave" })}>Sair</button>
        {leader && <button class="party-btn danger" onClick={() => partyAction({ action: "disband" })}>Desfazer</button>}
      </div>
    </div>
  );
}
