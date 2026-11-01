# Plan de ejecución — webajedrez

> Estimaciones en **días de trabajo efectivo** de una persona. No son fechas de calendario.
> Cada fase termina en un estado **desplegado y usable**, no en "código escrito".

---

## 0. Principios de ejecución

1. **Cada fase se publica.** No hay fase terminada si no está en una URL real que otra persona pueda abrir.
2. **Vertical, no horizontal.** Primero un flujo completo y feo; después más flujos. Nunca "todos los componentes a medias".
3. **El núcleo se testea sin red.** `GameRoom`, relojes y Glicko-2 tienen tests automáticos desde el primer día. Es el 20 % del código que causa el 80 % de los bugs.
4. **Tiempo inyectado.** Ninguna función de lógica llama a `Date.now()` internamente: reciben `now` como parámetro. Sin esto, los tests de reloj son imposibles.
5. **Nada entra al alcance a mitad de fase.** Las ideas nuevas van a la sección 8 (aparcadas).

### Definición de "hecho" (aplica a toda tarea)

- [ ] Funciona en Chrome, Firefox y Safari (incluido iOS Safari).
- [ ] Funciona con teclado y con lector de pantalla en lo esencial (el tablero es navegable y las jugadas se anuncian).
- [ ] Sin errores en consola, sin `any` en TypeScript.
- [ ] Tests verdes en CI (unitarios; e2e en las fases que se indican).
- [ ] Desplegado.

---

## Fase 0 — Tablero local (hot-seat)

**Objetivo:** dos personas juegan en el mismo navegador, con reglas correctas y PGN exportable. Sin backend.
**Estimación:** 1-2 días. **Coste de infraestructura:** 0 €.

### Tareas

- [x] Monorepo con workspaces: `apps/web` creado. **Nota:** se usa **npm workspaces** porque `pnpm` no está instalado en la máquina de desarrollo; el plan original decía pnpm y el resultado es equivalente. `packages/shared`, `packages/rating` y `apps/rt` se crearán cuando hagan falta (fases 2 y 3), no antes: carpetas vacías son deuda sin retorno.
- [x] Scaffold de Next.js 16 + TypeScript `strict` (`noUncheckedIndexedAccess` incluido) + Tailwind 4. **Pendiente:** ESLint/Prettier (Next 16 ya no trae `next lint`; se configura aparte).
- [x] `components/board/ChessBoard.tsx`: adaptador **único** sobre `react-chessboard`. Ningún otro fichero importa la librería del tablero.
- [x] `hooks/useChessGame.ts`: estado con `chess.js` 1.4 (`fen`, `moves`, `move()`, `history()`, `pgn()`). Toda la lógica de reglas vive aquí, sin depender de React para poder testearla.
- [x] Resaltado de casillas legales al seleccionar pieza; arrastre y clic-clic.
- [x] Selector de promoción (dama/torre/alfil/caballo) en la casilla correcta.
- [x] Detección y aviso de: jaque mate, ahogado, tablas por material, triple repetición, regla de 50 jugadas.
- [x] Lista de jugadas en notación algebraica (SAN), con navegación ◀ ▶ y salto a cualquier jugada.
- [x] Botón de girar tablero y coordenadas con contraste por tono. **Pendiente:** temas de color del tablero (selector de temas).
- [x] Sonidos de jugada/captura/jaque/enroque/promoción. **Generados con la Web Audio API**: cero ficheros, cero licencias, cero peso.
- [x] Exportar PGN, copiar PGN, importar PGN, copiar FEN (y carga desde FEN a través de cabeceras PGN).
- [x] Layout responsive: tablero cuadrado que cabe en viewport móvil sin scroll (45 px por casilla a 390 px de ancho).
- [x] Landing mínima con explicación de 3 líneas y un CTA "Jugar", más página `/creditos`.
- [ ] Desplegar en Vercel. **Pendiente y bloqueado:** no hay `git` instalado en la máquina, así que no se puede hacer `git init` + push. Es el único paso manual que queda.

### Verificación automatizada

`scripts/smoke.mjs` (Playwright + Chromium) comprueba **24 aserciones** contra el servidor de producción: render de las 64 casillas, clic origen/destino, arrastre, jugada ilegal rechazada, deshacer, nueva partida, **promoción con diálogo**, **enroque**, **captura al paso**, **jaque mate**, resaltado del último movimiento, tablero sin desbordar en móvil y cero errores de consola (lo que cubre fallos de hidratación).

```bash
npm run build && npm run start      # en una terminal
npm run smoke                       # en otra
```

### Criterios de aceptación

1. Se puede jugar una partida completa de principio a fin, incluido un enroque, una captura al paso y una promoción.
2. El PGN exportado se importa en Lichess sin errores.
3. En un móvil de 375 px de ancho el tablero es usable con el dedo.
4. Lighthouse móvil: rendimiento ≥ 90, accesibilidad ≥ 90.

