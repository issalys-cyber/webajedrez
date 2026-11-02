"use client";

import type { Move } from "chess.js";
import { useEffect, useRef } from "react";

/**
 * Lista de jugadas en notación algebraica, con navegación.
 * Cada celda es un botón: al pulsarla se muestra la posición de esa jugada.
 */
export function MoveList({
  history,
  viewingIndex,
  onSelect,
  onGoToLive,
}: {
  history: Move[];
  viewingIndex: number | null;
  onSelect: (index: number) => void;
  onGoToLive: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Al añadirse una jugada, la lista baja sola.
  useEffect(() => {
    if (viewingIndex === null) {
      bottomRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [history.length, viewingIndex]);

  if (history.length === 0) {
    return (
      <div className="flex h-full min-h-24 items-center justify-center px-4 py-6 text-center text-[13px] text-muted">
        Todavía no hay jugadas.
        <br />
        Mueve una pieza para empezar.
      </div>
    );
  }

  const rows: Array<{
    number: number;
    white: { san: string; index: number } | null;
    black: { san: string; index: number } | null;
  }> = [];

  history.forEach((move, index) => {
    const isWhite = index % 2 === 0;
    const rowIndex = Math.floor(index / 2);
    let row = rows[rowIndex];
    if (!row) {
      row = { number: rowIndex + 1, white: null, black: null };
      rows[rowIndex] = row;
    }
    if (isWhite) {
      row.white = { san: move.san, index };
    } else {
      row.black = { san: move.san, index };
    }
  });

  const cell = (
    entry: { san: string; index: number } | null,
  ): React.ReactElement => {
    if (!entry) return <span className="px-2 py-1 text-muted/40">…</span>;

    const active = viewingIndex === entry.index;

    return (
      <button
        type="button"
        onClick={() => onSelect(entry.index)}
        aria-current={active ? "true" : undefined}
        data-move-index={entry.index}
        className={`rounded px-2 py-1 text-left font-mono text-[13px] transition-colors ${
          active
            ? "bg-accent/20 text-fg ring-1 ring-accent/60 ring-inset"
            : "text-fg/85 hover:bg-surface-2 hover:text-fg"
        }`}
      >
        {entry.san}
      </button>
    );
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto px-2 py-2">
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div
            key={row.number}
            className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1"
          >
            <span className="pl-2 font-mono text-[12px] text-muted/70">
              {row.number}.
            </span>
            {cell(row.white)}
            {cell(row.black)}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {viewingIndex !== null && (
        <button
          type="button"
          onClick={onGoToLive}
          className="mt-2 w-full rounded border border-line px-2 py-1.5 text-[12px] text-accent hover:bg-surface-2"
        >
          Volver a la posición actual
        </button>
      )}
    </div>
  );
}
