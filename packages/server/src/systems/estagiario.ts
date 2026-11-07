// Estagiário (spec docs/superpowers/specs/2026-11-01-estagiario-design.md; v2 em
// docs/superpowers/specs/2026-11-02-estagiario-v2-estrategia.md; v3 em
// docs/superpowers/specs/2026-11-02-estagiario-v3-abordagem.md): o bot de caça do próprio jogo. O cérebro fica aqui no
// servidor (a aba do navegador adormece em segundo plano, justamente no caso AFK) e age pelas APIs dos sistemas que já
// existem: magias, poções, comida, busca de alvo/perseguição, caminho (A*) e o acompanhante visível. As regras puras
// (sanitização, turno, escolha de cura/ataque/buff/recuo, gravação de rota) estão em shared/estagiario.ts.
import {
  BUSCA_TILES, COMER_ANTES_MS, DEFAULT_SPELL_RANGE, DIARIO_MAX, DIR_DELTA, Dir, ESPERAR_MAX_MS, ESPERAR_PERTO_TILES, ESPERAR_TILES, PAUSA_MANUAL_MS,
  POCAO_ALARME_MIN, PONTO_TRAVADO_MS, ROTAS_MAX, S2C, SEGUIR_MAX_TILES, SEGUIR_SUMIU_MS,
  TURNO_AVISO_MS, alarmeLigado, avancarTurno, compactar, configEfetiva, curaEmGrupo, curaEstimada, curasProprias, decidirCura, dirFromDelta,
  ehInvocacao, escolherAtaque, escolherBuff, escolherCura, escolherRecuo, estagiarioPadrao, RECUO_MAX_TILES, STAMINA_BAIXA_MS, staminaXpMult,
  fecharGravacao, gravarPasso, indiceMaisProximo, indiceRetomada, isFamilyId, needsTarget, novaGravacao, pickFromFamily, pisoDeMana,
  resolveFamily, sanitizeEstagiario, sanitizeLigado, spellDef,
  type AlarmeTipo, type ConditionId, type CuraAcao, type DiarioCanal, type DiarioItem, type EstagiarioAlarmeMsg, type EstagiarioConfig,
  type EstagiarioConfigMsg, type EstagiarioDiarioMsg, type EstagiarioEstadoMsg, type EstagiarioGravarMsg, type EstagiarioLigado,
  type EstagiarioPausa, type EstagiarioToggleMsg, type Gravacao, type NoticeMsg, type PontoRota, type QuickPotionKind, type RegraCura,
  type SituacaoCura, type SpellDef, type SpellGroup, type TurnoEstado,
} from "@lemonquest/shared";
import type { CharacterData } from "../persistence/types.ts";
import type { PlayerState } from "../state.ts";
import { cheb, type MonsterManager } from "./monsters.ts";
import type { MovementSystem } from "./movement.ts";
import { PATH_MAX_DIST, type Point } from "./pathfinding.ts";
import { waveTiles } from "./spells.ts";

/** Intervalo do estado periódico com a rota rodando (o cliente mostra o turno restante). */
export const ESTADO_PERIODICO_MS = 10_000;
/** Com alvo, procura um mais perto no máximo a cada 400 ms (= AUTO_SCAN_MS do ataque automático): varrer os monstros a cada tick pesa. */
const BUSCA_MS = 400;
/** Sem alvo, a cada 100 ms: o bicho que entra no alcance é visto em até 0,1 s (era até 0,4 s de espera parado). */
const BUSCA_SEM_ALVO_MS = 100;
const AVISO_TURNO = "A stamina do Estagiário acabou. Ela recarrega com ele parado ou com você offline.";
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
/** Por quanto tempo o painel mostra "ponto travado"/"alvo inalcançável"/"mantendo distância" depois de acontecer. */
const MOTIVO_MS = 5000;
/** Mudança de motivo/ponto manda o estado, no máximo uma vez por este intervalo. */
const MOTIVO_ENVIO_MS = 1000;
/** Tenta comer no máximo a cada 2 s (a comida tem recarga própria de 1 s; sem comida na mochila não vale varrer a cada tick). */
export const COMER_INTERVALO_MS = 2000;
/** v3: ao entrar (ou reconectar) com algo ligado, espera isto antes de agir — o cliente ainda está carregando o mundo. */
export const CARENCIA_LOGIN_MS = 3000;
/** Diário: "esperando" (uma regra vale e nada está pronto) no máximo a cada 2 s; "a Cura está desligada" a cada 10 s. */
export const DIARIO_ESPERA_MS = 2000;
export const DIARIO_CURA_OFF_MS = 10_000;
const AVISO_LONGE = "Você está longe demais da rota: chegue perto do caminho gravado.";
const AVISO_TRAVADA = `O Estagiário não consegue seguir a rota (${PONTOS_TRAVADOS_MAX} pontos travados seguidos): rota desligada.`;

