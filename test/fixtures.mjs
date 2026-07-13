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
    character: structuredClone(validMessage.data.character),
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

export function serializedActionMessage(update = {}) {
  return JSON.stringify({
    ...structuredClone(validDamageActionMessage),
    ...update,
  });
}
