export const validMessage = Object.freeze({
  protocolVersion: 1,
  eventId: "5c13c52f-f89d-41f5-8816-7d5ac0ab132f",
  type: "spirit_die_roll",
  data: {
    character: {
      id: "character-1",
      name: "Raan",
      path: "Path of Gluttony",
      level: 8,
      portraitUrl: null,
    },
    roll: {
      spInvestment: 2,
      dieSize: "d8",
      dieIndex: 0,
      value: 6,
      success: true,
      techniqueId: null,
      techniqueName: "Devour Essence",
      investmentEffect:
        "Deal necrotic damage.\nThen regain Hit Points from the consumed essence.",
      timestamp: "2026-07-13T12:00:00.000Z",
    },
  },
});

export function serializedMessage(update = {}) {
  return JSON.stringify({
    ...structuredClone(validMessage),
    ...update,
  });
}

export const validDamageActionMessage = Object.freeze({
  protocolVersion: 1,
  eventId: "e131f252-9d65-4f43-a822-243e2560ed60",
  type: "foundry_action_request",
  data: {
    requestedAt: "2026-07-13T12:00:00.100Z",
    sourceRollEventId: validMessage.eventId,
    character: {
      ...structuredClone(validMessage.data.character),
      spiritualArtsDc: 16,
    },
    technique: {
      id: "89843a7a-b538-4c16-beee-56255e41615e",
      name: "Devour Essence",
    },
    spInvestment: 2,
    action: {
      id: "1de7331d-7607-4932-8392-379710cc30f1",
      kind: "roll_damage",
      formula: "2d8 + 4",
      damageType: "necrotic",
      label: "Essence damage",
    },
  },
});

export const validEnhancedDamageActionMessage = Object.freeze({
  ...structuredClone(validDamageActionMessage),
  data: {
    ...structuredClone(validDamageActionMessage.data),
    action: {
      ...structuredClone(validDamageActionMessage.data.action),
      savingThrow: { ability: "dex" },
      template: { type: "circle", distance: 20 },
    },
  },
});

export const validSavingThrowActionMessage = Object.freeze({
  ...structuredClone(validDamageActionMessage),
  eventId: "4d4f40e1-96d0-4861-b75e-1a3d5b5513bb",
  data: {
    ...structuredClone(validDamageActionMessage.data),
    action: {
      id: "49c1f688-3a4e-4d34-8bde-8f9786798bba",
      kind: "saving_throw",
      label: "Resist the push",
      savingThrow: { ability: "str" },
      template: { type: "cone", distance: 15, angle: 90 },
    },
  },
});

export const validAttackActionMessage = Object.freeze({
  ...structuredClone(validDamageActionMessage),
  eventId: "938f21bd-8c30-43f8-aac4-8ba97e6cfd19",
  data: {
    ...structuredClone(validDamageActionMessage.data),
    character: {
      ...structuredClone(validMessage.data.character),
      spiritualArtsAttackModifier: 7,
    },
    action: {
      id: "e419a6d0-b9b9-4c60-ab9e-a07668cf2119",
      kind: "roll_attack",
      label: "Seeking strike",
    },
  },
});

export const validTemplateActionMessage = Object.freeze({
  ...structuredClone(validDamageActionMessage),
  eventId: "2491ed4a-4a2c-4983-bec6-5a1385211e7c",
  data: {
    ...structuredClone(validDamageActionMessage.data),
    character: structuredClone(validMessage.data.character),
    action: {
      id: "8d92240a-54ec-43f8-9bce-c7211aee5970",
      kind: "place_template",
      label: "Create difficult terrain",
      template: { type: "rectangle", distance: 20 },
    },
  },
});

export const validInstrumentActionMessage = Object.freeze({
  protocolVersion: 1,
  eventId: "1772e083-d3e5-48bb-a7e8-e6c804c333e0",
  type: "foundry_action_request",
  data: {
    requestedAt: "2026-07-15T18:30:00.100Z",
    sourceUseId: "b479a5a5-4662-4ee9-a9f5-2537fb3ea4a3",
    character: {
      ...structuredClone(validMessage.data.character),
      spiritualArtsDc: 16,
    },
    instrument: {
      id: "592f6770-68d4-480b-9f96-852abcf6e0f2",
      name: "Singing Bowl",
    },
    instrumentAction: {
      id: "ab3214ae-44d1-49ff-bff6-4bf6b8898f1d",
      name: "Resonant Blast",
    },
    action: {
      id: "108f9dd1-c3e9-41a0-a1b4-2dc61f7b8b46",
      kind: "roll_damage",
      formula: "2d8 + 4",
      damageType: "thunder",
      label: "Resonant damage",
    },
  },
});

export function serializedActionMessage(update = {}) {
  return JSON.stringify({
    ...structuredClone(validDamageActionMessage),
    ...update,
  });
}

export function serializedSavingThrowActionMessage(update = {}) {
  return JSON.stringify({
    ...structuredClone(validSavingThrowActionMessage),
    ...update,
  });
}

export function serializedAttackActionMessage(update = {}) {
  return JSON.stringify({
    ...structuredClone(validAttackActionMessage),
    ...update,
  });
}

export function serializedTemplateActionMessage(update = {}) {
  return JSON.stringify({
    ...structuredClone(validTemplateActionMessage),
    ...update,
  });
}

export function serializedInstrumentActionMessage(update = {}) {
  return JSON.stringify({
    ...structuredClone(validInstrumentActionMessage),
    ...update,
  });
}

export function serializedLegacyActionMessage() {
  const message = structuredClone(validDamageActionMessage);
  delete message.data.character.spiritualArtsDc;
  return JSON.stringify(message);
}
