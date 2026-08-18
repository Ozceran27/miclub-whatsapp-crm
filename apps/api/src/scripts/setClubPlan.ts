import { closePostgresAdminPool, getPostgresAdminPool } from "../db/postgres.js";

const valueAfter = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim();
};

const email = valueAfter("email")?.toLowerCase();
const clubId = valueAfter("club-id");
const planCode = (valueAfter("plan") ?? "ENTERPRISE").toUpperCase();
if ((!email && !clubId) || (email && clubId)) {
  throw new Error("Indicá exactamente un selector: --email=usuario@club.com o --club-id=<uuid>.");
}

const pool = await getPostgresAdminPool();
try {
  await pool.query("begin");
  const target = await pool.query<{ club_id: string; club_name: string; user_id: string | null; email: string | null; membership_id: string | null; person_id: string | null }>(`
    select club.id club_id, club.name club_name, principal.user_id, principal.email,
           principal.membership_id, principal.person_id
      from miclub.clubs club
      left join lateral (
        select users.id user_id, users.email, membership.id membership_id, person.id person_id
          from miclub.user_club_memberships membership
          join miclub.users users on users.id=membership.user_id and users.status='active'
          join miclub.people person on person.club_id=club.id and person.user_id=users.id
         where membership.club_id=club.id and membership.status='active'
           and ($1::text is null or lower(users.email)=lower($1))
         order by membership.created_at
         limit 1
      ) principal on true
     where ($1::text is not null and principal.user_id is not null)
        or ($2::uuid is not null and club.id=$2)
     limit 2
     for update of club`, [email ?? null, clubId ?? null]);
  if (target.rows.length !== 1) throw new Error(`El selector debe identificar un único club; encontrados: ${target.rows.length}.`);
  const selected = target.rows[0];
  if (!selected.user_id || !selected.membership_id || !selected.person_id) {
    throw new Error(`El club ${selected.club_id} no posee la cadena user/person/membership activa completa; no se cambió el plan.`);
  }
  const plan = await pool.query<{ code: string }>(`
    select code from miclub.plans
     where code=$1 and catalog_status='catalog' and commercial_class in ('free','paid')`, [planCode]);
  if (plan.rows.length !== 1) throw new Error(`El plan ${planCode} no es un plan comercial aprovisionable.`);

  await pool.query(`update miclub.club_subscriptions
                       set effective_until=now()
                     where club_id=$1 and effective_from <= now()
                       and (effective_until is null or effective_until > now())`, [selected.club_id]);
  await pool.query(`insert into miclub.club_subscriptions (club_id, plan_code, effective_from)
                    values ($1,$2,now())`, [selected.club_id, planCode]);
  await pool.query("commit");
  console.log(JSON.stringify({ clubId: selected.club_id, clubName: selected.club_name, userId: selected.user_id, email: selected.email, membershipId: selected.membership_id, personId: selected.person_id, planCode }));
} catch (error) {
  await pool.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await closePostgresAdminPool();
}
