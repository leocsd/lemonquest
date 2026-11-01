// Estagiário (spec docs/superpowers/specs/2026-11-01-estagiario-design.md): o bot de caça do próprio jogo. O cérebro
// fica aqui no servidor (a aba do navegador adormece em segundo plano, justamente no caso AFK) e age pelas APIs dos
// sistemas que já existem: magias, poções, busca de alvo/perseguição, caminho (A*) e o acompanhante visível. As regras
// puras (sanitização, turno, escolha de cura/ataque, gravação de rota) estão em shared/estagiario.ts.
import {
  BUSCA_TILES, DIR_DELTA, Dir, PAUSA_MANUAL_MS, POCAO_ALARME_MIN, PONTO_TRAVADO_MS, ROTAS_MAX, S2C, TURNO_AVISO_MS, alarmeLigado, avancarTurno, dirFromDelta,
  escolherAtaque, escolherBuff, escolherCura, estagiarioPadrao, fecharGravacao, gravarPasso, indiceMaisProximo, isFamilyId,
  novaGravacao, pickFromFamily, resolveFamily, sanitizeEstagiario, spellDef,
  type AlarmeTipo, type ConditionId, type CuraAcao, type EstagiarioAlarmeMsg, type EstagiarioConfig, type EstagiarioConfigMsg,
  type EstagiarioEstadoMsg, type EstagiarioGravarMsg, type EstagiarioPausa, type EstagiarioToggleMsg, type Gravacao,
  type NoticeMsg, type PontoRota, type QuickPotionKind, type SpellGroup, type TurnoEstado,
} from "@lemonquest/shared";
import type { CharacterData } from "../persistence/types.ts";
import type { PlayerState } from "../state.ts";
import { cheb, type MonsterManager } from "./monsters.ts";
import type { MovementSystem } from "./movement.ts";
import { PATH_MAX_DIST, type Point } from "./pathfinding.ts";
import { waveTiles } from "./spells.ts";

/** Intervalo do estado periódico com a rota rodando (o cliente mostra o turno restante). */
export const ESTADO_PERIODICO_MS = 10_000;
/** Busca de alvo no máximo a cada 400 ms (= AUTO_SCAN_MS do ataque automático): varrer os monstros a cada tick pesa. */
const BUSCA_MS = 400;
const AVISO_TURNO = "O turno do Estagiário acabou por hoje.";
const AVISO_PZ = "Saia da zona de proteção para ligar a rota.";
/** Caminho até o ponto recalculado no máximo a cada 300 ms (= CHASE_REPATH_MS da perseguição): A* a cada tick pesa. */
const CAMINHO_MS = 300;
/** Monstro largado por não dar para chegar nele (água, cerca): a busca o ignora por este tempo e a rota segue. */
export const IGNORAR_ALVO_MS = 30_000;
/** Alarme "atacado" no máximo a cada 10 s (cada golpe do PvP chama o gancho) e "mochila" a cada 60 s (todo abate cheio). */
export const ATACADO_REARMA_MS = 10_000;
export const MOCHILA_REARMA_MS = 60_000;
/** Alarme "jogador por perto": o mesmo jogador só avisa de novo depois de ficar fora do alcance por este tempo. */
export const JOGADOR_REARMA_MS = 60_000;
/** Pontos travados seguidos (pulados sem chegar a nenhum) que desligam a rota: ela não tem como andar. */
export const PONTOS_TRAVADOS_MAX = 5;
/** Rota gravada que termina a mais que isto do começo: avisa que, no fim, ela volta andando ao primeiro ponto. */
export const ROTA_FIM_LONGE = 6;
/** Por quanto tempo o painel mostra "ponto travado"/"alvo inalcançável" depois de acontecer. */
const MOTIVO_MS = 5000;
/** Mudança de motivo/ponto manda o estado, no máximo uma vez por este intervalo. */
const MOTIVO_ENVIO_MS = 1000;
const AVISO_LONGE = "Você está longe demais da rota: chegue perto do caminho gravado.";
const AVISO_TRAVADA = `O Estagiário não consegue seguir a rota (${PONTOS_TRAVADOS_MAX} pontos travados seguidos): rota desligada.`;

