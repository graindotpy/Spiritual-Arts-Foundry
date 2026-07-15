import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_INVESTMENT_EFFECT_LENGTH,
  MAX_WEBSOCKET_MESSAGE_LENGTH,
} from "../scripts/constants.mjs";
import {
  DAMAGE_TYPES,
  FORMULA_LIMITS,
  isSafeRollFormula,
  parseFoundryActionMessage,
  parseRealtimeMessage,
  parseSpiritRollMessage,
} from "../scripts/protocol.mjs";
import {
  serializedActionMessage,
  serializedAttackActionMessage,
  serializedInstrumentActionMessage,
  serializedLegacyActionMessage,
  serializedMessage,
  serializedSavingThrowActionMessage,
  serializedTemplateActionMessage,
  validDamageActionMessage,
  validAttackActionMessage,
  validEnhancedDamageActionMessage,
  validInstrumentActionMessage,
  validMessage,
  validSavingThrowActionMessage,
  validTemplateActionMessage,
} from "./fixtures.mjs";

test("parses a version-one Spiritual Arts roll without changing its data", () => {
  const parsed = parseSpiritRollMessage(serializedMessage());

  assert.equal(parsed?.protocolVersion, 1);
  assert.equal(parsed?.type, "spirit_die_roll");
  assert.equal(parsed?.eventId, validMessage.eventId);
  assert.equal(parsed?.character.name, "Raan");
  assert.equal(parsed?.roll.techniqueName, "Devour Essence");
  assert.equal(
    parsed?.roll.investmentEffect,
    "Deal necrotic damage.\nThen regain Hit Points from the consumed essence.",
  );
  assert.equal(parsed?.roll.value, 6);
});

test("preserves legacy Spirit rolls that omit optional technique metadata", () => {
  const legacy = structuredClone(validMessage);
  delete legacy.data.roll.techniqueId;
  delete legacy.data.roll.techniqueName;
  delete legacy.data.roll.investmentEffect;

  const parsed = parseSpiritRollMessage(JSON.stringify(legacy));
  assert.equal(parsed?.type, "spirit_die_roll");
  assert.equal(parsed?.roll.techniqueId, null);
  assert.equal(parsed?.roll.techniqueName, null);
  assert.equal(parsed?.roll.investmentEffect, null);
});

test("trims and bounds optional investment effect descriptions", () => {
  const padded = structuredClone(validMessage);
  padded.data.roll.investmentEffect = "  Push the target 10 feet.  ";
  assert.equal(
    parseSpiritRollMessage(JSON.stringify(padded))?.roll.investmentEffect,
    "Push the target 10 feet.",
  );

  for (const investmentEffect of [
    "",
    "   ",
    42,
    "x".repeat(MAX_INVESTMENT_EFFECT_LENGTH + 1),
  ]) {
    const invalid = structuredClone(validMessage);
    invalid.data.roll.investmentEffect = investmentEffect;
    assert.equal(parseSpiritRollMessage(JSON.stringify(invalid)), null);
  }
});

test("parses valid damage and healing action requests as a discriminated union", () => {
  const damage = parseRealtimeMessage(serializedActionMessage());
  assert.equal(damage?.type, "foundry_action_request");
  assert.equal(damage?.action.kind, "roll_damage");
  assert.equal(damage?.action.damageType, "necrotic");
  assert.equal(damage?.sourceRollEventId, validMessage.eventId);

  const healingMessage = structuredClone(validDamageActionMessage);
  healingMessage.data.action = {
    id: "34109839-d482-4ef7-bde4-98ce40d330f2",
    kind: "roll_healing",
    formula: "3d8 + 5",
  };
  const healing = parseFoundryActionMessage(JSON.stringify(healingMessage));
  assert.equal(healing?.action.kind, "roll_healing");
  assert.equal(healing?.action.formula, "3d8 + 5");
  assert.equal(Object.hasOwn(healing.action, "damageType"), false);

  for (const damageType of DAMAGE_TYPES) {
    const message = structuredClone(validDamageActionMessage);
    message.data.action.damageType = damageType;
    assert.equal(
      parseFoundryActionMessage(JSON.stringify(message))?.action.damageType,
      damageType,
    );
  }
});

