-- Demo data: Southern Lakes Aviation Ltd, a fictional Queenstown helicopter and charter operator.
-- Five aircraft (two AS350s, an R44, a Caravan and an Airvan), 45 days of tech log, the
-- maintenance programme, components, directives, defects, work orders and four engineers.
-- Registrations, directive numbers and people are made up. Dates are relative to today, and
-- every insert skips what is already there, so running it twice is harmless.
--
-- Problems are planted on purpose so /attention and /compliance have something to say: a new
-- directive not assessed and past its 10 hour window, a 100 hour inspection flown past, a tail
-- rotor blade over its life limit, a review of airworthiness overdue, work certified by an
-- engineer whose licence had lapsed, an aircraft flown with work done but not released, a deferred
-- defect past its limit, a part fitted with no release certificate, and a defect left open while
-- the aircraft kept flying.

insert into aircraft (reg, type, make_model, category, serial_no, year_built, base, owner, status, opening_hours, opening_cycles, opening_on) values
  ('ZK-SLA', 'AS350', 'Airbus AS350 B3', 'helicopter', '7811', 2014, 'Queenstown', null, 'active', 8360.0, 21410, current_date - 45),
  ('ZK-SLB', 'AS350', 'Airbus AS350 B2', 'helicopter', '3920', 2005, 'Queenstown', null, 'active', 12840.0, 30920, current_date - 45),
  ('ZK-SLR', 'R44', 'Robinson R44 Raven II', 'helicopter', '14102', 2015, 'Wanaka', 'Matukituki Holdings Ltd', 'active', 1905.0, 6100, current_date - 45),
  ('ZK-SLC', 'C208', 'Cessna 208B Grand Caravan', 'aeroplane', '208B5521', 2012, 'Queenstown', null, 'active', 6180.0, 7450, current_date - 45),
  ('ZK-SLG', 'GA8', 'GippsAero GA8 Airvan', 'aeroplane', 'GA8-09-142', 2009, 'Te Anau', null, 'maintenance', 3402.0, 5210, current_date - 45)
on conflict (reg) do nothing;

