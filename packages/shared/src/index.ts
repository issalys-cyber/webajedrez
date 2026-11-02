/**
 * Protocolo compartido entre el cliente (Next.js) y el servidor de partidas.
 *
 * Solo tipos y constantes: nada de red, nada de Node, nada de React. Así el
 * mismo fichero sirve en el navegador, en un servidor Node y en un Durable
 * Object de Cloudflare.
 */

export type Color = "w" | "b";

export type GameStatus = "waiting" | "playing" | "finished" | "aborted";

export type Termination =
  | "checkmate"
  | "resign"
  | "timeout"
  | "stalemate"
  | "threefold"
  | "fifty-move"
  | "insufficient"
  | "draw-agreed"
  | "aborted";

/** "1-0" ganan blancas, "0-1" ganan negras, "1/2-1/2" tablas. */
export type GameResult = "1-0" | "0-1" | "1/2-1/2";

// ---------------------------------------------------------------------------
// Mensajes cliente → servidor
// ---------------------------------------------------------------------------

/**
 * `cid` (client id) identifica la intención y hace el protocolo idempotente:
 * si el cliente reintenta por mala red, el servidor reconoce el mensaje y
 * responde lo mismo en lugar de aplicar la jugada dos veces.
 */
export type ClientMessage =
  | { t: "move"; cid: string; ply: number; uci: string }
  | { t: "resign"; cid: string }
  | { t: "offer_draw"; cid: string }
  | { t: "accept_draw"; cid: string }
  | { t: "decline_draw"; cid: string }
  | { t: "abort"; cid: string }
  | { t: "rematch_offer"; cid: string }
  | { t: "rematch_accept"; cid: string }
  | { t: "sync" }
  | { t: "ping"; cid: string; t0: number };

// ---------------------------------------------------------------------------
// Mensajes servidor → cliente
// ---------------------------------------------------------------------------

export type MoveRecord = { uci: string; san: string; ply: number; by: Color };

export type PublicClock = {
  whiteMs: number;
  blackMs: number;
  turn: Color;
  /** Si el reloj del que mueve está corriendo ahora mismo. */
  running: boolean;
  /** Instante (epoch ms del servidor) en el que empezó a correr el turno. */
  turnStartedAt: number | null;
  initialMs: number;
  incrementMs: number;
};

export type PublicState = {
  gameId: string;
  status: GameStatus;
  fen: string;
  turn: Color;
  /** Número de semijugadas jugadas. */
  ply: number;
  moves: MoveRecord[];
  clock: PublicClock;
  result: GameResult | null;
  termination: Termination | null;
  /** Color del jugador que recibe este mensaje. */
  you: Color;
  opponentConnected: boolean;
  drawOfferBy: Color | null;
  rematchOfferedBy: Color[];
};

export type ServerMessage =
  | { t: "ready"; state: PublicState }
  | { t: "state"; state: PublicState }
  | { t: "ack"; cid: string; accepted: boolean; error?: string; ply?: number }
  | { t: "end"; result: GameResult; termination: Termination }
  | { t: "pong"; cid: string; t0: number; t1: number }
  | { t: "error"; code: string; message: string };

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Control de tiempo por defecto: 5 minutos + 3 s por jugada. */
export const DEFAULT_INITIAL_MS = 5 * 60 * 1000;
export const DEFAULT_INCREMENT_MS = 3000;

/** Tope de compensación por latencia: nunca se devuelve más de esto. */
export const MAX_LAG_COMPENSATION_MS = 250;

/** Ventana de gracia para reconectar antes de considerar al jugador ausente. */
export const RECONNECT_GRACE_MS = 15_000;

/** Si ambos están desconectados más de esto, la partida se anula sin rating. */
export const BOTH_DISCONNECTED_ABORT_MS = 60_000;

/** Partidas con menos de estas jugadas se pueden anular sin consecuencias. */
export const ABORTABLE_PLY_LIMIT = 2;

/** Cuántos acks se recuerdan para la idempotencia por `cid`. */
export const ACK_MEMORY = 64;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}
