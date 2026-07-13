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