test("parses the strict instrument-action request variant for every Foundry action kind", () => {
  const damage = parseFoundryActionMessage(serializedInstrumentActionMessage());

  assert.equal(damage?.type, "foundry_action_request");
  assert.equal(damage?.sourceUseId, validInstrumentActionMessage.data.sourceUseId);
  assert.deepEqual(damage?.instrument, {
    id: validInstrumentActionMessage.data.instrument.id,
    name: "Singing Bowl",
  });
  assert.deepEqual(damage?.instrumentAction, {
    id: validInstrumentActionMessage.data.instrumentAction.id,
    name: "Resonant Blast",
  });
  assert.equal(damage?.action.kind, "roll_damage");
  assert.equal(Object.hasOwn(damage, "sourceRollEventId"), false);
  assert.equal(Object.hasOwn(damage, "technique"), false);
  assert.equal(Object.hasOwn(damage, "spInvestment"), false);

  const variants = [
    {
      id: "d109bc25-197a-4743-8eee-c72fa7868a50",
      kind: "roll_healing",
      formula: "1d6 + 2",
    },
    {
      id: "67fd49b7-babb-4e97-bd22-7c3f319950c8",
      kind: "saving_throw",
      savingThrow: { ability: "con" },
    },
    {
      id: "6ed5fc77-d0f2-4b45-91fd-f279791e7956",
      kind: "place_template",
      template: { type: "cone", distance: 15, angle: 90 },
    },
  ];

  for (const action of variants) {
    const message = structuredClone(validInstrumentActionMessage);
    message.data.action = action;
    assert.deepEqual(
      parseFoundryActionMessage(JSON.stringify(message))?.action,
      action,
    );
  }

  const attack = structuredClone(validInstrumentActionMessage);
  attack.data.character.spiritualArtsAttackModifier = 6;
  attack.data.action = {
    id: "7906191b-3d0d-4e5e-bb6c-47eca84769a6",
    kind: "roll_attack",
  };
  assert.equal(
    parseFoundryActionMessage(JSON.stringify(attack))?.character
      .spiritualArtsAttackModifier,
    6,
  );
});

test("rejects malformed or mixed instrument-action request provenance", () => {
  const cases = [];

  for (const [path, value] of [
    [["sourceUseId"], "not-a-uuid"],
    [["instrument", "id"], "not-a-uuid"],
    [["instrument", "name"], "   "],
    [["instrumentAction", "id"], "not-a-uuid"],
    [["instrumentAction", "name"], "x".repeat(256)],
  ]) {
    const message = structuredClone(validInstrumentActionMessage);
    let target = message.data;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = value;
    cases.push(message);
  }

  const mixedSource = structuredClone(validInstrumentActionMessage);
  mixedSource.data.technique = structuredClone(
    validDamageActionMessage.data.technique,
  );
  cases.push(mixedSource);

  const missingActionSource = structuredClone(validInstrumentActionMessage);
  delete missingActionSource.data.instrumentAction;
  cases.push(missingActionSource);

  for (const message of cases) {
    assert.equal(parseFoundryActionMessage(JSON.stringify(message)), null);
  }
});

test("parses a save-only action without a formula or damage type", () => {
  const savingThrow = parseFoundryActionMessage(
    serializedSavingThrowActionMessage(),
  );

  assert.equal(savingThrow?.action.kind, "saving_throw");
  assert.equal(savingThrow?.action.label, "Resist the push");
  assert.deepEqual(savingThrow?.action.savingThrow, { ability: "str" });
  assert.deepEqual(savingThrow?.action.template, {
    type: "cone",
    distance: 15,
    angle: 90,
  });
  assert.equal(Object.hasOwn(savingThrow.action, "formula"), false);
  assert.equal(Object.hasOwn(savingThrow.action, "damageType"), false);

  const withoutTemplate = structuredClone(validSavingThrowActionMessage);
  delete withoutTemplate.data.action.label;
  delete withoutTemplate.data.action.template;
  assert.deepEqual(
    parseFoundryActionMessage(JSON.stringify(withoutTemplate))?.action,
    {
      id: withoutTemplate.data.action.id,
      kind: "saving_throw",
      savingThrow: { ability: "str" },
    },
  );
});

