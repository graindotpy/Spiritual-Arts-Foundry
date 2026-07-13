import {
  MODULE_ID,
  ROLL_TEMPLATE,
  WEBSITE_ORIGIN,
} from "./constants.mjs";
import { parseSafeRollFormula } from "./protocol.mjs";

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleCase(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function buildActionFlavor(event) {
  const isDamage = event.action.kind === "roll_damage";
  const actionLabel =
    event.action.label ??
    localize(
      isDamage
        ? "SPIRITUAL_ARTS.Chat.DamageRoll"
        : "SPIRITUAL_ARTS.Chat.HealingRoll",
    );
  const rollType = isDamage
    ? localize("SPIRITUAL_ARTS.Chat.DamageType", {
        type: titleCase(event.action.damageType),
      })
    : localize("SPIRITUAL_ARTS.Chat.Healing");

  return [
    '<div class="spiritual-arts-action-flavor">',
    `<strong>${escapeHtml(actionLabel)}</strong>`,
    `<span>${escapeHtml(event.character.name)} &middot; ${escapeHtml(event.technique.name)}</span>`,
    `<span>${escapeHtml(rollType)}</span>`,
    "</div>",
  ].join("");
}

export async function createRollChatMessage(event) {
  const content = await renderTemplate(
    ROLL_TEMPLATE,
    buildRollMessageContext(event),
  );

  const created = await ChatMessage.create(
    {
      _id: chatMessageIdForEvent(event.eventId),
      author: game.user.id,
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
  if (!created) throw new Error("Foundry did not create the Spirit Die message");
  return created;
}

/**
 * Execute one independently validated website request through Foundry Core.
 * The narrow grammar check is repeated here at the execution boundary, followed
 * by Foundry's own Roll validator before any Roll instance is constructed.
 */
export async function createActionRollChatMessage(event) {
  const formula = parseSafeRollFormula(event.action.formula);
  if (formula === null || !Roll.validate(formula)) {
    throw new Error("Rejected invalid Foundry action roll formula");
  }

  const roll = new Roll(formula, {});
  const evaluated = await roll.evaluate({ allowInteractive: false });
  const flavor = buildActionFlavor(event);
  const prepared = await evaluated.toMessage(
    {
      author: game.user.id,
      speaker: { alias: game.user.name },
      flavor,
    },
    { create: false },
  );

  if (
    prepared === null ||
    typeof prepared !== "object" ||
    Array.isArray(prepared)
  ) {
    throw new Error("Foundry did not prepare native roll message data");
  }

  const created = await ChatMessage.create(
    {
      ...prepared,
      _id: chatMessageIdForEvent(event.eventId),
      author: game.user.id,
      speaker: { alias: game.user.name },
      flavor,
      flags: {
        ...(prepared.flags ?? {}),
        [MODULE_ID]: {
          eventId: event.eventId,
          protocolVersion: event.protocolVersion,
          sourceRollEventId: event.sourceRollEventId,
          actionId: event.action.id,
          actionKind: event.action.kind,
          ...(event.action.kind === "roll_damage"
            ? { damageType: event.action.damageType }
            : {}),
        },
      },
    },
    { keepId: true },
  );
  if (!created) throw new Error("Foundry did not create the action roll message");
  return created;
}
