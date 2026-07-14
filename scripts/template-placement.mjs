import { MODULE_ID } from "./constants.mjs";
import { parseMeasuredTemplate } from "./protocol.mjs";

export const PLACE_TEMPLATE_ACTION = "place-spiritual-arts-template";

function hasMeasuredTemplatePermission() {
  return Boolean(game.user?.can?.("TEMPLATE_CREATE"));
}

/**
 * Convert validated website units into Foundry v12 MeasuredTemplate data.
 * Rectangle distance is the square's side length on the website, whereas
 * Foundry represents a rectangle by the length and direction of its diagonal.
 */
export function buildMeasuredTemplateData(template, { messageId } = {}) {
  const parsed = parseMeasuredTemplate(template);
  if (parsed === null) {
    throw new Error("Rejected invalid measured template configuration");
  }

  const data = {
    t: parsed.type === "rectangle" ? "rect" : parsed.type,
    user: game.user.id,
    x: 0,
    y: 0,
    distance: parsed.distance,
    direction: 0,
    fillColor: game.user.color,
    flags: {
      [MODULE_ID]: {
        ...(messageId ? { messageId } : {}),
      },
    },
  };

  if (parsed.type === "cone") data.angle = parsed.angle;
  if (parsed.type === "ray") data.width = parsed.width;
  if (parsed.type === "rectangle") {
    data.distance = Math.hypot(parsed.distance, parsed.distance);
    data.direction = 45;
  }

  return data;
}

/**
 * Enter dnd5e's standard template preview workflow for the clicking user.
 * The preview resolves by creating a plain MeasuredTemplate embedded document;
 * it has no targeting, damage, save, or effect automation attached.
 */
export async function placeMeasuredTemplate(template, { messageId } = {}) {
  if (!game.canvas?.ready || !game.canvas.scene) {
    throw new Error(
      game.i18n.localize("SPIRITUAL_ARTS.Chat.TemplateRequiresScene"),
    );
  }
  if (!game.user?.can?.("TEMPLATE_CREATE")) {
    throw new Error(
      game.i18n.localize("SPIRITUAL_ARTS.Chat.TemplatePermissionDenied"),
    );
  }

  const AbilityTemplate =
    game.dnd5e?.canvas?.AbilityTemplate ??
    globalThis.dnd5e?.canvas?.AbilityTemplate;
  const DocumentClass = CONFIG.MeasuredTemplate?.documentClass;
  if (!AbilityTemplate || !DocumentClass) {
    throw new Error(
      game.i18n.localize("SPIRITUAL_ARTS.Chat.TemplateUnavailable"),
    );
  }

  const document = new DocumentClass(
    buildMeasuredTemplateData(template, { messageId }),
    { parent: game.canvas.scene },
  );
  const preview = new AbilityTemplate(document);
  return preview.drawPreview();
}

function reportPlacementError(error) {
  Hooks.onError(`${MODULE_ID}.placeMeasuredTemplate`, error, {
    msg: game.i18n.localize("SPIRITUAL_ARTS.Chat.TemplatePlacementFailed"),
    log: "error",
    notify: "error",
  });
}

/** Attach the template action in one rendered Spiritual Arts roll message. */
export function activateTemplateChatListeners(message, html) {
  const template = message.getFlag(MODULE_ID, "template");
  if (parseMeasuredTemplate(template) === null) return;

  const buttons = html.find(
    `[data-action="${PLACE_TEMPLATE_ACTION}"]`,
  );
  // Canvas readiness changes as users switch scenes, while chat messages may
  // remain mounted. Only permission is stable enough to snapshot at render;
  // placeMeasuredTemplate rechecks the active canvas on every click.
  buttons.prop("disabled", !hasMeasuredTemplatePermission());
  buttons.on("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await placeMeasuredTemplate(template, { messageId: message.id });
    } catch (error) {
      // dnd5e rejects without an error when the user cancels with right-click.
      if (error) reportPlacementError(error);
    } finally {
      button.disabled = !hasMeasuredTemplatePermission();
    }
  });
}

export function registerTemplateChatHooks() {
  Hooks.on("renderChatMessage", activateTemplateChatListeners);
}
