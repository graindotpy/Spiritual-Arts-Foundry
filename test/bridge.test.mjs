import assert from "node:assert/strict";
import { test } from "node:test";
import { SpiritualArtsBridge } from "../scripts/bridge.mjs";
import { MODULE_ID } from "../scripts/constants.mjs";
import { parseFoundryActionMessage } from "../scripts/protocol.mjs";
import { serializedActionMessage } from "./fixtures.mjs";

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
