#!/usr/bin/env node
// aircraft-maintenance-for-claude-code: the one CLI. The slash commands call this; so can you.
//
//   node scripts/mx.mjs <command> [args] [--flags] [--json]
//   npm run mx -- <command> ...
//
// Run with no arguments (or `help`) for the command list.
//
// This records what a helicopter, charter, agricultural or training operator tracks to keep its
// fleet airworthy: the tech log (hours and cycles), the maintenance programme and what is due,
// components and their life limits, the directive register and each aircraft's assessment,
// defects and deferrals, work orders and the release to service, and the engineers who certify.
// It sends nothing and talks to no other system: work packs, owner reports and letters are
// drafted here, a person sends them.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, isoDate, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------- settings

// "Due soon" on the due list and in /attention. Set these to how far ahead you plan.
const SOON_HOURS = 15;
const SOON_DAYS = 14;
// A life-limited part with this many hours or this share of its life left is flagged.
const LLP_WARN_HOURS = 50;
// A review of airworthiness inside this many days is flagged so it can be booked.
const ARA_WARN_DAYS = 30;
// An engineer's licence inside this many days of expiry is flagged.
const LICENCE_WARN_DAYS = 30;
// An active aircraft with no tech log entry for this many days is flagged: the hours may be missing.
const QUIET_DAYS = 7;

const ITEM_KINDS = ['inspection', 'directive', 'overhaul', 'component', 'review'];
const ASSESS = ['open', 'not-applicable', 'complied', 'recurring'];

// ---------------------------------------------------------------- arguments

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'open', 'llp', 'recurring', 'sb']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name, value;
      if (eq > -1) { name = a.slice(2, eq); value = a.slice(eq + 1); }
      else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else args.push(a);
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

const n = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const h1 = (v) => (v === null || v === undefined || v === '' ? '' : n(v).toFixed(1));

function today() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return isoDate(d); };

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.toLowerCase() === 'today') return today();
  if (s.toLowerCase() === 'yesterday') return addDays(today(), -1);
  // NZ and AU exports write DD/MM/YYYY.
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
}

function parseNum(v, what, { int = false } = {}) {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const s = String(v).trim();
  // Tech logs write hours as 1.4 or as 1:24.
  const hm = !int && s.match(/^(\d+):(\d{2})$/);
  const x = hm ? Number(hm[1]) + Number(hm[2]) / 60 : Number(s.replace(/,/g, '').replace(/h$/i, ''));
  if (!Number.isFinite(x) || x < 0) throw new CliError(`"${v}" is not a number of ${what}.`);
  return int ? Math.round(x) : Math.round(x * 10) / 10;
}

// ---------------------------------------------------------------- lookups

let db;
let JSON_OUT = false;

function ambiguous(what, rows, label) {
  return new CliError(`More than one ${what} matches. Be more specific:\n${rows.map((r) => `  ${label(r)}`).join('\n')}`);
}

// Registrations are matched with or without the country prefix and the dash: SLA, ZK-SLA, zksla.
async function findAircraft(ref) {
  if (!ref || ref === true) throw new CliError('Which aircraft? Give its registration, for example ZK-SLA or SLA.');
  const key = String(ref).toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows = await db.query(`select t.*, a.serial_no, a.year_built, a.opening_hours, a.opening_cycles, a.opening_on from aircraft_totals t join aircraft a on a.id = t.id order by t.reg`);
  const norm = (r) => r.reg.toLowerCase().replace(/[^a-z0-9]/g, '');
  const exact = rows.filter((r) => norm(r) === key || norm(r).slice(2) === key || r.id === ref);
  if (exact.length === 1) return exact[0];
  const fuzzy = rows.filter((r) => norm(r).includes(key) || r.make_model.toLowerCase().includes(String(ref).toLowerCase()) || (r.owner || '').toLowerCase().includes(String(ref).toLowerCase()));
  if (fuzzy.length === 1) return fuzzy[0];
  if (!fuzzy.length) throw new CliError(`No aircraft "${ref}". Run: mx fleet`);
  throw ambiguous('aircraft', fuzzy, (r) => `${r.reg}  ${r.make_model}`);
}

async function findEngineer(ref) {
  if (!ref || ref === true) throw new CliError('Which engineer? Give their code (E01) or name with --by.');
  const rows = await db.query(`select * from engineers where lower(code) = lower($1) or full_name ilike $2 order by code`, [ref, `%${ref}%`]);
  const exact = rows.filter((r) => r.code.toLowerCase() === String(ref).toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No engineer "${ref}". Run: mx engineers`);
  throw ambiguous('engineer', rows, (r) => `${r.code}  ${r.full_name}`);
}

async function findByNumber(tbl, ref, what, prefix) {
  if (!ref || ref === true) throw new CliError(`Which ${what}? Give its number, for example ${prefix}0412.`);
  const s = String(ref).toUpperCase();
  const want = /^\d+$/.test(s) ? `${prefix}${s.padStart(4, '0')}` : s;
  const rows = await db.query(`select * from ${tbl} where upper(number) = $1 or upper(number) like $2 order by number`, [want, `%${s}%`]);
  const exact = rows.filter((r) => r.number.toUpperCase() === want);
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No ${what} "${ref}".`);
  throw ambiguous(what, rows, (r) => r.number);
}

async function findDirective(ref) {
  if (!ref || ref === true) throw new CliError('Which directive? Give its number, for example DCA/AS350/906 or 906.');
  const rows = await db.query(`select * from directives where lower(number) = lower($1) or number ilike $2 or title ilike $2 order by number`, [ref, `%${ref}%`]);
  const exact = rows.filter((r) => r.number.toLowerCase() === String(ref).toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No directive "${ref}". Run: mx directives`);
  throw ambiguous('directive', rows, (r) => `${r.number}  ${r.title}`);
}

async function findComponent(ref) {
  if (!ref || ref === true) throw new CliError('Which component? Give its serial number.');
  const rows = await db.query(`select * from components where lower(serial_no) = lower($1) or serial_no ilike $2 or description ilike $2 order by serial_no`, [ref, `%${ref}%`]);
  const exact = rows.filter((r) => r.serial_no.toLowerCase() === String(ref).toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No component "${ref}". Run: mx components --all`);
  throw ambiguous('component', rows, (r) => `${r.serial_no}  ${r.description}`);
}

async function nextNumber(tbl, prefix) {
  const [r] = await db.query(`select coalesce(max(substring(number from '[0-9]+$')::int), 0) + 1 as next from ${tbl} where number like $1`, [`${prefix}%`]);
  return `${prefix}${String(r.next).padStart(4, '0')}`;
}

// Airframe hours and cycles at the start of a day: opening figures plus every entry before it.
async function totalsAt(aircraftId, date) {
  const [r] = await db.query(`select a.opening_hours + coalesce(sum(f.hours), 0) as hours, a.opening_cycles + coalesce(sum(f.cycles), 0)::int as cycles
    from aircraft a left join flights f on f.aircraft_id = a.id and f.flown_on < $2 where a.id = $1 group by a.id`, [aircraftId, date]);
  return { hours: n(r.hours), cycles: n(r.cycles) };
}

function out(data, human) {
  if (JSON_OUT) console.log(JSON.stringify(data, null, 2));
  else console.log(typeof human === 'function' ? human(data) : human);
}

// ---------------------------------------------------------------- the airworthiness picture

// Everything that stops an aircraft flying today, and what is coming up. One query set, used by
// status, attention, the weekly review and the documents.
async function airworthiness(reg = null) {
  const fleet = await db.query(`select * from aircraft_totals where status <> 'sold' ${reg ? 'and id = $1' : ''} order by reg`, reg ? [reg] : []);
  const result = [];
  for (const a of fleet) {
    const stop = [];
    const warn = [];
    if (a.status === 'maintenance') stop.push('In maintenance');
    if (a.status === 'stored') stop.push('Stored');
    const items = await db.query(`select * from item_due where aircraft_id = $1 order by code`, [a.id]);
    for (const i of items) {
      const left = describeLeft(i);
      if (i.overdue) stop.push(`${i.code} ${i.title} overdue (${left})`);
      else if (dueSoon(i) && i.kind !== 'review') warn.push(`${i.code} due in ${left}`);
      if (i.kind === 'review' && !i.overdue && i.left_days !== null && n(i.left_days) <= ARA_WARN_DAYS) warn.push(`Review of airworthiness due ${isoDate(i.due_on)}: book it`);
    }
    const llp = await db.query(`select * from component_life where aircraft_id = $1 and life_limited`, [a.id]);
    for (const c of llp) {
      if ((c.left_hours !== null && n(c.left_hours) < 0) || (c.left_cycles !== null && n(c.left_cycles) < 0) || (c.expires_on && isoDate(c.expires_on) < today())) stop.push(`${c.description} ${c.serial_no} past its life limit (${componentLeft(c)})`);
      else if (c.left_hours !== null && n(c.left_hours) <= LLP_WARN_HOURS) warn.push(`${c.description} ${c.serial_no}: ${componentLeft(c)}`);
    }
    const ads = await db.query(`select * from directive_status where aircraft_id = $1 and kind = 'ad' and status in ('unassessed', 'open')`, [a.id]);
    for (const d of ads) {
      if (d.past_window) stop.push(`${d.number} ${d.status === 'open' ? 'not complied with' : 'not assessed'}, past its compliance window`);
      else warn.push(`${d.number} ${d.status === 'open' ? 'open' : 'not assessed yet'}`);
    }
    const defects = await db.query(`select * from defects where aircraft_id = $1 and status <> 'rectified' order by number`, [a.id]);
    for (const d of defects) {
      if (d.status === 'open') stop.push(`${d.number} open defect: ${truncate(d.description, 50)}`);
      else if (d.defer_until && isoDate(d.defer_until) < today()) stop.push(`${d.number} deferral expired ${isoDate(d.defer_until)} (${d.deferral_ref})`);
      else if (d.defer_until && isoDate(d.defer_until) <= addDays(today(), 3)) warn.push(`${d.number} deferral ends ${isoDate(d.defer_until)}`);
    }
    const unreleased = await db.query(`select distinct w.number from work_orders w join work_order_tasks t on t.work_order_id = w.id where w.aircraft_id = $1 and w.status = 'open' and t.done_on is not null order by w.number`, [a.id]);
    for (const w of unreleased) stop.push(`${w.number} has work done and not released to service`);
    const badRelease = await badReleases(a.id);
    for (const w of badRelease) stop.push(`${w.number} released by ${w.engineer}: ${w.problem}`);
    result.push({ reg: a.reg, make_model: a.make_model, hours: n(a.hours_now), cycles: n(a.cycles_now), serviceable: stop.length === 0, stop, warn });
  }
  return result;
}

