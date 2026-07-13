import assert from "node:assert/strict";
import { test } from "node:test";
import { RollBridgeConnection } from "../scripts/connection.mjs";
import { serializedMessage } from "./fixtures.mjs";

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.closed = false;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  emitMessage(data) {
    this.onmessage?.({ data });
  }
}

test("does not connect when this is not the designated Foundry user", () => {
  FakeWebSocket.instances = [];
  const connection = new RollBridgeConnection({
    onRoll: () => assert.fail("no roll should be delivered"),
    shouldConnect: () => false,
    WebSocketClass: FakeWebSocket,
  });

  connection.start();
  assert.equal(FakeWebSocket.instances.length, 0);
  connection.stop();
});

test("delivers only valid live messages while connected", () => {
  FakeWebSocket.instances = [];
  const rolls = [];
  const connection = new RollBridgeConnection({
    onRoll: (roll) => rolls.push(roll),
    shouldConnect: () => true,
    WebSocketClass: FakeWebSocket,
  });

  connection.start();
  const socket = FakeWebSocket.instances[0];
  socket.emitMessage("invalid");
  socket.emitMessage(serializedMessage());

  assert.equal(rolls.length, 1);
  assert.equal(rolls[0].character.name, "Raan");

  connection.stop();
  assert.equal(socket.closed, true);
});
