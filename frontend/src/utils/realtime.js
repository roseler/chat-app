import { io } from "socket.io-client";

// Keep the original Node development server usable; hosted builds use native WebSockets.
export function createRealtime(baseUrl) {
  if (import.meta.env.DEV && import.meta.env.VITE_NATIVE_CHAT !== "true") {
    return io(baseUrl, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }
  return new ChatConnection(baseUrl);
}

export class ChatConnection {
  constructor(baseUrl) {
    const url = new URL("/ws", baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    this.url = url.href;
    this.connected = false;
    this.listeners = new Map();
    this.pending = new Map();
    this.attempts = 0;
    this.stopped = false;
    this.connect();
  }
  on(event, listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(listener);
    return this;
  }
  off(event, listener) {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }
  dispatch(event, data) {
    this.listeners.get(event)?.forEach((listener) => listener(data));
  }
  connect() {
    if (
      this.ws &&
      [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.ws.readyState)
    )
      return this;
    this.stopped = false;
    clearTimeout(this.reconnectTimer);
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.connected = true;
      this.attempts = 0;
      this.lastPong = Date.now();
      this.dispatch("connect");
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastPong > 60000) {
          ws.close();
          return;
        }
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 20000);
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      if (event.data === "pong") {
        this.lastPong = Date.now();
        return;
      }
      try {
        const packet = JSON.parse(event.data);
        if (packet.ack) {
          const pending = this.pending.get(packet.ack);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(packet.ack);
            pending.callback(null, packet.data);
          }
        } else if (packet.event) this.dispatch(packet.event, packet.data);
      } catch {
        /* Ignore invalid frames without exposing their contents. */
      }
    };
    ws.onerror = () => {
      if (this.ws === ws)
        this.dispatch("connect_error", new Error("Unable to connect."));
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.connected = false;
      clearInterval(this.heartbeat);
      this.failPending();
      this.dispatch("disconnect");
      if (event.code === 1008) {
        this.stopped = true;
        this.dispatch("connect_error", new Error("Please sign in again."));
      } else if (!this.stopped) {
        const delay =
          Math.min(10000, 1000 * 2 ** this.attempts++) + Math.random() * 300;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };
    return this;
  }
  failPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.callback(new Error("Connection lost."));
    }
    this.pending.clear();
  }
  disconnect() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeat);
    this.connected = false;
    this.failPending();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    return this;
  }
  emit(event, data) {
    return this.send(event, data);
  }
  timeout(ms) {
    return {
      emit: (event, data, callback) => this.send(event, data, callback, ms),
    };
  }
  send(event, data, callback, ms = 12000) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      callback?.(new Error("Connection lost."));
      return this;
    }
    const id = callback ? crypto.randomUUID() : undefined;
    if (callback) {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        callback(new Error("Confirmation timed out."));
      }, ms);
      this.pending.set(id, { callback, timer });
    }
    try {
      this.ws.send(JSON.stringify({ event, data, ...(id ? { id } : {}) }));
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        callback(error);
      }
    }
    return this;
  }
}