function dueSoon(i) {
  return (i.left_hours !== null && n(i.left_hours) <= SOON_HOURS) || (i.left_cycles !== null && n(i.left_cycles) <= SOON_HOURS * 3) || (i.left_days !== null && n(i.left_days) <= SOON_DAYS);
}

function describeLeft(i) {
  const parts = [];
  if (i.left_hours !== null && i.left_hours !== undefined) parts.push(n(i.left_hours) < 0 ? `${(-n(i.left_hours)).toFixed(1)} h over` : `${n(i.left_hours).toFixed(1)} h`);
  if (i.left_cycles !== null && i.left_cycles !== undefined) parts.push(n(i.left_cycles) < 0 ? `${-n(i.left_cycles)} cycles over` : `${n(i.left_cycles)} cycles`);
  if (i.left_days !== null && i.left_days !== undefined) parts.push(n(i.left_days) < 0 ? `${-n(i.left_days)} days over` : `${n(i.left_days)} days`);
  return parts.join(' or ') || 'no interval';
}

function componentLeft(c) {
  const parts = [];
  if (c.left_hours !== null) parts.push(n(c.left_hours) < 0 ? `${(-n(c.left_hours)).toFixed(1)} h over` : `${n(c.left_hours).toFixed(1)} h left`);
  if (c.left_cycles !== null) parts.push(n(c.left_cycles) < 0 ? `${-n(c.left_cycles)} cycles over` : `${n(c.left_cycles)} cycles left`);
  if (c.expires_on) parts.push(`life ends ${isoDate(c.expires_on)}`);
  return parts.join(', ') || 'no limit';
}

// Releases signed by an engineer whose licence had lapsed that day, whose ratings do not cover the
// type, or a review of airworthiness signed without an inspection authorisation.
async function badReleases(aircraftId = null) {
  const rows = await db.query(`select w.number, a.reg, a.type, w.certified_on, e.full_name as engineer, e.licence_expires_on, e.ratings, e.inspection_authorisation,
      exists (select 1 from work_order_tasks t join maintenance_items i on i.id = t.maintenance_item_id where t.work_order_id = w.id and i.kind = 'review') as has_review
    from work_orders w join aircraft a on a.id = w.aircraft_id join engineers e on e.id = w.certified_by
    where w.status = 'certified' ${aircraftId ? 'and w.aircraft_id = $1' : ''} order by w.number`, aircraftId ? [aircraftId] : []);
  const outRows = [];
  for (const r of rows) {
    const problems = [];
    if (!r.licence_expires_on || isoDate(r.licence_expires_on) < isoDate(r.certified_on)) problems.push(`licence ${r.licence_expires_on ? 'expired ' + isoDate(r.licence_expires_on) : 'not on file'}`);
    if (!(r.ratings || []).map((x) => x.toLowerCase()).includes(r.type.toLowerCase())) problems.push(`no ${r.type} rating`);
    if (r.has_review && !r.inspection_authorisation) problems.push('review of airworthiness without an inspection authorisation');
    if (problems.length) outRows.push({ number: r.number, reg: r.reg, certified_on: isoDate(r.certified_on), engineer: r.engineer, problem: problems.join('; ') });
  }
  return outRows;
}

// ---------------------------------------------------------------- overview

async function stats() {
  const aw = await airworthiness();
  const [r] = await db.query(`select
      (select coalesce(sum(hours), 0) from flights where flown_on > current_date - 30) as hours_30d,
      (select count(*) from item_due where overdue) as overdue_items,
      (select count(*) from item_due where not overdue and (left_hours <= ${SOON_HOURS} or left_days <= ${SOON_DAYS})) as due_soon,
      (select count(*) from directive_status where kind = 'ad' and status = 'unassessed') as ads_unassessed,
      (select count(*) from defects where status = 'open') as open_defects,
      (select count(*) from defects where status = 'deferred') as deferred_defects,
      (select count(*) from work_orders where status = 'open') as open_work_orders`);
  const data = {
    aircraft: aw.length, serviceable: aw.filter((a) => a.serviceable).length, unserviceable: aw.filter((a) => !a.serviceable).map((a) => a.reg),
    hours_30d: n(r.hours_30d), overdue_items: n(r.overdue_items), due_soon: n(r.due_soon), ads_unassessed: n(r.ads_unassessed),
    open_defects: n(r.open_defects), deferred_defects: n(r.deferred_defects), open_work_orders: n(r.open_work_orders),
  };
  out(data, (d) => [heading('Fleet today'),
    `  ${d.aircraft} aircraft, ${d.serviceable} serviceable${d.unserviceable.length ? ` (not: ${d.unserviceable.join(', ')})` : ''}`,
    `  ${d.hours_30d.toFixed(1)} hours flown in the last 30 days`,
    `  ${d.overdue_items} programme items overdue, ${d.due_soon} due soon`,
    `  ${d.ads_unassessed} directives not assessed`,
    `  ${d.open_defects} open defects, ${d.deferred_defects} deferred`,
    `  ${d.open_work_orders} work orders open`].join('\n'));
}

async function fleet() {
  const aw = await airworthiness();
  const rows = await db.query(`select * from aircraft_totals where status <> 'sold' order by reg`);
  const data = rows.map((a) => {
    const s = aw.find((x) => x.reg === a.reg);
    return { reg: a.reg, make_model: a.make_model, base: a.base, owner: a.owner, status: a.status, hours: n(a.hours_now), cycles: n(a.cycles_now), hours_30d: n(a.hours_30d), last_flown_on: isoDate(a.last_flown_on), serviceable: s.serviceable, reasons: s.stop.length };
  });
  out(data, (d) => heading('Fleet') + '\n' + table(d, [
    { key: 'reg', label: 'Reg' }, { key: 'make_model', label: 'Type' }, { key: 'base', label: 'Base' },
    { key: 'hours', label: 'Hours', align: 'right', format: h1 }, { key: 'cycles', label: 'Cycles', align: 'right' },
    { key: 'hours_30d', label: '30 days', align: 'right', format: h1 }, { key: 'last_flown_on', label: 'Last flown' },
    { key: 'serviceable', label: 'Serviceable', format: (v, r) => (v ? 'yes' : `NO (${r.reasons})`) }]));
}

async function status(args) {
  const a = args[0] ? await findAircraft(args[0]) : null;
  const aw = await airworthiness(a?.id);
  out(aw, (d) => d.map((x) => [
    heading(`${x.reg} ${x.make_model}: ${x.serviceable ? 'SERVICEABLE' : 'NOT SERVICEABLE'}`),
    `  ${x.hours.toFixed(1)} hours, ${x.cycles} cycles`,
    ...x.stop.map((s) => `  STOP  ${s}`),
    ...x.warn.map((s) => `  soon  ${s}`),
    !x.stop.length && !x.warn.length ? '  Nothing due inside the planning window.' : '',
  ].filter(Boolean).join('\n')).join('\n'));
}

