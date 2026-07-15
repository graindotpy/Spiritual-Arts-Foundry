import {
  MAX_INVESTMENT_EFFECT_LENGTH,
  MAX_WEBSOCKET_MESSAGE_LENGTH,
  PROTOCOL_VERSION,
} from "./constants.mjs";

const DIE_MAXIMUMS = Object.freeze({
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
});

export const DAMAGE_TYPES = Object.freeze([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);

export const SAVING_THROW_ABILITIES = Object.freeze([
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
]);

export const MEASURED_TEMPLATE_TYPES = Object.freeze([
  "circle",
  "cone",
  "rectangle",
  "ray",
]);

export const FORMULA_LIMITS = Object.freeze({
  MAX_LENGTH: 200,
  MAX_TERMS: 50,
  MAX_DICE_PER_TERM: 100,
  MAX_TOTAL_DICE: 100,
  MAX_DIE_FACES: 1_000,
  MAX_INTEGER_CONSTANT: 1_000_000,
});

const DAMAGE_TYPE_SET = new Set(DAMAGE_TYPES);
const SAVING_THROW_ABILITY_SET = new Set(SAVING_THROW_ABILITIES);
const MEASURED_TEMPLATE_TYPE_SET = new Set(MEASURED_TEMPLATE_TYPES);
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMULA =
  /^(?:\d+[dD]\d+|\d+)(?:\s*[+-]\s*(?:\d+[dD]\d+|\d+))*$/;
const DICE_TERM = /^(\d+)[dD](\d+)$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function boundedString(value, { min = 0, max, trim = false }) {
  if (typeof value !== "string") return null;
  const normalized = trim ? value.trim() : value;
  if (normalized.length < min || normalized.length > max) return null;
  return normalized;
}

function nullableString(value, max) {
  if (value === null || value === undefined) return null;
  return boundedString(value, { min: 1, max, trim: true });
}

function isValidNullableString(source, parsed) {
  return source === null || source === undefined
    ? parsed === null
    : parsed !== null;
}

function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

function parseTimestamp(value) {
  const timestamp = boundedString(value, { min: 20, max: 30 });
  return timestamp !== null &&
    ISO_TIMESTAMP.test(timestamp) &&
    Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : null;
}

function parseCharacter(
  character,
  {
    allowSpiritualArtsDc = false,
    requireSpiritualArtsAttackModifier = false,
  } = {},
) {
  const required = ["id", "name", "path", "level", "portraitUrl"];
  if (requireSpiritualArtsAttackModifier) {
    required.push("spiritualArtsAttackModifier");
  }
  const optional = allowSpiritualArtsDc ? ["spiritualArtsDc"] : [];
  if (!hasExactKeys(character, required, optional)) {
    return null;
  }

  const id = boundedString(character.id, { min: 1, max: 255 });
  const name = boundedString(character.name, {
    min: 1,
    max: 255,
    trim: true,
  });
  const path = boundedString(character.path, {
    min: 1,
    max: 255,
    trim: true,
  });
  const portraitUrl =
    character.portraitUrl === null
      ? null
      : boundedString(character.portraitUrl, { min: 1, max: 2_048 });

  if (
    id === null ||
    name === null ||
    path === null ||
    (portraitUrl === null && character.portraitUrl !== null) ||
    !Number.isInteger(character.level) ||
    character.level < 1 ||
    character.level > 20 ||
    (allowSpiritualArtsDc &&
      Object.hasOwn(character, "spiritualArtsDc") &&
      character.spiritualArtsDc !== null &&
      (!Number.isInteger(character.spiritualArtsDc) ||
        character.spiritualArtsDc < 1 ||
        character.spiritualArtsDc > 100)) ||
    (requireSpiritualArtsAttackModifier &&
      character.spiritualArtsAttackModifier !== null &&
      (!Number.isInteger(character.spiritualArtsAttackModifier) ||
        character.spiritualArtsAttackModifier < -3 ||
        character.spiritualArtsAttackModifier > 16))
  ) {
    return null;
  }

  return {
    id,
    name,
    path,
    level: character.level,
    portraitUrl,
    ...(allowSpiritualArtsDc
      ? { spiritualArtsDc: character.spiritualArtsDc ?? null }
      : {}),
    ...(requireSpiritualArtsAttackModifier
      ? { spiritualArtsAttackModifier: character.spiritualArtsAttackModifier }
      : {}),
  };
}

/**
 * Return the trimmed formula when it matches the deliberately small phase-one
 * grammar, otherwise return null. This validator is intentionally independent
 * of Foundry's broader Roll grammar.
 */
export function parseSafeRollFormula(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > FORMULA_LIMITS.MAX_LENGTH
  ) {
    return null;
  }
  const formula = boundedString(value, {
    min: 1,
    max: FORMULA_LIMITS.MAX_LENGTH,
    trim: true,
  });
  if (formula === null || !FORMULA.test(formula)) return null;

  const terms = formula.split(/\s*[+-]\s*/);
  if (terms.length > FORMULA_LIMITS.MAX_TERMS) return null;

  let totalDice = 0;
  for (const term of terms) {
    const dice = DICE_TERM.exec(term);
    if (dice) {
      const count = Number(dice[1]);
      const faces = Number(dice[2]);
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > FORMULA_LIMITS.MAX_DICE_PER_TERM ||
        !Number.isSafeInteger(faces) ||
        faces < 2 ||
        faces > FORMULA_LIMITS.MAX_DIE_FACES
      ) {
        return null;
      }
      totalDice += count;
      if (totalDice > FORMULA_LIMITS.MAX_TOTAL_DICE) return null;
      continue;
    }

    const constant = Number(term);
    if (
      !Number.isSafeInteger(constant) ||
      constant < 0 ||
      constant > FORMULA_LIMITS.MAX_INTEGER_CONSTANT
    ) {
      return null;
    }
  }

  return formula;
}

