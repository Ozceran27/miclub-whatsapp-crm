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

### Windows + DBeaver + PostgreSQL 18

La vista **DBA** de DBeaver muestra al propietario de la base, no necesariamente
al superusuario del cluster. Que `miclub_app` sea dueño de `miclub_gestion` no le
concede `SUPERUSER`, `CREATEROLE` ni permiso para asignar `BYPASSRLS`. En una
instalación local creada con el instalador oficial suele existir el login
`postgres`; su contraseña es la elegida durante la instalación y PostgreSQL no
permite leerla en texto claro.

#### Si conoce la contraseña de `postgres`

1. En DBeaver, clic derecho sobre `miclub-gestion` → **Duplicar conexión**.
2. Nombre sugerido: `miclub-gestion-dba-local`.
3. Mantener host `localhost`, puerto `5432` y base `miclub_gestion`.
4. Cambiar **Nombre de usuario** a `postgres`, dejar **Session role** vacío e
   introducir la contraseña administrativa.
5. Pulsar **Probar conexión** y, una vez conectada, ejecutar:

```sql
select current_user, session_user,
       r.rolsuper, r.rolcreaterole, r.rolbypassrls
from pg_roles r
where r.rolname=current_user;
```

No continuar salvo que `current_user=postgres` y `rolsuper=true`.

#### Si no recuerda la contraseña de `postgres`

No intente extraerla de DBeaver ni de `pg_authid`: los secretos guardados y los
verificadores SCRAM no son recuperables como contraseña original. Si es
administrador de Windows y ésta es realmente una instancia local, restablézcala:

1. Abra **Servicios** (`services.msc`) y localice el servicio PostgreSQL 18
   (habitualmente `postgresql-x64-18`). En sus propiedades identifique `-D`, que
   apunta al directorio de datos.
2. Haga una copia de seguridad de `<data>\pg_hba.conf`.
3. Edite como administrador **sólo** las reglas loopback de `127.0.0.1/32` y
   `::1/128`, cambiando temporalmente su método (`scram-sha-256`) por `trust`. No
   cambie reglas de red remotas y no deje `trust` habilitado.
4. Reinicie desde una consola **como Administrador** (ajuste el nombre real):

```bat
net stop postgresql-x64-18
net start postgresql-x64-18
```

5. Abra `psql` desde `C:\Program Files\PostgreSQL\18\bin`:

```bat
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d miclub_gestion
```

6. Dentro de `psql`, asigne un secreto nuevo sin escribirlo en la línea de
   comandos:

```text
\password postgres
```

7. Salga con `\q`, restaure inmediatamente el `pg_hba.conf` original y reinicie
   otra vez el servicio. Verifique que la conexión sin contraseña ya no funciona
   y que DBeaver conecta con la nueva.

Durante la breve ventana `trust`, cualquier proceso local podría autenticarse
sin contraseña; cierre aplicaciones no necesarias y restaure el archivo antes de
seguir. Si PostgreSQL pertenece a Docker, WSL, una empresa o un proveedor cloud,
**no use este procedimiento**: use el mecanismo de reset del propietario/DBA.

#### Crear el login de migraciones desde Windows

Conectado como `postgres` en DBeaver, ejecute una vez:

```sql
CREATE ROLE miclub_migrator
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT miclub_app TO miclub_migrator;
```

Si ya existe, omita `CREATE ROLE` y compruebe sus atributos. Asigne la contraseña
sin dejarla en un script guardado, desde `psql`:

```text
\password miclub_migrator
```

Después, aún en la conexión `postgres`, ejecute
`docs/dbeaver/00_provision_database_roles.sql` con
`runtime_login=miclub_app` y `admin_login=miclub_migrator`. Cierre o marque como
administrativa la conexión `postgres`; no la use para consultas ordinarias.

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
