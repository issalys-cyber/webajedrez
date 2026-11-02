/**
 * Servidor de partidas (transporte).
 *
 * Este fichero SOLO se ocupa de la red: sockets, salas en memoria, latencia y
 * difusión. Toda la lógica del ajedrez y del reloj vive en `GameRoom.ts`, que
 * es puro y se puede probar sin levantar nada.
 *
 * Pensado para correr en local (`npm run dev -w @webajedrez/rt`). El adaptador
 * para Cloudflare Durable Objects reutiliza exactamente el mismo GameRoom.
 */

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import {
  DEFAULT_INCREMENT_MS,
  DEFAULT_INITIAL_MS,
  MAX_LAG_COMPENSATION_MS,
  clamp,
  type ClientMessage,
  type Color,
  type ServerMessage,
} from "@webajedrez/shared";
import {
  applyMessage,
  colorOfToken,
  createRoom,
  joinRoom,
  leaveRoom,
  publicState,
  tickRoom,
  type Effect,
  type RoomState,
} from "./GameRoom.ts";

const PORT = Number(process.env.PORT ?? 8787);
const TICK_MS = 500;
/** Cuánto se guarda una partida terminada sin nadie conectado. */
const FINISHED_ROOM_TTL_MS = 10 * 60 * 1000;

type Connection = { token: string; rttMs: number };

type Room = {
  state: RoomState;
  connections: Map<WebSocket, Connection>;
  timer: ReturnType<typeof setInterval> | null;
  finishedAt: number | null;
};

const rooms = new Map<string, Room>();

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * Identificador de partida ordenable por tiempo: 8 caracteres de marca
 * temporal en base32 (Crockford) + 8 aleatorios. Sirve como enlace compartible
 * y no es adivinable.
 */
export function newGameId(now: number = Date.now()): string {
  let time = "";
  let value = now;
  for (let i = 0; i < 8; i += 1) {
    time = ALPHABET[value % 32] + time;
    value = Math.floor(value / 32);
  }

  const bytes = randomBytes(8);
  let random = "";
  for (const byte of bytes) random += ALPHABET[byte % 32];

  return time + random;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// Utilidades HTTP
// ---------------------------------------------------------------------------

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

function sendJson(response: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Difusión
// ---------------------------------------------------------------------------

function currentColor(room: Room, socket: WebSocket): Color | null {
  const connection = room.connections.get(socket);
  if (!connection) return null;
  return colorOfToken(room.state, connection.token);
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendTo(room: Room, color: Color, message: ServerMessage) {
  for (const socket of room.connections.keys()) {
    if (currentColor(room, socket) === color) send(socket, message);
  }
}

function broadcastState(room: Room) {
  for (const socket of room.connections.keys()) {
    const color = currentColor(room, socket);
    if (!color) continue;
    send(socket, { t: "state", state: publicState(room.state, color) });
  }
}

function dispatch(room: Room, effects: Effect[]) {
  for (const effect of effects) {
    switch (effect.kind) {
      case "ack":
        sendTo(room, effect.to, {
          t: "ack",
          cid: effect.cid,
          accepted: effect.ack.accepted,
          error: effect.ack.error,
          ply: effect.ack.ply,
        });
        break;
      case "error":
        sendTo(room, effect.to, {
          t: "error",
          code: effect.code,
          message: effect.message,
        });
        break;
      case "broadcast":
        broadcastState(room);
        break;
      case "end": {
        const { result, termination } = room.state;
        if (result && termination) {
          const message: ServerMessage = { t: "end", result, termination };
          for (const socket of room.connections.keys()) send(socket, message);
        }
        broadcastState(room);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Salas
// ---------------------------------------------------------------------------

function getRoom(gameId: string): Room | undefined {
  return rooms.get(gameId);
}

function createRoomEntry(initialMs: number, incrementMs: number): Room {
  const now = Date.now();
  const state = createRoom({
    gameId: newGameId(now),
    whiteToken: newToken(),
    blackToken: newToken(),
    now,
    initialMs,
    incrementMs,
  });

  const room: Room = {
    state,
    connections: new Map(),
    timer: null,
    finishedAt: null,
  };

  room.timer = setInterval(() => tick(room), TICK_MS);
  // En un servidor de verdad esto no debe impedir que el proceso termine.
  room.timer.unref?.();

  rooms.set(state.gameId, room);
  return room;
}

function tick(room: Room) {
  const now = Date.now();
  const result = tickRoom(room.state, { now });

  if (result.state !== room.state) {
    room.state = result.state;
    dispatch(room, result.effects);
  }

  const over = room.state.status === "finished" || room.state.status === "aborted";
  if (over && room.connections.size === 0) {
    room.finishedAt ??= now;
    if (now - room.finishedAt > FINISHED_ROOM_TTL_MS) {
      if (room.timer) clearInterval(room.timer);
      rooms.delete(room.state.gameId);
    }
  } else {
    room.finishedAt = null;
  }
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket
// ---------------------------------------------------------------------------

const http = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": ALLOWED_ORIGIN,
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    });
    response.end();
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      rooms: rooms.size,
      uptimeSeconds: Math.round(process.uptime()),
    });
    return;
  }

  // Crear partida: devuelve el token del creador (blancas) y el del rival.
  if (request.method === "POST" && url.pathname === "/games") {
    const body = await readJson(request);
    const initialMs = Number(body.initialMs ?? DEFAULT_INITIAL_MS);
    const incrementMs = Number(body.incrementMs ?? DEFAULT_INCREMENT_MS);

    if (
      !Number.isFinite(initialMs) ||
      !Number.isFinite(incrementMs) ||
      initialMs < 10_000 ||
      initialMs > 3 * 60 * 60 * 1000 ||
      incrementMs < 0 ||
      incrementMs > 60_000
    ) {
      sendJson(response, 400, { error: "invalid-time-control" });
      return;
    }

    const room = createRoomEntry(Math.round(initialMs), Math.round(incrementMs));
    sendJson(response, 201, {
      gameId: room.state.gameId,
      whiteToken: room.state.seats.w.token,
      blackToken: room.state.seats.b.token,
      initialMs: room.state.initialMs,
      incrementMs: room.state.incrementMs,
    });
    return;
  }

  const match = /^\/games\/([a-z0-9]{8,32})$/.exec(url.pathname);
  if (request.method === "GET" && match) {
    const room = getRoom(match[1] ?? "");
    if (!room) {
      sendJson(response, 404, { error: "not-found" });
      return;
    }
    sendJson(response, 200, {
      gameId: room.state.gameId,
      status: room.state.status,
      ply: room.state.moves.length,
      initialMs: room.state.initialMs,
      incrementMs: room.state.incrementMs,
      players: {
        w: room.state.seats.w.connected,
        b: room.state.seats.b.connected,
      },
    });
    return;
  }

  sendJson(response, 404, { error: "not-found" });
});

const wss = new WebSocketServer({ noServer: true });

http.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const gameId = url.searchParams.get("game") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const room = getRoom(gameId);

  if (!room) {
    socket.destroy();
    return;
  }
  if (colorOfToken(room.state, token) === null) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, room, token);
  });
});

