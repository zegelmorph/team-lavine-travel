-- Deleting a person now removes them from the system, not just from the directory.
--
-- Until now travel_delete_person() refused anyone who still had access, and only ever deleted the travel_people row.
-- The account the person signed in with (and the one Supabase creates the moment an invite is sent) stayed in
-- auth.users, and so did the sign-up allowlist row their invite added, so someone "removed" could still sign in to an
-- empty app, or sign up again. It now works on anyone but the caller and takes them out of the household, and for a
-- system admin it deletes their account as well.
--
-- Accounts are shared with the finance app, where only system admins (app_admins) may delete them, and the same
-- holds here: for any other admin the account is left as it was ('admin_only'). Even for a system admin it is left
-- alone ('kept') when, with this person gone, something still uses it, which is any of:
--   - it is a system admin itself;
--   - it is a member of another household, or waiting on an invite to one;
--   - it is linked to, or invited as, a person other than this one;
--   - it was not linked to this person (only its email matched) and is a member of this household.
-- Deleting the account fires the finance app's forget_deleted_user trigger, which drops the allowlist row and any
-- pending household invites for that email; its sessions go with it (auth.sessions cascades). An access token already
-- issued lasts until it expires, but by then nothing grants that user anything.
--
-- Returns 'deleted' (the account went too), 'admin_only' or 'kept' (the account stays, see above), or 'none' (there
-- was no account).

drop function public.travel_delete_person(uuid);

create function public.travel_delete_person(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.travel_people;
  v_account uuid;
  v_email text;
  v_elsewhere boolean;
begin
  select * into v from public.travel_people p where p.id = p_id for update;
  if not found then
    raise exception 'Only an admin can delete people';
  end if;
  -- Two admins deleting each other at once would otherwise both pass the check below and leave no admin.
  perform 1 from public.household_members m where m.household_id = v.household_id and m.role = 'owner' for update;
  if not public.travel_is_admin(v.household_id) then
    raise exception 'Only an admin can delete people';
  end if;
  if v.user_id = (select auth.uid()) then
    raise exception 'You can''t delete yourself';
  end if;

  -- Their account: the one they are linked to, or else the one under their email (an invite that was never
  -- followed, or access that was removed before this).
  v_account := v.user_id;
  v_email := v.email;
  if v_account is not null then
    select lower(u.email) into v_email from auth.users u where u.id = v_account;
  elsif v_email is not null then
    select u.id into v_account from auth.users u where lower(u.email) = v_email order by u.created_at limit 1;
  end if;

  -- Out of this household, whatever happens to the account.
  if v.user_id is not null then
    delete from public.household_members where household_id = v.household_id and user_id = v.user_id;
    update public.travel_trips set owner_id = null where household_id = v.household_id and owner_id = v.user_id;
  end if;
  delete from public.travel_people where id = p_id;

  if not public.is_app_admin() then
    return case when v_account is null then 'none' else 'admin_only' end;
  end if;

  -- With the person gone, is the account (or, before there is one, the email) still used by anything?
  v_elsewhere :=
    exists (select 1 from public.app_admins a where a.user_id = v_account)
    or exists (select 1 from public.household_members m where m.user_id = v_account)
    or exists (
      select 1 from public.travel_people p
      where p.user_id = v_account or (p.email = v_email and p.invited_at is not null)
    )
    or exists (
      select 1 from public.household_invites i
      where lower(i.email) = v_email and i.accepted_at is null and i.household_id <> v.household_id
    );
  if v_elsewhere then
    return case when v_account is null then 'none' else 'kept' end;
  end if;

  if v_account is null then
    -- Approved to sign up, but the account was never made (the invite email didn't go out): the approval goes
    -- with the person. (A finance invite to this household, if one is pending, would still let them sign up.)
    delete from public.signup_allowlist where email = v_email;
    return 'none';
  end if;
  delete from auth.users where id = v_account;
  return 'deleted';
end;
$$;

revoke execute on function public.travel_delete_person(uuid) from public, anon;
grant execute on function public.travel_delete_person(uuid) to authenticated;
