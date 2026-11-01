// Janela "Estagiário" (bot de caça; quem decide e age é o servidor, aqui só a configuração e o estado). Cabeçalho com os
// interruptores de Cura, Ataque e Buffs, a rota rodando e o turno restante; cinco abas: Cura, Ataque, Buffs, Rota e Alarmes. Cura,
// ataque, buffs, reserva de mana e alarmes mexem num rascunho (store.ts rascunhoStore) que só vai no "Aplicar"; ligar/desligar,
// gravar, renomear e apagar rota vão na hora. Abre pelo 🤖 do trilho. Molde: items/LootFilterWindow.tsx.
import { PixelIcon } from "../hud/icons.tsx";
import {
  ALARMES, NOME_ROTA_MAX, REGRAS_MAX, ROTAS_MAX, TURNO_MAX_MS, TURNO_RECARGA, ataqueRecomendado, buffsDaVocacao, buffsRecomendados,
  curaRecomendada, spellDef, spellsFor,
  type AlarmeTipo, type CuraAcao, type EstagiarioConfig, type EstagiarioEstadoMsg, type RegraAtaque, type RegraBuff, type RegraCura, type Vocation,
} from "@lemonquest/shared";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { groupsStore } from "../hotkeys/hotkeys.ts";
import { itemsFor, type SpellItem } from "../hotkeys/spellsModel.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { meStore } from "../hud/world.ts";
import { bindOverlay } from "../overlays.ts";
import {
  addRegraAtaque, addRegraBuff, addRegraCura, alternarAlarme, aplicarRascunho, apagarRota, closeEstagiario, descartarRascunho, editarRascunho,
  estadoRecebidoEm, estagiarioOpen, estagiarioStore, fmtPonto, fmtTurno, gravar, LIMITES, lerNumero, ligar, moverRegra, ondeConta, rascunhoStore,
  rascunhoSujo, removerRegra, renomearRota, salvarConfig, setRegra, turnoMostrado,
} from "./store.ts";
import "./estagiario.css";

// Esc pela pilha de sobreposições (a última janela aberta fecha primeiro), também com o foco num campo da janela.
bindOverlay("estagiario", estagiarioOpen, (v) => v, () => closeEstagiario(), ".est-win");

type Aba = "cura" | "ataque" | "buffs" | "rota" | "alarmes";
const ABAS: { id: Aba; label: string }[] = [
  { id: "cura", label: "Cura" }, { id: "ataque", label: "Ataque" }, { id: "buffs", label: "Buffs" }, { id: "rota", label: "Rota" }, { id: "alarmes", label: "Alarmes" },
];

const ALARME_LABEL: Record<AlarmeTipo, { nome: string; quando: string }> = {
  pocao: { nome: "Poção acabando", quando: "menos de 10 poções do tipo usado na cura" },
  vidaBaixa: { nome: "Vida baixa", quando: "vida abaixo do limite, mesmo com a cura" },
  jogador: { nome: "Jogador na tela", quando: "outro jogador a até 12 tiles (uma vez por jogador)" },
  atacado: { nome: "Atacado por jogador", quando: "um jogador causou dano em você" },
  privada: { nome: "Mensagem privada", quando: "alguém sussurrou para você" },
  turno: { nome: "Turno acabando", quando: "faltam 5 min de turno" },
  mochila: { nome: "Mochila cheia", quando: "o loot não coube e ficou no chão" },
  morte: { nome: "Você morreu", quando: "sempre avisa (não desliga)" },
};

