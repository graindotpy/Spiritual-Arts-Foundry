import { SpiritualArtsBridge } from "./bridge.mjs";
import {
  refreshBridgeUserChoices,
  registerSettings,
} from "./settings.mjs";
import { registerTemplateChatHooks } from "./template-placement.mjs";

let bridge = null;

Hooks.once("init", () => {
  registerSettings();
  registerTemplateChatHooks();
});

Hooks.once("ready", () => {
  refreshBridgeUserChoices();
  bridge = new SpiritualArtsBridge();
  bridge.start();
});

globalThis.addEventListener("beforeunload", () => {
  bridge?.stop();
});