export function isSafeRollFormula(value) {
  return parseSafeRollFormula(value) !== null;
}

function parseSpiritRollData(data) {
  if (!hasExactKeys(data, ["character", "roll"])) return null;
  const character = parseCharacter(data.character);
  const { roll } = data;
  if (
    character === null ||
    !hasExactKeys(
      roll,
      [
        "spInvestment",
        "dieSize",
        "dieIndex",
        "value",
        "success",
        "timestamp",
      ],
      ["techniqueId", "techniqueName", "investmentEffect"],
    )
  ) {
    return null;
  }

  const dieMaximum = DIE_MAXIMUMS[roll.dieSize];
  if (
    dieMaximum === undefined ||
    !Number.isInteger(roll.spInvestment) ||
    roll.spInvestment < 1 ||
    roll.spInvestment > dieMaximum ||
    !Number.isInteger(roll.dieIndex) ||
    roll.dieIndex < 0 ||
    roll.dieIndex > 19 ||
    !Number.isInteger(roll.value) ||
    roll.value < 1 ||
    roll.value > dieMaximum ||
    typeof roll.success !== "boolean" ||
    roll.success !== (roll.value >= roll.spInvestment)
  ) {
    return null;
  }

  const techniqueId = nullableString(roll.techniqueId, 255);
  const techniqueName = nullableString(roll.techniqueName, 255);
  const investmentEffect = nullableString(
    roll.investmentEffect,
    MAX_INVESTMENT_EFFECT_LENGTH,
  );
  const timestamp = parseTimestamp(roll.timestamp);
  if (
    !isValidNullableString(roll.techniqueId, techniqueId) ||
    !isValidNullableString(roll.techniqueName, techniqueName) ||
    !isValidNullableString(roll.investmentEffect, investmentEffect) ||
    timestamp === null
  ) {
    return null;
  }

  return {
    character,
    roll: {
      spInvestment: roll.spInvestment,
      dieSize: roll.dieSize,
      dieIndex: roll.dieIndex,
      value: roll.value,
      success: roll.success,
      techniqueId,
      techniqueName,
      investmentEffect,
      timestamp,
    },
  };
}

function parseSavingThrow(value) {
  if (
    !hasExactKeys(value, ["ability"]) ||
    !SAVING_THROW_ABILITY_SET.has(value.ability)
  ) {
    return null;
  }
  return { ability: value.ability };
}