test("parses a template-only action without dice or a saving throw", () => {
  const templateAction = parseFoundryActionMessage(
    serializedTemplateActionMessage(),
  );

  assert.equal(templateAction?.action.kind, "place_template");
  assert.equal(templateAction?.action.label, "Create difficult terrain");
  assert.deepEqual(templateAction?.action.template, {
    type: "rectangle",
    distance: 20,
  });
  assert.equal(Object.hasOwn(templateAction.action, "formula"), false);
  assert.equal(Object.hasOwn(templateAction.action, "damageType"), false);
  assert.equal(Object.hasOwn(templateAction.action, "savingThrow"), false);
  assert.equal(
    Object.hasOwn(validTemplateActionMessage.data.character, "spiritualArtsDc"),
    false,
  );
  assert.equal(templateAction.character.spiritualArtsDc, null);

  const withoutLabel = structuredClone(validTemplateActionMessage);
  delete withoutLabel.data.action.label;
  assert.deepEqual(
    parseFoundryActionMessage(JSON.stringify(withoutLabel))?.action,
    {
      id: withoutLabel.data.action.id,
      kind: "place_template",
      template: { type: "rectangle", distance: 20 },
    },
  );
});

test("parses strict Spiritual Arts attack actions and their derived modifiers", () => {
  const attack = parseFoundryActionMessage(serializedAttackActionMessage());

  assert.equal(attack?.action.kind, "roll_attack");
  assert.equal(attack?.action.label, "Seeking strike");
  assert.equal(attack?.character.spiritualArtsAttackModifier, 7);
  assert.equal(Object.hasOwn(attack.action, "formula"), false);
  assert.equal(Object.hasOwn(attack.action, "damageType"), false);

  for (const modifier of [-3, 0, 16, null]) {
    const message = structuredClone(validAttackActionMessage);
    message.data.character.spiritualArtsAttackModifier = modifier;
    assert.equal(
      parseFoundryActionMessage(JSON.stringify(message))?.character
        .spiritualArtsAttackModifier,
      modifier,
    );
  }
});

test("rejects misplaced, missing, malformed, or mechanically enhanced attack actions", () => {
  const cases = [];

  const missingModifier = structuredClone(validAttackActionMessage);
  delete missingModifier.data.character.spiritualArtsAttackModifier;
  cases.push(missingModifier);

  for (const modifier of [-4, 17, 7.5, "7"]) {
    const invalidModifier = structuredClone(validAttackActionMessage);
    invalidModifier.data.character.spiritualArtsAttackModifier = modifier;
    cases.push(invalidModifier);
  }

  const misplacedModifier = structuredClone(validDamageActionMessage);
  misplacedModifier.data.character.spiritualArtsAttackModifier = 7;
  cases.push(misplacedModifier);

  for (const [field, value] of [
    ["formula", "1d20 + 7"],
    ["damageType", "force"],
    ["savingThrow", { ability: "dex" }],
    ["template", { type: "circle", distance: 20 }],
  ]) {
    const enhancedAttack = structuredClone(validAttackActionMessage);
    enhancedAttack.data.action[field] = value;
    cases.push(enhancedAttack);
  }

  for (const message of cases) {
    assert.equal(parseFoundryActionMessage(JSON.stringify(message)), null);
  }
});

test("parses bounded saving throws and all measured template shapes", () => {
  const enhanced = parseFoundryActionMessage(
    JSON.stringify(validEnhancedDamageActionMessage),
  );
  assert.equal(enhanced?.character.spiritualArtsDc, 16);
  assert.deepEqual(enhanced?.action.savingThrow, { ability: "dex" });
  assert.deepEqual(enhanced?.action.template, {
    type: "circle",
    distance: 20,
  });

  const templates = [
    { type: "circle", distance: 0.5 },
    { type: "cone", distance: 30, angle: 53.13 },
    { type: "rectangle", distance: 15.5 },
    { type: "ray", distance: 1000, width: 5 },
  ];
  for (const template of templates) {
    const message = structuredClone(validEnhancedDamageActionMessage);
    message.data.action.template = template;
    assert.deepEqual(
      parseFoundryActionMessage(JSON.stringify(message))?.action.template,
      template,
    );
  }

  const unavailableDc = structuredClone(validEnhancedDamageActionMessage);
  unavailableDc.data.character.spiritualArtsDc = null;
  assert.equal(
    parseFoundryActionMessage(JSON.stringify(unavailableDc))?.character
      .spiritualArtsDc,
    null,
  );
});

