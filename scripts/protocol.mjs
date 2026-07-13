import {
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

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

/**
 * Validate the version-one realtime envelope emitted by Spiritual Arts.
 * Invalid, oversized, and future-version messages are ignored by returning null.
 */
export function parseSpiritRollMessage(rawMessage) {
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
    !isRecord(message) ||
    message.protocolVersion !== PROTOCOL_VERSION ||
    typeof message.eventId !== "string" ||
    !UUID.test(message.eventId) ||
    message.type !== "spirit_die_roll" ||
    !isRecord(message.data)
  ) {
    return null;
  }

  const { character, roll } = message.data;
  if (!isRecord(character) || !isRecord(roll)) return null;

  const characterId = boundedString(character.id, { min: 1, max: 255 });
  const characterName = boundedString(character.name, {
    min: 1,
    max: 255,
    trim: true,
  });
  const characterPath = boundedString(character.path, {
    min: 1,
    max: 255,
    trim: true,
  });
  const portraitUrl =
    character.portraitUrl === null
      ? null
      : boundedString(character.portraitUrl, { min: 1, max: 2_048 });

  if (
    characterId === null ||
    characterName === null ||
    characterPath === null ||
    (portraitUrl === null && character.portraitUrl !== null) ||
    !Number.isInteger(character.level) ||
    character.level < 1 ||
    character.level > 20
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
  if (
    (roll.techniqueId !== null &&
      roll.techniqueId !== undefined &&
      techniqueId === null) ||
    (roll.techniqueName !== null &&
      roll.techniqueName !== undefined &&
      techniqueName === null)
  ) {
    return null;
  }

  const timestamp = boundedString(roll.timestamp, { min: 20, max: 30 });
  if (
    timestamp === null ||
    !ISO_TIMESTAMP.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp))
  ) {
    return null;
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    eventId: message.eventId,
    character: {
      id: characterId,
      name: characterName,
      path: characterPath,
      level: character.level,
      portraitUrl,
    },
    roll: {
      spInvestment: roll.spInvestment,
      dieSize: roll.dieSize,
      dieIndex: roll.dieIndex,
      value: roll.value,
      success: roll.success,
      techniqueId,
      techniqueName,
      timestamp,
    },
  };
}