async function aircraftCard(args) {
  const a = await findAircraft(args[0]);
  const due = await db.query(`select * from item_due where aircraft_id = $1 order by overdue desc, coalesce(left_hours, 99999), coalesce(left_days, 99999)`, [a.id]);
  const comps = await db.query(`select * from component_life where aircraft_id = $1 order by life_limited desc, description`, [a.id]);
  const defects = await db.query(`select number, raised_on, description, status, deferral_ref, defer_until from defects where aircraft_id = $1 and status <> 'rectified' order by number`, [a.id]);
  const wos = await db.query(`select number, title, opened_on, status from work_orders where aircraft_id = $1 and status = 'open' order by number`, [a.id]);
  const notes = await db.query(`select body, author, created_at from notes where aircraft_id = $1 order by created_at desc limit 5`, [a.id]);
  const data = { aircraft: a, due, components: comps, defects, work_orders: wos, notes };
  out(data, (d) => [heading(`${a.reg} ${a.make_model}`),
    `  Serial ${a.serial_no || '?'}, built ${a.year_built || '?'}, based ${a.base || '?'}${a.owner ? `, owned by ${a.owner}` : ''}. Status ${a.status}.`,
    `  ${n(a.hours_now).toFixed(1)} hours, ${a.cycles_now} cycles, ${n(a.hours_30d).toFixed(1)} hours in the last 30 days.`,
    heading('Programme'), dueTable(d.due),
    heading('Components'), table(d.components, [{ key: 'description', label: 'Component' }, { key: 'serial_no', label: 'Serial' }, { key: 'tsn', label: 'TSN', align: 'right', format: h1 }, { key: 'csn', label: 'CSN', align: 'right' }, { key: 'life_limited', label: 'Life', format: (v, r) => (v ? componentLeft(r) : '') }]),
    heading('Defects'), table(d.defects, [{ key: 'number', label: 'Defect' }, { key: 'raised_on', label: 'Raised', format: isoDate }, { key: 'status', label: 'Status' }, { key: 'defer_until', label: 'Until', format: isoDate }, { key: 'description', label: 'Description', format: (v) => truncate(v, 50) }]),
    heading('Open work orders'), table(d.work_orders, [{ key: 'number', label: 'WO' }, { key: 'opened_on', label: 'Opened', format: isoDate }, { key: 'title', label: 'Title' }]),
    d.notes.length ? heading('Notes') + '\n' + d.notes.map((x) => `  ${isoDate(x.created_at)}  ${x.body}${x.author ? ` (${x.author})` : ''}`).join('\n') : '',
  ].filter(Boolean).join('\n'));
}

function dueTable(rows) {
  return table(rows, [
    { key: 'reg', label: 'Reg' }, { key: 'code', label: 'Item' }, { key: 'title', label: 'What', format: (v) => truncate(v, 40) },
    { key: 'due_hours', label: 'Due at h', align: 'right', format: h1 }, { key: 'due_on', label: 'Due on', format: isoDate },
    { key: 'left', label: 'Left', format: (v, r) => describeLeft(r) },
    { key: 'projected_on', label: 'At current flying', format: isoDate },
    { key: 'overdue', label: '', format: (v, r) => (v ? 'OVERDUE' : dueSoon(r) ? 'soon' : '') }]);
}

async function aircraftStatus(args) {
  const a = await findAircraft(args[0]);
  const st = str(args[1]);
  if (!['active', 'maintenance', 'stored', 'sold'].includes(st)) throw new CliError('Status is one of active, maintenance, stored, sold.');
  await db.query(`update aircraft set status = $2 where id = $1`, [a.id, st]);
  const [aw] = st === 'sold' ? [null] : await airworthiness(a.id);
  out({ reg: a.reg, status: st, serviceable: aw?.serviceable ?? false, stop: aw?.stop || [] }, (d) => [`  ${d.reg} is now ${d.status}.`,
    d.status === 'active' && !d.serviceable ? `  It is still not serviceable:\n${d.stop.map((x) => `    - ${x}`).join('\n')}` : ''].filter(Boolean).join('\n'));
}

async function releaseDoc(args) {
  const c = await findComponent(args[0]);
  const ref = args.slice(1).join(' ').trim();
  if (!ref) throw new CliError('Give the release certificate reference: mx release-doc <serial> "CAA Form One 12345"');
  await db.query(`update components set release_doc = $2 where id = $1`, [c.id, ref]);
  out({ serial_no: c.serial_no, release_doc: ref }, (d) => `  ${d.serial_no}: release certificate ${d.release_doc} recorded.`);
}

// ---------------------------------------------------------------- the programme

async function due(flags) {
  const a = flags.reg ? await findAircraft(flags.reg) : null;
  const hrs = parseNum(flags.hours, 'hours') ?? 50;
  const days = parseNum(flags.days, 'days', { int: true }) ?? 60;
  const rows = await db.query(`select * from item_due where ($1::uuid is null or aircraft_id = $1)
    ${flags.all ? '' : `and (overdue or left_hours <= $2 or left_days <= $3 or left_cycles <= $2 * 3 or projected_on <= current_date + $3::int)`}
    order by overdue desc, least(coalesce(due_on, projected_on), coalesce(projected_on, due_on)) nulls last, reg, code`, flags.all ? [a?.id || null] : [a?.id || null, hrs, days]);
  out(rows, (d) => heading(`Due${a ? ` on ${a.reg}` : ''}${flags.all ? '' : ` within ${hrs} hours or ${days} days`}`) + '\n' + dueTable(d));
}

async function forecast(flags) {
  const days = parseNum(flags.days, 'days', { int: true }) ?? 90;
  const rows = await db.query(`select *, least(coalesce(due_on, projected_on), coalesce(projected_on, due_on)) as next_on from item_due
    where least(coalesce(due_on, projected_on), coalesce(projected_on, due_on)) <= current_date + $1::int order by next_on, reg, code`, [days]);
  const llp = await db.query(`select c.*, case when c.left_hours is not null and t.hours_30d > 0 then current_date + floor(greatest(c.left_hours, 0) / (t.hours_30d / 30.0))::int end as projected_on
    from component_life c join aircraft_totals t on t.id = c.aircraft_id where c.life_limited`);
  const parts = llp.map((c) => ({ ...c, next_on: [c.projected_on, c.expires_on].filter(Boolean).map(isoDate).sort()[0] || null })).filter((c) => c.next_on && c.next_on <= addDays(today(), days));
  out({ items: rows, components: parts }, (d) => [heading(`Next ${days} days at the current rate of flying`),
    table(d.items, [{ key: 'next_on', label: 'When', format: isoDate }, { key: 'reg', label: 'Reg' }, { key: 'code', label: 'Item' }, { key: 'title', label: 'What', format: (v) => truncate(v, 40) }, { key: 'left', label: 'Left now', format: (v, r) => describeLeft(r) }]),
    d.components.length ? '\n  Life-limited parts reaching their limit:\n' + table(d.components, [{ key: 'next_on', label: 'When' }, { key: 'reg', label: 'Reg' }, { key: 'description', label: 'Part' }, { key: 'serial_no', label: 'Serial' }, { key: 'x', label: 'Left', format: (v, r) => componentLeft(r) }]) : '',
    '\n  Hours-based dates assume the last 30 days of flying continue.'].join('\n'));
}

async function itemAdd(args, flags) {
  const a = await findAircraft(args[0]);
  const code = str(args[1]).toUpperCase();
  if (!code) throw new CliError('Give the item code: mx item-add <reg> <code> --title=".." --hours=100 [--cycles] [--days] [--done-on] [--done-hours]');
  const kind = str(flags.kind) || 'inspection';
  if (!ITEM_KINDS.includes(kind)) throw new CliError(`--kind is one of ${ITEM_KINDS.join(', ')}`);
  const ih = parseNum(flags.hours, 'hours');
  const ic = parseNum(flags.cycles, 'cycles', { int: true });
  const id = parseNum(flags.days, 'days', { int: true }) ?? (flags.months ? Math.round(parseNum(flags.months, 'months') * 365 / 12) : null);
  if (ih === null && ic === null && id === null) throw new CliError('An item needs an interval: --hours, --cycles, --days or --months.');
  const doneOn = parseDate(flags['done-on']) || today();
  const at = await totalsAt(a.id, doneOn);
  const [row] = await db.query(`insert into maintenance_items (aircraft_id, code, title, kind, interval_hours, interval_cycles, interval_days, last_done_on, last_done_hours, last_done_cycles, reference)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (aircraft_id, code) do update set title = excluded.title, interval_hours = excluded.interval_hours,
    interval_cycles = excluded.interval_cycles, interval_days = excluded.interval_days, reference = excluded.reference returning id`,
    [a.id, code, str(flags.title) || code, kind, ih, ic, id, doneOn, parseNum(flags['done-hours'], 'hours') ?? at.hours, parseNum(flags['done-cycles'], 'cycles', { int: true }) ?? at.cycles, str(flags.ref) || null]);
  out({ id: row.id, reg: a.reg, code }, () => `  ${code} on ${a.reg} saved. Run: mx due --reg=${a.reg}`);
}

// ---------------------------------------------------------------- the tech log

