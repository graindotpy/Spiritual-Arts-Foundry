import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_WEBSOCKET_MESSAGE_LENGTH } from "../scripts/constants.mjs";
import { parseSpiritRollMessage } from "../scripts/protocol.mjs";
import { serializedMessage, validMessage } from "./fixtures.mjs";

test("parses a version-one Spiritual Arts roll", () => {
  const parsed = parseSpiritRollMessage(serializedMessage());

  assert.equal(parsed?.protocolVersion, 1);
  assert.equal(parsed?.eventId, validMessage.eventId);
  assert.equal(parsed?.character.name, "Raan");
  assert.equal(parsed?.roll.techniqueName, "Devour Essence");
  assert.equal(parsed?.roll.value, 6);
});

test("rejects unversioned, future-version, and invalid-ID envelopes", () => {
  const unversioned = structuredClone(validMessage);
  delete unversioned.protocolVersion;
  assert.equal(parseSpiritRollMessage(JSON.stringify(unversioned)), null);

  assert.equal(
    parseSpiritRollMessage(serializedMessage({ protocolVersion: 2 })),
    null,
  );
  assert.equal(
    parseSpiritRollMessage(serializedMessage({ eventId: "not-a-uuid" })),
    null,
  );
});

test("rejects malformed, oversized, and internally inconsistent rolls", () => {
  assert.equal(parseSpiritRollMessage("{"), null);
  assert.equal(
    parseSpiritRollMessage("x".repeat(MAX_WEBSOCKET_MESSAGE_LENGTH + 1)),
    null,
  );

  const inconsistent = structuredClone(validMessage);
  inconsistent.data.roll.success = false;
  assert.equal(parseSpiritRollMessage(JSON.stringify(inconsistent)), null);
});
