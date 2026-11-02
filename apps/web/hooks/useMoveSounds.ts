"use client";

import type { Move } from "chess.js";
import { useEffect, useRef } from "react";
import { playSound, type SoundName } from "@/lib/sound";

/**
 * Elige el sonido que corresponde a una jugada.
 * Prioridad: fin de partida > jaque > promoción > captura > enroque > normal.
 */
export function pickSound(
  move: Move | undefined,
  inCheck: boolean,
  over: boolean,
): SoundName {
  if (over) return "end";
  if (inCheck) return "check";
  if (!move) return "move";
  if (move.promotion) return "promote";
  if (move.isCapture()) return "capture";
  if (move.isKingsideCastle() || move.isQueensideCastle()) return "castle";
  return "move";
}

/**
 * Reproduce un sonido cada vez que el historial crece. Compartido por la
 * partida local y la partida contra el motor, para que suenen igual.
 */
export function useMoveSounds(history: Move[], inCheck: boolean, over: boolean) {
  const previousLength = useRef(0);

  useEffect(() => {
    if (history.length > previousLength.current) {
      const last = history[history.length - 1];
      playSound(pickSound(last, inCheck, over));
    }
    previousLength.current = history.length;
  }, [history, inCheck, over]);
}
