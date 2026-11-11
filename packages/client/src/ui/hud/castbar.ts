// Barra de ações = atalhos de magia (ui/hotkeys). Preenche os slots, envia C2S.Cast, aplica cooldown otimista e
// reconcilia com S2C.CastResult (falhas: tremida no slot + toast + piscada na barra de mana).
// Um slot pode ser uma magia ou uma FAMÍLIA (tecla inteligente, shared/data/spellFamilies.ts): conjura a mais forte que
// estiver pronta, com mana e no alcance; o slot mostra o ícone e a recarga dessa magia.
import {
  C2S, DEFAULT_SPELL_RANGE, GLOBAL_SPELL_COOLDOWN_MS, S2C, familyLevel, familySpells, needsTarget, pickFromFamily, resolveFamily,
  spellDef, spellMana,
  type CastFailReason, type CastMsg, type CastResultMsg, type SpellDef, type SpellFamily, type Vocation,
} from "@lemonquest/shared";
import { cssColor, PAL } from "../../game/spellPalette.ts";
import { sfx } from "../../game/sfx.ts";
import { session } from "../../session.ts";
import { pushToast } from "../toasts.ts";
import {
  ACTION_SLOTS, cooldownStore, onSlotActivate, setSlotAction, shakeSlot, slotCountStore, slotRangeStore,
  type Cooldown, type SlotRange,
} from "./actionbar.ts";
import { effectiveHotkeys, groupsStore, hotkeyLabel, hotkeysStore, layoutStore, setHotkeys, swapHotkeySpells } from "../hotkeys/hotkeys.ts";
import { placeUnlocked } from "../hotkeys/edit.ts";
import { battleSourcesStore, chebyshev } from "./battle.ts";
import { spellIcon } from "./spellIcons.ts";
import { createStore } from "./store.ts";
import { getTarget, targetStore } from "./target.ts";
import { meStore, playersStore } from "./world.ts";

/** Incrementa quando falta mana (a barra de MP pisca). */
export const manaFlashStore = createStore(0);

export const FAIL_TEXT: Record<CastFailReason, string> = {
  mana: "Sem mana",
  cooldown: "Em recarga",
  target: "Sem alvo",
  range: "Fora de alcance",
  pz: "Não pode atacar aqui",
  level: "Level insuficiente",
  vocation: "Sua vocação não pode usar esta magia",
  dead: "Você está morto",
  no_los: "Sem linha de visão",
  unknown: "Não foi possível conjurar",
};

interface SlotEntry { spell?: SpellDef; family?: SpellFamily }
let entries: (SlotEntry | null)[] = Array(ACTION_SLOTS).fill(null);
let slotKeys: string[] = [];

/** Transporte do cast (o harness ?fxtest troca por um servidor falso). */
let transport: (m: CastMsg) => void = (m) => { session.room?.send(C2S.Cast, m); };
export function setCastTransport(fn: (m: CastMsg) => void): void { transport = fn; }

/** Magia mostrada no slot agora (na família, a que sairia). */
export const spellInSlot = (slot: number): SpellDef | null => {
  const e = entries[slot];
  return e?.spell ?? (e?.family ? shownSpell(e.family, performance.now()) : null);
};

/**
 * Recarga por MAGIA (não por slot): sobrevive a tirar a magia da barra e pôr de volta, e vale para a família que a
 * contém. `globalCd` = recarga global atual.
 */
const spellCd = new Map<string, Cooldown>();
let globalCd: Cooldown | null = null;
const active = (c: Cooldown | null | undefined, now: number): c is Cooldown => !!c && c.end > now;

/** Quanto falta (ms) da recarga própria da magia (0 = pronta). Testes E2E (window.__lq.spellCd). */
export function spellCooldownLeft(id: string): number {
  const c = spellCd.get(id);
  return c ? Math.max(0, c.end - performance.now()) : 0;
}

/** Recarga efetiva da magia: a dela ou a global (a que acaba depois). */
function cdOf(s: SpellDef, now: number): Cooldown | null {
  const own = spellCd.get(s.id);
  const g = s.global !== false && active(globalCd, now) ? globalCd : null;
  if (active(own, now)) return g && g.end > own.end ? g : own;
  return g;
}

// --- alvo e alcance -------------------------------------------------------------------------------

