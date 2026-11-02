import { describe, expect, it } from "vitest";
import {
  applyMessage,
  colorOfToken,
  createRoom,
  joinRoom,
  leaveRoom,
  nextDeadline,
  publicState,
  tickRoom,
} from "../src/GameRoom.ts";
import type { RoomState } from "../src/GameRoom.ts";
import {
  BOTH_DISCONNECTED_ABORT_MS,
  RECONNECT_GRACE_MS,
} from "@webajedrez/shared";

const T0 = 1_000_000;

/** Partida con los dos jugadores dentro, reloj de 60 s + 1 s por jugada. */
function startedRoom(overrides: Partial<Parameters<typeof createRoom>[0]> = {}): RoomState {
  const created = createRoom({
    gameId: "game-1",
    whiteToken: "wtok",
    blackToken: "btok",
    now: T0,
    initialMs: 60_000,
    incrementMs: 1_000,
    ...overrides,
  });
  const withWhite = joinRoom(created, "w", { now: T0 }).state;
  return joinRoom(withWhite, "b", { now: T0 }).state;
}

/** Envía una jugada con el `ply` y el `cid` correctos. */
function play(state: RoomState, from: "w" | "b", uci: string, now: number) {
  const cid = `c${state.moves.length}-${from}`;
  return applyMessage(
    state,
    from,
    { t: "move", cid, ply: state.moves.length, uci },
    { now },
  );
}

describe("creación y presencia", () => {
  it("nace esperando, con los relojes completos", () => {
    const room = createRoom({
      gameId: "g",
      whiteToken: "a",
      blackToken: "b",
      now: T0,
      initialMs: 180_000,
      incrementMs: 2_000,
    });
    expect(room.status).toBe("waiting");
    expect(room.seats.w.msLeft).toBe(180_000);
    expect(room.seats.b.msLeft).toBe(180_000);
    expect(room.turnStartedAt).toBeNull();
    expect(room.moves).toEqual([]);
  });

  it("empieza a jugar cuando llegan los dos, y arranca el reloj", () => {
    const created = createRoom({
      gameId: "g",
      whiteToken: "a",
      blackToken: "b",
      now: T0,
    });
    const one = joinRoom(created, "w", { now: T0 + 5 }).state;
    expect(one.status).toBe("waiting");
    expect(one.turnStartedAt).toBeNull();

    const two = joinRoom(one, "b", { now: T0 + 9 }).state;
    expect(two.status).toBe("playing");
    expect(two.turnStartedAt).toBe(T0 + 9);
  });

  it("identifica el color por token y rechaza tokens ajenos", () => {
    const room = startedRoom();
    expect(colorOfToken(room, "wtok")).toBe("w");
    expect(colorOfToken(room, "btok")).toBe("b");
    expect(colorOfToken(room, "intruso")).toBeNull();
  });

  it("marca la desconexión del rival sin parar el reloj", () => {
    const room = startedRoom();
    const after = leaveRoom(room, "b", { now: T0 + 1_000 }).state;

    expect(after.seats.b.connected).toBe(false);
    expect(after.seats.b.disconnectedAt).toBe(T0 + 1_000);
    // El reloj sigue su curso: abandonar cuesta tiempo.
    expect(after.status).toBe("playing");
    expect(after.turnStartedAt).toBe(T0);

    const view = publicState(after, "w");
    expect(view.opponentConnected).toBe(false);
  });

  it("al volver a conectarse se limpia la marca de desconexión", () => {
    let room = leaveRoom(startedRoom(), "b", { now: T0 + 1_000 }).state;
    room = joinRoom(room, "b", { now: T0 + 1_000 + RECONNECT_GRACE_MS }).state;
    expect(room.seats.b.connected).toBe(true);
    expect(room.seats.b.disconnectedAt).toBeNull();
    expect(room.bothDisconnectedAt).toBeNull();
  });
});

