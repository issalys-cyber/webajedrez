"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { Color } from "@webajedrez/shared";
import { ChessBoard } from "@/components/board/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { PromotionDialog } from "@/components/game/PromotionDialog";
import { Button } from "@/components/ui/Button";
import { useMoveSounds } from "@/hooks/useMoveSounds";
import { useOnlineGame } from "@/hooks/useOnlineGame";
import { loadShareLink, loadToken, saveToken, tokenFromHash } from "@/lib/realtime/api";
import { shareUrl } from "@/lib/realtime/config";
import { isMuted, playSound, setMuted } from "@/lib/sound";

function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function ClockFace({
  ms,
  active,
  label,
}: {
  ms: number;
  active: boolean;
  label: string;
}) {
  const low = ms <= 20_000;
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-1.5 tabular-nums transition-colors ${
        active
          ? "border-accent/60 bg-surface-2 text-fg"
          : "border-line bg-surface/60 text-muted"
      }`}
    >
      <span className="truncate text-[12px]">{label}</span>
      <span
        className={`font-mono text-lg leading-none ${
          low && active ? "text-warn" : ""
        }`}
        data-testid={`clock-${label}`}
      >
        {formatClock(ms)}
      </span>
    </div>
  );
}

/** Fuerza un repintado periódico para que el reloj avance en pantalla. */
function useTicker(intervalMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export function OnlineGame({ gameId }: { gameId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useTicker(100);

  // El token viene en el fragmento de la URL; si no, se recupera de la sesión.
  useEffect(() => {
    const fromHash = tokenFromHash();
    if (fromHash) {
      saveToken(gameId, fromHash);
      setToken(fromHash);
    } else {
      setToken(loadToken(gameId));
    }
    setShareLink(loadShareLink(gameId));
    setMutedState(isMuted());
  }, [gameId]);

  const game = useOnlineGame(gameId, token);
  const state = game.state;

  const you: Color = state?.you ?? "w";

  const chess = useMemo(
    () => new Chess(state?.fen),
    [state?.fen],
  );

  const finished =
    state?.status === "finished" || state?.status === "aborted";

  const occupiedSquares = useMemo(
    () =>
      chess
        .board()
        .flat()
        .filter((piece): piece is NonNullable<typeof piece> => piece !== null)
        .map((piece) => piece.square as string),
    [chess],
  );

  const interactive =
    Boolean(state) &&
    state?.status === "playing" &&
    state?.turn === you &&
    game.status === "open";

  const targets = useMemo<readonly string[]>(() => {
    if (!selected || !interactive) return [];
    return chess.moves({ square: selected as never, verbose: true }).map((move) => move.to);
  }, [chess, interactive, selected]);

  const lastMove = useMemo(() => {
    const moves = state?.moves ?? [];
    const last = moves[moves.length - 1];
    if (!last || last.uci.length < 4) return null;
    return { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) };
  }, [state?.moves]);

  useMoveSounds(state?.moves ?? [], finished);

  const clickSquare = useCallback(
    (square: string) => {
      if (!interactive) return;

      if (selected && selected !== square) {
        const legal = chess
          .moves({ square: selected as never, verbose: true })
          .filter((move) => move.to === square);

        if (legal.length > 0) {
          if (legal.some((move) => move.promotion)) {
            setPendingPromotion({ from: selected, to: square });
            setSelected(null);
            return;
          }
          game.sendMove(selected + square);
          setSelected(null);
          return;
        }
      }

      const piece = chess.get(square as never);
      if (piece && piece.color === chess.turn()) {
        setSelected((previous) => (previous === square ? null : square));
      } else {
        setSelected(null);
      }
    },
    [chess, game, interactive, selected],
  );

  const dropPiece = useCallback(
    (from: string, to: string): boolean => {
      if (!interactive) return false;
      const legal = chess
        .moves({ square: from as never, verbose: true })
        .filter((move) => move.to === to);
      if (legal.length === 0) return false;

      if (legal.some((move) => move.promotion)) {
        setPendingPromotion({ from, to });
        return false;
      }

      game.sendMove(from + to);
      return true;
    },
    [chess, game, interactive],
  );

  const copyShareLink = useCallback(async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [shareLink]);

  const toggleMute = useCallback(() => {
    setMutedState((previous) => {
      const next = !previous;
      setMuted(next);
      if (!next) playSound("move");
      return next;
    });
  }, []);

  // --- Sin token: no hay asiento que ocupar ---------------------------------
  if (!token) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-xl font-semibold">Falta el enlace completo</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Para entrar en una partida hace falta el enlace con tu credencial
          (termina en <code className="text-fg">#t=…</code>). Pídeselo a quien
          creó la partida: sin esa parte del enlace no se puede ocupar el
          asiento.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-accent underline underline-offset-4"
        >
          ← Volver al inicio
        </Link>
      </main>
    );
  }

  const clock = state?.clock;
  const now = game.serverNow();
  const remainingFor = (color: Color): number => {
    if (!clock) return 0;
    const base = color === "w" ? clock.whiteMs : clock.blackMs;
    if (!clock.running || clock.turn !== color || clock.turnStartedAt === null) {
      return base;
    }
    return Math.max(0, base - (now - clock.turnStartedAt));
  };

  const meMs = remainingFor(you);
  const rivalMs = remainingFor(you === "w" ? "b" : "w");
  const waiting = state?.status === "waiting";

  const statusText = !state
    ? "Conectando con la partida…"
    : waiting
      ? "Esperando al rival…"
      : finished
        ? state.status === "aborted"
          ? "Partida anulada"
          : (state.result ?? "Partida terminada")
        : state.turn === you
          ? "Tu turno"
          : "Turno del rival";

  const connectionLabel =
    game.status === "open"
      ? `conectado · ${Math.round(game.rttMs)} ms`
      : game.status === "reconnecting"
        ? "reconectando…"
        : game.status === "error"
          ? "sin conexión con el servidor"
          : game.status === "closed"
            ? "desconectado"
            : "conectando…";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 lg:py-9">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            ← Inicio
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Partida online</h1>
          <span className="font-mono text-[11px] text-muted">{gameId}</span>
        </div>
        <span
          className={`text-[11px] ${
            game.status === "open" ? "text-good" : "text-warn"
          }`}
          data-testid="connection-status"
        >
          {connectionLabel}
        </span>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="board-shell">
          <div className="mb-2">
            <ClockFace
              ms={rivalMs}
              active={state?.turn !== you && state?.status === "playing"}
              label={you === "w" ? "Negras" : "Blancas"}
            />
          </div>

          <ChessBoard
            fen={state?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
            orientation={you === "w" ? "white" : "black"}
            sideToMove={state?.turn ?? "w"}
            selected={selected}
            targets={targets}
            occupied={occupiedSquares}
            lastMove={lastMove}
            checkSquare={null}
            interactive={interactive}
            onSquareClick={clickSquare}
            onPieceDrop={dropPiece}
          />

          <div className="mt-2">
            <ClockFace
              ms={meMs}
              active={state?.turn === you && state?.status === "playing"}
              label={you === "w" ? "Blancas" : "Negras"}
            />
          </div>
        </section>

        <aside className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]" role="status" data-testid="game-status">
            {statusText}
          </div>

          {waiting && (
            <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-3">
              <p className="text-[12px] font-medium text-fg">
                Envía este enlace a tu rival
              </p>
              {shareLink ? (
                <>
                  <code className="mt-2 block break-all rounded bg-surface px-2 py-1.5 font-mono text-[10px] text-fg/80">
                    {shareLink}
                  </code>
                  <Button size="sm" className="mt-2 w-full" onClick={() => void copyShareLink()}>
                    {copied ? "¡Copiado!" : "Copiar enlace"}
                  </Button>
                </>
              ) : (
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  Estás en el asiento del rival. El enlace del creador ya se ha
                  usado para entrar aquí.
                </p>
              )}
            </div>
          )}

          <div className="min-h-32 overflow-hidden rounded-lg border border-line bg-surface-2/60 lg:h-56">
            <MoveList
              history={state?.moves ?? []}
              viewingIndex={null}
              onSelect={() => undefined}
              onGoToLive={() => undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => game.offerDraw()}
              disabled={!state || state.status !== "playing" || state.drawOfferBy === you}
            >
              Ofrecer tablas
            </Button>
            <Button
              onClick={() => game.resign()}
              disabled={!state || state.status !== "playing"}
            >
              Rendirse
            </Button>

            {state?.drawOfferBy && state.drawOfferBy !== you && state.status === "playing" && (
              <>
                <Button variant="primary" onClick={() => game.acceptDraw()}>
                  Aceptar tablas
                </Button>
                <Button onClick={() => game.declineDraw()}>Rechazar</Button>
              </>
            )}

            {finished && (
              <Button
                variant="primary"
                className="col-span-2"
                onClick={() => game.requestRematch()}
                disabled={state?.rematchOfferedBy.includes(you)}
              >
                {state?.rematchOfferedBy.includes(you)
                  ? "Esperando al rival para la revancha…"
                  : "Pedir revancha"}
              </Button>
            )}

            <Button onClick={toggleMute}>
              {muted ? "🔇 Sonido off" : "🔊 Sonido on"}
            </Button>
            <Button onClick={() => game.resync()} disabled={game.status !== "open"}>
              Resincronizar
            </Button>
          </div>

          {state && !state.opponentConnected && state.status === "playing" && (
            <p className="rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-[12px] text-warn">
              El rival se ha desconectado. Su reloj sigue corriendo.
            </p>
          )}

          {game.lastError && (
            <p
              className="rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-[12px] text-warn"
              data-testid="game-error"
            >
              {game.lastError}
            </p>
          )}
        </aside>
      </div>

      {pendingPromotion && (
        <PromotionDialog
          side={you}
          pieces={["q", "r", "b", "n"] as const}
          onChoose={(piece) => {
            game.sendMove(pendingPromotion.from + pendingPromotion.to + piece);
            setPendingPromotion(null);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </main>
  );
}

/** Ayuda para depurar a mano: enlace del rival a partir de la URL actual. */
export function rivalLinkFor(gameId: string, token: string): string {
  return shareUrl(gameId, token);
}
