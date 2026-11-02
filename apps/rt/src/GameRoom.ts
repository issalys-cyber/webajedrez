/**
 * GameRoom: el estado de una partida y todas sus reglas.
 *
 * Reglas de diseño que hacen que esto sea testeable y portable:
 *
 *  - **Sin red**: entra un mensaje, salen efectos. Nada de sockets aquí.
 *  - **Sin timers**: el tiempo entra como parámetro (`ctx.now`).
 *  - **Sin `Date.now()` interno**: si el reloj se leyera por dentro, no se
 *    podría probar un timeout sin esperar cinco minutos de verdad.
 *  - **Estado serializable**: objetos planos, sin instancias de chess.js.
 *    El tablero se reconstruye rejugando las jugadas, que además es lo único
 *    que mantiene correcta la detección de triple repetición.
 *
 * Por eso el mismo módulo corre en un proceso Node y en un Durable Object.
 */

import { Chess } from "chess.js";
import type { Move } from "chess.js";
import {
  ABORTABLE_PLY_LIMIT,
  ACK_MEMORY,
  BOTH_DISCONNECTED_ABORT_MS,
  DEFAULT_INCREMENT_MS,
  DEFAULT_INITIAL_MS,
  MAX_LAG_COMPENSATION_MS,
  clamp,
  opposite,
} from "@webajedrez/shared";
import type {
  ClientMessage,
  Color,
  GameResult,
  GameStatus,
  MoveRecord,
  PublicState,
  Termination,
} from "@webajedrez/shared";

export type Seat = {
  /** Credencial de asiento: quien tenga el token, tiene el color. */
  token: string;
  /** Milisegundos restantes en el instante `turnStartedAt`. */
  msLeft: number;
  connected: boolean;
  disconnectedAt: number | null;
};

export type Ack = { accepted: boolean; error?: string; ply?: number };

export type RoomState = {
  gameId: string;
  status: GameStatus;
  seats: Record<Color, Seat>;
  /** Solo la jugada: `uci` y quién la hizo. El SAN se deriva al publicar. */
  moves: { uci: string; by: Color; at: number }[];
  initialMs: number;
  incrementMs: number;
  /** Instante en el que empezó a correr el turno actual (epoch ms). */
  turnStartedAt: number | null;
  result: GameResult | null;
  termination: Termination | null;
  drawOfferBy: Color | null;
  rematchOffers: Color[];
  /** Idempotencia: últimos acks por `cid`. */
  acks: Record<string, Ack>;
  ackOrder: string[];
  bothDisconnectedAt: number | null;
  createdAt: number;
};

export type Context = {
  /** Instante actual del servidor. Siempre inyectado. */
  now: number;
  /** Latencia estimada del jugador que envía; se descuenta de su reloj. */
  lagMs?: number;
};

export type Effect =
  | { kind: "broadcast" }
  | { kind: "end" }
  | { kind: "ack"; to: Color; cid: string; ack: Ack }
  | { kind: "error"; to: Color; code: string; message: string };

export type Roomy = { state: RoomState; effects: Effect[] };

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------

export function createRoom(params: {
  gameId: string;
  whiteToken: string;
  blackToken: string;
  now: number;
  initialMs?: number;
  incrementMs?: number;
}): RoomState {
  const initialMs = params.initialMs ?? DEFAULT_INITIAL_MS;
  const incrementMs = params.incrementMs ?? DEFAULT_INCREMENT_MS;

  return {
    gameId: params.gameId,
    status: "waiting",
    seats: {
      w: {
        token: params.whiteToken,
        msLeft: initialMs,
        connected: false,
        disconnectedAt: null,
      },
      b: {
        token: params.blackToken,
        msLeft: initialMs,
        connected: false,
        disconnectedAt: null,
      },
    },
    moves: [],
    initialMs,
    incrementMs,
    turnStartedAt: null,
    result: null,
    termination: null,
    drawOfferBy: null,
    rematchOffers: [],
    acks: {},
    ackOrder: [],
    bothDisconnectedAt: null,
    createdAt: params.now,
  };
}

/** Color del asiento que corresponde a un token, o null si no es de nadie. */
export function colorOfToken(state: RoomState, token: string): Color | null {
  if (state.seats.w.token === token) return "w";
  if (state.seats.b.token === token) return "b";
  return null;
}

