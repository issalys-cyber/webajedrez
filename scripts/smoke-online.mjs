/**
 * Prueba de la partida online de punta a punta, con dos navegadores reales.
 *
 * Se comprueba lo que solo se puede ver con dos clientes conectados:
 *  - que una jugada de uno aparece en el otro;
 *  - que los relojes corren y cuadran;
 *  - que el SERVIDOR rechaza jugadas ilegales y fuera de turno enviadas a mano
 *    por WebSocket (la prueba de que no se puede hacer trampa desde el cliente);
 *  - que al cerrar una pestaña el rival lo nota y al volver la partida sigue;
 *  - que una rendición termina la partida para los dos.
 *
 * Requiere el servidor de partidas (`npm run dev -w @webajedrez/rt`) y el de
 * Next. Uso: node scripts/smoke-online.mjs [urlWeb] [urlServidor]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const WEB = process.argv[2] ?? "http://localhost:3000";
const RT = process.argv[3] ?? "http://localhost:8787";
const SHOTS = fileURLToPath(new URL("../shots/", import.meta.url));
const shot = (name) =>
  fileURLToPath(new URL(name, new URL("../shots/", import.meta.url)));

const square = (name) => `[data-square="${name}"]`;

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FALLO"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const moveCount = (page) => page.locator("[data-move-index]").count();

async function playMove(page, from, to) {
  await page.click(square(from));
  await page.click(square(to));
}

/** Cliente WebSocket crudo para hablar con el servidor sin pasar por la UI. */
function rawSocket(gameId, token) {
  const url = `${RT.replace(/^http/, "ws")}/ws?game=${gameId}&token=${token}`;
  const socket = new WebSocket(url);
  const inbox = [];
  const waiters = [];

  socket.on("message", (data) => {
    const message = JSON.parse(String(data));
    inbox.push(message);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      const waiter = waiters[i];
      if (waiter.match(message)) {
        waiters.splice(i, 1);
        waiter.resolve(message);
      }
    }
  });

  return {
    waitFor(match, timeout = 8000) {
      const existing = inbox.find(match);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("timeout esperando un mensaje del servidor")),
          timeout,
        );
        waiters.push({
          match,
          resolve: (message) => {
            clearTimeout(timer);
            resolve(message);
          },
        });
      });
    },
    send(message) {
      socket.send(JSON.stringify(message));
    },
    async ready() {
      await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      return this.waitFor((message) => message.t === "ready");
    },
    close() {
      socket.close();
    },
  };
}

