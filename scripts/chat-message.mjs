import {
  MODULE_ID,
  ROLL_TEMPLATE,
  WEBSITE_ORIGIN,
} from "./constants.mjs";

function localize(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

function displayTime(timestamp) {
  return new Intl.DateTimeFormat(game.i18n.lang, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function portraitUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value, WEBSITE_ORIGIN);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function buildRollMessageContext(event) {
  return {
    characterName: event.character.name,
    characterPath: event.character.path,
    characterLevel: event.character.level,
    portraitUrl: portraitUrl(event.character.portraitUrl),
    techniqueName:
      event.roll.techniqueName ??
      localize("SPIRITUAL_ARTS.Chat.TechniqueFallback", {
        sp: event.roll.spInvestment,
      }),
    dieSize: event.roll.dieSize.toUpperCase(),
    value: event.roll.value,
    spInvestment: localize("SPIRITUAL_ARTS.Chat.SpInvestment", {
      sp: event.roll.spInvestment,
    }),
    outcome: localize(
      event.roll.success
        ? "SPIRITUAL_ARTS.Chat.Success"
        : "SPIRITUAL_ARTS.Chat.Failure",
    ),
    outcomeClass: event.roll.success ? "is-success" : "is-failure",
    rolledAt: localize("SPIRITUAL_ARTS.Chat.RolledAt", {
      time: displayTime(event.roll.timestamp),
    }),
    source: localize("SPIRITUAL_ARTS.Chat.Source"),
  };
}

export function chatMessageIdForEvent(eventId) {
  return eventId.replaceAll("-", "").slice(0, 16);
}

export async function createRollChatMessage(event) {
  const content = await renderTemplate(
    ROLL_TEMPLATE,
    buildRollMessageContext(event),
  );

  return ChatMessage.create(
    {
      _id: chatMessageIdForEvent(event.eventId),
      user: game.user.id,
      speaker: { alias: game.user.name },
      flavor: localize("SPIRITUAL_ARTS.Chat.Source"),
      content,
      flags: {
        [MODULE_ID]: {
          eventId: event.eventId,
          protocolVersion: event.protocolVersion,
        },
      },
    },
    { keepId: true },
  );
}