export interface EstagiarioOptions {
  spells: { ready(p: PlayerState, id: string, now?: number): boolean; cast(p: PlayerState, id: string, targetId?: string, opts?: { silent?: boolean }): { ok: boolean } };
  /** Condições ativas (ConditionSystem): o buff só é reconjurado quando a condição dele acabou. */
  conditions: { has(targetId: string, id: ConditionId): boolean };
  potions: {
    potionReady(p: PlayerState, now?: number): boolean; usePotion(p: PlayerState, kind: QuickPotionKind, opts?: { silent?: boolean }): boolean;
    /** Só as poções que o level e a vocação deixam beber (o alarme de poção acabando). */
    countPotions(p: PlayerState, kind: QuickPotionKind): number;
    /** Há poção do tipo que dá para beber (a regra de poção só vale assim; senão a cura seguinte). */
    canDrink(p: PlayerState, kind: QuickPotionKind): boolean;
  };
  fight: {
    nearestTarget(p: PlayerState, reach: number, ignorar?: (id: string) => boolean): string;
    forceChase(id: string, on: boolean): void;
    resume(id: string): void;
  };
  monsters: Pick<MonsterManager, "wild" | "all" | "inPz" | "monsterAt" | "isMonsterAt" | "los" | "grid">;
  /** Caminhada da rota (Task 5). */
  movement: Pick<MovementSystem, "isIdle" | "pathFor" | "follow">;
  companions: { spawnCompanion(p: PlayerState, now?: number): unknown; despawnCompanion(ownerId: string): void; companionOf(ownerId: string): unknown };
  npcOpen: (id: string) => boolean;
  spellGroups: (p: PlayerState) => readonly SpellGroup[];
  players: () => Iterable<PlayerState>;
  send: (sessionId: string, type: string, msg: unknown) => void;
  /** Mesmo grupo (party): o alarme "jogador por perto" não toca para os colegas de caça. */
  sameParty?: (a: string, b: string) => boolean;
  /** Tile de portal de verdade (PortalSystem): só um salto a partir dele vira ponto de portal na gravação. */
  isPortalTile?: (x: number, y: number) => boolean;
  now?: () => number;
}

/** O que já avisou (para não repetir a cada tick) e o que re-arma o aviso; só vale com a rota rodando. */
interface Avisos {
  pocao: Set<QuickPotionKind>;
  vidaBaixa: boolean;
  /** Jogador já avisado → última vez visto no alcance (rearma depois de JOGADOR_REARMA_MS fora). */
  jogadores: Map<string, number>;
  turno: boolean;
  atacadoAte: number;
  mochilaAte: number;
}

const avisosNovos = (): Avisos => ({ pocao: new Set(), vidaBaixa: false, jogadores: new Map(), turno: false, atacadoAte: 0, mochilaAte: 0 });

