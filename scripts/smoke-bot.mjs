/**
 * Prueba de humo del motor (Fase 1) con navegador real.
 *
 * Comprueba lo que solo se puede verificar en un navegador: que Stockfish
 * se descarga, arranca, responde con jugadas legales y que la interfaz no se
 * rompe por el camino.
 *
 * Uso:  node scripts/smoke-bot.mjs [url]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:3000";
const SHOTS = fileURLToPath(new URL("../shots/", import.meta.url));
const shot = (name) =>
  fileURLToPath(new URL(name, new URL("../shots/", import.meta.url)));

const results = [];
let failed = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FALLO"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const square = (name) => `[data-square="${name}"]`;

async function clickSquares(page, ...squares) {
  for (const name of squares) await page.click(square(name));
  await page.waitForTimeout(150);
}

/** Espera a que la lista de jugadas tenga al menos `count` jugadas. */
async function waitForMoves(page, count, timeout = 15000) {
  await page
    .locator(`[data-move-index="${count - 1}"]`)
    .waitFor({ state: "attached", timeout });
  return page.locator("[data-move-index]").count();
}

const moveCount = (page) => page.locator("[data-move-index]").count();

async function main() {
  await mkdir(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  // ---------- Carga de la página ----------
  const response = await page.goto(`${BASE}/play/bot`, { waitUntil: "networkidle" });
  check("la página responde 200", response?.status() === 200, String(response?.status()));
  await page.waitForSelector(square("e2"));
  check("se renderizan las 64 casillas", (await page.locator("[data-square]").count()) === 64);
  check(
    "el motor NO se descarga antes de empezar",
    (await page.evaluate(() =>
      performance.getEntriesByType("resource").some((r) => r.name.includes("stockfish")),
    )) === false,
  );
  check(
    "el selector de nivel está y empieza en 5",
    (await page.getByTestId("level-slider").inputValue()) === "5",
  );

  // ---------- Cambiar de nivel ----------
  await page.getByTestId("level-slider").fill("12");
  await page.waitForTimeout(150);
  check(
    "el nivel se actualiza en pantalla",
    (await page.locator("aside").innerText()).includes("12/20"),
  );
  await page.getByTestId("level-slider").fill("1");

  // ---------- Empezar jugando con blancas ----------
  await page.getByRole("button", { name: /Blancas/ }).click();

  // El motor tarda en cargar: se espera a que el estado deje de cargar.
  await page
    .getByTestId("turn-status")
    .filter({ hasText: /Tu turno|motor/i })
    .waitFor({ timeout: 30000 });
  check(
    "el motor se descarga al empezar (1,8 MB)",
    (await page.evaluate(() =>
      performance.getEntriesByType("resource").some((r) => r.name.includes("stockfish")),
    )) === true,
  );
  check(
    "empieza el turno del jugador",
    (await page.getByTestId("turn-status").innerText()).includes("Tu turno"),
  );

  // ---------- El motor responde a una jugada ----------
  await clickSquares(page, "e2", "e4");
  const afterEngine = await waitForMoves(page, 2);
  check("el motor contesta a e4 con una jugada legal", afterEngine === 2, `${afterEngine} jugadas`);

  const engineMove = await page.locator('[data-move-index="1"]').innerText();
  check("la jugada del motor está en notación algebraica", /^[a-hKQRBNO]/.test(engineMove.trim()), engineMove);

  check(
    "la barra de evaluación se muestra",
    (await page.locator('[role="img"][aria-label^="Evaluación"]').count()) === 1,
  );

  // ---------- El jugador mueve otra vez ----------
  await clickSquares(page, "g1", "f3");
  await waitForMoves(page, 4, 15000);
  check("segunda jugada del motor", (await moveCount(page)) === 4);

  // ---------- Pista del motor ----------
  await page.getByRole("button", { name: "Pedir pista" }).click();
  await page
    .locator('[data-square] div[style*="122, 162, 247"]')
    .first()
    .waitFor({ timeout: 20000 });
  const hintSquares = await page
    .locator('[data-square] div[style*="122, 162, 247"]')
    .count();
  check("la pista resalta origen y destino", hintSquares >= 2, `${hintSquares} casillas`);

  await page.screenshot({ path: shot("bot-desktop.png"), fullPage: true });

  // ---------- Empezar jugando con negras: mueve el motor primero ----------
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(square("e2"));
  await page.getByRole("button", { name: /Negras/ }).click();
  const blackFirst = await waitForMoves(page, 1, 40000);
  check("jugando con negras, el motor mueve primero", blackFirst === 1, `${blackFirst} jugadas`);

  // ---------- Móvil ----------
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on("pageerror", (error) => consoleErrors.push(`mobile: ${error.message}`));
  await mobilePage.goto(`${BASE}/play/bot`, { waitUntil: "networkidle" });
  await mobilePage.waitForSelector(square("e2"));
  const corner = await mobilePage.locator(square("h8")).boundingBox();
  check(
    "en móvil el tablero no se desborda",
    !!corner && corner.x + corner.width <= 390,
    corner ? `borde derecho en ${Math.round(corner.x + corner.width)}px de 390` : "sin caja",
  );
  await mobilePage.screenshot({ path: shot("bot-mobile.png"), fullPage: true });

  check("sin errores en consola", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();

  console.log(`\n${results.length - failed}/${results.length} comprobaciones OK`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("La prueba ha fallado:", error);
  process.exit(1);
});
