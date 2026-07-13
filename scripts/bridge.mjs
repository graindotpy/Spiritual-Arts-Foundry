import { RollBridgeConnection } from "./connection.mjs";
import { MAX_SEEN_EVENT_IDS, MODULE_ID } from "./constants.mjs";
import {
  createActionRollChatMessage,
  createRollChatMessage,
} from "./chat-message.mjs";
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
      onEvent: (event) => this.#enqueue(event),
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
      .then(() => this.#handleEvent(event))
      .catch((error) => {
        console.error(
          `${MODULE_ID} | Failed to execute ${event.type} ${event.eventId}`,
          error,
        );
      });
  }

  async #handleEvent(event) {
    if (!isDesignatedBridgeUser()) {
      this.stop();
      return;
    }

    if (this.seen.has(event.eventId) || alreadyCreated(event.eventId)) {
      this.seen.add(event.eventId);
      return;
    }

    if (event.type === "spirit_die_roll") {
      await createRollChatMessage(event);
    } else if (event.type === "foundry_action_request") {
      await createActionRollChatMessage(event);
    } else {
      return;
    }
    this.seen.add(event.eventId);
  }
}