test("accepts legacy action characters without a Spiritual Arts DC", () => {
  const legacy = parseFoundryActionMessage(serializedLegacyActionMessage());
  assert.equal(legacy?.type, "foundry_action_request");
  assert.equal(legacy?.character.spiritualArtsDc, null);
});

test("rejects unversioned, future-version, invalid-ID, and unknown envelopes", () => {
  const unversioned = structuredClone(validMessage);
  delete unversioned.protocolVersion;
  assert.equal(parseRealtimeMessage(JSON.stringify(unversioned)), null);
  assert.equal(
    parseRealtimeMessage(serializedMessage({ protocolVersion: 2 })),
    null,
  );
  assert.equal(
    parseRealtimeMessage(serializedMessage({ eventId: "not-a-uuid" })),
    null,
  );
  assert.equal(
    parseRealtimeMessage(serializedMessage({ type: "future_event" })),
    null,
  );

  const unknownField = structuredClone(validDamageActionMessage);
  unknownField.data.action.macro = "game.dice3d";
  assert.equal(parseRealtimeMessage(JSON.stringify(unknownField)), null);
});

test("rejects malformed, oversized, and internally inconsistent Spirit Die rolls", () => {
  assert.equal(parseRealtimeMessage("{"), null);
  assert.equal(
    parseRealtimeMessage("x".repeat(MAX_WEBSOCKET_MESSAGE_LENGTH + 1)),
    null,
  );

  const inconsistent = structuredClone(validMessage);
  inconsistent.data.roll.success = false;
  assert.equal(parseRealtimeMessage(JSON.stringify(inconsistent)), null);

  const extraCharacterField = structuredClone(validMessage);
  extraCharacterField.data.character.actorId = "not-supported";
  assert.equal(parseRealtimeMessage(JSON.stringify(extraCharacterField)), null);

  const actionOnlyDc = structuredClone(validMessage);
  actionOnlyDc.data.character.spiritualArtsDc = 16;
  assert.equal(parseRealtimeMessage(JSON.stringify(actionOnlyDc)), null);
});

test("accepts only the bounded phase-one formula grammar", () => {
  for (const formula of [
    "2d8 + 4",
    "1D6+1d4",
    "3d10 - 2",
    "0",
    "100d1000",
    " 1d6 + 2 ",
  ]) {
    assert.equal(isSafeRollFormula(formula), true, formula);
  }

  for (const formula of [
    "",
    "-2 + 1d6",
    "+1d6",
    "1d6++2",
    "1 d 6",
    "1d1",
    "101d6",
    "51d6 + 50d6",
    "1d1001",
    "1000001",
    "1d6 * 2",
    "(1d6 + 2)",
    "1d6kh",
    "1d6[fire]",
    "@mod + 1d6",
    "Math.max(1, 2)",
    "game.macros.getName('x').execute()",
    "[[/r 1d6]]",
    "1d6; alert(1)",
    "1d6 +",
    "1d6".padEnd(FORMULA_LIMITS.MAX_LENGTH + 1, " "),
  ]) {
    assert.equal(isSafeRollFormula(formula), false, formula);
  }

  const tooManyTerms = Array.from(
    { length: FORMULA_LIMITS.MAX_TERMS + 1 },
    () => "0",
  ).join("+");
  assert.equal(isSafeRollFormula(tooManyTerms), false);
});

