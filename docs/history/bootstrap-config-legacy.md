# Configuración actual de arranque

Documento de referencia previo a la base de migración a PostgreSQL. No introduce cambios funcionales en rutas, frontend, autenticación, Google Sheets ni SQLite.

## Rama y recuperación

- Rama base previa: `work`.
- Rama de documentación creada desde la rama estable actual: `feature/postgres-migration-foundation`.
- El estado funcional anterior se puede recuperar volviendo a la rama previa:

```bash
git checkout work
```

Si se quiere descartar la rama de documentación luego de volver a `work`:

```bash
git branch -D feature/postgres-migration-foundation
```

## Variables de arranque relevantes

| Variable | Valor actual / por defecto | Uso actual |
| --- | --- | --- |
| `PORT` | `4000` | Puerto donde escucha la API Express y, en producción local, la app compilada. |
| `PUBLIC_APP_URL` | Vacía por defecto | URL pública de la app, por ejemplo una URL `https://...` de Cloudflare Tunnel. También ayuda a decidir si la cookie de sesión debe marcarse como `secure`. |
| `AUTH_ENABLED` | `false` | `false` mantiene acceso directo local. `true` exige login con cookie `httpOnly` contra `miclub.users` y requiere `SESSION_SECRET`. |
| `BOOTSTRAP_DIRECTOR_ENABLED` | `false` | Habilita sólo la CLI idempotente del director; nunca debe quedar activo. |
| `VITE_API_URL` | Vacía en `.env.example`; `http://localhost:4000` recomendado para desarrollo split con Vite | Base URL que usa el frontend para llamar a la API. Vacía usa rutas relativas same-origin, recomendado para producción local detrás del mismo servidor/API y Cloudflare Tunnel. |

## Cloudflare Tunnel

- El túnel no está definido por código dentro del repositorio.
- Para exponer la app, se espera levantar la aplicación local en `http://localhost:4000` y apuntar Cloudflare Tunnel a ese origen local.
- Antes de exponer la app con una URL pública, configurar:
  - `AUTH_ENABLED=true`
  - `SESSION_SECRET=<secreto-largo-y-privado>`
  - Para el bootstrap puntual: `BOOTSTRAP_DIRECTOR_ENABLED=true` y
    `BOOTSTRAP_DIRECTOR_PASSWORD`; retirar ambas inmediatamente después.
  - `PUBLIC_APP_URL=https://<host-del-tunnel>`
  - `VITE_API_URL=` para mantener llamadas same-origin desde el frontend servido por la API.

## Scripts usados para arrancar

### Scripts npm

- `npm run dev`: inicia API y web en paralelo para desarrollo.
- `npm run build`: compila todos los workspaces.
- `npm run start`: inicia la API; en build de producción también sirve `apps/web/dist`.
- `npm run start:prod`: ejecuta `npm run build && npm run start`.
- `npm run check`: ejecuta typecheck, build y tests de API.

### Scripts Windows

- `scripts/build-prod.bat`: compila todo el monorepo con `npm run build`.
- `scripts/start-prod.bat`: abre `http://localhost:4000` y ejecuta `npm run start`.
- `scripts/start-miclub-crm.bat`: abre una consola con `npm run start:prod`, espera unos segundos y abre `http://localhost:4000`.

## Alcance preservado

Esta rama solo registra documentación de arranque. No se modifican todavía:

- rutas del backend,
- frontend,
- autenticación,
- integración Google Sheets,
- SQLite.
