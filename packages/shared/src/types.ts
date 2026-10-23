/** 8 direções, no sentido horário a partir do norte. */
export enum Dir { N = 0, NE = 1, E = 2, SE = 3, S = 4, SW = 5, W = 6, NW = 7 }

export const DIR_DELTA: Record<Dir, { dx: number; dy: number }> = {
  [Dir.N]: { dx: 0, dy: -1 },
  [Dir.NE]: { dx: 1, dy: -1 },
  [Dir.E]: { dx: 1, dy: 0 },
  [Dir.SE]: { dx: 1, dy: 1 },
  [Dir.S]: { dx: 0, dy: 1 },
  [Dir.SW]: { dx: -1, dy: 1 },
  [Dir.W]: { dx: -1, dy: 0 },
  [Dir.NW]: { dx: -1, dy: -1 },
};

export const isDiagonal = (d: Dir) => d % 2 === 1;

/** Direção "visual" (4 lados) usada para escolher a linha do spritesheet. */
export type Facing = "down" | "up" | "left" | "right";

export type Vocation = "knight" | "paladin" | "sorcerer" | "druid";
export const VOCATIONS: Vocation[] = ["knight", "paladin", "sorcerer", "druid"];

/** Postura de combate (estilo Tibia). */
export type FightStance = "offensive" | "balanced" | "defensive";

export type ChatChannel = "global" | "party" | "system" | "whisper";

export interface ChatMessage {
  from: string;
  text: string;
  channel: ChatChannel;
  ts: number;
  /** Sussurro: nome do destinatário (`from` = quem sussurrou). */
  to?: string;
}

/**
 * Espelho (somente leitura no cliente) do estado sincronizado pelo Colyseus.
 * As classes @colyseus/schema vivem em packages/server/src/state.ts e DEVEM manter estes campos.
 */
export interface PlayerView {
  id: string;          // sessionId
  name: string;
  vocation: Vocation;
  level: number;
  x: number;           // tile
  y: number;           // tile
  dir: Dir;            // última direção de movimento/olhar
  stepMs: number;      // duração do passo atual (para interpolar)
  seq: number;         // último input "move" processado (reconciliação)
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  xp: number;          // XP total acumulada
  targetId: string;    // alvo de ataque atual ("" = nenhum); id de monstro ou sessionId de jogador
  magicLevel: number;
  skillMelee: number;
  skillDistance: number;
  skillShield: number;
  /** Progresso (0–100) para o próximo nível de cada skill. */
  magicPct: number;
  meleePct: number;
  distancePct: number;
  shieldPct: number;
  /** Velocidade efetiva em % (100 = normal; haste > 100). Informativo para o HUD. */
  speedPct: number;
  stance: FightStance;
  /** true = persegue o alvo automaticamente; false = fica parado. */
  chase: boolean;
  /** true = ataque automático: escolhe sozinho o monstro mais próximo quando está sem alvo. */
  auto?: boolean;
  /** Id do jogador que está sendo seguido ("" = ninguém). */
  followId?: string;
  /** Caveira do PvP ("" = nenhuma; "white" | "red"). Ver shared/src/pvp.ts. */
  skull?: string;
  /** Roupa (id em OUTFITS, shared/data/outfits.ts). Cosmético. */
  outfit: string;
  /** Addons ativos da roupa: bit 1 = addon 1, bit 2 = addon 2. */
  addons: number;
  /** Título ativo (texto exibido ao lado do nome; "" = nenhum). Conquistas. */
  title: string;
  /** Grupo (party) atual ("" = nenhum). Mesmo valor = mesmo grupo (nomes verdes, pontos no minimapa). */
  partyId?: string;
  /** Bênção ativa (templo): zera a penalidade de XP na próxima morte, depois se consome. */
  blessed?: boolean;
  /** Tom de tingimento ativo (id em OUTFIT_TONES; "" = cor natural). Comprado uma vez por conta. */
  tone?: string;
  /** Montaria visível (cosmética, sem bônus de velocidade). Desbloqueada uma vez por conta. */
  mount?: boolean;
  /** Encantamento ativo (id em IMBUEMENTS; "" = nenhum). Só vale no PvE. */
  imbuement?: string;
}

/** Espelho de MonsterState (packages/server/src/state.ts). */
export interface MonsterView {
  id: string;          // único por instância (ex.: "m17")
  defId: string;       // chave em MONSTERS (shared/src/data/monsters.ts)
  x: number;
  y: number;
  dir: Dir;
  stepMs: number;
  hp: number;
  maxHp: number;
  targetId: string;    // sessionId do jogador que está atacando ("" = nenhum)
  /** sessionId do druida dono, se for invocação ("" = selvagem). */
  ownerId: string;
  /** Elite (ciclo 8): nasceu mais forte (vida, dano, XP, ouro e loot maiores); nome "Elite <nome>" em dourado. */
  elite?: boolean;
}

/**
 * Espelho de GroundItemState (packages/server/src/state.ts): item no chão, visto por todos.
 * Bônus ficam só no servidor. Só em memória (some ao reiniciar o servidor).
 */
export interface GroundItemView {
  id: string;
  defId: string;
  count: number;
  rarity: string;   // Rarity (shared/data/items.ts)
  x: number;
  y: number;
}

export type DamageKind = "physical" | "fire" | "ice" | "energy" | "earth" | "holy" | "death" | "heal" | "mana";

/** Um acontecimento de combate para o cliente animar (número flutuante, flash, projétil...). */
export interface CombatEvent {
  /** Quem causou ("" = ambiente). */
  sourceId: string;
  targetId: string;
  /** Valor positivo. 0 com miss=true = errou/bloqueou. */
  amount: number;
  kind: DamageKind;
  crit?: boolean;
  miss?: boolean;
  /** Ataque à distância: o cliente desenha um projétil de source → target. */
  ranged?: boolean;
}

export interface WorldView {
  players: Map<string, PlayerView>;
}
