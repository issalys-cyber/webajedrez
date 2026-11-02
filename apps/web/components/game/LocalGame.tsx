"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChessBoard } from "@/components/board/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { PromotionDialog } from "@/components/game/PromotionDialog";
import { Button } from "@/components/ui/Button";
import { useChessGame } from "@/hooks/useChessGame";
import { useMoveSounds } from "@/hooks/useMoveSounds";
import { isMuted, playSound, setMuted } from "@/lib/sound";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para navegadores sin permiso de portapapeles.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export function LocalGame() {
  const game = useChessGame();
  const { snap } = game;

  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [muted, setMutedState] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMoveSounds(snap.history, snap.inCheck, snap.status.over);

  // El estado de silencio vive en localStorage: se lee tras montar para no
  // romper la hidratación del servidor.
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
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  }, []);

  const handleCopy = useCallback(
    async (text: string, label: string) => {
      if (!text) {
        showFlash("No hay nada que copiar todavía");
        return;
      }
      const ok = await copyToClipboard(text);
      showFlash(ok ? `${label} copiado` : "No se ha podido copiar");
    },
    [showFlash],
  );

  const handleDownload = useCallback(() => {
    const blob = new Blob([snap.pgn || ""], {
      type: "application/x-chess-pgn;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");
    link.href = url;
    link.download = `webajedrez-${stamp}.pgn`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [snap.pgn]);

  const handleToggleMute = useCallback(() => {
    setMutedState((previous) => {
      const next = !previous;
      setMuted(next);
      if (!next) playSound("move");
      return next;
    });
  }, []);

  const handleImport = useCallback(() => {
    const result = game.loadPgn(importText);
    if (result.ok) {
      setImportOpen(false);
      setImportText("");
      setImportError(null);
      showFlash("Partida cargada");
    } else {
      setImportError(result.error);
    }
  }, [game, importText, showFlash]);

  const statusText = snap.status.over
    ? (snap.status.label ?? "Partida terminada")
    : game.viewing
      ? `Viendo la jugada ${(game.viewingIndex ?? 0) + 1} de ${snap.history.length}`
      : `Mueven ${snap.turn === "w" ? "las blancas" : "las negras"}${
          snap.inCheck ? " · ¡Jaque!" : ""
        }`;

  const canUndo = snap.history.length > 0;

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
          <h1 className="text-lg font-semibold tracking-tight">Partida local</h1>
        </div>
        <Link
          href="/creditos"
          className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Créditos
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* Tablero */}
        <section className="board-shell relative">
          <ChessBoard
            fen={game.displayFen}
            orientation={orientation}
            sideToMove={snap.turn}
            selected={game.selected}
            targets={game.targets}
            occupied={snap.occupied}
            lastMove={snap.lastMove}
            checkSquare={snap.checkSquare}
            interactive={game.canInteract}
            onSquareClick={game.clickSquare}
            onPieceDrop={game.dropPiece}
          />
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

          <div className="min-h-40 overflow-hidden rounded-lg border border-line bg-surface-2/60 lg:h-72">
            <MoveList
              history={snap.history}
              viewingIndex={game.viewingIndex}
              onSelect={game.goToMove}
              onGoToLive={game.goToLive}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="primary"
              onClick={() => {
                game.reset();
                playSound("move");
              }}
            >
              Nueva partida
            </Button>
            <Button onClick={game.undo} disabled={!canUndo}>
              Deshacer
            </Button>
            <Button
              onClick={() =>
                setOrientation((current) =>
                  current === "white" ? "black" : "white",
                )
              }
            >
              Girar tablero
            </Button>
            <Button onClick={handleToggleMute}>
              {muted ? "🔇 Sonido off" : "🔊 Sonido on"}
            </Button>
            <Button onClick={() => void handleCopy(snap.pgn, "PGN")}>
              Copiar PGN
            </Button>
            <Button onClick={handleDownload} disabled={snap.history.length === 0}>
              Descargar PGN
            </Button>
            <Button onClick={() => void handleCopy(game.displayFen, "FEN")}>
              Copiar FEN
            </Button>
            <Button
              onClick={() => {
                setImportOpen(true);
                setImportError(null);
              }}
            >
              Importar PGN
            </Button>
          </div>

          <details className="rounded-lg border border-line bg-surface-2/60 px-3 py-2">
            <summary className="cursor-pointer select-none text-[12px] text-muted">
              FEN de la posición
            </summary>
            <code className="mt-2 block break-all font-mono text-[11px] leading-relaxed text-fg/75">
              {game.displayFen}
            </code>
          </details>

          <p className="px-1 text-[11px] leading-relaxed text-muted/80">
            Arrastra una pieza o toca origen y destino. Las jugadas ilegales se
            rechazan solas.
          </p>
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

      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Importar PGN"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImportOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-2xl">
            <h2 className="text-sm font-semibold">Importar PGN</h2>
            <p className="mt-1 text-[13px] text-muted">
              Pega el PGN de una partida. Se sustituirá la partida actual.
            </p>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              spellCheck={false}
              rows={8}
              placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 …'}
              className="mt-3 w-full resize-y rounded-lg border border-line bg-surface-2 p-2.5 font-mono text-[12px] text-fg outline-none focus:border-accent"
            />
            {importError && (
              <p className="mt-2 rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-[12px] text-warn">
                {importError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setImportOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={handleImport}>
                Cargar partida
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso efímero de copiado */}
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
