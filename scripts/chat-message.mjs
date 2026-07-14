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
    investmentEffect: event.roll.investmentEffect,
    investmentEffectLabel: event.roll.investmentEffect
      ? localize("SPIRITUAL_ARTS.Chat.InvestmentEffect", {
          sp: event.roll.spInvestment,
        })
      : null,
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

function savingThrowHtml(event) {
  if (!event.action.savingThrow) return "";
  const dcUnavailable =
    event.character.spiritualArtsDc === null ||
    event.character.spiritualArtsDc === undefined;
  const ability = localize(
    `SPIRITUAL_ARTS.Chat.Ability.${event.action.savingThrow.ability}`,
  );
  const label = localize(
    dcUnavailable
      ? "SPIRITUAL_ARTS.Chat.SavingThrowUnavailable"
      : "SPIRITUAL_ARTS.Chat.SavingThrow",
    {
      ability,
      ...(dcUnavailable
        ? {}
        : { dc: event.character.spiritualArtsDc }),
    },
  );
  return [
    '<div class="spiritual-arts-action-save">',
    '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>',
    `<span>${escapeHtml(label)}</span>`,
    "</div>",
  ].join("");
}

function measuredTemplateButtonHtml(event) {
  if (!event.action.template) return "";
  const label = localize("SPIRITUAL_ARTS.Chat.PlaceMeasuredTemplate");
  return [
    '<button type="button" class="spiritual-arts-place-template" ',
    'data-action="place-spiritual-arts-template">',
    '<i class="fa-solid fa-bullseye" aria-hidden="true"></i>',
    `<span>${escapeHtml(label)}</span>`,
    "</button>",
  ].join("");
}

