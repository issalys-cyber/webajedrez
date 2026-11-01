"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { Chessboard } from "react-chessboard";
import type { ChessboardOptions } from "react-chessboard";

/**
 * ÚNICO punto de la aplicación que conoce la librería del tablero.
 *
 * Todo lo demás habla con esta interfaz. Si algún día se cambia
 * `react-chessboard` por `chessground`, se cambia este fichero y nada más.
 */

export type ChessBoardProps = {
  fen: string;
  orientation: "white" | "black";
  /** Color al que le toca mover ("w" | "b"), para limitar el arrastre. */
  sideToMove: "w" | "b";
  selected: string | null;
  targets: readonly string[];
  occupied: readonly string[];
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  interactive: boolean;
  onSquareClick: (square: string) => void;
  /** Devuelve si la jugada se acepta; si no, la pieza vuelve a su casilla. */
  onPieceDrop: (from: string, to: string) => boolean;
};

type Accumulator = { shadows: string[]; gradients: string[] };

export function ChessBoard({
  fen,
  orientation,
  sideToMove,
  selected,
  targets,
  occupied,
  lastMove,
  checkSquare,
  interactive,
  onSquareClick,
  onPieceDrop,
}: ChessBoardProps) {
  const squareStyles = useMemo<Record<string, CSSProperties>>(() => {
    const squares = new Map<string, Accumulator>();

    const at = (square: string): Accumulator => {
      let entry = squares.get(square);
      if (!entry) {
        entry = { shadows: [], gradients: [] };
        squares.set(square, entry);
      }
      return entry;
    };

    const occupiedSet = new Set(occupied);

    if (lastMove) {
      // Capa translúcida sobre el color de la casilla, sin taparlo.
      for (const square of [lastMove.from, lastMove.to]) {
        at(square).shadows.push("inset 0 0 0 9999px rgba(201, 180, 88, 0.32)");
      }
    }

    if (checkSquare) {
      at(checkSquare).gradients.push(
        "radial-gradient(circle at center, rgba(220, 38, 38, 0.85) 0%, rgba(220, 38, 38, 0.55) 45%, transparent 72%)",
      );
    }

    if (selected) {
      at(selected).shadows.push("inset 0 0 0 3px rgba(242, 209, 107, 0.95)");
    }

    for (const square of targets) {
      if (occupiedSet.has(square)) {
        // Captura: anillo alrededor de la pieza.
        at(square).shadows.push(
          "inset 0 0 0 4px rgba(24, 28, 36, 0.36)",
          "inset 0 0 0 6px rgba(24, 28, 36, 0.14)",
        );
      } else {
        // Casilla libre: punto central.
        at(square).gradients.push(
          "radial-gradient(circle at center, rgba(24, 28, 36, 0.32) 0%, rgba(24, 28, 36, 0.32) 16%, transparent 17%)",
        );
      }
    }

    const result: Record<string, CSSProperties> = {};
    for (const [square, { shadows, gradients }] of squares) {
      const style: CSSProperties = {};
      if (shadows.length > 0) style.boxShadow = shadows.join(", ");
      if (gradients.length > 0) style.backgroundImage = gradients.join(", ");
      result[square] = style;
    }
    return result;
  }, [checkSquare, lastMove, occupied, selected, targets]);

  const options = useMemo<ChessboardOptions>(
    () => ({
      position: fen,
      boardOrientation: orientation,
      allowDragging: interactive,
      animationDurationInMs: 180,
      showNotation: true,
      squareStyles,
      darkSquareStyle: { backgroundColor: "var(--color-board-dark)" },
      lightSquareStyle: { backgroundColor: "var(--color-board-light)" },
      // Las coordenadas se dibujan dentro de la casilla: se elige el color con
      // más contraste sobre cada tono del tablero.
      darkSquareNotationStyle: { color: "rgba(246, 238, 224, 0.85)" },
      lightSquareNotationStyle: { color: "rgba(112, 82, 52, 0.9)" },
      boardStyle: {
        borderRadius: "0.625rem",
        overflow: "hidden",
        boxShadow: "0 24px 60px -28px rgba(0, 0, 0, 0.85)",
        touchAction: "manipulation",
      },
      canDragPiece: ({ piece }) =>
        interactive && piece.pieceType.startsWith(sideToMove),
      onSquareClick: ({ square }) => onSquareClick(square),
      onPieceDrop: ({ sourceSquare, targetSquare }) => {
        if (!targetSquare) return false;
        return onPieceDrop(sourceSquare, targetSquare);
      },
    }),
    [
      fen,
      orientation,
      interactive,
      sideToMove,
      squareStyles,
      onSquareClick,
      onPieceDrop,
    ],
  );

  return <Chessboard options={options} />;
}
