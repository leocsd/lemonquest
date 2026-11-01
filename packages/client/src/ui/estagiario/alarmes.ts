// Alarme do Estagiário (S2C.EstagiarioAlarme): só avisa, a caça continua. Toast amarelo, som curto e, com a aba em
// segundo plano, a marca no título ("🤖 Estagiário!") até o jogador voltar.
import type { EstagiarioAlarmeMsg } from "@lemonquest/shared";
import { sfx } from "../../game/sfx.ts";
import { notifyAttention } from "../attention.ts";
import { pushToast } from "../toasts.ts";

/** Mesmo alarme repetido em menos que isto vira um toast só (o servidor já espaça, isto é só rede de segurança). */
const DEDUPE_MS = 2000;

export function alarme(m: EstagiarioAlarmeMsg): void {
  if (!m || typeof m.texto !== "string" || !m.texto) return;
  pushToast({ text: `🤖 ${m.texto}`, kind: "warn" }, DEDUPE_MS);
  // Morte: o som de "died" (S2C.Died) já toca. Sussurro: o título já conta pelo S2C.Chat ("whisper").
  if (m.tipo !== "morte") sfx.play("alarme", { rate: 1.35 });
  if (m.tipo !== "privada") notifyAttention("estagiario");
}
