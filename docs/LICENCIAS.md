# Licencias — decisión cerrada

> **Requisito del proyecto:** todo gratis, de libre uso, sin burocracia.
> **Decisión:** el proyecto se publica bajo **AGPL-3.0** y el código es público.
> **Burocracia resultante:** un fichero `LICENSE` y una página de créditos. Nada más. Nunca más.

---

## 1. La decisión en una línea

**Código abierto con AGPL-3.0, repo público desde el primer commit.**

Esta es la opción que exige **menos** gestión de licencias de todas las posibles, no la que más. La razón es contraintuitiva y está en §4.

---

## 2. Qué NO es la GPL (mitos que cuestan proyectos)

| Mito | Realidad |
|---|---|
| "La GPL no es gratis" | La GPL **nunca** cuesta dinero. Ni ahora ni si el proyecto crece. No hay tasas, ni registro, ni suscripción, ni versión "pro". |
| "Tengo que registrarme o declarar algo" | No existe ningún registro de software GPL en ningún país. No hay trámite. No hay formulario. |
| "Necesito un abogado" | Para un proyecto propio publicado en GitHub, no. La obligación es técnica y mecánica (§3). |
| "Pierdo la propiedad de mi código" | **No.** El copyright sigue siendo tuyo al 100 %. La GPL solo concede permisos a otras personas; no te quita ninguno de los tuyos. Puedes seguir usándolo, venderlo, o publicarlo donde quieras. |
| "Alguien puede reclamarme mi web" | No. La GPL concede derechos, no los quita. Nadie puede cerrarte el sitio ni reclamarte el dominio. |
| "Me obligan a dar soporte o a aceptar cambios" | No. No hay obligación de atender a nadie, ni de aceptar contribuciones, ni de dar garantía (la GPL de hecho incluye una renuncia explícita de garantía que **te protege**). |
| "Otros pueden hacer negocio con mi código" | Sí, y es deliberado. Pero si modifican y distribuyen, deben publicar sus cambios igual. Es un intercambio, no una pérdida. |
| "Si me arrepiento, no puedo volver atrás" | No puedes retirar la licencia de lo ya publicado (nadie puede), pero **tu código es tuyo**: puedes dejar de publicar, o sacar versiones futuras con otra licencia sobre el código del que seas único autor. |

---

## 3. Lo que sí obliga (lista completa, sin trampa)

Todo lo que hay que hacer en este proyecto para cumplir, para siempre:

1. **Un fichero `LICENSE`** en la raíz con el texto de AGPL-3.0.
2. **El código fuente accesible.** Si el repo es público, ya está cumplido. No hay que enviar nada a nadie ni responder a solicitudes.
3. **Una página `/creditos`** que nombre las dependencias con licencia copyleft y enlace a su fuente.

**Eso es todo.** No hay más casillas. No hay auditorías. No hay renovaciones.

---

## 4. La paradoja: por qué abrir el código elimina la burocracia

Este es el punto que cambia la recomendación que te di al principio.

El ecosistema del ajedrez es **casi todo copyleft**. Las tres mejores piezas disponibles son:

- el mejor tablero del mundo (`chessground`) → GPL-3
- las reglas más correctas (`chessops`) → GPL-3
- el único motor fuerte en WASM (`Stockfish`) → GPL-3

Si quieres mantener tu código cerrado, tienes que **trabajar constantemente alrededor de ellas**: analizar si cada dependencia "contagia" tu código, renunciar a las mejores librerías, aislar el motor en un servicio aparte, revisar cada nueva dependencia antes de instalarla... **Eso sí es burocracia**, y es burocracia para siempre, en cada `pnpm add`.

Si tu proyecto es AGPL-3, la pregunta "¿esta librería es compatible?" **deja de existir**. Todo el ecosistema del ajedrez es compatible. Instalas lo mejor y no vuelves a abrir este documento nunca.

> **Regla:** la burocracia no viene de la GPL. Viene de intentar esquivarla.

### ¿Y por qué AGPL-3 y no GPL-3?

Porque AGPL-3 es **compatible con absolutamente todo** el ecosistema, incluido el material de Lichess que es AGPL (por ejemplo su envoltorio de Stockfish). GPL-3 + AGPL-3 en el mismo proyecto obliga a subir el conjunto a AGPL-3. Empezando ya en AGPL-3, no hay combinación que analizar: **el máximo común denominador desde el día 1**.

Y la cláusula extra de la AGPL (publicar el código si ofreces el software como servicio en red) **te cuesta exactamente cero**, porque tu código ya es público. Solo impide una cosa concreta: que alguien monte una versión cerrada de tu web y no comparta las mejoras. Es lo mismo que usa Lichess. Si al ajedrez le funciona, a ti también.

---

## 5. Stack definitivo y licencias (verificado contra npm)

| Pieza | Paquete / versión | Licencia | ¿Compatible con AGPL-3? |
|---|---|---|---|
| Framework | `next@16.4.3` | MIT | ✅ |
| UI | `react@19.3.1` | MIT | ✅ |
| Estilos | `tailwindcss@4.3.3` | MIT | ✅ |
| Tablero | `react-chessboard@5.12.1` | MIT | ✅ |
| Reglas | `chess.js@1.4.0` | BSD-2-Clause | ✅ |
| Motor | `stockfish@19.0.1` | GPL-3.0 | ✅ |
| Auth | `better-auth@1.7.15` | MIT | ✅ |
| ORM | `drizzle-orm@0.45.4` | Apache-2.0 | ✅ |
| BD | Neon (free tier) | servicio | ✅ |
| Hosting | Vercel / Cloudflare (free) | servicio | ✅ |
| Puzzles | dataset de Lichess | **CC0** | ✅ (dominio público, sin obligaciones) |

