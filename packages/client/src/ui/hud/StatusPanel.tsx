// Retrato, nome, vocação, level, HP/mana e XP do jogador local.
import { outfitFaceset, resolveOutfit, xpForLevel, xpStage } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { Section } from "./Section.tsx";
import { StatBar } from "./StatBar.tsx";
import { manaFlashStore } from "./castbar.ts";
import { useStore } from "./store.ts";
import { vocationMeta } from "./vocations.ts";
import { meStore, type PlayerSnap } from "./world.ts";

export function xpProgress(level: number, xp: number) {
  const from = xpForLevel(level), to = xpForLevel(level + 1);
  const span = Math.max(1, to - from);
  const into = Math.max(0, xp - from);
  return { from, to, into, span, pct: Math.min(100, (into / span) * 100), left: Math.max(0, to - xp) };
}

/** Dica da barra de XP: quanto falta e, a partir do 2º estágio, quanto da XP de caça o personagem recebe. */
export function xpStageTip(level: number, left: number): string {
  const st = xpStage(level);
  const base = `Faltam ${fmt(left)} XP`;
  return st.mult < 1 ? `${base} · caça dá ${Math.round(st.mult * 100)}% da XP (lv ${st.fromLevel}+)` : base;
}

export const fmt = (n: number) => n.toLocaleString("pt-BR");

export function Portrait({ me, size = 44 }: { me: PlayerSnap; size?: number }) {
  const v = vocationMeta(me.vocation);
  const face = `${import.meta.env.BASE_URL}${outfitFaceset(resolveOutfit(me.outfit, me.vocation), me.sex)}`;
  return (
    <div class="portrait" style={{ "--voc": v.color, width: `${size}px`, height: `${size}px` } as any}>
      <img src={face} alt="" draggable={false} />
    </div>
  );
}

export function StatusPanel() {
  const me = useStore(meStore);
  return (
    <Section id="status" title="Personagem" aside={me ? <span class="lvl-chip">Lv {me.level}</span> : null}>
      {me ? <StatusBody me={me} /> : <div class="hud-empty">Carregando…</div>}
    </Section>
  );
}

function StatusBody({ me }: { me: PlayerSnap }) {
  const manaFlash = useStore(manaFlashStore);
  const v = vocationMeta(me.vocation);
  const xp = xpProgress(me.level, me.xp);
  const pctLabel = `${xp.pct.toFixed(1).replace(".", ",")}%`;
  return (
    <div class="status">
      <div class="status-id">
        <Portrait me={me} />
        <div class="status-names">
          <div class="status-name" title={me.name}>{me.name || session.myName}</div>
          <div class="status-voc" style={{ color: v.color }}>{v.label}</div>
        </div>
      </div>
      <StatBar kind="hp" label="HP" value={me.hp} max={me.maxHp} />
      <StatBar kind="mana" label="MP" value={me.mana} max={me.maxMana} flash={manaFlash} />
      <div class="xp-row">
        <StatBar
          kind="xp"
          thin
          value={xp.into}
          max={xp.span}
          tip={`${pctLabel} para o level ${me.level + 1}`}
          tipSub={xpStageTip(me.level, xp.left)}
        />
        <span class="xp-pct">{pctLabel}</span>
      </div>
    </div>
  );
}