async function fly(args, flags) {
  const a = await findAircraft(args[0]);
  if (a.status === 'sold') throw new CliError(`${a.reg} is sold.`);
  const hours = parseNum(flags.hours, 'hours');
  if (hours === null) throw new CliError('How long? --hours=1.4 (or 1:24)');
  if (hours > 16) throw new CliError(`${hours} hours in one entry looks wrong. Split it, or check the figure.`);
  const cycles = parseNum(flags.cycles ?? flags.landings, 'cycles', { int: true }) ?? 1;
  const date = parseDate(flags.date) || today();
  if (date > today()) throw new CliError('A tech log entry cannot be in the future.');
  const [s] = await db.query(`select coalesce(max(seq), 0) + 1 as seq from flights where aircraft_id = $1 and flown_on = $2`, [a.id, date]);
  // Tell the pilot now if this entry flies the aircraft into something it should not.
  const before = await airworthiness(a.id);
  await db.query(`insert into flights (aircraft_id, flown_on, seq, pilot, sector, hours, cycles, remarks) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [a.id, date, s.seq, str(flags.pilot) || null, str(flags.sector) || null, hours, cycles, str(flags.remarks) || null]);
  const after = await airworthiness(a.id);
  const [t] = await db.query(`select hours_now, cycles_now from aircraft_totals where id = $1`, [a.id]);
  const newStops = after[0].stop.filter((x) => !before[0].stop.includes(x));
  const data = { reg: a.reg, flown_on: date, hours, cycles, hours_now: n(t.hours_now), cycles_now: n(t.cycles_now), was_unserviceable: before[0].stop, now_overdue: newStops };
  out(data, (d) => [`  ${d.reg} ${d.flown_on}: ${d.hours.toFixed(1)} h, ${d.cycles} cycles. Now ${d.hours_now.toFixed(1)} h, ${d.cycles_now} cycles.`,
    d.was_unserviceable.length ? `  WARNING: ${d.reg} was not serviceable before this flight:\n${d.was_unserviceable.map((x) => `    - ${x}`).join('\n')}` : '',
    d.now_overdue.length ? `  This entry takes it past:\n${d.now_overdue.map((x) => `    - ${x}`).join('\n')}` : ''].filter(Boolean).join('\n'));
}

async function flights(flags) {
  const a = flags.reg ? await findAircraft(flags.reg) : null;
  const days = parseNum(flags.days, 'days', { int: true }) ?? 7;
  const rows = await db.query(`select f.flown_on, a.reg, f.seq, f.pilot, f.sector, f.hours, f.cycles, f.remarks from flights f join aircraft a on a.id = f.aircraft_id
    where f.flown_on > current_date - $1::int and ($2::uuid is null or a.id = $2) order by f.flown_on desc, a.reg, f.seq`, [days, a?.id || null]);
  out(rows, (d) => heading(`Tech log, last ${days} days`) + '\n' + table(d, [{ key: 'flown_on', label: 'Date', format: isoDate }, { key: 'reg', label: 'Reg' }, { key: 'pilot', label: 'Pilot' }, { key: 'sector', label: 'Sector' }, { key: 'hours', label: 'Hours', align: 'right', format: h1 }, { key: 'cycles', label: 'Cycles', align: 'right' }]));
}

async function utilisation(flags) {
  const days = parseNum(flags.days, 'days', { int: true }) ?? 30;
  const rows = await db.query(`select a.reg, a.make_model, a.status, count(f.id)::int as entries, count(distinct f.flown_on)::int as days_flown,
      coalesce(sum(f.hours), 0) as hours, coalesce(sum(f.cycles), 0)::int as cycles, max(f.flown_on) as last_flown_on
    from aircraft a left join flights f on f.aircraft_id = a.id and f.flown_on > current_date - $1::int
    where a.status <> 'sold' group by a.id order by hours desc`, [days]);
  const data = rows.map((r) => ({ ...r, hours: n(r.hours), per_day: n(r.hours) / days, per_flying_day: r.days_flown ? n(r.hours) / r.days_flown : 0, quiet_days: r.last_flown_on ? Math.round((Date.parse(today()) - Date.parse(isoDate(r.last_flown_on))) / 86400000) : null }));
  out(data, (d) => heading(`Utilisation, last ${days} days`) + '\n' + table(d, [{ key: 'reg', label: 'Reg' }, { key: 'make_model', label: 'Type' },
    { key: 'hours', label: 'Hours', align: 'right', format: h1 }, { key: 'cycles', label: 'Cycles', align: 'right' }, { key: 'days_flown', label: 'Days flown', align: 'right' },
    { key: 'per_day', label: 'h/day', align: 'right', format: (v) => n(v).toFixed(2) }, { key: 'per_flying_day', label: 'h/flying day', align: 'right', format: (v) => n(v).toFixed(1) },
    { key: 'last_flown_on', label: 'Last flown', format: isoDate }]) + '\n\n  The due list projects hours-based items from this rate of flying.');
}

// ---------------------------------------------------------------- components

async function components(flags) {
  const a = flags.reg ? await findAircraft(flags.reg) : null;
  let rows;
  if (flags.all) rows = await db.query(`select c.*, a.reg from components c left join aircraft a on a.id = c.aircraft_id where ($1::uuid is null or c.aircraft_id = $1) order by a.reg nulls last, c.description`, [a?.id || null]);
  else rows = await db.query(`select * from component_life where ($1::uuid is null or aircraft_id = $1) ${flags.llp ? 'and life_limited' : ''} order by life_limited desc, coalesce(left_hours, 99999), reg, description`, [a?.id || null]);
  out(rows, (d) => heading(flags.all ? 'Components, fitted and in stores' : 'Fitted components') + '\n' + table(d, [{ key: 'reg', label: 'Reg', format: (v) => v || 'stores' }, { key: 'description', label: 'Component' }, { key: 'part_no', label: 'Part' }, { key: 'serial_no', label: 'Serial' },
    { key: 'tsn', label: 'TSN', align: 'right', format: h1 }, { key: 'csn', label: 'CSN', align: 'right' },
    { key: 'life_limited', label: 'Life limit', format: (v, r) => (v && r.tsn !== undefined ? componentLeft(r) : v ? 'life-limited' : '') }, { key: 'release_doc', label: 'Release', format: (v) => v || 'NONE ON FILE' }]));
}

async function install(args, flags) {
  const a = await findAircraft(args[1]);
  let c = await db.query(`select * from components where lower(serial_no) = lower($1)`, [args[0]]).then((r) => r[0]);
  const date = parseDate(flags.date) || today();
  const at = await totalsAt(a.id, date);
  if (!c) {
    if (!flags.part || !flags.desc) throw new CliError(`${args[0]} is not on file. Add it as you fit it: --part=<part no> --desc="what it is" [--tsn --csn] [--limit-hours --limit-cycles --limit-years --made=date]`);
    [c] = await db.query(`insert into components (part_no, serial_no, description, life_limited, limit_hours, limit_cycles, limit_years, manufactured_on) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [str(flags.part), args[0], str(flags.desc), !!(flags['limit-hours'] || flags['limit-cycles'] || flags['limit-years']), parseNum(flags['limit-hours'], 'hours'), parseNum(flags['limit-cycles'], 'cycles', { int: true }), parseNum(flags['limit-years'], 'years', { int: true }), parseDate(flags.made)]);
  }
  if (c.aircraft_id && !c.removed_on) throw new CliError(`${c.serial_no} is fitted to another aircraft. Remove it first: mx remove ${c.serial_no} --reason=".."`);
  const tsn = parseNum(flags.tsn, 'hours') ?? n(c.tsn_at_install);
  const csn = parseNum(flags.csn, 'cycles', { int: true }) ?? n(c.csn_at_install);
  await db.query(`update components set aircraft_id = $2, position = $3, installed_on = $4, installed_at_hours = $5, installed_at_cycles = $6, tsn_at_install = $7, csn_at_install = $8, release_doc = coalesce($9, release_doc), removed_on = null, removed_reason = null where id = $1`,
    [c.id, a.id, str(flags.position) || c.position, date, at.hours, at.cycles, tsn, csn, str(flags.release) || null]);
  const warning = !(str(flags.release) || c.release_doc) ? '  No release certificate recorded. Add it before flight: --release="CAA Form One 12345"' : '';
  out({ serial_no: c.serial_no, reg: a.reg, installed_on: date, at_hours: at.hours, release_doc: str(flags.release) || c.release_doc || null }, () => [`  ${c.serial_no} ${c.description} fitted to ${a.reg} at ${at.hours.toFixed(1)} h.`, warning].filter(Boolean).join('\n'));
}

async function remove(args, flags) {
  const c = await findComponent(args[0]);
  if (!c.aircraft_id) throw new CliError(`${c.serial_no} is not fitted to an aircraft.`);
  const [life] = await db.query(`select * from component_life where id = $1`, [c.id]);
  const date = parseDate(flags.date) || today();
  // Carry the part's own time and cycles with it, so it is right when it is fitted to the next aircraft.
  await db.query(`update components set aircraft_id = null, removed_on = $2, removed_reason = $3, tsn_at_install = $4, csn_at_install = $5, installed_at_hours = null, installed_at_cycles = null where id = $1`,
    [c.id, date, str(flags.reason) || null, n(life.tsn), n(life.csn)]);
  out({ serial_no: c.serial_no, removed_on: date, tsn: n(life.tsn), csn: n(life.csn) }, (d) => `  ${d.serial_no} removed ${d.removed_on} at ${d.tsn.toFixed(1)} h since new, ${d.csn} cycles.`);
}

// ---------------------------------------------------------------- directives

async function directives(flags) {
  const a = flags.reg ? await findAircraft(flags.reg) : null;
  const rows = await db.query(`select * from directive_status where ($1::uuid is null or aircraft_id = $1) ${flags.open ? `and status in ('unassessed', 'open')` : ''} ${flags.sb ? '' : flags.open ? `and kind = 'ad'` : ''}
    order by (status in ('unassessed', 'open')) desc, past_window desc, effective_on desc, reg`, [a?.id || null]);
  out(rows, (d) => heading(flags.open ? 'Directives waiting on an assessment or compliance' : 'Directive register by aircraft') + '\n' + table(d, [
    { key: 'number', label: 'Number' }, { key: 'kind', label: 'Kind', format: (v) => v.toUpperCase() }, { key: 'reg', label: 'Reg' }, { key: 'effective_on', label: 'Effective', format: isoDate },
    { key: 'title', label: 'Subject', format: (v) => truncate(v, 44) }, { key: 'status', label: 'Status' },
    { key: 'past_window', label: 'Window', format: (v, r) => (v ? 'PAST' : r.comply_within_hours && ['unassessed', 'open'].includes(r.status) ? `${(n(r.comply_within_hours) - n(r.hours_since_effective)).toFixed(1)} h left` : '') }]));
}

