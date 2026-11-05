// Janela "Estagiário" (bot de caça; quem decide e age é o servidor, aqui só a configuração e o estado). Cabeçalho com os
// interruptores de Cura, Ataque e Buffs (a rota liga os três), a rota rodando e o turno restante; seis abas: Cura, Ataque, Buffs,
// Rota, Alarmes e Diário (v3: o que o servidor fez e por que esperou). Cura, ataque, buffs, reserva de mana e alarmes mexem
// num rascunho (store.ts rascunhoStore) que só vai no "Aplicar"; ligar/desligar, gravar, renomear e apagar rota vão na hora.
// Abre pelo 🤖 do trilho. Molde: items/LootFilterWindow.tsx.
import {
  ALARMES, DIARIO_MAX, DISTANCIAS, NOME_ROTA_MAX, PRESETS, REGRAS_MAX, ROTAS_MAX, TURNO_MAX_MS, TURNO_RECARGA, ataqueRecomendado, buffsDaVocacao,
  buffsRecomendados, curaRecomendada, perfilDoPreset, spellDef, spellsFor,
  type AlarmeTipo, type CuraAcao, type CuraQuando, type DiarioCanal, type DiarioItem, type EstagiarioConfig, type EstagiarioEstadoMsg,
  type Perfil, type RegraAtaque, type RegraBuff, type RegraCura, type Vocation,
} from "@lemonquest/shared";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { groupsStore } from "../hotkeys/hotkeys.ts";
import { itemsFor, type SpellItem } from "../hotkeys/spellsModel.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { vocationMeta } from "../hud/vocations.ts";
import { meStore } from "../hud/world.ts";
import { bindOverlay } from "../overlays.ts";
import { partyStore } from "../party/party.ts";
import {
  addRegraAtaque, addRegraBuff, addRegraCura, alternarAlarme, aplicarRascunho, apagarRota, closeEstagiario, descartarRascunho, descricaoPerfil,
  diarioStore, editarRascunho, estadoRecebidoEm, estagiarioOpen, estagiarioStore, fmtPonto, fmtTurno, gravar, LIMITES, lerNumero, ligar, moverRegra,
  ondeConta, PRESET_LABEL, QUANDO_BUFF, rascunhoStore, rascunhoSujo, removerRegra, renomearRota, rotuloBuff, rotuloDistancia, salvarConfig, setRegra,
  turnoMostrado,
} from "./store.ts";
import "./estagiario.css";

// Esc pela pilha de sobreposições (a última janela aberta fecha primeiro), também com o foco num campo da janela.
bindOverlay("estagiario", estagiarioOpen, (v) => v, () => closeEstagiario(), ".est-win");

type Aba = "perfil" | "cura" | "ataque" | "buffs" | "rota" | "alarmes" | "diario";
const ABAS: { id: Aba; label: string }[] = [
  { id: "perfil", label: "Perfil" }, { id: "cura", label: "Cura" }, { id: "ataque", label: "Ataque" }, { id: "buffs", label: "Buffs" }, { id: "rota", label: "Rota" },
  { id: "alarmes", label: "Alarmes" }, { id: "diario", label: "Diário" },
];
/** As abas de regras só aparecem no modo avançado (v3). */
const ABAS_REGRAS: readonly Aba[] = ["cura", "ataque", "buffs"];

const CANAL_LABEL: Record<DiarioCanal, string> = {
  cura: "cura", pocao: "poção", buff: "buff", comer: "comida", rota: "rota", interruptor: "ligar", aviso: "aviso",
};
/** Hora local "14:05:09" de uma linha do diário. */
export const fmtHora = (t: number): string => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const ALARME_LABEL: Record<AlarmeTipo, { nome: string; quando: string }> = {
  pocao: { nome: "Poção acabando", quando: "menos de 10 poções do tipo usado na cura" },
  vidaBaixa: { nome: "Vida baixa", quando: "vida abaixo do limite, mesmo com a cura" },
  jogador: { nome: "Jogador na tela", quando: "outro jogador a até 12 tiles (uma vez por jogador)" },
  atacado: { nome: "Atacado por jogador", quando: "um jogador causou dano em você" },
  privada: { nome: "Mensagem privada", quando: "alguém sussurrou para você" },
  turno: { nome: "Turno acabando", quando: "faltam 5 min de turno" },
  mochila: { nome: "Mochila cheia", quando: "o loot não coube e ficou no chão" },
  morte: { nome: "Você morreu", quando: "sempre avisa (não desliga)" },
  colega: { nome: "Colega seguido", quando: "ele morreu, saiu do grupo ou saiu do jogo (parou de seguir), ou sumiu de vista (continua procurando)" },
};

const PAUSA_LABEL: Record<string, string> = { manual: "pausada: você se mexeu", npc: "pausada: conversa com NPC" };

/** Filtros do Diário (chips): quais canais cada um mostra; "tudo" = todos. */
type Filtro = "tudo" | "cura" | "rota" | "buff" | "aviso";
const FILTROS: readonly { id: Filtro; label: string; canais: readonly DiarioCanal[] }[] = [
  { id: "tudo", label: "Tudo", canais: [] },
  { id: "cura", label: "Cura e poção", canais: ["cura", "pocao"] },
  { id: "rota", label: "Rota", canais: ["rota", "interruptor"] },
  { id: "buff", label: "Buffs e comida", canais: ["buff", "comer"] },
  { id: "aviso", label: "Avisos", canais: ["aviso"] },
];

