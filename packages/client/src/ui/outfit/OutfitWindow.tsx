// Janela de roupas estilo Tibia: prévia animada grande, sexo (♂/♀), grade de roupas, 2 addons, OK/Cancelar.
import { useEffect, useRef, useState } from "preact/hooks";
import {
  OUTFIT_TONES, OUTFIT_TONE_PRICE, outfitName, outfitsVisibleTo, resolveOutfit, toneColor, unlockRequirement, type Facing, type Sex,
} from "@lemonquest/shared";
import { NATURAL_SWATCH, swatchBackground, swatchOrder } from "./colorize.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { meStore } from "../hud/world.ts";
import { OutfitCanvas } from "./OutfitCanvas.tsx";
import { PixelIcon } from "../hud/icons.tsx";
import { achievementsStore, outfitUnlockedFor } from "../achievements/achievements.ts";
import "../achievements/achievements.css";
import { buyOutfitTone, closeOutfit, outfitOpen, outfitTonesStore, sendOutfit } from "./outfit.ts";
import { buyClick, buyLabel, toneStatus, toneToWear } from "./toneShop.ts";
import { inventoryStore } from "../items/inventory.ts";
import { bindOverlay } from "../overlays.ts";
import "./outfit.css";

// Esc pela pilha de sobreposições, registrado no instante em que o store abre (o menu de contexto que abriu a janela já
// saiu da pilha: openOutfit o fecha antes).
bindOverlay("outfit", outfitOpen, (v) => v, closeOutfit);

const FACINGS: Facing[] = ["down", "left", "up", "right"];
const FACING_LABEL: Record<Facing, string> = { down: "frente", left: "esquerda", up: "costas", right: "direita" };
/** Botões de sexo (troca de graça: vale ao dar OK, como a roupa). */
const SEX_OPTS: { sex: Sex; sym: string; label: string }[] = [
  { sex: "m", sym: "♂", label: "Masculino" },
  { sex: "f", sym: "♀", label: "Feminino" },
];
/** ms por frame da caminhada na prévia. */
const WALK_MS = 150;
/** Gira sozinho a cada N ms (até o jogador usar as setas). */
const ROTATE_MS = 2400;
/** Tons na ordem do arco-íris, neutros no fim (a lista do shared só cresce no fim). */
const TONES_SHOWN = swatchOrder(OUTFIT_TONES);
/** Linhas de amostras (Natural + tons, 5 por linha): entra na altura fixa da janela (outfit.css). */
const TONE_ROWS = Math.ceil((TONES_SHOWN.length + 1) / 5);
const PRICE = OUTFIT_TONE_PRICE.toLocaleString("pt-BR");

export function OutfitWindow() {
  const open = useStore(outfitOpen);
  if (!open) return null;
  return <OutfitDialog />;
}

