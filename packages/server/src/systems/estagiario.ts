// Estagiário (spec docs/superpowers/specs/2026-11-01-estagiario-design.md): o bot de caça do próprio jogo. O cérebro
// fica aqui no servidor (a aba do navegador adormece em segundo plano, justamente no caso AFK) e age pelas APIs dos
// sistemas que já existem: magias, poções, busca de alvo/perseguição, caminho (A*) e o acompanhante visível. As regras
// puras (sanitização, turno, escolha de cura/ataque, gravação de rota) estão em shared/estagiario.ts.
import {
  BUSCA_TILES, PAUSA_MANUAL_MS, PONTO_TRAVADO_MS, ROTAS_MAX, S2C, alarmeLigado, avancarTurno, dirFromDelta,
  escolherAtaque, escolherCura, estagiarioPadrao, fecharGravacao, gravarPasso, indiceMaisProximo, isFamilyId,
  novaGravacao, pickFromFamily, resolveFamily, sanitizeEstagiario,
  type AlarmeTipo, type CuraAcao, type EstagiarioAlarmeMsg, type EstagiarioConfig, type EstagiarioConfigMsg,
  type EstagiarioEstadoMsg, type EstagiarioGravarMsg, type EstagiarioPausa, type EstagiarioToggleMsg, type Gravacao,
  type NoticeMsg, type PontoRota, type QuickPotionKind, type SpellGroup, type TurnoEstado,
} from "@lemonquest/shared";
import type { CharacterData } from "../persistence/types.ts";
import type { PlayerState } from "../state.ts";
import { cheb, type MonsterManager } from "./monsters.ts";
import type { MovementSystem } from "./movement.ts";
import type { Point } from "./pathfinding.ts";

