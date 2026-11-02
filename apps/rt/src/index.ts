/**
 * Adaptador para Cloudflare Workers + Durable Objects.
 *
 * Es el transporte de producción. La lógica del ajedrez y del reloj es
 * exactamente la misma que en local (`GameRoom.ts`); aquí solo se decide
 * *cuándo* se ejecuta:
 *
 *  - **Un Durable Object por partida**: el estado de una partida no compite
 *    con el de otra y no hay bloqueos entre partidas.
 *  - **WebSocket Hibernation API**: mientras la partida está quieta, el objeto
 *    se duerme y no consume tiempo de cómputo. Los sockets siguen vivos y el
 *    token del asiento viaja en el `serializeAttachment`.
 *  - **`setAlarm()` en vez de `setInterval`**: se programa un despertar
 *    exactamente para la caída de bandera (o para el abandono), no un bucle
 *    cada medio segundo. En el plan gratuito cada despertar cuenta como una
 *    petición, así que esto es la diferencia entre decenas y miles.
 */

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
  nextDeadline,
  publicState,
  tickRoom,
  type Effect,
  type RoomState,
} from "./GameRoom.ts";
import { deliver } from "./delivery.ts";

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  /** Origen permitido para CORS. Por defecto, cualquiera. */
  ALLOWED_ORIGIN?: string;
}

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function randomChars(count: number): string {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % 32];
  return out;
}

/** Ordenable por tiempo (8 caracteres de marca temporal) + 8 aleatorios. */
export function newGameId(now: number = Date.now()): string {
  let value = now;
  let time = "";
  for (let i = 0; i < 8; i += 1) {
    time = ALPHABET[value % 32] + time;
    value = Math.floor(value / 32);
  }
  return time + randomChars(8);
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Utilidades HTTP
// ---------------------------------------------------------------------------

function corsHeaders(env: Env): Record<string, string> {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN ?? "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

function json(body: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(env),
    },
  });
}

// ---------------------------------------------------------------------------
// Durable Object: una partida
// ---------------------------------------------------------------------------

type Attachment = { token: string };

export class GameRoomDurableObject implements DurableObject {
  private state: RoomState | null = null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  private async load(): Promise<RoomState | null> {
    if (this.state) return this.state;
    const stored = await this.ctx.storage.get<RoomState>("room");
    this.state = stored ?? null;
    return this.state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/init") && request.method === "POST") {
      const existing = await this.load();
      if (existing) return new Response("already-initialised", { status: 409 });

      const body = (await request.json()) as {
        gameId: string;
        whiteToken: string;
        blackToken: string;
        initialMs: number;
        incrementMs: number;
      };

      const room = createRoom({
        gameId: body.gameId,
        whiteToken: body.whiteToken,
        blackToken: body.blackToken,
        initialMs: body.initialMs,
        incrementMs: body.incrementMs,
        now: Date.now(),
      });
      this.state = room;
      await this.ctx.storage.put("room", room);
      return json({ ok: true }, this.env, 201);
    }

    if (url.pathname.endsWith("/summary")) {
      const state = await this.load();
      if (!state) return json({ error: "not-found" }, this.env, 404);
      return json(
        {
          gameId: state.gameId,
          status: state.status,
          ply: state.moves.length,
          initialMs: state.initialMs,
          incrementMs: state.incrementMs,
          players: { w: state.seats.w.connected, b: state.seats.b.connected },
        },
        this.env,
      );
    }