wss.on(
  "connection",
  (socket: WebSocket, _request: IncomingMessage, room: Room, token: string) => {
    room.connections.set(socket, { token, rttMs: 0 });

    const color = colorOfToken(room.state, token);
    if (color) {
      const joined = joinRoom(room.state, color, { now: Date.now() });
      room.state = joined.state;
      dispatch(room, joined.effects);
    }

    send(socket, {
      t: "ready",
      state: publicState(room.state, colorOfToken(room.state, token) ?? "w"),
    });

    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        send(socket, { t: "error", code: "bad-json", message: "Mensaje no válido." });
        return;
      }

      // La latencia se mide en el transporte, no en el estado de la partida.
      if (message.t === "ping") {
        send(socket, { t: "pong", cid: message.cid, t0: message.t0, t1: Date.now() });
        const rtt = Date.now() - message.t0;
        const connection = room.connections.get(socket);
        if (connection && Number.isFinite(rtt) && rtt >= 0) {
          // Media suave para no reaccionar a un pico aislado.
          connection.rttMs = connection.rttMs === 0 ? rtt : connection.rttMs * 0.7 + rtt * 0.3;
        }
        return;
      }

      const color = colorOfToken(room.state, token);
      if (!color) {
        send(socket, {
          t: "error",
          code: "no-seat",
          message: "Tu token no corresponde a esta partida.",
        });
        return;
      }

      const lagMs = clamp((room.connections.get(socket)?.rttMs ?? 0) / 2, 0, MAX_LAG_COMPENSATION_MS);
      const result = applyMessage(room.state, color, message, { now: Date.now(), lagMs });
      room.state = result.state;
      dispatch(room, result.effects);
    });

    socket.on("close", () => {
      const color = colorOfToken(room.state, token);
      room.connections.delete(socket);
      if (color) {
        const left = leaveRoom(room.state, color, { now: Date.now() });
        room.state = left.state;
        dispatch(room, left.effects);
      }
    });

    socket.on("error", () => {
      // `close` se encarga de la limpieza; aquí solo se evita que reviente.
    });
  },
);

http.listen(PORT, () => {
  console.log(`[rt] escuchando en http://localhost:${PORT} (ws://localhost:${PORT}/ws)`);
});