export interface EstagiarioOptions {
  spells: { ready(p: PlayerState, id: string, now?: number): boolean; cast(p: PlayerState, id: string, targetId?: string, opts?: { silent?: boolean }): { ok: boolean } };
  /** Condições ativas (ConditionSystem): o buff só é reconjurado quando a condição dele acabou. */
  conditions: { has(targetId: string, id: ConditionId): boolean };
  potions: {
    potionReady(p: PlayerState, now?: number): boolean;
    /** `cobrir`: a menor poção que recupera isso (v2), em vez da maior. */
    usePotion(p: PlayerState, kind: QuickPotionKind, opts?: { silent?: boolean; cobrir?: number }): boolean;
    /** Só as poções que o level e a vocação deixam beber (o alarme de poção acabando). */
    countPotions(p: PlayerState, kind: QuickPotionKind): number;
    /** v3: quanto recupera a poção que `usePotion({ cobrir: falta })` beberia (0 = nenhuma bebível). Ausente = 0 se não dá para beber, senão `falta`. */
    potionAmount?(p: PlayerState, kind: QuickPotionKind, falta: number): number;
    /** Há poção do tipo que dá para beber (a regra de poção só vale assim; senão a cura seguinte). */
    canDrink(p: PlayerState, kind: QuickPotionKind): boolean;
  };
  fight: {
    nearestTarget(p: PlayerState, reach: number, ignorar?: (id: string) => boolean): string;
    /** `parar`: a perseguição forçada para a esta distância do alvo (1 = colado; v2 "manter distância"). */
    forceChase(id: string, on: boolean, parar?: number): void;
    resume(id: string): void;
    /** v3 (caçar com amigo): anda atrás do colega sem alvo; com alvo, a perseguição forçada manda (cancelFollow). */
    follow(p: PlayerState, id: string): void;
    cancelFollow(p: PlayerState): void;
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
  /** Em combate (deu/levou dano há pouco; CombatSystem.inCombat): os buffs "em combate"/"fora". Ausente = tem alvo monstro. */
  inCombat?: (id: string, now: number) => boolean;
  /** Invocações vivas do jogador (SummonSystem.ownedBy): a regra de invocação espera elas sumirem. Ausente = 0. */
  invocacoes?: (id: string) => number;
  /** Quanto falta do "alimentado" (FoodSystem.remainingMs): come quando está acabando. Ausente = não come. */
  alimentadoMs?: (id: string, now: number) => number;
  /** Come a primeira comida da mochila (InventorySystem.eatAny). */
  comer?: (p: PlayerState) => boolean;
  /** Colegas de grupo (sem o próprio): as regras de cura "aliado". Ausente = nenhum. */
  aliados?: (p: PlayerState) => Iterable<PlayerState>;
  /** Alcance do ataque básico (arma/vocação): "manter distância" só vale acima de 1. Ausente = 1 (colado). */
  attackRange?: (p: PlayerState) => number;
  now?: () => number;
}

/** O que já avisou (para não repetir a cada tick) e o que re-arma o aviso; só vale com a rota rodando. */
interface Avisos {
  pocao: Set<QuickPotionKind>;
  vidaBaixa: boolean;
  /** Jogador já avisado → última vez visto no alcance (rearma depois de JOGADOR_REARMA_MS fora). */
  jogadores: Map<string, number>;
  turno: boolean;
  /** Já avisou que a stamina ficou baixa (o XP começou a cair). */
  staminaBaixa: boolean;
  atacadoAte: number;
  mochilaAte: number;
}

const avisosNovos = (): Avisos => ({ pocao: new Set(), vidaBaixa: false, jogadores: new Map(), turno: false, staminaBaixa: false, atacadoAte: 0, mochilaAte: 0 });

interface Estado {
  /** O que o jogador configurou (vai no save e no estado ao cliente). */
  config: EstagiarioConfig;
  /** v3: o que o tick usa (`configEfetiva`): no modo simples, o recomendado da vocação com a reserva do perfil. */
  efetiva: EstagiarioConfig;
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
  /** Até quando o painel mostra "ponto travado" / "alvo inalcançável" / "mantendo distância" / "alvo fora do alcance" / "guardando mana". */
  travadoAte: number;
  inalcancavelAte: number;
  recuandoAte: number;
  foraAlcanceAte: number;
  semManaBuffAte: number;
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
  /** Última tentativa de comer (COMER_INTERVALO_MS). */
  comeuEm: number;
  /** Alvo novo fora da rota: retomar a perseguição assim que o jogador ficar parado (sem tecla, clique nem passo). */
  retomar: boolean;
  /** Distância de parada mandada à perseguição forçada (reenvia só quando muda). */
  pararEnviado: number;
  avisos: Avisos;
  /** v3: caiu/fechou o cliente: nada age até reconectar (cura, ataque e buffs ficam como estavam, para o save). */
  suspenso: boolean;
  /** v3: até quando não age depois de entrar/reconectar com algo ligado (CARENCIA_LOGIN_MS); ligar algo à mão zera. */
  carenciaAte: number;
  /** v3: o diário (as últimas DIARIO_MAX linhas), as ainda não enviadas (vão numa mensagem no fim do tick) e se vai inteiro. */
  diario: DiarioItem[];
  diarioNovos: DiarioItem[];
  diarioTudo: boolean;
  /** Última linha "esperando" e última "a Cura está desligada" (DIARIO_ESPERA_MS / DIARIO_CURA_OFF_MS). */
  esperaAnotadaEm: number;
  curaOffAnotadaEm: number;
  /** v3 (caçar com amigo): id e nome do colega de grupo seguido (exclui a rota: um ou outro). */
  seguindo: string | null;
  seguindoNome: string;
  /** Desde quando o colega está a mais de SEGUIR_MAX_TILES (0 = perto); SEGUIR_SUMIU_MS → alarme "colega" (uma vez). */
  colegaLongeDesde: number;
  /**
   * Onde o colega foi visto por último a até SEGUIR_MAX_TILES — ou o portal que ele pegou (o salto saiu de perto). Perdido,
   * o seguidor vai até lá (pisar no portal o leva junto) e retoma o follow quando o reencontra.
   */
  colegaVisto: Point | null;
  /** Posição do colega no tick anterior (para ver o salto de portal) e se o alarme desta perda já tocou. */
  colegaPos: Point;
  colegaAlarmado: boolean;
  /**
   * Portal que o colega pegou e o seguidor ainda não atravessou (null = nenhum). Enquanto houver, o seguidor vai ao
   * portal mesmo com o colega "perto" em linha reta: a saída pode ficar a poucos tiles, atrás de parede, e o follow
   * direto travaria nela. Some quando o seguidor salta (atravessou) ou pisa nele sem ser levado (portal trancado).
   */
  colegaPortal: Point | null;
  /** Posição do seguidor no tick anterior (para ver que ele atravessou o portal). */
  seguidorPos: Point;
  /** Líder com rota esperando um seguidor longe: desde quando e quem (0/"" = ninguém). */
  esperandoDesde: number;
  esperandoQuem: string;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export class EstagiarioSystem {
  private readonly st = new Map<string, Estado>();
  private readonly now: () => number;

  constructor(private readonly o: EstagiarioOptions) {
    this.now = o.now ?? Date.now;
  }

  /**
   * Entrada no mundo: config salva (limpa de novo: pode ser de outra versão ou de outra vocação), o turno e, desde a v3,
   * o que o jogador deixou ligado (cura/ataque/buffs voltam como estavam, depois de CARENCIA_LOGIN_MS; a rota nunca).
   */
  load(p: PlayerState, saved: CharacterData["estagiario"]): void {
    const now = this.now();
    const config = saved?.config ? sanitizeEstagiario(saved.config, p.vocation, this.o.spellGroups(p)) : estagiarioPadrao(p.vocation);
    const ligado = sanitizeLigado(saved?.ligado);
    const algo = !!(ligado.cura || ligado.ataque || ligado.buffs);
    this.st.set(p.id, {
      config, efetiva: configEfetiva(config, p.vocation),
      turno: avancarTurno(saved?.turno, now, false), cura: !!ligado.cura, ataque: !!ligado.ataque, buffs: !!ligado.buffs, rota: null, indice: 0,
      caminho: null, caminhoEm: 0, caminhoAlvo: -1, melhorDist: Infinity, progressoEm: now, travados: 0, travadoAte: 0,
      inalcancavelAte: 0, recuandoAte: 0, foraAlcanceAte: 0, semManaBuffAte: 0, motivoEnviado: "", lutando: false,
      alvoId: "", alvoAnterior: "", alvoDist: Infinity, alvoHp: Infinity, alvoProgressoEm: now, ignorados: new Map(),
      grav: null, gravPos: { x: p.x, y: p.y },
      pausa: "", pausaAte: 0, emPz: false, estadoEm: 0, buscaEm: 0, comeuEm: 0, retomar: false, pararEnviado: 0, avisos: avisosNovos(),
      suspenso: false, carenciaAte: algo ? now + CARENCIA_LOGIN_MS : 0, diario: [], diarioNovos: [], diarioTudo: false, esperaAnotadaEm: 0, curaOffAnotadaEm: 0,
      seguindo: null, seguindoNome: "", colegaLongeDesde: 0, colegaVisto: null, colegaPos: { x: -1, y: -1 }, colegaAlarmado: false, colegaPortal: null, seguidorPos: { x: -1, y: -1 }, esperandoDesde: 0, esperandoQuem: "",
    });
  }

  /**
   * Para `rec.data.estagiario`: só o que difere do padrão (config padrão, turno cheio e nada ligado não são gravados;
   * v3: a config vai compacta — o preset pelo nome, as listas só se mexidas). `ligado` guarda a escolha do jogador, não
   * o que a rota liga por tabela.
   */
  saved(p: PlayerState): CharacterData["estagiario"] {
    const s = this.st.get(p.id);
    if (!s) return undefined;
    const turno = this.acertar(s, this.now());
    const out: NonNullable<CharacterData["estagiario"]> = {};
    const config = compactar(s.config, p.vocation);
    if (Object.keys(config).length) out.config = config;
    if (turno.ms < avancarTurno(undefined, 0, false).ms) out.turno = { ...turno };
    const ligado: EstagiarioLigado = {};
    if (s.cura) ligado.cura = true;
    if (s.ataque) ligado.ataque = true;
    if (s.buffs) ligado.buffs = true;
    if (ligado.cura || ligado.ataque || ligado.buffs) out.ligado = ligado;
    return out.config || out.turno || out.ligado ? out : undefined;
  }

  /** Há estado carregado para o jogador (o save não apaga o campo de quem ainda não entrou). */
  carregado(id: string): boolean { return this.st.has(id); }

  onConfig(p: PlayerState, m: EstagiarioConfigMsg): void {
    const s = this.st.get(p.id);
    // Mensagem sem objeto de config é lixo: ignorar (sanitizar `undefined` voltaria tudo ao padrão e apagaria as rotas).
    if (!s || !obj(m) || !obj(m.config)) return;
    const rotasAntes = JSON.stringify(s.config.rotas);
    s.config = sanitizeEstagiario(m.config, p.vocation, this.o.spellGroups(p));
    s.efetiva = configEfetiva(s.config, p.vocation);
    const rota = s.rota && this.rotaDe(s, s.rota);
    if (s.rota && !rota) this.pararRota(p, s, this.now(), "a rota foi apagada");
    // Os pontos podem ter mudado: só então recomeça do ponto mais próximo (o Aplicar de uma regra de cura não pode
    // jogar fora o caminho e o progresso da rota rodando).
    else if (rota && JSON.stringify(s.config.rotas) !== rotasAntes) this.irPara(s, indiceMaisProximo(rota.pontos, p), this.now());
    this.enviarEstado(p);
  }

  onToggle(p: PlayerState, m: EstagiarioToggleMsg): void {
    const s = this.st.get(p.id);
    if (!s || !obj(m)) return;
    const now = this.now();
    const liga = (k: "cura" | "ataque" | "buffs", ligou: string, desligou: string) => {
      const v = m[k];
      if (typeof v !== "boolean" || v === s[k]) return;
      s[k] = v;
      this.anotar(s, now, "interruptor", v ? ligou : desligou);
    };
    liga("cura", "Cura ligada", "Cura desligada");
    liga("ataque", "Ataque ligado", "Ataque desligado");
    liga("buffs", "Buffs ligados", "Buffs desligados");
    // Quem liga à mão quer agora: a carência de entrada não vale mais.
    s.carenciaAte = 0;
    if (m.rota === null) this.pararRota(p, s, now);
    else if (typeof m.rota === "string") this.ligarRota(p, s, m.rota);
    if (m.seguir === null) this.pararSeguir(p, s, now);
    else if (typeof m.seguir === "string") this.ligarSeguir(p, s, m.seguir);
    this.enviarEstado(p);
  }

  /**
   * Caçar com amigo (v3): segue um colega do MESMO grupo (decisão do dono), matando o que aparece e preferindo o alvo
   * dele; gasta turno, com crachá e acompanhante como a rota (um ou outro: ligar o seguir desliga a rota).
   */
  private ligarSeguir(p: PlayerState, s: Estado, id: string): void {
    if (p.hp <= 0 || id === p.id) return;
    if (s.grav) { this.notice(p, "Pare a gravação antes de seguir alguém."); return; }
    const c = this.jogador(id);
    if (!c || c.hp <= 0) { this.notice(p, "Esse jogador não está por aqui."); return; }
    if (!this.o.sameParty?.(p.id, id)) { this.notice(p, "Só dá para seguir um colega do seu grupo."); return; }
    if (cheb(p.x, p.y, c.x, c.y) > SEGUIR_MAX_TILES) { this.notice(p, `Chegue perto de ${c.name} para seguir.`); return; }
    const now = this.now();
    this.acertar(s, now);
    if (s.turno.ms <= 0) { this.notice(p, AVISO_TURNO); return; }
    if (s.rota) this.pararRota(p, s, now, `trocou para seguir ${c.name}`);
    const ja = !!s.seguindo;
    s.seguindo = id;
    s.seguindoNome = c.name;
    s.colegaLongeDesde = 0;
    s.colegaVisto = { x: c.x, y: c.y };
    s.colegaPos = { x: c.x, y: c.y };
    s.colegaAlarmado = false;
    s.colegaPortal = null;
    s.seguidorPos = { x: p.x, y: p.y };
    s.lutando = false;
    s.pausa = "";
    s.pausaAte = 0;
    s.estadoEm = now;
    this.anotar(s, now, "rota", `seguindo ${c.name}`);
    const parar = this.pararEm(p, s);
    s.pararEnviado = parar;
    this.o.fight.forceChase(p.id, true, parar);
    if (ja) return; // trocou de colega: o resto já está ligado
    s.avisos = avisosNovos();
    p.bot = true;
    this.o.companions.spawnCompanion(p, now);
  }

  /** `motivo` (diário e alarme "colega"): por que parou de seguir; sem ele, foi o jogador. */
  private pararSeguir(p: PlayerState, s: Estado, now = this.now(), motivo?: string, alarme = false): void {
    if (!s.seguindo) return;
    this.acertar(s, now);
    this.anotar(s, now, "rota", `parou de seguir ${s.seguindoNome}${motivo ? `: ${motivo}` : ""}`);
    if (alarme) this.alarme(p, "colega", `Estagiário: parou de seguir ${s.seguindoNome} (${motivo}).`);
    s.seguindo = null;
    s.seguindoNome = "";
    s.colegaLongeDesde = 0;
    s.colegaVisto = null;
    s.colegaAlarmado = false;
    s.colegaPortal = null;
    s.ignorados.clear();
    s.alvoId = "";
    s.alvoAnterior = "";
    s.inalcancavelAte = 0;
    s.recuandoAte = 0;
    s.pausa = "";
    s.pausaAte = 0;
    s.pararEnviado = 0;
    s.retomar = false;
    p.bot = false;
    this.o.fight.cancelFollow(p);
    this.o.fight.forceChase(p.id, false);
    this.o.companions.despawnCompanion(p.id);
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
      // A rota andando (ou o seguir) seria gravada por cima de si mesma.
      if (s.rota) this.notice(p, "Desligue a rota para gravar outra.");
      else if (s.seguindo) this.notice(p, "Pare de seguir para gravar uma rota.");
      // Recomeçar jogaria fora os pontos já andados (clique duplo no botão, por exemplo).
      else if (s.grav) this.notice(p, "Já está gravando.");
      else { s.grav = novaGravacao(p); s.gravPos = { x: p.x, y: p.y }; }
    } else if (m.acao === "descartar") s.grav = null;
    else if (m.acao === "parar" && s.grav) this.salvarGravacao(p, s, s.grav, m.nome);
    else if (m.acao !== "parar") return;
    this.enviarEstado(p);
  }