export function buildActionFlavor(event) {
  const isDamage = event.action.kind === "roll_damage";
  const isHealing = event.action.kind === "roll_healing";
  const isAttack = event.action.kind === "roll_attack";
  const isTemplate = event.action.kind === "place_template";
  const actionLabel =
    event.action.label ??
    localize(
      isDamage
        ? "SPIRITUAL_ARTS.Chat.DamageRoll"
        : isHealing
          ? "SPIRITUAL_ARTS.Chat.HealingRoll"
          : isAttack
            ? "SPIRITUAL_ARTS.Chat.AttackRoll"
            : isTemplate
              ? "SPIRITUAL_ARTS.Chat.MeasuredTemplateAction"
              : "SPIRITUAL_ARTS.Chat.SavingThrowAction",
    );
  const rollType = isDamage
    ? localize("SPIRITUAL_ARTS.Chat.DamageType", {
        type: titleCase(event.action.damageType),
      })
    : isHealing
      ? localize("SPIRITUAL_ARTS.Chat.Healing")
      : isAttack &&
          (event.character.spiritualArtsAttackModifier === null ||
            event.character.spiritualArtsAttackModifier === undefined)
        ? localize("SPIRITUAL_ARTS.Chat.AttackModifierUnavailable")
      : null;
  const attackType =
    isAttack && event.action.label
      ? localize("SPIRITUAL_ARTS.Chat.AttackRoll")
      : null;
  const savingThrow = savingThrowHtml(event);
  const measuredTemplateButton = measuredTemplateButtonHtml(event);

  return [
    '<div class="spiritual-arts-action-flavor">',
    `<strong>${escapeHtml(actionLabel)}</strong>`,
    `<span>${escapeHtml(event.character.name)} &middot; ${escapeHtml(event.technique.name)}</span>`,
    attackType === null ? "" : `<span>${escapeHtml(attackType)}</span>`,
    rollType === null ? "" : `<span>${escapeHtml(rollType)}</span>`,
    savingThrow || measuredTemplateButton
      ? `<div class="spiritual-arts-action-controls">${savingThrow}${measuredTemplateButton}</div>`
      : "",
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

function actionMessageFlags(event, existingFlags = {}) {
  return {
    ...existingFlags,
    [MODULE_ID]: {
      eventId: event.eventId,
      protocolVersion: event.protocolVersion,
      sourceRollEventId: event.sourceRollEventId,
      actionId: event.action.id,
      actionKind: event.action.kind,
      ...(event.action.kind === "roll_damage"
        ? { damageType: event.action.damageType }
        : {}),
      ...(event.action.kind === "roll_attack"
        ? {
            spiritualArtsAttackModifier:
              event.character.spiritualArtsAttackModifier,
          }
        : {}),
      ...(event.action.savingThrow
        ? {
            spiritualArtsDc: event.character.spiritualArtsDc,
            savingThrow: event.action.savingThrow,
          }
        : {}),
      ...(event.action.template ? { template: event.action.template } : {}),
    },
  };
}

/** Create an informational action card without constructing or evaluating a Roll. */
export async function createSavingThrowChatMessage(event) {
  if (event.action.kind !== "saving_throw" || !event.action.savingThrow) {
    throw new Error("Rejected invalid save-only Foundry action");
  }

  const created = await ChatMessage.create(
    {
      _id: chatMessageIdForEvent(event.eventId),
      author: game.user.id,
      speaker: { alias: game.user.name },
      flavor: localize("SPIRITUAL_ARTS.Chat.Source"),
      content: buildActionFlavor(event),
      flags: actionMessageFlags(event),
    },
    { keepId: true },
  );
  if (!created) throw new Error("Foundry did not create the save action message");
  return created;
}

/** Create an informational template card without constructing or evaluating a Roll. */
export async function createTemplateChatMessage(event) {
  if (event.action.kind !== "place_template" || !event.action.template) {
    throw new Error("Rejected invalid template-only Foundry action");
  }

  const created = await ChatMessage.create(
    {
      _id: chatMessageIdForEvent(event.eventId),
      author: game.user.id,
      speaker: { alias: game.user.name },
      flavor: localize("SPIRITUAL_ARTS.Chat.Source"),
      content: buildActionFlavor(event),
      flags: actionMessageFlags(event),
    },
    { keepId: true },
  );
  if (!created) {
    throw new Error("Foundry did not create the template action message");
  }
  return created;
}

/** Create an informational card when the website could not derive an attack modifier. */
export async function createUnavailableAttackChatMessage(event) {
  if (
    event.action.kind !== "roll_attack" ||
    (event.character.spiritualArtsAttackModifier !== null &&
      event.character.spiritualArtsAttackModifier !== undefined)
  ) {
    throw new Error("Rejected invalid unavailable attack action");
  }

  const created = await ChatMessage.create(
    {
      _id: chatMessageIdForEvent(event.eventId),
      author: game.user.id,
      speaker: { alias: game.user.name },
      flavor: localize("SPIRITUAL_ARTS.Chat.Source"),
      content: buildActionFlavor(event),
      flags: actionMessageFlags(event),
    },
    { keepId: true },
  );
  if (!created) {
    throw new Error("Foundry did not create the unavailable attack message");
  }
  return created;
}

function actionRollFormula(event) {
  if (event.action.kind !== "roll_attack") {
    return parseSafeRollFormula(event.action.formula);
  }

  const modifier = event.character.spiritualArtsAttackModifier;
  if (!Number.isInteger(modifier) || modifier < -3 || modifier > 16) {
    return null;
  }
  if (modifier > 0) return `1d20 + ${modifier}`;
  if (modifier < 0) return `1d20 - ${Math.abs(modifier)}`;
  return "1d20";
}

/**
 * Execute one independently validated website request through Foundry Core.
 * The narrow grammar check is repeated here at the execution boundary, followed
 * by Foundry's own Roll validator before any Roll instance is constructed.
 */
export async function createActionRollChatMessage(event) {
  const formula = actionRollFormula(event);
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
      flags: actionMessageFlags(event, prepared.flags),
    },
    { keepId: true },
  );
  if (!created) throw new Error("Foundry did not create the action roll message");
  return created;
}

/** Route each validated action to its native-roll or informational boundary. */
export async function createActionChatMessage(event) {
  if (event.action.kind === "saving_throw") {
    return createSavingThrowChatMessage(event);
  }
  if (event.action.kind === "place_template") {
    return createTemplateChatMessage(event);
  }
  if (event.action.kind === "roll_attack") {
    return event.character.spiritualArtsAttackModifier === null ||
      event.character.spiritualArtsAttackModifier === undefined
      ? createUnavailableAttackChatMessage(event)
      : createActionRollChatMessage(event);
  }
  if (
    event.action.kind === "roll_damage" ||
    event.action.kind === "roll_healing"
  ) {
    return createActionRollChatMessage(event);
  }
  throw new Error("Rejected unsupported Foundry action kind");
}
