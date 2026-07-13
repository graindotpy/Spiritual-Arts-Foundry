export const MODULE_ID = "spiritual-arts-foundry";

export const SETTINGS = Object.freeze({
  BRIDGE_USER: "bridgeUser",
});

export const WEBSITE_ORIGIN = "https://spiritualarts.grainserver.co.uk/";
export const WEBSOCKET_URL = "wss://spiritualarts.grainserver.co.uk/ws";
export const ROLL_TEMPLATE =
  "modules/spiritual-arts-foundry/templates/roll-message.hbs";

export const PROTOCOL_VERSION = 1;
export const MAX_WEBSOCKET_MESSAGE_LENGTH = 64 * 1024;
export const MAX_SEEN_EVENT_IDS = 500;

export const RECONNECT = Object.freeze({
  INITIAL_DELAY_MS: 1_000,
  MAX_DELAY_MS: 30_000,
  JITTER_MS: 500,
});