describe("jugadas", () => {
  it("acepta una jugada legal y descuenta el tiempo con incremento", () => {
    const room = startedRoom();
    const result = play(room, "w", "e2e4", T0 + 3_000);

    expect(result.state.moves).toHaveLength(1);
    expect(result.state.moves[0]?.uci).toBe("e2e4");
    // 60 s - 3 s + 1 s de incremento
    expect(result.state.seats.w.msLeft).toBe(58_000);
    expect(result.state.turnStartedAt).toBe(T0 + 3_000);
    expect(result.effects).toContainEqual({ kind: "broadcast" });
    expect(result.effects).toContainEqual({
      kind: "ack",
      to: "w",
      cid: "c0-w",
      ack: { accepted: true, ply: 0 },
    });
  });

  it("rechaza una jugada ilegal sin tocar el estado", () => {
    const room = startedRoom();
    const result = play(room, "w", "e2e5", T0 + 1_000);

    expect(result.state.moves).toHaveLength(0);
    expect(result.state.seats.w.msLeft).toBe(60_000);
    expect(result.effects[0]).toMatchObject({
      kind: "ack",
      to: "w",
      ack: { accepted: false, error: "illegal" },
    });
  });

  it("rechaza mover fuera de turno", () => {
    const room = startedRoom();
    const result = play(room, "b", "e7e5", T0 + 1_000);
    expect(result.state.moves).toHaveLength(0);
    expect(result.effects[0]).toMatchObject({ ack: { error: "not-your-turn" } });
  });

  it("es idempotente: el mismo cid no aplica la jugada dos veces", () => {
    const room = startedRoom();
    const first = applyMessage(
      room,
      "w",
      { t: "move", cid: "abc", ply: 0, uci: "e2e4" },
      { now: T0 + 1_000 },
    );
    expect(first.state.moves).toHaveLength(1);

    const retry = applyMessage(
      first.state,
      "w",
      { t: "move", cid: "abc", ply: 0, uci: "e2e4" },
      { now: T0 + 2_000 },
    );

    expect(retry.state.moves).toHaveLength(1);
    expect(retry.state.seats.w.msLeft).toBe(first.state.seats.w.msLeft);
    expect(retry.effects).toEqual([
      { kind: "ack", to: "w", cid: "abc", ack: { accepted: true, ply: 0 } },
    ]);
  });

  it("rechaza un ply obsoleto y pide resincronización", () => {
    const room = startedRoom();
    const result = applyMessage(
      room,
      "w",
      { t: "move", cid: "x", ply: 5, uci: "e2e4" },
      { now: T0 + 1_000 },
    );

    expect(result.state.moves).toHaveLength(0);
    expect(result.effects).toContainEqual(expect.objectContaining({ kind: "broadcast" }));
    expect(result.effects[0]).toMatchObject({ ack: { error: "stale" } });
  });

  it("aplica una promoción con la pieza indicada", () => {
    const room = createRoom({
      gameId: "g",
      whiteToken: "wtok",
      blackToken: "btok",
      now: T0,
      initialMs: 60_000,
      incrementMs: 0,
    });
    // Se fabrica una posición con peón a punto de promocionar rejugando no se
    // puede (el estado parte del inicio), así que se usa el propio flujo:
    // se inyectan jugadas hasta llegar a una promoción real.
    let state = joinRoom(joinRoom(room, "w", { now: T0 }).state, "b", { now: T0 }).state;

    const line: Array<["w" | "b", string]> = [
      ["w", "h2h4"],
      ["b", "g7g5"],
      ["w", "h4g5"],
      ["b", "b8c6"],
      ["w", "g5g6"],
      ["b", "c6b8"],
      ["w", "g6h7"],
      ["b", "b8c6"],
      ["w", "h7g8q"],
    ];

    let now = T0;
    for (const [color, uci] of line) {
      now += 500;
      const step = play(state, color, uci, now);
      expect(step.effects[0]).toMatchObject({ ack: { accepted: true } });
      state = step.state;
    }

    expect(state.moves.at(-1)?.uci).toBe("h7g8q");
    expect(publicState(state, "w").fen).toContain("Q");
  });
});