  /** Movimento manual (setas ou clique no chão): a rota (ou o seguir) pausa por PAUSA_MANUAL_MS, renovada a cada comando. */
  manual(id: string): void {
    const s = this.st.get(id);
    if (!s?.rota && !s?.seguindo) return;
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
    if (!s?.rota && !s?.seguindo && !s?.grav) return;
    s.grav = null;
    // Antes de desligar: o alarme só vale se a rota (ou o seguir) estava ligada (sem ela o jogador não estava fora do teclado).
    if (s.rota) this.alarme(p, "morte", "Estagiário: você morreu. A rota foi desligada.");
    if (s.seguindo) this.alarme(p, "morte", `Estagiário: você morreu. Parou de seguir ${s.seguindoNome}.`);
    this.pararRota(p, s, this.now(), "você morreu");
    this.pararSeguir(p, s, this.now(), "você morreu");
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
    if (!s?.rota && !s?.seguindo) return;
    this.pararRota(p, s, this.now(), "Coliseu");
    this.pararSeguir(p, s, this.now(), "Coliseu");
    if (aviso) this.notice(p, aviso);
    this.enviarEstado(p);
  }

  /**
   * Caiu a conexão ou saiu: nada age até reconectar (sem ninguém no cliente o Estagiário não trabalha). v3: cura, ataque
   * e buffs ficam como estavam — vão no save e voltam com o jogador (`reconectou` ou o próximo `load`); a rota desliga e
   * a gravação se perde.
   */
  desligarTudo(p: PlayerState): void {
    const s = this.st.get(p.id);
    if (!s) return;
    s.suspenso = true;
    s.grav = null;
    this.pararRota(p, s, this.now(), "você saiu do jogo");
    this.pararSeguir(p, s, this.now(), "você saiu do jogo");
  }

  /**
   * Reconectou (WorldRoom.onReconnect): volta a agir depois da carência, com o que estava ligado. O diário vai inteiro
   * de novo: o que chegou durante a queda se perdeu no cliente.
   */
  reconectou(p: PlayerState): void {
    const s = this.st.get(p.id);
    if (!s) return;
    s.suspenso = false;
    s.carenciaAte = this.now() + CARENCIA_LOGIN_MS;
    s.diarioNovos = [];
    s.diarioTudo = true;
  }

  /** Alarme para o jogador (se ele não o desligou) e a linha no diário (sempre: é o histórico do que aconteceu). */
  alarme(p: PlayerState, tipo: AlarmeTipo, texto: string): void {
    const s = this.st.get(p.id);
    if (!s) return;
    this.anotar(s, this.now(), "aviso", texto.replace(/^Estagiário: /, ""));
    if (!alarmeLigado(s.config, tipo)) return;
    this.o.send(p.id, S2C.EstagiarioAlarme, { tipo, texto } satisfies EstagiarioAlarmeMsg);
  }

  /** Linha nova no diário (as últimas DIARIO_MAX ficam); vai ao cliente no fim do tick (`enviarDiario`). */
  private anotar(s: Estado, now: number, canal: DiarioCanal, texto: string): void {
    const item: DiarioItem = { t: now, canal, texto };
    s.diario.push(item);
    if (s.diario.length > DIARIO_MAX) s.diario.splice(0, s.diario.length - DIARIO_MAX);
    s.diarioNovos.push(item);
  }

  private enviarDiario(p: PlayerState, s: Estado): void {
    const msg: EstagiarioDiarioMsg = s.diarioTudo ? { itens: [...s.diario], tudo: true } : { itens: s.diarioNovos };
    s.diarioNovos = [];
    s.diarioTudo = false;
    this.o.send(p.id, S2C.EstagiarioDiario, msg);
  }

  /** O diário até agora (testes e o estado inicial). */
  diario(id: string): readonly DiarioItem[] {
    return this.st.get(id)?.diario ?? [];
  }

  estado(p: PlayerState): EstagiarioEstadoMsg {
    const s = this.st.get(p.id);
    const now = this.now();
    if (!s) {
      return {
        config: estagiarioPadrao(p.vocation), cura: false, ataque: false, buffs: false, rota: null, seguindo: null, pausa: "", gravando: false,
        pontosGravados: 0, turnoMs: avancarTurno(undefined, now, false).ms, motivo: "", ponto: null,
      };
    }
    return {
      config: s.config, cura: this.curaLigada(s), ataque: this.ataqueLigado(s), buffs: this.buffsLigados(s), rota: s.rota,
      seguindo: s.seguindo ? { id: s.seguindo, nome: s.seguindoNome } : null, pausa: s.pausa,
      gravando: !!s.grav, pontosGravados: s.grav?.pontos.length ?? 0, turnoMs: avancarTurno(s.turno, now, this.rodando(s)).ms,
      motivo: this.motivo(p, s, now), ponto: this.ponto(s),
    };
  }

