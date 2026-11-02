/**
 * Diagnóstico: ¿cuánto tarda en abrir un WebSocket contra una partida recién
 * creada en el Worker? Se ejecuta varias veces para distinguir un fallo
 * sistemático de una fluctuación.
 *
 * Uso: node scripts/rt-connect-probe.mjs [n] [urlServidor]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const ROUNDS = Number(process.argv[2] ?? 6);
const RT = process.argv[3] ?? "https://webajedrez-rt.issalys.workers.dev";

function probe(gameId, token, label) {
  return new Promise((resolve) => {
    const started = Date.now();
    const url = `${RT.replace(/^http/, "ws")}/ws?game=${gameId}&token=${token}`;
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.terminate();
      resolve({ label, ok: false, ms: Date.now() - started, reason: "timeout 15 s" });
    }, 15_000);

    socket.on("open", () => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      socket.close();
      resolve({ label, ok: true, ms });
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      resolve({ label, ok: false, ms: Date.now() - started, reason: error.message });
    });
  });
}

const results = [];

for (let i = 0; i < ROUNDS; i += 1) {
  const created = await fetch(`${RT}/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initialMs: 60_000, incrementMs: 0 }),
  }).then((response) => response.json());

  // Inmediatamente después de crear (el caso que fallaba).
  results.push(await probe(created.gameId, created.whiteToken, `inmediato#${i + 1}`));

  // Segundo intento contra la misma partida, ya "caliente".
  results.push(await probe(created.gameId, created.blackToken, `caliente#${i + 1}`));
}

const ok = results.filter((r) => r.ok).length;
for (const r of results) {
  console.log(
    `${r.ok ? "OK  " : "FALLO"} ${r.label.padEnd(14)} ${String(r.ms).padStart(6)} ms ${r.reason ?? ""}`,
  );
}
console.log(`\n${ok}/${results.length} conexiones abiertas`);
process.exit(ok === results.length ? 0 : 1);
