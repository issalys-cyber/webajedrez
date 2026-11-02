"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, PublicState } from "@webajedrez/shared";
import { gameSocketUrl } from "@/lib/realtime/config";
import { newCid, RealtimeClient } from "@/lib/realtime/client";
import type { ConnectionStatus } from "@/lib/realtime/client";

export type UseOnlineGame = {
  status: ConnectionStatus;
  state: PublicState | null;
  /** Último rechazo del servidor, para poder avisar al jugador. */
  lastError: string | null;
  rttMs: number;
  serverNow: () => number;
  sendMove: (uci: string) => void;
  resign: () => void;
  abort: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  requestRematch: () => void;
  resync: () => void;
  clearError: () => void;
};

/**
 * Conexión con el servidor de una partida concreta.
 *
 * El estado que se pinta es SIEMPRE el del servidor: el cliente no aplica
 * jugadas por su cuenta. Es la única forma de que no se pueda hacer trampa
 * modificando el navegador.
 */
export function useOnlineGame(gameId: string, token: string | null): UseOnlineGame {
  const clientRef = useRef<RealtimeClient | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<PublicState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [rttMs, setRttMs] = useState(0);

  /** Muestra un aviso y lo retira solo: un error pegado se queda para siempre. */
  const flashError = useCallback((message: string | null) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setLastError(message);
    if (message) {
      errorTimer.current = setTimeout(() => setLastError(null), 5000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    const client = new RealtimeClient({
      url: gameSocketUrl(gameId, token),
      onStatus: setStatus,
      onRtt: setRttMs,
      onMessage: (message) => {
        switch (message.t) {
          case "ready":
          case "state":
            setState(message.state);
            break;
          case "ack":
            flashError(message.accepted ? null : describeRejection(message.error));
            break;
          case "error":
            flashError(message.message);
            break;
          case "end":
            // El estado definitivo llega justo detrás con el resultado.
            break;
          case "pong":
            break;
        }
      },
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [gameId, token]);

  const send = useCallback((message: ClientMessage) => {
    clientRef.current?.send(message);
  }, []);

  const sendMove = useCallback(
    (uci: string) => {
      setLastError(null);
      send({
        t: "move",
        cid: newCid("move"),
        ply: state?.ply ?? 0,
        uci,
      });
    },
    [send, state?.ply],
  );

  return {
    status,
    state,
    lastError,
    rttMs,
    serverNow: () => clientRef.current?.serverNow ?? Date.now(),
    sendMove,
    resign: () => send({ t: "resign", cid: newCid("resign") }),
    abort: () => send({ t: "abort", cid: newCid("abort") }),
    offerDraw: () => send({ t: "offer_draw", cid: newCid("draw") }),
    acceptDraw: () => send({ t: "accept_draw", cid: newCid("draw") }),
    declineDraw: () => send({ t: "decline_draw", cid: newCid("draw") }),
    requestRematch: () => send({ t: "rematch_offer", cid: newCid("rematch") }),
    resync: () => send({ t: "sync" }),
    clearError: () => setLastError(null),
  };
}

function describeRejection(code: string | undefined): string {
  switch (code) {
    case "illegal":
      return "Esa jugada no es legal.";
    case "not-your-turn":
      return "No es tu turno.";
    case "stale":
      return "La partida se ha desincronizado; se ha recargado el estado.";
    case "not-playing":
      return "La partida no está en juego.";
    case "too-late-to-abort":
      return "Ya no se puede anular la partida.";
    case "own-offer":
      return "No puedes aceptar tus propias tablas.";
    case "no-offer":
      return "No hay ninguna oferta de tablas.";
    case "not-finished":
      return "La partida no ha terminado.";
    default:
      return code ? `El servidor ha rechazado el mensaje (${code}).` : "Movimiento rechazado.";
  }
}
