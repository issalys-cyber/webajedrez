"use client";

import type { ClientMessage, ServerMessage } from "@webajedrez/shared";

export type ConnectionStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

/** Reintentos: backoff exponencial con jitter, y un tope para rendirse. */
const BACKOFF_MS = [250, 500, 1000, 2000, 4000, 8000, 10_000];
const MAX_QUEUED = 32;
const PING_INTERVAL_MS = 5_000;
/**
 * Si un socket ni abre ni falla (una red que se traga los paquetes, un
 * intermediario que no contesta), el navegador puede dejarlo en "conectando"
 * indefinidamente. Pasado este tiempo se cierra para forzar el reintento.
 */
const CONNECT_TIMEOUT_MS = 12_000;

/**
 * Cliente del servidor de partidas.
 *
 * Responsabilidades:
 *  - Reconectar con backoff y jitter (una red móvil no vuelve en 250 ms).
 *  - Guardar lo enviado mientras no hay conexión y vaciarlo al reconectar.
 *  - Pedir un `sync` nada más conectar: el servidor es la verdad, el cliente
 *    no intenta adivinar el estado.
 *  - Medir la latencia para corregir el reloj en pantalla.
 */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private outbox: string[] = [];
  private attempt = 0;
  private closedByUser = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private offsetMs = 0;

  rttMs = 0;

  constructor(
    private readonly options: {
      url: string;
      onMessage: (message: ServerMessage) => void;
      onStatus: (status: ConnectionStatus) => void;
      onRtt?: (rttMs: number) => void;
    },
  ) {}

  /** Hora estimada del servidor: el reloj de la partida es suyo, no el nuestro. */
  get serverNow(): number {
    return Date.now() + this.offsetMs;
  }

  connect() {
    this.closedByUser = false;
    this.attempt = 0;
    this.open();
  }

  private open() {
    this.options.onStatus(this.attempt === 0 ? "connecting" : "reconnecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch {
      this.options.onStatus("error");
      return;
    }
    this.socket = socket;

    // Vigila que el socket llegue a abrir; si no, se cierra para reintentar.
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) socket.close();
    }, CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      this.clearConnectTimer();
      this.attempt = 0;
      this.options.onStatus("open");

      // Al volver, primero se pide el estado autoritativo y después se vacía
      // la cola: si alguna jugada no llegó, el servidor la rechazará con el
      // `ply` que corresponda en lugar de aceptarla a ciegas.
      this.rawSend({ t: "sync" });
      for (const queued of this.outbox.splice(0, this.outbox.length)) {
        socket.send(queued);
      }
      this.startPing();
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }

      if (message.t === "pong") {
        this.rttMs = Date.now() - message.t0;
        // t1 es hora del servidor; se estima el desfase compensando medio RTT.
        this.offsetMs = message.t1 + this.rttMs / 2 - Date.now();
        this.options.onRtt?.(this.rttMs);
        return;
      }

      this.options.onMessage(message);
    };

    socket.onclose = () => {
      this.clearConnectTimer();
      this.stopPing();
      if (this.closedByUser) {
        this.options.onStatus("closed");
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // Tras un error siempre llega `close`; la reconexión se gestiona allí.
    };
  }

  private scheduleReconnect() {
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] ?? 10_000;
    this.attempt += 1;

    if (this.attempt > BACKOFF_MS.length) {
      // Se ha intentado lo razonable: mejor decirlo que reintentar en bucle.
      this.options.onStatus("error");
      return;
    }

    this.options.onStatus("reconnecting");
    const jitter = Math.random() * 250;
    this.reconnectTimer = setTimeout(() => this.open(), delay + jitter);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.rawSend({ t: "ping", cid: `ping-${Date.now()}`, t0: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private clearConnectTimer() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private rawSend(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    if (this.outbox.length < MAX_QUEUED) {
      this.outbox.push(JSON.stringify(message));
    }
  }

  /** Envía un mensaje; si no hay conexión, queda en cola para el reintento. */
  send(message: ClientMessage) {
    this.rawSend(message);
  }

  close() {
    this.closedByUser = true;
    this.clearConnectTimer();
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }
}

/** Identificador de intención para el protocolo idempotente. */
export function newCid(prefix = "c"): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}
