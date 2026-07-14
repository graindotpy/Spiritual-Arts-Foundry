import assert from "node:assert/strict";
import { test } from "node:test";
import { RollBridgeConnection } from "../scripts/connection.mjs";
import {
  serializedActionMessage,
  serializedMessage,
  serializedSavingThrowActionMessage,
} from "./fixtures.mjs";

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
  const events = [];
  const connection = new RollBridgeConnection({
    onEvent: (event) => events.push(event),
    shouldConnect: () => true,
    WebSocketClass: FakeWebSocket,
  });

  connection.start();
  const socket = FakeWebSocket.instances[0];
  socket.emitMessage("invalid");
  socket.emitMessage(serializedMessage());
  socket.emitMessage(serializedActionMessage());
  socket.emitMessage(serializedSavingThrowActionMessage());

  assert.equal(events.length, 3);
  assert.equal(events[0].type, "spirit_die_roll");
  assert.equal(events[0].character.name, "Raan");
  assert.equal(events[1].type, "foundry_action_request");
  assert.equal(events[1].action.kind, "roll_damage");
  assert.equal(events[2].type, "foundry_action_request");
  assert.equal(events[2].action.kind, "saving_throw");

  connection.stop();
  assert.equal(socket.closed, true);
});
