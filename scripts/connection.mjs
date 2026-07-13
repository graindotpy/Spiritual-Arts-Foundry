import { RECONNECT, WEBSOCKET_URL } from "./constants.mjs";
import { parseRealtimeMessage } from "./protocol.mjs";

export class RollBridgeConnection {
  constructor({
    onEvent,
    onRoll,
    shouldConnect,
    url = WEBSOCKET_URL,
    WebSocketClass = globalThis.WebSocket,
  }) {
    this.onEvent = onEvent ?? onRoll;
    if (typeof this.onEvent !== "function") {
      throw new TypeError("RollBridgeConnection requires an event handler");
    }
    this.shouldConnect = shouldConnect;
    this.url = url;
    this.WebSocketClass = WebSocketClass;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.stopped = true;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // The page may be unloading while the initial handshake is incomplete.
      }
    }
  }

  #connect() {
    if (this.stopped || !this.shouldConnect()) return;

    let socket;
    try {
      socket = new this.WebSocketClass(this.url);
    } catch {
      this.#scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket || this.stopped) return;
      this.reconnectAttempts = 0;
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket || this.stopped) return;
      const parsedEvent = parseRealtimeMessage(event.data);
      if (parsedEvent) this.onEvent(parsedEvent);
    };

    socket.onerror = () => {
      if (this.socket !== socket || this.stopped) return;
      try {
        socket.close();
      } catch {
        this.socket = null;
        this.#scheduleReconnect();
      }
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.#scheduleReconnect();
    };
  }

  #scheduleReconnect() {
    if (
      this.stopped ||
      this.reconnectTimer !== null ||
      !this.shouldConnect()
    ) {
      return;
    }

    const baseDelay = Math.min(
      RECONNECT.MAX_DELAY_MS,
      RECONNECT.INITIAL_DELAY_MS * 2 ** this.reconnectAttempts,
    );
    const delay = baseDelay + Math.round(Math.random() * RECONNECT.JITTER_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null;
      this.#connect();
    }, delay);
  }
}
