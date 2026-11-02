/**
 * Comprueba que la pista del motor sugiere una jugada legal **en la posición
 * actual**, y no la de una búsqueda anterior.
 *
 * Es la prueba que detecta el fallo clásico de dos búsquedas solapadas sobre
 * el mismo worker: la evaluación de fondo y la pista compiten, y la respuesta
 * de una resuelve la promesa de la otra.
 *
 * La posición se reconstruye desde la lista de jugadas con chess.js, así que
 * la comprobación no depende de lo que diga la interfaz.
 *
 * Uso: node scripts/hint-check.mjs [url]
 */
import { chromium } from "playwright";
import { Chess } from "chess.js";

const BASE = process.argv[2] ?? "http://localhost:3000";

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FALLO"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const square = (name) => `[data-square="${name}"]`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(`${BASE}/play/bot`, { waitUntil: "networkidle" });
await page.waitForSelector(square("e2"));

// Empezar con blancas y jugar tres jugadas para que haya varias búsquedas
// de evaluación de fondo en marcha: es cuando el solapamiento aparece.
await page.getByRole("button", { name: /Blancas/ }).click();
await page.getByTestId("turn-status").filter({ hasText: /Tu turno|motor/i }).waitFor({ timeout: 30000 });

const playAndWait = async (from, to, expectedMoves) => {
  await page.click(square(from));
  await page.click(square(to));
  await page
    .locator(`[data-move-index="${expectedMoves - 1}"]`)
    .waitFor({ state: "attached", timeout: 20000 });
};

await playAndWait("e2", "e4", 2);
await playAndWait("g1", "f3", 4);
await playAndWait("f1", "c4", 6);

// Pedir pista inmediatamente después de que el motor haya movido: máxima
// probabilidad de que la búsqueda de evaluación siga viva.
await page.getByRole("button", { name: "Pedir pista" }).click();
await page
  .locator('[data-square] div[style*="122, 162, 247"]')
  .first()
  .waitFor({ timeout: 20000 });
await page.waitForTimeout(300);

const hintSquares = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-square]"))
    .filter((el) => (el.querySelector("div")?.getAttribute("style") ?? "").includes("122, 162, 247"))
    .map((el) => el.getAttribute("data-square")),
);

const sanMoves = await page.$$eval("[data-move-index]", (nodes) =>
  nodes
    .sort((a, b) => Number(a.getAttribute("data-move-index")) - Number(b.getAttribute("data-move-index")))
    .map((node) => node.textContent?.trim() ?? ""),
);

const chess = new Chess();
for (const san of sanMoves) {
  try {
    chess.move(san);
  } catch {
    console.error(`No se pudo reconstruir la jugada ${san}`);
    process.exit(1);
  }
}

const legal = chess.moves({ verbose: true });
const isLegalPair = hintSquares.some((from) =>
  legal.some((move) => move.from === from && hintSquares.includes(move.to)),
);
const suggested = legal.find((move) => hintSquares.includes(move.from) && hintSquares.includes(move.to));

console.log(`posición reconstruida: ${chess.fen()}`);
console.log(`jugadas en la lista:   ${sanMoves.join(" ")}`);
console.log(`casillas resaltadas:   ${hintSquares.join(", ")}`);
console.log(`sugerencia detectada:  ${suggested ? suggested.san : "—"}`);

check("la pista resalta exactamente dos casillas", hintSquares.length === 2, `${hintSquares.length}`);
check("la jugada sugerida es legal en la posición actual", isLegalPair);
check("sin errores de página", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${failed === 0 ? "Todo OK" : failed + " comprobaciones fallidas"}`);
process.exit(failed === 0 ? 0 : 1);