async function directiveNew(args, flags) {
  const number = str(args[0]);
  if (!number || !flags.title || !flags.type) throw new CliError('mx directive-new <number> --title=".." --type=AS350 [--effective=date] [--within-hours=10] [--by=date] [--recurring] [--authority="CAA NZ"] [--sb]');
  const [d] = await db.query(`insert into directives (number, authority, kind, title, applies_to_type, effective_on, comply_within_hours, comply_by, recurring) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (number) do nothing returning *`, [number, str(flags.authority) || 'CAA NZ', flags.sb ? 'sb' : 'ad', str(flags.title), str(flags.type), parseDate(flags.effective) || today(), parseNum(flags['within-hours'], 'hours'), parseDate(flags.by), !!flags.recurring]);
  if (!d) throw new CliError(`${number} is already on the register.`);
  const fleetOfType = await db.query(`select reg from aircraft where lower(type) = lower($1) and status <> 'sold' order by reg`, [str(flags.type)]);
  out({ number, applies_to: fleetOfType.map((r) => r.reg) }, (x) => `  ${x.number} added. ${x.applies_to.length ? `Assess it on ${x.applies_to.join(', ')}: mx assess ${x.number} <reg> <${ASSESS.join('|')}> --by=E01` : 'No aircraft of that type in the fleet.'}`);
}

async function assess(args, flags) {
  const d = await findDirective(args[0]);
  const a = await findAircraft(args[1]);
  const st = str(args[2]);
  if (!ASSESS.includes(st)) throw new CliError(`Status is one of ${ASSESS.join(', ')}`);
  const e = await findEngineer(flags.by);
  if (st === 'not-applicable' && !flags.notes) throw new CliError('Say why it does not apply (serial range, modification state): --notes=".."');
  const ih = parseNum(flags.hours, 'hours');
  const id = parseNum(flags.days, 'days', { int: true });
  if (st === 'recurring' && ih === null && id === null) throw new CliError('A recurring directive needs its repeat interval: --hours=50 and/or --days=365');
  const on = parseDate(flags.date) || today();
  const at = await totalsAt(a.id, on);
  await db.query(`insert into directive_assessments (directive_id, aircraft_id, status, assessed_on, assessed_by, complied_on, complied_hours, notes) values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict (directive_id, aircraft_id) do update set status = excluded.status, assessed_on = excluded.assessed_on, assessed_by = excluded.assessed_by,
    complied_on = excluded.complied_on, complied_hours = excluded.complied_hours, notes = coalesce(excluded.notes, directive_assessments.notes)`,
    [d.id, a.id, st, on, e.id, st === 'complied' ? on : null, st === 'complied' ? at.hours : null, str(flags.notes) || null]);
  let item = null;
  if (st === 'recurring') {
    await db.query(`insert into maintenance_items (aircraft_id, code, title, kind, directive_id, interval_hours, interval_days, last_done_on, last_done_hours, reference) values ($1,$2,$3,'directive',$4,$5,$6,$7,$8,$2)
      on conflict (aircraft_id, code) do update set interval_hours = excluded.interval_hours, interval_days = excluded.interval_days`, [a.id, d.number, d.title, d.id, ih, id, on, at.hours]);
    item = d.number;
  }
  out({ number: d.number, reg: a.reg, status: st, programme_item: item }, (x) => `  ${x.number} on ${x.reg}: ${x.status}${x.programme_item ? ', added to the due list as a recurring item' : ''}.`);
}

// ---------------------------------------------------------------- defects

async function defects(flags) {
  const a = flags.reg ? await findAircraft(flags.reg) : null;
  const rows = await db.query(`select d.*, a.reg, w.number as work_order,
      (select count(*) from flights f where f.aircraft_id = d.aircraft_id and f.flown_on > d.raised_on)::int as flights_since
    from defects d join aircraft a on a.id = d.aircraft_id left join work_orders w on w.id = d.work_order_id
    where ($1::uuid is null or d.aircraft_id = $1) ${flags.all ? '' : `and d.status <> 'rectified'`} order by d.status, d.defer_until nulls first, d.number`, [a?.id || null]);
  out(rows, (d) => heading(flags.all ? 'Defects' : 'Open and deferred defects') + '\n' + table(d, [{ key: 'number', label: 'Defect' }, { key: 'reg', label: 'Reg' }, { key: 'raised_on', label: 'Raised', format: isoDate },
    { key: 'status', label: 'Status' }, { key: 'deferral_ref', label: 'Deferred under' }, { key: 'defer_until', label: 'Until', format: (v) => (v ? `${isoDate(v)}${isoDate(v) < today() ? ' EXPIRED' : ''}` : '') },
    { key: 'work_order', label: 'WO' }, { key: 'flights_since', label: 'Flights since', align: 'right' }, { key: 'description', label: 'Description', format: (v) => truncate(v, 46) }]));
}

async function defect(args, flags) {
  const a = await findAircraft(args[0]);
  const text = args.slice(1).join(' ').trim();
  if (!text) throw new CliError('What is the defect? mx defect <reg> "description" [--by=name]');
  const number = await nextNumber('defects', 'D-');
  await db.query(`insert into defects (number, aircraft_id, raised_on, raised_by, description) values ($1,$2,$3,$4,$5)`, [number, a.id, parseDate(flags.date) || today(), str(flags.by) || null, text]);
  out({ number, reg: a.reg }, () => `  ${number} raised on ${a.reg}. It grounds the aircraft until it is deferred (mx defer ${number} --ref=".." --days=N) or rectified on a work order.`);
}

async function defer(args, flags) {
  const d = await findByNumber('defects', args[0], 'defect', 'D-');
  if (d.status === 'rectified') throw new CliError(`${d.number} is already rectified.`);
  if (!flags.ref) throw new CliError('Under what? --ref="MEL 30-1 (10 days)". A defect is only deferred against your MEL or a deferral the engineer authorises.');
  const until = parseDate(flags.until) || (flags.days ? addDays(today(), parseNum(flags.days, 'days', { int: true })) : null);
  if (!until) throw new CliError('Until when? --until=date or --days=N, from the MEL item.');
  const e = flags.by ? await findEngineer(flags.by) : null;
  await db.query(`update defects set status = 'deferred', deferral_ref = $2, deferred_on = current_date, defer_until = $3 where id = $1`, [d.id, `${str(flags.ref)}${e ? `, ${e.code}` : ''}`, until]);
  out({ number: d.number, defer_until: until }, (x) => `  ${x.number} deferred until ${x.defer_until}.`);
}

// ---------------------------------------------------------------- work orders

async function workOrders(flags) {
  const rows = await db.query(`select w.number, a.reg, w.title, w.opened_on, w.status, w.certified_on, e.full_name as certified_by,
      count(t.id)::int as tasks, count(t.done_on)::int as done
    from work_orders w join aircraft a on a.id = w.aircraft_id left join engineers e on e.id = w.certified_by left join work_order_tasks t on t.work_order_id = w.id
    ${flags.open ? `where w.status = 'open'` : ''} group by w.id, a.reg, e.full_name order by w.number desc`);
  out(rows, (d) => heading(flags.open ? 'Open work orders' : 'Work orders') + '\n' + table(d, [{ key: 'number', label: 'WO' }, { key: 'reg', label: 'Reg' }, { key: 'opened_on', label: 'Opened', format: isoDate },
    { key: 'title', label: 'Title', format: (v) => truncate(v, 46) }, { key: 'done', label: 'Done', align: 'right', format: (v, r) => `${v}/${r.tasks}` }, { key: 'status', label: 'Status' }, { key: 'certified_by', label: 'Released by' }]));
}

async function workOrder(args) {
  const w = await findByNumber('work_orders', args[0], 'work order', 'WO-');
  const [a] = await db.query(`select reg, make_model from aircraft where id = $1`, [w.aircraft_id]);
  const tasks = await db.query(`select t.line, t.description, i.code as item, d.number as defect, t.done_on, e.code as done_by, t.done_hours
    from work_order_tasks t left join maintenance_items i on i.id = t.maintenance_item_id left join defects d on d.id = t.defect_id left join engineers e on e.id = t.done_by
    where t.work_order_id = $1 order by t.line`, [w.id]);
  const [cert] = w.certified_by ? await db.query(`select code, full_name from engineers where id = $1`, [w.certified_by]) : [null];
  out({ work_order: w, aircraft: a, tasks, certified_by: cert }, (d) => [heading(`${w.number} ${a.reg}: ${w.title}`),
    `  Opened ${isoDate(w.opened_on)}. ${w.status === 'certified' ? `Released to service ${isoDate(w.certified_on)} by ${cert.full_name} (${w.crs_ref || 'no CRS reference'}).` : `Status ${w.status}.`}`,
    table(d.tasks, [{ key: 'line', label: '#', align: 'right' }, { key: 'description', label: 'Task' }, { key: 'item', label: 'Item' }, { key: 'defect', label: 'Defect' }, { key: 'done_on', label: 'Done', format: isoDate }, { key: 'done_by', label: 'By' }])].join('\n'));
}