  /** Por que o Estagiário não está agindo agora (curto, para o cabeçalho da janela); "" = tudo certo ou nada ligado. */
  private motivo(p: PlayerState, s: Estado, now: number): string {
    const caca = !!s.rota || !!s.seguindo;
    if (caca && s.pausa === "manual") return "pausado: você está jogando";
    if (caca && s.pausa === "npc") return "pausado: conversa com NPC";
    if (s.rota && s.esperandoDesde > 0) return `esperando ${s.esperandoQuem}`;
    if (s.seguindo && s.colegaLongeDesde) return `procurando ${s.seguindoNome}`;
    if (!this.ataqueLigado(s) || p.hp <= 0) return "";
    if (p.targetId && !this.o.monsters.wild(p.targetId) && this.ehJogador(p.targetId)) return "mirando um jogador";
    if (s.rota && now < s.travadoAte) return "ponto travado, pulando";
    if (now < s.inalcancavelAte) return "alvo inalcançável (ignorado 30 s)";
    if (now < s.recuandoAte) return "mantendo distância";
    if (!this.o.monsters.wild(p.targetId)) return "sem alvo por perto";
    if (now < s.foraAlcanceAte) return "alvo fora do alcance";
    const manaPct = p.maxMana > 0 ? (p.mana / p.maxMana) * 100 : 0;
    if (s.efetiva.ataque.length && !s.efetiva.ataque.some((r) => manaPct >= pisoDeMana(r, s.efetiva.reservaMana))) return "reserva de mana";
    if (this.buffsLigados(s) && now < s.semManaBuffAte) return "sem mana para o buff";
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
      if (!s) continue;
      this.tickPlayer(p, s, now);
      // Linhas do diário deste tick (e as de fora dele: ligar/desligar, alarme) numa mensagem só.
      if (s.diarioTudo || s.diarioNovos.length) this.enviarDiario(p, s);
    }
  }

  removePlayer(id: string): void {
    this.st.delete(id);
  }

  // --- tick ---------------------------------------------------------------------------------------------------------

  private tickPlayer(p: PlayerState, s: Estado, now: number): void {
    if (s.grav) this.gravar(p, s, now);
    if (s.rota) this.tickRota(p, s, now);
    else if (s.seguindo) this.tickSeguir(p, s, now);
    if (p.hp > 0) this.agir(p, s, now);
    // O cabeçalho mostra o motivo e o ponto atual: mudou → estado (no máximo um por segundo; o resto vai no periódico).
    if ((s.rota || s.seguindo || s.ataque) && now - s.estadoEm >= MOTIVO_ENVIO_MS && this.chaveMotivo(p, s, now) !== s.motivoEnviado) this.enviarEstado(p, now);
  }

  private agir(p: PlayerState, s: Estado, now: number): void {
    // Sem ninguém no cliente (queda) ou ainda carregando o mundo (carência de entrada): nada.
    if (s.suspenso || now < s.carenciaAte) return;
    // v3: a Cura também liga pela rota (como o ataque e os buffs); desligada com a vida baixa, o diário diz.
    const cura = this.curaLigada(s);
    if (!cura) this.avisarCuraDesligada(p, s, now);
    // v3 (canais): a poção e a magia de cura são recargas diferentes e saem no mesmo tick; o ataque vem depois (a recarga
    // global de magia o separa da cura por magia). Buff só num tick sem magia de cura (a mesma recarga; a cura vem antes).
    const curou = cura ? this.curar(p, s, now) : { pocao: false, magia: false };
    // Comer não mexe em recarga de magia nem de poção: vai junto com o que mais houver no tick.
    if (cura && s.efetiva.comer) this.comer(p, s, now);
    if (!curou.magia && this.buffsLigados(s)) this.buffar(p, s, now);
    if (this.ataqueLigado(s)) this.atacar(p, s, now);
    // Depois do ataque: o alvo escolhido neste tick já segura a caminhada (não dá um passo da rota para o lado errado).
    if (this.rodando(s)) { this.vigiar(p, s, now); if (s.rota) this.andar(p, s, now); else this.andarSeguindo(p, s, now); }
  }