function isBoundedPositiveNumber(value, maximum) {
  return Number.isFinite(value) && value > 0 && value <= maximum;
}

export function parseMeasuredTemplate(value) {
  if (
    !isRecord(value) ||
    !MEASURED_TEMPLATE_TYPE_SET.has(value.type)
  ) {
    return null;
  }

  if (value.type === "cone") {
    if (
      !hasExactKeys(value, ["type", "distance", "angle"]) ||
      !isBoundedPositiveNumber(value.distance, 1_000) ||
      !isBoundedPositiveNumber(value.angle, 360)
    ) {
      return null;
    }
    return { type: value.type, distance: value.distance, angle: value.angle };
  }

  if (value.type === "ray") {
    if (
      !hasExactKeys(value, ["type", "distance", "width"]) ||
      !isBoundedPositiveNumber(value.distance, 1_000) ||
      !isBoundedPositiveNumber(value.width, 1_000)
    ) {
      return null;
    }
    return { type: value.type, distance: value.distance, width: value.width };
  }

  if (
    !hasExactKeys(value, ["type", "distance"]) ||
    !isBoundedPositiveNumber(value.distance, 1_000)
  ) {
    return null;
  }
  return { type: value.type, distance: value.distance };
}

function parseAction(action) {
  if (!isRecord(action)) return null;

  const required = ["id", "kind"];
  const optional = ["label"];
  if (action.kind === "roll_damage") {
    required.push("formula", "damageType");
    optional.push("savingThrow", "template");
  } else if (action.kind === "roll_healing") {
    required.push("formula");
    optional.push("savingThrow", "template");
  } else if (action.kind === "saving_throw") {
    required.push("savingThrow");
    optional.push("template");
  } else if (action.kind === "place_template") {
    required.push("template");
  } else if (action.kind !== "roll_attack") {
    return null;
  }

  if (!hasExactKeys(action, required, optional)) return null;

  const formula = Object.hasOwn(action, "formula")
    ? parseSafeRollFormula(action.formula)
    : undefined;
  const label = Object.hasOwn(action, "label")
    ? boundedString(action.label, { min: 1, max: 255, trim: true })
    : undefined;
  const savingThrow = Object.hasOwn(action, "savingThrow")
    ? parseSavingThrow(action.savingThrow)
    : undefined;
  const template = Object.hasOwn(action, "template")
    ? parseMeasuredTemplate(action.template)
    : undefined;
  if (
    !isUuid(action.id) ||
    (Object.hasOwn(action, "formula") && formula === null) ||
    (Object.hasOwn(action, "label") && label === null) ||
    (Object.hasOwn(action, "savingThrow") && savingThrow === null) ||
    (Object.hasOwn(action, "template") && template === null)
  ) {
    return null;
  }

  const optionalFields = {
    ...(label === undefined ? {} : { label }),
    ...(savingThrow === undefined ? {} : { savingThrow }),
    ...(template === undefined ? {} : { template }),
  };

  if (
    action.kind === "saving_throw" ||
    action.kind === "roll_attack" ||
    action.kind === "place_template"
  ) {
    return {
      id: action.id,
      kind: action.kind,
      ...optionalFields,
    };
  }

  if (action.kind === "roll_damage") {
    if (!DAMAGE_TYPE_SET.has(action.damageType)) return null;
    return {
      id: action.id,
      kind: action.kind,
      formula,
      damageType: action.damageType,
      ...optionalFields,
    };
  }

  return {
    id: action.id,
    kind: action.kind,
    formula,
    ...optionalFields,
  };
}

