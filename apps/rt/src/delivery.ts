/**
 * Traducción de efectos del GameRoom a mensajes para los clientes.
 *
 * Vive aparte porque la usan los dos transportes (Node y Durable Objects) y no
 * conviene que se separen: si un día cambia la forma de un mensaje, cambia en
 * un solo sitio.
 */

import type { Color, ServerMessage } from "@webajedrez/shared";
import { publicState } from "./GameRoom.ts";
import type { Effect, RoomState } from "./GameRoom.ts";

/** `to: "all"` significa: a todos los sockets conectados, sin importar color. */
export type Outgoing = { to: Color | "all"; message: ServerMessage };

function stateMessages(state: RoomState): Outgoing[] {
  return (["w", "b"] as Color[]).map((color) => ({
    to: color,
    message: { t: "state", state: publicState(state, color) },
  }));
}

export function deliver(effect: Effect, state: RoomState): Outgoing[] {
  switch (effect.kind) {
    case "ack":
      return [
        {
          to: effect.to,
          message: {
            t: "ack",
            cid: effect.cid,
            accepted: effect.ack.accepted,
            error: effect.ack.error,
            ply: effect.ack.ply,
          },
        },
      ];

    case "error":
      return [
        {
          to: effect.to,
          message: { t: "error", code: effect.code, message: effect.message },
        },
      ];

    case "broadcast":
      return stateMessages(state);

    case "end": {
      const out: Outgoing[] = [];
      if (state.result && state.termination) {
        out.push({
          to: "all",
          message: { t: "end", result: state.result, termination: state.termination },
        });
      }
      out.push(...stateMessages(state));
      return out;
    }
  }
}
