# webajedrez

Web para jugar al ajedrez. Jugador local, contra el motor y partidas online 1v1.

**Estado:** Fase 0, Fase 1 y el núcleo de la Fase 2 (online) completados y verificados. El despliegue del servidor de partidas está pendiente.
**En vivo:** https://webajedrez-f11ajedrez.vercel.app · **Código:** https://github.com/issalys-cyber/webajedrez
**Stack:** Next.js 16 + React 19 + TypeScript + Tailwind 4, tablero con `react-chessboard`, reglas con `chess.js` (ver `docs/ARQUITECTURA.md`).

## Arrancar

Requiere Node ≥ 20.9 (probado con Node 24).

```bash
npm install
npm run dev          # http://localhost:3000
```

Otros comandos:

```bash
npm run typecheck     # TypeScript estricto de la web y del servidor de partidas
npm run build         # build de producción
npm run start         # servir el build
npm run dev:rt        # servidor de partidas en el puerto 8787 (para el modo online)
npm run test:node     # 40 comprobaciones sin navegador (28 de GameRoom + 12 de motor/UCI)
npm run test:browser  # 63 comprobaciones en Chromium real (requiere los dos servidores)
```

Las pruebas de navegador necesitan Chromium de Playwright: `npx playwright install chromium`.

Para probar el modo online en local hacen falta **dos procesos**: `npm run dev:rt` y `npm run dev`.

## Qué hay dentro

```
apps/web/app/              rutas: /, /play/local, /play/bot, /game/[id], /creditos
apps/web/components/
  board/ChessBoard.tsx     ÚNICO fichero que conoce la librería del tablero
  engine/EvalBar.tsx       barra de evaluación
  game/                    LocalGame, BotGame, OnlineGame, MoveList, PromotionDialog
  ui/Button.tsx
apps/web/hooks/            useChessGame, useEngine, useOnlineGame, useMoveSounds
apps/web/lib/engine/       cliente UCI, parseo del protocolo y los 20 niveles
apps/web/lib/realtime/     cliente WebSocket (backoff, cola, sync) y utilidades
apps/web/lib/chess/        conversión UCI → jugada (probada sin navegador)
apps/web/lib/sound.ts      sonidos sintetizados con Web Audio (sin ficheros)
apps/web/public/engine/    Stockfish 19 lite single-threaded (1,8 MB) + su licencia
apps/rt/src/GameRoom.ts    reglas y reloj de la partida: PURO, sin red ni timers
apps/rt/src/server.ts      transporte WebSocket (salas en memoria)
packages/shared/           protocolo tipado compartido por cliente y servidor
scripts/                   pruebas end-to-end, de motor y de partida online
docs/                      arquitectura, plan, licencias y despliegue
```

## Documentos

| Documento | Contenido |
|---|---|
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Decisiones técnicas (ADRs), diagramas, modelo de datos, protocolo tiempo real, relojes y reconexión, seguridad, licencias, costes. |
| [`docs/PLAN.md`](docs/PLAN.md) | Fases, tareas, criterios de aceptación y estimaciones. Qué se construye y en qué orden. |
| [`docs/LICENCIAS.md`](docs/LICENCIAS.md) | Licencia del proyecto (**AGPL-3.0**), mitos habituales, checklist de cumplimiento y stack verificado por licencia. |
| [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) | Dónde se publica cada pieza (GitHub, Vercel, Cloudflare, Neon), orden de creación de cuentas, planes gratuitos verificados y coste real. |

## Resumen en 20 segundos

- **No se programa el ajedrez**: tablero, reglas y motor son librerías maduras ya existentes.
- **Fase 0 y 1 son 100% frontend** (hot-seat y contra Stockfish): se despliegan como sitio estático, coste 0 €.
- **El trabajo real y difícil es el multijugador**: estado autoritativo en el servidor, relojes y reconexión.
- **Licencias: cerrado y sin burocracia.** El proyecto es **AGPL-3.0** con repo público, así que todo el ecosistema del ajedrez (incluido Stockfish) es compatible y la pregunta "¿puedo usar esto?" deja de existir. La obligación total es un `LICENSE` y una página `/creditos`. Ver [`docs/LICENCIAS.md`](docs/LICENCIAS.md).

## Convención de nombres

- Paquete/repo: `webajedrez`
- Dominio de ejemplo en la documentación: `webajedrez.local`
- Zona horaria de referencia en ejemplos: `UTC`. Los relojes de partida usan **milisegundos enteros** en todas las capas.
