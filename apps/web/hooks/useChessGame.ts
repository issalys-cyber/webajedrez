"use client";

import { Chess, validateFen } from "chess.js";
import type { Color, Move, PieceSymbol, Square } from "chess.js";
import { useCallback, useMemo, useRef, useState } from "react";
import { applyUciMove } from "@/lib/chess/moves";

/** Resultado de la partida, derivado del estado de chess.js. */
export type GameStatus = {
  over: boolean;
  /** "1-0", "0-1", "1/2-1/2" o null si sigue jugando. */
  result: string | null;
  termination: string | null;
  /** Texto listo para mostrar al usuario. */
  label: string | null;
};

/** Todo lo que la interfaz necesita saber de la partida, ya calculado. */
export type GameSnapshot = {
  fen: string;
  turn: Color;
  history: Move[];
  pgn: string;
  status: GameStatus;
  inCheck: boolean;
  checkSquare: Square | null;
  lastMove: { from: string; to: string } | null;
  /** Casillas ocupadas, para pintar los puntos de movimiento legal. */
  occupied: string[];
};

export type PromotionPiece = "q" | "r" | "b" | "n";

export type MoveOutcome =
  /** Jugada aplicada. */
  | { kind: "played"; move: Move }
  /** Es legal pero hace falta elegir pieza de promoción. */
  | { kind: "needs-promotion"; from: string; to: string }
  /** No es legal, o no es el momento. */
  | { kind: "rejected" };

const PROMOTION_PIECES: PromotionPiece[] = ["q", "r", "b", "n"];

function findKingSquare(game: Chess): Square | null {
  const turn = game.turn();
  for (const row of game.board()) {
    for (const piece of row) {
      if (piece && piece.type === "k" && piece.color === turn) {
        return piece.square;
      }
    }
  }
  return null;
}

function computeStatus(game: Chess): GameStatus {
  const playing: GameStatus = {
    over: false,
    result: null,
    termination: null,
    label: null,
  };

  if (!game.isGameOver()) return playing;

  const turn = game.turn();
  const winner = turn === "w" ? "las negras" : "las blancas";

  const draw = (
    termination: string,
    label: string,
  ): GameStatus => ({
    over: true,
    result: "1/2-1/2",
    termination,
    label,
  });

  if (game.isCheckmate()) {
    return {
      over: true,
      result: turn === "w" ? "0-1" : "1-0",
      termination: "checkmate",
      label: `Jaque mate · ganan ${winner}`,
    };
  }
  if (game.isStalemate()) return draw("stalemate", "Tablas · rey ahogado");
  if (game.isInsufficientMaterial()) {
    return draw("insufficient", "Tablas · material insuficiente");
  }
  if (game.isThreefoldRepetition()) {
    return draw("threefold", "Tablas · triple repetición");
  }
  if (game.isDrawByFiftyMoves()) {
    return draw("fifty-move", "Tablas · regla de las 50 jugadas");
  }
  if (game.isDraw()) return draw("draw", "Tablas");
  return { ...playing, over: true, label: "Partida terminada" };
}

function snapshot(game: Chess): GameSnapshot {
  const history = game.history({ verbose: true });
  const last = history.length > 0 ? history[history.length - 1] : undefined;
  const inCheck = game.isCheck();

  return {
    fen: game.fen(),
    turn: game.turn(),
    history,
    pgn: game.pgn(),
    status: computeStatus(game),
    inCheck,
    checkSquare: inCheck ? findKingSquare(game) : null,
    lastMove: last ? { from: last.from, to: last.to } : null,
    occupied: game
      .board()
      .flat()
      .filter((piece): piece is NonNullable<typeof piece> => piece !== null)
      .map((piece) => piece.square as string),
  };
}

export type UseChessGame = ReturnType<typeof useChessGame>;

