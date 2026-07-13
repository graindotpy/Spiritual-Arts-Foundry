import { SpiritualArtsBridge } from "./bridge.mjs";
import {
  refreshBridgeUserChoices,
  registerSettings,
} from "./settings.mjs";

let bridge = null;

Hooks.once("init", registerSettings);

Hooks.once("ready", () => {
  refreshBridgeUserChoices();
  bridge = new SpiritualArtsBridge();
  bridge.start();
});

globalThis.addEventListener("beforeunload", () => {
  bridge?.stop();
});
