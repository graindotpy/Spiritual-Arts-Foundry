import assert from "node:assert/strict";
import { test } from "node:test";
import { BoundedEventSet } from "../scripts/deduplication.mjs";

test("remembers event IDs once and evicts the oldest at its bound", () => {
  const events = new BoundedEventSet(2);

  assert.equal(events.add("first"), true);
  assert.equal(events.add("first"), false);
  assert.equal(events.add("second"), true);
  assert.equal(events.add("third"), true);

  assert.equal(events.size, 2);
  assert.equal(events.has("first"), false);
  assert.equal(events.has("second"), true);
  assert.equal(events.has("third"), true);
});

test("requires a positive integer bound", () => {
  assert.throws(() => new BoundedEventSet(0), RangeError);
});
