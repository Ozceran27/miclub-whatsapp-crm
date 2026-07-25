# Auditoría forense de autenticación y Migración — 2026-07-25

## Flujo real previo a la corrección

No existe `express-session`, access token, refresh token, Axios, React Query,
Zustand/Redux, persistencia de auth en Web Storage ni service worker. La API
firma un payload HMAC autocontenido y lo guarda en la cookie HttpOnly
`miclub_session`, con `Path=/`, `SameSite=Lax`, duración de 12 horas y `Secure`
cuando la request (incluido `X-Forwarded-Proto`) o `PUBLIC_APP_URL` usa HTTPS.
La cookie oficial es host-only: no configura `Domain`.

**LOGIN:** formulario → `POST /auth/login` con credenciales incluidas → consulta
de `miclub.users` y membresía activa → HMAC con identidad y contexto tenant →
`Set-Cookie: miclub_session` → `SessionProvider.authenticate` → router `/app`.

**LOGOUT (antes):** botón → `POST /auth/logout` → sólo `clearCookie` para
`Path=/` → estado React anónimo → navegación replace a `/login`. El payload era
autocontenido y el servidor no registraba revocación. Una cookie duplicada
histórica en `/api` o `/auth` sobrevivía; además una copia capturada seguía
siendo criptográficamente válida hasta 12 horas.

**REFRESH:** montaje de `SessionProvider` → `GET /auth/me` no cacheable → cookie
→ validación HMAC, vencimiento y membresía PostgreSQL → usuario o 401 → router.
No se hidrata un snapshot local.

## Reproducción y causas raíz

El estado previo puede reproducirse enviando dos cookies `miclub_session` en el
mismo header (una válida de `/` y otra legacy de `/api`). `parseCookies` usaba
`Object.fromEntries`, por lo que una reemplazaba a la otra según un orden que el
estándar no garantiza. Al abrir Migración, sus requests iniciales son
`GET /api/db/health`, `GET /sync-status` y
`GET /api/import/batches?limit=10`. Las dos rutas `/api` podían validar la copia
legacy equivocada y responder `401` (`Sesión requerida`, sin código estable).
El monkey-patch global de `window.fetch` convertía cualquier 401 que no fuera de
`/auth` directamente en `expireSession()`, causando la navegación a Login sin
que el endpoint de Migración hubiera destruido la sesión.

La sesión revivía porque el logout sólo vencía una variante de cookie y porque
el HMAC era stateless, sin señal de revocación en PostgreSQL. El estado React no
era la fuente de la restauración: F5 consultaba nuevamente `/auth/me` y el
backend aceptaba la cookie sobreviviente.

## Corrección

* El payload incluye `issuedAt`; `miclub.users.session_revoked_before` invalida
  en backend todas las cookies emitidas antes del logout, incluidas copias en
  otras pestañas o headers capturados.
* La configuración oficial de cookie está centralizada. Logout vence la cookie
  oficial y, hasta el **2026-10-25**, las variantes legacy limitadas a `/auth`,
  `/api` y `.meclub.com.ar`. No intenta borrar dominios ajenos como localhost.
* Durante esa ventana, el servidor evalúa todas las cookies homónimas y no
  depende de su orden. La comprobación de revocación sigue siendo obligatoria.
* `/auth/me` devuelve 401 con `AUTHENTICATION_REQUIRED` o `SESSION_EXPIRED`; los
  endpoints auth/protegidos mantienen headers `no-store` también ante proxies.
* El cliente oficial incluye `credentials: include`. Un 401 de un módulo sólo
  expira auth si una segunda consulta a `/auth/me` confirma la ausencia de
  sesión. 403, 404, 429 y 5xx quedan como errores localizados.
* El panel y su historial requieren membresía y obtienen `clubId` exclusivamente
  de `req.auth`. El flag `IMPORT_ENDPOINTS_ENABLED` limita sólo mutaciones y
  responde `503 IMPORT_DISABLED`; no oculta el panel ni simula un logout.
* `AUTH_USER` y `AUTH_PASSWORD` fueron retirados del runtime. `SESSION_SECRET`
  sólo firma cookies HMAC y nunca se guarda en PostgreSQL.
* La sesión v2 exige `userId`, `personId`, `membershipId`, `clubId` y rol. Una
  contraseña válida sin esa cadena recibe `MEMBERSHIP_REQUIRED` y no obtiene
  cookie ni acceso al panel.
* El dump del 24/07 contiene miClub y la persona Fernando Ramos, pero muestra
  `miclub.users` y `miclub.user_club_memberships` vacías y no contiene un rol
  DIRECTOR. La CLI `npm run bootstrap:director` completa esa cadena de manera
  transaccional e idempotente con una contraseña temporal del entorno.

## Verificación manual pendiente de entorno externo

El repositorio no contiene `.env`, credenciales PostgreSQL, navegador remoto ni
acceso administrativo a Cloudflare. Por ello la verificación reproducible aquí
es automatizada/local. En staging se debe repetir login → `/auth/me` 200 →
logout (revisar todos los `Set-Cookie` vencidos) → `/auth/me` 401; probar F5,
Ctrl+F5, Back/Forward, dos pestañas, incógnito y acceso directo a
`/app/dataMigration` tanto en localhost como en `gestion.meclub.com.ar`.