interface Estado {
  config: EstagiarioConfig;
  /** Guardado só nas transições (rodando ↔ parado) e a cada tick com a rota rodando; parado, a recarga é calculada ao ler. */
  turno: TurnoEstado;
  cura: boolean;
  /** O ataque que o jogador escolheu; com a rota rodando o ataque fica ligado de qualquer jeito. */
  ataque: boolean;
  /** Os buffs que o jogador escolheu; com a rota rodando ficam ligados de qualquer jeito (como o ataque). */
  buffs: boolean;
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
  /** Pontos pulados por travados desde o último ponto alcançado (PONTOS_TRAVADOS_MAX → desliga a rota). */
  travados: number;
  /** Até quando o painel mostra "ponto travado" / "alvo inalcançável". */
  travadoAte: number;
  inalcancavelAte: number;
  /** Motivo e ponto do último estado enviado (mudou → manda de novo, no máximo a cada MOTIVO_ENVIO_MS). */
  motivoEnviado: string;
  /** Havia alvo vivo no tick anterior: ao matar, a rota retoma pelo ponto mais próximo. */
  lutando: boolean;
  /**
   * Alvo (monstro) acompanhado: menor distância, vida e o relógio de "luta sem progresso" (alvo travado → larga). O
   * relógio só recomeça quando um alvo perde vida, o alvo atual chega mais perto ou a luta começa: trocar de alvo não o
   * zera (dois inalcançáveis se alternando como o mais perto prendiam a rota para sempre). `alvoAnterior` é largado junto.
   */
  alvoId: string;
  alvoAnterior: string;
  alvoDist: number;
  alvoHp: number;
  alvoProgressoEm: number;
  /** Monstros largados → até quando a busca os ignora. */
  ignorados: Map<string, number>;
  /** Gravação em curso (e a posição do tick anterior, para ver o passo/teleporte). */
  grav: Gravacao | null;
  gravPos: Point;
  pausa: EstagiarioPausa;
  pausaAte: number;
  /** O jogador estava na PZ no tick anterior (desliga a rota só na entrada). */
  emPz: boolean;
  estadoEm: number;
  buscaEm: number;
  avisos: Avisos;
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
      config, turno: avancarTurno(saved?.turno, now, false), cura: false, ataque: false, buffs: false, rota: null, indice: 0,
      caminho: null, caminhoEm: 0, caminhoAlvo: -1, melhorDist: Infinity, progressoEm: now, travados: 0, travadoAte: 0,
      inalcancavelAte: 0, motivoEnviado: "", lutando: false,
      alvoId: "", alvoAnterior: "", alvoDist: Infinity, alvoHp: Infinity, alvoProgressoEm: now, ignorados: new Map(),
      grav: null, gravPos: { x: p.x, y: p.y },
      pausa: "", pausaAte: 0, emPz: false, estadoEm: 0, buscaEm: 0, avisos: avisosNovos(),
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
    const rotasAntes = JSON.stringify(s.config.rotas);
    s.config = sanitizeEstagiario(m.config, p.vocation, this.o.spellGroups(p));
    const rota = s.rota && this.rotaDe(s, s.rota);
    if (s.rota && !rota) this.pararRota(p, s);
    // Os pontos podem ter mudado: só então recomeça do ponto mais próximo (o Aplicar de uma regra de cura não pode
    // jogar fora o caminho e o progresso da rota rodando).
    else if (rota && JSON.stringify(s.config.rotas) !== rotasAntes) this.irPara(s, indiceMaisProximo(rota.pontos, p), this.now());
    this.enviarEstado(p);
  }

  onToggle(p: PlayerState, m: EstagiarioToggleMsg): void {
    const s = this.st.get(p.id);
    if (!s || !obj(m)) return;
    if (typeof m.cura === "boolean") s.cura = m.cura;
    if (typeof m.ataque === "boolean") s.ataque = m.ataque;
    if (typeof m.buffs === "boolean") s.buffs = m.buffs;
    if (m.rota === null) this.pararRota(p, s);
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
      // Recomeçar jogaria fora os pontos já andados (clique duplo no botão, por exemplo).
      else if (s.grav) this.notice(p, "Já está gravando.");
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
    // Antes de desligar: o alarme só vale se a rota estava ligada (sem ela o jogador não estava fora do teclado).
    if (s.rota) this.alarme(p, "morte", "Estagiário: você morreu. A rota foi desligada.");
    this.pararRota(p, s);
    this.enviarEstado(p);
  }

  /** Dano de jogador em jogador (PvP): avisa a vítima com a rota rodando, no máximo a cada ATACADO_REARMA_MS. */
  onAtacado(vitima: PlayerState, atacante: PlayerState): void {
    const s = this.st.get(vitima.id);
    if (!s || !this.rodando(s)) return;
    const now = this.now();
    if (now < s.avisos.atacadoAte) return;
    s.avisos.atacadoAte = now + ATACADO_REARMA_MS;
    this.alarme(vitima, "atacado", `Estagiário: ${atacante.name} está te atacando!`);
  }

  /** Sussurro recebido: um alarme por mensagem (o jogador quer ver cada uma). */
  onPrivada(para: PlayerState, de: PlayerState): void {
    const s = this.st.get(para.id);
    if (!s || !this.rodando(s)) return;
    this.alarme(para, "privada", `Estagiário: mensagem de ${de.name}.`);
  }

  /** Abate em que algo não coube na mochila: no máximo um alarme por MOCHILA_REARMA_MS. */
  onMochilaCheia(p: PlayerState): void {
    const s = this.st.get(p.id);
    if (!s || !this.rodando(s)) return;
    const now = this.now();
    if (now < s.avisos.mochilaAte) return;
    s.avisos.mochilaAte = now + MOCHILA_REARMA_MS;
    this.alarme(p, "mochila", "Estagiário: mochila cheia — o loot está ficando no chão.");
  }

  /**
   * Desliga só a rota (cura, ataque e buffs ficam), com aviso opcional e o estado. Usado pelo Coliseu ao entrar e ao sair da
   * partida: a saída tira o acompanhante (despawnOwner) e a rota dentro da arena caçaria as ondas sozinha.
   */
  desligarRota(p: PlayerState, aviso?: string): void {
    const s = this.st.get(p.id);
    if (!s?.rota) return;
    this.pararRota(p, s);
    if (aviso) this.notice(p, aviso);
    this.enviarEstado(p);
  }

  /** Caiu a conexão ou saiu: tudo desliga (sem ninguém no cliente o Estagiário não trabalha). Ao voltar, nada religa. */
  desligarTudo(p: PlayerState): void {
    const s = this.st.get(p.id);
    if (!s) return;
    s.cura = false;
    s.ataque = false;
    s.buffs = false;
    s.grav = null;
    this.pararRota(p, s);
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
      return {
        config: estagiarioPadrao(p.vocation), cura: false, ataque: false, buffs: false, rota: null, pausa: "", gravando: false, pontosGravados: 0,
        turnoMs: avancarTurno(undefined, now, false).ms, motivo: "", ponto: null,
      };
    }
    return {
      config: s.config, cura: s.cura, ataque: this.ataqueLigado(s), buffs: this.buffsLigados(s), rota: s.rota, pausa: s.pausa,
      gravando: !!s.grav, pontosGravados: s.grav?.pontos.length ?? 0, turnoMs: avancarTurno(s.turno, now, this.rodando(s)).ms,
      motivo: this.motivo(p, s, now), ponto: this.ponto(s),
    };
  }

  /** Por que o Estagiário não está agindo agora (curto, para o cabeçalho da janela); "" = tudo certo ou nada ligado. */
  private motivo(p: PlayerState, s: Estado, now: number): string {
    if (s.rota && s.pausa === "manual") return "pausado: você está jogando";
    if (s.rota && s.pausa === "npc") return "pausado: conversa com NPC";
    if (!this.ataqueLigado(s) || p.hp <= 0) return "";
    if (p.targetId && !this.o.monsters.wild(p.targetId) && this.ehJogador(p.targetId)) return "mirando um jogador";
    if (s.rota && now < s.travadoAte) return "ponto travado, pulando";
    if (now < s.inalcancavelAte) return "alvo inalcançável (ignorado 30 s)";
    if (!this.o.monsters.wild(p.targetId)) return "sem alvo por perto";
    const manaPct = p.maxMana > 0 ? (p.mana / p.maxMana) * 100 : 0;
    if (s.config.ataque.length && manaPct < s.config.reservaMana) return "reserva de mana";
    return "";
  }

  private ponto(s: Estado): { i: number; n: number } | null {
    const r = s.rota ? this.rotaDe(s, s.rota) : undefined;
    return r ? { i: Math.max(0, Math.min(s.indice, r.pontos.length - 1)), n: r.pontos.length } : null;
  }

  /**
   * O que o painel mostra e muda sozinho: o motivo (mudou → estado novo). O ponto atual não entra: muda a cada poucos
   * segundos e o estado leva a configuração inteira (rotas); ele vai no estado periódico.
   */
  private chaveMotivo(p: PlayerState, s: Estado, now: number): string {
    return this.motivo(p, s, now);
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
    if (p.hp > 0) this.agir(p, s, now);
    // O cabeçalho mostra o motivo e o ponto atual: mudou → estado (no máximo um por segundo; o resto vai no periódico).
    if ((s.rota || s.ataque) && now - s.estadoEm >= MOTIVO_ENVIO_MS && this.chaveMotivo(p, s, now) !== s.motivoEnviado) this.enviarEstado(p, now);
  }

  private agir(p: PlayerState, s: Estado, now: number): void {
    // No máximo uma cura por tick; o ataque vem depois (a recarga global de magia separa os dois quando os dois são magia).
    // Buff só num tick sem cura (uma ação por tick entre os dois: a cura tem prioridade e o buff espera o próximo).
    const curou = s.cura && this.curar(p, s, now);
    if (!curou && this.buffsLigados(s)) this.buffar(p, s, now);
    if (this.ataqueLigado(s)) this.atacar(p, s, now);
    // Depois do ataque: o alvo escolhido neste tick já segura a caminhada (não dá um passo da rota para o lado errado).
    if (this.rodando(s)) { this.vigiar(p, s, now); this.andar(p, s, now); }
  }

  /**
   * Alarmes de estado (poção, vida, jogador perto, turno), checados a cada tick com a rota rodando. Cada um avisa uma
   * vez ao cruzar o limite e só avisa de novo depois de voltar para o lado seguro (histerese), senão tocaria a 20 Hz.
   */
  private vigiar(p: PlayerState, s: Estado, now: number): void {
    const a = s.avisos;
    for (const r of s.config.cura) {
      if (!("pocao" in r.acao)) continue;
      const kind = r.acao.pocao;
      const n = this.o.potions.countPotions(p, kind);
      if (n >= POCAO_ALARME_MIN) a.pocao.delete(kind);
      else if (!a.pocao.has(kind)) {
        a.pocao.add(kind);
        this.alarme(p, "pocao", `Estagiário: poções acabando (${n} de ${kind === "hp" ? "vida" : "mana"}).`);
      }
    }
    const pct = p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 100;
    if (pct >= s.config.vidaAlarme + 10) a.vidaBaixa = false;
    else if (pct < s.config.vidaAlarme && !a.vidaBaixa) {
      a.vidaBaixa = true;
      this.alarme(p, "vidaBaixa", `Estagiário: vida baixa (${Math.round(pct)}%).`);
    }
    // Colega de grupo não é ameaça; quem anda na borda do alcance (entra e sai) só avisa de novo depois de ficar
    // JOGADOR_REARMA_MS fora, senão o mesmo jogador tocaria a cada passo.
    for (const q of this.o.players()) {
      if (q.id === p.id || q.hp <= 0 || cheb(p.x, p.y, q.x, q.y) > BUSCA_TILES || this.o.sameParty?.(p.id, q.id)) continue;
      if (!a.jogadores.has(q.id)) this.alarme(p, "jogador", `Estagiário: ${q.name} está por perto.`);
      a.jogadores.set(q.id, now);
    }
    for (const [id, visto] of a.jogadores) if (now - visto >= JOGADOR_REARMA_MS) a.jogadores.delete(id);
    if (s.turno.ms > TURNO_AVISO_MS) a.turno = false;
    else if (!a.turno) { a.turno = true; this.alarme(p, "turno", "Estagiário: faltam 5 min de turno."); }
  }

  /** Gravando: guarda o passo (ou o teleporte) entre o tick anterior e este; ponto novo → estado para o painel. */
  private gravar(p: PlayerState, s: Estado, now: number): void {
    const g = s.grav!;
    if (p.x === s.gravPos.x && p.y === s.gravPos.y) return;
    const antes = g.pontos.length;
    const salto = cheb(p.x, p.y, s.gravPos.x, s.gravPos.y) > 1;
    s.grav = gravarPasso(g, s.gravPos, p, salto ? this.portalDoSalto(p, s.gravPos) : undefined);
    s.gravPos = { x: p.x, y: p.y };
    if (s.grav.pontos.length !== antes) this.enviarEstado(p, now);
  }

  /**
   * Tile do portal de um salto na gravação, ou null se não foi portal (Investida, /tp, viagem de NPC, templo). O portal
   * leva no mesmo tick em que o passo chega nele: o tick vê o tile de antes (`de`) e o destino. O portal é o tile para
   * onde o jogador olhava (a direção do último passo), senão o próprio `de` ou um vizinho dele.
   */
  private portalDoSalto(p: PlayerState, de: Point): Point | null {
    const eh = this.o.isPortalTile;
    if (!eh) return de; // sem o mapa de portais (testes antigos): todo salto é portal, como antes
    const d = DIR_DELTA[p.dir as Dir] as { dx: number; dy: number } | undefined;
    if (d && eh(de.x + d.dx, de.y + d.dy)) return { x: de.x + d.dx, y: de.y + d.dy };
    if (eh(de.x, de.y)) return { x: de.x, y: de.y };
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (eh(de.x + dx, de.y + dy)) return { x: de.x + dx, y: de.y + dy };
    return null;
  }

  private tickRota(p: PlayerState, s: Estado, now: number): void {
    const pz = this.o.monsters.inPz(p.x, p.y);
    const entrou = pz && !s.emPz;
    s.emPz = pz;
    if (entrou) { this.pararRota(p, s, now); this.enviarEstado(p); return; }
    // O acompanhante saiu do mundo com a rota ligada (o Coliseu tira tudo do dono, por exemplo): volta ao lado do dono.
    if (p.hp > 0 && !pz && !this.o.companions.companionOf(p.id)) this.o.companions.spawnCompanion(p, now);
    const pausa: EstagiarioPausa = this.o.npcOpen(p.id) ? "npc" : now < s.pausaAte ? "manual" : "";
    if (pausa !== s.pausa) {
      this.mudarPausa(p.id, s, pausa, now);
      // Na pausa o jogador andou à mão (ou foi ao NPC): ao voltar, segue do ponto mais perto de onde ele está.
      const rota = this.rotaDe(s, s.rota!);
      if (pausa === "" && rota) this.irPara(s, indiceMaisProximo(rota.pontos, p), now);
      // O alvo não foi acompanhado durante a pausa: sem isto, o relógio parado o daria por travado no primeiro tick.
      if (pausa === "") { s.alvoId = ""; s.alvoAnterior = ""; s.alvoProgressoEm = now; }
    }
    if (!this.rodando(s)) return;
    this.acertar(s, now);
    if (s.turno.ms <= 0) {
      this.pararRota(p, s, now);
      this.notice(p, AVISO_TURNO);
      this.enviarEstado(p);
      return;
    }
    if (now - s.estadoEm >= ESTADO_PERIODICO_MS) this.enviarEstado(p, now);
  }

  /**
   * Uma ação de cura (magia ou poção) se alguma regra vale; devolve se agiu. A poção só conta se dá para beber (level e
   * vocação: com só a Grande lv 30 na mochila a regra de poção ganhava todo tick, falhava em silêncio e a magia da
   * regra seguinte nunca saía). Ação que falha mesmo assim (magia recusada, poção recusada) tenta a regra seguinte.
   */
  private curar(p: PlayerState, s: Estado, now: number): boolean {
    const falhou = new Set<CuraAcao>();
    const pronto = (a: CuraAcao) => !falhou.has(a) && ("magia" in a
      ? this.o.spells.ready(p, a.magia, now)
      : this.o.potions.potionReady(p, now) && this.o.potions.canDrink(p, a.pocao));
    for (let k = 0; k < s.config.cura.length; k++) {
      const acao = escolherCura(p, s.config.cura, pronto);
      if (!acao) return false;
      const ok = "magia" in acao
        ? this.o.spells.cast(p, acao.magia, undefined, { silent: true }).ok
        : this.o.potions.usePotion(p, acao.pocao, { silent: true });
      if (ok) return true;
      falhou.add(acao);
    }
    return false;
  }

  /** Reconjura o primeiro buff da lista que acabou (regras em escolherBuff); no máximo um por tick. */
  private buffar(p: PlayerState, s: Estado, now: number): void {
    if (!s.config.buffs.length) return;
    const manaPct = p.maxMana > 0 ? (p.mana / p.maxMana) * 100 : 0;
    const comAlvo = !!this.o.monsters.wild(p.targetId);
    const magia = escolherBuff(
      s.config.buffs, (c) => this.o.conditions.has(p.id, c as ConditionId), comAlvo, manaPct, s.config.reservaMana,
      (id) => this.o.spells.ready(p, id, now),
    );
    if (magia) this.o.spells.cast(p, magia, undefined, { silent: true });
  }

  private atacar(p: PlayerState, s: Estado, now: number): void {
    const mm = this.o.monsters;
    // Alvo jogador (mirado à mão): o Estagiário nunca troca nem ataca jogador; a rotação fica parada.
    if (p.targetId && !mm.wild(p.targetId) && this.ehJogador(p.targetId)) return;
    // Sempre o bicho mais perto (2026-11-01, dono): procura também com alvo vivo e troca se achar um estritamente mais
    // perto (empate fica no atual, para não pular de um para outro). Com a rota pausada à mão, só se o próprio jogador
    // ligou o Ataque: ligado só pela rota, o jogador está no controle e o bot não escolhe alvo por ele.
    if (now - s.buscaEm >= BUSCA_MS && (s.ataque || this.rodando(s))) {
      s.buscaEm = now;
      const id = this.o.fight.nearestTarget(p, BUSCA_TILES, (m) => this.ignoradoEm(s, m, now));
      const cur = mm.wild(p.targetId), nxt = id ? mm.wild(id) : undefined;
      if (id && id !== p.targetId && (!cur || (nxt && cheb(p.x, p.y, nxt.s.x, nxt.s.y) < cheb(p.x, p.y, cur.s.x, cur.s.y)))) {
        p.targetId = id;
        // Com a rota rodando, persegue já. Fora dela (só o ataque ligado, ou a rota pausada pelo jogador) o jogador está
        // jogando à mão: retomar cancelaria a pausa de 1,5 s que o Move/WalkTo acabou de pôr na perseguição.
        if (this.rodando(s)) this.o.fight.resume(p.id);
      }
    }
    if (!mm.wild(p.targetId)) return;
    if (!s.config.ataque.length) return;
    const manaPct = p.maxMana > 0 ? (p.mana / p.maxMana) * 100 : 0;
    if (manaPct < s.config.reservaMana) return;
    // Magia resolvida uma vez por tick (os grupos do jogador também: lê o save), e os bichos contados uma vez por
    // magia e raio, só se alguma regra tem magia pronta. O resultado é o mesmo de escolherAtaque sem o cache.
    let grupos: readonly SpellGroup[] | null = null;
    const resolvidas = new Map<string, string | null>();
    const resolver = (id: string): string | null => {
      let r = resolvidas.get(id);
      if (r !== undefined) return r;
      if (!isFamilyId(id)) r = this.o.spells.ready(p, id, now) ? id : null;
      else {
        const f = resolveFamily(id, (grupos ??= this.o.spellGroups(p)), p.vocation);
        r = f ? pickFromFamily(f, p.level, (sp) => this.o.spells.ready(p, sp.id, now))?.id ?? null : null;
      }
      resolvidas.set(id, r);
      return r;
    };
    if (!s.config.ataque.some((r) => resolver(r.magia))) return;
    const alvo = mm.wild(p.targetId)!;
    const contagem = new Map<string, number>();
    const bichosEm = (raio: number, magia: string) => {
      const sp = spellDef(magia);
      const chave = `${magia}|${raio}`;
      let n = contagem.get(chave);
      if (n !== undefined) return n;
      n = this.contarBichos(p, alvo.s, sp, raio);
      contagem.set(chave, n);
      return n;
    };
    const magia = escolherAtaque(s.config.ataque, bichosEm, manaPct, s.config.reservaMana, resolver);
    if (!magia) return;
    // A onda sai para onde o jogador olha (o último passo): vira para o alvo antes, senão ela varre o lado errado.
    if (spellDef(magia)?.target === "wave") {
      const f = dirFromDelta(Math.sign(alvo.s.x - p.x), Math.sign(alvo.s.y - p.y));
      if (f !== null) p.dir = f;
    }
    this.o.spells.cast(p, magia, p.targetId, { silent: true });
  }

  /**
   * Bichos que a magia pegaria: a onda, nos tiles dela virada para o alvo; a área no alvo, em volta do alvo; o resto, em
   * volta do jogador (`raio` da regra). Só selvagens vivos fora da PZ e sem bonecos de treino, pelos tiles (sem varrer
   * todos os monstros). Magia de alvo único: o alvo vivo basta ("1 bicho" vale mesmo com ele longe).
   */
  private contarBichos(p: PlayerState, alvo: Point, sp: ReturnType<typeof spellDef>, raio: number): number {
    const mm = this.o.monsters;
    const conta = (x: number, y: number): number => {
      const m = mm.monsterAt(x, y);
      return m && !m.s.ownerId && m.s.hp > 0 && !m.def.invulnerable && !mm.inPz(x, y) ? 1 : 0;
    };
    let n = 0;
    if (sp?.target === "wave") {
      const dir = dirFromDelta(Math.sign(alvo.x - p.x), Math.sign(alvo.y - p.y)) ?? p.dir;
      const parede = (x: number, y: number) => !mm.grid.isWalkable(x, y) || !mm.los(p.x, p.y, x, y);
      for (const t of waveTiles(p.x, p.y, dir, sp.length ?? 3, sp.width ?? 1, parede, sp.rect)) n += conta(t.x, t.y);
      return n;
    }
    const c = sp?.target === "area_target" ? alvo : p;
    for (let y = c.y - raio; y <= c.y + raio; y++) for (let x = c.x - raio; x <= c.x + raio; x++) n += conta(x, y);
    return sp?.target === "target" ? Math.max(n, 1) : n;
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
    if (this.alvoVivo(p) && !this.alvoTravado(p, s, now)) { s.lutando = true; s.caminho = null; return; }
    // Sem luta: o relógio de "luta sem progresso" começa do zero na próxima (o alvo anterior não conta mais).
    if (!this.alvoVivo(p)) { s.alvoId = ""; s.alvoAnterior = ""; s.alvoProgressoEm = now; }
    if (s.lutando) { s.lutando = false; this.irPara(s, indiceMaisProximo(pts, p), now); }
    if (s.indice < 0 || s.indice >= n) this.irPara(s, 0, now);
    // Ponto com alguém parado em cima (monstro, outro jogador): ao lado já conta, senão cada volta perdia
    // PONTO_TRAVADO_MS ali. O de portal precisa ser pisado (é ele que leva ao outro lado).
    const em = (q: PontoRota) => (q.x === p.x && q.y === p.y) || (!q.portal && cheb(p.x, p.y, q.x, q.y) <= 1 && this.ocupado(p, q));
    for (let k = 0; k < n; k++) { // pontos repetidos/portal: pode avançar mais de um no mesmo tick
      const a = pts[s.indice]!, prox = (s.indice + 1) % n;
      if (em(a) || (a.portal && em(pts[prox]!))) { s.travados = 0; this.irPara(s, prox, now); }
      else break;
    }
    const alvo = pts[s.indice]!;
    const d = cheb(p.x, p.y, alvo.x, alvo.y);
    if (d < s.melhorDist) { s.melhorDist = d; s.progressoEm = now; }
    else if (now - s.progressoEm >= PONTO_TRAVADO_MS) {
      // Muitos pontos travados seguidos: a rota não tem como andar daqui (parede nova, rota de outro lugar) e só
      // gastaria o turno parada.
      if (++s.travados >= PONTOS_TRAVADOS_MAX) { this.pararRota(p, s, now); this.notice(p, AVISO_TRAVADA); this.enviarEstado(p, now); return; }
      s.travadoAte = now + MOTIVO_MS;
      this.irPara(s, this.depoisDoTravado(pts, s.indice), now);
      return;
    }
    this.passo(p, s, alvo, now);
  }

  /** Há outra criatura (monstro, inclusive o acompanhante, ou outro jogador) parada no tile do ponto. */
  private ocupado(p: PlayerState, q: Point): boolean {
    if (this.o.monsters.isMonsterAt(q.x, q.y)) return true;
    for (const o of this.o.players()) if (o.id !== p.id && o.hp > 0 && o.x === q.x && o.y === q.y) return true;
    return false;
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

  /**
   * Próximo ponto depois de um ponto travado. Portal travado (porta com requisito, por exemplo): os pontos seguintes
   * são do outro lado e também não dá para chegar; pula até depois do próximo portal da rota (a volta), ou, sem outro
   * portal, para o primeiro ponto (circuito), em vez de esperar PONTO_TRAVADO_MS em cada ponto do outro lado.
   */
  private depoisDoTravado(pts: readonly PontoRota[], i: number): number {
    const n = pts.length;
    if (!pts[i]!.portal) return (i + 1) % n;
    for (let k = 1; k < n; k++) if (pts[(i + k) % n]!.portal) return (i + k + 1) % n;
    return i === 0 ? 1 % n : 0;
  }

  /**
   * Monstro alvo que não se aproxima nem perde vida por PONTO_TRAVADO_MS (à vista mas inalcançável: do outro lado da
   * água ou de uma cerca): larga o alvo e ignora o monstro por IGNORAR_ALVO_MS, para a rota não gastar o turno parada.
   * Vida caindo conta como progresso (quem ataca à distância acerta sem chegar perto).
   */
  private alvoTravado(p: PlayerState, s: Estado, now: number): boolean {
    const m = this.o.monsters.wild(p.targetId);
    if (!m) return false; // alvo jogador (mirado à mão): o jogador é que decide
    const d = cheb(p.x, p.y, m.s.x, m.s.y);
    if (s.alvoId !== m.s.id) {
      // Trocar de alvo não zera o relógio: dois inalcançáveis se alternando como o mais perto o zerariam para sempre.
      // O alvo de antes perdeu vida desde a última conta? Isso é progresso.
      const antes = s.alvoId ? this.o.monsters.wild(s.alvoId) : undefined;
      if (antes && antes.s.hp < s.alvoHp) s.alvoProgressoEm = now;
      if (s.alvoId) s.alvoAnterior = s.alvoId;
      s.alvoId = m.s.id; s.alvoDist = d; s.alvoHp = m.s.hp;
      return false;
    }
    if (d < s.alvoDist || m.s.hp < s.alvoHp) { s.alvoDist = Math.min(d, s.alvoDist); s.alvoHp = Math.min(m.s.hp, s.alvoHp); s.alvoProgressoEm = now; return false; }
    if (now - s.alvoProgressoEm < PONTO_TRAVADO_MS) return false;
    // Larga o atual e o anterior (o par que se alternava); a busca os ignora por IGNORAR_ALVO_MS.
    s.ignorados.set(m.s.id, now + IGNORAR_ALVO_MS);
    if (s.alvoAnterior && s.alvoAnterior !== m.s.id) s.ignorados.set(s.alvoAnterior, now + IGNORAR_ALVO_MS);
    s.alvoId = "";
    s.alvoAnterior = "";
    s.alvoProgressoEm = now;
    s.inalcancavelAte = now + MOTIVO_MS;
    p.targetId = "";
    return true;
  }

  /** O Estagiário do jogador largou este monstro (inalcançável) há pouco: o ataque automático (F8) também o ignora. */
  ignorado(playerId: string, monsterId: string): boolean {
    const s = this.st.get(playerId);
    return !!s && this.ignoradoEm(s, monsterId, this.now());
  }

  private ignoradoEm(s: Estado, id: string, now: number): boolean {
    const ate = s.ignorados.get(id);
    if (ate === undefined) return false;
    if (now < ate) return true;
    s.ignorados.delete(id);
    return false;
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
    const ini = pontos[0]!, fim = pontos[pontos.length - 1]!;
    const longe = cheb(ini.x, ini.y, fim.x, fim.y);
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
    // Rota de ida só (terminou longe do começo): ela é um circuito, então no fim volta andando ao primeiro ponto.
    if (longe > ROTA_FIM_LONGE) this.notice(p, `A rota termina a ${longe} tiles do começo: no fim, o Estagiário volta andando até o primeiro ponto.`);
    // Substituiu a rota que está ligada (ligada durante a gravação): segue a versão nova pelo ponto mais próximo.
    if (s.rota && s.rota.toLowerCase() === chave) { s.rota = nova.nome; this.irPara(s, indiceMaisProximo(nova.pontos, p), this.now()); }
  }

  private ligarRota(p: PlayerState, s: Estado, nome: string): void {
    const rota = this.rotaDe(s, nome);
    if (!rota || p.hp <= 0) return;
    // A caminhada da rota seria gravada como se fosse do jogador.
    if (s.grav) { this.notice(p, "Pare a gravação antes de ligar a rota."); return; }
    const now = this.now();
    if (this.o.monsters.inPz(p.x, p.y)) { this.notice(p, AVISO_PZ); return; }
    // Longe de todos os pontos o A* (até PATH_MAX_DIST) nem acha caminho: a rota gastaria o turno parada pulando pontos.
    const i0 = indiceMaisProximo(rota.pontos, p), p0 = rota.pontos[i0]!;
    if (cheb(p.x, p.y, p0.x, p0.y) > PATH_MAX_DIST) { this.notice(p, AVISO_LONGE); return; }
    this.acertar(s, now);
    if (s.turno.ms <= 0) { this.notice(p, AVISO_TURNO); return; }
    const ja = !!s.rota;
    // Trocou de rota durante a pausa: a pausa acaba aqui, então a perseguição forçada volta.
    if (ja && s.pausa !== "") this.o.fight.forceChase(p.id, true);
    s.rota = rota.nome;
    this.irPara(s, i0, now);
    s.travados = 0;
    s.travadoAte = 0;
    s.lutando = false;
    s.pausa = "";
    s.pausaAte = 0;
    s.emPz = false;
    s.estadoEm = now;
    if (ja) return; // trocou de rota: o resto já está ligado
    s.avisos = avisosNovos(); // rota nova: o que já estava no limite avisa de novo
    p.bot = true;
    this.o.fight.forceChase(p.id, true);
    this.o.companions.spawnCompanion(p, now);
  }

  private pararRota(p: PlayerState, s: Estado, now = this.now()): void {
    if (!s.rota) return;
    this.acertar(s, now); // fecha a conta do turno no estado em que estava (rodando ou pausada)
    s.rota = null;
    s.ignorados.clear();
    s.alvoId = "";
    s.alvoAnterior = "";
    s.inalcancavelAte = 0;
    s.pausa = "";
    s.pausaAte = 0;
    p.bot = false;
    this.o.fight.forceChase(p.id, false);
    this.o.companions.despawnCompanion(p.id);
  }

  private mudarPausa(id: string, s: Estado, pausa: EstagiarioPausa, now: number): void {
    this.acertar(s, now);
    // Na pausa o jogador está no controle: a perseguição forçada o arrastaria de volta ao alvo durante os 10 s.
    if ((s.pausa === "") !== (pausa === "")) this.o.fight.forceChase(id, pausa === "");
    s.pausa = pausa;
    const p = this.jogador(id);
    if (p) this.enviarEstado(p, now);
  }

  // --- auxiliares ---------------------------------------------------------------------------------------------------

  private rodando(s: Estado): boolean { return !!s.rota && s.pausa === ""; }

  private ataqueLigado(s: Estado): boolean { return s.ataque || !!s.rota; }

  private buffsLigados(s: Estado): boolean { return s.buffs || !!s.rota; }

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
    const e = this.estado(p);
    if (s) { s.estadoEm = now; s.motivoEnviado = e.motivo; }
    this.o.send(p.id, S2C.EstagiarioEstado, e);
  }

  private notice(p: PlayerState, text: string): void {
    this.o.send(p.id, S2C.Notice, { text, kind: "warn" } satisfies NoticeMsg);
  }
}
