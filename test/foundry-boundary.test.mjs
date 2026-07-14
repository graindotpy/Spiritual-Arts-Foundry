import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildActionFlavor,
  buildRollMessageContext,
  chatMessageIdForEvent,
  createActionChatMessage,
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
  validAttackActionMessage,
  validEnhancedDamageActionMessage,
  validSavingThrowActionMessage,
  validTemplateActionMessage,
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
  assert.equal(
    context.investmentEffect,
    "Deal necrotic damage.\nThen regain Hit Points from the consumed essence.",
  );
  assert.equal(
    context.investmentEffectLabel,
    'SPIRITUAL_ARTS.Chat.InvestmentEffect:{"sp":2}',
  );

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
  assert.equal(calls[0].context.investmentEffect, context.investmentEffect);
});

test("keeps the investment effect collapsed and Handlebars-escaped", () => {
  const template = readFileSync(
    new URL("../templates/roll-message.hbs", import.meta.url),
    "utf8",
  );

  assert.match(template, /<details class="spiritual-arts-roll__investment">/);
  assert.doesNotMatch(
    template,
    /<details class="spiritual-arts-roll__investment"[^>]*\sopen(?:\s|>|=)/,
  );
  assert.match(template, /\{\{investmentEffect\}\}/);
  assert.doesNotMatch(template, /\{\{\{investmentEffect\}\}\}/);
});

test("evaluates and creates an action as a native Foundry v12 roll message", async () => {
  installGame();
  const actionMessage = structuredClone(validEnhancedDamageActionMessage);
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
    spiritualArtsDc: 16,
    savingThrow: { ability: "dex" },
    template: { type: "circle", distance: 20 },
  });
  assert.deepEqual(created.options, { keepId: true });
  assert.match(created.data.flavor, /Necrotic/);
  assert.doesNotMatch(created.data.flavor, /<script>/);
  assert.doesNotMatch(created.data.flavor, /<b>damage/);
  assert.match(created.data.flavor, /&lt;script&gt;/);
  assert.match(created.data.flavor, /SavingThrow/);
  assert.match(created.data.flavor, /16/);
  assert.match(created.data.flavor, /place-spiritual-arts-template/);
  assert.equal(buildActionFlavor(event), created.data.flavor);
});

test("creates a save-only action card without using Foundry's Roll API", async () => {
  installGame();
  const actionMessage = structuredClone(validSavingThrowActionMessage);
  delete actionMessage.data.action.label;
  const event = parseFoundryActionMessage(JSON.stringify(actionMessage));
  const calls = [];

  globalThis.Roll = class UnexpectedRoll {
    static validate() {
      calls.push("validate");
      return true;
    }

    constructor() {
      calls.push("construct");
    }
  };
  globalThis.ChatMessage = {
    create: async (data, options) => {
      calls.push("create");
      return { data, options };
    },
  };

  const created = await createActionChatMessage(event);

  assert.deepEqual(calls, ["create"]);
  assert.equal(created.data._id, chatMessageIdForEvent(event.eventId));
  assert.equal(created.data.author, "bridge-user");
  assert.deepEqual(created.data.speaker, { alias: "Bridge User" });
  assert.equal(created.data.flavor, "SPIRITUAL_ARTS.Chat.Source");
  assert.equal(Object.hasOwn(created.data, "rolls"), false);
  assert.match(created.data.content, /SavingThrowAction/);
  assert.match(created.data.content, /SavingThrow/);
  assert.match(created.data.content, /16/);
  assert.match(created.data.content, /place-spiritual-arts-template/);
  assert.deepEqual(created.data.flags["spiritual-arts-foundry"], {
    eventId: event.eventId,
    protocolVersion: 1,
    sourceRollEventId: event.sourceRollEventId,
    actionId: event.action.id,
    actionKind: "saving_throw",
    spiritualArtsDc: 16,
    savingThrow: { ability: "str" },
    template: { type: "cone", distance: 15, angle: 90 },
  });
  assert.deepEqual(created.options, { keepId: true });
});

test("creates a template-only action card without a roll or save", async () => {
  installGame();
  const event = parseFoundryActionMessage(
    JSON.stringify(validTemplateActionMessage),
  );
  const calls = [];

  globalThis.Roll = class UnexpectedRoll {
    static validate() {
      calls.push("validate");
      return true;
    }

    constructor() {
      calls.push("construct");
    }
  };
  globalThis.ChatMessage = {
    create: async (data, options) => {
      calls.push("create");
      return { data, options };
    },
  };

  const created = await createActionChatMessage(event);

  assert.deepEqual(calls, ["create"]);
  assert.equal(created.data._id, chatMessageIdForEvent(event.eventId));
  assert.equal(Object.hasOwn(created.data, "rolls"), false);
  assert.equal(
    Object.hasOwn(validTemplateActionMessage.data.character, "spiritualArtsDc"),
    false,
  );
  assert.match(created.data.content, /Create difficult terrain/);
  assert.match(created.data.content, /place-spiritual-arts-template/);
  assert.doesNotMatch(created.data.content, /SavingThrow/);
  assert.doesNotMatch(created.data.content, /action-save/);
  assert.deepEqual(created.data.flags["spiritual-arts-foundry"], {
    eventId: event.eventId,
    protocolVersion: 1,
    sourceRollEventId: event.sourceRollEventId,
    actionId: event.action.id,
    actionKind: "place_template",
    template: { type: "rectangle", distance: 20 },
  });
  assert.deepEqual(created.options, { keepId: true });

  const unlabeledMessage = structuredClone(validTemplateActionMessage);
  delete unlabeledMessage.data.action.label;
  const unlabeledEvent = parseFoundryActionMessage(
    JSON.stringify(unlabeledMessage),
  );
  assert.match(
    buildActionFlavor(unlabeledEvent),
    /SPIRITUAL_ARTS\.Chat\.MeasuredTemplateAction/,
  );
});

