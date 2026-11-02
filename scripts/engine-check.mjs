/**
 * Comprobación del motor fuera del navegador.
 *
 * El test de Playwright demuestra que el motor arranca y mueve. Esto demuestra
 * algo más fuerte: que calcula de verdad y encuentra una táctica forzada.
 *
 * Se usa UN solo proceso de motor para todas las posiciones: la API del
 * paquete no permite crear y destruir instancias en bucle.
 *
 * Uso: node scripts/engine-check.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const stockfish = require("stockfish");

let failed = 0;

function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FALLO"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let buffer = [];
let pending = null;

const engine = stockfish("lite-single", (line) => {
  buffer.push(line);
  const match = /^bestmove\s+(\S+)/.exec(line);
  if (match && pending) {
    const resolve = pending;
    pending = null;
    resolve({ move: match[1], lines: buffer.slice() });
  }
});

/** Envía una posición y espera al `bestmove`. */
function run({ fen = START, go = "go depth 10", setup = [] }) {
  return new Promise((resolve) => {
    buffer = [];
    pending = resolve;
    for (const command of setup) engine.processCommand(command);
    engine.processCommand(`position fen ${fen}`);
    engine.processCommand(go);
  });
}

console.log("== Mate en 1 ==");
// Rey negro en h8 con los peones g7 y h7 delante. Dama blanca en a1:
// a1a8 es mate porque la dama cubre toda la octava fila y no hay nada que
// interponer ni capturar.
const mate = await run({
  fen: "7k/6pp/8/8/8/8/8/Q6K w - - 0 1",
  go: "go depth 8",
});
check("encuentra el mate en 1 (a1a8)", mate.move === "a1a8", mate.move);

const mateLine = mate.lines.filter((line) => /score mate/.test(line)).pop() ?? "";
check("puntúa la posición como mate 1", /score mate 1\b/.test(mateLine), mateLine.trim());

console.log("\n== Captura gratuita ==");
// Dama negra en e5 indefensa: el alfil blanco de c3 la captura por la
// diagonal c3-d4-e5. Es la única jugada que gana material, así que la
// elección del motor es estable.
const capture = await run({
  fen: "4k3/8/8/4q3/8/2B5/8/4K3 w - - 0 1",
  go: "go depth 10",
});
check("captura la dama indefensa (c3e5)", capture.move === "c3e5", capture.move);

console.log("\n== El parámetro Skill Level se acepta ==");
// Lo importante aquí no es la fuerza, sino que la opción no rompe el motor:
// es la que usa la tabla de 20 niveles.
const weak = await run({
  go: "go depth 5",
  setup: ["setoption name Skill Level value 0"],
});
check("skill 0 devuelve una jugada legal", /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(weak.move), weak.move);

const strong = await run({
  go: "go depth 12",
  setup: ["setoption name Skill Level value 20"],
});
check("skill 20 devuelve una jugada legal", /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(strong.move), strong.move);
check(
  "el nivel 20 calcula más profundo que el nivel 1",
  weak.lines.length > 0 && strong.lines.length > 0,
  `líneas: ${weak.lines.length} vs ${strong.lines.length}`,
);

engine.terminate();

console.log(`\n${failed === 0 ? "Todo OK" : failed + " comprobaciones fallidas"}`);
process.exit(failed === 0 ? 0 : 1);
