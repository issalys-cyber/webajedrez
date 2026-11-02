"use client";

/**
 * Barra de evaluación vertical.
 *
 * La altura blanca representa la probabilidad de victoria de las blancas
 * (0-1), calculada en `lib/engine/uci.ts`. Si el tablero está girado, las
 * blancas se dibujan arriba para que la barra siga coincidiendo con el lado
 * que tiene el jugador.
 */
export function EvalBar({
  probability,
  scoreText,
  orientation,
  thinking,
}: {
  probability: number;
  scoreText: string;
  orientation: "white" | "black";
  thinking: boolean;
}) {
  const whitePercent = Math.min(100, Math.max(0, probability * 100));
  const whiteOnTop = orientation === "black";

  return (
    <div className="flex h-full flex-col items-center gap-1">
      <div
        className="relative w-5 flex-1 overflow-hidden rounded-full border border-line bg-[#15181f]"
        role="img"
        aria-label={`Evaluación: ${scoreText}`}
        title={`Evaluación: ${scoreText}`}
      >
        <div
          className={`absolute inset-x-0 bg-[#e9e9e9] transition-all duration-300 ease-out ${
            whiteOnTop ? "top-0" : "bottom-0"
          } ${thinking ? "opacity-90" : "opacity-100"}`}
          style={{ height: `${whitePercent}%` }}
        />
        {thinking && (
          <div className="absolute inset-x-0 top-1/2 h-0.5 animate-pulse bg-accent/70" />
        )}
      </div>
      <span className="w-9 text-center font-mono text-[10px] leading-none text-muted">
        {scoreText}
      </span>
    </div>
  );
}
