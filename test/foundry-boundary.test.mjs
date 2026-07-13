import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRollMessageContext,
  chatMessageIdForEvent,
  createRollChatMessage,
} from "../scripts/chat-message.mjs";
import {
  getBridgeUserId,
  isDesignatedBridgeUser,
  refreshBridgeUserChoices,
  registerSettings,
} from "../scripts/settings.mjs";
import { parseSpiritRollMessage } from "../scripts/protocol.mjs";
import { serializedMessage } from "./fixtures.mjs";

function installGame({ selectedUserId = "bridge-user" } = {}) {
  let registration;
  const settings = new Map();
  globalThis.game = {
    i18n: {
      lang: "en",
      localize: (key) => key,
      format: (key, data) => `${key}:${JSON.stringify(data)}`,
    },
    user: { id: "bridge-user", name: "Bridge User" },
    users: {
      contents: [
        { id: "bridge-user", name: "Bridge User" },
        { id: "other-user", name: "Other User" },
      ],
    },
    settings: {
      get: () => selectedUserId,
      register: (_moduleId, _key, config) => {
        registration = config;
        settings.set("spiritual-arts-foundry.bridgeUser", config);
      },
      settings,
    },
  };
  return () => registration;
}

test("registers a world setting with a disabled choice and Foundry users", () => {
  const registration = installGame();
  registerSettings();
  refreshBridgeUserChoices();

  assert.equal(registration().scope, "world");
  assert.equal(registration().requiresReload, true);
  assert.equal(registration().choices[""], "SPIRITUAL_ARTS.Settings.BridgeUser.Disabled");
  assert.equal(registration().choices["bridge-user"], "Bridge User");
});

test("enables the bridge only for the selected user", () => {
  installGame();
  assert.equal(getBridgeUserId(), "bridge-user");
  assert.equal(isDesignatedBridgeUser(), true);

  game.user = { id: "other-user", name: "Other User" };
  assert.equal(isDesignatedBridgeUser(), false);
});

test("creates a generic chat message authored by the designated user", async () => {
  installGame();
  const event = parseSpiritRollMessage(serializedMessage());
  const calls = [];
  globalThis.renderTemplate = async (template, context) => {
    calls.push({ template, context });
    return "<article>Rendered roll</article>";
  };
  globalThis.ChatMessage = {
    create: async (data, options) => ({ data, options }),
  };

  const context = buildRollMessageContext(event);
  assert.equal(context.characterName, "Raan");
  assert.equal(context.value, 6);

  const created = await createRollChatMessage(event);
  assert.equal(created.data._id, chatMessageIdForEvent(event.eventId));
  assert.equal(created.data._id.length, 16);
  assert.equal(created.data.user, "bridge-user");
  assert.deepEqual(created.data.speaker, { alias: "Bridge User" });
  assert.equal(
    created.data.flags["spiritual-arts-foundry"].eventId,
    event.eventId,
  );
  assert.deepEqual(created.options, { keepId: true });
  assert.equal(calls.length, 1);
});
