// Encantamento (ciclo 16): 1 efeito ativo por personagem, em tiers (shared/data/imbuement.ts), que dura
// IMBUE_DURATION_MS de combate PvE. O relógio só anda enquanto o jogador está em combate contra monstro
// (CombatSystem.inPveCombat: deu ou levou dano de monstro nos últimos OUT_OF_COMBAT_MS); boneco de treino e PvP não
// contam, e o efeito também não vale neles. Avisa a 30 min do fim e quando acaba. Persistência: CharacterData.imbue;
// o `imbuement` antigo (string, permanente) migra para tier I com 10 h na carga e continua gravado (rollback, saveTo).
import {
  IMBUE_DURATION_MS, IMBUE_WARN_MS, S2C, imbuementBonus, imbuementDef, imbuementName, imbuementTier,
  type ConditionsMsg, type ImbuementBonus, type ImbuementEffect, type ImbuementTier, type NoticeMsg,
} from "@lemonquest/shared";
import type { CharacterData } from "../persistence/types.ts";

/** Maior passo descontado de uma vez: um tick atrasado (servidor engasgado) não come minutos do encantamento. */
export const IMBUE_MAX_STEP_MS = 1000;

export interface ActiveImbue { effect: ImbuementEffect; tier: ImbuementTier; leftMs: number }

/**
 * Lê o encantamento salvo. `imbue` válido vale como está (tempo acima de 10 h é cortado); senão o `imbuement` antigo
 * (string, permanente até o ciclo 15) vira tier I com 10 h cheias. Efeito ou tier desconhecido, ou tempo ≤ 0 = nenhum.
 */
export function parseImbue(data: Pick<CharacterData, "imbue" | "imbuement"> | undefined): ActiveImbue | undefined {
  const s = data?.imbue as Record<string, unknown> | undefined;
  if (s && typeof s === "object") {
    const t = imbuementTier(s.effect, s.tier), left = s.leftMs;
    if (t && typeof left === "number" && Number.isFinite(left) && left > 0) {
      return { effect: s.effect as ImbuementEffect, tier: t.tier, leftMs: Math.min(IMBUE_DURATION_MS, left) };
    }
  }
  const old = imbuementDef(data?.imbuement);
  return old ? { effect: old.effect, tier: 1, leftMs: IMBUE_DURATION_MS } : undefined;
}

export interface ImbuementOptions {
  /** Em combate contra monstro agora (CombatSystem.inPveCombat). */
  inPveCombat: (id: string, now: number) => boolean;
  send: (sessionId: string, type: string, msg: unknown) => void;
}

export class ImbuementSystem {
  private readonly byId = new Map<string, ActiveImbue & { warned: boolean }>();
  private lastTickAt = 0;

  constructor(private readonly o: ImbuementOptions) {}

  /** Efeito e valor do tier ativo (CombatHooks.imbuement). */
  bonus(id: string): ImbuementBonus | undefined {
    const a = this.byId.get(id);
    return a ? imbuementBonus(a.effect, a.tier) : undefined;
  }

  /** Encantamento ativo (Dona Marta, testes). */
  get(id: string): ActiveImbue | undefined {
    const a = this.byId.get(id);
    return a ? { effect: a.effect, tier: a.tier, leftMs: a.leftMs } : undefined;
  }

  /** Compra: troca o encantamento atual por este, com o tempo cheio (o que sobrava do anterior se perde). */
  set(id: string, effect: ImbuementEffect, tier: ImbuementTier): void {
    this.byId.set(id, { effect, tier, leftMs: IMBUE_DURATION_MS, warned: false });
  }

  /** Desconta o tempo de quem está em combate PvE; avisa a 30 min do fim e ao acabar. */
  tick(now: number): void {
    const dt = this.lastTickAt ? Math.min(IMBUE_MAX_STEP_MS, Math.max(0, now - this.lastTickAt)) : 0;
    this.lastTickAt = now;
    if (dt <= 0) return;
    for (const [id, a] of this.byId) {
      if (!this.o.inPveCombat(id, now)) continue;
      a.leftMs -= dt;
      if (a.leftMs <= 0) {
        this.byId.delete(id);
        this.notice(id, `Seu encantamento ${imbuementName(a.effect, a.tier)} acabou. A Dona Marta faz outro.`, "warn");
      } else if (!a.warned && a.leftMs <= IMBUE_WARN_MS) {
        a.warned = true;
        this.notice(id, `Seu encantamento ${imbuementName(a.effect, a.tier)} acaba em ${IMBUE_WARN_MS / 60_000} min de combate.`, "info");
      }
    }
  }

  /**
   * Entrada da faixa de condições (ConditionOptions.extra). Sem remainingMs: o cliente contaria sozinho em tempo real,
   * e o encantamento só gasta em combate; `value` em minutos faz a lista ser reenviada uma vez por minuto de combate.
   */
  condition(id: string): ConditionsMsg["list"][number] | undefined {
    const a = this.byId.get(id);
    return a ? { id: "imbued", value: Math.ceil(a.leftMs / 60_000), value2: a.tier, effect: a.effect } : undefined;
  }

  load(id: string, data: Pick<CharacterData, "imbue" | "imbuement"> | undefined): void {
    const a = parseImbue(data);
    // Já abaixo de 30 min ao entrar: o aviso não se repete a cada login.
    if (a) this.byId.set(id, { ...a, warned: a.leftMs <= IMBUE_WARN_MS });
    else this.byId.delete(id);
  }

  /**
   * Grava em `data.imbue` (ou apaga os dois campos, se acabou). Durante o ciclo 16 grava também o campo antigo
   * `imbuement` (só o efeito): um rollback da imagem para o ciclo 15 lê esse e mantém o encantamento pago (lá ele vira
   * permanente, aceitável). A carga prefere `imbue`.
   */
  saveTo(id: string, data: CharacterData): void {
    const a = this.byId.get(id);
    if (a) {
      data.imbue = { effect: a.effect, tier: a.tier, leftMs: Math.max(1, Math.round(a.leftMs)) };
      data.imbuement = a.effect;
    } else {
      delete data.imbue;
      delete data.imbuement;
    }
  }

  removePlayer(id: string): void {
    this.byId.delete(id);
  }

  private notice(id: string, text: string, kind: NoticeMsg["kind"]): void {
    this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg);
  }
}
