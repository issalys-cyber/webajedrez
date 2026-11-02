# Dónde se publica — plan de despliegue

> **Objetivo:** publicar todo con **0 €** y sin tarjeta de crédito.
> **Resumen:** GitHub (código) + Vercel (web) + Cloudflare (tiempo real) + Neon (base de datos). Dominio propio es opcional.

---

## 0. Estado real (ya publicado)

| | |
|---|---|
| **Web en producción** | **https://webajedrez-f11ajedrez.vercel.app** |
| Repositorio | https://github.com/issalys-cyber/webajedrez (público, AGPL-3.0) |
| Proyecto Vercel | `webajedrez` · scope `f11ajedrez` · Root Directory `apps/web` |
| Validación | 24/24 comprobaciones end-to-end contra la URL de producción |
| Coste | **0 €** (sin tarjeta) |

Tres cosas que hubo que ajustar al desplegar de verdad, para que no vuelvan a morder:

1. **Root Directory = `apps/web`.** Es un monorepo: si se deja en la raíz, Vercel busca el `.next` en el sitio equivocado y el build falla con `routes-manifest.json couldn't be found`. Se fija con `vercel project update <proyecto> --root-directory apps/web --yes` (sin `--yes` pide confirmación y **no** aplica el cambio).
2. **Protección de despliegues desactivada.** El proyecto nace con *Vercel Authentication* (`ssoProtection: all_except_custom_domains`), que hace que **todas** las URLs `*.vercel.app` redirijan a un login de Vercel — incluida producción. Se consulta con `vercel project protection <proyecto>` y se quita con `vercel project protection disable <proyecto> --sso`.
3. **Despliegue automático: conectado.** `vercel git connect` falló al principio con *"Failed to connect issalys-cyber/webajedrez"* porque faltaba instalar la **app de Vercel en la cuenta de GitHub** (<https://github.com/apps/vercel/installations/new>). Instalada la app, la conexión quedó establecida y **cada `git push` a `main` despliega a producción solo**. Si alguna vez hay que forzar un despliegue: `npx vercel deploy --prod --yes` desde la raíz del repo.
4. **Instalación desde la raíz del monorepo.** Con `Root Directory = apps/web`, Vercel instalaba **solo** las dependencias de `apps/web` (11 paquetes) y no enlazaba `packages/shared`, así que el build moría con `TS2307: Cannot find module '@webajedrez/shared'` — y el despliegue quedaba en **Error** mientras producción seguía sirviendo la versión anterior. Dos arreglos, aplicados a la vez:
   - El comando de instalación del proyecto pasa a ejecutarse en la raíz: `vercel project update <proyecto> --install-command "cd ../.. && npm install" --yes`.
   - `packages/shared` se declara en `apps/web/package.json` como `"file:../../packages/shared"`, para que npm lo instale aunque el contexto sea el de la app.

   **Cómo detectarlo rápido:** un push que no cambia nada en la web suele significar build roto. `vercel ls <proyecto>` muestra el estado (`● Error`) y `vercel inspect <url> --logs` da el error real; la página de producción sigue siendo la anterior, así que **nunca des por bueno un despliegue sin comprobar `● Ready`**.

---

## 0.b Estado del servidor de partidas (Fase 2, ya desplegado)

| | |
|---|---|
| **Servidor de partidas** | **https://webajedrez-rt.issalys.workers.dev** |
| Plataforma | Cloudflare Workers + **Durable Objects** (plan Free), un objeto por partida |
| Tamaño | 110 KiB (24 KiB gzip) |
| Coste | **0 €** |
| Verificación | 25 comprobaciones end-to-end contra la web pública y el Worker real, incluida la caída de bandera declarada por alarma a los 10,0 s |

Cómo se despliega y qué hay que saber:

```powershell
cd apps\rt
npx wrangler login          # una vez, abre el navegador
npx wrangler deploy         # cada vez que cambie el servidor de partidas
```

- **Plan gratuito obliga a `new_sqlite_classes`.** El backend de almacenamiento de clave-valor exige plan de pago; el de SQLite no. Es el que usamos (el estado es un único objeto JSON por partida).
- **Un Durable Object por partida.** El estado de una partida no compite con el de otra y no hay bloqueos cruzados.
- **WebSocket Hibernation API.** Mientras la partida está quieta, el objeto se duerme y no consume cómputo. El token del asiento viaja en `serializeAttachment`, así que se recupera al despertar.
- **`setAlarm()` en vez de `setInterval`.** Se programa un único despertar exactamente para la caída de bandera (o el abandono). En el plan gratuito cada despertar es una petición: un bucle cada 500 ms habría multiplicado el consumo por mil. La alarma se borra cuando no hay nada que esperar.
- **Variables de entorno en Vercel** (necesarias para que la web sepa dónde conectar; si faltan, el modo online se oculta a propósito):

  ```powershell
  "https://webajedrez-rt.issalys.workers.dev" | npx vercel env add NEXT_PUBLIC_RT_HTTP_URL production
  "wss://webajedrez-rt.issalys.workers.dev"   | npx vercel env add NEXT_PUBLIC_RT_WS_URL production
  ```

  Al ser `NEXT_PUBLIC_*` se incrustan en el build: **después de añadirlas hay que redesplegar**.
- **El servidor Node sigue existiendo** en `apps/rt/src/server.ts` para desarrollo sin wrangler (`npm run dev:rt`). Los dos comparten `GameRoom.ts` y `delivery.ts`, y la misma suite de pruebas pasa contra ambos.
- **Arranque en frío.** Justo después de desplegar, la primera conexión WebSocket puede tardar en abrir mientras el Durable Object se instancia en el borde. Medido: en régimen normal abre en ~280 ms; tras un despliegue puede quedarse esperando. El cliente lo cubre con un **corte a los 12 s y reintento** (`CONNECT_TIMEOUT_MS` en `lib/realtime/client.ts`), y la prueba end-to-end reintenta una vez. Si algún día molesta, la solución es un `warmup` del Worker tras desplegar.

---

## 1. Respuesta corta

Hay **dos cosas distintas** que "publicar":

| Qué | Dónde | Cuándo | Coste |
|---|---|---|---|
| **El código** | **GitHub**, repo público | Día 1 | 0 € |
| **La web (Fases 0-1)** | **Vercel** (plan Hobby) | Día 1 | 0 € |
| **La base de datos (Fase 3)** | **Neon** (plan Free) | Fase 3 | 0 € |
| **El servidor de partidas (Fase 2)** | **Cloudflare Workers + Durable Objects** (plan Free) | Fase 2 | 0 € |
| **El motor de ajedrez** | El navegador del usuario | Fase 1 | 0 € |
| **Dominio bonito** | Opcional (Cloudflare Registrar) | Cuando quieras | ~10 €/año |

**Total para tener todo funcionando: 0 €.** Y sin dominio, también: Vercel te da `tu-proyecto.vercel.app` gratis y con HTTPS.

---

## 2. Orden exacto de creación (lo que hay que hacer y en qué orden)

### Día 1 — Fase 0

1. **Cuenta de GitHub** → crear repo `webajedrez` **público**.
   - Añadir `LICENSE` con el texto de AGPL-3.0 (obligación de la licencia, ver [`LICENCIAS.md`](LICENCIAS.md)).
   - `git push`. Ya está publicado el código. Nada más.
2. **Cuenta de Vercel** (registro con GitHub, sin tarjeta) → "Add New Project" → elegir el repo → Deploy.
   - Vercel detecta Next.js solo. No hay que configurar nada.
   - Resultado: `webajedrez.vercel.app`, HTTPS, y **cada `git push` a `main` publica automáticamente**. Cada Pull Request genera una URL de preview.
3. **GitHub Actions** para CI (typecheck + lint + test + build). Gratis e **ilimitado en repos públicos**.

Eso es todo para tener el tablero jugable en internet. En serio.

### Fase 2 — servidor de partidas

4. **Cuenta de Cloudflare** (sin tarjeta) → activar Workers.
5. Crear un Worker con una Durable Object class (una instancia por partida).

### Fase 3 — usuarios y rating

6. **Cuenta de Neon** (sin tarjeta) → proyecto Postgres → copiar `DATABASE_URL` a las variables de entorno de Vercel.

### Cuando quieras — dominio

7. Comprar dominio (opcional) y apuntarlo a Vercel.

---

## 3. Los detalles que importan de cada servicio

### GitHub — el código

- Repo **público** es requisito de la AGPL: es la forma de cumplir "fuente accesible". No hay que hacer nada más.
- Acciones gratis e ilimitadas en repos públicos (runners estándar).
- `.gitignore` con `.env*` **antes del primer commit**. Un secreto commiteado es un secreto quemado.
- Etiquetas/releases: útiles pero no obligatorias.

### Vercel — la web (Fases 0-1)

**Por qué:** es el destino natural de Next.js (es de los mismos autores), cero configuración, HTTPS y CDN incluidos, deploy por `git push`.

**El único asterisco:** el plan **Hobby es para uso personal y no comercial** según sus términos. Para una web de ajedrez gratuita y sin ánimo de lucro, encaja perfectamente. Solo dejaría de encajar si algún día pones anuncios o cobras por algo — entonces habría que pasar a Pro (~20 $/mes) o cambiarse de host. Es el único punto del plan gratuito que conviene tener apuntado.

**Aviso de ancho de banda:** el plan gratuito tiene un tope mensual de transferencia. Con un motor WASM de decenas de MB por usuario nuevo, miles de visitas pueden acercarse al límite. Si algún día el sitio se hace popular, el plan B es Cloudflare (§4), que no cobra ancho de banda.

**Cabeceras del motor:** si se usa el build **`--single-threaded`** de Stockfish, no hace falta ninguna cabecera especial. Si se quiere multi-hilo, hacen falta `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: require-corp`, que se configuran en `next.config.ts`. **Recomendación: empezar single-threaded** y no complicarse.

### Cloudflare Workers + Durable Objects — las partidas (Fase 2)

**Esta es la buena noticia.** Durable Objects **está disponible en el plan gratuito** (solo con backend de almacenamiento SQLite, que es justo el que queremos).

Límites gratuitos por día:

| Recurso | Gratis |
|---|---|
| Peticiones | 100 000 / día |
| Duración de cómputo | 13 000 GB-s / día (~28 h de objeto activo) |
| Filas leídas | 5 millones / día |
| Filas escritas | 100 000 / día |
| Almacenamiento | 5 GB |

**Por qué esto basta de sobra para un sitio de ajedrez:**

- Una partida = un objeto. Unas pocas peticiones por jugada.
- Con la **WebSocket Hibernation API**, un objeto inactivo **no consume duración**. El reloj corriendo entre jugadas prácticamente no cuesta nada.
- Los mensajes de WebSocket se facturan a razón de 20:1 (100 mensajes = 5 peticiones).
- 100 000 peticiones/día son **decenas de miles de jugadas al día**. Un proyecto recién nacido no se acerca ni de lejos.

**Propiedad clave para tu tranquilidad:** en el plan gratuito, si te pasas de un límite, **las operaciones fallan con error — no te cobran**. No hay factura sorpresa. Es imposible que te llegue un cargo de Cloudflare en el plan Free.

**Lo único que hay que hacer bien:** usar la Hibernation API para los WebSockets y `setAlarm()` para los relojes (una jugada por reloj, no un bucle de `setInterval`). Eso ya está especificado en [`ARQUITECTURA.md`](ARQUITECTURA.md) §6.

**El coste a cambio:** hay que desplegar con `wrangler` y escribir la capa de entrada adaptada a Durable Objects. Por eso en el plan se decidió que `GameRoom` sea lógica pura, sin dependencias de transporte: el mismo código corre en Node en local y en Durable Objects en producción.

### Neon — la base de datos (Fase 3)

**Por qué Neon y no otra:** es Postgres de verdad, la integración con Drizzle es directa, y **no pausa ni borra proyectos inactivos**.

Plan gratuito: 100 proyectos, **100 CU-horas/mes** por proyecto, **1 GB** de almacenamiento, escala a cero tras 5 min de inactividad (y despierta sola). Con 100 CU-horas tienes una instancia pequeña (0,25 CU) funcionando ~400 horas al mes, o sea más de lo que necesita un sitio con tráfico bajo. **No se borra nada** al llegar a un límite: las escrituras fallan hasta el mes siguiente y los datos siguen ahí.

**Aviso sobre Supabase:** su plan gratuito **pausa los proyectos con baja actividad durante 7 días**. Para un proyecto personal que se usa a ratos, eso significa encontrarse la web rota una mañana. Neon no tiene ese comportamiento. Si ya tienes cuenta de Supabase, sirve igual — pero hay que saberlo.

---

## 4. Plan B: todo en Cloudflare

Si algún día molesta la restricción no comercial de Vercel, o el ancho de banda se dispara, se puede mover todo a Cloudflare:

| Ventaja | Coste |
|---|---|
| Sin restricción de uso comercial | Requiere el adaptador `@opennextjs/cloudflare` para Next.js |
| Ancho de banda ilimitado y sin cobro | Más fricción inicial de configuración |
| Todo en un mismo panel (web, tiempo real, BD) | Workers tiene limitaciones con APIs de Node |

No es lo que recomiendo para empezar: es más trabajo. Pero es una salida limpia y gratis si hiciera falta.

---

## 5. Descartados (para que no pierdas el tiempo)

| Opción | Por qué no |
|---|---|
| **Fly.io** | Ya no tiene plan gratuito permanente, solo prueba. Partimos de "gratis". |
| **Railway** | Igual: crédito inicial, luego pago. |
| **Render (plan free)** | El servicio web **se duerme por inactividad**. Con un WebSocket de partida, un cold start de 30 s arruina la experiencia. |
| **Heroku** | Plan gratuito retirado en 2022. |
| **VPS propia (Hetzner, Oracle Always Free)** | Un servidor que hay que administrar, parchear y vigilar. Con Durable Objects y Vercel gratis, no tiene sentido para este proyecto. |
| **Supabase (BD)** | Pausa proyectos inactivos a los 7 días. Usar Neon. |

---

## 6. Dominio: sí o no

**No lo necesitas para empezar.** `webajedrez.vercel.app` funciona, tiene HTTPS y no cuesta nada.

Si lo quieres:

- **Cloudflare Registrar**: vende a precio de coste, sin renovación sorpresa ni upsells. ~10 €/año un `.com`.
- Alternativas: Namecheap, Porkbun.
- **Evita** los "gratis el primer año" con renovación a 30 €.
- Configuración: 2 registros DNS (`A`/`CNAME`) apuntando a Vercel. 5 minutos.

---

## 7. Checklist

### Día 1 (Fase 0)

- [ ] Repo público en GitHub con `LICENSE` AGPL-3.0
- [ ] `.gitignore` con `.env*`
- [ ] Proyecto en Vercel conectado al repo
- [ ] Primer deploy verde: se puede jugar en `https://<proyecto>.vercel.app`
- [ ] Workflow de GitHub Actions con typecheck, lint y test

### Fase 1

- [ ] `stockfish` (build `--single-threaded`) servido con caché inmutable y hash en el nombre
- [ ] Página `/creditos` con la atribución del motor
- [ ] Probado en un móvil real, no solo en el emulador

### Fase 2

- [ ] Cuenta de Cloudflare y Worker desplegado con `wrangler`
- [ ] WebSocket Hibernation API activada
- [ ] `setAlarm()` para los relojes (nada de bucles)
- [ ] `GameRoom` corre igual en local (Node) y en producción (DO)

### Fase 3

- [ ] Proyecto en Neon y `DATABASE_URL` como variable de entorno en Vercel (no en el repo)
- [ ] Migraciones de Drizzle aplicadas desde CI o desde local, versionadas
- [ ] Copia de seguridad probada (restaurar de verdad, una vez)

---

## 8. Coste a 12 meses

| Concepto | Año 1 |
|---|---|
| GitHub (repo público) | 0 € |
| Vercel Hobby | 0 € |
| Cloudflare Workers Free + Durable Objects | 0 € |
| Neon Free | 0 € |
| Motor (corre en el navegador del usuario) | 0 € |
| Puzzles (dataset CC0 de Lichess) | 0 € |
| Dominio (opcional) | ~10 € |
| **Total** | **0 € sin dominio / ~10 € con dominio** |

Ni tarjeta de crédito, ni prueba de 14 días, ni "gratis hasta que te acostumbres".

**Regla de oro:** si algún servicio empieza a pedir tarjeta para el nivel gratuito, es señal de que ya no es gratis. En ese momento se cambia, no se paga.