  /**
   * Alarmes de estado (poção, vida, jogador perto, turno), checados a cada tick com a rota rodando. Cada um avisa uma
   * vez ao cruzar o limite e só avisa de novo depois de voltar para o lado seguro (histerese), senão tocaria a 20 Hz.
   */
  private vigiar(p: PlayerState, s: Estado, now: number): void {
    const a = s.avisos;
    // Poções que a cura usa: no modo simples as duas; no avançado, as das regras.
    const kinds = new Set<QuickPotionKind>(s.config.modo === "simples" ? ["hp", "mana"] : s.efetiva.cura.flatMap((r) => ("pocao" in r.acao ? [r.acao.pocao] : [])));
    for (const kind of kinds) {
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
    else if (!a.turno) { a.turno = true; this.alarme(p, "turno", "Estagiário: faltam 5 min de stamina."); }
    if (s.turno.ms >= STAMINA_BAIXA_MS) a.staminaBaixa = false;
    else if (!a.staminaBaixa) {
      a.staminaBaixa = true;
      this.alarme(p, "turno", "Estagiário: stamina baixa (menos de 2 h). O XP da caça dele cai até zerar quando ela acabar.");
    }
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
    if (entrou) { this.pararRota(p, s, now, "zona de proteção"); this.enviarEstado(p); return; }
    // O acompanhante saiu do mundo com a rota ligada (o Coliseu tira tudo do dono, por exemplo): volta ao lado do dono.
    if (p.hp > 0 && !pz && !this.o.companions.companionOf(p.id)) this.o.companions.spawnCompanion(p, now);
    if (this.acompanharPausa(p, s, now)) {
      // Na pausa o jogador andou à mão (ou foi ao NPC): ao voltar, segue do ponto mais perto de onde ele está.
      const rota = this.rotaDe(s, s.rota!);
      if (rota) this.irPara(s, indiceMaisProximo(rota.pontos, p), now);
    }
    if (!this.rodando(s)) return;
    // A distância de parada pode mudar (Aplicar, troca de arma): reenvia só quando muda.
    const parar = this.pararEm(p, s);
    if (parar !== s.pararEnviado) { s.pararEnviado = parar; this.o.fight.forceChase(p.id, true, parar); }
    this.acertar(s, now);
    if (s.turno.ms <= 0) {
      this.pararRota(p, s, now, "o turno acabou");
      this.notice(p, AVISO_TURNO);
      this.enviarEstado(p);
      return;
    }
    if (now - s.estadoEm >= ESTADO_PERIODICO_MS) this.enviarEstado(p, now);
  }

  /** Pausa por NPC aberto ou movimento manual (rota e seguir): aplica a transição; devolve true quando a pausa acabou. */
  private acompanharPausa(p: PlayerState, s: Estado, now: number): boolean {
    const pausa: EstagiarioPausa = this.o.npcOpen(p.id) ? "npc" : now < s.pausaAte ? "manual" : "";
    if (pausa === s.pausa) return false;
    this.mudarPausa(p.id, s, pausa, now);
    // O alvo não foi acompanhado durante a pausa: sem isto, o relógio parado o daria por travado no primeiro tick.
    if (pausa === "") { s.alvoId = ""; s.alvoAnterior = ""; s.alvoProgressoEm = now; }
    return pausa === "";
  }

  /**
   * Caçar com amigo, a cada tick: o colega tem de continuar vivo, no jogo e no grupo (senão desliga, com alarme
   * "colega"). Longe (mais de SEGUIR_MAX_TILES: correu, pegou um portal) não desliga (dono, 2026-11-05: "volta a dar
   * follow automaticamente"): o seguidor vai até onde o viu por último e retoma ao reencontrá-lo; perdido por
   * SEGUIR_SUMIU_MS, o alarme "colega" avisa uma vez. A zona de proteção não desliga (o colega foi ao depot e volta).
   * Gasta turno como a rota.
   */
  private tickSeguir(p: PlayerState, s: Estado, now: number): void {
    const c = this.jogador(s.seguindo!);
    const desliga = (motivo: string) => { this.pararSeguir(p, s, now, motivo, true); this.enviarEstado(p); };
    if (!c) { desliga(`${s.seguindoNome} saiu do jogo`); return; }
    if (c.hp <= 0) { desliga(`${s.seguindoNome} morreu`); return; }
    if (!this.o.sameParty?.(p.id, c.id)) { desliga(`${s.seguindoNome} não está mais no seu grupo`); return; }
    this.rastrearColega(p, s, c, now);
    if (p.hp > 0 && !this.o.monsters.inPz(p.x, p.y) && !this.o.companions.companionOf(p.id)) this.o.companions.spawnCompanion(p, now);
    this.acompanharPausa(p, s, now);
    if (!this.rodando(s)) return;
    const parar = this.pararEm(p, s);
    if (parar !== s.pararEnviado) { s.pararEnviado = parar; this.o.fight.forceChase(p.id, true, parar); }
    this.acertar(s, now);
    if (s.turno.ms <= 0) {
      this.pararSeguir(p, s, now, "o turno acabou");
      this.notice(p, AVISO_TURNO);
      this.enviarEstado(p);
      return;
    }
    if (now - s.estadoEm >= ESTADO_PERIODICO_MS) this.enviarEstado(p, now);
  }

  /**
   * Onde procurar o colega: perto, o lugar dele; saltou por um portal (visto de perto), o portal (o tile para onde ele
   * olhava, como na gravação de rota) até o seguidor atravessá-lo; saiu andando ou por teleporte sem portal (templo,
   * viagem de NPC), o último tile visto.
   */
  private rastrearColega(p: PlayerState, s: Estado, c: PlayerState, now: number): void {
    const antes = s.colegaPos;
    s.colegaPos = { x: c.x, y: c.y };
    const eu = s.seguidorPos;
    s.seguidorPos = { x: p.x, y: p.y };
    // Antes da distância: a saída do portal pode ficar a até SEGUIR_MAX_TILES em linha reta, do outro lado de uma parede.
    if (cheb(antes.x, antes.y, c.x, c.y) > 1 && cheb(p.x, p.y, antes.x, antes.y) <= SEGUIR_MAX_TILES) {
      const portal = this.portalDoSalto(c, antes);
      if (portal) {
        s.colegaPortal = portal;
        s.colegaVisto = portal;
        this.anotar(s, now, "rota", `indo atrás de ${s.seguindoNome} pelo portal`);
      }
      s.caminhoAlvo = -1; // destino novo: recalcula o caminho
    }
    const pt = s.colegaPortal;
    if (pt && (cheb(eu.x, eu.y, p.x, p.y) > 1 || (p.x === pt.x && p.y === pt.y))) s.colegaPortal = null;
    if (s.colegaPortal) {
      if (!s.colegaLongeDesde) s.colegaLongeDesde = now; // anda até o portal (andarSeguindo), sem o follow direto
      return;
    }
    if (cheb(p.x, p.y, c.x, c.y) <= SEGUIR_MAX_TILES) {
      if (s.colegaLongeDesde) this.anotar(s, now, "rota", `reencontrou ${s.seguindoNome}`);
      s.colegaLongeDesde = 0;
      s.colegaAlarmado = false;
      s.colegaVisto = { x: c.x, y: c.y };
      return;
    }
    if (!s.colegaLongeDesde) {
      s.colegaLongeDesde = now;
      this.anotar(s, now, "rota", `perdeu ${s.seguindoNome} de vista: indo aonde o viu por último`);
    } else if (!s.colegaAlarmado && now - s.colegaLongeDesde >= SEGUIR_SUMIU_MS) {
      s.colegaAlarmado = true;
      this.alarme(p, "colega", `Estagiário: perdeu ${s.seguindoNome} de vista; continua procurando.`);
    }
  }

  /**
   * Seguindo: com alvo vivo, a perseguição forçada manda (o seguir do FightMode é cancelado, senão ele ganharia da
   * perseguição) e o recuo de "manter distância" vale; sem alvo, anda atrás do colega.
   */
  private andarSeguindo(p: PlayerState, s: Estado, now: number): void {
    if (this.alvoVivo(p) && !this.alvoTravado(p, s, now)) {
      if (p.followId) this.o.fight.cancelFollow(p);
      s.lutando = true;
      this.recuar(p, s, now);
      return;
    }
    if (!this.alvoVivo(p)) { s.alvoId = ""; s.alvoAnterior = ""; s.alvoProgressoEm = now; }
    if (s.lutando) s.lutando = false;
    // Colega perdido: o follow do FightMode desistiria (longe demais) com aviso a cada tick; anda até onde o viu por último.
    if (s.colegaLongeDesde) {
      if (p.followId) this.o.fight.cancelFollow(p);
      const v = s.colegaVisto;
      if (v && (p.x !== v.x || p.y !== v.y)) this.passo(p, s, v, now, -2);
      return;
    }
    if (p.followId !== s.seguindo) this.o.fight.follow(p, s.seguindo!);
  }

  /** Quem está seguindo `id` (vivos e no jogo): o líder com rota espera por eles. */
  private seguidoresDe(id: string): PlayerState[] {
    const out: PlayerState[] = [];
    for (const q of this.o.players()) if (q.hp > 0 && this.st.get(q.id)?.seguindo === id) out.push(q);
    return out;
  }

  /**
   * Líder com rota (decisão do dono: "espera"): para de andar enquanto um seguidor vivo está a mais de ESPERAR_TILES
   * (volta quando todos estão a até ESPERAR_PERTO_TILES), no máximo ESPERAR_MAX_MS por vez — um seguidor preso atrás de
   * uma cerca não pode prender a rota para sempre. Devolve true enquanto espera.
   */
  private esperarSeguidores(p: PlayerState, s: Estado, now: number): boolean {
    const seg = this.seguidoresDe(p.id);
    const limpar = () => { s.esperandoDesde = 0; s.esperandoQuem = ""; };
    if (!seg.length) { limpar(); return false; }
    // Histerese: começa a esperar com alguém a mais de ESPERAR_TILES; só volta (ou pode esperar de novo) com todos perto.
    if (seg.every((q) => cheb(p.x, p.y, q.x, q.y) <= ESPERAR_PERTO_TILES)) { limpar(); return false; }
    if (s.esperandoDesde < 0) return false; // já desistiu desta espera
    if (!s.esperandoDesde) {
      const longe = seg.find((q) => cheb(p.x, p.y, q.x, q.y) > ESPERAR_TILES);
      if (!longe) return false;
      s.esperandoDesde = now;
      s.esperandoQuem = longe.name;
      this.anotar(s, now, "rota", `esperando ${longe.name}`);
    }
    if (now - s.esperandoDesde >= ESPERAR_MAX_MS) {
      this.anotar(s, now, "rota", `cansou de esperar ${s.esperandoQuem}: segue a rota`);
      s.esperandoDesde = -1;
      s.esperandoQuem = "";
      return false;
    }
    return true;
  }

  /** Há colega de grupo ao alcance da magia com menos de `pct`% de vida (regras "aliado" e a cura em grupo do modo simples). */
  private aliadoAbaixo(p: PlayerState, magia: string, pct: number): boolean {
    if (!this.o.aliados) return false;
    const raio = spellDef(magia)?.radius ?? 3;
    for (const q of this.o.aliados(p)) if (q.hp > 0 && q.maxHp > 0 && cheb(p.x, p.y, q.x, q.y) <= raio && (q.hp / q.maxHp) * 100 < pct) return true;
    return false;
  }

  /**
   * Cura deste tick, um canal por recarga (v3 etapa 2): a poção (vida ou mana) e a magia de cura (ou de grupo) são
   * recargas diferentes e saem juntas; devolve o que saiu. Modo simples: a política `decidirCura` com o perfil. Modo
   * avançado: as regras de poção e as de magia são duas listas, cada uma com "a primeira que vale e está pronta". A
   * poção só conta se dá para beber (level e vocação). Ação recusada vai ao diário e, no avançado, tenta a regra seguinte.
   */
  private curar(p: PlayerState, s: Estado, now: number): { pocao: boolean; magia: boolean } {
    if (s.config.modo === "simples") return this.curarSimples(p, s, now);
    const falhou = new Set<CuraAcao>();
    const pronto = (a: CuraAcao) => !falhou.has(a) && ("magia" in a
      ? this.o.spells.ready(p, a.magia, now)
      : this.o.potions.potionReady(p, now) && this.o.potions.canDrink(p, a.pocao));
    const aliado = (pct: number, a: CuraAcao): boolean => "magia" in a && this.aliadoAbaixo(p, a.magia, pct);
    const esperando: RegraCura[] = [];
    const canal = (regras: RegraCura[]): boolean => {
      for (let k = 0; k < regras.length; k++) {
        const antes = esperando.length;
        const acao = escolherCura(p, regras, pronto, aliado, (r) => esperando.push(r));
        if (!acao) return false;
        esperando.length = antes; // o que ficou antes da escolhida não é espera
        if (this.executarCura(p, s, now, acao, this.situacao(p, regras.find((r) => r.acao === acao)!))) return true;
        falhou.add(acao);
      }
      return false;
    };
    const pocao = canal(s.efetiva.cura.filter((r) => "pocao" in r.acao));
    const magia = canal(s.efetiva.cura.filter((r) => "magia" in r.acao));
    if (esperando.length) this.anotarEspera(p, s, now, this.situacao(p, esperando[0]!), esperando.map((r) => this.porQueNaoPronta(p, r, now)));
    return { pocao, magia };
  }

  /** Modo simples: monta a situação (poções, magias de cura até o level, grupo, escudo) e executa a decisão da política. */
  private curarSimples(p: PlayerState, s: Estado, now: number): { pocao: boolean; magia: boolean } {
    const falta = Math.max(0, p.maxHp - p.hp), faltaMana = Math.max(0, p.maxMana - p.mana);
    const pronta = this.o.potions.potionReady(p, now);
    const recupera = (k: QuickPotionKind, f: number) =>
      this.o.potions.potionAmount ? this.o.potions.potionAmount(p, k, f) : this.o.potions.canDrink(p, k) ? Math.max(1, f) : 0;
    const grupo = curaEmGrupo(p.vocation, p.level);
    const sit: SituacaoCura = {
      hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana,
      pocao: { hp: { pronta, recupera: recupera("hp", falta) }, mana: { pronta, recupera: recupera("mana", faltaMana) } },
      magias: curasProprias(p.vocation, p.level).map((m) => ({ id: m.id, pronta: this.o.spells.ready(p, m.id, now), cura: curaEstimada(m.heal, p.level, p.magicLevel ?? 0), mana: m.mana })),
      grupo: grupo ? { id: grupo.id, pronta: this.o.spells.ready(p, grupo.id, now), aliadoBaixo: this.aliadoAbaixo(p, grupo.id, s.config.perfil.conforto) } : undefined,
      escudoDeMana: this.o.conditions.has(p.id, "manashield"),
    };
    const d = decidirCura(sit, s.config.perfil);
    const pct = (cur: number, max: number) => (max > 0 ? Math.round((cur / max) * 100) : 0);
    const situacao = d.pocao === "mana" && !d.magia ? `mana ${pct(p.mana, p.maxMana)}%` : `vida ${pct(p.hp, p.maxHp)}%`;
    const pocao = d.pocao !== null && this.executarCura(p, s, now, { pocao: d.pocao }, d.pocao === "mana" ? `mana ${pct(p.mana, p.maxMana)}%` : `vida ${pct(p.hp, p.maxHp)}%`);
    const magia = d.magia !== null && this.executarCura(p, s, now, { magia: d.magia }, d.magia === grupo?.id && sit.grupo?.aliadoBaixo ? `aliado abaixo de ${s.config.perfil.conforto}%` : `vida ${pct(p.hp, p.maxHp)}%`);
    if (d.motivos.length) this.anotarEspera(p, s, now, situacao, d.motivos);
    return { pocao, magia };
  }

  /** Executa a poção ou a magia e anota no diário (com o ganho); false se foi recusada. */
  private executarCura(p: PlayerState, s: Estado, now: number, acao: CuraAcao, situacao: string): boolean {
    const hpAntes = p.hp, manaAntes = p.mana;
    const ok = "magia" in acao
      ? this.o.spells.cast(p, acao.magia, undefined, { silent: true }).ok
      : this.o.potions.usePotion(p, acao.pocao, { silent: true, cobrir: acao.pocao === "hp" ? p.maxHp - p.hp : p.maxMana - p.mana });
    if (ok) {
      const ganho = "pocao" in acao && acao.pocao === "mana" ? p.mana - manaAntes : p.hp - hpAntes;
      this.anotar(s, now, "magia" in acao ? "cura" : "pocao", `${situacao} → ${this.nomeDaAcao(acao)}${ganho > 0 ? `, +${ganho}` : ""}`);
    } else this.anotar(s, now, "aviso", `${situacao}: ${this.nomeDaAcao(acao)} recusada`);
    return ok;
  }

  /** Diário: "esperando" com os motivos, no máximo a cada DIARIO_ESPERA_MS. */
  private anotarEspera(_p: PlayerState, s: Estado, now: number, situacao: string, motivos: string[]): void {
    if (now - s.esperaAnotadaEm < DIARIO_ESPERA_MS) return;
    s.esperaAnotadaEm = now;
    this.anotar(s, now, "cura", `${situacao}: esperando (${motivos.join("; ")})`);
  }

  /** "vida 42%" / "mana 18%" / "aliado abaixo de 50%": o que fez a regra valer. */
  private situacao(p: PlayerState, r: RegraCura): string {
    const pct = (cur: number, max: number) => (max > 0 ? Math.round((cur / max) * 100) : 0);
    if (r.quando === "aliado") return `aliado abaixo de ${r.abaixoDe}%`;
    return r.quando === "vida" ? `vida ${pct(p.hp, p.maxHp)}%` : `mana ${pct(p.mana, p.maxMana)}%`;
  }

  private nomeDaAcao(a: CuraAcao): string {
    return "pocao" in a ? (a.pocao === "hp" ? "poção de vida" : "poção de mana") : spellDef(a.magia)?.name ?? a.magia;
  }

  /** Por que a ação da regra não saiu agora (diário): sem poção que dê para beber, recarga, level ou mana. */
  private porQueNaoPronta(p: PlayerState, r: RegraCura, now: number): string {
    const nome = this.nomeDaAcao(r.acao);
    if ("pocao" in r.acao) return this.o.potions.canDrink(p, r.acao.pocao) ? `${nome} em recarga` : `nenhuma ${nome} que você possa beber`;
    const def = spellDef(r.acao.magia);
    if (def && def.level > p.level) return `${nome} acima do seu level`;
    // Pronta com mana infinita = só a mana segura; senão é a recarga (própria ou global).
    if (this.o.spells.ready({ ...p, mana: Number.MAX_SAFE_INTEGER } as PlayerState, r.acao.magia, now)) return `${nome} sem mana`;
    return `${nome} em recarga`;
  }

  /** Cura desligada com a vida abaixo do conforto (ou de alguma regra de vida): o diário diz, no máximo a cada DIARIO_CURA_OFF_MS. */
  private avisarCuraDesligada(p: PlayerState, s: Estado, now: number): void {
    if (p.maxHp <= 0 || now - s.curaOffAnotadaEm < DIARIO_CURA_OFF_MS) return;
    const pct = (p.hp / p.maxHp) * 100;
    const vale = s.config.modo === "simples" ? pct < s.config.perfil.conforto : s.efetiva.cura.some((r) => r.quando === "vida" && pct < r.abaixoDe);
    if (!vale) return;
    s.curaOffAnotadaEm = now;
    this.anotar(s, now, "aviso", `vida ${Math.round(pct)}%: a Cura está desligada`);
  }

  /** Come quando o "alimentado" está acabando (COMER_ANTES_MS), no máximo uma tentativa por COMER_INTERVALO_MS. */
  private comer(p: PlayerState, s: Estado, now: number): void {
    if (!this.o.alimentadoMs || !this.o.comer || now - s.comeuEm < COMER_INTERVALO_MS) return;
    if (this.o.alimentadoMs(p.id, now) >= COMER_ANTES_MS) return;
    s.comeuEm = now;
    if (this.o.comer(p)) this.anotar(s, now, "comer", "comeu: o alimentado estava acabando");
  }

  /** Reconjura o primeiro buff (ou invocação) da lista que acabou (regras em escolherBuff); no máximo um por tick. */
  private buffar(p: PlayerState, s: Estado, now: number): void {
    if (!s.efetiva.buffs.length) return;
    const ctx = {
      ativo: (c: ConditionId) => this.o.conditions.has(p.id, c),
      invocado: () => (this.o.invocacoes?.(p.id) ?? 0) > 0,
      emCombate: this.o.inCombat ? this.o.inCombat(p.id, now) : !!this.o.monsters.wild(p.targetId),
      mana: p.mana, maxMana: p.maxMana,
      pronto: (id: string) => this.o.spells.ready(p, id, now),
    };
    const magia = escolherBuff(s.efetiva.buffs, ctx);
    if (magia) {
      if (this.o.spells.cast(p, magia, undefined, { silent: true }).ok) {
        const def = spellDef(magia);
        this.anotar(s, now, "buff", `${def?.name ?? magia} ${def && ehInvocacao(def) ? "invocado" : "conjurado"}`);
      }
      return;
    }
    // Nada saiu: se a mana mínima da regra (ou a mana da própria magia) é o que segura, o painel explica.
    const pronta = (id: string) => this.o.spells.ready(p, id, now) || this.o.spells.ready({ ...p, mana: Number.MAX_SAFE_INTEGER } as PlayerState, id, now);
    if (escolherBuff(s.efetiva.buffs, { ...ctx, mana: Number.MAX_SAFE_INTEGER, maxMana: Number.MAX_SAFE_INTEGER, pronto: pronta })) s.semManaBuffAte = now + MOTIVO_MS;
  }

  private atacar(p: PlayerState, s: Estado, now: number): void {
    const mm = this.o.monsters;
    // Alvo jogador (mirado à mão): o Estagiário nunca troca nem ataca jogador; a rotação fica parada.
    if (p.targetId && !mm.wild(p.targetId) && this.ehJogador(p.targetId)) return;
    // Sempre o bicho mais perto (2026-11-01, dono): procura também com alvo vivo e troca se achar um estritamente mais
    // perto (empate fica no atual, para não pular de um para outro). Com a rota pausada à mão, só se o próprio jogador
    // ligou o Ataque: ligado só pela rota, o jogador está no controle e o bot não escolhe alvo por ele.
    if (now - s.buscaEm >= (mm.wild(p.targetId) ? BUSCA_MS : BUSCA_SEM_ALVO_MS) && (s.ataque || this.rodando(s))) {
      s.buscaEm = now;
      // Caçando com amigo (decisão do dono): o alvo do colega vem primeiro, se está ao alcance da busca; senão o mais perto.
      const doColega = s.seguindo ? this.alvoDoColega(p, s, now) : "";
      const id = doColega || this.o.fight.nearestTarget(p, BUSCA_TILES, (m) => this.ignoradoEm(s, m, now));
      const cur = mm.wild(p.targetId), nxt = id ? mm.wild(id) : undefined;
      if (id && id !== p.targetId && (id === doColega || !cur || (nxt && cheb(p.x, p.y, nxt.s.x, nxt.s.y) < cheb(p.x, p.y, cur.s.x, cur.s.y)))) {
        p.targetId = id;
        // Com a rota rodando, persegue já. Fora dela (só o ataque ligado, ou a rota pausada pelo jogador) o jogador pode
        // estar andando à mão: retomar agora cancelaria a pausa de 1,5 s que todo Move/WalkTo põe na perseguição; fica
        // marcado para retomar assim que ele parar (abaixo).
        if (this.rodando(s)) this.o.fight.resume(p.id);
        else s.retomar = true;
      }
    }
    // Jogador parado (sem tecla, clique nem passo em curso) com alvo novo: a perseguição (a escolha dele, p.chase) retoma
    // já, em vez de esperar o resto da pausa de 1,5 s do último passo à mão — era o "delay para seguir o bicho na
    // primeira vez que o vê" (dono, 2026-11-02).
    if (s.retomar) {
      if (!mm.wild(p.targetId)) s.retomar = false;
      else if (this.o.movement.isIdle(p, now)) { this.o.fight.resume(p.id); s.retomar = false; }
    }
    const alvo = mm.wild(p.targetId);
    if (!alvo) return;
    if (!s.efetiva.ataque.length) return;
    const manaPct = p.maxMana > 0 ? (p.mana / p.maxMana) * 100 : 0;
    // Nenhuma regra com mana no piso dela (o dela ou a reserva geral): nem resolve nem conta.
    if (!s.efetiva.ataque.some((r) => manaPct >= pisoDeMana(r, s.efetiva.reservaMana))) return;
    // Magia resolvida uma vez por tick (os grupos do jogador também: lê o save), e os bichos contados uma vez por
    // magia e raio, só se alguma regra tem magia pronta. O resultado é o mesmo de escolherAtaque sem o cache.
    // v2: magia de alvo (ou área no alvo) só conta como pronta com o alvo no alcance e à vista — antes o Golpe Brutal
    // (alcance 1) era escolhido com o alvo longe, a conjuração falhava em silêncio e a Investida (alcance 4) não saía.
    const dAlvo = cheb(p.x, p.y, alvo.s.x, alvo.s.y);
    let visao: boolean | null = null;
    const alcanca = (sp: SpellDef): boolean => {
      if (!needsTarget(sp)) return true;
      if (dAlvo > (sp.range ?? DEFAULT_SPELL_RANGE)) return false;
      return (visao ??= mm.los(p.x, p.y, alvo.s.x, alvo.s.y));
    };
    let grupos: readonly SpellGroup[] | null = null;
    const resolvidas = new Map<string, string | null>();
    const resolverCom = (id: string, filtro: (sp: SpellDef) => boolean): string | null => {
      if (!isFamilyId(id)) { const sp = spellDef(id); return sp && this.o.spells.ready(p, id, now) && filtro(sp) ? id : null; }
      const f = resolveFamily(id, (grupos ??= this.o.spellGroups(p)), p.vocation);
      return f ? pickFromFamily(f, p.level, (sp) => this.o.spells.ready(p, sp.id, now) && filtro(sp))?.id ?? null : null;
    };
    const resolver = (id: string): string | null => {
      let r = resolvidas.get(id);
      if (r !== undefined) return r;
      r = resolverCom(id, alcanca);
      resolvidas.set(id, r);
      return r;
    };
    if (!s.efetiva.ataque.some((r) => resolver(r.magia))) {
      // Pronta, mas só fora do alcance: o painel explica ("alvo fora do alcance") enquanto a perseguição aproxima.
      if (s.efetiva.ataque.some((r) => resolverCom(r.magia, () => true))) s.foraAlcanceAte = now + MOTIVO_MS;
      return;
    }
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
    const alvoPct = alvo.s.maxHp > 0 ? (alvo.s.hp / alvo.s.maxHp) * 100 : 100;
    const magia = escolherAtaque(s.efetiva.ataque, bichosEm, manaPct, s.efetiva.reservaMana, resolver, alvoPct);
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
   * Um passo da rota (tick, rota rodando). Com alvo vivo não anda (a perseguição forçada aproxima; com "manter
   * distância", recua um passo de quem encosta); ao matar, retoma pelo ponto mais próximo. Chegou ao ponto → o seguinte
   * (circuito); ponto de portal: pisar nele teleporta para o ponto seguinte, que conta como alcançado. Sem chegar mais
   * perto por PONTO_TRAVADO_MS (inalcançável, ocupado, fora do mapa) → pula. O passo é o da perseguição
   * (FightModeSystem.stepToward): A* recalculado no máximo a cada CAMINHO_MS ou quando o ponto muda, um `follow` por vez.
   */
  private andar(p: PlayerState, s: Estado, now: number): void {
    const rota = this.rotaDe(s, s.rota!);
    if (!rota) return;
    const pts = rota.pontos, n = pts.length;
    if (this.alvoVivo(p) && !this.alvoTravado(p, s, now)) {
      s.lutando = true;
      s.caminho = null;
      this.recuar(p, s, now);
      return;
    }
    // Líder com seguidor longe (decisão do dono: "espera"): fica, lutando e curando, até ele chegar; o relógio de ponto
    // travado não anda enquanto isso.
    if (this.esperarSeguidores(p, s, now)) { s.progressoEm = now; s.caminho = null; return; }
    // Sem luta: o relógio de "luta sem progresso" começa do zero na próxima (o alvo anterior não conta mais).
    if (!this.alvoVivo(p)) { s.alvoId = ""; s.alvoAnterior = ""; s.alvoProgressoEm = now; }
    if (s.lutando) { s.lutando = false; this.irPara(s, indiceRetomada(pts, s.indice, p), now); }
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
      if (++s.travados >= PONTOS_TRAVADOS_MAX) { this.pararRota(p, s, now, `${PONTOS_TRAVADOS_MAX} pontos travados seguidos`); this.notice(p, AVISO_TRAVADA); this.enviarEstado(p, now); return; }
      s.travadoAte = now + MOTIVO_MS;
      this.irPara(s, this.depoisDoTravado(pts, s.indice), now);
      return;
    }
    this.passo(p, s, alvo, now);
  }

  /** O monstro selvagem que o colega seguido está atacando, se está a até BUSCA_TILES e não foi largado; senão "". */
  private alvoDoColega(p: PlayerState, s: Estado, now: number): string {
    const c = this.jogador(s.seguindo!);
    const m = c?.targetId ? this.o.monsters.wild(c.targetId) : undefined;
    if (!m || m.s.hp <= 0 || cheb(p.x, p.y, m.s.x, m.s.y) > BUSCA_TILES || this.ignoradoEm(s, m.s.id, now)) return "";
    return m.s.id;
  }

  /**
   * "Manter distância" (decisão do dono): com a rota ou o seguir rodando, quem ataca à distância recua um passo quando um
   * monstro corpo a corpo encosta — para um vizinho livre que se afasta dele, mantém o alvo no alcance e à vista e fica a até RECUO_MAX_TILES da rota
   * (ou do colega). Nunca na PZ; monstro à distância não faz recuar. O ataque básico e as magias continuam saindo
   * andando (o combate só olha distância, visão e recarga).
   */
  private recuar(p: PlayerState, s: Estado, now: number): void {
    const alcance = this.o.attackRange?.(p) ?? 1;
    if (s.efetiva.distancia <= 0 || alcance <= 1) return;
    const mm = this.o.monsters;
    const alvo = mm.wild(p.targetId);
    if (!alvo || mm.inPz(p.x, p.y) || !this.o.movement.isIdle(p, now)) return;
    const distancia = Math.min(s.efetiva.distancia, alcance);
    const ameacas: Point[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const m = mm.monsterAt(p.x + dx, p.y + dy);
      if (m && !m.s.ownerId && m.s.hp > 0 && !m.def.invulnerable && !m.def.stationary && m.def.attackRange <= 1) ameacas.push({ x: m.s.x, y: m.s.y });
    }
    if (!ameacas.length) return;
    const ancora = this.ancoraRecuo(s);
    // Já fora do limite (rota longe, colega correu): pode andar em volta, nunca para mais longe.
    const longeAgora = ancora(p.x, p.y);
    const t = escolherRecuo({
      pos: p, alvo: alvo.s, ameacas, distancia, alcance,
      dentro: (x, y) => ancora(x, y) <= Math.max(RECUO_MAX_TILES, longeAgora),
      livre: (x, y) => mm.grid.isWalkable(x, y) && !mm.isMonsterAt(x, y) && !mm.inPz(x, y) && !this.ocupado(p, { x, y }),
      visao: (x, y) => mm.los(x, y, alvo.s.x, alvo.s.y),
    });
    if (!t) return;
    const dir = dirFromDelta(t.x - p.x, t.y - p.y);
    if (dir !== null && this.o.movement.follow(p, dir, now) === "ok") s.recuandoAte = now + MOTIVO_MS;
  }

  /** Distância (tiles) de um tile à âncora do recuo: o ponto da rota mais perto, ou o colega seguido. 0 = sem âncora. */
  private ancoraRecuo(s: Estado): (x: number, y: number) => number {
    const rota = s.rota ? this.rotaDe(s, s.rota) : undefined;
    if (rota?.pontos.length) {
      const pts = rota.pontos;
      return (x, y) => { let d = Infinity; for (const q of pts) d = Math.min(d, cheb(x, y, q.x, q.y)); return d; };
    }
    const c = s.seguindo ? this.jogador(s.seguindo) : undefined;
    if (c) return (x, y) => cheb(x, y, c.x, c.y);
    return () => 0;
  }

  /** Distância a que a perseguição forçada para: a opção "manter distância", limitada ao alcance do ataque (1 = colado). */
  private pararEm(p: PlayerState, s: Estado): number {
    const alcance = this.o.attackRange?.(p) ?? 1;
    return s.efetiva.distancia > 0 && alcance > 1 ? Math.min(s.efetiva.distancia, alcance) : 1;
  }

  /** Há outra criatura (monstro, inclusive o acompanhante, ou outro jogador) parada no tile do ponto. */
  private ocupado(p: PlayerState, q: Point): boolean {
    if (this.o.monsters.isMonsterAt(q.x, q.y)) return true;
    for (const o of this.o.players()) if (o.id !== p.id && o.hp > 0 && o.x === q.x && o.y === q.y) return true;
    return false;
  }

  /** `chave`: o destino do caminho guardado (o índice do ponto da rota; -2 = o lugar onde o colega foi visto). */
  private passo(p: PlayerState, s: Estado, alvo: Point, now: number, chave = s.indice): void {
    const mv = this.o.movement;
    if (!mv.isIdle(p, now)) return;
    if (s.caminhoAlvo !== chave || (now - s.caminhoEm >= CAMINHO_MS && !s.caminho?.length)) {
      s.caminho = mv.pathFor(p, { x: alvo.x, y: alvo.y });
      s.caminhoEm = now;
      s.caminhoAlvo = chave;
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

  /**
   * O Estagiário escolhe o alvo deste jogador agora (a mesma condição da busca em `atacar`): o ataque automático (F8)
   * cede a vez, senão trocaria o alvo do colega pelo bicho mais perto a cada busca. Pausado à mão, o F8 volta.
   */
  mirando(playerId: string): boolean {
    const s = this.st.get(playerId);
    return !!s && !s.suspenso && this.now() >= s.carenciaAte && (s.ataque || this.rodando(s));
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
    // Um ou outro: a rota no lugar do seguir.
    if (s.seguindo) this.pararSeguir(p, s, now, `trocou para a rota "${rota.nome}"`);
    const ja = !!s.rota;
    const parar = this.pararEm(p, s);
    // Trocou de rota durante a pausa: a pausa acaba aqui, então a perseguição forçada volta.
    if (ja && s.pausa !== "") this.o.fight.forceChase(p.id, true, parar);
    s.rota = rota.nome;
    this.anotar(s, now, "rota", `rota "${rota.nome}" ligada`);
    this.irPara(s, i0, now);
    s.travados = 0;
    s.travadoAte = 0;
    s.lutando = false;
    s.pausa = "";
    s.pausaAte = 0;
    s.emPz = false;
    s.estadoEm = now;
    s.pararEnviado = parar;
    if (ja) return; // trocou de rota: o resto já está ligado
    s.avisos = avisosNovos(); // rota nova: o que já estava no limite avisa de novo
    p.bot = true;
    this.o.fight.forceChase(p.id, true, parar);
    this.o.companions.spawnCompanion(p, now);
  }

  /** `motivo` (diário): por que desligou ("o turno acabou", "você morreu"...); sem ele, foi o jogador. */
  private pararRota(p: PlayerState, s: Estado, now = this.now(), motivo?: string): void {
    if (!s.rota) return;
    this.acertar(s, now); // fecha a conta do turno no estado em que estava (rodando ou pausada)
    this.anotar(s, now, "rota", `rota "${s.rota}" desligada${motivo ? `: ${motivo}` : ""}`);
    s.rota = null;
    s.ignorados.clear();
    s.alvoId = "";
    s.alvoAnterior = "";
    s.inalcancavelAte = 0;
    s.recuandoAte = 0;
    s.pausa = "";
    s.pausaAte = 0;
    s.pararEnviado = 0;
    s.retomar = false;
    p.bot = false;
    this.o.fight.forceChase(p.id, false);
    this.o.companions.despawnCompanion(p.id);
  }

  private mudarPausa(id: string, s: Estado, pausa: EstagiarioPausa, now: number): void {
    this.acertar(s, now);
    const p = this.jogador(id);
    // Na pausa o jogador está no controle: a perseguição forçada o arrastaria de volta ao alvo durante os 10 s.
    if ((s.pausa === "") !== (pausa === "")) {
      const parar = p ? this.pararEm(p, s) : 1;
      s.pararEnviado = pausa === "" ? parar : 0;
      this.o.fight.forceChase(id, pausa === "", parar);
    }
    s.pausa = pausa;
    this.anotar(s, now, "rota", pausa === "manual" ? "rota pausada: você se mexeu" : pausa === "npc" ? "rota pausada: conversa com NPC" : "rota retomada");
    if (p) this.enviarEstado(p, now);
  }

  // --- auxiliares ---------------------------------------------------------------------------------------------------

  /** Caçando (rota ou seguindo um colega) e sem pausa. */
  private rodando(s: Estado): boolean { return (!!s.rota || !!s.seguindo) && s.pausa === ""; }

  /** v3: a Cura liga pela rota (e pelo seguir) como o ataque e os buffs (a rota sem cura foi o "não usou pote" do dono). */
  private curaLigada(s: Estado): boolean { return s.cura || !!s.rota || !!s.seguindo; }

  private ataqueLigado(s: Estado): boolean { return s.ataque || !!s.rota || !!s.seguindo; }

  private buffsLigados(s: Estado): boolean { return s.buffs || !!s.rota || !!s.seguindo; }

  /**
   * Multiplicador do XP de abate de `p` (CombatSystem.killXpMult): só com o Estagiário rodando (rota ou seguir) e pela
   * stamina (staminaXpMult); caçando à mão, 1.
   */
  xpMult(p: PlayerState, now = this.now()): number {
    const s = this.st.get(p.id);
    if (!s || !this.rodando(s)) return 1;
    return staminaXpMult(avancarTurno(s.turno, now, true).ms);
  }

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
