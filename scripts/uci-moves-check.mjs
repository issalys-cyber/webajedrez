/**
 * Comprobación de la conversión UCI → jugada, sin navegador.
 *
 * Es la pieza que conecta al motor con el tablero: si esto falla, el motor
 * "mueve" pero la partida no avanza. Node 24 ejecuta TypeScript directamente
 * (type stripping), así que se importa el módulo real de la aplicación.
 *
 * Uso: node scripts/uci-moves-check.mjs
 */
import { Chess } from "chess.js";
import { applyUciMove } from "../apps/web/lib/chess/moves.ts";

let failed = 0;

function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FALLO"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// --- Jugada normal ---
{
  const game = new Chess();
  const ok = applyUciMove(game, "e2e4");
  check("aplica e2e4", ok && game.fen().startsWith("rnbqkbnr/pppppppp/8/8/4P3"), game.fen().slice(0, 30));
}

// --- Promoción: el motor envía la pieza en el quinto carácter ---
{
  const game = new Chess("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
  const ok = applyUciMove(game, "b7b8q");
  check("promociona a dama con b7b8q", ok && game.get("b8")?.type === "q", game.get("b8")?.type ?? "sin pieza");
}

{
  const game = new Chess("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
  applyUciMove(game, "b7b8n");
  check("promociona a caballo con b7b8n", game.get("b8")?.type === "n", game.get("b8")?.type ?? "sin pieza");
}

// --- Enroque ---
{
  const game = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const ok = applyUciMove(game, "e1g1");
  check(
    "el enroque e1g1 mueve rey y torre",
    ok && game.get("g1")?.type === "k" && game.get("f1")?.type === "r",
    `${game.get("g1")?.type ?? "—"} / ${game.get("f1")?.type ?? "—"}`,
  );
}

// --- Jugada ilegal ---
{
  const game = new Chess();
  const ok = applyUciMove(game, "e2e5");
  check("rechaza una jugada ilegal sin lanzar", ok === false && game.fen() === START);
}

// --- Basura ---
{
  const game = new Chess();
  check("rechaza cadenas demasiado cortas", applyUciMove(game, "e2") === false);
  check("rechaza cadenas vacías", applyUciMove(game, "") === false);
}

console.log(`\n${failed === 0 ? "Todo OK" : failed + " comprobaciones fallidas"}`);
process.exit(failed === 0 ? 0 : 1);