describe("final de la partida", () => {
  it("detecta el jaque mate y da el resultado correcto", () => {
    let state = startedRoom();
    let now = T0;
    // Mate del loco: 1. f3 e5 2. g4 Qh4#
    for (const [color, uci] of [
      ["w", "f2f3"],
      ["b", "e7e5"],
      ["w", "g2g4"],
      ["b", "d8h4"],
    ] as Array<["w" | "b", string]>) {
      now += 1_000;
      state = play(state, color, uci, now).state;
    }

    expect(state.status).toBe("finished");
    expect(state.result).toBe("0-1");
    expect(state.termination).toBe("checkmate");
    expect(state.turnStartedAt).toBeNull();
  });

  it("una rendición da la victoria al rival", () => {
    const room = startedRoom();
    const result = applyMessage(room, "w", { t: "resign", cid: "r1" }, { now: T0 + 1_000 });
    expect(result.state.status).toBe("finished");
    expect(result.state.result).toBe("0-1");
    expect(result.state.termination).toBe("resign");
    expect(result.effects).toContainEqual({ kind: "end" });
  });

  it("no se puede rendir si la partida ya terminó", () => {
    const finished = applyMessage(startedRoom(), "w", { t: "resign", cid: "r1" }, { now: T0 }).state;
    const again = applyMessage(finished, "b", { t: "resign", cid: "r2" }, { now: T0 });
    expect(again.effects[0]).toMatchObject({ ack: { error: "not-playing" } });
  });

  it("se puede anular antes de la segunda jugada, pero no después", () => {
    const room = startedRoom();
    const early = applyMessage(room, "w", { t: "abort", cid: "a1" }, { now: T0 + 100 });
    expect(early.state.status).toBe("aborted");
    expect(early.state.result).toBeNull();
    expect(early.state.termination).toBe("aborted");

    // Con una sola jugada todavía se puede anular: el límite son dos.
    const afterOne = play(room, "w", "e2e4", T0 + 1_000).state;
    const stillAbortable = applyMessage(
      afterOne,
      "w",
      { t: "abort", cid: "a2" },
      { now: T0 + 1_500 },
    );
    expect(stillAbortable.state.status).toBe("aborted");

    const afterTwo = play(afterOne, "b", "e7e5", T0 + 2_000).state;
    const late = applyMessage(afterTwo, "w", { t: "abort", cid: "a3" }, { now: T0 + 3_000 });
    expect(late.state.status).toBe("playing");
    expect(late.effects[0]).toMatchObject({ ack: { error: "too-late-to-abort" } });
  });

  it("tablas de mutuo acuerdo", () => {
    const room = startedRoom();
    const offered = applyMessage(room, "w", { t: "offer_draw", cid: "d1" }, { now: T0 + 500 });
    expect(offered.state.drawOfferBy).toBe("w");

    const accepted = applyMessage(
      offered.state,
      "b",
      { t: "accept_draw", cid: "d2" },
      { now: T0 + 900 },
    );
    expect(accepted.state.status).toBe("finished");
    expect(accepted.state.result).toBe("1/2-1/2");
    expect(accepted.state.termination).toBe("draw-agreed");
  });

  it("rechazar las tablas deja la partida en juego", () => {
    const offered = applyMessage(
      startedRoom(),
      "w",
      { t: "offer_draw", cid: "d1" },
      { now: T0 + 500 },
    ).state;

    const declined = applyMessage(offered, "b", { t: "decline_draw", cid: "d2" }, { now: T0 + 900 })
      .state;
    expect(declined.status).toBe("playing");
    expect(declined.drawOfferBy).toBeNull();
  });

  it("nadie puede aceptar sus propias tablas", () => {
    const offered = applyMessage(
      startedRoom(),
      "w",
      { t: "offer_draw", cid: "d1" },
      { now: T0 + 500 },
    ).state;
    const attempt = applyMessage(offered, "w", { t: "accept_draw", cid: "d2" }, { now: T0 + 600 });
    expect(attempt.state.status).toBe("playing");
    expect(attempt.effects[0]).toMatchObject({ ack: { error: "own-offer" } });
  });

  it("tablas por triple repetición", () => {
    let state = startedRoom();
    let now = T0;
    // Los caballos van y vienen: misma posición tres veces.
    for (const [color, uci] of [
      ["w", "g1f3"],
      ["b", "g8f6"],
      ["w", "f3g1"],
      ["b", "f6g8"],
      ["w", "g1f3"],
      ["b", "g8f6"],
      ["w", "f3g1"],
      ["b", "f6g8"],
    ] as Array<["w" | "b", string]>) {
      now += 1_000;
      state = play(state, color, uci, now).state;
    }

    expect(state.status).toBe("finished");
    expect(state.termination).toBe("threefold");
    expect(state.result).toBe("1/2-1/2");
  });
});