### Riesgos de esta fase

- La promoción y la captura al paso son los dos casos que siempre se rompen. Probarlos explícitamente.
- No empezar a "mejorar el diseño" antes de que la partida funcione.

---

## Fase 1 — Contra el motor (Stockfish WASM)

**Objetivo:** un jugador contra la máquina, con niveles creíbles y evaluación en vivo. Sigue sin backend.
**Estimación:** 3-5 días. **Coste:** 0 €.
**Bloqueante previo:** ~~decidir la licencia del proyecto~~ **Resuelto: AGPL-3.0, código abierto** (ver [`LICENCIAS.md`](LICENCIAS.md)). Se puede usar `stockfish@19.0.1` (GPL-3.0) sin más gestión. Lo único que hay que crear en esta fase: fichero `LICENSE` y página `/creditos` con el texto ya redactado en `LICENCIAS.md` §8.

### Tareas

- [ ] `lib/engine/worker.ts`: wrapper UCI sobre `stockfish@19.0.1` (build `--lite` y `--single-threaded` para evitar cabeceras COOP/COEP) dentro de un Web Worker.
- [ ] Protocolo tipado: `uci`, `isready`, `position fen`, `go depth/movetime`, `stop`, parseo de `info depth ... score cp/mate`, `bestmove`.
- [ ] Cancelación de búsqueda en curso al mover el jugador (evita respuestas obsoletas).
- [ ] Configuración del motor diferente de `lib/engine/` en cliente y en tests (interfaz `Engine` inyectable, con un `FakeEngine` determinista para tests).
- [ ] Pantalla `/play/bot`: selector de nivel (1-20), selector de color, control de tiempo opcional.
- [ ] Tabla de niveles → parámetros de Stockfish (`Skill Level`, `depth`, `MultiPV`, `UCI_LimitStrength`). Ver ADR-004.
- [ ] Indicador de "pensando" con el tiempo mínimo por nivel (para que el nivel 1 no responda en 30 ms y se sienta antinatural).
- [ ] Barra de evaluación opcional (toggle), con la evaluación del motor.
- [ ] Carga diferida: el motor **no** se descarga hasta que se pulsa "jugar". Mostrar progreso de descarga la primera vez.
- [ ] Botón "pedir sugerencia" (usa el motor para resaltar la mejor jugada, limitado a N veces por partida).
- [ ] Persistir la partida contra el bot en `localStorage` para no perderla al refrescar (sin backend todavía).
- [ ] Página de "análisis" básica que reutiliza el worker sobre un PGN pegado.

### Criterios de aceptación

1. El nivel 1 es ganable por un principiante y el nivel 20 es inalcanzable para un humano normal.
2. El motor no bloquea nunca la UI: se puede arrastrar una pieza mientras piensa.
3. El primer render de `/play/bot` ocurre antes de que el motor empiece a descargarse.
4. Se puede jugar y analizar en móvil sin que el navegador se cuelgue (probar en un móvil de gama media real).
5. Atribución de Stockfish y su licencia visibles en el pie de página.

### Riesgos de esta fase

- **NNUE grande = muchos MB.** Empezar con la red pequeña; ofrecer la grande solo en análisis profundo.
- iOS Safari puede matar workers con memoria alta. Medir.

---

## Fase 2 — Online 1v1 con salas por enlace

**Objetivo:** dos personas juegan en tiempo real desde dispositivos distintos, con reloj, y **el servidor manda**.
**Estimación:** 5-7 días. Es la fase más difícil del proyecto.

### Tareas

- [ ] `apps/rt`: proceso Node con `ws`, TypeScript, mismo `shared` que el cliente.
- [ ] `GameRoom.ts` **puro**: `applyMessage(state, msg, now) → { state, outgoing[] }`. Sin red, sin timers, sin `Date.now()` interno.
- [ ] Tests de `GameRoom`: jugada legal, jugada ilegal, fuera de turno, `cid` duplicado, `ply` obsoleto, promoción, jaque mate, abandono, rendición.
- [ ] Tests de reloj con `now` inyectado: descuento, incremento, bandera caída, timeout con reloj a 0, `lagCompensation`.
- [ ] Autenticación efímera: `POST /api/games/{id}/ws-ticket` → JWT `aud=game`, `exp=60s`.
- [ ] Cliente `lib/realtime/`: conexión, backoff con jitter, `sync` al reconectar, cola de mensajes salientes no confirmados.
- [ ] Presencia y ventana de gracia de 15 s (ver §7 de `ARQUITECTURA.md`).
- [ ] Reloj en UI: interpolación suave a 100 ms con corrección de deriva por `pong`.
- [ ] Temporizador de servidor que declara `timeout` sin necesitar mensajes de nadie.
- [ ] Pantalla `/game/[id]`: tablero, relojes, lista de jugadas, botones de rendirse/tablas, indicador de estado del rival.
- [ ] Botón "crear partida" que genera id ULID y enlace para compartir; pantalla de espera con el enlace copiable.
- [ ] **Revancha** y **volver a jugar**.
- [ ] Postgres + Drizzle: esquema de `game`, migraciones versionadas, escritura de la partida al terminar.
- [ ] Checkpoint de partida cada 30 s / 10 jugadas para sobrevivir a un reinicio del servidor.
- [ ] Tests e2e (Playwright) de una partida completa entre dos contextos de navegador.
- [ ] Desplegar `apps/rt` como Worker de Cloudflare con la clase Durable Object, usando la **WebSocket Hibernation API** y `setAlarm()` para los relojes; comprobar que el estado no se comparte entre partidas distintas. Detalle en [`DESPLIEGUE.md`](DESPLIEGUE.md).

