-- Aircraft Maintenance for Claude Code: the schema.
-- What a helicopter, charter, agricultural or training operator tracks to keep its fleet
-- airworthy: aircraft and their hours and cycles from the tech log, the maintenance programme
-- (inspections, recurring directives, overhauls) with intervals in hours, cycles and days,
-- installed components and their life limits, the airworthiness directive register and each
-- aircraft's assessment against it, defects and deferrals, work orders with their tasks and the
-- release to service, and the engineers who certify.
-- Plain Postgres. Runs the same on PGlite. Hours are decimal hours (tenths, as the tech log
-- writes them), cycles are whole numbers, dates are calendar dates.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table if not exists aircraft (
  id uuid primary key default gen_random_uuid(),
  reg text not null unique,                       -- registration mark, ZK-ABC or VH-ABC
  type text not null,                             -- type as the directives name it: AS350, R44, C208, GA8
  make_model text not null,                       -- Airbus AS350 B3, Robinson R44 Raven II
  category text not null default 'helicopter' check (category in ('helicopter', 'aeroplane')),
  serial_no text,
  year_built int,
  base text,
  owner text,                                     -- the owner when the operator manages someone else's aircraft
  status text not null default 'active' check (status in ('active', 'maintenance', 'stored', 'sold')),
  opening_hours numeric(10,1) not null default 0, -- airframe total time when these records start
  opening_cycles int not null default 0,          -- landings or cycles when these records start
  opening_on date not null default current_date,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists engineers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  full_name text not null,
  licence_no text,                                -- aircraft maintenance engineer licence
  licence_expires_on date,
  ratings text[] not null default '{}',           -- aircraft types the licence or authorisation covers
  inspection_authorisation boolean not null default false, -- may carry out the review of airworthiness
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The tech log: one row per flight or per day's flying, as the operator enters it.
create table if not exists flights (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  flown_on date not null,
  seq int not null default 1,                     -- second and later entries on the same day
  pilot text,
  sector text,
  hours numeric(5,1) not null check (hours >= 0),
  cycles int not null default 0 check (cycles >= 0),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aircraft_id, flown_on, seq)
);

create table if not exists components (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid references aircraft(id),       -- null when the part is in stores or away for overhaul
  part_no text not null,
  serial_no text not null,
  description text not null,
  position text,
  life_limited boolean not null default false,    -- a hard life limit, not an overhaul recommendation
  limit_hours numeric(10,1),
  limit_cycles int,
  limit_years int,                                -- calendar life from manufacture
  manufactured_on date,
  tsn_at_install numeric(10,1) not null default 0, -- the part's own time since new when fitted
  csn_at_install int not null default 0,
  installed_on date,
  installed_at_hours numeric(10,1),                -- aircraft hours when fitted
  installed_at_cycles int,
  release_doc text,                                -- Form 1 or authorised release certificate reference
  removed_on date,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (part_no, serial_no)
);

-- The airworthiness directive and service bulletin register.
create table if not exists directives (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  authority text not null default 'CAA NZ',       -- CAA NZ, CASA, EASA, FAA, or the manufacturer for a bulletin
  kind text not null default 'ad' check (kind in ('ad', 'sb')),
  title text not null,
  applies_to_type text not null,                  -- matches aircraft.type
  effective_on date not null,
  comply_within_hours numeric(8,1),               -- from the effective date
  comply_by date,
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The maintenance programme: every item that comes due, by hours, cycles, days, or the first of them.
create table if not exists maintenance_items (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  code text not null,                             -- 100HR, ANNUAL, ARA, or the directive number
  title text not null,
  kind text not null default 'inspection' check (kind in ('inspection', 'directive', 'overhaul', 'component', 'review')),
  directive_id uuid references directives(id),
  component_id uuid references components(id),
  interval_hours numeric(8,1),
  interval_cycles int,
  interval_days int,
  last_done_on date,
  last_done_hours numeric(10,1),
  last_done_cycles int,
  reference text,                                 -- the manual chapter or programme reference
  active boolean not null default true,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aircraft_id, code)
);

