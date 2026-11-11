// Montaria ativa: validação, carga/gravação no registro e troca (C2S.SetMount). Sem sistema de posse ainda —
// qualquer montaria de MOUNT_LIST pode ser escolhida por qualquer personagem (ver GAME_ROADMAP).
import { MOUNTS, type SetMountMsg } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { CharacterRecord } from "../persistence/types.ts";

/** Montaria do registro (legado sem o campo, ou id desconhecido → anda a pé). */
export function loadMount(rec: CharacterRecord): string {
  const id = rec.data.mount;
  return id && Object.hasOwn(MOUNTS, id) ? id : "";
}

/** Valida um pedido de troca. null = inválido (id desconhecido); "" = sem montaria (sempre válido). */
export function validateSetMount(m: unknown): string | null {
  if (!m || typeof m !== "object") return null;
  const { mount } = m as Partial<SetMountMsg>;
  if (mount === "") return "";
  if (typeof mount !== "string" || mount.length > 32 || !Object.hasOwn(MOUNTS, mount)) return null;
  return mount;
}

/** Aplica a troca no estado (todos veem) e no registro (persistido no próximo save). */
export function applySetMount(p: PlayerState, rec: CharacterRecord | undefined, m: unknown): boolean {
  const v = validateSetMount(m);
  if (v === null) return false;
  p.mount = v;
  if (rec) rec.data.mount = v;
  return true;
}
