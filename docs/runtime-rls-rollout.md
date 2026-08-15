# Guía de despliegue de roles runtime y RLS

## 1. Qué credencial va en cada bloque

Se necesitan **dos logins PostgreSQL distintos** (no son usuarios de miClub):

1. El bloque normal `DATABASE_URL` o `PGHOST`/`PGUSER` es el login de la API.
   El DBA debe hacerlo miembro de `miclub_runtime`. La API asume ese rol al abrir
   cada conexión y el rol no puede omitir RLS.
2. El bloque `ADMIN_DATABASE_URL` o `PGADMIN*` es un login técnico exclusivo del
   migration runner y jobs controlados. Debe ser el dueño de la base/esquema o
   disponer de permisos para `ALTER TABLE`, `CREATE POLICY` y `GRANT`. No se debe
   entregar esta credencial al proceso web.

Los datos salen del panel del proveedor PostgreSQL (sección *Connection details*)
o los entrega el DBA. No salen del código ni son los nombres `miclub_runtime` y
`miclub_admin`, porque estos últimos son roles grupales `NOLOGIN`.

Elegir **una sola forma** para administración:

```dotenv
# Opción A: URL que entrega el proveedor
ADMIN_DATABASE_URL=postgresql://usuario_admin:password_codificada@host:5432/miclub_gestion
```

o:

```dotenv
# Opción B: los mismos datos separados
ADMIN_DATABASE_URL=
PGADMINHOST=db.example.net
PGADMINPORT=5432
PGADMINDATABASE=miclub_gestion
PGADMINUSER=miclub_migrator
PGADMINPASSWORD=<secreto-del-vault-o-proveedor>
PGADMINSSL=true
PGADMINROLE=miclub_app
```

Si la contraseña de una URL contiene `@`, `:`, `/`, `?`, `#` o `%`, codificarla
como componente URL. `PGADMINSSL=true` se usa cuando el proveedor exige TLS; en
una instalación local puede ser `false` según la configuración del servidor.
Nunca versionar el `.env` real.

## 2. Aprovisionamiento único por un DBA

La creación de roles es una operación del **cluster**, no una migración de
esquema. Por eso el error `42501` es correcto cuando el usuario no tiene
`CREATEROLE`. Además, PostgreSQL reserva la concesión de `BYPASSRLS` a un
**superusuario**: disponer sólo de `CREATEROLE` tampoco completa este paso. No se
debe elevar permanentemente al login de la API ni al migration runner.

1. Definir los nombres reales de login, por ejemplo `miclub_api` y
   `miclub_migrator`. Si todavía no existen, el DBA los crea con `LOGIN` y
   contraseñas almacenadas en el gestor de secretos.
2. Un DBA/superusuario abre
   `docs/dbeaver/00_provision_database_roles.sql` en DBeaver.
3. DBeaver solicitará `${runtime_login}` y `${admin_login}`. Introducir sólo los
   identificadores de login, sin comillas: `miclub_api` y `miclub_migrator`.
4. Ejecutar todo el archivo y conservar el resultado de su `SELECT` final. Debe
   mostrar `runtime_bypassrls=false`, `admin_bypassrls=true` y ambos memberships
   principales en `true`. El login admin también recibe `miclub_runtime` sólo para
   poder ejecutar la prueba negativa mediante `SET ROLE`.
5. El DBA confirma que el login administrativo puede modificar las tablas del
   esquema (normalmente haciéndolo dueño de la base/esquema). `BYPASSRLS` no
   concede por sí mismo permisos DDL.

### Procedimiento exacto para PostgreSQL local

Si la conexión actual usa `miclub_app@localhost`, ese login es el runtime y no
debe crear roles. En Linux, abra una terminal del servidor PostgreSQL y compruebe
el acceso del administrador local:

```bash
sudo -u postgres psql -d miclub_gestion -c \
  "select current_user, rolsuper from pg_roles where rolname=current_user"
```

Debe devolver `postgres | t`. Cree después un login administrativo separado;
`createuser --pwprompt` solicita el secreto sin incluirlo en el historial:

```bash
sudo -u postgres createuser --login --pwprompt \
  --no-superuser --no-createdb --no-createrole miclub_migrator
```

Si el rol ya existe, no lo recree: use `sudo -u postgres psql` y el comando
interactivo `\password miclub_migrator`. Como las tablas existentes normalmente
pertenecen a `miclub_app`, permita que el migrator asuma ese propietario sólo
durante DDL:

```bash
sudo -u postgres psql -d miclub_gestion -v ON_ERROR_STOP=1 -c \
  'GRANT miclub_app TO miclub_migrator'
```

Luego cree en DBeaver una **segunda conexión temporal** como `postgres`, abra
`docs/dbeaver/00_provision_database_roles.sql`, indique:

```text
runtime_login = miclub_app
admin_login   = miclub_migrator
```

y ejecute todo el archivo. No lo ejecute como `miclub_app`: el preflight ahora
lo rechazará antes de `CREATE ROLE` con una explicación concreta. Si `postgres`
usa autenticación local *peer* y DBeaver no puede conectarse, el DBA debe aplicar
el archivo desde una sesión administrativa equivalente.

> Si una contraseña real fue compartida en un chat, ticket o log, considérela
> expuesta. Rótela con `\password miclub_app` y actualice `DATABASE_URL` antes de
> continuar.

Consultas adicionales de comprobación:

```sql
select rolname, rolcanlogin, rolcreaterole, rolbypassrls
from pg_roles where rolname in ('miclub_runtime','miclub_admin');

select pg_has_role('miclub_api','miclub_runtime','MEMBER'),
       pg_has_role('miclub_migrator','miclub_admin','MEMBER');
```

## 3. Configuración y migración

1. Guardar la credencial runtime en el secreto del servicio API y la credencial
   administrativa en el secreto del proceso de despliegue. No montar el secreto
   administrativo en el contenedor web.
2. Probar por separado ambas conexiones con `psql` o el botón *Test connection*
   del proveedor.
3. Ejecutar `npm run db:migrations:check`.
4. Ejecutar `npm run db:migrate` con las variables `ADMIN_*`/`PGADMIN*`. La
   migración ahora sólo **verifica** los roles; nunca intenta crearlos. Si faltan,
   detiene el despliegue con una indicación para volver al paso 2.
5. Reiniciar la API con el login runtime. El pool ejecuta `role=miclub_runtime`
   al establecer cada conexión y `withTenantTransaction` fija
   `app.club_id` localmente dentro de la transacción autenticada.

No ejecutar el archivo versionado a mano fuera del manifest salvo un
procedimiento de recuperación aprobado: el comando canónico es el runner.

Para la instalación local descrita, la configuración final queda así (use
secretos nuevos y no copie los placeholders literalmente):

```dotenv
DATABASE_URL=postgres://miclub_app:<runtime-secret>@localhost:5432/miclub_gestion
ADMIN_DATABASE_URL=postgres://miclub_migrator:<admin-secret>@localhost:5432/miclub_gestion
PGADMINSSL=false
PGADMINROLE=miclub_app
```

`PGADMINROLE=miclub_app` hace que la conexión separada `miclub_migrator` asuma
el propietario de los objetos para DDL, sin convertir al migrator en
superusuario. Compruebe el cambio de identidad antes de migrar:

```bash
psql "$ADMIN_DATABASE_URL" -c 'set role miclub_app; select session_user,current_user'
```

Debe mostrar `session_user=miclub_migrator` y `current_user=miclub_app`.

## 4. Validación de aislamiento

Conectar usando el login administrativo, que debe poder `SET ROLE
miclub_runtime`, y ejecutar completo:

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/db/tests/runtime_rls_negative.sql
```

El archivo termina en `ROLLBACK`; una ejecución correcta no muestra excepciones.
También comprobar desde una transacción runtime real:

```sql
begin;
set local role miclub_runtime;
select set_config('app.club_id','<uuid-club-de-prueba>',true);
select distinct club_id from miclub.people; -- sólo el UUID configurado
rollback;
```

Finalmente verificar que las tablas prioritarias tienen RLS habilitado y forzado:

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='miclub' and relname in
 ('people','club_memberships','user_club_memberships','movements','enrollments',
  'activities','crm_message_templates','crm_message_history','import_batches',
  'import_errors','xlsx_import_rows')
order by relname;
```

## 5. Operación y rollback

- Rotar los dos secretos de manera independiente.
- No conceder `miclub_admin`, `BYPASSRLS` ni credenciales administrativas al
  login de la API.
- Incorporar más tablas mediante nuevas migraciones después de completar y
  validar su `club_id NOT NULL`; no ampliar silenciosamente la lista existente.
- Ante un fallo, conservar el SQLSTATE y detener el despliegue. No convertir el
  login runtime en superusuario ni darle `CREATEROLE` como solución temporal.
