import type { Chess } from "chess.js";

/**
 * Convierte una jugada UCI ("e2e4", "e7e8q", "e1g1" para el enroque) en una
 * jugada aplicada sobre la partida.
 *
 * Vive fuera del hook de React a propósito: así se puede probar sin navegador,
 * que es justo lo que hace `scripts/uci-moves-check.mjs`.
 *
 * Devuelve `false` si la jugada es ilegal o viene mal formada; nunca lanza.
 */
export function applyUciMove(game: Chess, uci: string): boolean {
  if (typeof uci !== "string" || uci.length < 4) return false;

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;

  try {
    game.move({ from, to, promotion });
    return true;
  } catch {
    return false;
  }
}