test("rejects invalid action kinds, damage typing, labels, and nested fields", () => {
  const cases = [];

  const unknownKind = structuredClone(validDamageActionMessage);
  unknownKind.data.action.kind = "run_macro";
  cases.push(unknownKind);

  const missingDamageType = structuredClone(validDamageActionMessage);
  delete missingDamageType.data.action.damageType;
  cases.push(missingDamageType);

  const invalidDamageType = structuredClone(validDamageActionMessage);
  invalidDamageType.data.action.damageType = "untyped";
  cases.push(invalidDamageType);

  const healingDamageType = structuredClone(validDamageActionMessage);
  healingDamageType.data.action.kind = "roll_healing";
  cases.push(healingDamageType);

  const savingThrowFormula = structuredClone(validSavingThrowActionMessage);
  savingThrowFormula.data.action.formula = "1d20";
  cases.push(savingThrowFormula);

  const savingThrowDamageType = structuredClone(validSavingThrowActionMessage);
  savingThrowDamageType.data.action.damageType = "force";
  cases.push(savingThrowDamageType);

  const savingThrowWithoutSave = structuredClone(validSavingThrowActionMessage);
  delete savingThrowWithoutSave.data.action.savingThrow;
  cases.push(savingThrowWithoutSave);

  const templateActionWithoutTemplate = structuredClone(
    validTemplateActionMessage,
  );
  delete templateActionWithoutTemplate.data.action.template;
  cases.push(templateActionWithoutTemplate);

  for (const [field, value] of [
    ["formula", "1d20"],
    ["damageType", "force"],
    ["savingThrow", { ability: "wis" }],
  ]) {
    const mechanicallyEnhancedTemplate = structuredClone(
      validTemplateActionMessage,
    );
    mechanicallyEnhancedTemplate.data.action[field] = value;
    cases.push(mechanicallyEnhancedTemplate);
  }

  const unsafeFormula = structuredClone(validDamageActionMessage);
  unsafeFormula.data.action.formula = "@abilities.str.mod + 1d8";
  cases.push(unsafeFormula);

  const emptyLabel = structuredClone(validDamageActionMessage);
  emptyLabel.data.action.label = "   ";
  cases.push(emptyLabel);

  const longLabel = structuredClone(validDamageActionMessage);
  longLabel.data.action.label = "x".repeat(256);
  cases.push(longLabel);

  const longFormula = structuredClone(validDamageActionMessage);
  longFormula.data.action.formula = "1".repeat(201);
  cases.push(longFormula);

  const extraTechniqueField = structuredClone(validDamageActionMessage);
  extraTechniqueField.data.technique.actorUuid = "Actor.fake";
  cases.push(extraTechniqueField);

  const longTechniqueName = structuredClone(validDamageActionMessage);
  longTechniqueName.data.technique.name = "x".repeat(256);
  cases.push(longTechniqueName);

  const invalidTimestamp = structuredClone(validDamageActionMessage);
  invalidTimestamp.data.requestedAt = "now";
  cases.push(invalidTimestamp);

  const invalidSourceId = structuredClone(validDamageActionMessage);
  invalidSourceId.data.sourceRollEventId = "not-a-uuid";
  cases.push(invalidSourceId);

  const invalidLevel = structuredClone(validDamageActionMessage);
  invalidLevel.data.character.level = 21;
  cases.push(invalidLevel);

  const invalidSp = structuredClone(validDamageActionMessage);
  invalidSp.data.spInvestment = 101;
  cases.push(invalidSp);

  const extraDataField = structuredClone(validDamageActionMessage);
  extraDataField.data.macro = "forbidden";
  cases.push(extraDataField);

  for (const spiritualArtsDc of [0, 101, 12.5, "16"]) {
    const invalidDc = structuredClone(validDamageActionMessage);
    invalidDc.data.character.spiritualArtsDc = spiritualArtsDc;
    cases.push(invalidDc);
  }

  for (const ability of ["", "Dex", "dexterity", "save"]) {
    const invalidSave = structuredClone(validDamageActionMessage);
    invalidSave.data.action.savingThrow = { ability };
    cases.push(invalidSave);
  }

  const extraSaveField = structuredClone(validDamageActionMessage);
  extraSaveField.data.action.savingThrow = { ability: "dex", dc: 16 };
  cases.push(extraSaveField);

  for (const template of [
    { type: "sphere", distance: 20 },
    { type: "circle", distance: 0 },
    { type: "circle", distance: 1000.1 },
    { type: "circle", distance: Number.NaN },
    { type: "cone", distance: 30 },
    { type: "cone", distance: 30, angle: 360.1 },
    { type: "rectangle", distance: 20, width: 10 },
    { type: "ray", distance: 60 },
    { type: "ray", distance: 60, width: 0 },
  ]) {
    const invalidTemplate = structuredClone(validDamageActionMessage);
    invalidTemplate.data.action.template = template;
    cases.push(invalidTemplate);
  }

  for (const actionEvent of cases) {
    assert.equal(
      parseFoundryActionMessage(JSON.stringify(actionEvent)),
      null,
      JSON.stringify(actionEvent.data.action),
    );
  }
});