export function useChessGame() {
  const gameRef = useRef<Chess>(new Chess());
  const [snap, setSnap] = useState<GameSnapshot>(() => snapshot(gameRef.current));
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);
  /** null = posición actual; número = índice de jugada histórica. */
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const sync = useCallback(() => {
    setSnap(snapshot(gameRef.current));
  }, []);

  const viewing = viewIndex !== null;
  const viewingMove = viewIndex === null ? null : (snap.history[viewIndex] ?? null);
  const displayFen = viewingMove ? viewingMove.after : snap.fen;
  const canInteract = !viewing && !snap.status.over;

  /** Casillas destino legales para la pieza seleccionada. */
  const targets = useMemo<readonly string[]>(() => {
    if (!selected) return [];
    return gameRef.current
      .moves({ square: selected, verbose: true })
      .map((move) => move.to as string);
    // snap.fen fuerza el recálculo cuando cambia la posición.
  }, [selected, snap.fen]);

  const goToLive = useCallback(() => setViewIndex(null), []);

  const tryMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): MoveOutcome => {
      const game = gameRef.current;
      if (game.isGameOver()) return { kind: "rejected" };
      if (viewIndex !== null) return { kind: "rejected" };

      const legal = game
        .moves({ square: from as Square, verbose: true })
        .filter((move) => move.to === to);

      if (legal.length === 0) return { kind: "rejected" };

      const requiresPromotion = legal.some((move) => move.promotion);
      if (requiresPromotion && !promotion) {
        return { kind: "needs-promotion", from, to };
      }

      try {
        const played = game.move({ from, to, promotion });
        setSelected(null);
        setPendingPromotion(null);
        setViewIndex(null);
        sync();
        return { kind: "played", move: played };
      } catch {
        return { kind: "rejected" };
      }
    },
    [sync, viewIndex],
  );

  /** Clic (o toque) en una casilla: selecciona o intenta mover. */
  const clickSquare = useCallback(
    (square: string) => {
      const game = gameRef.current;
      if (!canInteract) return;

      const piece = game.get(square as Square);

      if (selected && selected !== square) {
        const outcome = tryMove(selected, square);
        if (outcome.kind === "needs-promotion") {
          setPendingPromotion({ from: outcome.from, to: outcome.to });
          setSelected(null);
          return;
        }
        if (outcome.kind === "played") return;
      }

      if (piece && piece.color === game.turn()) {
        setSelected((previous) => (previous === square ? null : (square as Square)));
      } else {
        setSelected(null);
      }
    },
    [canInteract, selected, tryMove],
  );

  /**
   * Suelta una pieza arrastrada. Devuelve si el tablero debe aceptar la jugada
   * (si devuelve false, la pieza vuelve a su sitio).
   */
  const dropPiece = useCallback(
    (from: string, to: string): boolean => {
      const outcome = tryMove(from, to);
      if (outcome.kind === "needs-promotion") {
        setPendingPromotion({ from: outcome.from, to: outcome.to });
        return false;
      }
      return outcome.kind === "played";
    },
    [tryMove],
  );

  /**
   * Aplica una jugada en notación UCI (por ejemplo "e2e4" o "e7e8q").
   * La usa el motor: no pasa por el diálogo de promoción, porque el motor ya
   * indica qué pieza elige.
   */
  const playUci = useCallback(
    (uci: string): boolean => {
      const game = gameRef.current;
      if (game.isGameOver()) return false;
      if (!applyUciMove(game, uci)) return false;

      setSelected(null);
      setPendingPromotion(null);
      setViewIndex(null);
      sync();
      return true;
    },
    [sync],
  );

  const choosePromotion = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
    [pendingPromotion, tryMove],
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    setSelected(null);
  }, []);

  const reset = useCallback(() => {
    gameRef.current = new Chess();
    setSelected(null);
    setPendingPromotion(null);
    setViewIndex(null);
    sync();
  }, [sync]);

  const undo = useCallback(() => {
    gameRef.current.undo();
    setSelected(null);
    setPendingPromotion(null);
    setViewIndex(null);
    sync();
  }, [sync]);

  const loadPgn = useCallback(
    (pgn: string): { ok: true } | { ok: false; error: string } => {
      const text = pgn.trim();
      if (!text) return { ok: false, error: "El PGN está vacío." };

      try {
        const next = new Chess();
        next.loadPgn(text);
        gameRef.current = next;
        setSelected(null);
        setPendingPromotion(null);
        setViewIndex(null);
        sync();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "No se ha podido leer el PGN.",
        };
      }
    },
    [sync],
  );

  const loadFen = useCallback(
    (fen: string): { ok: true } | { ok: false; error: string } => {
      const text = fen.trim();
      const validation = validateFen(text);
      if (!validation.ok) {
        return { ok: false, error: validation.error ?? "FEN no válido." };
      }
      try {
        gameRef.current = new Chess(text);
        setSelected(null);
        setPendingPromotion(null);
        setViewIndex(null);
        sync();
        return { ok: true };
      } catch {
        return { ok: false, error: "FEN no válido." };
      }
    },
    [sync],
  );

  const stepBack = useCallback(() => {
    setViewIndex((current) => {
      const lastIndex = snap.history.length - 1;
      if (lastIndex < 0) return null;
      const from = current === null ? lastIndex : current;
      const next = Math.max(0, from - 1);
      return next === lastIndex ? null : next;
    });
  }, [snap.history.length]);

  const stepForward = useCallback(() => {
    setViewIndex((current) => {
      if (current === null) return null;
      const lastIndex = snap.history.length - 1;
      const next = current + 1;
      return next >= lastIndex ? null : next;
    });
  }, [snap.history.length]);

  return {
    snap,
    selected,
    targets,
    displayFen,
    viewing,
    viewingIndex: viewIndex,
    canInteract,
    pendingPromotion,
    promotionPieces: PROMOTION_PIECES,
    clickSquare,
    dropPiece,
    playUci,
    choosePromotion,
    cancelPromotion,
    reset,
    undo,
    loadPgn,
    loadFen,
    stepBack,
    stepForward,
    goToLive,
    goToMove: setViewIndex,
  };
}

export type { PieceSymbol, Square };