### Criterios de aceptación

1. Dos navegadores juegan una partida completa; ambos ven el mismo estado y el mismo resultado.
2. **Trampa bloqueada:** modificando el JS del cliente para enviar una jugada ilegal, el servidor la rechaza y el estado no cambia.
3. Refrescar la pestaña a mitad de partida recupera la partida con el reloj correcto.
4. Desconectar la red 10 s y reconectar: la partida continúa sin desincronización.
5. Cerrar la pestaña: el reloj sigue corriendo en el otro lado y se pierde por `timeout` al llegar a 0.
6. El reloj no se desvía más de ~200 ms del servidor en una partida de 5 minutos.
7. Reiniciar el proceso del servidor a mitad de partida no produce resultados inventados.

### Riesgos de esta fase

- Los casos límite del reloj son infinitos. Mitigación: lógica pura + tests con tiempo inyectado, **antes** de tocar la UI.
- No añadir matchmaking todavía. Salas por enlace primero: valida el transporte con 1/10 del trabajo.

---

## Fase 3 — Cuentas, matchmaking y rating

**Objetivo:** el jugador pulsa "jugar", encuentra rival de nivel similar y su resultado cuenta.
**Estimación:** 4-6 días.

### Tareas

- [ ] Better Auth: registro, login, logout, sesión, verificación de email (o desactivarla al principio y decirlo).
- [ ] `profile` con username único; onboarding mínimo (elige nombre, sin formulario de 10 campos).
- [ ] Página de perfil: partidas recientes, rating por pool, resultado.
- [ ] `packages/rating`: Glicko-2 implementado a mano + tests contra los ejemplos del paper de Glickman.
- [ ] Cola de matchmaking: sorted set por pool y rating; ventana ±100 que se amplía con el tiempo de espera.
- [ ] Emparejar → crear partida → notificar a ambos por WS con el `gameId`.
- [ ] Aplicar rating al terminar, en una transacción con el insert de la partida. Sin rating si `ply < 2`.
- [ ] Historial de partidas con filtros (pool, resultado) y repetición en el tablero.
- [ ] Salvaguarda: "jugar contra el bot mientras esperas" si la cola supera X segundos (problema real de un sitio nuevo con pocos usuarios).
- [ ] Rate limiting en `seek` para evitar que una cuenta sature la cola.

### Criterios de aceptación

1. Dos cuentas nuevas se emparejan en menos de 30 s con ventana de rating ampliada.
2. El rating solo se mueve cuando la partida lo merece; una partida abortada no lo toca.
3. Un usuario no puede acceder a datos de otro por ID (comprobar autorización en cada ruta, no solo en la UI).
4. Un tercer usuario puede **ver** la partida en vivo (solo lectura) sin poder intervenir.

---

## Fase 4 — Puzzles y análisis

**Objetivo:** dar una razón para volver sin necesitar un rival conectado.
**Estimación:** 4-6 días.

### Tareas

- [ ] Importar el dataset de puzzles de Lichess (CC0): script de descarga, filtrado por rating y temas, carga en Postgres (o JSON estático si el volumen es pequeño).
- [ ] Pantalla de puzzle: resolver jugando en el tablero, validación contra la línea solución, feedback inmediato, racha diaria.
- [ ] "Puzzle del día" determinista por fecha (mismo para todos).
- [ ] Análisis post-partida: recorrer la partida con el motor, marcar errores graves (pérdida > 1.5 peones) y momentos clave.
- [ ] Gráfico de evaluación a lo largo de la partida (canvas, no 80 divs).
- [ ] Importar PGN externo para analizar.
- [ ] Explorador de aperturas contra la API pública de Lichess (cacheado, con atribución y respetando límites).

### Criterios de aceptación

