/**
 * Prueba de humo con navegador real (Fase 0).
 *
 * Comprueba lo que el typecheck y el build no pueden: que el tablero responde
 * a clics y arrastres, que las reglas especiales del ajedrez funcionan
 * (promoción, enroque, captura al paso), que las jugadas ilegales se rechazan
 * y que no hay errores de consola (hidratación incluida).
 *
 * Uso:  node scripts/smoke.mjs [url]
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
const pieceAt = (name) => `${square(name)} [data-piece]`;

async function clickSquares(page, ...squares) {
  for (const name of squares) await page.click(square(name));
  await page.waitForTimeout(200);
}

async function moveByDrag(page, from, to) {
  const a = await page.locator(square(from)).boundingBox();
  const b = await page.locator(square(to)).boundingBox();
  if (!a || !b) throw new Error(`No encuentro ${from} o ${to}`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/** Carga una posición concreta pasando por el diálogo de importar PGN. */
async function loadPosition(page, fen) {
  await page.getByRole("button", { name: "Importar PGN" }).click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("dialog")
    .locator("textarea")
    .fill(`[SetUp "1"]\n[FEN "${fen}"]\n`);
  await page.getByRole("button", { name: "Cargar partida" }).click();
  await page.waitForTimeout(350);
}

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

  // ---------- Carga ----------
  const response = await page.goto(`${BASE}/play/local`, { waitUntil: "networkidle" });
  check("la página responde 200", response?.status() === 200, String(response?.status()));
  await page.waitForSelector(square("e2"));
  check("se renderizan las 64 casillas", (await page.locator("[data-square]").count()) === 64);
  check(
    "el estado inicial es correcto",
    (await page.getByTestId("turn-status").innerText()).includes("blancas"),
  );

  // ---------- Clic origen/destino ----------
  await clickSquares(page, "e2");
  // react-chessboard aplica los estilos de casilla a un div interno.
  const dots = await page.locator('[data-square] div[style*="radial-gradient"]').count();
  check("al seleccionar e2 se marcan los destinos legales", dots === 2, `${dots} destinos`);

  await clickSquares(page, "e4");
  check("clic e2→e4 registra la jugada", (await page.locator("aside").innerText()).includes("e4"));
  check(
    "el turno pasa a las negras",
    (await page.getByTestId("turn-status").innerText()).includes("negras"),
  );

  const highlighted = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-square]"))
      .filter((el) => (el.querySelector("div")?.getAttribute("style") ?? "").includes("9999px"))
      .map((el) => el.getAttribute("data-square")),
  );
  check(
    "se resalta el último movimiento (e2 y e4)",
    highlighted.length === 2 && highlighted.includes("e2") && highlighted.includes("e4"),
    highlighted.join(", "),
  );

  // ---------- Arrastre ----------
  await moveByDrag(page, "e7", "e5");
  check("arrastrar e7→e5 registra la jugada", (await page.locator("aside").innerText()).includes("e5"));

  // ---------- Jugada ilegal ----------
  const before = await page.locator(".thin-scroll button").count();
  await clickSquares(page, "e4", "e5"); // un peón no captura de frente
  const after = await page.locator(".thin-scroll button").count();
  check("una jugada ilegal no se aplica", before === after, `${before} → ${after}`);

  // ---------- Deshacer ----------
  await page.getByRole("button", { name: "Deshacer" }).click();
  await page.waitForTimeout(200);
  check("deshacer quita la última jugada", !(await page.locator("aside").innerText()).includes("e5"));

  // ---------- Nueva partida ----------
  await page.getByRole("button", { name: "Nueva partida" }).click();
  await page.waitForTimeout(250);
  check(
    "nueva partida limpia la lista",
    (await page.locator("aside").innerText()).includes("Todavía no hay jugadas"),
  );

  // ---------- Promoción ----------
  await loadPosition(page, "7k/4P3/8/8/8/8/8/4K3 w - - 0 1");
  check("importar PGN/FEN carga la posición", (await page.locator(pieceAt("e7")).count()) === 1);
  await clickSquares(page, "e7", "e8");
  const dialogVisible = await page.getByRole("dialog").isVisible().catch(() => false);
  check("al promocionar aparece el selector de pieza", dialogVisible);
  await page.getByRole("button", { name: "Dama" }).click();
  await page.waitForTimeout(300);
  check(
    "la promoción a dama se aplica",
    (await page.locator("aside").innerText()).includes("e8=Q"),
  );
  check(
    "la dama está en e8",
    (await page.locator(`${square("e8")} [data-piece="wQ"]`).count()) === 1,
  );

  // ---------- Enroque corto ----------
  await loadPosition(page, "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  await clickSquares(page, "e1", "g1");
  check("el enroque corto se registra", (await page.locator("aside").innerText()).includes("O-O"));
  check(
    "el rey termina en g1 y la torre en f1",
    (await page.locator(`${square("g1")} [data-piece="wK"]`).count()) === 1 &&
      (await page.locator(`${square("f1")} [data-piece="wR"]`).count()) === 1,
  );

  // ---------- Captura al paso ----------
  await loadPosition(page, "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  await clickSquares(page, "e5", "d6");
  check(
    "la captura al paso se registra",
    (await page.locator("aside").innerText()).includes("exd6"),
  );
  check(
    "el peón capturado desaparece de d5",
    (await page.locator(pieceAt("d5")).count()) === 0 &&
      (await page.locator(`${square("d6")} [data-piece="wP"]`).count()) === 1,
  );

  // ---------- Jaque mate (mate del loco) ----------
  await page.getByRole("button", { name: "Nueva partida" }).click();
  await page.waitForTimeout(200);
  await clickSquares(page, "f2", "f3", "e7", "e5", "g2", "g4", "d8", "h4");
  const mateStatus = await page.getByTestId("turn-status").innerText();
  check("detecta el jaque mate", mateStatus.includes("Jaque mate"), mateStatus);
  check("atribuye la victoria a las negras", mateStatus.includes("negras"), mateStatus);

  // ---------- Capturas de pantalla ----------
  await page.getByRole("button", { name: "Nueva partida" }).click();
  await page.waitForTimeout(200);
  await clickSquares(page, "d2", "d4", "d7", "d5", "c2", "c4");
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("local-desktop.png"), fullPage: true });

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on("pageerror", (error) => consoleErrors.push(`mobile: ${error.message}`));
  await mobilePage.goto(`${BASE}/play/local`, { waitUntil: "networkidle" });
  await mobilePage.waitForSelector(square("e2"));
  const corner = await mobilePage.locator(square("h8")).boundingBox();
  check(
    "en móvil el tablero no se desborda",
    !!corner && corner.x + corner.width <= 390,
    corner ? `borde derecho en ${Math.round(corner.x + corner.width)}px de 390` : "sin caja",
  );
  check(
    "en móvil las casillas son tocables (≥32px)",
    !!corner && corner.width >= 32,
    corner ? `${Math.round(corner.width)}px por casilla` : "sin caja",
  );
  await mobilePage.screenshot({ path: shot("local-mobile.png"), fullPage: true });

  check("sin errores en consola", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();

  console.log(`\n${results.length - failed}/${results.length} comprobaciones OK`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("La prueba ha fallado:", error);
  process.exit(1);
});
