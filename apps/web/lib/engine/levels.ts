/**
 * Los veinte niveles de dificultad.
 *
 * Cómo se debilita a Stockfish (esto es lo que hace que un nivel 3 sea
 * ganable por un principiante, no solo "más lento"):
 *
 *  - `Skill Level` (0-20) hace que el motor elija a veces una jugada peor
 *    entre las razonables. Es el parámetro que de verdad baja la calidad.
 *  - `depth` limita cuánto calcula. En niveles bajos además lo hace fallar
 *    de forma más humana: ve menos, como un principiante.
 *  - `minThinkMs` no cambia la fuerza, solo el ritmo: sin esto el nivel 1
 *    responde en 30 ms y se siente antinatural.
 *
 * Los niveles 1-4 juegan a propósito sin profundidad de búsqueda real (depth 1-2),
 * que es cuando fallan material de forma reconocible.
 */

export type EngineLevel = {
  /** 1 a 20. */
  level: number;
  /** Etiqueta corta para la interfaz. */
  name: string;
  /** Descripción de a quién corresponde. */
  audience: string;
  skill: number;
  depth: number;
  /** Tiempo máximo de búsqueda, para que un nivel alto no tarde una eternidad. */
  movetimeMs: number;
  /** Tiempo mínimo que se muestra "pensando", para que parezca humano. */
  minThinkMs: number;
};

export const ENGINE_LEVELS: readonly EngineLevel[] = [
  { level: 1, name: "Recién aprendido", audience: "Nunca has jugado", skill: 0, depth: 1, movetimeMs: 100, minThinkMs: 350 },
  { level: 2, name: "Principiante", audience: "Conoces los movimientos", skill: 0, depth: 1, movetimeMs: 120, minThinkMs: 400 },
  { level: 3, name: "Principiante", audience: "Sueles perder piezas", skill: 1, depth: 2, movetimeMs: 150, minThinkMs: 450 },
  { level: 4, name: "Aprendiz", audience: "Ya ves capturas simples", skill: 2, depth: 2, movetimeMs: 180, minThinkMs: 500 },
  { level: 5, name: "Aprendiz", audience: "Piensas un poco antes de mover", skill: 3, depth: 3, movetimeMs: 220, minThinkMs: 550 },
  { level: 6, name: "Iniciado", audience: "Conoces algún mate básico", skill: 4, depth: 3, movetimeMs: 260, minThinkMs: 600 },
  { level: 7, name: "Iniciado", audience: "Evitas perder piezas gratis", skill: 5, depth: 4, movetimeMs: 300, minThinkMs: 650 },
  { level: 8, name: "Intermedio bajo", audience: "Juegas con algo de plan", skill: 6, depth: 5, movetimeMs: 350, minThinkMs: 700 },
  { level: 9, name: "Intermedio bajo", audience: "Ves tácticas de dos jugadas", skill: 7, depth: 5, movetimeMs: 400, minThinkMs: 750 },
  { level: 10, name: "Intermedio", audience: "Nivel de club bajo", skill: 8, depth: 6, movetimeMs: 450, minThinkMs: 800 },
  { level: 11, name: "Intermedio", audience: "Castigas los errores", skill: 9, depth: 7, movetimeMs: 500, minThinkMs: 850 },
  { level: 12, name: "Intermedio alto", audience: "Jugador de club", skill: 10, depth: 8, movetimeMs: 550, minThinkMs: 900 },
  { level: 13, name: "Intermedio alto", audience: "Calculas variantes", skill: 11, depth: 9, movetimeMs: 600, minThinkMs: 950 },
  { level: 14, name: "Avanzado", audience: "Club fuerte", skill: 12, depth: 10, movetimeMs: 700, minThinkMs: 1000 },
  { level: 15, name: "Avanzado", audience: "Rara vez regalas material", skill: 13, depth: 11, movetimeMs: 800, minThinkMs: 1100 },
  { level: 16, name: "Experto", audience: "Nivel de torneo", skill: 14, depth: 12, movetimeMs: 900, minThinkMs: 1200 },
  { level: 17, name: "Experto", audience: "Muy difícil de batir", skill: 15, depth: 13, movetimeMs: 1000, minThinkMs: 1300 },
  { level: 18, name: "Maestro", audience: "Solo con mucha técnica", skill: 17, depth: 14, movetimeMs: 1200, minThinkMs: 1400 },
  { level: 19, name: "Maestro", audience: "Prácticamente imbatible", skill: 19, depth: 16, movetimeMs: 1400, minThinkMs: 1500 },
  { level: 20, name: "Máquina", audience: "Fuerza completa del motor", skill: 20, depth: 18, movetimeMs: 1800, minThinkMs: 1600 },
];

const BY_LEVEL = new Map(ENGINE_LEVELS.map((entry) => [entry.level, entry]));

export function getLevel(level: number): EngineLevel {
  const clamped = Math.min(20, Math.max(1, Math.round(level)));
  const found = BY_LEVEL.get(clamped);
  if (found) return found;
  // Imposible con la tabla de arriba, pero evita un undefined silencioso.
  return ENGINE_LEVELS[0] as EngineLevel;
}

/** Agrupa los niveles por tramo, para pintar el selector. */
export const LEVEL_GROUPS: ReadonlyArray<{ label: string; from: number; to: number }> = [
  { label: "Principiante", from: 1, to: 5 },
  { label: "Intermedio", from: 6, to: 12 },
  { label: "Avanzado", from: 13, to: 17 },
  { label: "Máquina", from: 18, to: 20 },
];