insert into engineers (code, full_name, licence_no, licence_expires_on, ratings, inspection_authorisation) values
  ('E01', 'Hemi Walker', 'AME 23411', current_date + 400, '{AS350,R44,C208,GA8}', true),
  ('E02', 'Sarah Lindqvist', 'AME 30982', current_date + 60, '{AS350,C208}', false),
  ('E03', 'Tom Rangi', 'AME 28117', current_date - 20, '{R44,GA8}', false),
  ('E04', 'Josh Kerr', 'AME 33450', current_date + 18, '{C208,GA8}', false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- tech log, 45 days

insert into flights (aircraft_id, flown_on, seq, pilot, sector, hours, cycles)
select a.id, current_date - d, 1, (array['Kate Moana', 'Liam Ferris', 'Ruby Chen'])[1 + d % 3], 'Milford Sound scenic',
  1.5 + ((d * 7) % 13) / 10.0, 3 + d % 4
from aircraft a, generate_series(1, 44) d where a.reg = 'ZK-SLA' and d % 6 <> 0
on conflict (aircraft_id, flown_on, seq) do nothing;

insert into flights (aircraft_id, flown_on, seq, pilot, sector, hours, cycles)
select a.id, current_date - d, 1, (array['Liam Ferris', 'Ruby Chen'])[1 + d % 2], 'Glacier landings',
  1.2 + ((d * 3) % 11) / 10.0, 2 + d % 3
from aircraft a, generate_series(1, 44) d where a.reg = 'ZK-SLB' and d % 5 <> 0
on conflict (aircraft_id, flown_on, seq) do nothing;

insert into flights (aircraft_id, flown_on, seq, pilot, sector, hours, cycles)
select a.id, current_date - d, 1, 'Ben Harlow', 'Wanaka scenic and training',
  0.8 + ((d * 5) % 9) / 10.0, 2 + d % 2
from aircraft a, generate_series(1, 44) d where a.reg = 'ZK-SLR' and d % 3 <> 0
on conflict (aircraft_id, flown_on, seq) do nothing;

insert into flights (aircraft_id, flown_on, seq, pilot, sector, hours, cycles)
select a.id, current_date - d, 1, (array['Grace Tui', 'Mark Elliot'])[1 + d % 2], 'ZQN to Milford return',
  1.6 + ((d * 11) % 10) / 10.0, 2 + d % 3
from aircraft a, generate_series(1, 44) d where a.reg = 'ZK-SLC' and d % 4 <> 1
on conflict (aircraft_id, flown_on, seq) do nothing;

insert into flights (aircraft_id, flown_on, seq, pilot, sector, hours, cycles)
select a.id, current_date - d, 1, 'Mark Elliot', 'Te Anau to Stewart Island',
  1.4 + (d % 5) / 10.0, 2
from aircraft a, generate_series(9, 44) d where a.reg = 'ZK-SLG' and d % 3 = 0
on conflict (aircraft_id, flown_on, seq) do nothing;

-- ---------------------------------------------------------------- directives

insert into directives (number, authority, kind, title, applies_to_type, effective_on, comply_within_hours, comply_by, recurring) values
  ('DCA/AS350/905', 'CAA NZ', 'ad', 'Tail rotor pitch change link: inspect for play every 50 hours', 'AS350', current_date - 400, null, null, true),
  ('DCA/AS350/906', 'CAA NZ', 'ad', 'Tail rotor drive shaft flexible coupling: inspect within 10 hours', 'AS350', current_date - 6, 10, null, false),
  ('DCA/R44/912', 'CAA NZ', 'ad', 'Main rotor blade root fitting: inspect every 100 hours', 'R44', current_date - 700, null, null, true),
  ('DCA/C208/220', 'CAA NZ', 'ad', 'Elevator trim actuator: inspect and lubricate once', 'C208', current_date - 900, 100, null, false),
  ('DCA/GA8/118', 'CAA NZ', 'ad', 'Fuel selector placard: replace once', 'GA8', current_date - 500, null, current_date - 300, false),
  ('SB R44-118', 'Robinson', 'sb', 'Revised cabin heater duct clamp', 'R44', current_date - 30, null, null, false)
on conflict (number) do nothing;

-- ---------------------------------------------------------------- components

-- Installed before these records start: installed_at_hours below the opening hours.
insert into components (aircraft_id, part_no, serial_no, description, position, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on, tsn_at_install, csn_at_install, installed_on, installed_at_hours, installed_at_cycles, release_doc)
select a.id, '355A12-0050', 'TR-4471', 'Tail rotor blade', 'TR blade 1', true, 4000, null, null, current_date - 3650,
  round(4000 - (t.hours_now - (a.opening_hours - 500)) + 2.3, 1), 0, current_date - 400, a.opening_hours - 500, a.opening_cycles - 1200, 'CAA Form One 55120'
from aircraft a join aircraft_totals t on t.id = a.id where a.reg = 'ZK-SLB'
on conflict (part_no, serial_no) do nothing;

insert into components (aircraft_id, part_no, serial_no, description, position, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on, tsn_at_install, csn_at_install, installed_on, installed_at_hours, installed_at_cycles, release_doc)
select a.id, '355A12-0050', 'TR-4472', 'Tail rotor blade', 'TR blade 2', true, 4000, null, null, current_date - 2900, 2100, 0, current_date - 400, a.opening_hours - 500, a.opening_cycles - 1200, 'CAA Form One 55121'
from aircraft a where a.reg = 'ZK-SLB'
on conflict (part_no, serial_no) do nothing;

insert into components (aircraft_id, part_no, serial_no, description, position, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on, tsn_at_install, csn_at_install, installed_on, installed_at_hours, installed_at_cycles, release_doc)
select a.id, '350A31-1850', 'SF-2208', 'Main rotor Starflex star', 'MR head', true, null, 40000, null, current_date - 4000, 9800, 26300, current_date - 900, a.opening_hours - 900, a.opening_cycles - 2400, 'EASA Form 1 77812'
from aircraft a where a.reg = 'ZK-SLB'
on conflict (part_no, serial_no) do nothing;

insert into components (aircraft_id, part_no, serial_no, description, position, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on, tsn_at_install, csn_at_install, installed_on, installed_at_hours, installed_at_cycles, release_doc)
select a.id, '0292T20', 'AR-30117', 'Arriel 2D gas generator module', 'Engine', true, null, 15000, null, current_date - 4200, 4100, 4800, current_date - 1500, a.opening_hours - 3100, a.opening_cycles - 8200, 'EASA Form 1 80234'
from aircraft a where a.reg = 'ZK-SLA'
on conflict (part_no, serial_no) do nothing;

insert into components (aircraft_id, part_no, serial_no, description, position, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on, tsn_at_install, csn_at_install, installed_on, installed_at_hours, installed_at_cycles, release_doc)
select a.id, 'C016-7', 'MRB-5520', 'Main rotor blade', 'MR blade 1', true, 2200, null, 12, current_date - 4100, 0, 0, current_date - 4100, 0, 0, 'Robinson release 14102-A'
from aircraft a where a.reg = 'ZK-SLR'
on conflict (part_no, serial_no) do nothing;

insert into components (aircraft_id, part_no, serial_no, description, position, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on, tsn_at_install, csn_at_install, installed_on, installed_at_hours, installed_at_cycles, release_doc)
select a.id, 'C016-7', 'MRB-5521', 'Main rotor blade', 'MR blade 2', true, 2200, null, 12, current_date - 4100, 0, 0, current_date - 4100, 0, 0, 'Robinson release 14102-B'
from aircraft a where a.reg = 'ZK-SLR'
on conflict (part_no, serial_no) do nothing;

insert into components (aircraft_id, part_no, serial_no, description, position, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on, tsn_at_install, csn_at_install, installed_on, installed_at_hours, installed_at_cycles, release_doc)
select a.id, 'PT6A-114A', 'PCE-PC1882', 'PT6A-114A engine', 'Engine', false, null, null, null, current_date - 5000, 0, 0, current_date - 3000, a.opening_hours - 3410, a.opening_cycles - 4100, 'P&WC release 1882'
from aircraft a where a.reg = 'ZK-SLC'
on conflict (part_no, serial_no) do nothing;

-- Fitted 25 days ago with no release certificate on file (planted).
insert into components (aircraft_id, part_no, serial_no, description, position, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on, tsn_at_install, csn_at_install, installed_on, installed_at_hours, installed_at_cycles, release_doc)
select a.id, '23078-002', 'SG-77310', 'Starter generator', 'Engine accessory', false, null, null, null, current_date - 1200, 640, 0,
  current_date - 25, a.opening_hours + (select coalesce(sum(hours), 0) from flights f where f.aircraft_id = a.id and f.flown_on < current_date - 25),
  a.opening_cycles + (select coalesce(sum(cycles), 0)::int from flights f where f.aircraft_id = a.id and f.flown_on < current_date - 25), null
from aircraft a where a.reg = 'ZK-SLC'
on conflict (part_no, serial_no) do nothing;

-- ---------------------------------------------------------------- the maintenance programme
-- Last-done hours are set from today's totals, so the demo lands the same way on any day.

insert into maintenance_items (aircraft_id, code, title, kind, interval_hours, interval_days, last_done_on, last_done_hours, reference)
select a.id, v.code, v.title, v.kind, v.ih, v.id, current_date - v.ago, case when v.ih is null then null else t.hours_now - v.used end, v.ref
from aircraft a join aircraft_totals t on t.id = a.id,
  (values
    ('ZK-SLA', '100HR', '100 hour inspection', 'inspection', 100.0, null::int, 27, 46.8, 'AS350 B3 MSM 05-20'),
    ('ZK-SLA', '600HR', '600 hour inspection', 'inspection', 600.0, null::int, 330, 571.6, 'AS350 B3 MSM 05-20'),
    ('ZK-SLA', 'ANNUAL', '12 month inspection', 'inspection', null, 365, 330, 0, 'AS350 B3 MSM 05-20'),
    ('ZK-SLA', 'ARA', 'Review of airworthiness', 'review', null, 365, 300, 0, 'CAR Part 91 Subpart G'),
    ('ZK-SLB', '100HR', '100 hour inspection', 'inspection', 100.0, null::int, 76, 103.4, 'AS350 B2 MSM 05-20'),
    ('ZK-SLB', 'ANNUAL', '12 month inspection', 'inspection', null, 365, 200, 0, 'AS350 B2 MSM 05-20'),
    ('ZK-SLB', 'ARA', 'Review of airworthiness', 'review', null, 365, 180, 0, 'CAR Part 91 Subpart G'),
    ('ZK-SLR', 'ANNUAL', 'Annual inspection', 'inspection', null, 365, 120, 0, 'R44 MM 2.400'),
    ('ZK-SLR', 'ARA', 'Review of airworthiness', 'review', null, 365, 120, 0, 'CAR Part 91 Subpart G'),
    ('ZK-SLC', 'PHASE', 'Phase inspection', 'inspection', 200.0, null::int, 30, 48.0, 'Cessna 208 phase card programme'),
    ('ZK-SLC', 'ANNUAL', 'Annual inspection', 'inspection', null, 365, 340, 0, 'Cessna 208 MM chapter 5'),
    ('ZK-SLC', 'ARA', 'Review of airworthiness', 'review', null, 365, 353, 0, 'CAR Part 91 Subpart G'),
    ('ZK-SLC', 'ENG-TBO', 'PT6A-114A overhaul', 'overhaul', 3600.0, null::int, 3000, 3410.0, 'P&WC SB 1003'),
    ('ZK-SLG', '100HR', '100 hour inspection', 'inspection', 100.0, null::int, 60, 19.5, 'GA8 MM chapter 5'),
    ('ZK-SLG', 'ARA', 'Review of airworthiness', 'review', null, 365, 370, 0, 'CAR Part 91 Subpart G')
  ) as v(reg, code, title, kind, ih, id, ago, used, ref)
where a.reg = v.reg
on conflict (aircraft_id, code) do nothing;

-- The R44's 100 hour was done ten days ago: last-done hours are the aircraft's hours that day.
insert into maintenance_items (aircraft_id, code, title, kind, interval_hours, last_done_on, last_done_hours, reference)
select a.id, '100HR', '100 hour inspection', 'inspection', 100.0, current_date - 10,
  a.opening_hours + (select coalesce(sum(hours), 0) from flights f where f.aircraft_id = a.id and f.flown_on < current_date - 10), 'R44 MM 2.400'
from aircraft a where a.reg = 'ZK-SLR'
on conflict (aircraft_id, code) do nothing;

-- The R44's 2,200 hour or 12 year overhaul, from new.
insert into maintenance_items (aircraft_id, code, title, kind, interval_hours, interval_days, last_done_on, last_done_hours, reference)
select a.id, 'OH-2200', '2,200 hour or 12 year overhaul', 'overhaul', 2200.0, 4383, current_date - 4100, 0, 'R44 MM 1.105'
from aircraft a where a.reg = 'ZK-SLR'
on conflict (aircraft_id, code) do nothing;

-- Recurring directives tracked as programme items.
insert into maintenance_items (aircraft_id, code, title, kind, directive_id, interval_hours, last_done_on, last_done_hours, reference)
select a.id, d.number, d.title, 'directive', d.id, v.ih, current_date - v.ago, t.hours_now - v.used, d.number
from aircraft a join aircraft_totals t on t.id = a.id,
  (values ('ZK-SLA', 'DCA/AS350/905', 50.0, 22, 38.0), ('ZK-SLB', 'DCA/AS350/905', 50.0, 14, 21.5), ('ZK-SLR', 'DCA/R44/912', 100.0, 90, 72.0)) as v(reg, num, ih, ago, used),
  directives d
where a.reg = v.reg and d.number = v.num
on conflict (aircraft_id, code) do nothing;

-- ---------------------------------------------------------------- directive assessments

insert into directive_assessments (directive_id, aircraft_id, status, assessed_on, assessed_by, complied_on, notes)
select d.id, a.id, v.status, current_date - v.ago, e.id, case when v.status = 'complied' then current_date - v.ago end, v.notes
from (values
    ('DCA/AS350/905', 'ZK-SLA', 'recurring', 380, 'E01', 'Tracked as a 50 hour programme item'),
    ('DCA/AS350/905', 'ZK-SLB', 'recurring', 380, 'E01', 'Tracked as a 50 hour programme item'),
    ('DCA/AS350/906', 'ZK-SLB', 'complied', 4, 'E02', 'Coupling inspected, no defects'),
    ('DCA/R44/912', 'ZK-SLR', 'recurring', 690, 'E01', 'Tracked as a 100 hour programme item'),
    ('DCA/C208/220', 'ZK-SLC', 'complied', 850, 'E02', 'Actuator inspected and lubricated'),
    ('DCA/GA8/118', 'ZK-SLG', 'complied', 420, 'E04', 'Placard replaced')
  ) as v(num, reg, status, ago, eng, notes)
join directives d on d.number = v.num
join aircraft a on a.reg = v.reg
join engineers e on e.code = v.eng
on conflict (directive_id, aircraft_id) do nothing;

-- ---------------------------------------------------------------- work orders

insert into work_orders (number, aircraft_id, title, opened_on, status, certified_by, certified_on, crs_ref)
select v.num, a.id, v.title, current_date - v.opened, v.status, e.id, case when v.status = 'certified' then current_date - v.cert end, v.crs
from (values
    ('WO-0401', 'ZK-SLB', '12 month inspection', 202, 'certified', 'E01', 200, 'CRS 0401'),
    ('WO-0405', 'ZK-SLR', '100 hour inspection', 11, 'certified', 'E01', 10, 'CRS 0405'),
    ('WO-0409', 'ZK-SLC', 'Phase inspection', 31, 'certified', 'E02', 30, 'CRS 0409'),
    ('WO-0410', 'ZK-SLG', 'Left magneto timing', 16, 'certified', 'E03', 15, 'CRS 0410'),
    ('WO-0412', 'ZK-SLA', 'Starter generator brush wear (D-0031)', 4, 'open', null, null, null),
    ('WO-0414', 'ZK-SLG', '100 hour inspection, review of airworthiness and oleo seal (D-0029)', 7, 'open', null, null, null)
  ) as v(num, reg, title, opened, status, eng, cert, crs)
join aircraft a on a.reg = v.reg
left join engineers e on e.code = v.eng
on conflict (number) do nothing;

-- ---------------------------------------------------------------- defects

insert into defects (number, aircraft_id, raised_on, raised_by, description, status, deferral_ref, deferred_on, defer_until, rectified_on)
select v.num, a.id, current_date - v.raised, v.by, v.descr, v.status, v.ref, case when v.ref is not null then current_date - v.raised end,
  case when v.until is not null then current_date + v.until end, case when v.status = 'rectified' then current_date - v.raised + 1 end
from (values
    ('D-0024', 'ZK-SLB', 30, 'Ruby Chen', 'Cabin door seal torn, rear left', 'rectified', null, null::int),
    ('D-0027', 'ZK-SLC', 14, 'Grace Tui', 'Pitot heat inoperative', 'deferred', 'MEL 30-1 (10 days)', -4),
    ('D-0029', 'ZK-SLG', 8, 'Mark Elliot', 'Left main gear oleo weeping hydraulic fluid', 'open', null, null),
    ('D-0030', 'ZK-SLC', 5, 'Mark Elliot', 'Cabin reading light row 3 inoperative', 'deferred', 'MEL 33-2 (10 days)', 5),
    ('D-0031', 'ZK-SLA', 5, 'Kate Moana', 'Starter generator slow to engage on second start', 'open', null, null)
  ) as v(num, reg, raised, by, descr, status, ref, until)
join aircraft a on a.reg = v.reg
on conflict (number) do nothing;

update defects set work_order_id = (select id from work_orders where number = 'WO-0412') where number = 'D-0031' and work_order_id is null;
update defects set work_order_id = (select id from work_orders where number = 'WO-0414') where number = 'D-0029' and work_order_id is null;

-- ---------------------------------------------------------------- work order tasks

insert into work_order_tasks (work_order_id, line, maintenance_item_id, description, done_on, done_by)
select w.id, 1, i.id, '12 month inspection', current_date - 200, e.id
from work_orders w join maintenance_items i on i.aircraft_id = w.aircraft_id and i.code = 'ANNUAL' join engineers e on e.code = 'E01'
where w.number = 'WO-0401'
on conflict (work_order_id, line) do nothing;

insert into work_order_tasks (work_order_id, line, maintenance_item_id, description, done_on, done_by)
select w.id, 1, i.id, '100 hour inspection', current_date - 10, e.id
from work_orders w join maintenance_items i on i.aircraft_id = w.aircraft_id and i.code = '100HR' join engineers e on e.code = 'E01'
where w.number = 'WO-0405'
on conflict (work_order_id, line) do nothing;

insert into work_order_tasks (work_order_id, line, maintenance_item_id, description, done_on, done_by)
select w.id, 1, i.id, 'Phase inspection', current_date - 30, e.id
from work_orders w join maintenance_items i on i.aircraft_id = w.aircraft_id and i.code = 'PHASE' join engineers e on e.code = 'E02'
where w.number = 'WO-0409'
on conflict (work_order_id, line) do nothing;

insert into work_order_tasks (work_order_id, line, description, done_on, done_by)
select w.id, 1, 'Left magneto timing checked and reset', current_date - 15, e.id
from work_orders w join engineers e on e.code = 'E03' where w.number = 'WO-0410'
on conflict (work_order_id, line) do nothing;

-- Done three days ago, never released, and the aircraft has flown since (planted).
insert into work_order_tasks (work_order_id, line, defect_id, description, done_on, done_by)
select w.id, 1, d.id, 'Starter generator brushes replaced, run tested', current_date - 3, e.id
from work_orders w join defects d on d.number = 'D-0031' join engineers e on e.code = 'E02' where w.number = 'WO-0412'
on conflict (work_order_id, line) do nothing;

insert into work_order_tasks (work_order_id, line, maintenance_item_id, description, done_on, done_by)
select w.id, 1, i.id, '100 hour inspection', current_date - 2, e.id
from work_orders w join maintenance_items i on i.aircraft_id = w.aircraft_id and i.code = '100HR' join engineers e on e.code = 'E04'
where w.number = 'WO-0414'
on conflict (work_order_id, line) do nothing;
insert into work_order_tasks (work_order_id, line, maintenance_item_id, description)
select w.id, 2, i.id, 'Review of airworthiness'
from work_orders w join maintenance_items i on i.aircraft_id = w.aircraft_id and i.code = 'ARA'
where w.number = 'WO-0414'
on conflict (work_order_id, line) do nothing;
insert into work_order_tasks (work_order_id, line, defect_id, description)
select w.id, 3, d.id, 'Replace left main gear oleo seals'
from work_orders w join defects d on d.number = 'D-0029' where w.number = 'WO-0414'
on conflict (work_order_id, line) do nothing;

insert into notes (aircraft_id, body, author)
select a.id, 'Owner asked for the monthly maintenance status by the 5th', 'Office'
from aircraft a where a.reg = 'ZK-SLR' and not exists (select 1 from notes n where n.aircraft_id = a.id);