const val = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value;

export function EstagiarioWindow() {
  const open = useStore(estagiarioOpen);
  if (!open) return null;
  return <EstagiarioDialog />;
}

function EstagiarioDialog() {
  const e = useStore(estagiarioStore);
  const r = useStore(rascunhoStore);
  const me = useStore(meStore);
  const [aba, setAba] = useState<Aba>("perfil");
  const drag = useWindowDrag("estagiario");
  useDialogFocus(drag.ref);
  const simples = r?.modo === "simples";
  const abas = simples ? ABAS.filter((a) => !ABAS_REGRAS.includes(a.id)) : ABAS;
  // Voltou ao modo simples com uma aba de regras aberta: ela some, o Perfil fica.
  useEffect(() => { if (simples && ABAS_REGRAS.includes(aba)) setAba("perfil"); }, [simples, aba]);
  // Linhas do diário que chegaram desde a última vez que a aba foi vista: um contador na aba.
  const diario = useStore(diarioStore);
  const [vistoAte, setVistoAte] = useState(0);
  useEffect(() => { if (aba === "diario" && diario.length) setVistoAte(diario[diario.length - 1]!.t); }, [aba, diario]);
  const novas = aba === "diario" ? 0 : diario.filter((i) => i.t > vistoAte).length;
  return (
    <div ref={drag.ref} class={`hud-card hud-window est-win${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Estagiário">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Estagiário</span>
        <button class="win-close" onClick={closeEstagiario} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      {!e || !r || !me ? <div class="est-empty">Esperando o servidor…</div> : (
        <>
          <Cabecalho e={e} />
          <div class="est-tabs" role="tablist">
            {abas.map((a) => (
              <button
                key={a.id} role="tab" aria-selected={aba === a.id} class={`est-tab${aba === a.id ? " active" : ""}`}
                onClick={() => setAba(a.id)} data-testid={`est-tab-${a.id}`}
              >
                {a.label}
                {a.id === "diario" && novas > 0 && <span class="est-tab-badge" aria-label={`${novas} linhas novas`}>{novas > 9 ? "9+" : novas}</span>}
              </button>
            ))}
          </div>
          <div class="est-body">
            {aba === "perfil" && <AbaPerfil c={{ ...e.config, ...r }} voc={me.vocation} />}
            {aba === "cura" && <AbaCura c={{ ...e.config, ...r }} voc={me.vocation} />}
            {aba === "ataque" && <AbaAtaque c={{ ...e.config, ...r }} voc={me.vocation} level={me.level} />}
            {aba === "buffs" && <AbaBuffs c={{ ...e.config, ...r }} voc={me.vocation} level={me.level} />}
            {aba === "rota" && <AbaRota e={e} />}
            {aba === "alarmes" && <AbaAlarmes c={{ ...e.config, ...r }} />}
            {aba === "diario" && <AbaDiario />}
          </div>
          {rascunhoSujo(r, e.config) && (
            <div class="est-pend" role="status">
              <span>Alterações não aplicadas</span>
              <button class="est-btn" onClick={descartarRascunho} data-testid="est-descartar">Descartar</button>
              <button class="est-btn est-aplicar" onClick={aplicarRascunho} data-testid="est-aplicar">Aplicar</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Cabecalho({ e }: { e: EstagiarioEstadoMsg }) {
  // O turno anda entre um envio do servidor e outro (a cada 10 s com a rota rodando).
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const turno = turnoMostrado(e, estadoRecebidoEm(), now, TURNO_MAX_MS, TURNO_RECARGA);
  // Caçando = rota ou seguindo um colega: os três interruptores ficam ligados por tabela.
  const cacando = e.rota !== null || e.seguindo !== null;
  const porQue = e.rota !== null ? "pela rota" : e.seguindo ? "pelo colega" : "";
  const estado = e.rota !== null
    ? { cls: "on", texto: <>Rota <b>{e.rota}</b></> }
    : e.seguindo
      ? { cls: "on", texto: <>Seguindo <b>{e.seguindo.nome}</b></> }
      : e.gravando ? { cls: "rec", texto: <>Gravando rota…</> } : { cls: "", texto: <>Parado</> };
  const sub = cacando ? (e.pausa ? PAUSA_LABEL[e.pausa] ?? "pausada" : "rodando") : null;
  const pct = Math.max(0, Math.min(100, (turno / TURNO_MAX_MS) * 100));
  return (
    <div class="est-head">
      <div class="est-state">
        <span class={`est-state-dot${estado.cls ? ` ${estado.cls}` : ""}`} aria-hidden="true" />
        <div class="est-state-text">
          <span class="est-state-main" data-testid="est-estado">
            {estado.texto}
            {sub && <span class="est-state-sub"> · {sub}</span>}
            {e.rota !== null && e.ponto && <span class="est-ponto" data-testid="est-ponto"> · {fmtPonto(e.ponto)}</span>}
          </span>
          {/* Por que não está agindo agora (o pausado já aparece ao lado do estado). */}
          {e.motivo && !e.motivo.startsWith("pausado") && <span class="est-motivo" role="status" data-testid="est-motivo">{e.motivo}</span>}
        </div>
        {cacando && (
          <button class="est-btn est-stop" onClick={() => ligar(e.rota !== null ? { rota: null } : { seguir: null })} data-testid="est-parar-tudo">
            Parar
          </button>
        )}
        <div class="est-turno" data-tip="Turno de caça" data-tip-sub="Gasta com a rota ou seguindo um colega; recarrega 5 min por hora (máx. 2 h)">
          <span class="est-turno-bar" role="progressbar" aria-label="Turno restante" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <span class="est-turno-fill" style={{ width: `${pct}%` }} />
          </span>
          <span class="est-turno-num">{fmtTurno(turno)}</span>
        </div>
      </div>
      <div class="est-switches">
        <Interruptor
          label="Cura" on={e.cura} disabled={cacando} hint={cacando ? `ligada ${porQue}` : undefined}
          onClick={() => ligar({ cura: !e.cura })} testid="est-cura"
        />
        <Interruptor
          label="Ataque" on={e.ataque} disabled={cacando} hint={cacando ? `ligado ${porQue}` : undefined}
          onClick={() => ligar({ ataque: !e.ataque })} testid="est-ataque"
        />
        <Interruptor
          label="Buffs" on={e.buffs} disabled={cacando} hint={cacando ? `ligados ${porQue}` : undefined}
          onClick={() => ligar({ buffs: !e.buffs })} testid="est-buffs"
        />
      </div>
    </div>
  );
}

function Interruptor({ label, on, disabled, hint, onClick, testid }: { label: string; on: boolean; disabled?: boolean; hint?: string; onClick: () => void; testid: string }) {
  return (
    <button
      class={`est-switch${on ? " on" : ""}`} role="switch" aria-checked={on} disabled={disabled} onClick={onClick} data-testid={testid}
      data-tip={hint ? `${label}: ${hint}` : undefined}
    >
      <span class="est-knob" aria-hidden="true" />
      <span>{label}</span>
      {hint && <span class="est-hint">{hint}</span>}
    </button>
  );
}

/**
 * Campo de número do rascunho. Guarda o texto digitado (vazio, "0", "150"...) sem limitar nem trocar a cada tecla: o
 * `value` do <input> é esse texto, então nenhum redesenho (estado do servidor, outro campo) apaga a digitação. O número
 * vai cru ao rascunho (NaN se inválido) e a faixa só vale no Aplicar; quando o valor muda por fora (Aplicar com o número
 * limitado, Descartar, recomendado), o texto passa a mostrá-lo.
 */
function CampoNumero({ label, lim, value, onValor, step }: { label: string; lim: { lo: number; hi: number }; value: number; onValor: (v: number) => void; step?: number }) {
  const [texto, setTexto] = useState(() => (Number.isFinite(value) ? String(value) : ""));
  // Layout (antes de pintar): sem um quadro com o texto velho depois do Aplicar/Descartar.
  useLayoutEffect(() => {
    if (!Object.is(lerNumero(texto), value)) setTexto(Number.isFinite(value) ? String(value) : "");
  }, [value]);
  return (
    <input
      class="est-num" type="number" min={lim.lo} max={lim.hi} step={step} aria-label={label} value={texto}
      onInput={(ev) => { const t = val(ev); setTexto(t); onValor(lerNumero(t)); }}
    />
  );
}

// ---------- Perfil (v3: modo simples × avançado) ----------

/**
 * Modo simples: um preset (Seguro / Equilibrado / Agressivo) ou os três números à mão (emergência, conforto, reserva de
 * mana); ataque, buffs e distância são os recomendados da vocação. Modo avançado: as abas Cura, Ataque e Buffs valem.
 */
function AbaPerfil({ c, voc }: { c: EstagiarioConfig; voc: Vocation }) {
  const simples = c.modo === "simples";
  // Mexer num número tira o preset (o servidor guardaria os números do preset, não os seus).
  const setPerfil = (patch: Partial<Perfil>) => editarRascunho({ preset: null, perfil: { ...c.perfil, ...patch } });
  return (
    <div class="est-pane">
      {simples ? (
        <>
          <section class="est-section">
            <h4 class="est-h">Perfil de caça</h4>
            <div class="est-presets" role="radiogroup" aria-label="Perfil">
              {PRESETS.map((pr) => (
                <button
                  key={pr} role="radio" aria-checked={c.preset === pr} class={`est-preset${c.preset === pr ? " on" : ""}`}
                  onClick={() => editarRascunho({ preset: pr, perfil: perfilDoPreset(pr, voc) })} data-testid={`est-preset-${pr}`}
                >
                  <span class="est-preset-nome">{PRESET_LABEL[pr].nome}{pr === "equilibrado" && <span class="est-badge">padrão</span>}</span>
                  <span class="est-preset-dica">{PRESET_LABEL[pr].dica}</span>
                </button>
              ))}
              {c.preset === null && (
                <span class="est-preset on est-preset-proprio" data-testid="est-preset-proprio">
                  <span class="est-preset-nome">Números seus</span>
                  <span class="est-preset-dica">escolha um perfil para voltar ao recomendado</span>
                </span>
              )}
            </div>
          </section>
          <section class="est-section">
            <h4 class="est-h">Ajuste fino</h4>
            <Deslizador label="Emergência" lim={LIMITES.emergencia} value={c.perfil.emergencia} onValor={(v) => setPerfil({ emergencia: v })} testid="est-emergencia" />
            <Deslizador label="Conforto" lim={LIMITES.conforto} value={c.perfil.conforto} onValor={(v) => setPerfil({ conforto: v })} testid="est-conforto" />
            <Deslizador label="Reserva de mana" lim={LIMITES.reserva} value={c.perfil.reserva} onValor={(v) => setPerfil({ reserva: v })} testid="est-reserva" />
            <ul class="est-perfil-desc" data-testid="est-perfil-desc">
              {descricaoPerfil(c.perfil).map((t) => <li key={t}>{t}</li>)}
            </ul>
            <p class="est-note">
              {c.preset ? "Com um perfil escolhido o jogo guarda só o nome: quando o perfil melhora, você recebe a versão nova sozinho. " : "Números seus ficam como estão. "}
              Ataque, buffs e distância são os recomendados da sua vocação. A poção e a magia de cura são recargas diferentes e saem juntas quando precisa.
            </p>
          </section>
          <section class="est-section">
            <div class="est-row">
              <Interruptor label="Comer sozinho" on={c.comer} onClick={() => editarRascunho({ comer: !c.comer })} testid="est-comer" />
              <span class="est-note">com a Cura ligada, come a primeira comida da mochila quando o "alimentado" está acabando</span>
            </div>
          </section>
        </>
      ) : (
        <section class="est-section">
          <h4 class="est-h">Modo avançado</h4>
          <p class="est-note">Valem as regras das abas Cura, Ataque e Buffs. O perfil do modo simples fica guardado para quando você voltar.</p>
        </section>
      )}
      <div class="est-row est-modo-row">
        <Interruptor label="Modo avançado" on={!simples} onClick={() => editarRascunho({ modo: simples ? "avancado" : "simples" })} testid="est-modo" />
        <span class="est-note">{simples ? "Prefere montar as regras uma a uma? As abas Cura, Ataque e Buffs aparecem." : "Desligue para voltar ao perfil de três números."}</span>
      </div>
    </div>
  );
}

/** Deslizador com o número ao lado (os dois mexem no mesmo valor do rascunho; a faixa só vale no Aplicar). */
function Deslizador({ label, lim, value, onValor, testid }: { label: string; lim: { lo: number; hi: number }; value: number; onValor: (v: number) => void; testid: string }) {
  const v = Number.isFinite(value) ? value : lim.lo;
  return (
    <div class="est-slider">
      <span class="est-slider-label">{label}</span>
      <input
        type="range" min={lim.lo} max={lim.hi} step={1} value={v} aria-label={label} style={{ "--pct": `${((v - lim.lo) / (lim.hi - lim.lo)) * 100}%` }}
        onInput={(ev) => onValor(Number(val(ev)))} data-testid={testid}
      />
      <CampoNumero label={`${label} (%)`} lim={lim} value={value} onValor={onValor} />
      <span class="est-note">%</span>
    </div>
  );
}

// ---------- Cura ----------

/** Valor do select de ação: "pocao:hp" | "pocao:mana" | "magia:<id>". */
const acaoKey = (a: CuraAcao): string => ("pocao" in a ? `pocao:${a.pocao}` : `magia:${a.magia}`);
const acaoDe = (k: string): CuraAcao => (k.startsWith("magia:") ? { magia: k.slice(6) } : { pocao: k === "pocao:mana" ? "mana" : "hp" });

const QUANDO_CURA: readonly { id: CuraQuando; label: string }[] = [{ id: "vida", label: "Vida" }, { id: "mana", label: "Mana" }, { id: "aliado", label: "Aliado" }];

function AbaCura({ c, voc }: { c: EstagiarioConfig; voc: Vocation }) {
  const curas = useMemo(() => spellsFor(voc).filter((s) => s.heal), [voc]);
  // Cura em grupo (druida/fada): a regra "Aliado" (colega de grupo abaixo de X %) só existe com ela.
  const emGrupo = useMemo(() => curas.filter((s) => s.target === "party"), [curas]);
  const set = (cura: readonly RegraCura[]) => editarRascunho({ cura: [...cura] });
  const mudarQuando = (i: number, raw: string) => {
    const quando: CuraQuando = raw === "mana" || (raw === "aliado" && emGrupo.length) ? (raw as CuraQuando) : "vida";
    const r = c.cura[i]!;
    // "Aliado" só com cura em grupo: troca a ação se a atual não serve.
    const acao: CuraAcao = quando === "aliado" && !("magia" in r.acao && emGrupo.some((s) => "magia" in r.acao && s.id === r.acao.magia)) ? { magia: emGrupo[0]!.id } : r.acao;
    set(setRegra(c.cura, i, { quando, acao }));
  };
  return (
    <div class="est-pane">
      <p class="est-note">
        Avaliadas de cima para baixo a cada instante: a primeira que vale e está pronta sai. Respeita as recargas de magia e poção; a poção
        bebida é a menor que cobre o que falta.{emGrupo.length > 0 && " \"Aliado\": um colega de grupo ao alcance da cura em grupo abaixo da porcentagem."}
      </p>
      {c.cura.length === 0 && <div class="est-empty">Nenhuma regra de cura.</div>}
      <ol class="est-rules">
        {c.cura.map((r, i) => (
          <li key={i} class="est-rule">
            <span class="est-idx">{i + 1}</span>
            <select class="est-sel" aria-label="Quando" value={r.quando} onChange={(e) => mudarQuando(i, val(e))}>
              {QUANDO_CURA.filter((q) => q.id !== "aliado" || emGrupo.length > 0).map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
            </select>
            <span>abaixo de</span>
            <CampoNumero label="Porcentagem" lim={LIMITES.abaixoDe} value={r.abaixoDe} onValor={(v) => set(setRegra(c.cura, i, { abaixoDe: v }))} />
            <span>% →</span>
            <select class="est-sel est-grow" aria-label="Ação" value={acaoKey(r.acao)} onChange={(e) => set(setRegra(c.cura, i, { acao: acaoDe(val(e)) }))}>
              {r.quando !== "aliado" && <option value="pocao:hp">Poção de vida</option>}
              {r.quando !== "aliado" && <option value="pocao:mana">Poção de mana</option>}
              {(r.quando === "aliado" ? emGrupo : curas).map((s) => <option key={s.id} value={`magia:${s.id}`}>{s.name} (lv {s.level})</option>)}
              {"magia" in r.acao && !curas.some((s) => "magia" in r.acao && s.id === r.acao.magia) && (
                <option value={acaoKey(r.acao)}>{spellDef(r.acao.magia)?.name ?? r.acao.magia}</option>
              )}
            </select>
            <Mover l={c.cura} i={i} set={set} />
          </li>
        ))}
      </ol>
      <button class="est-btn" onClick={() => set(addRegraCura(c.cura))} disabled={c.cura.length >= REGRAS_MAX}>+ Regra</button>
      {" "}
      <button class="est-btn" onClick={() => set(curaRecomendada(voc))} data-tip="Recomendado" data-tip-sub="Troca as regras pelas recomendadas da vocação" data-testid="est-cura-recomendada">Usar recomendado</button>
      {c.cura.length >= REGRAS_MAX && <span class="est-note"> Máximo de {REGRAS_MAX} regras.</span>}
      <div class="est-row">
        <Interruptor label="Comer sozinho" on={c.comer} onClick={() => editarRascunho({ comer: !c.comer })} testid="est-comer" />
        <span class="est-note">com a Cura ligada, come a primeira comida da mochila quando o "alimentado" está acabando (menos de 1 min)</span>
      </div>
    </div>
  );
}

function Mover<T>({ l, i, set }: { l: readonly T[]; i: number; set: (l: readonly T[]) => void }) {
  return (
    <span class="est-move">
      <button class="est-mini" onClick={() => set(moverRegra(l, i, -1))} disabled={i === 0} aria-label="Subir" data-tip="Subir">▲</button>
      <button class="est-mini" onClick={() => set(moverRegra(l, i, 1))} disabled={i === l.length - 1} aria-label="Descer" data-tip="Descer">▼</button>
      <button class="est-mini est-del" onClick={() => set(removerRegra(l, i))} aria-label="Remover" data-tip="Remover">×</button>
    </span>
  );
}

// ---------- Ataque ----------

/** O que a regra de ataque pode conjurar, como a janela Magias lista: grupos do jogador, famílias e magias de dano. */
function useOpcoesAtaque(voc: Vocation): { label: string; items: SpellItem[] }[] {
  const groups = useStore(groupsStore);
  return useMemo(() => {
    const it = itemsFor(voc, groups);
    return [
      { label: "Seus grupos", items: it.groups },
      { label: "Famílias", items: it.families },
      { label: "Magias", items: it.spells.filter((s) => { const d = s.spells[0]; return !!d?.damage && !d.heal; }) },
    ].filter((g) => g.items.length > 0);
  }, [voc, groups]);
}

function AbaAtaque({ c, voc, level }: { c: EstagiarioConfig; voc: Vocation; level: number }) {
  const opcoes = useOpcoesAtaque(voc);
  const todas = opcoes.flatMap((g) => g.items);
  const [nova, setNova] = useState("");
  const escolhida = todas.some((s) => s.id === nova) ? nova : todas[0]?.id ?? "";
  const set = (ataque: readonly RegraAtaque[]) => editarRascunho({ ataque: [...ataque] });
  const nome = (id: string) => todas.find((s) => s.id === id)?.name ?? spellDef(id)?.name ?? id;
  const opts = (atual?: string) => (
    <>
      {opcoes.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((s) => <option key={s.id} value={s.id}>{s.name}{s.level > level && Number.isFinite(s.level) ? ` (lv ${s.level})` : ""}</option>)}
        </optgroup>
      ))}
      {atual && !todas.some((s) => s.id === atual) && <option value={atual}>{nome(atual)}</option>}
    </>
  );
  return (
    <div class="est-pane">
      <p class="est-note">
        Alvo: o monstro mais próximo à vista (nunca jogador). Regras de cima para baixo: conta os monstros em volta de você (em volta
        do alvo nas magias de área no alvo; nos tiles da onda virada para o alvo nas ondas) e conjura a primeira que bate, está pronta e
        alcança o alvo. Família e grupo escolhem a magia pronta como as teclas inteligentes. "Mana ≥" troca a reserva geral só naquela
        regra (0 = a reserva); "alvo com ≥ X% de vida" poupa a magia grande no bicho quase morto (0 = qualquer).
      </p>
      {c.ataque.length === 0 && <div class="est-empty">Nenhuma regra: só o ataque básico.</div>}
      <ol class="est-rules">
        {c.ataque.map((r, i) => (
          <li key={i} class="est-rule">
            <span class="est-idx">{i + 1}</span>
            <span>≥</span>
            <CampoNumero label="Monstros" lim={LIMITES.minBichos} value={r.minBichos} onValor={(v) => set(setRegra(c.ataque, i, { minBichos: v }))} />
            <span>bichos a até</span>
            <CampoNumero label="Raio em tiles" lim={LIMITES.raio} value={r.raio} onValor={(v) => set(setRegra(c.ataque, i, { raio: v }))} />
            <span>tiles {ondeConta(r.magia)} →</span>
            <select class="est-sel est-grow" aria-label="Magia" value={r.magia} onChange={(e) => set(setRegra(c.ataque, i, { magia: val(e) }))}>
              {opts(r.magia)}
            </select>
            <Mover l={c.ataque} i={i} set={set} />
            <span class="est-inline est-opc">
              mana ≥ <CampoNumero label="Mana mínima da regra" lim={LIMITES.pctOpcional} value={r.manaMin ?? 0} onValor={(v) => set(setRegra(c.ataque, i, { manaMin: v }))} />%
              {" · "}alvo com ≥ <CampoNumero label="Vida mínima do alvo" lim={LIMITES.pctOpcional} value={r.vidaAlvoMin ?? 0} onValor={(v) => set(setRegra(c.ataque, i, { vidaAlvoMin: v }))} />% de vida
            </span>
          </li>
        ))}
      </ol>
      <div class="est-row">
        <select class="est-sel est-grow" aria-label="Magia da regra nova" value={escolhida} onChange={(e) => setNova(val(e))} disabled={!todas.length}>
          {opts()}
        </select>
        <button class="est-btn" onClick={() => set(addRegraAtaque(c.ataque, escolhida))} disabled={c.ataque.length >= REGRAS_MAX || !escolhida}>+ Regra</button>
      </div>
      <button class="est-btn" onClick={() => set(ataqueRecomendado(voc))} data-tip="Recomendado" data-tip-sub="Uma regra por magia de área (com o raio dela) e a tecla de alvo da vocação no fim" data-testid="est-ataque-recomendado">Usar recomendado</button>
      <label class="est-row">
        <span>Reserva de mana: não conjura ataque abaixo de</span>
        <CampoNumero label="Reserva de mana" lim={LIMITES.reservaMana} step={5} value={c.reservaMana} onValor={(v) => editarRascunho({ reservaMana: v })} />
        <span>% de mana</span>
      </label>
      {/* Manter distância (v2, decisão do dono): só para quem ataca à distância; o cavaleiro luta colado. */}
      {voc !== "knight" && (
        <>
          <label class="est-row">
            <span>Manter distância do alvo:</span>
            <select class="est-sel" aria-label="Distância" value={String(c.distancia)} onChange={(e) => editarRascunho({ distancia: Number(val(e)) })} data-testid="est-distancia">
              {DISTANCIAS.map((d) => <option key={d} value={String(d)}>{rotuloDistancia(d)}</option>)}
            </select>
          </label>
          <p class="est-note">
            Só com a rota rodando: para de perseguir a essa distância (com visão) e recua um passo quando um bicho corpo a corpo encosta.
            Monstro que ataca à distância não faz recuar; com arma corpo a corpo, fica colado.
          </p>
        </>
      )}
    </div>
  );
}

// ---------- Buffs ----------

function AbaBuffs({ c, voc, level }: { c: EstagiarioConfig; voc: Vocation; level: number }) {
  const opcoes = useMemo(() => buffsDaVocacao(voc), [voc]);
  const livres = opcoes.filter((s) => !c.buffs.some((r) => r.magia === s.id));
  const [nova, setNova] = useState("");
  const escolhida = livres.some((s) => s.id === nova) ? nova : livres[0]?.id ?? "";
  const set = (buffs: readonly RegraBuff[]) => editarRascunho({ buffs: [...buffs] });
  const rotulo = (id: string) => { const s = spellDef(id); return s ? rotuloBuff(s, level) : id; };
  return (
    <div class="est-pane">
      <p class="est-note">
        Mantém os buffs (e a invocação) ativos: quando um acaba, conjura de novo (um por vez, depois da cura). "Em combate" = deu ou levou
        dano há pouco. Sai sempre que a magia tem mana (a reserva de mana do ataque não segura buff); "mana ≥" é uma exigência a mais
        sua (0 = nenhuma). Acima do seu level, o buff é pulado.
      </p>
      {c.buffs.length === 0 && <div class="est-empty">Nenhum buff.</div>}
      <ol class="est-rules">
        {c.buffs.map((r, i) => (
          <li key={i} class="est-rule">
            <span class="est-idx">{i + 1}</span>
            <select class="est-sel est-grow" aria-label="Buff" value={r.magia} onChange={(e) => set(setRegra(c.buffs, i, { magia: val(e) }))}>
              {opcoes.filter((s) => s.id === r.magia || !c.buffs.some((x) => x.magia === s.id)).map((s) => <option key={s.id} value={s.id}>{rotulo(s.id)}</option>)}
              {!opcoes.some((s) => s.id === r.magia) && <option value={r.magia}>{rotulo(r.magia)}</option>}
            </select>
            <select class="est-sel" aria-label="Quando" value={r.quando} onChange={(e) => { const q = val(e); set(setRegra(c.buffs, i, { quando: q === "combate" || q === "fora" ? q : "sempre" })); }}>
              {QUANDO_BUFF.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
            </select>
            <Mover l={c.buffs} i={i} set={set} />
            <span class="est-inline est-opc">
              mana ≥ <CampoNumero label="Mana mínima do buff" lim={LIMITES.pctOpcional} value={r.manaMin ?? 0} onValor={(v) => set(setRegra(c.buffs, i, { manaMin: v }))} />%
            </span>
          </li>
        ))}
      </ol>
      <div class="est-row">
        <select class="est-sel est-grow" aria-label="Buff novo" value={escolhida} onChange={(e) => setNova(val(e))} disabled={!livres.length}>
          {livres.map((s) => <option key={s.id} value={s.id}>{rotulo(s.id)}</option>)}
        </select>
        <button class="est-btn" onClick={() => set(addRegraBuff(c.buffs, escolhida))} disabled={c.buffs.length >= REGRAS_MAX || !escolhida}>+ Buff</button>
      </div>
      <button class="est-btn" onClick={() => set(buffsRecomendados(voc))} data-tip="Recomendado" data-tip-sub="Troca a lista pelos buffs recomendados da vocação" data-testid="est-buffs-recomendado">Usar recomendado</button>
    </div>
  );
}

// ---------- Rota ----------

function AbaRota({ e }: { e: EstagiarioEstadoMsg }) {
  const c = e.config;
  const [nome, setNome] = useState<string | null>(null); // null = sem pedir nome; string = pedindo o nome ao parar
  const [renomear, setRenomear] = useState<{ de: string; para: string } | null>(null);
  const [erro, setErro] = useState("");
  // A gravação acabou (salva, descartada ou outro cliente): some o campo do nome.
  useEffect(() => { if (!e.gravando) setNome(null); }, [e.gravando]);
  const salvar = () => {
    const n = (nome ?? "").trim();
    if (!n) { setErro("Dê um nome à rota."); return; }
    setErro("");
    gravar({ acao: "parar", nome: n });
  };
  const confirmarRenome = () => {
    if (!renomear) return;
    const next = renomearRota(c, renomear.de, renomear.para);
    if (!next) { setErro("Nome vazio ou já usado por outra rota."); return; }
    setErro("");
    salvarConfig(next);
    setRenomear(null);
  };
  const party = useStore(partyStore);
  const me = useStore(meStore);
  const colegas = party ? party.members.filter((m) => m.id !== me?.id) : [];
  return (
    <div class="est-pane">
      <section class="est-section">
      <h4 class="est-h">Rotas gravadas</h4>
      <p class="est-note">
        Grave andando pela caça. Rodando, o Estagiário anda de ponto em ponto, para e mata o que vê, pega o loot pelo seu loot
        automático e volta ao começo no fim. Gasta turno; se você se mexer, pausa 10 s.
      </p>
      {c.rotas.length === 0 && !e.gravando && <div class="est-empty">Nenhuma rota gravada ainda. Aperte "Gravar" e ande pela caça.</div>}
      <ul class="est-routes">
        {c.rotas.map((r) => {
          const ativa = e.rota === r.nome;
          return (
            <li key={r.nome} class={`est-route${ativa ? " on" : ""}`}>
              {renomear?.de === r.nome ? (
                <>
                  <CampoNome
                    label="Novo nome" value={renomear.para} onInput={(v) => setRenomear({ de: r.nome, para: v })} onEnter={confirmarRenome}
                  />
                  <button class="est-mini" onClick={confirmarRenome}>OK</button>
                  <button class="est-mini" onClick={() => { setRenomear(null); setErro(""); }}>Cancelar</button>
                </>
              ) : (
                <>
                  <span class="est-route-name">{r.nome}</span>
                  <span class="est-route-pts">{r.pontos.length} pontos</span>
                  {ativa
                    ? <button class="est-btn est-stop" onClick={() => ligar({ rota: null })} data-testid="est-desligar">Desligar</button>
                    : <button class="est-btn" onClick={() => ligar({ rota: r.nome })} disabled={e.gravando} data-testid={`est-ligar-${r.nome}`}>Ligar</button>}
                  <button class="est-mini" onClick={() => setRenomear({ de: r.nome, para: r.nome })} disabled={ativa} data-tip={ativa ? "Desligue a rota primeiro" : undefined}>Renomear</button>
                  <button class="est-mini est-del" onClick={() => salvarConfig(apagarRota(c, r.nome))} disabled={ativa} data-tip={ativa ? "Desligue a rota primeiro" : undefined}>Apagar</button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {e.gravando ? (
        <div class="est-rec">
          <span class="est-rec-dot" aria-hidden="true" />
          <span>Gravando… {e.pontosGravados} {e.pontosGravados === 1 ? "ponto" : "pontos"}</span>
          <span class="est-note">termine perto de onde começou (a rota é um circuito)</span>
          {nome === null ? (
            <button class="est-btn" onClick={() => { setNome(""); setErro(""); }} data-testid="est-parar">Parar e salvar</button>
          ) : (
            <>
              <CampoNome label="Nome da rota" value={nome} onInput={setNome} onEnter={salvar} testid="est-nome" />
              <button class="est-btn" onClick={salvar} data-testid="est-salvar-rota">Salvar</button>
            </>
          )}
          <button class="est-mini est-del" onClick={() => gravar({ acao: "descartar" })}>Descartar</button>
        </div>
      ) : (
        <div class="est-row">
          <button
            class="est-btn" onClick={() => gravar({ acao: "iniciar" })} disabled={e.rota !== null || e.seguindo !== null} data-testid="est-gravar"
            data-tip={e.rota !== null ? "Desligue a rota para gravar outra" : e.seguindo ? "Pare de seguir para gravar" : undefined}
          >
            ● Gravar
          </button>
          <span class="est-note">{c.rotas.length}/{ROTAS_MAX} rotas{c.rotas.length >= ROTAS_MAX ? " (salvar com o nome de uma existente substitui)" : ""}</span>
        </div>
      )}
      {erro && <div class="est-err" role="alert">{erro}</div>}
      </section>
      <section class="est-section">
        <h4 class="est-h">Caçar com um colega</h4>
        <p class="est-note">
          O Estagiário anda atrás de um colega do seu grupo, mata o que aparece (o alvo dele primeiro) e para se ele morrer ou sair do grupo.
          Se ele sumir de vista, vai aonde o viu por último (entra no portal que ele pegou) e volta a segui-lo ao reencontrá-lo. Gasta turno como a rota. Quem lidera com uma rota espera você chegar.
        </p>
        {!party ? (
          <div class="est-empty" data-testid="est-sem-grupo">Você não está num grupo. Clique com o botão direito num colega e escolha "Convidar para o grupo".</div>
        ) : colegas.length === 0 ? (
          <div class="est-empty">Só você no grupo por enquanto.</div>
        ) : (
          <ul class="est-routes">
            {colegas.map((m) => {
              const seguindo = e.seguindo?.id === m.id;
              const v = vocationMeta(m.vocation);
              return (
                <li key={m.id} class={`est-route est-colega${seguindo ? " on" : ""}`}>
                  <img class="est-colega-face" src={v.faceset} alt="" width={19} height={19} />
                  <span class="est-route-name">{m.name}</span>
                  <span class="est-route-pts"><span style={{ color: v.color }}>{v.label}</span> · lv {m.level}</span>
                  {seguindo
                    ? <button class="est-btn est-stop" onClick={() => ligar({ seguir: null })} data-testid="est-parar-seguir">Parar de seguir</button>
                    : <button class="est-btn" onClick={() => ligar({ seguir: m.id })} disabled={e.gravando} data-testid={`est-seguir-${m.name}`}>Seguir</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Campo de nome de rota (até 20 letras, como o servidor guarda), com foco ao aparecer e Enter para confirmar. */
function CampoNome({ label, value, onInput, onEnter, testid }: { label: string; value: string; onInput: (v: string) => void; onEnter: () => void; testid?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <input
      ref={ref} class="est-text est-grow" maxLength={NOME_ROTA_MAX} placeholder={label} aria-label={label} value={value} data-testid={testid}
      onInput={(ev) => onInput(val(ev))} onKeyDown={(ev) => { if (ev.key === "Enter") onEnter(); }}
    />
  );
}

// ---------- Diário ----------

/** As últimas decisões do servidor, a mais nova em cima (v3: "por que ele não usou pote?" se responde aqui). */
function AbaDiario() {
  const diario = useStore(diarioStore);
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const canais = FILTROS.find((f) => f.id === filtro)?.canais ?? [];
  const linhas = useMemo(() => [...diario].reverse().filter((l) => !canais.length || canais.includes(l.canal)), [diario, filtro]);
  return (
    <div class="est-pane">
      <p class="est-note">
        As últimas {DIARIO_MAX} decisões do Estagiário nesta sessão: cada cura, poção, buff e comida, por que ele esperou (poção em
        recarga, magia sem mana, nenhuma poção que você possa beber), a rota e os alarmes.
      </p>
      <div class="est-chips" role="radiogroup" aria-label="Mostrar">
        {FILTROS.map((f) => (
          <button key={f.id} role="radio" aria-checked={filtro === f.id} class={`est-chip${filtro === f.id ? " on" : ""}`} onClick={() => setFiltro(f.id)} data-testid={`est-diario-${f.id}`}>
            {f.label}
          </button>
        ))}
      </div>
      {linhas.length === 0 ? (
        <div class="est-empty">{diario.length === 0 ? "Nada ainda. Ligue a Cura, o Ataque ou uma rota e as decisões aparecem aqui." : "Nada neste filtro."}</div>
      ) : (
        <ul class="est-diario" data-testid="est-diario">
          {linhas.map((l: DiarioItem, i) => (
            <li key={`${l.t}-${linhas.length - i}`} class={`est-diario-linha est-diario-${l.canal}`}>
              <span class="est-diario-hora">{fmtHora(l.t)}</span>
              <span class="est-diario-canal"><span class="est-diario-dot" aria-hidden="true" />{CANAL_LABEL[l.canal]}</span>
              <span class="est-diario-texto">{l.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Alarmes ----------

function AbaAlarmes({ c }: { c: EstagiarioConfig }) {
  return (
    <div class="est-pane">
      <p class="est-note">Só avisam (som, aviso e o título da aba); a caça continua.</p>
      <ul class="est-alarms">
        {ALARMES.map((t) => {
          const on = t === "morte" || c.alarmes[t] !== false;
          return (
            <li key={t} class="est-alarm">
              <Interruptor label={ALARME_LABEL[t].nome} on={on} disabled={t === "morte"} onClick={() => editarRascunho({ alarmes: alternarAlarme(c, t).alarmes })} testid={`est-alarme-${t}`} />
              <span class="est-note">{ALARME_LABEL[t].quando}</span>
              {t === "vidaBaixa" && (
                <label class="est-inline">
                  abaixo de
                  <CampoNumero label="Vida do alarme" lim={LIMITES.vidaAlarme} value={c.vidaAlarme} onValor={(v) => editarRascunho({ vidaAlarme: v })} />
                  %
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