Todas las licencias permisivas son compatibles con AGPL-3 sin hacer nada. Y las copyleft ya están en la misma familia.

### Opciones que ahora están disponibles (y antes no)

Con el código abierto, estas alternativas dejan de estar vetadas y quedan como **mejoras opcionales**, si algún día apetece:

- `@lichess-org/chessground@10.5.0` (GPL-3): el tablero de Lichess, mejor sensación táctil. Sustituye a `react-chessboard` si el tablero "no se siente bien".
- `chessops@0.15.1` (GPL-3): reglas y PGN más robustos. Solo necesario si aparecen casos límite de PGN o si algún día hay variantes.

**Recomendación de todas formas:** **empezar con `react-chessboard` + `chess.js`**, porque son las que mejor encajan con React 19 y requieren menos código. La ventaja añadida: al ser MIT y BSD, si algún día decides cerrar el código, esa parte **te deja la puerta abierta**. Es un seguro gratuito.

**Regla de diseño que lo hace indoloro:** el tablero se encapsula en `components/board/`. Ningún otro fichero importa la librería del tablero. Cambiarlo es tocar un solo fichero.

---

## 6. Assets: piezas, sonidos, puzzles

Aquí es donde la gente se mete en líos sin darse cuenta. Reglas claras:

| Asset | Decisión |
|---|---|
| **Piezas** | Ahora es legal usar las **cburnett** que trae `chessground` (GPL, y son las de Lichess). Alternativa sin obligaciones: un set **CC0** (dominio público) o dibujar uno propio minimalista en SVG — 12 piezas, una tarde, cero problemas para siempre. |
| **Sonidos** | **Generarlos con la Web Audio API** (un `OscillatorNode` con envolvente dura ~10 líneas). Cero licencias, cero ficheros, cero peso. Es lo que recomiendo. Si no, buscar bancos **CC0** explícitos. |
| **Puzzles** | Dataset de Lichess: **CC0**, dominio público. Uso libre, sin condiciones. Atribución por cortesía, no por obligación. |
| **Explorador de aperturas** | API pública de Lichess: gratis, sin clave. Solo pide no martillear y no abusar. Es cortesía técnica, no burocracia. |
| **Fuentes** | Solo de Google Fonts (OFL) o del sistema. |
| **Iconos** | Lucide (ISC) o similares. |

**Nunca**: copiar assets de Chess.com, de la web de Lichess (código de `lila` es AGPL: úsalo como referencia, no lo pegues) ni de cursos de pago.

---

## 7. Checklist de cumplimiento

Cinco minutos, una sola vez, para siempre:

- [ ] `LICENSE` en la raíz con el texto de **AGPL-3.0** (copiar literal, sin editar).
- [ ] Repo público.
- [ ] `NOTICE` o sección en el README con las dependencias copyleft y su licencia.
- [ ] Página `/creditos` en la web con la atribución (§8).
- [ ] `package.json` con `"license": "AGPL-3.0-or-later"`.

Nada más. Si algún día alguien pregunta "¿dónde está el código?", la respuesta es la URL del repo.

---

## 8. Texto para la página de créditos

```
webajedrez es software libre bajo licencia AGPL-3.0.
Código fuente: https://github.com/<tu-usuario>/webajedrez

Este sitio usa los siguientes componentes de software libre:

- Stockfish — motor de ajedrez — GPL-3.0
  https://github.com/official-stockfish/Stockfish
- chess.js — reglas del ajedrez — BSD-2-Clause
- react-chessboard — tablero — MIT
- Next.js, React, Tailwind CSS — MIT
- Better Auth — MIT · Drizzle ORM — Apache-2.0
- Conjunto de puzzles: Lichess open puzzle database — CC0
- Conjunto de piezas: cburnett — GPL-3.0 (o el set CC0 que se acabe usando)

Stockfish se ejecuta en tu navegador. Su código fuente y el de este sitio
están disponibles en los enlaces de arriba.
```

Ese texto cubre todas las obligaciones reales del proyecto.

---

## 9. Si algún día quieres cerrar el código

Solo para que sepas el coste, sin sorpresas:

| Querrías | Qué habría que cambiar | Coste |
|---|---|---|
| Web privada, sin publicar código | Sustituir el motor WASM por un servicio backend separado (el código propio no deriva de él) | Servidor con CPU, unos € /mes. Y perder el análisis "gratis" en el navegador. |
| Producto comercial cerrado | Además: sustituir `chessground`/`chessops` si se hubieran adoptado (por eso se empieza con MIT+BSD), y revisar cada dependencia nueva | Trabajo continuo y para siempre |

Por eso el stack del §5 (MIT + BSD + motor aislable) es también el que **mantiene esa puerta abierta** sin renunciar a nada hoy.

---

## 10. Estado

**Decisión cerrada. No vuelve a estar abierta.** Cualquier dependencia nueva se acepta si su licencia es permisiva (MIT / BSD / Apache / ISC) o copyleft compatible con AGPL-3. Esa es toda la política de licencias del proyecto.
