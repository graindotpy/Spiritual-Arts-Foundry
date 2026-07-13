import { MODULE_ID, SETTINGS } from "./constants.mjs";

function bridgeUserChoices() {
  const choices = {
    "": game.i18n.localize("SPIRITUAL_ARTS.Settings.BridgeUser.Disabled"),
  };

  for (const user of game.users?.contents ?? []) {
    choices[user.id] = user.name;
  }

  return choices;
}

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.BRIDGE_USER, {
    name: "SPIRITUAL_ARTS.Settings.BridgeUser.Name",
    hint: "SPIRITUAL_ARTS.Settings.BridgeUser.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "": "SPIRITUAL_ARTS.Settings.BridgeUser.Disabled",
    },
    default: "",
    requiresReload: true,
  });
}

export function refreshBridgeUserChoices() {
  const key = `${MODULE_ID}.${SETTINGS.BRIDGE_USER}`;
  const config = game.settings.settings.get(key);
  if (config) config.choices = bridgeUserChoices();
}

export function getBridgeUserId() {
  const value = game.settings.get(MODULE_ID, SETTINGS.BRIDGE_USER);
  return typeof value === "string" ? value : "";
}

export function isDesignatedBridgeUser() {
  const bridgeUserId = getBridgeUserId();
  return bridgeUserId !== "" && game.user?.id === bridgeUserId;
}
