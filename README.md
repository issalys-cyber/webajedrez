# webajedrez

Web para jugar al ajedrez. Jugador local, contra el motor y partidas online 1v1.

**Estado:** Fase 0 completada y verificada. Tablero local jugable: reglas completas, PGN/FEN, sonidos y promoción.
**Stack:** Next.js 16 + React 19 + TypeScript + Tailwind 4, tablero con `react-chessboard`, reglas con `chess.js` (ver `docs/ARQUITECTURA.md`).

## Arrancar

Requiere Node ≥ 20.9 (probado con Node 24).

```bash
npm install
npm run dev          # http://localhost:3000
```

Otros comandos:

```bash
npm run typecheck    # TypeScript en modo estricto
npm run build        # build de producción
npm run start        # servir el build
npm run smoke        # 24 comprobaciones en un navegador real (requiere el servidor arrancado)
```

`npm run smoke` necesita Chromium de Playwright: `npx playwright install chromium`.

## Qué hay dentro

```
apps/web/app/            rutas: /, /play/local, /creditos
apps/web/components/
  board/ChessBoard.tsx   ÚNICO fichero que conoce la librería del tablero
  game/                  LocalGame, MoveList, PromotionDialog
  ui/Button.tsx
apps/web/hooks/          useChessGame: estado y reglas (sin acoplar a la UI)
apps/web/lib/sound.ts    sonidos sintetizados con Web Audio (sin ficheros)
scripts/smoke.mjs        prueba end-to-end con navegador real
docs/                    arquitectura, plan, licencias y despliegue
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