    if (url.pathname.endsWith("/ws")) {
      const token = url.searchParams.get("token") ?? "";
      const state = await this.load();
      if (!state) return new Response("not-found", { status: 404 });

      const color = colorOfToken(state, token);
      if (!color) return new Response("forbidden", { status: 403 });

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      // Hibernación: el objeto puede dormirse con los sockets abiertos, así que
      // el token del asiento se guarda pegado al socket.
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ token } satisfies Attachment);

      const joined = joinRoom(state, color, { now: Date.now() });
      await this.apply(joined.state, joined.effects);

      server.send(
        JSON.stringify({
          t: "ready",
          state: publicState(joined.state, color),
        } satisfies ServerMessage),
      );

      await this.scheduleAlarm();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not-found", { status: 404 });
  }

  // --- Mensajes de WebSocket -------------------------------------------------

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const state = await this.load();
    if (!state) return;

    let message: ClientMessage;
    try {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      message = JSON.parse(text) as ClientMessage;
    } catch {
      this.send(ws, {
        t: "error",
        code: "bad-json",
        message: "Mensaje no válido.",
      });
      return;
    }

    // La latencia se mide aquí, en el transporte, no en el estado de la partida.
    if (message.t === "ping") {
      this.send(ws, { t: "pong", cid: message.cid, t0: message.t0, t1: Date.now() });
      return;
    }

    const token = this.tokenOf(ws);
    const color = colorOfToken(state, token);
    if (!color) {
      this.send(ws, {
        t: "error",
        code: "no-seat",
        message: "Tu token no corresponde a esta partida.",
      });
      return;
    }

    const result = applyMessage(state, color, message, {
      now: Date.now(),
      lagMs: clamp(this.rttOf.get(token) ?? 0, 0, MAX_LAG_COMPENSATION_MS),
    });
    await this.apply(result.state, result.effects);
  }

  async webSocketClose(ws: WebSocket) {
    const state = await this.load();
    if (!state) return;

    const token = this.tokenOf(ws);
    const color = colorOfToken(state, token);
    if (!color) return;

    const left = leaveRoom(state, color, { now: Date.now() });
    await this.apply(left.state, left.effects);
  }

  async webSocketError(ws: WebSocket) {
    // `webSocketClose` llega igualmente; aquí solo se evita el ruido.
    void ws;
  }

  // --- Relojes ---------------------------------------------------------------

  async alarm() {
    const state = await this.load();
    if (!state) return;

    const result = tickRoom(state, { now: Date.now() });
    await this.apply(result.state, result.effects);
  }

  // --- Interno ---------------------------------------------------------------

  /** Latencia estimada por token, para la compensación por lag. */
  private rttOf = new Map<string, number>();

  private tokenOf(ws: WebSocket): string {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    return attachment?.token ?? "";
  }

  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // El socket puede estar cerrándose; `webSocketClose` limpia el asiento.
    }
  }

  private socketsFor(color: Color, state: RoomState): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => colorOfToken(state, this.tokenOf(ws)) === color);
  }

  private async apply(next: RoomState, effects: Effect[]) {
    const changed = next !== this.state;
    this.state = next;
    if (changed) await this.ctx.storage.put("room", next);

    for (const effect of effects) {
      for (const outgoing of deliver(effect, next)) {
        const targets =
          outgoing.to === "all"
            ? this.ctx.getWebSockets()
            : this.socketsFor(outgoing.to, next);
        for (const ws of targets) this.send(ws, outgoing.message);
      }
    }

    await this.scheduleAlarm();
  }

  /**
   * Programa un único despertar en el instante en que algo puede cambiar
   * (bandera caída o abandono). Si no hay nada que esperar, lo borra: un
   * objeto dormido no cuesta nada.
   */
  private async scheduleAlarm() {
    const state = this.state;
    if (!state) return;

    const deadline = nextDeadline(state);
    if (deadline === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    // Nunca en el pasado: Cloudflare lo dispararía en bucle.
    await this.ctx.storage.setAlarm(Math.max(deadline, Date.now() + 50));
  }
}

// ---------------------------------------------------------------------------
// Worker: enrutado y creación de partidas
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, env);
    }

    if (request.method === "POST" && url.pathname === "/games") {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }

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
        return json({ error: "invalid-time-control" }, env, 400);
      }

      const gameId = newGameId();
      const whiteToken = newToken();
      const blackToken = newToken();

      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(gameId));
      const init = await stub.fetch(`https://game/init`, {
        method: "POST",
        body: JSON.stringify({
          gameId,
          whiteToken,
          blackToken,
          initialMs: Math.round(initialMs),
          incrementMs: Math.round(incrementMs),
        }),
      });
      if (!init.ok) return json({ error: "init-failed" }, env, 500);

      return json(
        {
          gameId,
          whiteToken,
          blackToken,
          initialMs: Math.round(initialMs),
          incrementMs: Math.round(incrementMs),
        },
        env,
        201,
      );
    }

    const match = /^\/games\/([a-z0-9]{8,32})$/.exec(url.pathname);
    if (request.method === "GET" && match) {
      const gameId = match[1] ?? "";
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(gameId));
      const response = await stub.fetch(`https://game/summary`);
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          ...corsHeaders(env),
        },
      });
    }

    if (url.pathname === "/ws") {
      const gameId = url.searchParams.get("game") ?? "";
      if (!/^[a-z0-9]{8,32}$/.test(gameId)) {
        return new Response("bad-request", { status: 400 });
      }
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(gameId));
      return stub.fetch(request);
    }

    return json({ error: "not-found" }, env, 404);
  },
};