function OutfitDialog() {
  const winRef = useRef<HTMLDivElement>(null);
  useDialogFocus(winRef);
  const me = useStore(meStore);
  const current = resolveOutfit(me?.outfit, me?.vocation ?? "knight");
  const [sel, setSel] = useState(current.id);
  const [addons, setAddons] = useState(me?.outfit === current.id ? me?.addons ?? 0 : 0);
  const [tone, setTone] = useState(me?.tone ?? "");
  const [sex, setSex] = useState<Sex>(me?.sex ?? "m");
  const [face, setFace] = useState(0);
  const [auto, setAuto] = useState(true);
  const [row, setRow] = useState(0);
  const [walk, setWalk] = useState(true);
  const outfit = resolveOutfit(sel, me?.vocation ?? "knight");
  const ach = useStore(achievementsStore);
  const unlockedTones = useStore(outfitTonesStore);
  const gold = useStore(inventoryStore)?.gold ?? 0;
  const [confirmBuy, setConfirmBuy] = useState(false);
  const toneSt = toneStatus(tone, unlockedTones, gold);
  const wearTone = toneToWear(tone, unlockedTones, me?.tone ?? "");
  const toneName = OUTFIT_TONES.find((t) => t.id === tone)?.name ?? "";
  const pickTone = (id: string) => { setTone(id); setConfirmBuy(false); };
  // Liberado = conquista/roupa padrão/o que já veste. Sem o estado do servidor ainda, só o que veste.
  const voc = me?.vocation ?? "knight";
  const open = (id: string, bit: 0 | 1 | 2) => outfitUnlockedFor(ach, voc, current.id, me?.addons ?? 0, id, bit);
  const outfitOk = open(outfit.id, 0);
  const addonOk = (bit: 1 | 2) => outfitOk && open(outfit.id, bit);
  const effAddons = addons & ((addonOk(1) ? 1 : 0) | (addonOk(2) ? 2 : 0));
  const lockedMsg = !outfitOk ? unlockRequirement(outfit.id, 0)
    : ([1, 2] as const).filter((b) => (addons & b) && !addonOk(b)).map((b) => unlockRequirement(outfit.id, b))[0];

  useEffect(() => {
    const t = window.setInterval(() => setRow((r) => (r + 1) % 4), WALK_MS);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => setFace((f) => (f + 1) % 4), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [auto]);

  const rotate = (d: number) => { setAuto(false); setFace((f) => (f + d + 4) % 4); };
  const ok = () => { if (!outfitOk) return; sendOutfit(outfit.id, effAddons, wearTone, sex); closeOutfit(); };
  const buy = () => {
    if (toneSt !== "buy") return;
    const r = buyClick(confirmBuy);
    setConfirmBuy(r.confirming);
    if (r.buy) buyOutfitTone(tone);
  };

  // Enter confirma; setas giram (sem roubar teclas do jogo quando fechada). O Esc fecha pela pilha (acima).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); ok(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopImmediatePropagation(); rotate(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.stopImmediatePropagation(); rotate(1); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const facing = FACINGS[face];
  const toggleAddon = (bit: number) => setAddons((a) => a ^ bit);

  return (
    <div class="outfit-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) closeOutfit(); }}>
      <div ref={winRef} class="hud-card hud-window outfit-win" role="dialog" aria-label="Roupas" style={{ "--tone-rows": TONE_ROWS } as never}>
        {/* Modal centralizada com fundo escurecido: não arrasta, então não tem grip (outfit.css já tira o cursor de mão). */}
        <div class="win-title">
          <span>Roupas</span>
          <button class="win-close" onClick={closeOutfit} data-tip="Fechar" data-tip-sub="O ou Esc" aria-label="Fechar">×</button>
        </div>
        <div class="outfit-body">
          <div class="outfit-stage">
            <div class="outfit-preview" onClick={() => setWalk((w) => !w)} data-tip={walk ? "Parar" : "Andar"}>
              <OutfitCanvas outfit={outfit} addons={effAddons} facing={facing} row={walk ? row : 0} scale={6} tone={toneColor(tone)} sex={sex} />
              {/* No canto da prévia (absoluto): não mexe na altura fixa da coluna. */}
              <div class="outfit-sex" role="radiogroup" aria-label="Sexo">
                {SEX_OPTS.map((o) => (
                  <button
                    key={o.sex}
                    class={`outfit-sex-btn${sex === o.sex ? " sel" : ""}`}
                    role="radio"
                    aria-checked={sex === o.sex}
                    aria-label={o.label}
                    data-tip={o.label}
                    data-tip-sub="Troca de graça · vale no OK"
                    onClick={(e) => { e.stopPropagation(); setSex(o.sex); }}
                  >
                    {o.sym}
                  </button>
                ))}
              </div>
            </div>
            <div class="outfit-rotate">
              <button class="outfit-arrow" onClick={() => rotate(-1)} aria-label="Girar para a esquerda" data-tip="Girar" data-tip-sub="Seta ←"><span class="outfit-tri left" aria-hidden="true" /></button>
              <span class="outfit-facing">{FACING_LABEL[facing]}</span>
              <button class="outfit-arrow" onClick={() => rotate(1)} aria-label="Girar para a direita" data-tip="Girar" data-tip-sub="Seta →"><span class="outfit-tri" aria-hidden="true" /></button>
            </div>
            <div class="outfit-name" title={outfitName(outfit, sex)}>{outfitName(outfit, sex)}</div>
            {/* Alturas fixas daqui para baixo (addons, tons, compra): trocar roupa, addon ou tom não mexe no tamanho da janela. */}
            <div class="outfit-addons">
              {outfit.addons.map((a, i) => {
                const bit = 1 << i;
                const okA = addonOk((bit as 1 | 2));
                return (
                  <label
                    key={a.id}
                    class={`outfit-addon${effAddons & bit ? " on" : ""}${okA ? "" : " locked"}`}
                    data-tip={a.name}
                    data-tip-sub={okA ? undefined : unlockRequirement(outfit.id, bit as 1 | 2)}
                  >
                    <input type="checkbox" checked={(effAddons & bit) !== 0} disabled={!okA} onChange={() => toggleAddon(bit)} />
                    <span class="outfit-check" aria-hidden="true" />
                    <span class="outfit-addon-name"><small>Addon {i + 1}</small><span>{a.name}</span></span>
                    {!okA && <span class="outfit-lock"><PixelIcon name="lock" size={14} /></span>}
                  </label>
                );
              })}
            </div>
            <div class="outfit-tones" role="listbox" aria-label="Tons de tingimento">
              <button
                class={`outfit-tone natural${tone === "" ? " sel" : ""}`}
                style={{ background: NATURAL_SWATCH }}
                onClick={() => pickTone("")}
                data-tip="Natural"
                data-tip-sub="Cores originais da roupa"
                aria-label="Natural"
                aria-selected={tone === ""}
              />
              {TONES_SHOWN.map((t) => {
                const unlocked = unlockedTones.includes(t.id);
                return (
                  <button
                    key={t.id}
                    class={`outfit-tone${tone === t.id ? " sel" : ""}${unlocked ? " owned" : " locked"}`}
                    style={{ background: swatchBackground(t.color) }}
                    onClick={() => pickTone(t.id)}
                    data-tip={unlocked ? t.name : `${t.name} · ${PRICE} de ouro`}
                    data-tip-sub={unlocked ? "Liberado na conta" : "Clique para ver no boneco"}
                    aria-label={t.name}
                    aria-selected={tone === t.id}
                  >
                    {!unlocked && <span class="outfit-lock"><PixelIcon name="lock" size={12} /></span>}
                  </button>
                );
              })}
            </div>
            <div class="outfit-buy">
              {toneSt === "owned" ? (
                <span class="outfit-buy-note">
                  {tone ? <><b>{toneName}</b> · liberado na conta, vale para todos os personagens.</>
                    : <>Tingir custa <b>{PRICE} de ouro</b> por tom, uma vez por conta.</>}
                </span>
              ) : (
                <>
                  <span class="outfit-buy-note">Prévia de <b>{toneName}</b>. Comprado, vale para a conta toda.</span>
                  <button
                    class={`outfit-btn outfit-buy-btn${confirmBuy ? " confirm" : ""}`}
                    onClick={buy}
                    onBlur={() => setConfirmBuy(false)}
                    disabled={toneSt === "poor"}
                  >
                    {buyLabel(toneSt, confirmBuy)}
                  </button>
                </>
              )}
            </div>
          </div>
          <ul class="outfit-grid" role="listbox" aria-label="Roupas disponíveis">
            {/* As roupas exclusivas de outra vocação (a da Fada) nem aparecem: só as comuns e as da minha. */}
            {outfitsVisibleTo(voc).map((o) => {
              const locked = !open(o.id, 0);
              return (
              <li key={o.id}>
                <button
                  class={`outfit-cell${o.id === outfit.id ? " sel" : ""}${o.id === current.id ? " cur" : ""}${locked ? " locked" : ""}`}
                  role="option"
                  aria-selected={o.id === outfit.id}
                  onClick={() => { if (o.id !== sel) { setSel(o.id); setAddons(o.id === current.id ? me?.addons ?? 0 : addons); } }}
                  onDblClick={() => { if (!locked) { sendOutfit(o.id, o.id === outfit.id ? effAddons : 0, wearTone, sex); closeOutfit(); } }}
                  data-tip={outfitName(o, sex)}
                  data-tip-sub={locked ? unlockRequirement(o.id, 0) : o.id === current.id ? "Roupa atual" : "Clique para ver · duplo clique veste"}
                  data-locked={locked ? "true" : undefined}
                >
                  <OutfitCanvas outfit={o} addons={o.id === outfit.id ? effAddons : 0} scale={2} tight sex={sex} />
                  <span class="outfit-cell-name">{outfitName(o, sex)}</span>
                  {locked && <span class="outfit-lock" aria-label="Bloqueada"><PixelIcon name="lock" size={12} /></span>}
                </button>
              </li>
              );
            })}
          </ul>
        </div>
        <div class="outfit-foot">
          <span class={`outfit-hint${lockedMsg ? " outfit-req" : ""}`}>
            {lockedMsg ?? (toneSt !== "owned" ? "Tom não comprado: o OK mantém o tom atual." : "Conquistas (J) desbloqueiam novas roupas e addons.")}
          </span>
          <button class="outfit-btn" onClick={closeOutfit}>Cancelar</button>
          <button class="outfit-btn primary" onClick={ok} disabled={!outfitOk}>OK</button>
        </div>
      </div>
    </div>
  );
}
