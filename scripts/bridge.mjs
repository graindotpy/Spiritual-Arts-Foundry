import { RollBridgeConnection } from "./connection.mjs";
import { MAX_SEEN_EVENT_IDS, MODULE_ID } from "./constants.mjs";
import { createRollChatMessage } from "./chat-message.mjs";
import { BoundedEventSet } from "./deduplication.mjs";
import { isDesignatedBridgeUser } from "./settings.mjs";

function alreadyCreated(eventId) {
  return Boolean(
    game.messages?.find(
      (message) => message.getFlag(MODULE_ID, "eventId") === eventId,
    ),
  );
}

export class SpiritualArtsBridge {
  constructor() {
    this.seen = new BoundedEventSet(MAX_SEEN_EVENT_IDS);
    this.queue = Promise.resolve();
    this.connection = new RollBridgeConnection({
      shouldConnect: isDesignatedBridgeUser,
      onRoll: (event) => this.#enqueue(event),
    });
  }

  start() {
    if (isDesignatedBridgeUser()) this.connection.start();
  }

  stop() {
    this.connection.stop();
  }

  #enqueue(event) {
    this.queue = this.queue
      .then(() => this.#handleRoll(event))
      .catch((error) => {
        console.error(`${MODULE_ID} | Failed to create roll chat message`, error);
      });
  }

  async #handleRoll(event) {
    if (!isDesignatedBridgeUser()) {
      this.stop();
      return;
    }

    if (this.seen.has(event.eventId) || alreadyCreated(event.eventId)) {
      this.seen.add(event.eventId);
      return;
    }

    await createRollChatMessage(event);
    this.seen.add(event.eventId);
  }
}
