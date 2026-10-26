import Phaser from "phaser";
import { render } from "preact";
import { WorldScene } from "./scenes/WorldScene.ts";
import { VOID_COLOR } from "./game/worldMap.ts";
import { App } from "./ui/App.tsx";
import { GAME_NAME } from "@lemonquest/shared";
import { loading } from "./ui/loading.ts";
import "./ui/attention.ts";
import "./ui/a11y/a11y.css";
import "./ui/a11y/a11y.ts";

document.title = GAME_NAME;
loading.init(); // overlay #boot já está pintado pelo index.html; aqui ele passa a mostrar progresso real

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  pixelArt: true,
  backgroundColor: VOID_COLOR, // a cor do vazio do mapa: as células de vazio não viram Tile no Phaser (worldMap.ts)
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [WorldScene],
});

render(<App />, document.getElementById("ui")!);
