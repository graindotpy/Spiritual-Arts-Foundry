import assert from "node:assert/strict";
import { test } from "node:test";
import { SpiritualArtsBridge } from "../scripts/bridge.mjs";
import { MODULE_ID } from "../scripts/constants.mjs";
import { parseFoundryActionMessage } from "../scripts/protocol.mjs";
import {
  serializedActionMessage,
  serializedAttackActionMessage,
  serializedSavingThrowActionMessage,
  serializedTemplateActionMessage,
  validInstrumentActionMessage,
} from "./fixtures.mjs";

function installGame({ currentUserId = "bridge-user" } = {}) {
  globalThis.game = {
    i18n: {
      lang: "en",
      localize: (key) => key,
      format: (key, data) => `${key}:${JSON.stringify(data)}`,
    },
    user: { id: currentUserId, name: "Bridge User" },
    settings: { get: () => "bridge-user" },
    messages: [],
  };
}

function installRollBoundary({ failCreationOnce = false } = {}) {
  const calls = { validate: 0, evaluate: 0, create: 0 };
  globalThis.Roll = class FakeRoll {
    static validate() {
      calls.validate += 1;
      return true;
    }

    async evaluate() {
      calls.evaluate += 1;
      return this;
    }

    async toMessage(data) {
      return { ...data, rolls: ["native-roll"] };
    }
  };
  globalThis.ChatMessage = {
    create: async (data, options) => {
      calls.create += 1;
      if (failCreationOnce && calls.create === 1) {
        throw new Error("temporary database failure");
      }

      const document = {
        data,
        options,
        getFlag: (scope, key) => data.flags?.[scope]?.[key],
      };
      game.messages.push(document);
      return document;
    },
  };
  return calls;
}

test("rechecks bridge-user designation before executing an action", async () => {
  installGame({ currentUserId: "other-user" });
  const calls = installRollBoundary();
  const bridge = new SpiritualArtsBridge();
  bridge.connection.onEvent(
    parseFoundryActionMessage(serializedActionMessage()),
  );
  await bridge.queue;

  assert.deepEqual(calls, { validate: 0, evaluate: 0, create: 0 });
  assert.equal(bridge.seen.size, 0);
});

test("routes save-only actions directly to ChatMessage creation", async () => {
  installGame();
  const calls = installRollBoundary();
  const event = parseFoundryActionMessage(serializedSavingThrowActionMessage());
  const bridge = new SpiritualArtsBridge();

  bridge.connection.onEvent(event);
  await bridge.queue;

  assert.deepEqual(calls, { validate: 0, evaluate: 0, create: 1 });
  assert.equal(bridge.seen.has(event.eventId), true);
  assert.equal(
    game.messages[0].getFlag(MODULE_ID, "actionKind"),
    "saving_throw",
  );
});

test("routes template-only actions directly to retryable ChatMessage creation", async (t) => {
  t.mock.method(console, "error", () => {});
  installGame();
  const calls = installRollBoundary({ failCreationOnce: true });
  const event = parseFoundryActionMessage(serializedTemplateActionMessage());
  const bridge = new SpiritualArtsBridge();

  bridge.connection.onEvent(event);
  await bridge.queue;
  assert.equal(bridge.seen.has(event.eventId), false);
  assert.equal(game.messages.length, 0);

  bridge.connection.onEvent(event);
  await bridge.queue;
  assert.equal(bridge.seen.has(event.eventId), true);
  assert.equal(game.messages.length, 1);
  assert.deepEqual(calls, { validate: 0, evaluate: 0, create: 2 });
  assert.equal(
    game.messages[0].getFlag(MODULE_ID, "actionKind"),
    "place_template",
  );
  assert.deepEqual(
    game.messages[0].getFlag(MODULE_ID, "template"),
    { type: "rectangle", distance: 20 },
  );
});

test("routes Spiritual Arts attacks through the native Roll boundary", async () => {
  installGame();
  const calls = installRollBoundary();
  const event = parseFoundryActionMessage(serializedAttackActionMessage());
  const bridge = new SpiritualArtsBridge();

  bridge.connection.onEvent(event);
  await bridge.queue;

  assert.deepEqual(calls, { validate: 1, evaluate: 1, create: 1 });
  assert.equal(bridge.seen.has(event.eventId), true);
  assert.equal(
    game.messages[0].getFlag(MODULE_ID, "actionKind"),
    "roll_attack",
  );
  assert.equal(
    game.messages[0].getFlag(MODULE_ID, "spiritualArtsAttackModifier"),
    7,
  );
});

