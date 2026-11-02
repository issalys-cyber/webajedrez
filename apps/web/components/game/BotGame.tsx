"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChessBoard } from "@/components/board/ChessBoard";
import { EvalBar } from "@/components/engine/EvalBar";
import { MoveList } from "@/components/game/MoveList";
import { PromotionDialog } from "@/components/game/PromotionDialog";
import { Button } from "@/components/ui/Button";
import { useChessGame } from "@/hooks/useChessGame";
import { useEngine } from "@/hooks/useEngine";
import { useMoveSounds } from "@/hooks/useMoveSounds";
import { ENGINE_LEVELS, getLevel } from "@/lib/engine/levels";
import { formatScore, scoreToWhiteProbability } from "@/lib/engine/uci";
import type { SearchInfo } from "@/lib/engine/uci";
import { isMuted, playSound, setMuted } from "@/lib/sound";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function BotGame() {
  const game = useChessGame();
  const { snap, playUci } = game;
  const { status, error, info, isReady, isLoading, isThinking, start, search, stop } =
    useEngine();

  const [level, setLevel] = useState(5);
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [started, setStarted] = useState(false);
  const [showEval, setShowEval] = useState(true);
  const [muted, setMutedState] = useState(false);
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [evalInfo, setEvalInfo] = useState<SearchInfo | null>(null);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const botColor: "w" | "b" = playerColor === "w" ? "b" : "w";
  const config = getLevel(level);

  useMoveSounds(snap.history, snap.status.over);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const showFlash = useCallback((message: string) => {
    setFlash(message);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2000);
  }, []);

  // ---------------------------------------------------------------------
  // Turno del motor: piensa y mueve.
  // ---------------------------------------------------------------------
  const engineMustMove =
    started &&
    isReady &&
    !snap.status.over &&
    snap.turn === botColor &&
    !game.viewing;

  useEffect(() => {
    if (!engineMustMove) return;

    let cancelled = false;
    const settings = getLevel(level);
    setHint(null);

    void (async () => {
      const began = Date.now();
      const result = await search(snap.fen, {
        skill: settings.skill,
        depth: settings.depth,
        movetimeMs: settings.movetimeMs,
      });

      // Ritmo humano: el nivel 1 no debe contestar en 30 ms.
      const elapsed = Date.now() - began;
      if (elapsed < settings.minThinkMs) {
        await wait(settings.minThinkMs - elapsed);
      }

      if (cancelled || !result?.bestMove) return;
      playUci(result.bestMove);
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [engineMustMove, snap.fen, level, search, stop, playUci]);

  // ---------------------------------------------------------------------
  // Evaluación de fondo mientras piensa el jugador (para la barra).
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!started || !showEval || !isReady) return;
    if (snap.status.over || snap.turn !== playerColor) return;

    let cancelled = false;
    const fen = snap.fen;
    setEvalInfo(null);

    void (async () => {
      await search(fen, {
        skill: 20,
        depth: 9,
        movetimeMs: 350,
        onInfo: (line) => {
          if (!cancelled) setEvalInfo(line);
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [started, showEval, isReady, snap.fen, snap.turn, snap.status.over, playerColor, search]);

  // ---------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------
  const beginGame = useCallback(
    async (color: "w" | "b") => {
      setPlayerColor(color);
      setHint(null);
      setEvalInfo(null);
      game.reset();
      setStarted(true);
      const ok = await start();
      if (!ok) {
        setStarted(false);
        showFlash("No se ha podido cargar el motor");
      }
    },
    [game, showFlash, start],
  );

  const restart = useCallback(() => {
    setHint(null);
    setEvalInfo(null);
    game.reset();
  }, [game]);

  const requestHint = useCallback(async () => {
    if (!isReady || snap.status.over || snap.turn !== playerColor) return;
    showFlash("Pensando una sugerencia…");
    const result = await search(snap.fen, {
      skill: 20,
      depth: 14,
      movetimeMs: 900,
    });
    if (!result?.bestMove || result.bestMove.length < 4) return;
    setHint({
      from: result.bestMove.slice(0, 2),
      to: result.bestMove.slice(2, 4),
    });
    showFlash("Jugada sugerida marcada en azul");
  }, [isReady, playerColor, search, showFlash, snap.fen, snap.status.over, snap.turn]);

  const toggleMute = useCallback(() => {
    setMutedState((previous) => {
      const next = !previous;
      setMuted(next);
      if (!next) playSound("move");
      return next;
    });
  }, []);

  const playerCanMove =
    started && !snap.status.over && snap.turn === playerColor && !game.viewing;

  const scoreText = evalInfo?.score
    ? formatScore(evalInfo.score, snap.turn)
    : "—";
  const probability = evalInfo?.score
    ? scoreToWhiteProbability(evalInfo.score, snap.turn)
    : 0.5;

  const statusText = !started
    ? "Elige nivel y color para empezar"
    : snap.status.over
      ? (snap.status.label ?? "Partida terminada")
      : isThinking
        ? "El motor está pensando…"
        : snap.turn === playerColor
          ? `Tu turno${snap.inCheck ? " · ¡Jaque!" : ""}`
          : "Turno del motor";

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
          <h1 className="text-lg font-semibold tracking-tight">
            Contra el motor
          </h1>
        </div>
        <Link
          href="/creditos"
          className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Créditos
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* Tablero + barra de evaluación */}
        <section className="board-shell">
          <div className="flex gap-2">
            {started && showEval && (
              <div className="hidden w-9 shrink-0 self-stretch sm:block">
                <EvalBar
                  probability={probability}
                  scoreText={scoreText}
                  orientation={playerColor === "w" ? "white" : "black"}
                  thinking={isThinking}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <ChessBoard
                fen={game.displayFen}
                orientation={playerColor === "w" ? "white" : "black"}
                sideToMove={snap.turn}
                selected={game.selected}
                targets={game.targets}
                occupied={snap.occupied}
                lastMove={snap.lastMove}
                checkSquare={snap.checkSquare}
                hint={hint}
                interactive={playerCanMove && !isThinking}
                onSquareClick={game.clickSquare}
                onPieceDrop={game.dropPiece}
              />
            </div>
          </div>
        </section>

        {/* Panel */}
        <aside className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`size-2.5 shrink-0 rounded-full border ${
                  snap.turn === "w"
                    ? "border-white/70 bg-white"
                    : "border-white/30 bg-[#15171d]"
                }`}
                aria-hidden="true"
              />
              <span
                className="truncate text-[13px]"
                role="status"
                data-testid="turn-status"
              >
                {statusText}
              </span>
            </div>
            {snap.status.result && (
              <span className="shrink-0 font-mono text-[13px] text-warn">
                {snap.status.result}
              </span>
            )}
          </div>

          {/* Selector de nivel, siempre visible */}
          <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="nivel"
                className="text-[12px] font-medium text-muted"
              >
                Nivel
              </label>
              <span className="font-mono text-[12px] text-fg">
                {config.level}/20 · {config.name}
              </span>
            </div>
            <input
              id="nivel"
              type="range"
              min={1}
              max={20}
              step={1}
              value={level}
              onChange={(event) => setLevel(Number(event.target.value))}
              className="mt-2 w-full accent-[var(--color-accent)]"
              aria-describedby="nivel-detalle"
              data-testid="level-slider"
            />
            <p id="nivel-detalle" className="mt-1 text-[11px] text-muted">
              {config.audience}
            </p>
          </div>

          {!started ? (
            <div className="flex flex-col gap-2">
              <p className="px-1 text-[12px] text-muted">Juega con:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="primary"
                  onClick={() => void beginGame("w")}
                  disabled={isLoading}
                >
                  ♔ Blancas
                </Button>
                <Button onClick={() => void beginGame("b")} disabled={isLoading}>
                  ♚ Negras
                </Button>
              </div>
              {isLoading && (
                <p className="px-1 text-[12px] text-accent">
                  Cargando el motor (1,8 MB)…
                </p>
              )}
              {error && (
                <p className="rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-[12px] text-warn">
                  {error}
                </p>
              )}
              <p className="mt-1 px-1 text-[11px] leading-relaxed text-muted/80">
                El motor se descarga solo al empezar y se ejecuta en tu
                navegador, no en el servidor.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={game.stepBack}
                  disabled={snap.history.length === 0}
                  aria-label="Jugada anterior"
                >
                  ◀
                </Button>
                <Button
                  size="sm"
                  onClick={game.stepForward}
                  disabled={!game.viewing}
                  aria-label="Jugada siguiente"
                >
                  ▶
                </Button>
                <Button
                  size="sm"
                  onClick={game.goToLive}
                  disabled={!game.viewing}
                  className="flex-1"
                >
                  Posición actual
                </Button>
              </div>

              <div className="min-h-32 overflow-hidden rounded-lg border border-line bg-surface-2/60 lg:h-56">
                <MoveList
                  history={snap.history}
                  viewingIndex={game.viewingIndex}
                  onSelect={game.goToMove}
                  onGoToLive={game.goToLive}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={restart}>
                  Nueva partida
                </Button>
                <Button
                  onClick={() => void requestHint()}
                  disabled={!isReady || isThinking || snap.status.over || snap.turn !== playerColor}
                >
                  Pedir pista
                </Button>
                <Button onClick={toggleMute}>
                  {muted ? "🔇 Sonido off" : "🔊 Sonido on"}
                </Button>
                <Button onClick={() => setShowEval((value) => !value)}>
                  {showEval ? "Ocultar eval." : "Ver eval."}
                </Button>
                <Button
                  onClick={() => {
                    setStarted(false);
                    setHint(null);
                  }}
                  className="col-span-2"
                >
                  Cambiar color / nivel inicial
                </Button>
              </div>

              <details className="rounded-lg border border-line bg-surface-2/60 px-3 py-2">
                <summary className="cursor-pointer select-none text-[12px] text-muted">
                  Detalles del motor
                </summary>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-fg/75">
                  <dt className="text-muted">estado</dt>
                  <dd>{status}</dd>
                  <dt className="text-muted">skill</dt>
                  <dd>{config.skill}</dd>
                  <dt className="text-muted">profundidad</dt>
                  <dd>{info?.depth ?? config.depth}</dd>
                  <dt className="text-muted">línea</dt>
                  <dd className="truncate">{info?.pv.slice(0, 4).join(" ") || "—"}</dd>
                </dl>
              </details>
            </>
          )}
        </aside>
      </div>

      {game.pendingPromotion && (
        <PromotionDialog
          side={snap.turn}
          pieces={game.promotionPieces}
          onChoose={game.choosePromotion}
          onCancel={game.cancelPromotion}
        />
      )}

      <div
        aria-live="polite"
        className={`pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-surface-2 px-4 py-2 text-[12px] text-fg shadow-xl transition-opacity duration-200 ${
          flash ? "opacity-100" : "opacity-0"
        }`}
      >
        {flash ?? ""}
      </div>
    </main>
  );
}
