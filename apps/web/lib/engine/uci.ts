/**
 * Parseo del protocolo UCI. Funciones puras, sin navegador y sin worker:
 * así el formato de las líneas del motor se puede probar por separado.
 *
 * Ejemplos de líneas que emite Stockfish:
 *
 *   info depth 12 seldepth 15 multipv 1 score cp 34 nodes 12345 nps 90000 time 130 pv e2e4 e7e5
 *   info depth 8 currmove e2e4 currmovenumber 3
 *   info string NNUE evaluation using nn-61e7af4bb97d.nnue
 *   bestmove e2e4 ponder e7e5
 */

export type EngineScore =
  | { kind: "cp"; value: number }
  | { kind: "mate"; value: number };

export type SearchInfo = {
  depth: number;
  /** Puntuación desde el punto de vista del que mueve. */
  score: EngineScore | null;
  /** Línea principal en notación UCI. */
  pv: string[];
  nodes?: number;
  nps?: number;
  timeMs?: number;
  /** Solo en búsquedas con MultiPV > 1. */
  multipv?: number;
};

export type SearchResult = {
  bestMove: string | null;
  ponder: string | null;
};

const INFO_DEPTH = /\bdepth (\d+)\b/;
const INFO_SCORE_CP = /\bscore cp (-?\d+)\b/;
const INFO_SCORE_MATE = /\bscore mate (-?\d+)\b/;
const INFO_PV = /\bpv (.+)$/;
const INFO_NODES = /\bnodes (\d+)\b/;
const INFO_NPS = /\bnps (\d+)\b/;
const INFO_TIME = /\btime (\d+)\b/;
const INFO_MULTIPV = /\bmultipv (\d+)\b/;
const BESTMOVE = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/;

/**
 * Devuelve la información de una línea `info`, o null si la línea no aporta
 * nada útil (por ejemplo `info string` o `info depth 8 currmove ...`).
 */
export function parseInfoLine(line: string): SearchInfo | null {
  if (!line.startsWith("info ")) return null;
  if (line.startsWith("info string")) return null;

  const depthMatch = INFO_DEPTH.exec(line);
  if (!depthMatch) return null;

  const pvText = INFO_PV.exec(line)?.[1];
  const cpMatch = INFO_SCORE_CP.exec(line);
  const mateMatch = INFO_SCORE_MATE.exec(line);

  let score: EngineScore | null = null;
  if (cpMatch) score = { kind: "cp", value: Number(cpMatch[1]) };
  else if (mateMatch) score = { kind: "mate", value: Number(mateMatch[1]) };

  const info: SearchInfo = {
    depth: Number(depthMatch[1]),
    score,
    pv: pvText ? pvText.trim().split(/\s+/) : [],
  };

  const nodes = INFO_NODES.exec(line);
  if (nodes) info.nodes = Number(nodes[1]);

  const nps = INFO_NPS.exec(line);
  if (nps) info.nps = Number(nps[1]);

  const time = INFO_TIME.exec(line);
  if (time) info.timeMs = Number(time[1]);

  const multipv = INFO_MULTIPV.exec(line);
  if (multipv) info.multipv = Number(multipv[1]);

  return info;
}

export function parseBestMove(line: string): SearchResult | null {
  const match = BESTMOVE.exec(line.trim());
  if (!match) return null;
  const move = match[1];
  return {
    bestMove: !move || move === "(none)" ? null : move,
    ponder: match[2] ?? null,
  };
}

/**
 * Convierte una puntuación en una probabilidad de victoria de las blancas
 * (0 a 1), para la barra de evaluación.
 *
 * Se usa la curva logística clásica de las centipeones: 400 cp de ventaja
 * equivalen a ~91 % de probabilidad.
 *
 * `turn` indica a quién le toca mover, porque el motor puntúa desde su punto
 * de vista.
 */
export function scoreToWhiteProbability(
  score: EngineScore,
  turn: "w" | "b",
): number {
  const forWhite = turn === "w" ? score.value : -score.value;

  if (score.kind === "mate") {
    if (forWhite === 0) return turn === "w" ? 1 : 0;
    return forWhite > 0 ? 1 : 0;
  }

  const probability = 1 / (1 + 10 ** (-forWhite / 400));
  return Math.min(1, Math.max(0, probability));
}

/** Texto legible para la interfaz: "+1.25", "-0.40", "M5", "-M3". */
export function formatScore(score: EngineScore | null, turn: "w" | "b"): string {
  if (!score) return "—";

  const forWhite = turn === "w" ? score.value : -score.value;
  const sign = forWhite > 0 ? "+" : forWhite < 0 ? "−" : "";

  if (score.kind === "mate") {
    const abs = Math.abs(score.value);
    return forWhite === 0 ? "#" : `${sign}M${abs}`;
  }

  return `${sign}${(Math.abs(forWhite) / 100).toFixed(2)}`;
}