test("routes every instrument mechanic through the existing Foundry action boundaries", async () => {
  const variants = [
    {
      action: structuredClone(validInstrumentActionMessage.data.action),
      rollCalls: 1,
    },
    {
      action: {
        id: "d109bc25-197a-4743-8eee-c72fa7868a50",
        kind: "roll_healing",
        formula: "1d6 + 2",
      },
      rollCalls: 1,
    },
    {
      action: {
        id: "67fd49b7-babb-4e97-bd22-7c3f319950c8",
        kind: "saving_throw",
        savingThrow: { ability: "con" },
      },
      rollCalls: 0,
    },
    {
      action: {
        id: "6ed5fc77-d0f2-4b45-91fd-f279791e7956",
        kind: "place_template",
        template: { type: "cone", distance: 15, angle: 90 },
      },
      rollCalls: 0,
    },
    {
      action: {
        id: "7906191b-3d0d-4e5e-bb6c-47eca84769a6",
        kind: "roll_attack",
      },
      attackModifier: 6,
      rollCalls: 1,
    },
  ];

  for (const variant of variants) {
    installGame();
    const calls = installRollBoundary();
    const message = structuredClone(validInstrumentActionMessage);
    message.data.action = variant.action;
    if (variant.attackModifier !== undefined) {
      message.data.character.spiritualArtsAttackModifier =
        variant.attackModifier;
    }
    const event = parseFoundryActionMessage(JSON.stringify(message));
    const bridge = new SpiritualArtsBridge();

    bridge.connection.onEvent(event);
    await bridge.queue;

    assert.deepEqual(calls, {
      validate: variant.rollCalls,
      evaluate: variant.rollCalls,
      create: 1,
    });
    assert.equal(bridge.seen.has(event.eventId), true);
    assert.equal(
      game.messages[0].getFlag(MODULE_ID, "sourceUseId"),
      validInstrumentActionMessage.data.sourceUseId,
    );
    assert.equal(
      game.messages[0].getFlag(MODULE_ID, "instrumentName"),
      "Singing Bowl",
    );
    assert.equal(
      game.messages[0].getFlag(MODULE_ID, "instrumentActionName"),
      "Resonant Blast",
    );
    assert.equal(
      game.messages[0].getFlag(MODULE_ID, "actionKind"),
      variant.action.kind,
    );
  }
});

test("suppresses in-memory duplicates and events found in message flags", async () => {
  installGame();
  const calls = installRollBoundary();
  const event = parseFoundryActionMessage(serializedActionMessage());
  const bridge = new SpiritualArtsBridge();

  bridge.connection.onEvent(event);
  bridge.connection.onEvent(event);
  await bridge.queue;
  assert.deepEqual(calls, { validate: 1, evaluate: 1, create: 1 });
  assert.equal(bridge.seen.has(event.eventId), true);

  const freshBridge = new SpiritualArtsBridge();
  freshBridge.connection.onEvent(event);
  await freshBridge.queue;
  assert.equal(calls.create, 1);
  assert.equal(freshBridge.seen.has(event.eventId), true);
  assert.equal(
    game.messages[0].getFlag(MODULE_ID, "eventId"),
    event.eventId,
  );
});

test("does not mark a failed creation processed and retries a redelivery", async (t) => {
  t.mock.method(console, "error", () => {});
  installGame();
  const calls = installRollBoundary({ failCreationOnce: true });
  const event = parseFoundryActionMessage(serializedActionMessage());
  const bridge = new SpiritualArtsBridge();

  bridge.connection.onEvent(event);
  await bridge.queue;
  assert.equal(bridge.seen.has(event.eventId), false);
  assert.equal(game.messages.length, 0);

  bridge.connection.onEvent(event);
  await bridge.queue;
  assert.equal(bridge.seen.has(event.eventId), true);
  assert.equal(game.messages.length, 1);
  assert.deepEqual(calls, { validate: 2, evaluate: 2, create: 2 });
});
