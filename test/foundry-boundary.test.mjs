import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildActionFlavor,
  buildRollMessageContext,
  chatMessageIdForEvent,
  createActionRollChatMessage,
  createRollChatMessage,
} from "../scripts/chat-message.mjs";
import {
  getBridgeUserId,
  isDesignatedBridgeUser,
  refreshBridgeUserChoices,
  registerSettings,
} from "../scripts/settings.mjs";
import {
  parseFoundryActionMessage,
  parseSpiritRollMessage,
} from "../scripts/protocol.mjs";
import {
  serializedActionMessage,
  serializedMessage,
  validDamageActionMessage,
} from "./fixtures.mjs";

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
  assert.equal(created.data.author, "bridge-user");
  assert.deepEqual(created.data.speaker, { alias: "Bridge User" });
  assert.equal(
    created.data.flags["spiritual-arts-foundry"].eventId,
    event.eventId,
  );
  assert.deepEqual(created.options, { keepId: true });
  assert.equal(calls.length, 1);
});

test("evaluates and creates an action as a native Foundry v12 roll message", async () => {
  installGame();
  const actionMessage = structuredClone(validDamageActionMessage);
  actionMessage.data.character.name = "Raan <script>alert(1)</script>";
  actionMessage.data.action.label = "Essence <b>damage</b>";
  const event = parseFoundryActionMessage(JSON.stringify(actionMessage));
  const calls = [];

  globalThis.Roll = class FakeRoll {
    static validate(formula) {
      calls.push({ boundary: "validate", formula });
      return true;
    }

    constructor(formula, data) {
      calls.push({ boundary: "construct", formula, data });
    }

    async evaluate(options) {
      calls.push({ boundary: "evaluate", options });
      return this;
    }

    async toMessage(data, options) {
      calls.push({ boundary: "toMessage", data, options });
      return {
        author: "untrusted-user",
        rolls: ["native-roll-data"],
        flags: { existing: { retained: true } },
      };
    }
  };
  globalThis.ChatMessage = {
    create: async (data, options) => {
      calls.push({ boundary: "create", data, options });
      return { data, options };
    },
  };

  const created = await createActionRollChatMessage(event);
  assert.deepEqual(
    calls.map((call) => call.boundary),
    ["validate", "construct", "evaluate", "toMessage", "create"],
  );
  assert.deepEqual(calls[2].options, { allowInteractive: false });
  assert.deepEqual(calls[3].options, { create: false });
  assert.equal(created.data._id, chatMessageIdForEvent(event.eventId));
  assert.equal(created.data.author, "bridge-user");
  assert.deepEqual(created.data.speaker, { alias: "Bridge User" });
  assert.deepEqual(created.data.rolls, ["native-roll-data"]);
  assert.equal(created.data.flags.existing.retained, true);
  assert.deepEqual(created.data.flags["spiritual-arts-foundry"], {
    eventId: event.eventId,
    protocolVersion: 1,
    sourceRollEventId: event.sourceRollEventId,
    actionId: event.action.id,
    actionKind: "roll_damage",
    damageType: "necrotic",
  });
  assert.deepEqual(created.options, { keepId: true });
  assert.match(created.data.flavor, /Necrotic/);
  assert.doesNotMatch(created.data.flavor, /<script>/);
  assert.doesNotMatch(created.data.flavor, /<b>damage/);
  assert.match(created.data.flavor, /&lt;script&gt;/);
  assert.equal(buildActionFlavor(event), created.data.flavor);
});

test("requires Foundry's Roll validator in addition to protocol validation", async () => {
  installGame();
  const event = parseFoundryActionMessage(serializedActionMessage());
  let constructed = false;
  globalThis.Roll = class FakeRoll {
    static validate() {
      return false;
    }

    constructor() {
      constructed = true;
    }
  };

  await assert.rejects(
    createActionRollChatMessage(event),
    /invalid Foundry action roll formula/,
  );
  assert.equal(constructed, false);
});