/** Distância (tiles) até o alvo atual; null = sem alvo ou fora do que o cliente enxerga (lista de batalha). */
function targetDistance(): number | null {
  const t = getTarget();
  const me = meStore.get();
  if (!t || !me) return null;
  if (t.kind === "player") {
    const p = playersStore.get().get(t.id);
    return p ? chebyshev(me.x, me.y, p.x, p.y) : null;
  }
  for (const list of Object.values(battleSourcesStore.get())) {
    const e = list.find((b) => b.id === t.id);
    if (e) return e.distance;
  }
  return null;
}

function rangeOf(s: SpellDef, dist: number | null, hasTarget: boolean): SlotRange {
  if (!needsTarget(s)) return null;
  if (!hasTarget) return "none";
  return dist !== null && dist <= (s.range ?? DEFAULT_SPELL_RANGE) ? "ok" : "out";
}

// --- família --------------------------------------------------------------------------------------

/** Pronta agora: liberada, fora de recarga, com mana e (se usa alvo) com o alvo ao alcance. */
function ready(s: SpellDef, now: number): boolean {
  const me = meStore.get();
  if (!me || me.level < s.level || cdOf(s, now) || me.mana < spellMana(s, me.level)) return false;
  const r = rangeOf(s, targetDistance(), !!getTarget());
  return r === null || r === "ok";
}

const unlocked = (f: SpellFamily, level: number) => familySpells(f).filter((s) => s.level <= level);

/** Magia que a família mostra: a que sairia agora; senão a liberada que fica pronta primeiro; senão a primeira. */
function shownSpell(f: SpellFamily, now: number): SpellDef {
  const level = meStore.get()?.level ?? 1;
  const pick = pickFromFamily(f, level, (s) => ready(s, now));
  if (pick) return pick;
  const open = unlocked(f, level);
  if (!open.length) return familySpells(f).at(-1)!;
  return open.reduce((a, b) => ((cdOf(b, now)?.end ?? 0) < (cdOf(a, now)?.end ?? 0) ? b : a));
}

/** Por que nenhuma magia da família pode sair agora (para o aviso). */
function familyFailure(f: SpellFamily, now: number): { reason: CastFailReason; text?: string } {
  const me = meStore.get();
  const level = me?.level ?? 1;
  const open = unlocked(f, level);
  if (!open.length) return { reason: "level", text: `${f.name}: precisa ser level ${familyLevel(f)}` };
  const off = open.filter((s) => !cdOf(s, now));
  if (!off.length) return { reason: "cooldown" };
  const hasTarget = !!getTarget(), dist = targetDistance();
  const reach = off.filter((s) => rangeOf(s, dist, hasTarget) === null || rangeOf(s, dist, hasTarget) === "ok");
  if (!reach.length) return { reason: hasTarget ? "range" : "target" };
  return { reason: "mana" };
}

// --- slots ----------------------------------------------------------------------------------------

const sigs: string[] = Array(ACTION_SLOTS).fill("");

function publishSlot(i: number, now: number) {
  const e = entries[i];
  const s = e?.spell ?? (e?.family ? shownSpell(e.family, now) : null);
  const sig = s ? `${s.id}|${e?.family?.id ?? ""}|${slotKeys[i] ?? ""}` : "";
  if (sig === sigs[i]) return;
  sigs[i] = sig;
  const f = e?.family;
  setSlotAction(i, s ? {
    label: f ? `${f.name}: ${s.name}` : s.name, mana: s.mana, spellId: s.id, words: s.words,
    desc: f ? `${f.desc} Agora: ${s.description ?? s.name}` : s.description, level: s.level,
    cooldownMs: s.cooldownMs, fx: s.fx, color: cssColor(PAL[s.fx]?.main ?? 0xffffff),
    icon: spellIcon(s.fx, s.target), keyLabel: slotKeys[i] ? hotkeyLabel(slotKeys[i]!) : undefined,
    family: f?.name, unlockLevel: f ? familyLevel(f) : s.level,
  } : null);
}

/** Recarga mostrada no slot: a da magia; na família, nenhuma se alguma liberada está fora de recarga. */
function slotCooldown(e: SlotEntry | null, now: number): Cooldown | null {
  if (e?.spell) return cdOf(e.spell, now);
  if (!e?.family) return null;
  const open = unlocked(e.family, meStore.get()?.level ?? 1);
  if (!open.length) return null;
  let best: Cooldown | null = null;
  for (const s of open) {
    const c = cdOf(s, now);
    if (!c) return null;
    if (!best || c.end < best.end) best = c;
  }
  return best;
}

