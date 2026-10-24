#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database: migrate, seed, then every command
// that matters, asserting on the JSON. Passes on Windows and Linux. No network, no Postgres install.
// TEST_DATABASE_URL runs the same test against a real Postgres (CI does this).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'mx-smoke-'));
const exportDir = path.join(dataDir, 'export');
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) env.DATABASE_URL = process.env.TEST_DATABASE_URL;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try { return JSON.parse(res.stdout); } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}
function assert(cond, msg) { if (!cond) { console.error(`\nFAIL assertion: ${msg}`); process.exit(1); } }
const n = (v) => Number(v ?? 0);
const M = (...a) => ['mx.mjs', ...a];
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const counts = (rows) => Object.fromEntries(rows.map((x) => [x.id, x.count]));
const statusOf = (reg) => run(`status ${reg}`, M('status', reg))[0];

console.log(`smoke: ${env.DATABASE_URL ? 'Postgres' : 'embedded database in ' + dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the overview
  const stats = run('stats', M('stats'));
  assert(stats.aircraft === 5 && stats.serviceable === 1, `five aircraft, one serviceable (${stats.aircraft}, ${stats.serviceable})`);
  assert(stats.overdue_items === 2 && stats.ads_unassessed === 1 && stats.open_defects === 2 && stats.deferred_defects === 2, `overview counts ${JSON.stringify(stats)}`);
  const fleet = run('fleet', M('fleet'));
  assert(fleet.find((a) => a.reg === 'ZK-SLR').serviceable && !fleet.find((a) => a.reg === 'ZK-SLB').serviceable, 'only the R44 is serviceable');
  const card = run('aircraft by short reg', M('aircraft', 'slr'));
  assert(card.aircraft.reg === 'ZK-SLR' && card.components.length === 2, 'fuzzy registration lookup');
  run('ambiguous aircraft lists and exits 1', M('aircraft', 'AS350'), { json: false, expectFail: true });

  // ---- what stops each aircraft
  const slb = statusOf('ZK-SLB');
  assert(slb.stop.some((s) => /100HR/.test(s)) && slb.stop.some((s) => /TR-4471/.test(s)), `SLB grounded by the 100 hour and the tail rotor blade (${slb.stop})`);
  const sla = statusOf('SLA');
  assert(sla.stop.length === 3, `SLA: AD window, open defect, unreleased work (${sla.stop})`);

  // ---- the programme
  const due = run('due', M('due'));
  assert(due[0].overdue && due.filter((x) => x.overdue).length === 2, 'overdue items lead the due list');
  assert(n(due.find((x) => x.reg === 'ZK-SLB' && x.code === '100HR').left_hours) === -3.4, 'SLB 100 hour 3.4 h over');
  assert(run('due --all', M('due', '--all')).length === 20, 'every programme item with --all');
  const fc = run('forecast', M('forecast', '--days=90'));
  assert(fc.items.length >= 8 && fc.components.some((c) => c.serial_no === 'TR-4471'), 'forecast has items and the blade');
  const util = run('utilisation', M('utilisation'));
  assert(util[0].reg === 'ZK-SLA' && n(util[0].hours) > 40, 'SLA flies the most');
  const wp = run('work pack', M('work-pack', 'SLA'));
  assert(wp.items.some((i) => i.code === '600HR') && wp.directives.some((d) => d.number === 'DCA/AS350/906'), 'work pack has the 600 hour and the new AD');
  const fl = run('flights', M('flights', '--reg=ZK-SLC', '--days=10'));
  assert(fl.length > 0 && fl.every((f) => f.reg === 'ZK-SLC'), 'tech log by aircraft');

  // ---- compliance and attention
  const c0 = counts(run('compliance', M('compliance')));
  assert(c0.R1 === 1 && c0.R2 === 2 && c0.R3 === 1 && c0.R4 === 1 && c0.R5 === 1 && c0.R6 === 1 && c0.R7 === 1 && c0.R8 === 1 && c0.R9 === 1, `compliance counts ${JSON.stringify(c0)}`);
  const att = run('attention', M('attention'));
  assert(att[0].area === 'airworthiness' && /DCA\/AS350\/906/.test(att[0].what), 'the unassessed AD leads');
  assert(att.some((a) => a.area === 'people' && /Josh Kerr/.test(a.what)), 'licence expiring');
  assert(att.some((a) => /SB R44-118/.test(a.what)), 'service bulletin to review');
  run('components', M('components', '--llp'));
  run('engineers', M('engineers'));
  run('directives', M('directives'));
  run('defects', M('defects'));
  run('work orders', M('work-orders', '--open'));

  // ---- ZK-SLA: assess the AD, release the starter generator work
  run('not-applicable without a reason is refused', M('assess', '906', 'SLA', 'not-applicable', '--by=E02'), { json: false, expectFail: true });
  run('assess the new AD', M('assess', 'DCA/AS350/906', 'ZK-SLA', 'complied', '--by=E02', '--notes=Coupling inspected, no defects'));
  run('release by an expired licence is refused', M('certify', 'WO-0412', '--by=E03', '--crs=CRS 0412'), { json: false, expectFail: true });
  run('release without the type rating is refused', M('certify', 'WO-0412', '--by=E04', '--crs=CRS 0412'), { json: false, expectFail: true });
  run('release without a CRS reference is refused', M('certify', 'WO-0412', '--by=E02'), { json: false, expectFail: true });
  const cert412 = run('release WO-0412', M('certify', '412', '--by=E02', '--crs=CRS 0412'));
  assert(cert412.serviceable, `SLA serviceable after the release (${cert412.still_stopping})`);

  // ---- ZK-SLB: the 100 hour and a new tail rotor blade
  const wo = run('open a work order', M('wo-new', 'SLB', '100 hour and tail rotor blade', '--items=100HR', '--task=Replace tail rotor blade TR-4471'));
  assert(wo.number === 'WO-0415' && wo.tasks === 2, `work order numbering ${wo.number}`);
  run('unknown programme item is refused', M('wo-new', 'SLB', 'x', '--items=NOPE'), { json: false, expectFail: true });
  run('release with tasks not done is refused', M('certify', 'WO-0415', '--by=E01', '--crs=CRS 0415'), { json: false, expectFail: true });
  run('task 1 done', M('done', 'WO-0415', '1', '--by=E01'));
  run('task 2 done', M('done', 'WO-0415', '2', '--by=E01'));
  const rem = run('remove the blade', M('remove', 'TR-4471', '--reason=Life limit reached'));
  assert(rem.tsn === 4002.3, `the blade leaves with its own hours (${rem.tsn})`);
  run('fit a part not on file without details is refused', M('install', 'TR-5001', 'SLB'), { json: false, expectFail: true });
  const ins = run('fit the new blade', M('install', 'TR-5001', 'ZK-SLB', '--part=355A12-0050', '--desc=Tail rotor blade', '--position=TR blade 1', '--limit-hours=4000', '--release=CAA Form One 60001'));
  assert(ins.release_doc === 'CAA Form One 60001', 'release certificate recorded');
  run('fitting a part that is already fitted is refused', M('install', 'TR-4472', 'SLA'), { json: false, expectFail: true });
  const cert415 = run('release WO-0415', M('certify', 'WO-0415', '--by=E01', '--crs=CRS 0415'));
  assert(cert415.serviceable, `SLB serviceable (${cert415.still_stopping})`);
  const slbDue = run('SLB due list', M('due', '--reg=SLB', '--all'));
  assert(n(slbDue.find((x) => x.code === '100HR').left_hours) === 100, '100 hour reset to a full interval');
  const fly = run('fly SLB', M('fly', 'SLB', '--hours=1:30', '--cycles=3', '--pilot=Ruby Chen'));
  assert(fly.hours === 1.5 && fly.was_unserviceable.length === 0, 'hours as h:mm, no warning on a serviceable aircraft');
  run('future flight is refused', M('fly', 'SLB', '--hours=1', `--date=${day(2)}`), { json: false, expectFail: true });
  run('a 20 hour entry is refused', M('fly', 'SLB', '--hours=20'), { json: false, expectFail: true });

  // ---- ZK-SLG: the review of airworthiness needs an inspection authorisation
  run('release with tasks not done is refused (SLG)', M('certify', 'WO-0414', '--by=E01', '--crs=CRS 0414'), { json: false, expectFail: true });
  run('SLG task 2', M('done', 'WO-0414', '2', '--by=E01'));
  run('SLG task 3', M('done', 'WO-0414', '3', '--by=E04'));
  run('review of airworthiness without an IA is refused', M('certify', 'WO-0414', '--by=E04', '--crs=CRS 0414'), { json: false, expectFail: true });
  run('release WO-0414', M('certify', 'WO-0414', '--by=E01', '--crs=CRS 0414'));
  const slg = run('SLG back in service', M('aircraft-status', 'SLG', 'active'));
  assert(!slg.serviceable && slg.stop.length === 1 && /WO-0410/.test(slg.stop[0]), `only the bad release left on SLG (${slg.stop})`);

  // ---- ZK-SLC: the expired deferral and the missing release certificate
  const pitot = run('pitot work order', M('wo-new', 'SLC', 'Pitot heat', '--defects=D-0027'));
  run('pitot task done', M('done', pitot.number, '1', '--by=E04'));
  run('pitot released', M('certify', pitot.number, '--by=E04', '--crs=CRS 0416'));
  run('release certificate found', M('release-doc', 'SG-77310', 'CAA Form One 58830'));
  assert(statusOf('SLC').serviceable, 'SLC serviceable');

  // ---- ZK-SLR: a new defect, deferred under the MEL
  const d = run('raise a defect', M('defect', 'SLR', 'Rotor brake caution light flickering', '--by=Ben Harlow'));
  assert(d.number === 'D-0032', 'defect numbering');
  assert(!statusOf('SLR').serviceable, 'an open defect grounds the aircraft');
  run('defer without a reference is refused', M('defer', 'D-0032', '--days=10'), { json: false, expectFail: true });
  run('defer', M('defer', '32', '--ref=MEL 33-1 (10 days)', '--days=10', '--by=E01'));
  assert(statusOf('SLR').serviceable, 'a deferred defect inside its limit does not');

  // ---- a new directive
  const nd = run('new directive', M('directive-new', 'DCA/R44/913', '--title=Tail rotor gearbox output seal: inspect every 100 hours', '--type=R44', '--within-hours=25', '--recurring'));
  assert(nd.applies_to.join() === 'ZK-SLR', 'applies to the R44');
  run('duplicate directive is refused', M('directive-new', 'DCA/R44/913', '--title=x', '--type=R44'), { json: false, expectFail: true });
  run('recurring without an interval is refused', M('assess', 'DCA/R44/913', 'SLR', 'recurring', '--by=E01'), { json: false, expectFail: true });
  run('assess recurring', M('assess', 'DCA/R44/913', 'SLR', 'recurring', '--by=E01', '--hours=100'));
  assert(run('the AD is on the due list', M('due', '--reg=SLR', '--all')).some((x) => x.code === 'DCA/R44/913'), 'recurring AD tracked');
  run('add a programme item', M('item-add', 'SLC', 'ELT-BATT', '--title=ELT battery replacement', '--kind=component', '--months=24', `--done-on=${day(-700)}`));
  assert(run('ELT battery due', M('due', '--reg=SLC')).some((x) => x.code === 'ELT-BATT'), 'item inside 60 days');

  const c1 = counts(run('compliance after the fixes', M('compliance')));
  assert(c1.R1 === 0 && c1.R2 === 0 && c1.R3 === 0 && c1.R4 === 0 && c1.R6 === 0 && c1.R7 === 0 && c1.R8 === 0 && c1.R9 === 0 && c1.R5 === 1, `only the bad release is left ${JSON.stringify(c1)}`);

  // ---- import from Veryon
  const csv = path.join(dataDir, 'veryon-due-list.csv');
  const dmy = (s) => s.split('-').reverse().join('/');
  writeFileSync(csv, [
    'Registration,Item Number,Description,Item Type,Interval Hours,Interval Months,Last Done Date,Last Done Hours',
    `ZK-SLA,100HR,100 hour inspection,Inspection,100,,${dmy(day(-12))},8420.5`,
    `ZK-SLA,05-50-00 HOOK,"Cargo hook inspection, release unit",Inspection,,12,${dmy(day(-90))},8300`,
    `ZK-SLA,DCA/AS350/880,Main gearbox chip detector,AD,100,,${dmy(day(-20))},8401.0`,
    `ZK-XYZ,100HR,100 hour inspection,Inspection,100,,${dmy(day(-12))},500`,
    `ZK-SLC,ELT-REG,ELT registration check,Inspection,,,,`,
  ].join('\r\n'));
  const dry = run('import dry run', M('import', 'veryon', csv, '--dry-run'));
  assert(dry.items === 5 && dry.directives === 1 && dry.created === 0, `dry run counts and writes nothing ${JSON.stringify(dry)}`);
  const imp = run('import', M('import', 'veryon', csv));
  assert(imp.created === 2 && imp.updated === 1 && imp.problems.length === 2, `two new, one updated, two problems ${JSON.stringify(imp)}`);
  const imp2 = run('import again (idempotent)', M('import', 'veryon', csv));
  assert(imp2.created === 0 && imp2.updated === 0 && imp2.unchanged === 3, `import twice is harmless ${JSON.stringify(imp2)}`);
  const slaAll = run('imported items', M('due', '--reg=SLA', '--all'));
  assert(n(slaAll.find((x) => x.code === '05-50-00 HOOK').interval_days) === 365 && n(slaAll.find((x) => x.code === '100HR').last_done_hours) === 8420.5, 'months to days, last done carried');
  assert(run('imported AD on the register', M('directives', '--reg=SLA')).some((x) => x.number === 'DCA/AS350/880' && x.status === 'recurring'), 'imported AD assessed as recurring');
  run('unknown import source exits 1', M('import', 'camp', csv), { json: false, expectFail: true });

  // ---- export, views, docs
  const exp = run('export', M('export', `--out=${exportDir}`));
  assert(exp.counts.flights >= 149 && existsSync(path.join(exportDir, 'maintenance_items.csv')), 'export writes every table');
  run('views', ['view.mjs'], { json: false });
  run('documents', ['docs.mjs'], { json: false });
  assert(readdirSync(path.join(root, 'docs-out', 'work-order')).some((f) => f.startsWith('wo-0415')), 'the new work order renders');
  assert(readdirSync(path.join(root, 'docs-out', 'maintenance-status')).some((f) => f.startsWith('zk-slr')), 'the owner report renders');

  // ---- the log
  run('log a note', M('log', 'SLR', 'Owner wants the overhaul quote before Christmas', '--by=Office'));
  run('help', ['mx.mjs', 'help'], { json: false });
  run('unknown command exits 1', ['mx.mjs', 'nonsense'], { json: false, expectFail: true });

  console.log(`\nPASS: ${step} steps`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