const PAUSA_LABEL: Record<string, string> = { manual: "pausada: você se mexeu", npc: "pausada: conversa com NPC" };

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
  const [aba, setAba] = useState<Aba>("cura");
  const drag = useWindowDrag("estagiario");
  useDialogFocus(drag.ref);
  return (
    <div ref={drag.ref} class={`hud-card hud-window est-win${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Estagiário">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span class="est-title"><PixelIcon name="cracha" size={12} /> Estagiário</span>
        <button class="win-close" onClick={closeEstagiario} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      {!e || !r || !me ? <div class="est-empty">Esperando o servidor…</div> : (
        <>
          <Cabecalho e={e} />
          <div class="est-tabs" role="tablist">
            {ABAS.map((a) => (
              <button
                key={a.id} role="tab" aria-selected={aba === a.id} class={`est-tab${aba === a.id ? " active" : ""}`}
                onClick={() => setAba(a.id)} data-testid={`est-tab-${a.id}`}
              >{a.label}</button>
            ))}
          </div>
          <div class="est-body">
            {aba === "cura" && <AbaCura c={{ ...e.config, ...r }} voc={me.vocation} />}
            {aba === "ataque" && <AbaAtaque c={{ ...e.config, ...r }} voc={me.vocation} level={me.level} />}
            {aba === "buffs" && <AbaBuffs c={{ ...e.config, ...r }} voc={me.vocation} level={me.level} />}
            {aba === "rota" && <AbaRota e={e} />}
            {aba === "alarmes" && <AbaAlarmes c={{ ...e.config, ...r }} />}
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
  const pelaRota = e.rota !== null;
  return (
    <div class="est-head">
      <div class="est-switches">
        <Interruptor label="Cura" on={e.cura} onClick={() => ligar({ cura: !e.cura })} testid="est-cura" />
        <Interruptor
          label="Ataque" on={e.ataque} disabled={pelaRota} hint={pelaRota ? "ligado pela rota" : undefined}
          onClick={() => ligar({ ataque: !e.ataque })} testid="est-ataque"
        />
        <Interruptor
          label="Buffs" on={e.buffs} disabled={pelaRota} hint={pelaRota ? "ligado pela rota" : undefined}
          onClick={() => ligar({ buffs: !e.buffs })} testid="est-buffs"
        />
      </div>
      <div class="est-status">
        <span class={`est-rota-now${pelaRota ? " on" : ""}`}>
          {pelaRota ? <>Rota <b>{e.rota}</b>{e.pausa ? ` · ${PAUSA_LABEL[e.pausa] ?? "pausada"}` : " · rodando"}</> : e.gravando ? "Gravando rota…" : "Sem rota"}
          {pelaRota && e.ponto && <span class="est-ponto" data-testid="est-ponto"> · {fmtPonto(e.ponto)}</span>}
        </span>
        {/* Por que não está agindo agora (o pausado já aparece ao lado da rota). */}
        {e.motivo && !e.motivo.startsWith("pausado") && <span class="est-motivo" role="status" data-testid="est-motivo">{e.motivo}</span>}
        <span class="est-turno" data-tip="Turno de rota de caça" data-tip-sub="Gasta só com a rota rodando; recarrega 5 min por hora (máx. 2 h)">
          Turno {fmtTurno(turno)}
        </span>
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

// ---------- Cura ----------

/** Valor do select de ação: "pocao:hp" | "pocao:mana" | "magia:<id>". */
const acaoKey = (a: CuraAcao): string => ("pocao" in a ? `pocao:${a.pocao}` : `magia:${a.magia}`);
const acaoDe = (k: string): CuraAcao => (k.startsWith("magia:") ? { magia: k.slice(6) } : { pocao: k === "pocao:mana" ? "mana" : "hp" });

function AbaCura({ c, voc }: { c: EstagiarioConfig; voc: Vocation }) {
  const curas = useMemo(() => spellsFor(voc).filter((s) => s.heal), [voc]);
  const set = (cura: readonly RegraCura[]) => editarRascunho({ cura: [...cura] });
  return (
    <div class="est-pane">
      <p class="est-note">Avaliadas de cima para baixo a cada instante: a primeira que vale e está pronta sai. Respeita as recargas de magia e poção.</p>
      {c.cura.length === 0 && <div class="est-empty">Nenhuma regra de cura.</div>}
      <ol class="est-rules">
        {c.cura.map((r, i) => (
          <li key={i} class="est-rule">
            <span class="est-idx">{i + 1}</span>
            <select class="est-sel" aria-label="Quando" value={r.quando} onChange={(e) => set(setRegra(c.cura, i, { quando: val(e) === "mana" ? "mana" : "vida" }))}>
              <option value="vida">Vida</option>
              <option value="mana">Mana</option>
            </select>
            <span>abaixo de</span>
            <CampoNumero label="Porcentagem" lim={LIMITES.abaixoDe} value={r.abaixoDe} onValor={(v) => set(setRegra(c.cura, i, { abaixoDe: v }))} />
            <span>% →</span>
            <select class="est-sel est-grow" aria-label="Ação" value={acaoKey(r.acao)} onChange={(e) => set(setRegra(c.cura, i, { acao: acaoDe(val(e)) }))}>
              <option value="pocao:hp">Poção de vida</option>
              <option value="pocao:mana">Poção de mana</option>
              {curas.map((s) => <option key={s.id} value={`magia:${s.id}`}>{s.name} (lv {s.level})</option>)}
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
        do alvo nas magias de área no alvo; nos tiles da onda virada para o alvo nas ondas) e conjura a primeira que bate e está pronta.
        Família e grupo escolhem a magia pronta como as teclas inteligentes.
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
  const rotulo = (id: string) => {
    const s = spellDef(id);
    return s ? `${s.name}${s.level > level ? ` (lv ${s.level})` : ""}` : id;
  };
  return (
    <div class="est-pane">
      <p class="est-note">
        Mantém os buffs ativos: quando um acaba, conjura de novo (um por vez, depois da cura). "Só em combate" espera um monstro de
        alvo. Respeita a reserva de mana do ataque, menos o escudo de mana. Acima do seu level, o buff é pulado.
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
            <label class="est-inline">
              <input type="checkbox" checked={r.emCombate} onChange={(e) => set(setRegra(c.buffs, i, { emCombate: (e.currentTarget as HTMLInputElement).checked }))} />
              só em combate
            </label>
            <Mover l={c.buffs} i={i} set={set} />
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
  return (
    <div class="est-pane">
      <p class="est-note">
        Grave andando pela caça. Rodando, o Estagiário anda de ponto em ponto, para e mata o que vê (ataque ligado), pega o loot pelo
        seu loot automático e volta ao começo no fim. Gasta turno; se você se mexer, pausa 10 s.
      </p>
      {c.rotas.length === 0 && !e.gravando && <div class="est-empty">Nenhuma rota gravada.</div>}
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
          <button class="est-btn" onClick={() => gravar({ acao: "iniciar" })} disabled={e.rota !== null} data-testid="est-gravar" data-tip={e.rota !== null ? "Desligue a rota para gravar outra" : undefined}>
            ● Gravar
          </button>
          <span class="est-note">{c.rotas.length}/{ROTAS_MAX} rotas{c.rotas.length >= ROTAS_MAX ? " (salvar com o nome de uma existente substitui)" : ""}</span>
        </div>
      )}
      {erro && <div class="est-err" role="alert">{erro}</div>}
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