-- How each aircraft stands against each directive.
create table if not exists directive_assessments (
  id uuid primary key default gen_random_uuid(),
  directive_id uuid not null references directives(id) on delete cascade,
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  status text not null check (status in ('open', 'not-applicable', 'complied', 'recurring')),
  assessed_on date not null default current_date,
  assessed_by uuid references engineers(id),
  complied_on date,
  complied_hours numeric(10,1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (directive_id, aircraft_id)
);

create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  aircraft_id uuid not null references aircraft(id),
  title text not null,
  opened_on date not null default current_date,
  status text not null default 'open' check (status in ('open', 'certified', 'cancelled')),
  certified_by uuid references engineers(id),
  certified_on date,
  certified_hours numeric(10,1),
  crs_ref text,                                   -- certificate of release to service reference
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists defects (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  aircraft_id uuid not null references aircraft(id),
  raised_on date not null default current_date,
  raised_by text,
  description text not null,
  status text not null default 'open' check (status in ('open', 'deferred', 'rectified')),
  deferral_ref text,                              -- MEL item or the deferral authority
  deferred_on date,
  defer_until date,
  work_order_id uuid references work_orders(id),
  rectified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_order_tasks (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  line int not null,
  maintenance_item_id uuid references maintenance_items(id),
  defect_id uuid references defects(id),
  description text not null,
  done_on date,
  done_by uuid references engineers(id),
  done_hours numeric(10,1),
  done_cycles int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, line)
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid references aircraft(id) on delete cascade,
  body text not null,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['aircraft', 'engineers', 'flights', 'components', 'directives', 'maintenance_items',
    'directive_assessments', 'work_orders', 'defects', 'work_order_tasks', 'notes'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

create index if not exists flights_aircraft_day on flights (aircraft_id, flown_on);
create index if not exists items_aircraft on maintenance_items (aircraft_id);
create index if not exists components_aircraft on components (aircraft_id);
create index if not exists defects_aircraft on defects (aircraft_id, status);
create index if not exists tasks_work_order on work_order_tasks (work_order_id);

-- ---------------------------------------------------------------- views

-- Airframe hours and cycles now, from the opening figures plus every tech log entry since.
create or replace view aircraft_totals as
select a.id, a.reg, a.type, a.make_model, a.category, a.status, a.base, a.owner,
  a.opening_hours + coalesce(sum(f.hours), 0) as hours_now,
  a.opening_cycles + coalesce(sum(f.cycles), 0)::int as cycles_now,
  max(f.flown_on) as last_flown_on,
  coalesce(sum(f.hours) filter (where f.flown_on > current_date - 30), 0) as hours_30d
from aircraft a
left join flights f on f.aircraft_id = a.id
group by a.id;

-- Every active programme item with its next due point and what is left, by hours, cycles and days.
-- projected_on is the day the hours run out at the aircraft's last 30 days of flying.
create or replace view item_due as
select i.id, i.aircraft_id, t.reg, t.type, i.code, i.title, i.kind, i.reference,
  i.interval_hours, i.interval_cycles, i.interval_days, i.last_done_on, i.last_done_hours, i.last_done_cycles,
  i.last_done_hours + i.interval_hours as due_hours,
  i.last_done_cycles + i.interval_cycles as due_cycles,
  i.last_done_on + i.interval_days as due_on,
  round(i.last_done_hours + i.interval_hours - t.hours_now, 1) as left_hours,
  i.last_done_cycles + i.interval_cycles - t.cycles_now as left_cycles,
  (i.last_done_on + i.interval_days) - current_date as left_days,
  case when i.interval_hours is not null and t.hours_30d > 0
    then current_date + floor(greatest(i.last_done_hours + i.interval_hours - t.hours_now, 0) / (t.hours_30d / 30.0))::int end as projected_on,
  (coalesce(i.last_done_hours + i.interval_hours - t.hours_now < 0, false)
    or coalesce(i.last_done_cycles + i.interval_cycles - t.cycles_now < 0, false)
    or coalesce((i.last_done_on + i.interval_days) < current_date, false)) as overdue
from maintenance_items i
join aircraft_totals t on t.id = i.aircraft_id
where i.active and t.status <> 'sold';

-- Installed components with their own time and cycles since new and what is left before the limit.
create or replace view component_life as
select c.id, c.aircraft_id, t.reg, c.part_no, c.serial_no, c.description, c.position, c.life_limited,
  c.limit_hours, c.limit_cycles, c.limit_years, c.release_doc, c.installed_on,
  round(c.tsn_at_install + (t.hours_now - coalesce(c.installed_at_hours, t.hours_now)), 1) as tsn,
  c.csn_at_install + (t.cycles_now - coalesce(c.installed_at_cycles, t.cycles_now)) as csn,
  round(c.limit_hours - (c.tsn_at_install + (t.hours_now - coalesce(c.installed_at_hours, t.hours_now))), 1) as left_hours,
  c.limit_cycles - (c.csn_at_install + (t.cycles_now - coalesce(c.installed_at_cycles, t.cycles_now))) as left_cycles,
  (c.manufactured_on + make_interval(years => c.limit_years))::date as expires_on
from components c
join aircraft_totals t on t.id = c.aircraft_id
where c.removed_on is null;

-- Every directive against every aircraft of its type, with the assessment (or none) and whether
-- the compliance window has passed. Hours since effective come from the tech log.
create or replace view directive_status as
select d.id as directive_id, d.number, d.authority, d.kind, d.title, d.effective_on, d.comply_within_hours, d.comply_by, d.recurring,
  a.id as aircraft_id, a.reg, a.status as aircraft_status,
  coalesce(x.status, 'unassessed') as status, x.assessed_on, x.complied_on, x.notes,
  (select coalesce(sum(f.hours), 0) from flights f where f.aircraft_id = a.id and f.flown_on >= d.effective_on) as hours_since_effective,
  (coalesce(x.status, 'unassessed') in ('unassessed', 'open') and (
     (d.comply_within_hours is not null and (select coalesce(sum(f.hours), 0) from flights f where f.aircraft_id = a.id and f.flown_on >= d.effective_on) > d.comply_within_hours)
     or (d.comply_by is not null and d.comply_by < current_date))) as past_window
from directives d
join aircraft a on lower(a.type) = lower(d.applies_to_type) and a.status <> 'sold'
left join directive_assessments x on x.directive_id = d.id and x.aircraft_id = a.id;
