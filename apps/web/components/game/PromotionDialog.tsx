"use client";

import { useEffect, useRef } from "react";
import type { PromotionPiece } from "@/hooks/useChessGame";

const GLYPH: Record<"w" | "b", Record<PromotionPiece, string>> = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};

const LABEL: Record<PromotionPiece, string> = {
  q: "Dama",
  r: "Torre",
  b: "Alfil",
  n: "Caballo",
};

export function PromotionDialog({
  side,
  pieces,
  onChoose,
  onCancel,
}: {
  side: "w" | "b";
  pieces: readonly PromotionPiece[];
  onChoose: (piece: PromotionPiece) => void;
  onCancel: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    firstRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Elige la pieza de promoción"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl">
        <h2 className="text-sm font-semibold text-fg">
          ¿En qué pieza quieres promocionar?
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Elige con un clic. Pulsa Esc para cancelar.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {pieces.map((piece, index) => (
            <button
              key={piece}
              ref={index === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onChoose(piece)}
              className="group flex flex-col items-center gap-1 rounded-lg border border-line bg-surface-2 py-2 transition-colors hover:border-accent hover:bg-accent/10"
            >
              <span
                className={`text-3xl leading-none ${
                  side === "w" ? "text-[#f7f7f7]" : "text-[#111318]"
                } ${side === "b" ? "drop-shadow-[0_0_1px_rgba(255,255,255,0.55)]" : ""}`}
                aria-hidden="true"
              >
                {GLYPH[side][piece]}
              </span>
              <span className="text-[11px] text-muted group-hover:text-fg">
                {LABEL[piece]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