describe("relojes", () => {
  it("si se le acaba el tiempo al mover, pierde y la jugada no se aplica", () => {
    const room = startedRoom({ initialMs: 2_000, incrementMs: 0 });
    const result = play(room, "w", "e2e4", T0 + 2_500);

    expect(result.state.status).toBe("finished");
    expect(result.state.result).toBe("0-1");
    expect(result.state.termination).toBe("timeout");
    expect(result.state.moves).toHaveLength(0);
    expect(result.state.seats.w.msLeft).toBe(0);
  });

  it("el tick declara la caída de bandera sin necesidad de mensajes", () => {
    const room = startedRoom({ initialMs: 2_000, incrementMs: 0 });

    const early = tickRoom(room, { now: T0 + 1_500 });
    expect(early.state.status).toBe("playing");

    const late = tickRoom(room, { now: T0 + 2_000 });
    expect(late.state.status).toBe("finished");
    expect(late.state.termination).toBe("timeout");
    // Las blancas son las que estaban pensando, así que ganan las negras.
    expect(late.state.result).toBe("0-1");
    expect(late.effects).toContainEqual({ kind: "end" });
  });

  it("la compensación por latencia descuenta tiempo del cobro", () => {
    const room = startedRoom({ incrementMs: 0 });
    const normal = play(room, "w", "e2e4", T0 + 2_000);
    const compensated = applyMessage(
      room,
      "w",
      { t: "move", cid: "lag", ply: 0, uci: "e2e4" },
      { now: T0 + 2_000, lagMs: 200 },
    );

    expect(normal.state.seats.w.msLeft).toBe(58_000);
    expect(compensated.state.seats.w.msLeft).toBe(58_200);
  });

  it("la compensación por latencia tiene tope", () => {
    const room = startedRoom({ incrementMs: 0 });
    const result = applyMessage(
      room,
      "w",
      { t: "move", cid: "lag", ply: 0, uci: "e2e4" },
      { now: T0 + 2_000, lagMs: 9_999 },
    );
    // Se descuenta como mucho 250 ms, nunca más.
    expect(result.state.seats.w.msLeft).toBe(60_000 - 2_000 + 250);
  });

  it("al desconectarse los dos, la partida se anula pasado el margen", () => {
    let room = startedRoom();
    room = leaveRoom(room, "w", { now: T0 + 1_000 }).state;
    // Mientras uno siga dentro, la partida no se anula.
    expect(room.bothDisconnectedAt).toBeNull();

    room = leaveRoom(room, "b", { now: T0 + 2_000 }).state;
    // Se registra el instante en que se ha ido el último.
    expect(room.bothDisconnectedAt).toBe(T0 + 2_000);

    const soon = tickRoom(room, { now: T0 + 3_000 });
    expect(soon.state.status).toBe("playing");

    const later = tickRoom(room, {
      now: T0 + 2_000 + BOTH_DISCONNECTED_ABORT_MS + 1,
    });
    expect(later.state.status).toBe("aborted");
    expect(later.state.result).toBeNull();
  });
});