let refreshTimer = 0;
/** Recalcula ícone (família), recarga e alcance de todos os slots; agenda o próximo fim de recarga. */
function refresh() {
  const now = performance.now();
  const cds = cooldownStore.get().slice();
  const ranges = slotRangeStore.get().slice();
  const hasTarget = !!getTarget(), dist = targetDistance();
  let cdChanged = false, rangeChanged = false;
  for (let i = 0; i < ACTION_SLOTS; i++) {
    publishSlot(i, now);
    const e = entries[i];
    const c = slotCooldown(e, now);
    const prev = cds[i];
    if ((c?.start ?? -1) !== (prev?.start ?? -1) || (c?.end ?? -1) !== (prev?.end ?? -1)) { cds[i] = c; cdChanged = true; }
    const s = spellInSlot(i);
    const r = s ? rangeOf(s, dist, hasTarget) : null;
    if (r !== ranges[i]) { ranges[i] = r; rangeChanged = true; }
  }
  if (cdChanged) cooldownStore.set(cds);
  if (rangeChanged) slotRangeStore.set(ranges);
  // A família pode trocar de magia quando uma recarga acaba: recalcula nessa hora.
  window.clearTimeout(refreshTimer);
  let next = Infinity;
  for (const c of [...spellCd.values(), globalCd]) if (active(c, now)) next = Math.min(next, c.end);
  if (next < Infinity) refreshTimer = window.setTimeout(refresh, Math.max(16, next - now + 5));
}

/** Slots = atalhos (tecla + magia ou família). */
function fillSlots(vocation: Vocation | undefined) {
  const list = effectiveHotkeys(vocation).slice(0, ACTION_SLOTS);
  entries = Array.from({ length: ACTION_SLOTS }, (_, i) => {
    const id = list[i]?.spellId;
    if (!id) return null;
    const family = vocation ? resolveFamily(id, groupsStore.get(), vocation) : undefined;
    // Grupo do jogador ainda sem magias: slot vazio (não há o que mostrar nem conjurar).
    if (family) return family.spells.length ? { family } : null;
    const spell = spellDef(id);
    return spell ? { spell } : null;
  });
  slotKeys = list.map((h) => h.key);
  sigs.fill("~");
  refresh();
  slotCountStore.set(list.length);
}

/** Arrastar um slot sobre outro: as duas teclas trocam de magia (salvo no personagem). */
export function swapSlots(a: number, b: number): void {
  if (a === b || a < 0 || b < 0 || a >= ACTION_SLOTS || b >= ACTION_SLOTS) return;
  const voc = meStore.get()?.vocation as Vocation | undefined;
  setHotkeys(swapHotkeySpells(effectiveHotkeys(voc), a, b));
}

function fail(slot: number, reason: CastFailReason, text?: string) {
  shakeSlot(slot);
  pushToast({ text: text ?? FAIL_TEXT[reason] ?? FAIL_TEXT.unknown, kind: "warn" }, 700);
  if (reason === "mana") manaFlashStore.set((n) => n + 1);
  sfx.play("fail", { volume: 0.5 });
}

/** Cast enviado e ainda sem resposta: a recarga de antes (para desfazer a otimista se o servidor recusar). */
interface Pending { own: Cooldown | undefined; global: Cooldown | null }
const pending = new Map<string, Pending>();

function activate(slot: number) {
  const e = entries[slot];
  if (!e) return;
  const now = performance.now();
  let spell = e.spell;
  if (e.family) {
    spell = pickFromFamily(e.family, meStore.get()?.level ?? 1, (s) => ready(s, now)) ?? undefined;
    if (!spell) { const f = familyFailure(e.family, now); return fail(slot, f.reason, f.text); }
  }
  if (!spell) return;
  const me = meStore.get();
  if (me && me.level < spell.level) return fail(slot, "level", `${spell.name}: precisa ser level ${spell.level}`);
  const cd = cdOf(spell, now);
  if (cd && cd.end > now + 30) return fail(slot, "cooldown");
  if (me && me.mana < spellMana(spell, me.level)) return fail(slot, "mana");

  // Recarga otimista: a da magia + a global.
  pending.set(spell.id, { own: spellCd.get(spell.id), global: globalCd });
  spellCd.set(spell.id, { start: now, end: now + Math.max(spell.cooldownMs, spell.global === false ? 0 : GLOBAL_SPELL_COOLDOWN_MS) });
  if (spell.global !== false) globalCd = { start: now, end: now + GLOBAL_SPELL_COOLDOWN_MS };
  refresh();
  transport({ spellId: spell.id, targetId: getTarget()?.id ?? null });
}