/** Intervalo do estado periódico com a rota rodando (o cliente mostra o turno restante). */
export const ESTADO_PERIODICO_MS = 10_000;
/** Busca de alvo no máximo a cada 400 ms (= AUTO_SCAN_MS do ataque automático): varrer os monstros a cada tick pesa. */
const BUSCA_MS = 400;
const AVISO_TURNO = "O turno do Estagiário acabou por hoje.";
const AVISO_PZ = "Saia da zona de proteção para ligar a rota.";
/** Caminho até o ponto recalculado no máximo a cada 300 ms (= CHASE_REPATH_MS da perseguição): A* a cada tick pesa. */
const CAMINHO_MS = 300;

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
  /** Ponto da rota para onde o Estagiário está andando. */
  indice: number;
  /** Caminho (A*) até `pontos[caminhoAlvo]`, calculado em `caminhoEm`; -1 = nenhum (recalcula no próximo passo). */
  caminho: Point[] | null;
  caminhoEm: number;
  caminhoAlvo: number;
  /** Menor distância ao ponto atual e quando ela diminuiu pela última vez (ponto travado → pula). */
  melhorDist: number;
  progressoEm: number;
  /** Havia alvo vivo no tick anterior: ao matar, a rota retoma pelo ponto mais próximo. */
  lutando: boolean;
  /** Gravação em curso (e a posição do tick anterior, para ver o passo/teleporte). */
  grav: Gravacao | null;
  gravPos: Point;
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
      caminho: null, caminhoEm: 0, caminhoAlvo: -1, melhorDist: Infinity, progressoEm: now, lutando: false,
      grav: null, gravPos: { x: p.x, y: p.y },
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
    else if (rota) this.irPara(s, indiceMaisProximo(rota.pontos, p), this.now()); // os pontos podem ter mudado
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

  /**
   * Gravação de rota: "iniciar" começa a guardar os passos (o tick vê cada passo/teleporte); "parar" salva com o nome
   * (mesmo nome substitui; recusa sem nome, parado ou com as rotas cheias, e aí continua gravando para o jogador
   * corrigir); "descartar" só larga a gravação.
   */
  onGravar(p: PlayerState, m: EstagiarioGravarMsg): void {
    const s = this.st.get(p.id);
    if (!s || !obj(m)) return;
    if (m.acao === "iniciar") {
      // A rota andando seria gravada por cima de si mesma.
      if (s.rota) this.notice(p, "Desligue a rota para gravar outra.");
      else { s.grav = novaGravacao(p); s.gravPos = { x: p.x, y: p.y }; }
    } else if (m.acao === "descartar") s.grav = null;
    else if (m.acao === "parar" && s.grav) this.salvarGravacao(p, s, s.grav, m.nome);
    else if (m.acao !== "parar") return;
    this.enviarEstado(p);
  }

  /** Movimento manual (setas ou clique no chão): a rota pausa por PAUSA_MANUAL_MS, renovada a cada comando. */
  manual(id: string): void {
    const s = this.st.get(id);
    if (!s?.rota) return;
    const now = this.now();
    s.pausaAte = now + PAUSA_MANUAL_MS;
    if (s.pausa === "") this.mudarPausa(id, s, "manual", now);
  }

  /**
   * Morreu: a rota desliga (o acompanhante sai junto) e a gravação é largada (o teleporte para o templo viraria um
   * "portal" na rota); cura e ataque continuam para a próxima vida.
   */
  onDied(p: PlayerState): void {
    const s = this.st.get(p.id);
    if (!s?.rota && !s?.grav) return;
    s.grav = null;
    this.desligarRota(p, s);
    this.enviarEstado(p);
  }

  /** Caiu a conexão ou saiu: tudo desliga (sem ninguém no cliente o Estagiário não trabalha). Ao voltar, nada religa. */
  desligarTudo(p: PlayerState): void {
    const s = this.st.get(p.id);
    if (!s) return;
    s.cura = false;
    s.ataque = false;
    s.grav = null;
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
      gravando: !!s.grav, pontosGravados: s.grav?.pontos.length ?? 0, turnoMs: avancarTurno(s.turno, now, this.rodando(s)).ms,
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
    if (s.grav) this.gravar(p, s, now);
    if (s.rota) this.tickRota(p, s, now);
    if (p.hp <= 0) return;
    // No máximo uma cura por tick; o ataque vem depois (a recarga global de magia separa os dois quando os dois são magia).
    if (s.cura) this.curar(p, s, now);
    if (this.ataqueLigado(s)) this.atacar(p, s, now);
    // Depois do ataque: o alvo escolhido neste tick já segura a caminhada (não dá um passo da rota para o lado errado).
    if (this.rodando(s)) this.andar(p, s, now);
  }

  /** Gravando: guarda o passo (ou o teleporte) entre o tick anterior e este; ponto novo → estado para o painel. */
  private gravar(p: PlayerState, s: Estado, now: number): void {
    const g = s.grav!;
    if (p.x === s.gravPos.x && p.y === s.gravPos.y) return;
    const antes = g.pontos.length;
    s.grav = gravarPasso(g, s.gravPos, p);
    s.gravPos = { x: p.x, y: p.y };
    if (s.grav.pontos.length !== antes) this.enviarEstado(p, now);
  }

  private tickRota(p: PlayerState, s: Estado, now: number): void {
    const pz = this.o.monsters.inPz(p.x, p.y);
    const entrou = pz && !s.emPz;
    s.emPz = pz;
    if (entrou) { this.desligarRota(p, s, now); this.enviarEstado(p); return; }
    const pausa: EstagiarioPausa = this.o.npcOpen(p.id) ? "npc" : now < s.pausaAte ? "manual" : "";
    if (pausa !== s.pausa) {
      this.mudarPausa(p.id, s, pausa, now);
      // Na pausa o jogador andou à mão (ou foi ao NPC): ao voltar, segue do ponto mais perto de onde ele está.
      const rota = this.rotaDe(s, s.rota!);
      if (pausa === "" && rota) this.irPara(s, indiceMaisProximo(rota.pontos, p), now);
    }
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
      // Com a rota rodando, persegue já. Fora dela (só o ataque ligado, ou a rota pausada pelo jogador) o jogador está
      // jogando à mão: retomar cancelaria a pausa de 1,5 s que o Move/WalkTo acabou de pôr na perseguição.
      if (this.rodando(s)) this.o.fight.resume(p.id);
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

  /**
   * Um passo da rota (tick, rota rodando). Com alvo vivo não anda (a perseguição forçada aproxima); ao matar, retoma
   * pelo ponto mais próximo. Chegou ao ponto → o seguinte (circuito); ponto de portal: pisar nele teleporta para o
   * ponto seguinte, que conta como alcançado. Sem chegar mais perto por PONTO_TRAVADO_MS (inalcançável, ocupado, fora
   * do mapa) → pula. O passo é o da perseguição (FightModeSystem.stepToward): A* recalculado no máximo a cada
   * CAMINHO_MS ou quando o ponto muda, um `follow` por vez.
   */
  private andar(p: PlayerState, s: Estado, now: number): void {
    const rota = this.rotaDe(s, s.rota!);
    if (!rota) return;
    const pts = rota.pontos, n = pts.length;
    if (this.alvoVivo(p)) { s.lutando = true; s.caminho = null; return; }
    if (s.lutando) { s.lutando = false; this.irPara(s, indiceMaisProximo(pts, p), now); }
    if (s.indice < 0 || s.indice >= n) this.irPara(s, 0, now);
    const em = (q: PontoRota) => q.x === p.x && q.y === p.y;
    for (let k = 0; k < n; k++) { // pontos repetidos/portal: pode avançar mais de um no mesmo tick
      const a = pts[s.indice]!, prox = (s.indice + 1) % n;
      if (em(a) || (a.portal && em(pts[prox]!))) this.irPara(s, prox, now);
      else break;
    }
    const alvo = pts[s.indice]!;
    const d = cheb(p.x, p.y, alvo.x, alvo.y);
    if (d < s.melhorDist) { s.melhorDist = d; s.progressoEm = now; }
    else if (now - s.progressoEm >= PONTO_TRAVADO_MS) { this.irPara(s, (s.indice + 1) % n, now); return; }
    this.passo(p, s, alvo, now);
  }

  private passo(p: PlayerState, s: Estado, alvo: PontoRota, now: number): void {
    const mv = this.o.movement;
    if (!mv.isIdle(p, now)) return;
    if (s.caminhoAlvo !== s.indice || (now - s.caminhoEm >= CAMINHO_MS && !s.caminho?.length)) {
      s.caminho = mv.pathFor(p, { x: alvo.x, y: alvo.y });
      s.caminhoEm = now;
      s.caminhoAlvo = s.indice;
    }
    const next = s.caminho?.[0];
    if (!next) return;
    const dir = dirFromDelta(next.x - p.x, next.y - p.y);
    if (dir === null) { s.caminho = null; return; }
    const r = mv.follow(p, dir, now);
    if (r === "ok") s.caminho!.shift();
    else if (r !== "busy") s.caminho = null; // bloqueado: recalcula no próximo tick permitido
  }

  /** Vai para o ponto `i` do zero: caminho novo e o relógio de "ponto travado" recomeça. */
  private irPara(s: Estado, i: number, now: number): void {
    s.indice = i;
    s.caminho = null;
    s.caminhoAlvo = -1;
    s.melhorDist = Infinity;
    s.progressoEm = now;
  }

  /** Alvo atual vivo: monstro selvagem ou jogador (mirado à mão) ainda no mundo. */
  private alvoVivo(p: PlayerState): boolean {
    if (!p.targetId) return false;
    if (this.o.monsters.wild(p.targetId)) return true;
    const q = this.jogador(p.targetId);
    return !!q && q.hp > 0;
  }

  private salvarGravacao(p: PlayerState, s: Estado, g: Gravacao, nome: unknown): void {
    const pontos = fecharGravacao(g, p);
    if (pontos.length < 2) { this.notice(p, "Ande um pouco antes de salvar a rota."); return; }
    // O nome é limpo pela mesma sanitização da configuração (sem duplicar a regra).
    const nova = sanitizeEstagiario({ rotas: [{ nome, pontos }] }, p.vocation).rotas[0];
    if (!nova) { this.notice(p, "Dê um nome à rota."); return; }
    const chave = nova.nome.toLowerCase();
    const i = s.config.rotas.findIndex((r) => r.nome.toLowerCase() === chave);
    if (i < 0 && s.config.rotas.length >= ROTAS_MAX) { this.notice(p, `Já há ${ROTAS_MAX} rotas: apague uma antes.`); return; }
    const rotas = [...s.config.rotas];
    if (i < 0) rotas.push(nova); else rotas[i] = nova;
    s.config = { ...s.config, rotas };
    s.grav = null;
    // Substituiu a rota que está ligada (ligada durante a gravação): segue a versão nova pelo ponto mais próximo.
    if (s.rota && s.rota.toLowerCase() === chave) { s.rota = nova.nome; this.irPara(s, indiceMaisProximo(nova.pontos, p), this.now()); }
  }

  private ligarRota(p: PlayerState, s: Estado, nome: string): void {
    const rota = this.rotaDe(s, nome);
    if (!rota || p.hp <= 0) return;
    const now = this.now();
    if (this.o.monsters.inPz(p.x, p.y)) { this.notice(p, AVISO_PZ); return; }
    this.acertar(s, now);
    if (s.turno.ms <= 0) { this.notice(p, AVISO_TURNO); return; }
    const ja = !!s.rota;
    s.rota = rota.nome;
    this.irPara(s, indiceMaisProximo(rota.pontos, p), now);
    s.lutando = false;
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