async function woNew(args, flags) {
  const a = await findAircraft(args[0]);
  const title = args.slice(1).join(' ').trim();
  if (!title) throw new CliError('mx wo-new <reg> "title" [--items=100HR,ARA] [--defects=D-0029] [--task="free text"]');
  const number = await nextNumber('work_orders', 'WO-');
  await db.exec('BEGIN');
  try {
    const [w] = await db.query(`insert into work_orders (number, aircraft_id, title) values ($1,$2,$3) returning id`, [number, a.id, title]);
    let line = 0;
    for (const code of str(flags.items).split(',').map((s) => s.trim()).filter(Boolean)) {
      const [i] = await db.query(`select id, title from maintenance_items where aircraft_id = $1 and upper(code) = upper($2)`, [a.id, code]);
      if (!i) throw new CliError(`${a.reg} has no programme item "${code}". Run: mx due --reg=${a.reg} --all`);
      await db.query(`insert into work_order_tasks (work_order_id, line, maintenance_item_id, description) values ($1,$2,$3,$4)`, [w.id, ++line, i.id, i.title]);
    }
    for (const num of str(flags.defects).split(',').map((s) => s.trim()).filter(Boolean)) {
      const d = await findByNumber('defects', num, 'defect', 'D-');
      if (d.aircraft_id !== a.id) throw new CliError(`${d.number} is not on ${a.reg}.`);
      await db.query(`insert into work_order_tasks (work_order_id, line, defect_id, description) values ($1,$2,$3,$4)`, [w.id, ++line, d.id, `Rectify: ${d.description}`]);
      await db.query(`update defects set work_order_id = $2 where id = $1`, [d.id, w.id]);
    }
    if (flags.task) await db.query(`insert into work_order_tasks (work_order_id, line, description) values ($1,$2,$3)`, [w.id, ++line, str(flags.task)]);
    await db.exec('COMMIT');
    out({ number, reg: a.reg, tasks: line }, (x) => `  ${x.number} opened on ${x.reg} with ${x.tasks} task(s).`);
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
}

async function taskDone(args, flags) {
  const w = await findByNumber('work_orders', args[0], 'work order', 'WO-');
  if (w.status !== 'open') throw new CliError(`${w.number} is ${w.status}.`);
  const line = parseNum(args[1], 'task line', { int: true });
  const e = await findEngineer(flags.by);
  const date = parseDate(flags.date) || today();
  const at = await totalsAt(w.aircraft_id, date);
  const [t] = await db.query(`update work_order_tasks set done_on = $3, done_by = $4, done_hours = $5, done_cycles = $6 where work_order_id = $1 and line = $2 returning line, description`, [w.id, line, date, e.id, at.hours, at.cycles]);
  if (!t) throw new CliError(`${w.number} has no task ${line}. Run: mx work-order ${w.number}`);
  out({ number: w.number, line, done_on: date, by: e.code }, () => `  ${w.number} task ${line} done by ${e.full_name}. The aircraft is not released until the work order is certified: mx certify ${w.number} --by=<engineer> --crs=".."`);
}

// The release to service. Refused unless every task is done, the engineer's licence is current
// and covers the type, and a review of airworthiness is signed by someone authorised for it.
async function certify(args, flags) {
  const w = await findByNumber('work_orders', args[0], 'work order', 'WO-');
  if (w.status !== 'open') throw new CliError(`${w.number} is ${w.status}.`);
  const e = await findEngineer(flags.by);
  const [a] = await db.query(`select * from aircraft where id = $1`, [w.aircraft_id]);
  const date = parseDate(flags.date) || today();
  const tasks = await db.query(`select t.*, i.kind as item_kind, i.code as item_code, i.directive_id from work_order_tasks t left join maintenance_items i on i.id = t.maintenance_item_id where t.work_order_id = $1 order by t.line`, [w.id]);
  if (!tasks.length) throw new CliError(`${w.number} has no tasks.`);
  const open = tasks.filter((t) => !t.done_on);
  if (open.length) throw new CliError(`${w.number} has ${open.length} task(s) not done: ${open.map((t) => `${t.line} ${t.description}`).join('; ')}`);
  if (!e.licence_expires_on || isoDate(e.licence_expires_on) < date) throw new CliError(`${e.full_name}'s licence ${e.licence_expires_on ? `expired ${isoDate(e.licence_expires_on)}` : 'is not on file'}. Another engineer must release this work.`);
  if (!(e.ratings || []).map((x) => x.toLowerCase()).includes(a.type.toLowerCase())) throw new CliError(`${e.full_name} has no ${a.type} rating on file.`);
  if (tasks.some((t) => t.item_kind === 'review') && !e.inspection_authorisation) throw new CliError(`The review of airworthiness needs an engineer with an inspection authorisation. ${e.full_name} does not hold one on file.`);
  if (!flags.crs) throw new CliError('Give the certificate of release to service reference: --crs="CRS 0414"');
  const at = await totalsAt(w.aircraft_id, date);
  await db.exec('BEGIN');
  try {
    await db.query(`update work_orders set status = 'certified', certified_by = $2, certified_on = $3, certified_hours = $4, crs_ref = $5 where id = $1`, [w.id, e.id, date, at.hours, str(flags.crs)]);
    for (const t of tasks) {
      if (t.maintenance_item_id) {
        await db.query(`update maintenance_items set last_done_on = $2, last_done_hours = $3, last_done_cycles = case when interval_cycles is null then last_done_cycles else $4 end where id = $1`, [t.maintenance_item_id, t.done_on, n(t.done_hours) || at.hours, t.done_cycles ?? at.cycles]);
        if (t.directive_id) await db.query(`update directive_assessments set assessed_on = $3 where directive_id = $1 and aircraft_id = $2`, [t.directive_id, w.aircraft_id, t.done_on]);
      }
      if (t.defect_id) await db.query(`update defects set status = 'rectified', rectified_on = $2 where id = $1`, [t.defect_id, t.done_on]);
    }
    await db.exec('COMMIT');
  } catch (err) { await db.exec('ROLLBACK'); throw err; }
  const [after] = await airworthiness(w.aircraft_id);
  out({ number: w.number, reg: a.reg, certified_on: date, by: e.code, serviceable: after.serviceable, still_stopping: after.stop }, (d) => [`  ${d.number} released to service on ${d.certified_on} by ${e.full_name}. Programme items reset and defects closed.`,
    d.serviceable ? `  ${d.reg} is serviceable.` : `  ${d.reg} is still not serviceable:\n${d.still_stopping.map((x) => `    - ${x}`).join('\n')}`].join('\n'));
}

// Items falling due inside a window, plus open defects and directives: what goes in the next work pack.
async function workPack(args, flags) {
  const a = await findAircraft(args[0]);
  const hrs = parseNum(flags.hours, 'hours') ?? 30;
  const days = parseNum(flags.days, 'days', { int: true }) ?? 40;
  const items = await db.query(`select * from item_due where aircraft_id = $1 and (overdue or left_hours <= $2 or left_days <= $3::int or left_cycles <= $2 * 3) order by overdue desc, coalesce(left_hours, 9999), coalesce(left_days, 9999)`, [a.id, hrs, days]);
  const defectsOpen = await db.query(`select number, description, status, defer_until from defects where aircraft_id = $1 and status <> 'rectified' and work_order_id is null order by number`, [a.id]);
  const ads = await db.query(`select number, title, status, past_window from directive_status where aircraft_id = $1 and kind = 'ad' and status in ('unassessed', 'open')`, [a.id]);
  const parts = await db.query(`select * from component_life where aircraft_id = $1 and life_limited and (left_hours <= $2 * 2 or left_cycles <= $2 * 6 or expires_on <= current_date + $3::int)`, [a.id, hrs, days]);
  out({ reg: a.reg, window: { hours: hrs, days }, items, defects: defectsOpen, directives: ads, components: parts }, (d) => [heading(`Work pack for ${a.reg}: everything due within ${hrs} hours or ${days} days`),
    dueTable(d.items),
    d.directives.length ? '\n  Directives to assess or comply with:\n' + d.directives.map((x) => `    ${x.number} ${x.title} (${x.status}${x.past_window ? ', PAST WINDOW' : ''})`).join('\n') : '',
    d.defects.length ? '\n  Defects not yet on a work order:\n' + d.defects.map((x) => `    ${x.number} ${x.description} (${x.status}${x.defer_until ? ` until ${isoDate(x.defer_until)}` : ''})`).join('\n') : '',
    d.components.length ? '\n  Life-limited parts to order:\n' + d.components.map((x) => `    ${x.description} ${x.serial_no}: ${componentLeft(x)}`).join('\n') : '',
    `\n  Open it as a work order: mx wo-new ${a.reg} "title" --items=${d.items.map((x) => x.code).join(',')}`].filter(Boolean).join('\n'));
}

async function engineers() {
  const rows = await db.query(`select code, full_name, licence_no, licence_expires_on, array_to_string(ratings, ', ') as ratings, inspection_authorisation,
      (select count(*) from work_orders w where w.certified_by = e.id and w.certified_on > current_date - 90)::int as releases_90d
    from engineers e where active order by code`);
  out(rows, (d) => heading('Engineers') + '\n' + table(d, [{ key: 'code', label: 'Code' }, { key: 'full_name', label: 'Name' }, { key: 'licence_no', label: 'Licence' },
    { key: 'licence_expires_on', label: 'Expires', format: (v) => (v ? `${isoDate(v)}${isoDate(v) < today() ? ' EXPIRED' : isoDate(v) <= addDays(today(), LICENCE_WARN_DAYS) ? ' soon' : ''}` : 'NOT ON FILE') },
    { key: 'ratings', label: 'Ratings' }, { key: 'inspection_authorisation', label: 'IA', format: (v) => (v ? 'yes' : '') }, { key: 'releases_90d', label: 'Releases 90d', align: 'right' }]));
}

// ---------------------------------------------------------------- compliance

const RULES = [
  { id: 'R1', rule: 'Every directive assessed', source: 'Civil Aviation Rules Part 39 (Airworthiness Directives)' },
  { id: 'R2', rule: 'Nothing flown past due', source: 'Civil Aviation Rules Part 91 Subpart G (maintenance programme) and Part 39' },
  { id: 'R3', rule: 'No life-limited part past its limit', source: 'Civil Aviation Rules Part 91 Subpart G; the airworthiness limitations in the maintenance manual' },
  { id: 'R4', rule: 'Review of airworthiness in date', source: 'Civil Aviation Rules Part 91 Subpart G (review of airworthiness)' },
  { id: 'R5', rule: 'Released by an authorised engineer', source: 'Civil Aviation Rules Part 43 (release to service) and Part 66 (licences and ratings)' },
  { id: 'R6', rule: 'No flight with work not released', source: 'Civil Aviation Rules Part 43 (release to service)' },
  { id: 'R7', rule: 'Deferred defects inside their limit', source: 'Civil Aviation Rules Part 91 (inoperative equipment) and your approved MEL' },
  { id: 'R8', rule: 'Release certificate for every fitted part', source: 'Civil Aviation Rules Part 43 (parts acceptance and records)' },
  { id: 'R9', rule: 'No flight with an open defect', source: 'Civil Aviation Rules Part 91 (airworthiness of the aircraft before flight)' },
];

async function complianceRows() {
  const r1 = await db.query(`select reg, number as item, title as detail from directive_status where kind = 'ad' and status = 'unassessed' order by effective_on`);
  const r2a = await db.query(`select i.reg, i.code as item, i.title as detail from item_due i
    where i.overdue and (coalesce(i.left_hours < 0, false) or coalesce(i.left_cycles < 0, false) or exists (select 1 from flights f where f.aircraft_id = i.aircraft_id and f.flown_on > i.due_on))`);
  const r2b = await db.query(`select reg, number as item, 'flown ' || hours_since_effective || ' h since effective, window ' || comply_within_hours || ' h' as detail from directive_status where kind = 'ad' and past_window`);
  const r3 = (await db.query(`select * from component_life where life_limited and (left_hours < 0 or left_cycles < 0 or expires_on < current_date)`))
    .map((c) => ({ reg: c.reg, item: c.serial_no, detail: `${c.description}, ${componentLeft(c)}` }));
  const r4 = await db.query(`select reg, code as item, 'due ' || due_on as detail from item_due where kind = 'review' and due_on < current_date`);
  const r5 = (await badReleases()).map((x) => ({ reg: x.reg, item: x.number, detail: `${x.engineer}: ${x.problem}` }));
  const r6 = await db.query(`select distinct a.reg, w.number as item, 'work done ' || t.done_on || ', flown since' as detail from work_orders w join work_order_tasks t on t.work_order_id = w.id join aircraft a on a.id = w.aircraft_id
    where w.status = 'open' and t.done_on is not null and exists (select 1 from flights f where f.aircraft_id = w.aircraft_id and f.flown_on > t.done_on)`);
  const r7 = await db.query(`select a.reg, d.number as item, d.description || ', limit ' || d.defer_until as detail from defects d join aircraft a on a.id = d.aircraft_id where d.status = 'deferred' and d.defer_until < current_date`);
  const r8 = await db.query(`select reg, serial_no as item, description || ' fitted ' || installed_on as detail from component_life where release_doc is null or release_doc = ''`);
  const r9 = await db.query(`select a.reg, d.number as item, d.description as detail from defects d join aircraft a on a.id = d.aircraft_id where d.status = 'open' and exists (select 1 from flights f where f.aircraft_id = d.aircraft_id and f.flown_on > d.raised_on)`);
  const found = { R1: r1, R2: [...r2a, ...r2b], R3: r3, R4: r4, R5: r5, R6: r6, R7: r7, R8: r8, R9: r9 };
  return RULES.map((x) => ({ ...x, count: found[x.id].length, items: found[x.id] }));
}

async function compliance() {
  const rows = await complianceRows();
  out(rows, (d) => heading('Compliance: the records against the rules in docs/compliance.md') + '\n' + table(d, [{ key: 'id', label: 'Rule' }, { key: 'rule', label: 'Check' }, { key: 'count', label: 'Breaches', align: 'right' },
    { key: 'items', label: 'Worst example', format: (v) => (v.length ? truncate(`${v[0].reg} ${v[0].item}: ${v[0].detail}`, 64) : 'clean') }]) +
    '\n\n  A records check, not legal advice. Sources are in docs/compliance.md.');
}

// ---------------------------------------------------------------- attention

async function attention() {
  const list = [];
  const push = (area, reg, what, action) => list.push({ area, reg, what, action });
  for (const c of await complianceRows()) for (const i of c.items) {
    const action = { R1: 'Engineer assesses it today', R2: 'Ground the aircraft until the item is done', R3: 'Ground the aircraft and replace the part', R4: 'Book the review of airworthiness',
      R5: 'Have an authorised engineer re-inspect and release it', R6: 'Release the work or ground the aircraft', R7: 'Rectify or ground the aircraft', R8: 'Find the release certificate or remove the part', R9: 'Rectify or defer it properly before the next flight' }[c.id];
    push('airworthiness', i.reg, `${c.id} ${c.rule}: ${i.item} ${i.detail}`, action);
  }
  for (const a of await airworthiness()) for (const w of a.warn) push('coming up', a.reg, w, 'Plan it into the next work pack');
  for (const e of await db.query(`select code, full_name, licence_expires_on from engineers where active and licence_expires_on between current_date and current_date + ${LICENCE_WARN_DAYS} order by licence_expires_on`))
    push('people', null, `${e.full_name}'s licence expires ${isoDate(e.licence_expires_on)}`, 'Renew before it lapses');
  for (const r of await db.query(`select reg, last_flown_on from aircraft_totals where status = 'active' and (last_flown_on is null or last_flown_on < current_date - ${QUIET_DAYS})`))
    push('records', r.reg, `No tech log entry since ${isoDate(r.last_flown_on) || 'ever'}`, 'Check the hours have been entered');
  for (const s of await db.query(`select reg, number from directive_status where kind = 'sb' and status = 'unassessed'`))
    push('coming up', s.reg, `Service bulletin ${s.number} not reviewed`, 'Engineer decides whether to do it');
  out(list, (d) => heading('Needs attention, worst first') + '\n' + table(d, [{ key: 'area', label: 'Area' }, { key: 'reg', label: 'Reg', format: (v) => v || '' }, { key: 'what', label: 'What', format: (v) => truncate(v, 80) }, { key: 'action', label: 'Action' }]));
}

// ---------------------------------------------------------------- import from Veryon

// Veryon Tracking's due list or status report saved as a spreadsheet: one row per tracked item,
// with the aircraft, the item, its intervals and when it was last done. Column names vary between
// report layouts, so each field accepts the common headings. Rows match on aircraft and item code,
// so running it twice changes nothing.
async function importCmd(args, flags) {
  const source = str(args[0]).toLowerCase();
  if (source !== 'veryon') throw new CliError('mx import veryon <due-list.csv> [--reg=ZK-ABC] [--dry-run]');
  const file = args[1];
  if (!file) throw new CliError('Which file? mx import veryon <due-list.csv>');
  const rows = parseCsv(readFileSync(path.resolve(file), 'utf8'));
  const fallback = flags.reg ? await findAircraft(flags.reg) : null;
  const problems = [];
  const summary = { rows: rows.length, items: 0, directives: 0, created: 0, updated: 0, unchanged: 0, problems };
  const parsed = [];
  for (const [i, r] of rows.entries()) {
    const reg = pick(r, 'Registration', 'Aircraft', 'Tail Number', 'Tail', 'Reg') || fallback?.reg;
    const code = pick(r, 'Item Number', 'Item', 'Task Number', 'Task', 'ATA Code', 'Reference', 'Code');
    if (!reg || !code) { problems.push(`row ${i + 2}: no aircraft or no item code`); continue; }
    const type = pick(r, 'Item Type', 'Type', 'Category');
    const isAd = /\bad\b|directive/i.test(type) || /^(dca|ad|easa|faa|casa)\b/i.test(code);
    const months = pick(r, 'Interval Months', 'Months Interval', 'Months');
    const daysCol = pick(r, 'Interval Days', 'Days Interval', 'Days');
    parsed.push({
      line: i + 2, reg, code: code.trim(), title: pick(r, 'Description', 'Item Description', 'Task Description', 'Title') || code, isAd,
      kind: isAd ? 'directive' : /overhaul|tbo/i.test(type) ? 'overhaul' : /component|part|llp/i.test(type) ? 'component' : /review|ara/i.test(type) ? 'review' : 'inspection',
      ih: parseNum(pick(r, 'Interval Hours', 'Hours Interval', 'Hours', 'Interval (Hrs)'), 'hours'),
      ic: parseNum(pick(r, 'Interval Cycles', 'Cycles Interval', 'Landings Interval', 'Cycles'), 'cycles', { int: true }),
      id: daysCol ? parseNum(daysCol, 'days', { int: true }) : months ? Math.round(parseNum(months, 'months') * 365 / 12) : null,
      doneOn: parseDate(pick(r, 'Last Done Date', 'Last Complied Date', 'Last Done', 'Complied Date')),
      doneHours: parseNum(pick(r, 'Last Done Hours', 'Last Complied Hours', 'Last Done TT', 'Last Done Airframe Hours'), 'hours'),
      doneCycles: parseNum(pick(r, 'Last Done Cycles', 'Last Complied Cycles', 'Last Done Landings'), 'cycles', { int: true }),
      ref: pick(r, 'Reference', 'Manual Reference', 'Document') || null,
    });
  }
  summary.items = parsed.length;
  summary.directives = parsed.filter((p) => p.isAd).length;
  if (!flags['dry-run']) {
    await db.exec('BEGIN');
    try {
      for (const p of parsed) {
        const a = await findAircraft(p.reg).catch(() => null);
        if (!a) { problems.push(`row ${p.line}: aircraft ${p.reg} not in the system (add it first)`); continue; }
        if (p.ih === null && p.ic === null && p.id === null && !p.isAd) { problems.push(`row ${p.line}: ${p.code} has no interval`); continue; }
        let directiveId = null;
        if (p.isAd) {
          const [d] = await db.query(`insert into directives (number, authority, title, applies_to_type, effective_on, recurring) values ($1,'imported',$2,$3,coalesce($4, current_date),$5)
            on conflict (number) do update set title = directives.title returning id`, [p.code, p.title, a.type, p.doneOn, p.ih !== null || p.id !== null]);
          directiveId = d.id;
          await db.query(`insert into directive_assessments (directive_id, aircraft_id, status, assessed_on, complied_on, complied_hours, notes) values ($1,$2,$3,coalesce($4, current_date),$4,$5,'Imported from Veryon')
            on conflict (directive_id, aircraft_id) do nothing`, [d.id, a.id, p.ih !== null || p.id !== null ? 'recurring' : 'complied', p.doneOn, p.doneHours]);
          if (p.ih === null && p.ic === null && p.id === null) { summary.created++; continue; }
        }
        const [old] = await db.query(`select * from maintenance_items where aircraft_id = $1 and code = $2`, [a.id, p.code]);
        if (old && n(old.interval_hours) === n(p.ih) && n(old.interval_days) === n(p.id) && isoDate(old.last_done_on) === (p.doneOn || '') && n(old.last_done_hours) === n(p.doneHours)) { summary.unchanged++; continue; }
        await db.query(`insert into maintenance_items (aircraft_id, code, title, kind, directive_id, interval_hours, interval_cycles, interval_days, last_done_on, last_done_hours, last_done_cycles, reference, external_ref)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'veryon') on conflict (aircraft_id, code) do update set title = excluded.title, interval_hours = excluded.interval_hours,
          interval_cycles = excluded.interval_cycles, interval_days = excluded.interval_days, last_done_on = excluded.last_done_on, last_done_hours = excluded.last_done_hours, last_done_cycles = excluded.last_done_cycles`,
          [a.id, p.code, p.title, p.kind, directiveId, p.ih, p.ic, p.id, p.doneOn, p.doneHours, p.doneCycles, p.ref]);
        if (old) summary.updated++; else summary.created++;
      }
      await db.exec('COMMIT');
    } catch (e) { await db.exec('ROLLBACK'); throw e; }
  }
  out(summary, (s) => [`  ${flags['dry-run'] ? 'Dry run: would import' : 'Imported'} ${s.items} items (${s.directives} directives) from ${s.rows} rows.${flags['dry-run'] ? '' : ` ${s.created} new, ${s.updated} updated, ${s.unchanged} unchanged.`}`,
    problems.length ? '  Not imported:\n' + problems.map((x) => `    - ${x}`).join('\n') : '',
    flags['dry-run'] ? '' : '  Check the due list against your last Veryon due list before you rely on it: mx due --all'].filter(Boolean).join('\n'));
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(';') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCmd(flags) {
  const dir = path.resolve(REPO_ROOT, str(flags.out) || 'exports');
  mkdirSync(dir, { recursive: true });
  const tables = ['aircraft', 'engineers', 'flights', 'components', 'directives', 'maintenance_items', 'directive_assessments', 'work_orders', 'defects', 'work_order_tasks', 'notes'];
  const counts = {};
  for (const t of tables) {
    const rows = await db.query(`select * from ${t} order by created_at`);
    const cols = rows.length ? Object.keys(rows[0]) : [];
    writeFileSync(path.join(dir, `${t}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
    counts[t] = rows.length;
  }
  out({ dir, counts }, () => `  Exported ${tables.length} tables to ${path.relative(REPO_ROOT, dir) || dir}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

async function log(args, flags) {
  const a = await findAircraft(args[0]);
  const body = args.slice(1).join(' ').trim();
  if (!body) throw new CliError('What happened? mx log <reg> "note text"');
  await db.query(`insert into notes (aircraft_id, body, author) values ($1,$2,$3)`, [a.id, body, str(flags.by) || null]);
  out({ reg: a.reg, body }, () => `  Noted on ${a.reg}.`);
}

// ---------------------------------------------------------------- dispatch table

const HELP = `mx: the aircraft maintenance CLI. Add --json to any read for machine output.

  Overview      stats | fleet | status [reg] | attention | compliance | utilisation [--days=30]
  Aircraft      aircraft <reg> | aircraft-status <reg> <active|maintenance|stored|sold> | log <reg> "note" [--by=name]
  Tech log      fly <reg> --hours=1.4 [--cycles=3] [--date] [--pilot] [--sector] | flights [--reg] [--days=7]
  Programme     due [--reg] [--hours=50] [--days=60] [--all] | forecast [--days=90] | work-pack <reg> [--hours=30] [--days=40]
                item-add <reg> <code> --title=".." [--kind=${ITEM_KINDS.join('|')}] [--hours] [--cycles] [--days|--months] [--done-on] [--done-hours]
  Components    components [--reg] [--llp] [--all] | install <serial> <reg> [--position] [--release=".."] [--part --desc for a new part] | remove <serial> --reason=".."
                release-doc <serial> "CAA Form One 12345"
  Directives    directives [--reg] [--open] [--sb] | directive-new <number> --title --type [--effective] [--within-hours] [--by] [--recurring] [--sb]
                assess <directive> <reg> <${ASSESS.join('|')}> --by=E01 [--notes] [--hours=50 --days=365 for recurring]
  Defects       defects [--reg] [--all] | defect <reg> "description" [--by] | defer <defect> --ref="MEL 30-1" --days=10|--until=date [--by=E01]
  Work orders   work-orders [--open] | work-order <wo> | wo-new <reg> "title" [--items=100HR,ARA] [--defects=D-0029] [--task=".."]
                done <wo> <line> --by=E01 [--date] | certify <wo> --by=E01 --crs="CRS 0414" [--date]
  People        engineers
  Data          import veryon <due-list.csv> [--reg] [--dry-run] | export [--out=dir]`;

const COMMANDS = {
  stats: () => stats(), fleet: () => fleet(), status: (a) => status(a), aircraft: (a) => aircraftCard(a), 'aircraft-status': (a) => aircraftStatus(a), 'release-doc': (a) => releaseDoc(a), log: (a, f) => log(a, f),
  fly: (a, f) => fly(a, f), flights: (a, f) => flights(f), utilisation: (a, f) => utilisation(f),
  due: (a, f) => due(f), forecast: (a, f) => forecast(f), 'work-pack': (a, f) => workPack(a, f), 'item-add': (a, f) => itemAdd(a, f),
  components: (a, f) => components(f), install: (a, f) => install(a, f), remove: (a, f) => remove(a, f),
  directives: (a, f) => directives(f), 'directive-new': (a, f) => directiveNew(a, f), assess: (a, f) => assess(a, f),
  defects: (a, f) => defects(f), defect: (a, f) => defect(a, f), defer: (a, f) => defer(a, f),
  'work-orders': (a, f) => workOrders(f), 'work-order': (a) => workOrder(a), 'wo-new': (a, f) => woNew(a, f), done: (a, f) => taskDone(a, f), certify: (a, f) => certify(a, f),
  engineers: () => engineers(), attention: () => attention(), compliance: () => compliance(), import: (a, f) => importCmd(a, f), export: (a, f) => exportCmd(f),
};

const { args, flags } = parseArgv(process.argv.slice(2));
JSON_OUT = !!flags.json;
const cmd = args.shift();
if (!cmd || cmd === 'help' || flags.help || !COMMANDS[cmd]) {
  console.log(HELP);
  process.exit(cmd && cmd !== 'help' && !COMMANDS[cmd] ? 1 : 0);
}
db = await getDb();
try {
  await COMMANDS[cmd](args, flags);
} catch (e) {
  if (e instanceof CliError) { console.error(e.message); process.exitCode = e.code; }
  else { console.error(e.stack || e.message); process.exitCode = 2; }
} finally {
  await db.close();
}