function parseTechniqueActionData(data) {
  const requestedAt = parseTimestamp(data.requestedAt);
  const action = parseAction(data.action);
  const character = parseCharacter(data.character, {
    allowSpiritualArtsDc: true,
    requireSpiritualArtsAttackModifier: action?.kind === "roll_attack",
  });
  const techniqueName = isRecord(data.technique)
    ? boundedString(data.technique.name, { min: 1, max: 255, trim: true })
    : null;

  if (
    requestedAt === null ||
    !isUuid(data.sourceRollEventId) ||
    character === null ||
    !hasExactKeys(data.technique, ["id", "name"]) ||
    !isUuid(data.technique.id) ||
    techniqueName === null ||
    !Number.isInteger(data.spInvestment) ||
    data.spInvestment < 1 ||
    data.spInvestment > 100 ||
    action === null
  ) {
    return null;
  }

  return {
    requestedAt,
    sourceRollEventId: data.sourceRollEventId,
    character,
    technique: { id: data.technique.id, name: techniqueName },
    spInvestment: data.spInvestment,
    action,
  };
}

function parseInstrumentActionData(data) {
  const requestedAt = parseTimestamp(data.requestedAt);
  const action = parseAction(data.action);
  const character = parseCharacter(data.character, {
    allowSpiritualArtsDc: true,
    requireSpiritualArtsAttackModifier: action?.kind === "roll_attack",
  });
  const instrumentName = isRecord(data.instrument)
    ? boundedString(data.instrument.name, { min: 1, max: 255, trim: true })
    : null;
  const instrumentActionName = isRecord(data.instrumentAction)
    ? boundedString(data.instrumentAction.name, {
        min: 1,
        max: 255,
        trim: true,
      })
    : null;

  if (
    requestedAt === null ||
    !isUuid(data.sourceUseId) ||
    character === null ||
    !hasExactKeys(data.instrument, ["id", "name"]) ||
    !isUuid(data.instrument.id) ||
    instrumentName === null ||
    !hasExactKeys(data.instrumentAction, ["id", "name"]) ||
    !isUuid(data.instrumentAction.id) ||
    instrumentActionName === null ||
    action === null
  ) {
    return null;
  }

  return {
    requestedAt,
    sourceUseId: data.sourceUseId,
    character,
    instrument: { id: data.instrument.id, name: instrumentName },
    instrumentAction: {
      id: data.instrumentAction.id,
      name: instrumentActionName,
    },
    action,
  };
}

function parseFoundryActionData(data) {
  if (
    hasExactKeys(data, [
      "requestedAt",
      "sourceRollEventId",
      "character",
      "technique",
      "spInvestment",
      "action",
    ])
  ) {
    return parseTechniqueActionData(data);
  }

  if (
    hasExactKeys(data, [
      "requestedAt",
      "sourceUseId",
      "character",
      "instrument",
      "instrumentAction",
      "action",
    ])
  ) {
    return parseInstrumentActionData(data);
  }

  return null;
}

/**
 * Parse the version-one realtime protocol as a discriminated event union.
 * Invalid, oversized, malformed, and future-version messages return null.
 */
export function parseRealtimeMessage(rawMessage) {
  if (
    typeof rawMessage !== "string" ||
    rawMessage.length === 0 ||
    rawMessage.length > MAX_WEBSOCKET_MESSAGE_LENGTH
  ) {
    return null;
  }

  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  if (
    !hasExactKeys(message, ["protocolVersion", "eventId", "type", "data"]) ||
    message.protocolVersion !== PROTOCOL_VERSION ||
    !isUuid(message.eventId)
  ) {
    return null;
  }

  if (message.type === "spirit_die_roll") {
    const data = parseSpiritRollData(message.data);
    return data === null
      ? null
      : {
          protocolVersion: PROTOCOL_VERSION,
          eventId: message.eventId,
          type: message.type,
          ...data,
        };
  }

  if (message.type === "foundry_action_request") {
    const data = parseFoundryActionData(message.data);
    return data === null
      ? null
      : {
          protocolVersion: PROTOCOL_VERSION,
          eventId: message.eventId,
          type: message.type,
          ...data,
        };
  }

  return null;
}

/** Preserve the original roll-only parser API for existing integrations/tests. */
export function parseSpiritRollMessage(rawMessage) {
  const event = parseRealtimeMessage(rawMessage);
  return event?.type === "spirit_die_roll" ? event : null;
}

export function parseFoundryActionMessage(rawMessage) {
  const event = parseRealtimeMessage(rawMessage);
  return event?.type === "foundry_action_request" ? event : null;
}
