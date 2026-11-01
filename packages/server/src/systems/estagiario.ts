// Estagiário (spec docs/superpowers/specs/2026-11-01-estagiario-design.md): o bot de caça do próprio jogo. O cérebro
// fica aqui no servidor (a aba do navegador adormece em segundo plano, justamente no caso AFK) e age pelas APIs dos
// sistemas que já existem: magias, poções, busca de alvo/perseguição e o acompanhante visível. As regras puras
// (sanitização, turno, escolha de cura/ataque) estão em shared/estagiario.ts.
import {
  BUSCA_TILES, PAUSA_MANUAL_MS, S2C, alarmeLigado, avancarTurno, escolherAtaque, escolherCura, estagiarioPadrao,
  indiceMaisProximo, isFamilyId, pickFromFamily, resolveFamily, sanitizeEstagiario,
  type AlarmeTipo, type CuraAcao, type EstagiarioAlarmeMsg, type EstagiarioConfig, type EstagiarioConfigMsg,
  type EstagiarioEstadoMsg, type EstagiarioGravarMsg, type EstagiarioPausa, type EstagiarioToggleMsg, type NoticeMsg,
  type QuickPotionKind, type SpellGroup, type TurnoEstado,
} from "@lemonquest/shared";
import type { CharacterData } from "../persistence/types.ts";
import type { PlayerState } from "../state.ts";
import { cheb, type MonsterManager } from "./monsters.ts";
import type { MovementSystem } from "./movement.ts";

/** Intervalo do estado periódico com a rota rodando (o cliente mostra o turno restante). */
export const ESTADO_PERIODICO_MS = 10_000;
/** Busca de alvo no máximo a cada 400 ms (= AUTO_SCAN_MS do ataque automático): varrer os monstros a cada tick pesa. */
const BUSCA_MS = 400;
const AVISO_TURNO = "O turno do Estagiário acabou por hoje.";
const AVISO_PZ = "Saia da zona de proteção para ligar a rota.";

export interface EstagiarioOptions {
  spells: { ready(p: PlayerState, id: string, now?: number): boolean; cast(p: PlayerState, id: string, targetId?: string, opts?: { silent?: boolean }): { ok: boolean } };
  potions: { potionReady(p: PlayerState, now?: number): boolean; usePotion(p: PlayerState, kind: QuickPotionKind, opts?: { silent?: boolean }): boolean; countPotions(p: PlayerState, kind: QuickPotionKind): number };
  fight: { nearestTarget(p: PlayerState, reach: number): string; forceChase(id: string, on: boolean): void; resume(id: string): void };
  monsters: Pick<MonsterManager, "wild" | "all" | "inPz">;
  /** Caminhada da rota (Task 5). */
  movement: Pick<MovementSystem, "isIdle" | "pathFor" | "follow">;
  companions: { spawnCompanion(p: PlayerState, now?: number): unknown; despawnCompanion(ownerId: string): void };
  npcOpen: (id: string) => boolean;
  spellGroups: (p: PlayerState) => readonly SpellGroup[];
  players: () => Iterable<PlayerState>;
  send: (sessionId: string, type: string, msg: unknown) => void;
  now?: () => number;
}