async function main() {
  await mkdir(SHOTS, { recursive: true });

  // Perro guardián: si algo se queda colgado (un arranque en frío del Worker,
  // por ejemplo), la prueba falla en vez de comerse siete minutos.
  const watchdog = setTimeout(() => {
    console.error("La prueba ha superado el tiempo máximo (180 s). Abortando.");
    process.exit(1);
  }, 180_000);
  watchdog.unref?.();

  const health = await fetch(`${RT}/health`).then((response) => response.json());
  check("el servidor de partidas responde", health.ok === true, JSON.stringify(health));

  const browser = await chromium.launch();
  const errors = [];

  try {
    // ---------- Blancas: crean la partida desde la portada ----------
    const whiteContext = await browser.newContext({ viewport: { width: 1280, height: 940 } });
    const white = await whiteContext.newPage();
    white.on("pageerror", (error) => errors.push(`blancas: ${error.message}`));

    await white.goto(WEB, { waitUntil: "networkidle" });
    await white.getByRole("button", { name: /Crear partida online/ }).click();
    await white.waitForURL(/\/game\/[a-z0-9]{8,32}/, { timeout: 20000 });
    check("crear partida lleva a la sala", /\/game\/[a-z0-9]{8,32}/.test(white.url()));

    const gameUrl = white.url();
    const gameId = /\/game\/([a-z0-9]{8,32})/.exec(gameUrl)?.[1] ?? "";
    const whiteToken = /#t=(.+)$/.exec(gameUrl)?.[1] ?? "";

    const waitingBanner = white.getByText("Envía este enlace a tu rival");
    await waitingBanner.waitFor({ timeout: 15000 });
    check("la sala de espera muestra el enlace para el rival", await waitingBanner.isVisible());

    const shareLink = (await white.locator("aside code").first().innerText()).trim();
    const blackToken = /#t=(.+)$/.exec(shareLink)?.[1] ?? "";
    check(
      "el enlace del rival lleva un token distinto",
      blackToken.length > 20 && blackToken !== whiteToken,
    );

    // ---------- Negras: entran por el enlace ----------
    const blackContext = await browser.newContext({ viewport: { width: 1280, height: 940 } });
    const black = await blackContext.newPage();
    black.on("pageerror", (error) => errors.push(`negras: ${error.message}`));

    await black.goto(shareLink, { waitUntil: "networkidle" });
    await black.waitForSelector(square("e2"), { timeout: 20000 });

    await white
      .getByTestId("game-status")
      .filter({ hasText: /turno/i })
      .waitFor({ timeout: 15000 });
    check(
      "al entrar el rival, la partida empieza para los dos",
      (await white.getByTestId("game-status").innerText()).includes("Tu turno"),
    );
    check(
      "las negras ven que les toca esperar",
      (await black.getByTestId("game-status").innerText()).includes("rival"),
    );

    // ---------- Una jugada se ve en el otro lado ----------
    await playMove(white, "e2", "e4");
    await white.locator('[data-move-index="0"]').waitFor({ timeout: 15000 });
    await black.locator('[data-move-index="0"]').waitFor({ timeout: 15000 });
    check("la jugada de las blancas aparece en ambos tableros", (await moveCount(black)) === 1);
    check(
      "las negras pasan a tener el turno",
      (await black.getByTestId("game-status").innerText()).includes("Tu turno"),
    );

    await playMove(black, "e7", "e5");
    await white.locator('[data-move-index="1"]').waitFor({ timeout: 15000 });
    check("la respuesta de las negras llega a las blancas", (await moveCount(white)) === 2);

    // ---------- Los relojes corren ----------
    const before = await white.getByTestId("clock-Blancas").innerText();
    await white.waitForTimeout(1600);
    const after = await white.getByTestId("clock-Blancas").innerText();
    check("el reloj del que piensa avanza", before !== after, `${before} → ${after}`);

    // El resaltado tiene que estar en el reloj del que mueve (ahora, blancas).
    const highlight = await white.evaluate(() => {
      const isActive = (label) => {
        const span = document.querySelector(`[data-testid="clock-${label}"]`);
        const box = span?.parentElement;
        return (box?.className ?? "").toString().includes("border-accent");
      };
      return { blancas: isActive("Blancas"), negras: isActive("Negras") };
    });
    check(
      "el reloj resaltado es el del jugador con el turno",
      highlight.blancas && !highlight.negras,
      JSON.stringify(highlight),
    );

    // ---------- El servidor manda: trampas rechazadas ----------
    // Ahora mismo mueven las blancas (ply 2).
    const tramposoBlancas = rawSocket(gameId, whiteToken);
    await tramposoBlancas.ready();

    tramposoBlancas.send({ t: "move", cid: "ilegal", ply: 2, uci: "e2e5" });
    const ilegal = await tramposoBlancas.waitFor((m) => m.t === "ack" && m.cid === "ilegal");
    check(
      "rechaza una jugada ilegal",
      ilegal.accepted === false && ilegal.error === "illegal",
      ilegal.error,
    );

    tramposoBlancas.send({ t: "move", cid: "obsoleta", ply: 0, uci: "d2d4" });
    const obsoleta = await tramposoBlancas.waitFor((m) => m.t === "ack" && m.cid === "obsoleta");
    check(
      "rechaza un ply obsoleto y pide resincronizar",
      obsoleta.accepted === false && obsoleta.error === "stale",
      obsoleta.error,
    );

    tramposoBlancas.close();

    const tramposoNegras = rawSocket(gameId, blackToken);
    await tramposoNegras.ready();
    tramposoNegras.send({ t: "move", cid: "fuera", ply: 2, uci: "g8f6" });
    const fuera = await tramposoNegras.waitFor((m) => m.t === "ack" && m.cid === "fuera");
    check(
      "rechaza mover al que no tiene el turno",
      fuera.accepted === false && fuera.error === "not-your-turn",
      fuera.error,
    );
    tramposoNegras.close();

    await white.waitForTimeout(500);
    check("la partida no se ha alterado con los intentos", (await moveCount(white)) === 2);

    // ---------- Cerrar la pestaña y volver ----------
    await black.close();
    const rivalCaido = white.getByText("El rival se ha desconectado");
    await rivalCaido.waitFor({ timeout: 20000 }).catch(() => null);
    check("las blancas notan que el rival se ha ido", await rivalCaido.isVisible().catch(() => false));

    const blackAgainContext = await browser.newContext({
      viewport: { width: 1280, height: 940 },
    });
    const blackAgain = await blackAgainContext.newPage();
    blackAgain.on("pageerror", (error) => errors.push(`negras2: ${error.message}`));
    await blackAgain.goto(shareLink, { waitUntil: "networkidle" });
    await blackAgain.waitForSelector(square("e2"), { timeout: 20000 });
    await blackAgain
      .getByTestId("connection-status")
      .filter({ hasText: /conectado/ })
      .waitFor({ timeout: 20000 });

    check(
      "al volver, la partida sigue donde estaba",
      (await moveCount(blackAgain)) === 2,
      `${await moveCount(blackAgain)} jugadas`,
    );
    check(
      "el turno sigue siendo de las blancas tras la reconexión",
      (await blackAgain.getByTestId("game-status").innerText()).includes("rival") &&
        (await white.getByTestId("game-status").innerText()).includes("Tu turno"),
      await blackAgain.getByTestId("game-status").innerText(),
    );

    await rivalCaido.waitFor({ state: "detached", timeout: 15000 }).catch(() => null);
    check(
      "el aviso de rival ausente desaparece",
      (await rivalCaido.isVisible().catch(() => false)) === false,
    );

    // ---------- Rendición ----------
    await blackAgain.getByRole("button", { name: "Rendirse" }).click();
    await white.getByTestId("game-status").filter({ hasText: "1-0" }).waitFor({ timeout: 15000 });
    check(
      "la rendición da la victoria a las blancas en los dos lados",
      (await white.getByTestId("game-status").innerText()).includes("1-0") &&
        (await blackAgain.getByTestId("game-status").innerText()).includes("1-0"),
    );

    await white.screenshot({ path: shot("online-desktop.png"), fullPage: true });

    // ---------- Timeout sin que nadie envíe mensajes ----------
    // Es la prueba de la alarma: en Durable Objects el servidor tiene que
    // despertarse solo para declarar la caída de bandera. Partida de 10 s
    // (el mínimo que admite la API) y ningún mensaje durante la espera.
    console.log("\n  (partida de 10 s: se espera la caída de bandera)");
    const shortGame = await fetch(`${RT}/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initialMs: 10_000, incrementMs: 0 }),
    }).then((response) => response.json());

    const shortWhite = rawSocket(shortGame.gameId, shortGame.whiteToken);
    const shortBlack = rawSocket(shortGame.gameId, shortGame.blackToken);
    await shortWhite.ready();
    await shortBlack.ready();

    const began = Date.now();
    const end = await shortBlack.waitFor((message) => message.t === "end", 25_000);
    const elapsed = Date.now() - began;

    check(
      "el servidor declara la caída de bandera sin que nadie envíe nada",
      end.termination === "timeout",
      end.termination,
    );
    check("gana el rival de quien no movió", end.result === "0-1", end.result);
    check(
      "lo declara en el plazo esperado",
      elapsed >= 9_000 && elapsed <= 20_000,
      `${(elapsed / 1000).toFixed(1)} s`,
    );
    shortWhite.close();
    shortBlack.close();

    // ---------- Móvil ----------
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(shareLink, { waitUntil: "networkidle" });
    await mobilePage.waitForSelector(square("e2"), { timeout: 20000 });
    // El tablero puede estar girado (aquí las negras juegan con orientación
    // negra), así que el borde derecho se mide sobre todas las casillas.
    const rightEdge = await mobilePage.evaluate(() =>
      Math.max(
        ...Array.from(document.querySelectorAll("[data-square]")).map(
          (element) => element.getBoundingClientRect().right,
        ),
      ),
    );
    check(
      "en móvil el tablero online no se desborda",
      rightEdge <= 390,
      `borde derecho en ${Math.round(rightEdge)}px de 390`,
    );
    await mobilePage.screenshot({ path: shot("online-mobile.png"), fullPage: true });

    check("sin errores de página", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }

  clearTimeout(watchdog);
  console.log(`\n${failed === 0 ? "Todo OK" : failed + " comprobaciones fallidas"}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`La prueba ha fallado: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
