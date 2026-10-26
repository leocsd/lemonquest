// Overlays de combate: banner de level-up e tela de morte.
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";
import { blessingLine } from "./blessingText.ts";
import { deathStore, hideDeath, levelBannerStore } from "./combatUi.ts";
import "./combat.css";

const BANNER_MS = 2000;
/** Dicas na tela de morte para quem está começando (até este level). */
const TIP_MAX_LEVEL = 10;
const DEATH_TIPS = [
  "Dica: Q bebe uma poção de vida — use antes da vida ficar no vermelho.",
  "Dica: puxe um monstro por vez; vários juntos somam dano rápido.",
  "Dica: na vila a vida e a mana voltam bem mais rápido. Descanse antes de voltar.",
  "Dica: um \"!\" ao lado do nome na lista de batalha marca monstro perigoso para o seu level.",
  "Dica: caiu a energia? Home office. Caiu a vida? Vila: lá ela volta rápido.",
  "Dica: a bênção é o seguro do Financeiro: paga antes, não perde XP depois.",
  "Dica: rato cinzento roendo cordão não dói. Em grupo, dói.",
];
let tipIndex = 0;
const DEATH_KEY_DELAY_MS = 1500;

export function CombatOverlays() {
  return (
    <>
      <LevelBannerView />
      <DeathOverlay />
    </>
  );
}

function LevelBannerView() {
  const b = useStore(levelBannerStore);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!b) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), b.spells.length ? BANNER_MS + 1400 : BANNER_MS);
    return () => clearTimeout(t);
  }, [b]);
  if (!b || !shown) return null;
  return (
    <div class={`level-banner${b.spells.length ? " long" : ""}`} key={b.n} aria-live="polite">
      <div class="level-banner-glow" />
      <div class="level-banner-text">Level {b.level}!</div>
      <div class="level-banner-sub">Você ficou mais forte</div>
      {b.spells.map((s, i) => (
        <div key={s} class="level-banner-spell" style={{ animationDelay: `${500 + i * 250}ms` }}>Nova magia: <b>{s}</b></div>
      ))}
    </div>
  );
}

function DeathOverlay() {
  const d = useStore(deathStore);
  const me = useStore(meStore);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState("");
  const [bless, setBless] = useState("");
  // Último "abençoado" visto em vida: o patch que zera o campo pode chegar junto com a mensagem de morte.
  const wasBlessed = useRef(false);
  useEffect(() => { if (!d && me) wasBlessed.current = !!me.blessed; }, [d, me]);
  useEffect(() => {
    if (!d) return;
    setReady(false);
    // Uma dica diferente a cada morte (em ordem), só para quem está começando.
    setTip(me && me.level <= TIP_MAX_LEVEL ? DEATH_TIPS[tipIndex++ % DEATH_TIPS.length]! : "");
    setBless(blessingLine({ level: me?.level ?? 1, lostXp: d.lostXp, blessed: wasBlessed.current, blessingUsed: d.blessingUsed, savedXp: d.savedXp }));
    const t = setTimeout(() => setReady(true), DEATH_KEY_DELAY_MS);
    return () => clearTimeout(t);
  }, [d]);
  useEffect(() => {
    if (!d || !ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      hideDeath();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [d, ready]);
  if (!d) return null;
  return (
    <div class="death-overlay" role="alertdialog" aria-label="Você morreu">
      <div class="death-card">
        <div class="death-title">Você morreu</div>
        <div class="death-sub">
          Derrotado por <b>{d.killerName || "algo misterioso"}</b>
          {d.lostXp > 0 && <> · <span class="death-xp">−{d.lostXp.toLocaleString("pt-BR")} XP</span></>}
        </div>
        {tip && <div class="death-tip">{tip}</div>}
        {bless && <div class="death-tip death-bless">{bless}</div>}
        <button class={`death-btn${ready ? " ready" : ""}`} onClick={hideDeath}>Voltar</button>
        <div class="death-hint">{ready ? "Pressione qualquer tecla" : " "}</div>
      </div>
    </div>
  );
}