interface Estado {
  config: EstagiarioConfig;
  /** Guardado só nas transições (rodando ↔ parado) e a cada tick com a rota rodando; parado, a recarga é calculada ao ler. */
  turno: TurnoEstado;
  cura: boolean;
  /** O ataque que o jogador escolheu; com a rota rodando o ataque fica ligado de qualquer jeito. */
  ataque: boolean;
  rota: string | null;
  /** Ponto da rota em que o Estagiário está (a caminhada é da Task 5). */
  indice: number;
  pausa: EstagiarioPausa;
  pausaAte: number;
  /** O jogador estava na PZ no tick anterior (desliga a rota só na entrada). */
  emPz: boolean;
  estadoEm: number;
  buscaEm: number;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export class EstagiarioSystem {
  private readonly st = new Map<string, Estado>();
  private readonly now: () => number;

  constructor(private readonly o: EstagiarioOptions) {
    this.now = o.now ?? Date.now;
  }

  /** Entrada no mundo: config salva (limpa de novo: pode ser de outra versão ou de outra vocação) e o turno. Nada liga. */
  load(p: PlayerState, saved: CharacterData["estagiario"]): void {
    const now = this.now();
    const config = saved?.config ? sanitizeEstagiario(saved.config, p.vocation, this.o.spellGroups(p)) : estagiarioPadrao(p.vocation);
    this.st.set(p.id, {
      config, turno: avancarTurno(saved?.turno, now, false), cura: false, ataque: false, rota: null, indice: 0,
      pausa: "", pausaAte: 0, emPz: false, estadoEm: 0, buscaEm: 0,
    });
  }

  /** Para `rec.data.estagiario`: só o que difere do padrão (config padrão e turno cheio não são gravados). */
  saved(p: PlayerState): CharacterData["estagiario"] {
    const s = this.st.get(p.id);
    if (!s) return undefined;
    const turno = this.acertar(s, this.now());
    const out: NonNullable<CharacterData["estagiario"]> = {};
    if (JSON.stringify(s.config) !== JSON.stringify(estagiarioPadrao(p.vocation))) out.config = s.config;
    if (turno.ms < avancarTurno(undefined, 0, false).ms) out.turno = { ...turno };
    return out.config || out.turno ? out : undefined;
  }

  /** Há estado carregado para o jogador (o save não apaga o campo de quem ainda não entrou). */
  carregado(id: string): boolean { return this.st.has(id); }

  onConfig(p: PlayerState, m: EstagiarioConfigMsg): void {
    const s = this.st.get(p.id);
    // Mensagem sem objeto de config é lixo: ignorar (sanitizar `undefined` voltaria tudo ao padrão e apagaria as rotas).
    if (!s || !obj(m) || !obj(m.config)) return;
    s.config = sanitizeEstagiario(m.config, p.vocation, this.o.spellGroups(p));
    const rota = s.rota && this.rotaDe(s, s.rota);
    if (s.rota && !rota) this.desligarRota(p, s);
    else if (rota) s.indice = indiceMaisProximo(rota.pontos, p); // os pontos podem ter mudado
    this.enviarEstado(p);
  }

  onToggle(p: PlayerState, m: EstagiarioToggleMsg): void {
    const s = this.st.get(p.id);
    if (!s || !obj(m)) return;
    if (typeof m.cura === "boolean") s.cura = m.cura;
    if (typeof m.ataque === "boolean") s.ataque = m.ataque;
    if (m.rota === null) this.desligarRota(p, s);
    else if (typeof m.rota === "string") this.ligarRota(p, s, m.rota);
    this.enviarEstado(p);
  }

  /** Gravação de rota: a Task 5 completa (iniciar/parar/descartar); por enquanto só responde o estado. */
  onGravar(p: PlayerState, _m: EstagiarioGravarMsg): void {
    if (this.st.has(p.id)) this.enviarEstado(p);
  }

  /** Movimento manual (setas ou clique no chão): a rota pausa por PAUSA_MANUAL_MS, renovada a cada comando. */
  manual(id: string): void {
    const s = this.st.get(id);
    if (!s?.rota) return;
    const now = this.now();
    s.pausaAte = now + PAUSA_MANUAL_MS;
    if (s.pausa === "") this.mudarPausa(id, s, "manual", now);
  }

  /** Morreu: a rota desliga (o acompanhante sai junto); cura e ataque continuam para a próxima vida. */
  onDied(p: PlayerState): void {
    const s = this.st.get(p.id);
    if (!s?.rota) return;
    this.desligarRota(p, s);
    this.enviarEstado(p);
  }

  /** Caiu a conexão ou saiu: tudo desliga (sem ninguém no cliente o Estagiário não trabalha). Ao voltar, nada religa. */
  desligarTudo(p: PlayerState): void {
    const s = this.st.get(p.id);
    if (!s) return;
    s.cura = false;
    s.ataque = false;
    this.desligarRota(p, s);
  }

  alarme(p: PlayerState, tipo: AlarmeTipo, texto: string): void {
    const s = this.st.get(p.id);
    if (!s || !alarmeLigado(s.config, tipo)) return;
    this.o.send(p.id, S2C.EstagiarioAlarme, { tipo, texto } satisfies EstagiarioAlarmeMsg);
  }

  estado(p: PlayerState): EstagiarioEstadoMsg {
    const s = this.st.get(p.id);
    const now = this.now();
    if (!s) {
      return { config: estagiarioPadrao(p.vocation), cura: false, ataque: false, rota: null, pausa: "", gravando: false, pontosGravados: 0, turnoMs: avancarTurno(undefined, now, false).ms };
    }
    return {
      config: s.config, cura: s.cura, ataque: this.ataqueLigado(s), rota: s.rota, pausa: s.pausa,
      gravando: false, pontosGravados: 0, turnoMs: avancarTurno(s.turno, now, this.rodando(s)).ms,
    };
  }

  tick(now: number): void {
    for (const p of this.o.players()) {
      const s = this.st.get(p.id);
      if (s) this.tickPlayer(p, s, now);
    }
  }

  removePlayer(id: string): void {
    this.st.delete(id);
  }

  // --- tick ---------------------------------------------------------------------------------------------------------

  private tickPlayer(p: PlayerState, s: Estado, now: number): void {
    if (s.rota) this.tickRota(p, s, now);
    if (p.hp <= 0) return;
    // No máximo uma cura por tick; o ataque vem depois (a recarga global de magia separa os dois quando os dois são magia).
    if (s.cura) this.curar(p, s, now);
    if (this.ataqueLigado(s)) this.atacar(p, s, now);
  }

  private tickRota(p: PlayerState, s: Estado, now: number): void {
    const pz = this.o.monsters.inPz(p.x, p.y);
    const entrou = pz && !s.emPz;
    s.emPz = pz;
    if (entrou) { this.desligarRota(p, s, now); this.enviarEstado(p); return; }
    const pausa: EstagiarioPausa = this.o.npcOpen(p.id) ? "npc" : now < s.pausaAte ? "manual" : "";
    if (pausa !== s.pausa) this.mudarPausa(p.id, s, pausa, now);
    if (!this.rodando(s)) return;
    this.acertar(s, now);
    if (s.turno.ms <= 0) {
      this.desligarRota(p, s, now);
      this.notice(p, AVISO_TURNO);
      this.enviarEstado(p);
      return;
    }
    if (now - s.estadoEm >= ESTADO_PERIODICO_MS) this.enviarEstado(p, now);
  }

  private curar(p: PlayerState, s: Estado, now: number): void {
    const pronto = (a: CuraAcao) => "magia" in a
      ? this.o.spells.ready(p, a.magia, now)
      : this.o.potions.potionReady(p, now) && this.o.potions.countPotions(p, a.pocao) > 0;
    const acao = escolherCura(p, s.config.cura, pronto);
    if (!acao) return;
    if ("magia" in acao) this.o.spells.cast(p, acao.magia, undefined, { silent: true });
    else this.o.potions.usePotion(p, acao.pocao, { silent: true });
  }

  private atacar(p: PlayerState, s: Estado, now: number): void {
    const mm = this.o.monsters;
    if (!mm.wild(p.targetId)) {
      // Alvo jogador (mirado à mão): o Estagiário nunca troca nem ataca jogador; a rotação fica parada.
      if (p.targetId && this.ehJogador(p.targetId)) return;
      if (now - s.buscaEm < BUSCA_MS) return;
      s.buscaEm = now;
      const id = this.o.fight.nearestTarget(p, BUSCA_TILES);
      if (!id) return;
      p.targetId = id;
      this.o.fight.resume(p.id); // persegue já, sem esperar a pausa de um movimento manual anterior
    }
    if (!s.config.ataque.length) return;
    const bichosEm = (r: number) => {
      let n = 0;
      for (const m of mm.all()) if (!m.s.ownerId && m.s.hp > 0 && cheb(p.x, p.y, m.s.x, m.s.y) <= r) n++;
      return n;
    };
    const manaPct = p.maxMana > 0 ? (p.mana / p.maxMana) * 100 : 0;
    const resolver = (id: string): string | null => {
      if (!isFamilyId(id)) return this.o.spells.ready(p, id, now) ? id : null;
      const f = resolveFamily(id, this.o.spellGroups(p), p.vocation);
      return f ? pickFromFamily(f, p.level, (sp) => this.o.spells.ready(p, sp.id, now))?.id ?? null : null;
    };
    const magia = escolherAtaque(s.config.ataque, bichosEm, manaPct, s.config.reservaMana, resolver);
    if (magia) this.o.spells.cast(p, magia, p.targetId, { silent: true });
  }

  // --- rota ---------------------------------------------------------------------------------------------------------

  private ligarRota(p: PlayerState, s: Estado, nome: string): void {
    const rota = this.rotaDe(s, nome);
    if (!rota || p.hp <= 0) return;
    const now = this.now();
    if (this.o.monsters.inPz(p.x, p.y)) { this.notice(p, AVISO_PZ); return; }
    this.acertar(s, now);
    if (s.turno.ms <= 0) { this.notice(p, AVISO_TURNO); return; }
    const ja = !!s.rota;
    s.rota = rota.nome;
    s.indice = indiceMaisProximo(rota.pontos, p);
    s.pausa = "";
    s.pausaAte = 0;
    s.emPz = false;
    s.estadoEm = now;
    if (ja) return; // trocou de rota: o resto já está ligado
    p.bot = true;
    this.o.fight.forceChase(p.id, true);
    this.o.companions.spawnCompanion(p, now);
  }

  private desligarRota(p: PlayerState, s: Estado, now = this.now()): void {
    if (!s.rota) return;
    this.acertar(s, now); // fecha a conta do turno no estado em que estava (rodando ou pausada)
    s.rota = null;
    s.pausa = "";
    s.pausaAte = 0;
    p.bot = false;
    this.o.fight.forceChase(p.id, false);
    this.o.companions.despawnCompanion(p.id);
  }

  private mudarPausa(id: string, s: Estado, pausa: EstagiarioPausa, now: number): void {
    this.acertar(s, now);
    s.pausa = pausa;
    const p = this.jogador(id);
    if (p) this.enviarEstado(p, now);
  }

  // --- auxiliares ---------------------------------------------------------------------------------------------------

  private rodando(s: Estado): boolean { return !!s.rota && s.pausa === ""; }

  private ataqueLigado(s: Estado): boolean { return s.ataque || !!s.rota; }

  /** Atualiza o turno até `now` no estado atual (gastando se a rota roda, recarregando se não). */
  private acertar(s: Estado, now: number): TurnoEstado {
    s.turno = avancarTurno(s.turno, now, this.rodando(s));
    return s.turno;
  }

  private rotaDe(s: Estado, nome: string) {
    return s.config.rotas.find((r) => r.nome === nome);
  }

  private ehJogador(id: string): boolean {
    for (const q of this.o.players()) if (q.id === id) return true;
    return false;
  }

  private jogador(id: string): PlayerState | undefined {
    for (const q of this.o.players()) if (q.id === id) return q;
    return undefined;
  }

  private enviarEstado(p: PlayerState, now = this.now()): void {
    const s = this.st.get(p.id);
    if (s) s.estadoEm = now;
    this.o.send(p.id, S2C.EstagiarioEstado, this.estado(p));
  }

  private notice(p: PlayerState, text: string): void {
    this.o.send(p.id, S2C.Notice, { text, kind: "warn" } satisfies NoticeMsg);
  }
}
