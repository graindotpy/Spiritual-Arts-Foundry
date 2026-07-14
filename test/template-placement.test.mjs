import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PLACE_TEMPLATE_ACTION,
  activateTemplateChatListeners,
  buildMeasuredTemplateData,
  placeMeasuredTemplate,
} from "../scripts/template-placement.mjs";

function installFoundryGlobals() {
  const scene = { id: "scene-1" };
  globalThis.game = {
    canvas: { ready: true, scene },
    dnd5e: { canvas: {} },
    i18n: { localize: (key) => key },
    user: {
      id: "placing-user",
      color: "#4f6b5f",
      can: (permission) => permission === "TEMPLATE_CREATE",
    },
  };
  globalThis.CONFIG = { MeasuredTemplate: {} };
  globalThis.Hooks = { onError: () => {} };
  return scene;
}

test("maps every website shape to bounded Foundry v12 template data", () => {
  installFoundryGlobals();

  const circle = buildMeasuredTemplateData(
    { type: "circle", distance: 20 },
    { messageId: "message-1" },
  );
  assert.deepEqual(circle, {
    t: "circle",
    user: "placing-user",
    x: 0,
    y: 0,
    distance: 20,
    direction: 0,
    fillColor: "#4f6b5f",
    flags: {
      "spiritual-arts-foundry": { messageId: "message-1" },
    },
  });

  const cone = buildMeasuredTemplateData({
    type: "cone",
    distance: 30,
    angle: 53.13,
  });
  assert.equal(cone.t, "cone");
  assert.equal(cone.distance, 30);
  assert.equal(cone.angle, 53.13);

  const ray = buildMeasuredTemplateData({
    type: "ray",
    distance: 60,
    width: 5,
  });
  assert.equal(ray.t, "ray");
  assert.equal(ray.distance, 60);
  assert.equal(ray.width, 5);

  const rectangle = buildMeasuredTemplateData({
    type: "rectangle",
    distance: 20,
  });
  assert.equal(rectangle.t, "rect");
  assert.equal(rectangle.distance, Math.hypot(20, 20));
  assert.equal(rectangle.direction, 45);
});

test("uses dnd5e AbilityTemplate to preview and create for the clicking user", async () => {
  const scene = installFoundryGlobals();
  const calls = [];

  CONFIG.MeasuredTemplate.documentClass = class FakeMeasuredTemplateDocument {
    constructor(data, options) {
      this.data = data;
      this.options = options;
      calls.push({ boundary: "document", data, options });
    }
  };
  game.dnd5e.canvas.AbilityTemplate = class FakeAbilityTemplate {
    constructor(document) {
      this.document = document;
      calls.push({ boundary: "preview", document });
    }

    async drawPreview() {
      calls.push({ boundary: "drawPreview" });
      return ["created-template"];
    }
  };

  const result = await placeMeasuredTemplate(
    { type: "circle", distance: 20 },
    { messageId: "message-1" },
  );
  assert.deepEqual(
    calls.map((call) => call.boundary),
    ["document", "preview", "drawPreview"],
  );
  assert.equal(calls[0].options.parent, scene);
  assert.equal(calls[0].data.user, "placing-user");
  assert.deepEqual(result, ["created-template"]);
});

test("chat listener disables without permission and invokes placement from flags", async () => {
  installFoundryGlobals();
  game.user.can = () => false;

  const calls = [];
  const buttons = {
    prop: (name, value) => calls.push({ boundary: "prop", name, value }),
    on: (name, handler) => calls.push({ boundary: "on", name, handler }),
  };
  const html = {
    find: (selector) => {
      calls.push({ boundary: "find", selector });
      return buttons;
    },
  };
  const message = {
    id: "message-1",
    getFlag: (scope, key) =>
      scope === "spiritual-arts-foundry" && key === "template"
        ? { type: "circle", distance: 20 }
        : undefined,
  };

  activateTemplateChatListeners(message, html);
  assert.equal(
    calls[0].selector,
    `[data-action="${PLACE_TEMPLATE_ACTION}"]`,
  );
  assert.deepEqual(calls[1], {
    boundary: "prop",
    name: "disabled",
    value: true,
  });
  assert.equal(calls[2].name, "click");
});

test("chat listener stays usable while the canvas changes after rendering", () => {
  installFoundryGlobals();
  game.canvas.ready = false;
  game.canvas.scene = null;

  const calls = [];
  const html = {
    find: () => ({
      prop: (name, value) => calls.push({ name, value }),
      on: () => {},
    }),
  };
  activateTemplateChatListeners(
    {
      getFlag: () => ({ type: "circle", distance: 20 }),
    },
    html,
  );

  assert.deepEqual(calls, [{ name: "disabled", value: false }]);
});

test("rejects malformed flags and unavailable placement boundaries", async () => {
  installFoundryGlobals();
  assert.throws(
    () => buildMeasuredTemplateData({ type: "circle", distance: 0 }),
    /invalid measured template configuration/,
  );

  game.canvas.scene = null;
  await assert.rejects(
    placeMeasuredTemplate({ type: "circle", distance: 20 }),
    /TemplateRequiresScene/,
  );

  let searched = false;
  activateTemplateChatListeners(
    { getFlag: () => ({ type: "circle", distance: -20 }) },
    { find: () => { searched = true; } },
  );
  assert.equal(searched, false);
});
