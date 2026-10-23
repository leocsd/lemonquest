import { Schema, MapSchema, type } from "@colyseus/schema";
import type { FightStance, Skull, GroundItemView, MonsterView, PlayerView, Vocation } from "@lemonquest/shared";

/** Deve espelhar PlayerView (packages/shared/src/types.ts). */
export class PlayerState extends Schema implements PlayerView {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") vocation: Vocation = "knight";
  @type("uint16") level = 1;
  @type("uint16") x = 0;
  @type("uint16") y = 0;
  @type("uint8") dir = 4;
  @type("uint16") stepMs = 0;
  @type("uint32") seq = 0;
  @type("uint32") hp = 150;
  @type("uint32") maxHp = 150;
  @type("uint32") mana = 50;
  @type("uint32") maxMana = 50;
  @type("uint32") xp = 0;
  @type("string") targetId = "";
  @type("uint16") magicLevel = 0;
  @type("uint16") skillMelee = 10;
  @type("uint16") skillDistance = 10;
  @type("uint16") skillShield = 10;
  @type("uint8") magicPct = 0;
  @type("uint8") meleePct = 0;
  @type("uint8") distancePct = 0;
  @type("uint8") shieldPct = 0;
  @type("uint16") speedPct = 100;
  @type("string") stance: FightStance = "balanced";
  @type("boolean") chase = false;
  @type("boolean") auto = false;
  @type("string") followId = "";
  @type("string") skull: Skull = "";
  @type("string") outfit = "cavaleiro";
  @type("uint8") addons = 0;
  /** Título ativo (texto). Conquistas. */
  @type("string") title = "";
  @type("string") partyId = "";
  /** Bênção ativa (templo): zera a penalidade de XP na próxima morte, depois se consome. */
  @type("boolean") blessed = false;
  /** Tom de tingimento ativo (id em OUTFIT_TONES; "" = cor natural). */
  @type("string") tone = "";
  /** Montaria visível (precisa estar liberada na conta). */
  @type("boolean") mount = false;
  /** Encantamento ativo (id em IMBUEMENTS; "" = nenhum). Só vale no PvE. */
  @type("string") imbuement = "";
}

/** Deve espelhar MonsterView (packages/shared/src/types.ts). */
export class MonsterState extends Schema implements MonsterView {
  @type("string") id = "";
  @type("string") defId = "";
  @type("uint16") x = 0;
  @type("uint16") y = 0;
  @type("uint8") dir = 4;
  @type("uint16") stepMs = 0;
  @type("uint32") hp = 1;
  @type("uint32") maxHp = 1;
  @type("string") targetId = "";
  @type("string") ownerId = "";
  @type("boolean") elite = false;
}

/** Deve espelhar GroundItemView (packages/shared/src/types.ts). Bônus ficam só no servidor (systems/ground.ts). */
export class GroundItemState extends Schema implements GroundItemView {
  @type("string") id = "";
  @type("string") defId = "";
  @type("uint32") count = 1;
  @type("string") rarity = "common";
  @type("uint16") x = 0;
  @type("uint16") y = 0;
}

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: MonsterState }) monsters = new MapSchema<MonsterState>();
  @type({ map: GroundItemState }) groundItems = new MapSchema<GroundItemState>();
  /** Relógio do mundo (ms desde o início do ciclo dia/noite, 0..CYCLE_MS). Atualizado a cada poucos segundos; o cliente extrapola. */
  @type("uint32") worldTimeMs = 0;
}
