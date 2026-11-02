"use client";

import { useEffect, useRef } from "react";
import { playSound, type SoundName } from "@/lib/sound";

/**
 * Deduce el sonido a partir de la notación algebraica.
 *
 * Se hace así (y no leyendo métodos de chess.js) porque el estado de una
 * partida online llega del servidor como objetos planos: aquí solo hay SAN.
 * Además vale igual para la partida local y contra el motor.
 */
export function soundForSan(san: string, over: boolean): SoundName {
  if (over) return "end";
  if (san.endsWith("#")) return "end";
  if (san.includes("+")) return "check";
  if (san.includes("=")) return "promote";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}

/**
 * Reproduce un sonido cada vez que el historial crece.
 * Compartido por la partida local, la del motor y la online.
 */
export function useMoveSounds(
  history: ReadonlyArray<{ san: string }>,
  over: boolean,
): void {
  const previousLength = useRef(history.length);

  useEffect(() => {
    if (history.length > previousLength.current) {
      const last = history[history.length - 1];
      if (last) playSound(soundForSan(last.san, over));
    }
    previousLength.current = history.length;
  }, [history, over]);
}
