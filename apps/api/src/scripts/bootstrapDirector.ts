import "dotenv/config";
import { hashPassword } from "../auth/passwordHasher.js";
import { closePostgresPool, getPostgresPool } from "../db/postgres.js";
import { auditService } from "../services/auditService.js";

const EMAIL = "miclub.posadas@gmail.com";
const DNI = "35.004.264";
const PERMISSIONS = ["club:manage", "users:manage", "sectors:any", "finance:write", "crm:write", "imports:run"];

const main = async () => {
  if (process.env.BOOTSTRAP_DIRECTOR_ENABLED !== "true") throw new Error("BOOTSTRAP_DIRECTOR_ENABLED=true es obligatorio para esta operación puntual.");
  const password = process.env.BOOTSTRAP_DIRECTOR_PASSWORD;
  if (!password || password.length < 12) throw new Error("BOOTSTRAP_DIRECTOR_PASSWORD debe contener al menos 12 caracteres.");
  const passwordHash = await hashPassword(password);
  const pool = await getPostgresPool();
  const db = await pool.connect();
  try {
    await db.query("begin");
    const club = await db.query<{ id: string }>(`
      with candidate as (
        select id from miclub.clubs where lower(name)=lower('miClub') or lower(email)=lower($1)
        order by (lower(email)=lower($1)) desc, created_at limit 1
      ), updated as (
        update miclub.clubs set code='miclub-posadas', name='miClub', legal_name='miClub', email=$1,
          phone=$2, address=$3, timezone='America/Argentina/Buenos_Aires',
          settings=coalesce(settings, '{}'::jsonb) || '{"country":"Argentina","province":"Misiones","city":"Posadas","currency":"ARS"}'::jsonb,
          is_active=true, updated_at=now() where id=(select id from candidate) returning id
      ), inserted as (
        insert into miclub.clubs (code,name,legal_name,email,phone,address,timezone,settings,is_active)
        select 'miclub-posadas','miClub','miClub',$1,$2,$3,'America/Argentina/Buenos_Aires',
          '{"country":"Argentina","province":"Misiones","city":"Posadas","currency":"ARS"}'::jsonb,true
        where not exists(select 1 from updated) returning id
      ) select id from updated union all select id from inserted`, [EMAIL, "+5493765240007", "Tambor de Tacuarí 7812"]);
    const clubId = club.rows[0].id;
    const user = await db.query<{ id: string }>(`
      insert into miclub.users (email, password_hash, display_name, status, is_active)
      values ($1, $2, 'Fernando Ramos', 'active', true)
      on conflict (email) do update set password_hash=excluded.password_hash, display_name=excluded.display_name,
        status='active', is_active=true, failed_login_attempts=0, locked_until=null, session_revoked_before=now(), updated_at=now()
      returning id`, [EMAIL, passwordHash]);
    const userId = user.rows[0].id;
    const person = await db.query<{ id: string }>(`
      insert into miclub.people (club_id, user_id, first_name, last_name, dni, phone, normalized_phone, email, status)
      values ($1, $2, 'Fernando', 'Ramos', $3, $4, '5493765240007', $5, 'activa')
      on conflict (club_id, normalized_dni) where normalized_dni is not null do update set
        user_id=excluded.user_id, first_name=excluded.first_name, last_name=excluded.last_name,
        phone=excluded.phone, normalized_phone=excluded.normalized_phone, email=excluded.email, updated_at=now()
      returning id`, [clubId, userId, DNI, "+5493765240007", EMAIL]);
    const role = await db.query<{ id: string }>(`
      with updated as (
        update miclub.roles set code='DIRECTOR', name='Director', description='Dirección integral del club'
        where club_id=$1 and lower(code)='director' returning id
      ), inserted as (
        insert into miclub.roles (club_id,code,name,description)
        select $1,'DIRECTOR','Director','Dirección integral del club'
        where not exists(select 1 from updated) returning id
      ) select id from updated union all select id from inserted`, [clubId]);
    const membership = await db.query<{ id: string }>(`
      insert into miclub.user_club_memberships (user_id, club_id, role_id, status, permissions)
      values ($1, $2, $3, 'active', $4::text[])
      on conflict (user_id, club_id) do update set role_id=excluded.role_id, status='active',
        permissions=excluded.permissions, updated_at=now() returning id`, [userId, clubId, role.rows[0].id, PERMISSIONS]);
    await auditService.sensitiveChange({ action: "bootstrap.director", result: "success", userId, clubId,
      membershipId: membership.rows[0].id, entityType: "user", entityId: userId,
      metadata: { source: "bootstrapDirector", personId: person.rows[0].id } }, db);
    await db.query("commit");
    process.stdout.write("Bootstrap completado; desactive BOOTSTRAP_DIRECTOR_ENABLED y elimine la variable temporal de contraseña.\n");
  } catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
  finally { db.release(); }
};

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(closePostgresPool);
