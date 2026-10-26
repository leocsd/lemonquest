// Marcadores do mapa montados a partir dos stores (índice do mundo, missões, mochila, level, guia, marcadores pessoais).
// Recalcula só quando algo muda; o desenho (Minimap.tsx) lê `mapMarkersStore` a cada quadro e filtra pelo explorado.
import { npcMarker } from "@lemonquest/shared";
import { worldIndexStore } from "../../game/worldIndex.ts";
import { guideDestStore } from "../hud/guideState.ts";
import { createStore, persistedJson, selectStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";
import { inventoryStore } from "../items/inventory.ts";
import { inventoryCounter, questStore } from "../quests/quests.ts";
import {
  MARKER_ORDER, guideMarkers, personalMarkers, portalMarkers, questMarkers, sanitizePersonal, serviceMarkers, togglePersonal,
  type MapMarker,
} from "./markers.ts";

type Pt = { x: number; y: number };

const saved = persistedJson<{ marks: Pt[] }>("mapMarks", { marks: [] });
/** Marcadores pessoais (clique direito no mapa-múndi), guardados no navegador. */
export const personalMarksStore = createStore<Pt[]>(sanitizePersonal(saved.get().marks));
personalMarksStore.subscribe((marks) => saved.set({ marks }));

export const togglePersonalMark = (x: number, y: number): void => personalMarksStore.set((l) => togglePersonal(l, x, y));

/** Todos os marcadores, já na ordem de desenho (sem o filtro de explorado). */
export const mapMarkersStore = createStore<MapMarker[]>([]);

const myLevel = selectStore(meStore, (me) => me?.level ?? null);

function rebuild() {
  const index = worldIndexStore.get();
  const st = questStore.get(), level = myLevel.get();
  const count = inventoryCounter();
  const list = [
    ...(index ? portalMarkers(index.portals) : []),
    ...(index ? serviceMarkers(index.npcs) : []),
    ...(index && st && level !== null ? questMarkers(index.npcs, (id) => npcMarker(id, st, level, count)) : []),
    ...guideMarkers(guideDestStore.get()),
    ...personalMarkers(personalMarksStore.get()),
  ];
  list.sort((a, b) => MARKER_ORDER.indexOf(a.kind) - MARKER_ORDER.indexOf(b.kind));
  mapMarkersStore.set(list);
}

for (const s of [worldIndexStore, questStore, inventoryStore, myLevel, guideDestStore, personalMarksStore]) s.subscribe(rebuild);
rebuild();
