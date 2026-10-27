import { useEffect, useState } from "preact/hooks";
import { CLOSE_KICKED, CLOSE_REPLACED, CLOSE_TRAINING } from "@lemonquest/shared";
import { endpoint } from "../net.ts";
import { closeMessage, session } from "../session.ts";
import { SKILL_NAMES, trainingSkill } from "./training/training.ts";

const HEALTH_POLL_MS = 3000;

/**
 * Depois de cair (servidor reiniciado, rede): consulta /health até o servidor responder, para o jogador saber quando
 * vale clicar em voltar (num deploy o servidor some por alguns segundos). null = ainda não sabe.
 */
function useServerBack(active: boolean): boolean | null {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`${endpoint}/health`, { cache: "no-store", signal: AbortSignal.timeout(HEALTH_POLL_MS - 500) });
        if (alive) setUp(r.ok);
      } catch { if (alive) setUp(false); }
    };
    void check();
    const t = setInterval(check, HEALTH_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [active]);
  return up;
}

/** Banner "Reconectando..." (não bloqueia) e overlay "Você foi desconectado" (bloqueia). */
export function ConnectionStatus() {
  const [, tick] = useState(0);
  useEffect(() => session.onStatus(() => tick((n) => n + 1)), []);
  const code = session.closeInfo?.code;
  const watch = session.status === "closed" && code !== CLOSE_KICKED && code !== CLOSE_REPLACED && code !== CLOSE_TRAINING;
  const serverUp = useServerBack(watch);

  if (session.status === "reconnecting") {
    return <div class="conn-banner panel" role="status">Reconectando...</div>;
  }
  if (session.status === "closed") {
    const info = session.closeInfo;
    // Recarregar volta à LISTA DE PERSONAGENS se a sessão da conta (salva no navegador) ainda valer (ver Login).
    const back = session.accountSession ? "Voltar aos personagens" : "Voltar ao login";
    if (info?.code === CLOSE_TRAINING) {
      const skill = trainingSkill();
      return (
        <div class="conn-overlay" role="alertdialog" aria-modal="true">
          <div class="panel conn-card">
            <h2>Treinamento offline</h2>
            <p>Seu personagem está treinando{skill ? ` ${SKILL_NAMES[skill]}` : ""}. Volte quando quiser!</p>
            <button class="btn" autoFocus onClick={() => location.reload()}>{back}</button>
          </div>
        </div>
      );
    }
    return (
      <div class="conn-overlay" role="alertdialog" aria-modal="true">
        <div class="panel conn-card">
          <h2>{info?.code === CLOSE_KICKED ? "Você foi expulso" : "Você foi desconectado"}</h2>
          <p>{closeMessage(info?.code ?? 0, info?.reason)}</p>
          {watch && serverUp !== null && (
            <p class={`conn-health${serverUp ? " up" : ""}`} role="status">
              {serverUp ? "O servidor está no ar. Pode voltar." : "Aguardando o servidor voltar…"}
            </p>
          )}
          {/* Recarregar a página é o reset mais limpo: zera Phaser, stores e sala. */}
          <button class="btn" autoFocus onClick={() => location.reload()}>{back}</button>
        </div>
      </div>
    );
  }
  return null;
}
