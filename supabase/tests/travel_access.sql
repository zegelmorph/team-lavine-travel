-- Who can see and change what in the travel tables, checked by impersonating each kind of user: an admin, a
-- household member who owns a trip, a travel-only traveller, an invited user who isn't on any trip, someone whose
-- access was removed, someone from another household, and a visitor who isn't signed in.
--
-- Run the whole file with the Supabase MCP execute_sql tool or in the SQL editor, after any change to the travel
-- policies, triggers or functions. It builds its own households and users and always ends by raising, so nothing it
-- does is kept. The "error" it ends with is the result:
--   TRAVEL ACCESS TESTS (rolled back): 143 passed, 0 failed
-- followed by one line for each check that failed.

do $test$
declare
  hh uuid := gen_random_uuid();
  hh2 uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  u_member uuid := gen_random_uuid();
  u_trav uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  u_rev uuid := gen_random_uuid();
  u_unc uuid := gen_random_uuid();
  u_other uuid := gen_random_uuid();
  p_trav uuid;
  p_out uuid;
  p_rev uuid;
  p_unc uuid;
  p_kid uuid;
  p_new uuid;
  p_member uuid;
  t_admin uuid;
  t_member uuid;
  t_trav uuid;
  t_other uuid;
  d_member uuid;
  i_member uuid;
  i_trav uuid;
  todo_admin uuid;
  todo_member uuid;
  todo_trav uuid;
  v_passed int;
  v_failed int;
  v_failures text;