// ---------------------------------------------------------------------------
// Reconstrucción del tablero
// ---------------------------------------------------------------------------

function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

/**
 * Reconstruye el tablero rejugando la partida desde la posición inicial.
 *
 * Se hace así, y no guardando un FEN, porque la triple repetición depende del
 * historial de posiciones. Rejugar 80 jugadas cuesta microsegundos.
 */
export function replay(state: RoomState): Chess {
  const chess = new Chess();
  for (const move of state.moves) {
    chess.move(uciToMove(move.uci));
  }
  return chess;
}

function detectEnd(
  chess: Chess,
): { result: GameResult; termination: Termination } | null {
  // Quien está a mover es quien acaba de recibir el mate o el ahogado.
  const turn = chess.turn();

  if (chess.isCheckmate()) {
    return { result: turn === "w" ? "0-1" : "1-0", termination: "checkmate" };
  }
  if (chess.isStalemate()) return { result: "1/2-1/2", termination: "stalemate" };
  if (chess.isInsufficientMaterial()) {
    return { result: "1/2-1/2", termination: "insufficient" };
  }
  if (chess.isThreefoldRepetition()) {
    return { result: "1/2-1/2", termination: "threefold" };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { result: "1/2-1/2", termination: "fifty-move" };
  }
  if (chess.isDraw()) return { result: "1/2-1/2", termination: "fifty-move" };
  return null;
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function finish(
  state: RoomState,
  result: GameResult | null,
  termination: Termination,
  options: { aborted?: boolean } = {},
): { state: RoomState; effects: Effect[] } {
  const next: RoomState = {
    ...state,
    status: options.aborted ? "aborted" : "finished",
    result,
    termination,
    turnStartedAt: null,
    drawOfferBy: null,
    rematchOffers: [],
  };
  return { state: next, effects: [{ kind: "broadcast" }, { kind: "end" }] };
}

function rememberAck(state: RoomState, cid: string, ack: Ack): RoomState {
  const acks = { ...state.acks, [cid]: ack };
  const order = [...state.ackOrder, cid];
  while (order.length > ACK_MEMORY) {
    const removed = order.shift();
    if (removed !== undefined) delete acks[removed];
  }
  return { ...state, acks, ackOrder: order };
}

function reject(
  state: RoomState,
  to: Color,
  cid: string,
  error: string,
  options: { resync?: boolean } = {},
): { state: RoomState; effects: Effect[] } {
  const ack: Ack = { accepted: false, error, ply: state.moves.length };
  const effects: Effect[] = [{ kind: "ack", to, cid, ack }];
  // Ante un desacuerdo de estado, lo más robusto es reenviar el estado
  // completo en lugar de intentar un parche incremental.
  if (options.resync) effects.push({ kind: "broadcast" });
  return { state: rememberAck(state, cid, ack), effects };
}

function remainingFor(state: RoomState, color: Color, now: number): number {
  const seat = state.seats[color];
  if (state.status !== "playing" || state.turnStartedAt === null) {
    return seat.msLeft;
  }
  const running = replay(state).turn() === color;
  if (!running) return seat.msLeft;
  return Math.max(0, seat.msLeft - (now - state.turnStartedAt));
}

// ---------------------------------------------------------------------------
// Presencia
// ---------------------------------------------------------------------------

export function joinRoom(
  state: RoomState,
  color: Color,
  ctx: Context,
): { state: RoomState; effects: Effect[] } {
  const seats = {
    ...state.seats,
    [color]: { ...state.seats[color], connected: true, disconnectedAt: null },
  };

  let next: RoomState = { ...state, seats, bothDisconnectedAt: null };

  // La partida empieza cuando están los dos. Es entonces cuando arranca el
  // reloj de las blancas.
  if (
    next.status === "waiting" &&
    next.seats.w.connected &&
    next.seats.b.connected
  ) {
    next = { ...next, status: "playing", turnStartedAt: ctx.now };
  }

  return { state: next, effects: [{ kind: "broadcast" }] };
}

export function leaveRoom(
  state: RoomState,
  color: Color,
  ctx: Context,
): { state: RoomState; effects: Effect[] } {
  if (!state.seats[color].connected) {
    return { state, effects: [] };
  }

  const seats = {
    ...state.seats,
    [color]: { ...state.seats[color], connected: false, disconnectedAt: ctx.now },
  };
  const bothGone = !seats.w.connected && !seats.b.connected;

  return {
    state: {
      ...state,
      seats,
      bothDisconnectedAt: bothGone
        ? (state.bothDisconnectedAt ?? ctx.now)
        : null,
    },
    effects: [{ kind: "broadcast" }],
  };
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

export function applyMessage(
  state: RoomState,
  from: Color,
  msg: ClientMessage,
  ctx: Context,
): { state: RoomState; effects: Effect[] } {
  switch (msg.t) {
    case "move":
      return handleMove(state, from, msg, ctx);
    case "resign":
      return handleResign(state, from, msg.cid);
    case "abort":
      return handleAbort(state, from, msg.cid);
    case "offer_draw":
      return handleOfferDraw(state, from, msg.cid);
    case "accept_draw":
      return handleAcceptDraw(state, from, msg.cid);
    case "decline_draw":
      return handleDeclineDraw(state, from, msg.cid);
    case "rematch_offer":
    case "rematch_accept":
      return handleRematch(state, from, msg.cid, ctx);
    case "sync":
      return { state, effects: [{ kind: "broadcast" }] };
    case "ping":
      // La latencia la gestiona el transporte, no el estado de la partida.
      return { state, effects: [] };
    default:
      return {
        state,
        effects: [
          { kind: "error", to: from, code: "unknown-message", message: "Mensaje desconocido." },
        ],
      };
  }
}

function handleMove(
  state: RoomState,
  from: Color,
  msg: Extract<ClientMessage, { t: "move" }>,
  ctx: Context,
): { state: RoomState; effects: Effect[] } {
  const remembered = state.acks[msg.cid];
  if (remembered) {
    return { state, effects: [{ kind: "ack", to: from, cid: msg.cid, ack: remembered }] };
  }

  if (state.status !== "playing") {
    return reject(state, from, msg.cid, "not-playing");
  }
  if (from !== replay(state).turn()) {
    return reject(state, from, msg.cid, "not-your-turn");
  }
  if (msg.ply !== state.moves.length) {
    return reject(state, from, msg.cid, "stale", { resync: true });
  }

  // ---- Reloj: se cobra el tiempo transcurrido antes de aplicar la jugada ----
  const elapsed =
    state.turnStartedAt === null ? 0 : Math.max(0, ctx.now - state.turnStartedAt);
  const lag = clamp(ctx.lagMs ?? 0, 0, MAX_LAG_COMPENSATION_MS);
  const charge = Math.max(0, elapsed - lag);
  const seat = state.seats[from];
  const msLeft = Math.max(0, seat.msLeft - charge);

  if (msLeft <= 0) {
    // Bandera caída: pierde quien intentaba mover. La jugada no se aplica.
    const next: RoomState = {
      ...state,
      seats: { ...state.seats, [from]: { ...seat, msLeft: 0 } },
    };
    const result: GameResult = from === "w" ? "0-1" : "1-0";
    return finish(next, result, "timeout");
  }

  // ---- Legalidad ----
  const chess = replay(state);
  let applied: Move;
  try {
    applied = chess.move(uciToMove(msg.uci));
  } catch {
    return reject(state, from, msg.cid, "illegal");
  }

  const ack: Ack = { accepted: true, ply: state.moves.length };
  let next: RoomState = rememberAck(
    {
      ...state,
      seats: {
        ...state.seats,
        [from]: { ...seat, msLeft: msLeft + state.incrementMs },
      },
      moves: [...state.moves, { uci: msg.uci, by: from, at: ctx.now }],
      turnStartedAt: ctx.now,
      drawOfferBy: null,
    },
    msg.cid,
    ack,
  );

  const effects: Effect[] = [{ kind: "ack", to: from, cid: msg.cid, ack }];

  const end = detectEnd(chess);
  if (end) {
    const done = finish(next, end.result, end.termination);
    return { state: done.state, effects: [...effects, ...done.effects] };
  }

  return { state: next, effects: [...effects, { kind: "broadcast" }] };
}

function handleResign(
  state: RoomState,
  from: Color,
  cid: string,
): { state: RoomState; effects: Effect[] } {
  if (state.status !== "playing") {
    return reject(state, from, cid, "not-playing");
  }
  const result: GameResult = from === "w" ? "0-1" : "1-0";
  const done = finish(
    rememberAck(state, cid, { accepted: true, ply: state.moves.length }),
    result,
    "resign",
  );
  return {
    state: done.state,
    effects: [{ kind: "ack", to: from, cid, ack: { accepted: true } }, ...done.effects],
  };
}

function handleAbort(
  state: RoomState,
  from: Color,
  cid: string,
): { state: RoomState; effects: Effect[] } {
  if (state.status !== "playing" && state.status !== "waiting") {
    return reject(state, from, cid, "not-playable");
  }
  if (state.moves.length >= ABORTABLE_PLY_LIMIT) {
    return reject(state, from, cid, "too-late-to-abort");
  }
  const done = finish(state, null, "aborted", { aborted: true });
  return {
    state: rememberAck(done.state, cid, { accepted: true }),
    effects: [{ kind: "ack", to: from, cid, ack: { accepted: true } }, ...done.effects],
  };
}

function handleOfferDraw(
  state: RoomState,
  from: Color,
  cid: string,
): { state: RoomState; effects: Effect[] } {
  if (state.status !== "playing") {
    return reject(state, from, cid, "not-playing");
  }
  if (state.drawOfferBy === from) {
    return reject(state, from, cid, "already-offered");
  }
  const next = rememberAck(
    { ...state, drawOfferBy: from },
    cid,
    { accepted: true },
  );
  return {
    state: next,
    effects: [{ kind: "ack", to: from, cid, ack: { accepted: true } }, { kind: "broadcast" }],
  };
}

function handleAcceptDraw(
  state: RoomState,
  from: Color,
  cid: string,
): { state: RoomState; effects: Effect[] } {
  if (state.status !== "playing") {
    return reject(state, from, cid, "not-playing");
  }
  if (state.drawOfferBy === null) {
    return reject(state, from, cid, "no-offer");
  }
  if (state.drawOfferBy === from) {
    return reject(state, from, cid, "own-offer");
  }
  const done = finish(
    rememberAck(state, cid, { accepted: true }),
    "1/2-1/2",
    "draw-agreed",
  );
  return {
    state: done.state,
    effects: [{ kind: "ack", to: from, cid, ack: { accepted: true } }, ...done.effects],
  };
}

function handleDeclineDraw(
  state: RoomState,
  from: Color,
  cid: string,
): { state: RoomState; effects: Effect[] } {
  if (state.drawOfferBy === null || state.drawOfferBy === from) {
    return reject(state, from, cid, "no-offer");
  }
  const next = rememberAck(
    { ...state, drawOfferBy: null },
    cid,
    { accepted: true },
  );
  return {
    state: next,
    effects: [{ kind: "ack", to: from, cid, ack: { accepted: true } }, { kind: "broadcast" }],
  };
}

function handleRematch(
  state: RoomState,
  from: Color,
  cid: string,
  ctx: Context,
): { state: RoomState; effects: Effect[] } {
  if (state.status !== "finished") {
    return reject(state, from, cid, "not-finished");
  }

  const offers = state.rematchOffers.includes(from)
    ? state.rematchOffers
    : [...state.rematchOffers, from];

  if (offers.length < 2) {
    return {
      state: rememberAck({ ...state, rematchOffers: offers }, cid, { accepted: true }),
      effects: [{ kind: "ack", to: from, cid, ack: { accepted: true } }, { kind: "broadcast" }],
    };
  }

  // Revancha aceptada: se intercambian los asientos (los tokens viajan con el
  // jugador, así que cada uno cambia de color) y se reinicia el reloj.
  const swapped: Record<Color, Seat> = {
    w: {
      ...state.seats.b,
      msLeft: state.initialMs,
    },
    b: {
      ...state.seats.w,
      msLeft: state.initialMs,
    },
  };

  const next: RoomState = {
    ...state,
    status: "playing",
    seats: swapped,
    moves: [],
    turnStartedAt: ctx.now,
    result: null,
    termination: null,
    drawOfferBy: null,
    rematchOffers: [],
    acks: {},
    ackOrder: [],
    bothDisconnectedAt: null,
  };

  return {
    state: next,
    effects: [{ kind: "ack", to: from, cid, ack: { accepted: true } }, { kind: "broadcast" }],
  };
}

// ---------------------------------------------------------------------------
// Relojes: se llama periódicamente aunque nadie envíe mensajes
// ---------------------------------------------------------------------------

export function tickRoom(
  state: RoomState,
  ctx: Context,
): { state: RoomState; effects: Effect[] } {
  // Si los dos se han ido, la partida se anula: no tiene sentido dejarla
  // colgada ni inventarse un resultado.
  //
  // Este control va ANTES del de tiempo a propósito: si ambos están fuera y el
  // reloj se agota, anular es más honesto que darle la victoria a alguien que
  // tampoco está. Con un solo jugador ausente, en cambio, el reloj manda y se
  // pierde por tiempo.
  if (state.bothDisconnectedAt !== null) {
    const bothGone = !state.seats.w.connected && !state.seats.b.connected;
    if (bothGone && ctx.now - state.bothDisconnectedAt > BOTH_DISCONNECTED_ABORT_MS) {
      return finish(state, null, "aborted", { aborted: true });
    }
  }

  if (state.status === "playing" && state.turnStartedAt !== null) {
    const turn = replay(state).turn();
    if (remainingFor(state, turn, ctx.now) <= 0) {
      const result: GameResult = turn === "w" ? "0-1" : "1-0";
      const next: RoomState = {
        ...state,
        seats: {
          ...state.seats,
          [turn]: { ...state.seats[turn], msLeft: 0 },
        },
      };
      return finish(next, result, "timeout");
    }
  }

  return { state, effects: [] };
}

// ---------------------------------------------------------------------------
// Cuándo hay que despertar al servidor
// ---------------------------------------------------------------------------

/**
 * Instante en el que hay que volver a mirar el estado, o null si no hace falta
 * despertar a nadie.
 *
 * Lo usan los adaptadores que no pueden permitirse un temporizador perpetuo:
 * en Durable Objects cada despertar cuesta una petición, así que se programa
 * una alarma exactamente para la caída de bandera (o para el abandono), en
 * lugar de comprobar el reloj cada medio segundo.
 */
export function nextDeadline(state: RoomState): number | null {
  let deadline: number | null = null;

  if (state.status === "playing" && state.turnStartedAt !== null) {
    const turn = replay(state).turn();
    deadline = state.turnStartedAt + state.seats[turn].msLeft;
  }

  if (state.bothDisconnectedAt !== null) {
    const abortAt = state.bothDisconnectedAt + BOTH_DISCONNECTED_ABORT_MS;
    deadline = deadline === null ? abortAt : Math.min(deadline, abortAt);
  }

  return deadline;
}

// ---------------------------------------------------------------------------
// Publicación del estado
// ---------------------------------------------------------------------------

export function publicState(state: RoomState, viewer: Color): PublicState {
  const chess = new Chess();
  const moves: MoveRecord[] = [];

  for (const move of state.moves) {
    const applied = chess.move(uciToMove(move.uci));
    moves.push({
      uci: move.uci,
      san: applied.san,
      ply: moves.length,
      by: move.by,
    });
  }

  const turn = chess.turn();

  return {
    gameId: state.gameId,
    status: state.status,
    fen: chess.fen(),
    turn,
    ply: state.moves.length,
    moves,
    clock: {
      whiteMs: state.seats.w.msLeft,
      blackMs: state.seats.b.msLeft,
      turn,
      running: state.status === "playing" && state.turnStartedAt !== null,
      turnStartedAt: state.turnStartedAt,
      initialMs: state.initialMs,
      incrementMs: state.incrementMs,
    },
    result: state.result,
    termination: state.termination,
    you: viewer,
    opponentConnected: state.seats[opposite(viewer)].connected,
    drawOfferBy: state.drawOfferBy,
    rematchOfferedBy: [...state.rematchOffers],
  };
}