describe("revancha", () => {
  it("hace falta que la pidan los dos y luego se intercambian los colores", () => {
    const finished = applyMessage(startedRoom(), "w", { t: "resign", cid: "r" }, { now: T0 }).state;

    const one = applyMessage(
      finished,
      "w",
      { t: "rematch_offer", cid: "m1" },
      { now: T0 + 1_000 },
    ).state;
    expect(one.status).toBe("finished");
    expect(one.rematchOffers).toEqual(["w"]);

    const two = applyMessage(
      one,
      "b",
      { t: "rematch_accept", cid: "m2" },
      { now: T0 + 2_000 },
    ).state;

    expect(two.status).toBe("playing");
    expect(two.moves).toEqual([]);
    expect(two.result).toBeNull();
    expect(two.turnStartedAt).toBe(T0 + 2_000);
    expect(two.seats.w.msLeft).toBe(60_000);
    // El token de las blancas ahora juega con negras.
    expect(colorOfToken(two, "wtok")).toBe("b");
    expect(colorOfToken(two, "btok")).toBe("w");
  });

  it("no se puede pedir revancha con la partida en marcha", () => {
    const result = applyMessage(
      startedRoom(),
      "w",
      { t: "rematch_offer", cid: "m" },
      { now: T0 + 1_000 },
    );
    expect(result.effects[0]).toMatchObject({ ack: { error: "not-finished" } });
  });
});

describe("publicación del estado", () => {
  it("publica la posición, el SAN y el color de quien mira", () => {
    let state = startedRoom();
    state = play(state, "w", "e2e4", T0 + 1_000).state;
    state = play(state, "b", "e7e5", T0 + 2_000).state;

    const forWhite = publicState(state, "w");
    expect(forWhite.you).toBe("w");
    expect(forWhite.moves.map((m) => m.san)).toEqual(["e4", "e5"]);
    expect(forWhite.ply).toBe(2);
    expect(forWhite.turn).toBe("w");
    expect(forWhite.clock.running).toBe(true);
    expect(forWhite.opponentConnected).toBe(true);

    const forBlack = publicState(state, "b");
    expect(forBlack.you).toBe("b");
    expect(forBlack.fen).toBe(forWhite.fen);
  });

  it("sincronizar no altera el estado", () => {
    const room = startedRoom();
    const result = applyMessage(room, "w", { t: "sync" }, { now: T0 + 5_000 });
    expect(result.state).toEqual(room);
    expect(result.effects).toEqual([{ kind: "broadcast" }]);
  });
});

describe("cuándo hay que despertar al servidor", () => {
  it("programa el aviso para el instante de la caída de bandera", () => {
    // Reloj de 60 s que empieza a correr en T0 con las blancas: la bandera cae
    // en T0 + 60_000.
    expect(nextDeadline(startedRoom())).toBe(T0 + 60_000);
  });

  it("tras una jugada, el aviso se mueve al turno del rival", () => {
    const afterMove = play(startedRoom(), "w", "e2e4", T0 + 2_000).state;
    // Las blancas gastaron 2 s y ganaron 1 s de incremento: 59 s restantes,
    // pero ahora le toca a las negras, cuyo reloj arrancó en T0 + 2_000.
    expect(nextDeadline(afterMove)).toBe(T0 + 2_000 + 60_000);
  });

  it("no programa nada si la partida ha terminado", () => {
    const finished = applyMessage(startedRoom(), "w", { t: "resign", cid: "r" }, { now: T0 }).state;
    expect(nextDeadline(finished)).toBeNull();
  });

  it("programa el abandono si los dos se han ido antes que la bandera", () => {
    let room = startedRoom();
    room = leaveRoom(room, "w", { now: T0 + 1_000 }).state;
    room = leaveRoom(room, "b", { now: T0 + 1_500 }).state;

    const flagAt = T0 + 60_000;
    const abortAt = T0 + 1_500 + BOTH_DISCONNECTED_ABORT_MS;
    expect(nextDeadline(room)).toBe(Math.min(flagAt, abortAt));
  });
});