test("derives and evaluates Spiritual Arts attacks as native Foundry rolls", async () => {
  installGame();

  const labeledEvent = parseFoundryActionMessage(
    JSON.stringify(validAttackActionMessage),
  );
  const labeledFlavor = buildActionFlavor(labeledEvent);
  assert.match(labeledFlavor, /Seeking strike/);
  assert.equal(labeledFlavor.match(/AttackRoll/g)?.length, 1);

  for (const [modifier, expectedFormula] of [
    [7, "1d20 + 7"],
    [0, "1d20"],
    [-3, "1d20 - 3"],
  ]) {
    const actionMessage = structuredClone(validAttackActionMessage);
    actionMessage.data.character.spiritualArtsAttackModifier = modifier;
    delete actionMessage.data.action.label;
    const event = parseFoundryActionMessage(JSON.stringify(actionMessage));
    const calls = [];

    globalThis.Roll = class FakeAttackRoll {
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
        return { rolls: ["native-attack"] };
      }
    };
    globalThis.ChatMessage = {
      create: async (data, options) => {
        calls.push({ boundary: "create", data, options });
        return { data, options };
      },
    };

    const created = await createActionChatMessage(event);

    assert.deepEqual(
      calls.map((call) => call.boundary),
      ["validate", "construct", "evaluate", "toMessage", "create"],
    );
    assert.equal(calls[0].formula, expectedFormula);
    assert.equal(calls[1].formula, expectedFormula);
    assert.deepEqual(calls[1].data, {});
    assert.match(created.data.flavor, /AttackRoll/);
    assert.equal(created.data.flavor.match(/AttackRoll/g)?.length, 1);
    assert.deepEqual(created.data.rolls, ["native-attack"]);
    assert.deepEqual(created.data.flags["spiritual-arts-foundry"], {
      eventId: event.eventId,
      protocolVersion: 1,
      sourceRollEventId: event.sourceRollEventId,
      actionId: event.action.id,
      actionKind: "roll_attack",
      spiritualArtsAttackModifier: modifier,
    });
  }
});

test("creates an informational attack card when its modifier is unavailable", async () => {
  installGame();
  const actionMessage = structuredClone(validAttackActionMessage);
  actionMessage.data.character.spiritualArtsAttackModifier = null;
  delete actionMessage.data.action.label;
  const event = parseFoundryActionMessage(JSON.stringify(actionMessage));
  const calls = [];

  globalThis.Roll = class UnexpectedRoll {
    static validate() {
      calls.push("validate");
      return true;
    }

    constructor() {
      calls.push("construct");
    }
  };
  globalThis.ChatMessage = {
    create: async (data, options) => {
      calls.push("create");
      return { data, options };
    },
  };

  const created = await createActionChatMessage(event);

  assert.deepEqual(calls, ["create"]);
  assert.equal(created.data._id, chatMessageIdForEvent(event.eventId));
  assert.equal(created.data.author, "bridge-user");
  assert.deepEqual(created.data.speaker, { alias: "Bridge User" });
  assert.equal(created.data.flavor, "SPIRITUAL_ARTS.Chat.Source");
  assert.equal(Object.hasOwn(created.data, "rolls"), false);
  assert.match(created.data.content, /AttackRoll/);
  assert.match(created.data.content, /AttackModifierUnavailable/);
  assert.deepEqual(created.data.flags["spiritual-arts-foundry"], {
    eventId: event.eventId,
    protocolVersion: 1,
    sourceRollEventId: event.sourceRollEventId,
    actionId: event.action.id,
    actionKind: "roll_attack",
    spiritualArtsAttackModifier: null,
  });
  assert.deepEqual(created.options, { keepId: true });
});

test("renders an unavailable DC when a configured save has a null or omitted character DC", () => {
  installGame();
  for (const omitDc of [false, true]) {
    const actionMessage = structuredClone(validEnhancedDamageActionMessage);
    if (omitDc) delete actionMessage.data.character.spiritualArtsDc;
    else actionMessage.data.character.spiritualArtsDc = null;
    const event = parseFoundryActionMessage(JSON.stringify(actionMessage));
    const flavor = buildActionFlavor(event);

    assert.match(flavor, /SavingThrowUnavailable/);
    assert.doesNotMatch(flavor, /\"dc\"/);
  }
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
