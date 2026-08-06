-- Keep existing management memberships usable after read permissions become explicit.
update miclub.user_club_memberships membership
set permissions = (
  select array_agg(distinct permission order by permission)
  from unnest(coalesce(membership.permissions, '{}'::text[]) ||
    array['crm:read', 'finance:read', 'dashboard:read']) permission
), updated_at = now()
from miclub.roles role
where role.id = membership.role_id
  and role.club_id = membership.club_id
  and role.code in ('owner', 'DIRECTOR', 'admin');