begin
  create temp table travel_test_results (n serial, name text, ok boolean, got text, want text) on commit drop;

  -- Runs one statement as a signed-in user (or as anon when p_uid is null). Returns the first column of a query, the
  -- number of rows a write touched, or 'ERROR: ...'.
  create function pg_temp.travel_test_as(p_uid uuid, p_sql text)
  returns text
  language plpgsql
  as $f$
  declare
    v text;
    n bigint;
    v_email text;
  begin
    if p_uid is null then
      perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
      set local role anon;
    else
      select u.email into v_email from auth.users u where u.id = p_uid;
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'email', v_email)::text,
        true
      );
      set local role authenticated;
    end if;
    begin
      if lower(ltrim(p_sql)) like 'select %' then
        execute p_sql into v;
      else
        execute p_sql;
        get diagnostics n = row_count;
        v := n::text;
      end if;
    exception when others then
      v := 'ERROR: ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v, 'null');
  end;
  $f$;

  -- p_want is a LIKE pattern; a leading ! means "anything but".
  create function pg_temp.travel_test_check(p_name text, p_got text, p_want text)
  returns void
  language sql
  as $f$
    insert into travel_test_results (name, ok, got, want)
    values (
      p_name,
      case when left(p_want, 1) = '!' then p_got not like substr(p_want, 2) else p_got like p_want end,
      p_got,
      p_want
    );
  $f$;

  create function pg_temp.t(p_name text, p_uid uuid, p_sql text, p_want text)
  returns void
  language sql
  as $f$
    select pg_temp.travel_test_check(p_name, pg_temp.travel_test_as(p_uid, p_sql), p_want);
  $f$;

  -- -------------------------------------------------------------------------------------------------------------
  -- Two households. The first has an admin and a member; the second belongs to someone else entirely.
  -- -------------------------------------------------------------------------------------------------------------

  insert into public.signup_allowlist (email, invited_at)
  select 'travel-test-' || x || '@example.test', '2000-01-01'
  from unnest(array['admin', 'member', 'trav', 'out', 'rev', 'unc', 'other']) x;

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select
    v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'travel-test-' || v.tag || '@example.test',
    -- One address that was never confirmed.
    case when v.tag = 'unc' then null else now() end,
    now(), now()
  from (
    values (u_admin, 'admin'), (u_member, 'member'), (u_trav, 'trav'), (u_out, 'out'), (u_rev, 'rev'), (u_unc, 'unc'),
      (u_other, 'other')
  ) v(id, tag);

  insert into public.households (id, name, created_by)
  values (hh, 'Travel access test', u_admin), (hh2, 'Travel access test 2', u_other);
  insert into public.household_members (household_id, user_id, role)
  select v.household_id, v.user_id, v.role
  from (values (hh, u_admin, 'owner'), (hh, u_member, 'member'), (hh2, u_other, 'owner')) v(household_id, user_id, role)
  where not exists (
    select 1 from public.household_members m where m.household_id = v.household_id and m.user_id = v.user_id
  );

  -- -------------------------------------------------------------------------------------------------------------
  -- Signing in
  -- -------------------------------------------------------------------------------------------------------------

  perform pg_temp.t('admin syncs', u_admin, 'select public.travel_sync_me()', '!ERROR%');
  perform pg_temp.t('member syncs', u_member, 'select public.travel_sync_me()', '!ERROR%');
  perform pg_temp.t('other household syncs', u_other, 'select public.travel_sync_me()', '!ERROR%');
  perform pg_temp.t('household owner is an admin', u_admin,
    format('select role from public.travel_my_households() where id = %L', hh), 'admin');
  perform pg_temp.t('household member is a user', u_member,
    format('select role from public.travel_my_households() where id = %L', hh), 'user');
  perform pg_temp.t('another household''s admin has nothing here', u_other,
    format('select count(*) from public.travel_my_households() where id = %L', hh), '0');
  perform pg_temp.t('syncing puts a member in the people list', u_member,
    format('select count(*) from public.travel_people_list(%L) where user_id = %L', hh, u_member), '1');

  -- -------------------------------------------------------------------------------------------------------------
  -- People
  -- -------------------------------------------------------------------------------------------------------------

  p_trav := pg_temp.travel_test_as(u_admin,
    format('select public.travel_add_person(%L, %L, %L)', hh, 'Test Traveller', ' Travel-Test-Trav@Example.test '));
  p_out := pg_temp.travel_test_as(u_admin,
    format('select public.travel_add_person(%L, %L, %L)', hh, 'Test Outsider', 'travel-test-out@example.test'));
  p_rev := pg_temp.travel_test_as(u_admin,
    format('select public.travel_add_person(%L, %L, %L)', hh, 'Test Revoked', 'travel-test-rev@example.test'));
  p_unc := pg_temp.travel_test_as(u_admin,
    format('select public.travel_add_person(%L, %L, %L)', hh, 'Test Unconfirmed', 'travel-test-unc@example.test'));
  p_new := pg_temp.travel_test_as(u_admin,
    format('select public.travel_add_person(%L, %L, %L)', hh, 'Test Newcomer', 'travel-test-new@example.test'));
  -- A regular user saves a person too: that's how travellers are added on the fly.
  p_kid := pg_temp.travel_test_as(u_member, format('select public.travel_add_person(%L, %L)', hh, 'Test Kid'));
  select id into p_member from public.travel_people where household_id = hh and user_id = u_member;

  perform pg_temp.t('emails are saved in lower case', u_admin,
    format('select email from public.travel_people where id = %L', p_trav), 'travel-test-trav@example.test');
  perform pg_temp.t('an email can''t be used twice', u_admin,
    format('select public.travel_add_person(%L, %L, %L)', hh, 'Twin', 'travel-test-trav@example.test'),
    'ERROR:%already has that email%');
  perform pg_temp.t('an email has to look like one', u_admin,
    format('select public.travel_add_person(%L, %L, %L)', hh, 'Typo', 'not-an-email'), 'ERROR: Enter a valid email%');
  perform pg_temp.t('a person needs a name', u_admin,
    format('select public.travel_add_person(%L, %L)', hh, '  '), 'ERROR: Enter a name%');
  perform pg_temp.t('another household can''t add people here', u_other,
    format('select public.travel_add_person(%L, %L)', hh, 'Intruder'), 'ERROR: You don''t have access%');
  perform pg_temp.t('another household can''t list people here', u_other,
    format('select count(*) from public.travel_people_list(%L)', hh), '0');
  perform pg_temp.t('another household can''t read people here', u_other,
    format('select count(*) from public.travel_people where household_id = %L', hh), '0');
  perform pg_temp.t('people can''t be inserted directly', u_member,
    format('insert into public.travel_people (household_id, name) values (%L, %L)', hh, 'Direct'),
    'ERROR: permission denied%');
  perform pg_temp.t('people can''t be updated directly', u_member,
    format('update public.travel_people set invited_at = now() where household_id = %L', hh),
    'ERROR: permission denied%');
  perform pg_temp.t('people can''t be deleted directly', u_admin,
    format('delete from public.travel_people where id = %L', p_kid), 'ERROR: permission denied%');
  perform pg_temp.t('the internal access helper isn''t callable', u_member,
    format('select public.travel_has_access(%L, %L)', hh, u_member), 'ERROR: permission denied%');

  -- -------------------------------------------------------------------------------------------------------------
  -- Trips
  -- -------------------------------------------------------------------------------------------------------------

  perform pg_temp.t('admin creates a trip', u_admin,
    format('insert into public.travel_trips (household_id, name) values (%L, %L)', hh, 'Admin trip'), '1');
  perform pg_temp.t('member creates a trip', u_member,
    format('insert into public.travel_trips (household_id, name) values (%L, %L)', hh, 'Member trip'), '1');
  perform pg_temp.t('other household creates its own trip', u_other,
    format('insert into public.travel_trips (household_id, name) values (%L, %L)', hh2, 'Other trip'), '1');
  select id into t_admin from public.travel_trips where household_id = hh and name = 'Admin trip';
  select id into t_member from public.travel_trips where household_id = hh and name = 'Member trip';
  select id into t_other from public.travel_trips where household_id = hh2 and name = 'Other trip';

  perform pg_temp.t('a new trip belongs to whoever made it', u_member,
    format('select owner_id from public.travel_trips where id = %L', t_member), u_member::text);
  perform pg_temp.t('a trip can''t be created in someone else''s name', u_member,
    format('insert into public.travel_trips (household_id, name, owner_id) values (%L, %L, %L)', hh, 'Spoof', u_admin),
    'ERROR: new row violates row-level security%');
  perform pg_temp.t('another household can''t create a trip here', u_other,
    format('insert into public.travel_trips (household_id, name) values (%L, %L)', hh, 'Intruder trip'),
    'ERROR: new row violates row-level security%');
  perform pg_temp.t('admin sees every trip', u_admin,
    format('select count(*) from public.travel_trips where household_id = %L', hh), '2');
  perform pg_temp.t('member sees only their own trip', u_member,
    format('select count(*) from public.travel_trips where household_id = %L', hh), '1');
  perform pg_temp.t('trip summaries follow the same rule', u_member,
    format('select count(*) from public.travel_trip_summaries where household_id = %L', hh), '1');
  perform pg_temp.t('another household sees no trips here', u_other,
    format('select count(*) from public.travel_trips where household_id = %L', hh), '0');
  perform pg_temp.t('admin doesn''t see another household''s trips', u_admin,
    format('select count(*) from public.travel_trips where household_id = %L', hh2), '0');

  perform pg_temp.t('owner adds a destination', u_member,
    format('insert into public.travel_destinations (trip_id, name) values (%L, %L)', t_member, 'Test City'), '1');
  perform pg_temp.t('owner adds a packing item', u_member,
    format('insert into public.travel_pack_items (trip_id, name) values (%L, %L)', t_member, 'Test socks'), '1');
  perform pg_temp.t('owner adds a to-do', u_member,
    format('insert into public.travel_todos (trip_id, title) values (%L, %L)', t_member, 'Test passports'), '1');
  perform pg_temp.t('owner adds a traveller', u_member,
    format('insert into public.travel_participants (trip_id, person_id) values (%L, %L)', t_member, p_trav), '1');
  perform pg_temp.t('the same person can''t be on a trip twice', u_member,
    format('insert into public.travel_participants (trip_id, person_id) values (%L, %L)', t_member, p_trav),
    'ERROR: duplicate key%');
  perform pg_temp.t('admin adds a to-do to their trip', u_admin,
    format('insert into public.travel_todos (trip_id, title) values (%L, %L)', t_admin, 'Test admin to-do'), '1');
  perform pg_temp.t('member can''t add to a trip that isn''t theirs', u_member,
    format('insert into public.travel_todos (trip_id, title) values (%L, %L)', t_admin, 'Sneaky'),
    'ERROR: new row violates row-level security%');
  perform pg_temp.t('admin can change a member''s trip', u_admin,
    format('update public.travel_trips set notes = %L where id = %L', 'Seen by admin', t_member), '1');
  select id into d_member from public.travel_destinations where trip_id = t_member;
  select id into i_member from public.travel_pack_items where trip_id = t_member;
  select id into todo_member from public.travel_todos where trip_id = t_member;
  select id into todo_admin from public.travel_todos where trip_id = t_admin;

  -- -------------------------------------------------------------------------------------------------------------
  -- Invites
  -- -------------------------------------------------------------------------------------------------------------

  perform pg_temp.t('member can''t invite someone who isn''t on their trip', u_member,
    format('select public.travel_invite_person(%L)', p_out), 'ERROR: Only an admin%');
  perform pg_temp.t('trip owner invites their traveller', u_member,
    format('select public.travel_invite_person(%L)', p_trav), 'travel-test-trav@example.test');
  perform pg_temp.t('admin invites anyone', u_admin,
    format('select public.travel_invite_person(%L)', p_out), 'travel-test-out@example.test');
  perform pg_temp.t('admin invites a second person', u_admin,
    format('select public.travel_invite_person(%L)', p_rev), 'travel-test-rev@example.test');
  perform pg_temp.t('admin invites an unconfirmed address', u_admin,
    format('select public.travel_invite_person(%L)', p_unc), 'travel-test-unc@example.test');
  perform pg_temp.t('admin invites someone with no account yet', u_admin,
    format('select public.travel_invite_person(%L)', p_new), 'travel-test-new@example.test');
  perform pg_temp.t('nobody is invited without an email', u_admin,
    format('select public.travel_invite_person(%L)', p_kid), 'ERROR: Add an email%');
  perform pg_temp.t('another household can''t invite people here', u_other,
    format('select public.travel_invite_person(%L)', p_new), 'ERROR: Person not found%');
  perform pg_temp.travel_test_check('an invite lets the email past the sign-up gate',
    (select count(*)::text from public.signup_allowlist where email = 'travel-test-new@example.test'), '1');
  perform pg_temp.travel_test_check('an address that was already approved keeps its record',
    (select count(*)::text from public.signup_allowlist
     where email like 'travel-test-%@example.test' and email <> 'travel-test-new@example.test' and invited_at <> '2000-01-01'),
    '0');

  perform pg_temp.t('an invite does nothing until they sign in', u_trav,
    'select count(*) from public.travel_my_households()', '0');
  perform pg_temp.t('traveller syncs', u_trav, 'select public.travel_sync_me()', '!ERROR%');
  perform pg_temp.t('outsider syncs', u_out, 'select public.travel_sync_me()', '!ERROR%');
  perform pg_temp.t('soon-to-be-revoked syncs', u_rev, 'select public.travel_sync_me()', '!ERROR%');
  perform pg_temp.t('unconfirmed syncs', u_unc, 'select public.travel_sync_me()', '!ERROR%');
  perform pg_temp.t('an invited person becomes a user', u_trav,
    format('select role from public.travel_my_households() where id = %L', hh), 'user');
  perform pg_temp.t('an unconfirmed email is not linked', u_unc,
    'select count(*) from public.travel_my_households()', '0');
  perform pg_temp.t('list: invited and signed in is a user', u_admin,
    format('select access from public.travel_people_list(%L) where id = %L', hh, p_trav), 'user');
  perform pg_temp.t('list: invited, not signed in', u_admin,
    format('select access from public.travel_people_list(%L) where id = %L', hh, p_unc), 'invited');
  perform pg_temp.t('list: no invite', u_admin,
    format('select access from public.travel_people_list(%L) where id = %L', hh, p_kid), 'none');
  perform pg_temp.t('list: admin', u_admin,
    format('select access from public.travel_people_list(%L) where user_id = %L', hh, u_admin), 'admin');
  perform pg_temp.t('someone with access isn''t invited again', u_admin,
    format('select public.travel_invite_person(%L)', p_trav), 'ERROR:%already has access%');

  -- -------------------------------------------------------------------------------------------------------------
  -- A traveller on someone else's trip: sees it all, ticks things off, changes nothing else
  -- -------------------------------------------------------------------------------------------------------------

  perform pg_temp.t('traveller sees the trip they''re on', u_trav,
    format('select string_agg(name, '','') from public.travel_trips where household_id = %L', hh), 'Member trip');
  perform pg_temp.t('traveller sees its destinations', u_trav,
    format('select count(*) from public.travel_destinations where trip_id = %L', t_member), '1');
  perform pg_temp.t('traveller sees who else is going', u_trav,
    format('select count(*) from public.travel_participants where trip_id = %L', t_member), '1');
  perform pg_temp.t('an invited user who isn''t on a trip sees none', u_out,
    format('select count(*) from public.travel_trips where household_id = %L', hh), '0');
  perform pg_temp.t('but they do see the people list', u_out,
    format('select (count(*) > 0)::text from public.travel_people_list(%L)', hh), 'true');

  perform pg_temp.t('traveller ticks a packing item', u_trav,
    format('update public.travel_pack_items set packed = true where id = %L', i_member), '1');
  perform pg_temp.t('traveller can''t change its quantity', u_trav,
    format('update public.travel_pack_items set quantity = 5 where id = %L', i_member), 'ERROR: Only the trip''s owner%');
  perform pg_temp.t('traveller can''t rename it', u_trav,
    format('update public.travel_pack_items set name = %L where id = %L', 'Renamed', i_member),
    'ERROR: Only the trip''s owner%');
  perform pg_temp.t('traveller ticks a to-do', u_trav,
    format('update public.travel_todos set done = true where id = %L', todo_member), '1');
  perform pg_temp.t('traveller can''t reword it', u_trav,
    format('update public.travel_todos set title = %L, done = false where id = %L', 'Reworded', todo_member),
    'ERROR: Only the trip''s owner%');
  perform pg_temp.t('traveller can''t add a to-do', u_trav,
    format('insert into public.travel_todos (trip_id, title) values (%L, %L)', t_member, 'Mine'),
    'ERROR: new row violates row-level security%');
  perform pg_temp.t('traveller can''t add a packing item', u_trav,
    format('insert into public.travel_pack_items (trip_id, name) values (%L, %L)', t_member, 'Mine'),
    'ERROR: new row violates row-level security%');
  perform pg_temp.t('traveller can''t add a destination', u_trav,
    format('insert into public.travel_destinations (trip_id, name) values (%L, %L)', t_member, 'Mine'),
    'ERROR: new row violates row-level security%');
  perform pg_temp.t('traveller can''t delete a to-do', u_trav,
    format('delete from public.travel_todos where id = %L', todo_member), '0');
  perform pg_temp.t('traveller can''t delete a packing item', u_trav,
    format('delete from public.travel_pack_items where id = %L', i_member), '0');
  perform pg_temp.t('traveller can''t change a destination', u_trav,
    format('update public.travel_destinations set name = %L where id = %L', 'Elsewhere', d_member), '0');
  perform pg_temp.t('traveller can''t take people off the trip', u_trav,
    format('delete from public.travel_participants where trip_id = %L', t_member), '0');
  perform pg_temp.t('traveller can''t rename the trip', u_trav,
    format('update public.travel_trips set name = %L where id = %L', 'Hijacked', t_member), '0');
  perform pg_temp.t('traveller can''t delete the trip', u_trav,
    format('delete from public.travel_trips where id = %L', t_member), '0');
  perform pg_temp.t('someone who isn''t on the trip can''t tick its items', u_out,
    format('update public.travel_pack_items set packed = false where id = %L', i_member), '0');
  perform pg_temp.t('traveller refreshes the status of their trip', u_trav,
    format('select public.travel_refresh_statuses(%L)', t_member), '!ERROR%');
  perform pg_temp.t('but not of a trip they can''t see', u_trav,
    format('select public.travel_refresh_statuses(%L)', t_admin), 'ERROR: Trip not found%');

  -- A traveller is still a user: they have trips of their own, and the shared packing lists.
  perform pg_temp.t('traveller creates their own trip', u_trav,
    format('insert into public.travel_trips (household_id, name) values (%L, %L)', hh, 'Traveller trip'), '1');
  select id into t_trav from public.travel_trips where household_id = hh and name = 'Traveller trip';
  perform pg_temp.t('and fills it in', u_trav,
    format('insert into public.travel_todos (trip_id, title) values (%L, %L)', t_trav, 'Test own to-do'), '1');
  perform pg_temp.t('with packing items too', u_trav,
    format('insert into public.travel_pack_items (trip_id, name) values (%L, %L)', t_trav, 'Test own hat'), '1');
  select id into todo_trav from public.travel_todos where trip_id = t_trav;
  select id into i_trav from public.travel_pack_items where trip_id = t_trav;
  perform pg_temp.t('traveller adds a packing category', u_trav,
    format('insert into public.travel_pack_categories (household_id, name) values (%L, %L)', hh, 'Test category'), '1');
  perform pg_temp.t('another household can''t', u_other,
    format('insert into public.travel_pack_categories (household_id, name) values (%L, %L)', hh, 'Intruder category'),
    'ERROR: new row violates row-level security%');
  perform pg_temp.t('travel-only users see no household members', u_trav,
    'select count(*) from public.household_members', '0');
  perform pg_temp.t('travel-only users see no households table rows', u_trav,
    'select count(*) from public.households', '0');

  -- Moving a row is a write to the trip it lands in.
  perform pg_temp.t('a to-do can''t be moved into a trip they only view', u_trav,
    format('update public.travel_todos set trip_id = %L where id = %L', t_member, todo_trav),
    'ERROR: You can only move%');
  perform pg_temp.t('nor a packing item', u_trav,
    format('update public.travel_pack_items set trip_id = %L where id = %L', t_member, i_trav),
    'ERROR: You can only move%');
  perform pg_temp.t('nor into a trip they can''t see', u_member,
    format('update public.travel_todos set trip_id = %L where id = %L', t_admin, todo_member),
    'ERROR: You can only move%');
  perform pg_temp.t('nor into another household', u_member,
    format('update public.travel_todos set trip_id = %L where id = %L', t_other, todo_member),
    'ERROR: You can only move%');
  perform pg_temp.t('an admin can move one between trips', u_admin,
    format('update public.travel_todos set trip_id = %L where id = %L', t_member, todo_admin), '1');

  -- -------------------------------------------------------------------------------------------------------------
  -- Who owns a trip
  -- -------------------------------------------------------------------------------------------------------------

  perform pg_temp.t('an owner can''t hand their trip on', u_member,
    format('update public.travel_trips set owner_id = %L where id = %L', u_trav, t_member), 'ERROR: Only an admin%');
  perform pg_temp.t('nor give it up', u_member,
    format('update public.travel_trips set owner_id = null where id = %L', t_member), 'ERROR: Only an admin%');
  perform pg_temp.t('admin can''t give a trip to someone without access', u_admin,
    format('update public.travel_trips set owner_id = %L where id = %L', u_other, t_member),
    'ERROR: The new owner needs access%');
  perform pg_temp.t('admin reassigns a trip', u_admin,
    format('update public.travel_trips set owner_id = %L where id = %L', u_trav, t_member), '1');
  perform pg_temp.t('the old owner no longer sees it', u_member,
    format('select count(*) from public.travel_trips where household_id = %L', hh), '0');
  perform pg_temp.t('the new owner manages it', u_trav,
    format('update public.travel_trips set notes = %L where id = %L', 'Mine now', t_member), '1');
  perform pg_temp.t('admin gives it back', u_admin,
    format('update public.travel_trips set owner_id = %L where id = %L', u_member, t_member), '1');

  -- -------------------------------------------------------------------------------------------------------------
  -- Roles and managing people
  -- -------------------------------------------------------------------------------------------------------------

  perform pg_temp.t('a user can''t make themselves an admin', u_member,
    format('select public.travel_set_admin(%L, %L, true)', hh, u_member), 'ERROR: Only an admin%');
  perform pg_temp.t('a travel-only user can''t be an admin', u_admin,
    format('select public.travel_set_admin(%L, %L, true)', hh, u_trav), 'ERROR: Only household members%');
  perform pg_temp.t('the last admin can''t step down', u_admin,
    format('select public.travel_set_admin(%L, %L, false)', hh, u_admin), 'ERROR: A household needs at least one admin%');
  perform pg_temp.t('another household''s admin can''t change roles here', u_other,
    format('select public.travel_set_admin(%L, %L, true)', hh, u_other), 'ERROR: Only an admin%');
  perform pg_temp.t('admin promotes a member', u_admin,
    format('select public.travel_set_admin(%L, %L, true)', hh, u_member), '!ERROR%');
  perform pg_temp.t('who is then an admin', u_member,
    format('select role from public.travel_my_households() where id = %L', hh), 'admin');
  perform pg_temp.t('and sees every trip', u_member,
    format('select count(*) from public.travel_trips where household_id = %L', hh), '3');
  perform pg_temp.t('admin demotes them again', u_admin,
    format('select public.travel_set_admin(%L, %L, false)', hh, u_member), '!ERROR%');
  perform pg_temp.t('who is a user again', u_member,
    format('select role from public.travel_my_households() where id = %L', hh), 'user');

  perform pg_temp.t('a user renames themselves', u_member,
    format('select public.travel_update_person(%L, %L)', p_member, 'Test Member'), '!ERROR%');
  perform pg_temp.t('and the name is saved', u_member,
    format('select name from public.travel_people where id = %L', p_member), 'Test Member');
  perform pg_temp.t('a user can''t edit someone else', u_member,
    format('select public.travel_update_person(%L, %L)', p_kid, 'Renamed Kid'), 'ERROR: Only an admin can edit%');
  perform pg_temp.t('a user can''t remove access', u_member,
    format('select public.travel_revoke_person(%L)', p_trav), 'ERROR: Only an admin%');
  perform pg_temp.t('a user can''t delete people', u_member,
    format('select public.travel_delete_person(%L)', p_kid), 'ERROR: Only an admin%');
  perform pg_temp.t('changing an invited person''s email withdraws the invite', u_admin,
    format('select public.travel_update_person(%L, %L, %L)', p_new, 'Test Newcomer', 'travel-test-new2@example.test'),
    '!ERROR%');
  perform pg_temp.t('list: invite withdrawn', u_admin,
    format('select access from public.travel_people_list(%L) where id = %L', hh, p_new), 'none');

  -- -------------------------------------------------------------------------------------------------------------
  -- Losing access
  -- -------------------------------------------------------------------------------------------------------------

  perform pg_temp.t('admin can''t remove their own access', u_admin,
    format('select public.travel_revoke_person(id) from public.travel_people where household_id = %L and user_id = %L', hh, u_admin),
    'ERROR: You can''t remove your own access%');
  perform pg_temp.t('a household member is removed from the household instead', u_admin,
    format('select public.travel_revoke_person(%L)', p_member), 'ERROR:%household member%');
  perform pg_temp.t('someone with access can''t be deleted', u_admin,
    format('select public.travel_delete_person(%L)', p_trav), 'ERROR: Remove%access first');
  perform pg_temp.t('admin removes access', u_admin,
    format('select public.travel_revoke_person(%L)', p_rev), '!ERROR%');
  perform pg_temp.travel_test_check('which unlinks the account and forgets the invite',
    (select (user_id is null and invited_at is null)::text from public.travel_people where id = p_rev), 'true');
  perform pg_temp.t('they sync again', u_rev, 'select public.travel_sync_me()', '!ERROR%');
  perform pg_temp.t('and still have no access', u_rev, 'select count(*) from public.travel_my_households()', '0');
  perform pg_temp.t('or any trips', u_rev, 'select count(*) from public.travel_trips', '0');
  perform pg_temp.t('or people', u_rev, format('select count(*) from public.travel_people_list(%L)', hh), '0');
  perform pg_temp.t('then they can be deleted', u_admin,
    format('select public.travel_delete_person(%L)', p_rev), '!ERROR%');

  -- Removing a traveller's access: they stay on the trip as a name, and their own trip is left to the admins.
  perform pg_temp.t('admin removes the traveller''s access', u_admin,
    format('select public.travel_revoke_person(%L)', p_trav), '!ERROR%');
  perform pg_temp.t('who then sees no trips', u_trav, 'select count(*) from public.travel_trips', '0');
  perform pg_temp.t('and can''t tick anything', u_trav,
    format('update public.travel_pack_items set packed = false where id = %L', i_member), '0');
  perform pg_temp.travel_test_check('their own trip has no owner',
    (select (owner_id is null)::text from public.travel_trips where id = t_trav), 'true');
  perform pg_temp.travel_test_check('and they are still listed on the trip they were on',
    (select count(*)::text from public.travel_participants where trip_id = t_member and person_id = p_trav), '1');

  -- A deleted account: the person stays as a name, and a new account under that email isn't let back in.
  delete from auth.users where id = u_out;
  perform pg_temp.travel_test_check('deleting an account unlinks the person and forgets the invite',
    (select (user_id is null and invited_at is null)::text from public.travel_people where id = p_out), 'true');

  -- Someone removed from the household (in the finance app) keeps their account but has no access, until invited.
  delete from public.household_members where household_id = hh and user_id = u_member;
  update public.travel_people set email = null where id = p_member;
  perform pg_temp.t('a former member has no access', u_member,
    format('select count(*) from public.travel_my_households() where id = %L', hh), '0');
  perform pg_temp.t('and no trips, though they still own one', u_member, 'select count(*) from public.travel_trips', '0');
  perform pg_temp.t('list: former member', u_admin,
    format('select access from public.travel_people_list(%L) where id = %L', hh, p_member), 'none');
  perform pg_temp.t('they are invited at the address they sign in with', u_admin,
    format('select public.travel_invite_person(%L)', p_member), 'travel-test-member@example.test');
  perform pg_temp.t('and come back as a travel-only user', u_member,
    format('select role from public.travel_my_households() where id = %L', hh), 'user');
  perform pg_temp.t('with their trip', u_member, 'select count(*) from public.travel_trips', '1');

  -- -------------------------------------------------------------------------------------------------------------
  -- Not signed in
  -- -------------------------------------------------------------------------------------------------------------

  perform pg_temp.t('anon can''t read people', null, 'select count(*) from public.travel_people', 'ERROR: permission denied%');
  perform pg_temp.t('anon can''t read trips', null, 'select count(*) from public.travel_trips', 'ERROR: permission denied%');
  perform pg_temp.t('anon can''t list households', null,
    'select count(*) from public.travel_my_households()', 'ERROR: permission denied%');
  perform pg_temp.t('anon can''t add people', null,
    format('select public.travel_add_person(%L, %L)', hh, 'Anon'), 'ERROR: permission denied%');
  perform pg_temp.t('anon can''t invite', null,
    format('select public.travel_invite_person(%L)', p_kid), 'ERROR: permission denied%');

  select
    count(*) filter (where ok),
    count(*) filter (where not ok),
    string_agg(format('FAILED %s: got [%s], want [%s]', name, got, want), chr(10) order by n) filter (where not ok)
  into v_passed, v_failed, v_failures
  from travel_test_results;

  raise exception 'TRAVEL ACCESS TESTS (rolled back): % passed, % failed%',
    v_passed, v_failed, coalesce(chr(10) || v_failures, '');
end;
$test$;