1. Un puzzle mal resuelto explica por qué, no solo dice "mal".
2. El análisis de una partida de 40 jugadas termina en < 20 s en un portátil normal, con progreso visible y posibilidad de cancelar.
3. Los puzzles no bloquean el hilo principal.

---

## Fase 5 — Pulido y producto

**Estimación:** continuo.

- [ ] PWA: manifest, service worker, instalable, tablero local offline.
- [ ] i18n (español primero, inglés después) con `next-intl`.
- [ ] Temas de tablero y de piezas; preferencias persistidas.
- [ ] Atajos de teclado (`f` girar, `←/→` navegar, `Esc` cerrar diálogos).
- [ ] Accesibilidad real: navegación del tablero con teclado, anuncios de jugada con `aria-live`.
- [ ] Anti-abuso mínimo: detección de cuentas que abandonan sistemáticamente, límites de partidas simultáneas.
- [ ] Observabilidad: logs estructurados en `apps/rt`, métricas de partidas activas y de latencia de jugada, alertas de errores.
- [ ] Copia de seguridad de Postgres y prueba de restauración.
- [ ] Páginas legales: aviso de licencias de terceros, privacidad, términos.

---

## 6. Orden de dependencias

```
Fase 0 ──► Fase 1 ──► Fase 2 ──► Fase 3 ──► Fase 4 ──► Fase 5
   │           │          │
   │           └── bloqueada por: decisión de licencia
   │                      └── bloqueada por: esquema de BD y auth (parcial)
   └── nada bloquea la Fase 0: se puede empezar hoy
```

`GameRoom` (Fase 2) se puede escribir y **testear** en paralelo con la Fase 1, porque no depende de la UI.

---

## 7. Estrategia de pruebas

| Nivel | Qué cubre | Herramienta |
|---|---|---|
| Unitario puro | `GameRoom`, reloj, Glicko-2, parseo UCI | Vitest, sin red, tiempo inyectado |
| Componentes | Tablero, reloj, diálogos | Vitest + Testing Library |
| Integración | Flujo WS completo con dos clientes simulados | Vitest + servidor en memoria |
| E2E | Partida real entre dos navegadores | Playwright |
| Manual | Móvil real, iOS Safari, red lenta | Antes de cada fase publicada |

**Cobertura mínima exigida:** `GameRoom`, `clock` y `rating` al 100 % de ramas. El resto, sin objetivo numérico: se testea lo que puede romperse en silencio.

CI en GitHub Actions: typecheck, lint, test, build. Bloqueante para merge.

---

## 8. Aparcado a propósito (NO hacer ahora)

Cada uno de estos elementos puede duplicar el proyecto. Se revisan solo cuando la fase 4 esté en producción:

- Torneos y arenas.
- Variantes (Chess960, atom, king of the hill). `chess.js` no las soporta y obligaría a cambiar de motor de reglas.
- Partidas por correspondencia (días por jugada): es **otro producto** con otro modelo de reloj y notificaciones.
- Chat de texto libre (moderación). Máximo: emoticonos predefinidos.
- Clanes, clubes, equipos, ligas.
- Anti-cheat con correlación de motor.
- App móvil nativa (la PWA cubre el 95 % del caso de uso).
- Integración con Lichess/Chess.com más allá de importar PGN.
- Microservicios, Kubernetes, GraphQL. Un proceso y Postgres llegan muy lejos.

---

## 9. Métricas de éxito

| Fase | Métrica que dice "esto funciona" |
|---|---|
| 0 | Una partida completa exportable a PGN, en móvil, sin errores en consola. |
| 1 | Un amigo juega 5 partidas seguidas contra el bot sin que se rompa nada. |
| 2 | Dos personas juegan una partida online con el móvil en redes distintas (una en 4G). |
| 3 | Alguien que no eres tú se registra y juega una partida puntuada. |
| 4 | Un usuario resuelve 3 puzzles seguidos y vuelve al día siguiente. |
| 5 | Retención a 7 días > 10 %. |

---

## 10. Próximo paso concreto

**Empezar la Fase 0 hoy** con esta secuencia exacta:

1. `pnpm init` + workspaces + scaffold de Next.js 16 + TS + Tailwind 4.
2. Instalar `react-chessboard@5.12.1` y `chess.js@1.4.0`.
3. Crear `hooks/useChessGame.ts` con el estado y las jugadas legales.
4. Montar `components/board/ChessBoard.tsx` y comprobar que se puede mover una pieza.
5. Antes de seguir: verificar enroque, captura al paso y promoción.

**Decisión de licencia: cerrada.** El proyecto es **AGPL-3.0 con repo público**, así que todo el ecosistema del ajedrez es compatible y no queda nada que analizar al añadir dependencias (ver [`LICENCIAS.md`](LICENCIAS.md)). Ya no hay ningún bloqueante previo: la Fase 0 se puede empezar cuando se quiera.