/** Slot que mostra a magia (direto ou pela família); −1 = nenhum. */
function slotOf(spellId: string): number {
  const direct = entries.findIndex((e) => e?.spell?.id === spellId);
  if (direct >= 0) return direct;
  return entries.findIndex((e) => !!e?.family?.spells.includes(spellId));
}

/** Reconcilia com o resultado autoritativo do servidor. */
export function handleCastResult(r: CastResultMsg): void {
  const p = pending.get(r.spellId);
  pending.delete(r.spellId);
  const now = performance.now();
  if (r.ok) {
    spellCd.set(r.spellId, { start: now, end: now + (r.cooldownMs ?? spellDef(r.spellId)?.cooldownMs ?? 0) });
    globalCd = { start: now, end: now + (r.globalMs ?? GLOBAL_SPELL_COOLDOWN_MS) };
    refresh();
    return;
  }
  // A recarga otimista não valeu: volta a de antes; a da magia só fica se o servidor disse que ela está em recarga.
  if (p) {
    globalCd = p.global;
    if (p.own) spellCd.set(r.spellId, p.own); else spellCd.delete(r.spellId);
  }
  if (r.reason === "cooldown" && r.cooldownMs) spellCd.set(r.spellId, { start: now, end: now + r.cooldownMs });
  else if (!p?.own) spellCd.delete(r.spellId);
  refresh();
  fail(Math.max(slotOf(r.spellId), 0), r.reason ?? "unknown");
}

/** Subiu de level: magias novas entram na barra (tecla livre) com aviso. */
function onLevelUp(from: number, to: number, vocation: Vocation) {
  const saved = hotkeysStore.get();
  const r = placeUnlocked(saved ?? effectiveHotkeys(vocation), vocation, from, to, hotkeyLabel, groupsStore.get());
  if (saved && r.list.length !== saved.length) setHotkeys(r.list);
  // Vários levels de uma vez (/level, recompensa grande): um aviso só.
  const text = r.notes.length > 2 ? `Novas magias: ${r.notes.length}. Veja a barra e os atalhos (H).` : r.notes.join(" ");
  if (text) pushToast({ text, kind: "good" }, 6000);
}

/** Liga a barra de ações às magias e ao servidor. Retorna o desligador. */
export function startCastBar(): () => void {
  let voc = "";
  // Personagem e level já conhecidos (o store não chama o assinante na hora: sem isto, o primeiro aviso seria perdido).
  const now0 = meStore.get();
  let who = now0?.name ?? "", lvl = now0?.level ?? 0;
  const offStore = meStore.subscribe((me) => {
    if (me && me.name === who && me.level > lvl && me.vocation === voc) onLevelUp(lvl, me.level, voc as Vocation);
    if (me) { who = me.name; lvl = me.level; }
    if (me && me.vocation !== voc) { voc = me.vocation; fillSlots(voc as Vocation); return; }
    refresh(); // mana, level e posição mudam o que a família escolhe e o alcance
  });
  const refill = () => fillSlots((meStore.get()?.vocation as Vocation | undefined) ?? undefined);
  const offKeys = hotkeysStore.subscribe(refill);
  const offGroups = groupsStore.subscribe(refill);
  const offLayout = layoutStore.subscribe(refill);
  const offTarget = targetStore.subscribe(() => refresh());
  const offBattle = battleSourcesStore.subscribe(() => { if (getTarget()?.kind === "monster") refresh(); });
  const offPlayers = playersStore.subscribe(() => { if (getTarget()?.kind === "player") refresh(); });
  refill();
  const first = meStore.get();
  if (first) voc = first.vocation;
  const offAct = onSlotActivate(activate);
  const offRoom = session.onRoom((room) => {
    room.onMessage(S2C.CastResult, (m: CastResultMsg) => handleCastResult(m));
  });
  return () => { offStore(); offKeys(); offGroups(); offLayout(); offTarget(); offBattle(); offPlayers(); offAct(); offRoom(); window.clearTimeout(refreshTimer); };
}
